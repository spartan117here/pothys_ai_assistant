"""
Business Query Executor for the Pothys AGM AI Executive Assistant.

This module handles ALL business data queries by:
  1. Mapping intents to ORM-based PostgreSQL queries
  2. Returning structured Python dicts (not formatted strings)
  3. Formatting the final response via LLM (with deterministic fallback)

Business data NEVER touches the RAG pipeline.
"""

import re
import json
import logging
from typing import Optional, Any, List
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.report import DailyReport
from app.models.employee import Employee
from app.models.employee_performance import EmployeePerformance
from app.models.meeting import Meeting
from app.models.task import Task
from app.models.user import User
from app.services.intent_classifier import (
    BusinessIntent, extract_branch_name, extract_date_context
)
from app.core.config import settings

logger = logging.getLogger(__name__)


def _short_name(full_name: str) -> str:
    """Strip 'Swarna Mahal' from branch names for display."""
    return full_name.replace("Swarna Mahal", "").strip()


def _fmt_currency(val: Any) -> str:
    """Format a numeric value as Indian Rupee currency."""
    if val is None:
        return "₹0"
    try:
        v = float(val)
        if v < 100000:
            return f"₹{v:,.0f}"
        elif v < 10000000:
            return f"₹{v/100000:.2f}L"
        else:
            return f"₹{v/10000000:.2f}Cr"
    except (ValueError, TypeError):
        return f"₹{val}"


# ─────────────────────────────────────────────
# Query Functions — each returns structured data
# ─────────────────────────────────────────────

async def _query_report_status(db: AsyncSession, query_date: date) -> dict:
    """Fetch submitted vs pending report status for all branches."""
    branches_res = await db.execute(select(Branch))
    all_branches = branches_res.scalars().all()

    reports_res = await db.execute(
        select(DailyReport).where(DailyReport.date == query_date)
    )
    reports = reports_res.scalars().all()
    report_map = {r.branch_id: r for r in reports}

    submitted = []
    pending = []
    for b in all_branches:
        name = _short_name(b.name)
        if b.id in report_map:
            r = report_map[b.id]
            time_str = (
                r.uploaded_at.strftime("%I:%M %p") if r.uploaded_at else
                r.created_at.strftime("%I:%M %p") if r.created_at else "N/A"
            )
            submitted.append({
                "branch": name,
                "revenue": float(r.total_revenue or r.sales_amount or 0),
                "status": r.status or "SUBMITTED",
                "time": time_str
            })
        else:
            pending.append(name)

    return {
        "query_type": "REPORT_STATUS",
        "date": str(query_date),
        "total_branches": len(all_branches),
        "submitted_count": len(submitted),
        "pending_count": len(pending),
        "submitted": submitted,
        "pending": pending,
    }


async def _find_branch_by_name(db: AsyncSession, search_str: str) -> Optional[Branch]:
    """Find branch using robust case, dot, space, and substring matching."""
    if not search_str:
        return None
    branches_res = await db.execute(select(Branch))
    all_branches = branches_res.scalars().all()
    clean_search = re.sub(r'[^\w]', '', search_str.lower())

    for b in all_branches:
        clean_name = re.sub(r'[^\w]', '', b.name.lower())
        clean_code = re.sub(r'[^\w]', '', (b.code or "").lower())
        if clean_search == clean_name or clean_search in clean_name or clean_name in clean_search or clean_search == clean_code:
            return b

    return None


async def _query_branch_report(db: AsyncSession, branch_name: str, query_date: date) -> dict:
    """Fetch the full daily report for a specific branch."""
    branch = await _find_branch_by_name(db, branch_name)
    if not branch:
        return {"query_type": "BRANCH_REPORT", "error": f"Branch '{branch_name}' not found."}

    report_res = await db.execute(
        select(DailyReport).where(
            and_(DailyReport.branch_id == branch.id, DailyReport.date == query_date)
        )
    )
    report = report_res.scalars().first()
    if not report:
        return {
            "query_type": "BRANCH_REPORT",
            "branch": _short_name(branch.name),
            "date": str(query_date),
            "status": "NOT_SUBMITTED",
            "message": f"No report has been submitted for {_short_name(branch.name)} on {query_date}."
        }

    return {
        "query_type": "BRANCH_REPORT",
        "branch": _short_name(branch.name),
        "date": str(query_date),
        "status": report.status or "SUBMITTED",
        "total_revenue": float(report.total_revenue or report.sales_amount or 0),
        "gold_sales": float(report.gold_sales or 0),
        "silver_sales": float(report.silver_sales or 0),
        "platinum_sales": float(report.platinum_sales or 0),
        "diamond_sales": float(report.diamond_sales or 0),
        "digigold_enrollments": report.digigold_enrollments or 0,
        "digisilver_enrollments": report.digisilver_enrollments or 0,
        "employees_present": report.employees_present or report.attendance_count or 0,
        "employees_absent": report.employees_absent or 0,
        "customer_complaints": report.customer_complaints or "None",
        "operational_issues": report.operational_issues or report.issues or "None",
        "manager_remarks": report.remarks or "None",
    }


async def _query_pending_reports(db: AsyncSession, query_date: date) -> dict:
    """Fetch branches that have NOT submitted today's report."""
    branches_res = await db.execute(select(Branch))
    all_branches = branches_res.scalars().all()

    reports_res = await db.execute(
        select(DailyReport).where(DailyReport.date == query_date)
    )
    submitted_ids = {r.branch_id for r in reports_res.scalars().all()}

    pending = [_short_name(b.name) for b in all_branches if b.id not in submitted_ids]
    submitted = [_short_name(b.name) for b in all_branches if b.id in submitted_ids]

    return {
        "query_type": "PENDING_REPORTS",
        "date": str(query_date),
        "total_branches": len(all_branches),
        "pending_count": len(pending),
        "submitted_count": len(submitted),
        "pending": pending,
        "submitted": submitted,
    }


async def _query_submitted_reports(db: AsyncSession, query_date: date) -> dict:
    """Fetch branches that HAVE submitted today's report."""
    branches_res = await db.execute(select(Branch))
    all_branches = branches_res.scalars().all()
    branch_map = {b.id: b for b in all_branches}

    reports_res = await db.execute(
        select(DailyReport).where(DailyReport.date == query_date)
    )
    submitted_reports = reports_res.scalars().all()

    submitted = []
    for r in submitted_reports:
        b = branch_map.get(r.branch_id)
        if b:
            time_str = (
                r.uploaded_at.strftime("%I:%M %p") if r.uploaded_at else
                r.created_at.strftime("%I:%M %p") if r.created_at else "N/A"
            )
            submitted.append({
                "branch": _short_name(b.name),
                "revenue": float(r.total_revenue or r.sales_amount or 0),
                "time": time_str
            })

    return {
        "query_type": "SUBMITTED_REPORTS",
        "date": str(query_date),
        "submitted_count": len(submitted),
        "submitted": submitted,
    }


async def _query_top_branch(db: AsyncSession, query_date: date) -> dict:
    """Fetch the branch with the highest revenue today along with full branch rankings."""
    branches_res = await db.execute(select(Branch))
    branch_map = {b.id: b for b in branches_res.scalars().all()}

    reports_res = await db.execute(
        select(DailyReport).where(DailyReport.date == query_date)
    )
    reports = reports_res.scalars().all()
    if not reports:
        return {
            "query_type": "TOP_BRANCH",
            "date": str(query_date),
            "message": "No reports submitted yet. Revenue data is unavailable."
        }

    top = max(reports, key=lambda r: float(r.total_revenue or r.sales_amount or 0))
    branch = branch_map.get(top.branch_id)

    rankings = []
    for r in sorted(reports, key=lambda x: float(x.total_revenue or x.sales_amount or 0), reverse=True):
        b = branch_map.get(r.branch_id)
        if b:
            rankings.append({
                "branch": _short_name(b.name),
                "revenue": float(r.total_revenue or r.sales_amount or 0)
            })

    return {
        "query_type": "TOP_BRANCH",
        "date": str(query_date),
        "branch": _short_name(branch.name) if branch else "Unknown",
        "total_revenue": float(top.total_revenue or top.sales_amount or 0),
        "gold_sales": float(top.gold_sales or 0),
        "silver_sales": float(top.silver_sales or 0),
        "platinum_sales": float(top.platinum_sales or 0),
        "diamond_sales": float(top.diamond_sales or 0),
        "rankings": rankings,
    }


async def _query_top_performer(db: AsyncSession, query_date: date, branch_name: Optional[str] = None) -> dict:
    """Fetch the highest performing employee today across branches."""
    stmt = (
        select(EmployeePerformance, Employee, Branch)
        .join(Employee, EmployeePerformance.employee_id == Employee.id)
        .join(DailyReport, EmployeePerformance.report_id == DailyReport.id)
        .join(Branch, Employee.branch_id == Branch.id)
        .where(DailyReport.date == query_date)
    )

    if branch_name:
        stmt = stmt.where(Branch.name.ilike(f"%{branch_name}%"))

    stmt = stmt.order_by(
        (EmployeePerformance.gold_amount + EmployeePerformance.silver_amount +
         EmployeePerformance.platinum_amount + EmployeePerformance.diamond_amount).desc()
    )

    res = await db.execute(stmt)
    rows = res.all()

    if not rows:
        return {
            "query_type": "TOP_PERFORMER",
            "date": str(query_date),
            "message": "No employee performance data available for today."
        }

    perf, emp, branch = rows[0]
    total = float(perf.gold_amount + perf.silver_amount + perf.platinum_amount + perf.diamond_amount)

    all_performers = []
    for p, e, b in rows:
        tot = float(p.gold_amount + p.silver_amount + p.platinum_amount + p.diamond_amount)
        all_performers.append({
            "employee_name": e.name,
            "branch": _short_name(b.name),
            "designation": e.designation,
            "total_sales": tot,
        })

    return {
        "query_type": "TOP_PERFORMER",
        "date": str(query_date),
        "employee_name": emp.name,
        "branch": _short_name(branch.name),
        "designation": emp.designation,
        "total_sales": total,
        "gold_amount": float(perf.gold_amount),
        "silver_amount": float(perf.silver_amount),
        "platinum_amount": float(perf.platinum_amount),
        "diamond_amount": float(perf.diamond_amount),
        "digigold_enrollments": perf.digigold_enrollments or 0,
        "all_performers": all_performers,
    }


async def _query_today_revenue(db: AsyncSession, query_date: date) -> dict:
    """Fetch total revenue and product-line aggregations across all reporting branches."""
    branches_res = await db.execute(select(Branch))
    branch_map = {b.id: b for b in branches_res.scalars().all()}

    reports_res = await db.execute(
        select(DailyReport).where(DailyReport.date == query_date)
    )
    reports = reports_res.scalars().all()
    if not reports:
        return {
            "query_type": "TODAY_REVENUE",
            "date": str(query_date),
            "message": "No reports submitted yet. Revenue data is unavailable."
        }

    total = sum(float(r.total_revenue or r.sales_amount or 0) for r in reports)
    gold = sum(float(r.gold_sales or 0) for r in reports)
    silver = sum(float(r.silver_sales or 0) for r in reports)
    platinum = sum(float(r.platinum_sales or 0) for r in reports)
    diamond = sum(float(r.diamond_sales or 0) for r in reports)

    breakdown = []
    for r in reports:
        b = branch_map.get(r.branch_id)
        breakdown.append({
            "branch": _short_name(b.name) if b else "Unknown",
            "revenue": float(r.total_revenue or r.sales_amount or 0),
            "target_achievement": float(r.target_achievement or 0),
        })

    return {
        "query_type": "TODAY_REVENUE",
        "date": str(query_date),
        "total_revenue": total,
        "gold_sales": gold,
        "silver_sales": silver,
        "platinum_sales": platinum,
        "diamond_sales": diamond,
        "branch_count": len(reports),
        "breakdown": sorted(breakdown, key=lambda x: x["revenue"], reverse=True),
    }


async def _query_attendance(db: AsyncSession, query_date: date) -> dict:
    """Fetch staff attendance and absentees aggregations across all reporting branches."""
    branches_res = await db.execute(select(Branch))
    branch_map = {b.id: b for b in branches_res.scalars().all()}

    reports_res = await db.execute(
        select(DailyReport).where(DailyReport.date == query_date)
    )
    reports = reports_res.scalars().all()
    if not reports:
        return {
            "query_type": "ATTENDANCE",
            "date": str(query_date),
            "message": "No reports submitted yet. Attendance data is unavailable."
        }

    total_present = sum(int(r.employees_present or r.attendance_count or 0) for r in reports)
    total_absent = sum(int(r.employees_absent or 0) for r in reports)
    breakdown = []
    for r in reports:
        b = branch_map.get(r.branch_id)
        breakdown.append({
            "branch": _short_name(b.name) if b else "Unknown",
            "present": int(r.employees_present or r.attendance_count or 0),
            "absent": int(r.employees_absent or 0),
        })

    return {
        "query_type": "ATTENDANCE",
        "date": str(query_date),
        "total_present": total_present,
        "total_absent": total_absent,
        "branch_count": len(reports),
        "breakdown": sorted(breakdown, key=lambda x: x["present"], reverse=True),
    }


async def _query_complaints(db: AsyncSession, query_date: date) -> dict:
    """Fetch customer complaints aggregations from today's reports."""
    branches_res = await db.execute(select(Branch))
    branch_map = {b.id: b for b in branches_res.scalars().all()}

    reports_res = await db.execute(
        select(DailyReport).where(DailyReport.date == query_date)
    )
    reports = reports_res.scalars().all()

    complaints = []
    for r in reports:
        if r.customer_complaints and r.customer_complaints.strip().lower() != "none" and r.customer_complaints.strip():
            b = branch_map.get(r.branch_id)
            complaints.append({
                "branch": _short_name(b.name) if b else "Unknown",
                "complaint": r.customer_complaints.strip(),
            })

    return {
        "query_type": "COMPLAINTS",
        "date": str(query_date),
        "count": len(complaints),
        "complaints": complaints,
    }


async def _query_alerts(db: AsyncSession, query_date: date) -> dict:
    """Fetch operational alerts/issues from today's reports."""
    branches_res = await db.execute(select(Branch))
    branch_map = {b.id: b for b in branches_res.scalars().all()}

    reports_res = await db.execute(
        select(DailyReport).where(DailyReport.date == query_date)
    )
    reports = reports_res.scalars().all()

    alerts = []
    for r in reports:
        issue_text = r.operational_issues or r.issues
        if issue_text and issue_text.strip().lower() != "none" and issue_text.strip():
            b = branch_map.get(r.branch_id)
            alerts.append({
                "branch": _short_name(b.name) if b else "Unknown",
                "issue": issue_text.strip(),
            })

    return {
        "query_type": "ALERTS",
        "date": str(query_date),
        "count": len(alerts),
        "alerts": alerts,
    }


async def _query_remarks(db: AsyncSession, query_date: date) -> dict:
    """Fetch manager remarks from today's reports."""
    branches_res = await db.execute(select(Branch))
    branch_map = {b.id: b for b in branches_res.scalars().all()}

    reports_res = await db.execute(
        select(DailyReport).where(DailyReport.date == query_date)
    )
    reports = reports_res.scalars().all()

    remarks = []
    for r in reports:
        if r.remarks and r.remarks.strip():
            b = branch_map.get(r.branch_id)
            remarks.append({
                "branch": _short_name(b.name) if b else "Unknown",
                "remark": r.remarks.strip(),
            })

    return {
        "query_type": "REMARKS",
        "date": str(query_date),
        "count": len(remarks),
        "remarks": remarks,
    }


async def _query_gold_sales(db: AsyncSession, query_date: date) -> dict:
    """Fetch gold sales breakdown."""
    branches_res = await db.execute(select(Branch))
    branch_map = {b.id: b for b in branches_res.scalars().all()}

    reports_res = await db.execute(
        select(DailyReport).where(DailyReport.date == query_date)
    )
    reports = reports_res.scalars().all()
    if not reports:
        return {"query_type": "GOLD_SALES", "date": str(query_date), "message": "No reports submitted yet."}

    total_gold = sum(float(r.gold_sales or 0) for r in reports)
    top = max(reports, key=lambda r: float(r.gold_sales or 0))
    b = branch_map.get(top.branch_id)

    breakdown = []
    for r in sorted(reports, key=lambda x: float(x.gold_sales or 0), reverse=True):
        br = branch_map.get(r.branch_id)
        if br:
            breakdown.append({
                "branch": _short_name(br.name),
                "gold_sales": float(r.gold_sales or 0)
            })

    return {
        "query_type": "GOLD_SALES",
        "date": str(query_date),
        "total_gold_sales": total_gold,
        "top_branch": _short_name(b.name) if b else "Unknown",
        "top_gold_sales": float(top.gold_sales or 0),
        "breakdown": breakdown,
    }


async def _query_diamond_sales(db: AsyncSession, query_date: date) -> dict:
    """Fetch top diamond sales performer."""
    stmt = (
        select(EmployeePerformance, Employee, Branch)
        .join(Employee, EmployeePerformance.employee_id == Employee.id)
        .join(DailyReport, EmployeePerformance.report_id == DailyReport.id)
        .join(Branch, Employee.branch_id == Branch.id)
        .where(DailyReport.date == query_date)
        .order_by(EmployeePerformance.diamond_amount.desc())
    )
    res = await db.execute(stmt)
    rows = res.all()
    if not rows or float(rows[0][0].diamond_amount or 0) == 0:
        return {"query_type": "DIAMOND_SALES", "date": str(query_date), "message": "No diamond sales recorded."}

    perf, emp, branch = rows[0]
    return {
        "query_type": "DIAMOND_SALES",
        "date": str(query_date),
        "employee": emp.name,
        "branch": _short_name(branch.name),
        "diamond_amount": float(perf.diamond_amount),
    }


async def _query_digigold(db: AsyncSession, query_date: date) -> dict:
    """Fetch DigiGold/DigiSilver enrollment data."""
    stmt = (
        select(EmployeePerformance, Employee, Branch)
        .join(Employee, EmployeePerformance.employee_id == Employee.id)
        .join(DailyReport, EmployeePerformance.report_id == DailyReport.id)
        .join(Branch, Employee.branch_id == Branch.id)
        .where(DailyReport.date == query_date)
        .order_by(EmployeePerformance.digigold_enrollments.desc())
    )
    res = await db.execute(stmt)
    rows = res.all()
    if not rows or (rows[0][0].digigold_enrollments or 0) == 0:
        return {"query_type": "DIGIGOLD", "date": str(query_date), "message": "No DigiGold enrollments recorded."}

    perf, emp, branch = rows[0]
    return {
        "query_type": "DIGIGOLD",
        "date": str(query_date),
        "employee": emp.name,
        "branch": _short_name(branch.name),
        "digigold_enrollments": perf.digigold_enrollments,
        "digisilver_enrollments": perf.digisilver_enrollments or 0,
    }


async def _query_agenda(db: AsyncSession, user_id: Optional[Any] = None, query_date: Optional[date] = None) -> dict:
    """Fetch today's executive agenda summary."""
    if query_date is None:
        query_date = date.today()
    branches_res = await db.execute(select(Branch))
    all_branches = branches_res.scalars().all()

    reports_res = await db.execute(
        select(DailyReport).where(DailyReport.date == query_date)
    )
    reports = reports_res.scalars().all()

    start_of_day = datetime.combine(query_date, datetime.min.time())
    end_of_day = datetime.combine(query_date, datetime.max.time())
    meetings_res = await db.execute(
        select(Meeting).where(and_(Meeting.start_time >= start_of_day, Meeting.start_time <= end_of_day))
    )
    meetings = meetings_res.scalars().all()

    tasks_res = await db.execute(
        select(Task).where(and_(Task.due_date == query_date, Task.status != "COMPLETED"))
    )
    tasks = tasks_res.scalars().all()

    submitted_count = len(reports)
    alerts_count = len([r for r in reports if (r.issues or r.operational_issues) and (r.issues or r.operational_issues).strip()])

    return {
        "query_type": "AGENDA",
        "date": str(query_date),
        "meetings_count": len(meetings),
        "meetings": [{"title": m.title, "time": m.start_time.strftime("%I:%M %p"), "status": m.status} for m in meetings],
        "tasks_count": len(tasks),
        "tasks": [{"title": t.title, "priority": t.priority, "status": t.status} for t in tasks],
        "submitted_reports": submitted_count,
        "pending_reports": len(all_branches) - submitted_count,
        "alerts_count": alerts_count,
    }


async def _query_meetings(db: AsyncSession, user_id: Optional[Any] = None) -> dict:
    """Fetch all scheduled meetings."""
    meetings_res = await db.execute(select(Meeting).order_by(Meeting.start_time.asc()))
    meetings = meetings_res.scalars().all()

    return {
        "query_type": "MEETINGS",
        "count": len(meetings),
        "meetings": [
            {
                "title": m.title,
                "date": m.start_time.strftime("%d-%b-%Y"),
                "time": m.start_time.strftime("%I:%M %p"),
                "agenda": m.agenda or "No agenda specified",
                "status": m.status,
            }
            for m in meetings
        ],
    }


async def _query_tasks(db: AsyncSession, user_id: Optional[Any] = None) -> dict:
    """Fetch all tasks."""
    tasks_res = await db.execute(select(Task).order_by(Task.due_date.asc()))
    tasks = tasks_res.scalars().all()

    return {
        "query_type": "TASKS",
        "count": len(tasks),
        "tasks": [
            {
                "title": t.title,
                "due_date": t.due_date.strftime("%d-%b-%Y"),
                "priority": t.priority,
                "status": t.status,
                "description": t.description or "None",
            }
            for t in tasks
        ],
    }


async def _query_comparison(db: AsyncSession, query: str, query_date: date) -> dict:
    """Compare performance of two or more branches."""
    branches_res = await db.execute(select(Branch))
    all_branches = branches_res.scalars().all()

    q_lower = query.lower()
    matched = [b for b in all_branches if b.name.split(' ')[0].lower() in q_lower or b.code.lower() in q_lower]
    if len(matched) < 2:
        matched = all_branches

    reports_res = await db.execute(
        select(DailyReport).where(DailyReport.date == query_date)
    )
    reports = reports_res.scalars().all()
    report_map = {r.branch_id: r for r in reports}

    comparison = []
    for b in matched:
        r = report_map.get(b.id)
        entry = {"branch": _short_name(b.name), "status": "NOT_SUBMITTED"}
        if r:
            entry.update({
                "status": "SUBMITTED",
                "total_revenue": float(r.total_revenue or r.sales_amount or 0),
                "gold_sales": float(r.gold_sales or 0),
                "silver_sales": float(r.silver_sales or 0),
                "platinum_sales": float(r.platinum_sales or 0),
                "diamond_sales": float(r.diamond_sales or 0),
                "attendance": int(r.employees_present or r.attendance_count or 0),
                "absent": int(r.employees_absent or 0),
                "target_achievement": float(r.target_achievement or 0),
                "operational_issues": r.operational_issues or r.issues or "None",
                "remarks": r.remarks or "None",
            })
async def _query_branch_metric(db: AsyncSession, branch_name: str, metric: str, query_date: date) -> dict:
    """Fetch ONLY a specific metric for a specific branch."""
    branch = await _find_branch_by_name(db, branch_name)
    if not branch:
        return {
            "query_type": "BRANCH_METRIC",
            "branch": branch_name,
            "metric": metric,
            "date": str(query_date),
            "status": "NOT_FOUND",
            "message": f"Branch '{branch_name}' not found."
        }

    report_res = await db.execute(
        select(DailyReport).where(
            and_(DailyReport.branch_id == branch.id, DailyReport.date == query_date)
        )
    )
    report = report_res.scalars().first()
    b_name = _short_name(branch.name)

    if not report:
        return {
            "query_type": "BRANCH_METRIC",
            "branch": b_name,
            "metric": metric,
            "date": str(query_date),
            "status": "NOT_SUBMITTED",
            "message": f"No report submitted for {b_name} on {query_date}."
        }

    # Extract ONLY requested metric
    metric_data = {}
    if metric == "attendance":
        metric_data = {
            "present": report.employees_present or report.attendance_count or 0,
            "absent": report.employees_absent or 0,
        }
    elif metric == "gold_sales":
        metric_data = {"gold_sales": float(report.gold_sales or 0)}
    elif metric == "silver_sales":
        metric_data = {"silver_sales": float(report.silver_sales or 0)}
    elif metric == "platinum_sales":
        metric_data = {"platinum_sales": float(report.platinum_sales or 0)}
    elif metric == "diamond_sales":
        metric_data = {"diamond_sales": float(report.diamond_sales or 0)}
    elif metric == "total_revenue":
        metric_data = {"total_revenue": float(report.total_revenue or report.sales_amount or 0)}
    elif metric == "complaints":
        metric_data = {"customer_complaints": report.customer_complaints or "None reported"}
    elif metric == "issues":
        metric_data = {"operational_issues": report.issues or report.operational_issues or "None reported"}
    elif metric == "remarks":
        metric_data = {"manager_remarks": report.remarks or report.manager_remarks or "None recorded"}
    elif metric == "digigold":
        metric_data = {
            "digigold_enrollments": report.digigold_enrollments or 0,
            "digisilver_enrollments": report.digisilver_enrollments or 0,
        }
    else:
        metric_data = {
            "value": float(report.total_revenue or report.sales_amount or 0)
        }

    return {
        "query_type": "BRANCH_METRIC",
        "branch": b_name,
        "metric": metric,
        "date": str(query_date),
        "status": report.status or "SUBMITTED",
        "data": metric_data
    }


async def _query_total_metric(db: AsyncSession, metric: str, query_date: date) -> dict:
    """Fetch total aggregate and per-branch breakdown for a specific metric across all reporting branches."""
    reports_res = await db.execute(
        select(DailyReport, Branch)
        .join(Branch, DailyReport.branch_id == Branch.id)
        .where(DailyReport.date == query_date)
    )
    rows = reports_res.all()

    total_val = 0.0
    breakdown = []

    for report, branch in rows:
        b_name = _short_name(branch.name)
        val = 0.0
        if metric == "silver_sales":
            val = float(report.silver_sales or 0)
        elif metric == "gold_sales":
            val = float(report.gold_sales or 0)
        elif metric == "platinum_sales":
            val = float(report.platinum_sales or 0)
        elif metric == "diamond_sales":
            val = float(report.diamond_sales or 0)
        elif metric == "total_revenue":
            val = float(report.total_revenue or report.sales_amount or 0)

        total_val += val
        breakdown.append({"branch": b_name, "value": val})

    breakdown.sort(key=lambda x: x["value"], reverse=True)

    return {
        "query_type": "TOTAL_METRIC",
        "metric": metric,
        "date": str(query_date),
        "total_value": total_val,
        "branch_count": len(rows),
        "breakdown": breakdown
    }


# ─────────────────────────────────────────────
# Intent → Query Dispatcher
# ─────────────────────────────────────────────

INTENT_HANDLERS = {
    BusinessIntent.REPORT_STATUS: lambda db, q, d, b: _query_report_status(db, d),
    BusinessIntent.BRANCH_REPORT: lambda db, q, d, b: _query_branch_report(db, b or "Padi", d),
    BusinessIntent.PENDING_REPORTS: lambda db, q, d, b: _query_pending_reports(db, d),
    BusinessIntent.SUBMITTED_REPORTS: lambda db, q, d, b: _query_submitted_reports(db, d),
    BusinessIntent.TOP_BRANCH: lambda db, q, d, b: _query_top_branch(db, d),
    BusinessIntent.TOP_PERFORMER: lambda db, q, d, b: _query_top_performer(db, d, b),
    BusinessIntent.TODAY_REVENUE: lambda db, q, d, b: _query_today_revenue(db, d),
    BusinessIntent.ATTENDANCE: lambda db, q, d, b: _query_attendance(db, d),
    BusinessIntent.COMPLAINTS: lambda db, q, d, b: _query_complaints(db, d),
    BusinessIntent.ALERTS: lambda db, q, d, b: _query_alerts(db, d),
    BusinessIntent.REMARKS: lambda db, q, d, b: _query_remarks(db, d),
    BusinessIntent.GOLD_SALES: lambda db, q, d, b: _query_gold_sales(db, d),
    BusinessIntent.DIAMOND_SALES: lambda db, q, d, b: _query_diamond_sales(db, d),
    BusinessIntent.DIGIGOLD: lambda db, q, d, b: _query_digigold(db, d),
    BusinessIntent.COMPARISON: lambda db, q, d, b: _query_comparison(db, q, d),
    BusinessIntent.AGENDA: lambda db, q, d, b: _query_agenda(db, d),
    BusinessIntent.MEETINGS: lambda db, q, d, b: _query_meetings(db),
    BusinessIntent.TASKS: lambda db, q, d, b: _query_tasks(db),
}


# ─────────────────────────────────────────────
# Response Formatting
# ─────────────────────────────────────────────

def _format_deterministic(data: dict) -> str:
    """
    Deterministic response formatting fallback.
    Used when OpenAI API key is not configured.
    """
    qt = data.get("query_type", "")

    if "message" in data and not data.get("submitted") and not data.get("pending") and not data.get("breakdown"):
        return data["message"]

    if qt == "REPORT_STATUS":
        lines = [f"### Branch Report Status for {data['date']}:", ""]
        lines.append(f"• **Submitted**: {data['submitted_count']} of {data['total_branches']} branches")
        lines.append(f"• **Pending**: {data['pending_count']} branches")
        if data["submitted"]:
            lines.append("")
            lines.append("**Submitted Branches:**")
            for s in data["submitted"]:
                lines.append(f"• **{s['branch']}** — {_fmt_currency(s['revenue'])} (at {s['time']})")
        if data["pending"]:
            lines.append("")
            lines.append("**Pending Branches:**")
            for p in data["pending"]:
                lines.append(f"• {p}")
        return "\n".join(lines)

    elif qt == "BRANCH_REPORT":
        if data.get("status") == "NOT_SUBMITTED":
            return data.get("message", f"No report submitted for {data.get('branch')}.")
        d = data
        return (
            f"Here is the daily executive summary report for **{d['branch']} Swarna Mahal** on **{d['date']}**:\n\n"
            f"- **Revenue**: {_fmt_currency(d['total_revenue'])}\n"
            f"- **Gold**: {_fmt_currency(d['gold_sales'])}\n"
            f"- **Silver**: {_fmt_currency(d['silver_sales'])}\n"
            f"- **Platinum**: {_fmt_currency(d['platinum_sales'])}\n"
            f"- **Diamond**: {_fmt_currency(d['diamond_sales'])}\n"
            f"- **DigiGold**: {d['digigold_enrollments']} enrollments\n"
            f"- **DigiSilver**: {d['digisilver_enrollments']} enrollments\n"
            f"- **Attendance**: {d['employees_present']} present, {d['employees_absent']} absent\n"
            f"- **Complaints**: {d['customer_complaints']}\n"
            f"- **Operational Issues**: {d['operational_issues']}\n"
            f"- **Manager Remarks**: {d['manager_remarks']}"
        )

    elif qt == "BRANCH_METRIC":
        if data.get("status") in ("NOT_SUBMITTED", "NOT_FOUND"):
            return data.get("message", f"No report submitted for {data.get('branch')}.")
        
        b = data["branch"]
        m = data["metric"]
        d = data.get("data", {})

        if m == "attendance":
            return (
                f"### {b} Staff Attendance ({data['date']}):\n\n"
                f"• **Present**: {d.get('present', 0)} employees\n"
                f"• **Absent**: {d.get('absent', 0)} employees"
            )
        elif m == "gold_sales":
            return (
                f"### {b} Gold Sales ({data['date']}):\n\n"
                f"• **Gold Sales**: {_fmt_currency(d.get('gold_sales', 0))}"
            )
        elif m == "silver_sales":
            return (
                f"### {b} Silver Sales ({data['date']}):\n\n"
                f"• **Silver Sales**: {_fmt_currency(d.get('silver_sales', 0))}"
            )
        elif m == "platinum_sales":
            return (
                f"### {b} Platinum Sales ({data['date']}):\n\n"
                f"• **Platinum Sales**: {_fmt_currency(d.get('platinum_sales', 0))}"
            )
        elif m == "diamond_sales":
            return (
                f"### {b} Diamond Sales ({data['date']}):\n\n"
                f"• **Diamond Sales**: {_fmt_currency(d.get('diamond_sales', 0))}"
            )
        elif m == "total_revenue":
            return (
                f"### {b} Total Revenue ({data['date']}):\n\n"
                f"• **Total Revenue**: {_fmt_currency(d.get('total_revenue', 0))}"
            )
        elif m == "complaints":
            return (
                f"### {b} Customer Complaints ({data['date']}):\n\n"
                f"• **Complaints**: \"{d.get('customer_complaints', 'None reported')}\""
            )
        elif m == "issues":
            return (
                f"### {b} Operational Issues ({data['date']}):\n\n"
                f"• **Issues**: {d.get('operational_issues', 'None reported')}"
            )
        elif m == "remarks":
            return (
                f"### {b} Manager Remarks ({data['date']}):\n\n"
                f"• **Remarks**: \"{d.get('manager_remarks', 'None recorded')}\""
            )
        elif m == "digigold":
            return (
                f"### {b} Digital Scheme Enrollments ({data['date']}):\n\n"
                f"• **DigiGold**: {d.get('digigold_enrollments', 0)} enrollments\n"
                f"• **DigiSilver**: {d.get('digisilver_enrollments', 0)} enrollments"
            )
        else:
            return f"### {b} {m.title()} ({data['date']}):\n\n{json.dumps(d)}"

    elif qt == "TOTAL_METRIC":
        m_title = data["metric"].replace("_", " ").title()
        lines = [
            f"### Total {m_title} Summary for {data['date']}:\n",
            f"• **Total {m_title}**: {_fmt_currency(data['total_value'])}",
            f"• **Reporting Branches**: {data['branch_count']}",
        ]
        if data.get("breakdown"):
            lines.append(f"\n**Branch {m_title} Breakdown:**")
            for b in data["breakdown"]:
                lines.append(f"• **{b['branch']}**: {_fmt_currency(b['value'])}")
        return "\n".join(lines)

    elif qt == "PENDING_REPORTS":
        if not data["pending"]:
            return f"All {data['total_branches']} Pothys branches have submitted their reports for {data['date']}, Sir."
        branch_list = "\n".join(f"• {name}" for name in data["pending"])
        return f"The following {data['pending_count']} branches have **pending reports** for {data['date']}, Sir:\n\n{branch_list}"

    elif qt == "SUBMITTED_REPORTS":
        if not data["submitted"]:
            return f"No daily reports have been submitted for {data['date']} yet, Sir."
        lines = [f"The following {data['submitted_count']} branches have **successfully submitted** their reports for {data['date']}, Sir:\n"]
        for s in data["submitted"]:
            lines.append(f"• {s['branch']} (at {s['time']})")
        return "\n".join(lines)

    elif qt == "GOLD_SALES":
        lines = [
            f"### Gold Sales Summary for {data['date']}:\n",
            f"• **Total Gold Sales**: {_fmt_currency(data.get('total_gold_sales', 0))}",
            f"• **Top Gold Sales Branch**: **{data.get('top_branch', 'N/A')}** ({_fmt_currency(data.get('top_gold_sales', 0))})",
        ]
        if data.get("breakdown"):
            lines.append("\n**Branch Gold Sales Breakdown:**")
            for b in data["breakdown"]:
                lines.append(f"• **{b['branch']}**: {_fmt_currency(b['gold_sales'])}")
        return "\n".join(lines)

    elif qt == "DIAMOND_SALES":
        if "message" in data and not data.get("employee"):
            return data["message"]
        return (
            f"Top Diamond Sales Performer for **{data['date']}** is **{data['employee']}** at "
            f"**{data['branch']} Swarna Mahal** with a diamond sales volume of **{_fmt_currency(data['diamond_amount'])}**."
        )

    elif qt == "DIGIGOLD":
        if "message" in data and not data.get("employee"):
            return data["message"]
        return (
            f"Top DigiGold Scheme Enroller for **{data['date']}** is **{data['employee']}** at "
            f"**{data['branch']} Swarna Mahal** with **{data['digigold_enrollments']} DigiGold** and "
            f"**{data['digisilver_enrollments']} DigiSilver** scheme enrollments."
        )

    elif qt == "TOP_BRANCH":
        lines = [
            f"**{data['branch']}** is the top performing branch today with a total revenue of "
            f"**{_fmt_currency(data['total_revenue'])}**.\n\n"
            f"**Sales Breakdown:**\n"
            f"- **Gold**: {_fmt_currency(data.get('gold_sales'))}\n"
            f"- **Silver**: {_fmt_currency(data.get('silver_sales'))}\n"
            f"- **Platinum**: {_fmt_currency(data.get('platinum_sales'))}\n"
            f"- **Diamond**: {_fmt_currency(data.get('diamond_sales'))}"
        ]
        if data.get("rankings"):
            lines.append("\n**All Reporting Branches Revenue Ranking:**")
            for r in data["rankings"]:
                lines.append(f"• **{r['branch']}**: {_fmt_currency(r['revenue'])}")
        return "\n".join(lines)

    elif qt == "TOP_PERFORMER":
        lines = [
            f"The best performing employee today is **{data['employee_name']}** "
            f"({data.get('designation', 'Executive')}) at **{data['branch']} Swarna Mahal** "
            f"with a total sales volume of **{_fmt_currency(data['total_sales'])}**.\n\n"
            f"**Sales Breakdown:**\n"
            f"- **Gold**: {_fmt_currency(data['gold_amount'])}\n"
            f"- **Silver**: {_fmt_currency(data['silver_amount'])}\n"
            f"- **Platinum**: {_fmt_currency(data['platinum_amount'])}\n"
            f"- **Diamond**: {_fmt_currency(data['diamond_amount'])}"
        ]
        if data.get("all_performers") and len(data["all_performers"]) > 1:
            lines.append("\n**Executive Performance Leaderboard:**")
            for p in data["all_performers"]:
                lines.append(f"• **{p['employee_name']}** ({p['branch']}): {_fmt_currency(p['total_sales'])}")
        return "\n".join(lines)

    elif qt == "TODAY_REVENUE":
        lines = [
            f"### Revenue Summary for {data['date']}:\n",
            f"• **Total Revenue**: {_fmt_currency(data['total_revenue'])}",
            f"• **Gold Sales**: {_fmt_currency(data.get('gold_sales', 0))}",
            f"• **Silver Sales**: {_fmt_currency(data.get('silver_sales', 0))}",
            f"• **Platinum Sales**: {_fmt_currency(data.get('platinum_sales', 0))}",
            f"• **Diamond Sales**: {_fmt_currency(data.get('diamond_sales', 0))}",
            f"• **Reporting Branches**: {data['branch_count']}",
            "\n**Branch Revenue Breakdown:**"
        ]
        for b in data["breakdown"]:
            lines.append(f"• **{b['branch']}**: {_fmt_currency(b['revenue'])} ({b['target_achievement']:.1f}% target achieved)")
        return "\n".join(lines)

    elif qt == "ATTENDANCE":
        lines = [
            f"### Staff Attendance Summary for {data['date']}:\n",
            f"• **Total Present**: {data['total_present']} employees",
            f"• **Total Absentees**: {data['total_absent']} employees",
            f"• **Reporting Branches**: {data['branch_count']}",
            "\n**Branch Attendance Breakdown:**"
        ]
        for b in data["breakdown"]:
            lines.append(f"• **{b['branch']}**: {b['present']} present, {b['absent']} absent")
        return "\n".join(lines)

    elif qt == "COMPLAINTS":
        if not data["complaints"]:
            return f"All branches report customer satisfaction. No pending complaints for {data['date']}, Sir."
        lines = [
            f"### Customer Complaints Summary ({data['date']}):\n",
            f"• **Total Complaints**: {data['count']}",
            "\n**Complaint Details:**"
        ]
        for c in data["complaints"]:
            lines.append(f"• **{c['branch']}**: \"{c['complaint']}\"")
        return "\n".join(lines)

    elif qt == "ALERTS":
        if not data["alerts"]:
            return f"No operational alerts or issues have been reported for {data['date']}, Sir."
        lines = [
            f"### Operational Alerts & Issues ({data['date']}):\n",
            f"• **Total Alerts**: {data['count']}",
            "\n**Alert Details:**"
        ]
        for a in data["alerts"]:
            lines.append(f"• **{a['branch']}**: {a['issue']}")
        return "\n".join(lines)

    elif qt == "REMARKS":
        if not data["remarks"]:
            return f"No manager remarks or feedback have been submitted for {data['date']}, Sir."
        lines = [f"### Branch Manager Remarks ({data['date']}):"]
        for r in data["remarks"]:
            lines.append(f"• **{r['branch']}**: \"{r['remark']}\"")
        return "\n".join(lines)

    elif qt == "AGENDA":
        lines = [f"### Today's Agenda Summary ({data['date']}):\n"]
        lines.append(f"• {data['meetings_count']} meetings scheduled today." if data['meetings_count'] else "• No meetings scheduled today.")
        lines.append(f"• {data['tasks_count']} pending executive tasks." if data['tasks_count'] else "• No pending executive tasks.")
        lines.append(f"• {data['pending_reports']} branch reports are still pending." if data['pending_reports'] else "• All branch reports have been submitted.")
        lines.append(f"• {data['alerts_count']} operational alerts reported." if data['alerts_count'] else "• No operational alerts.")
        return "\n".join(lines)

    elif qt == "MEETINGS":
        if not data["meetings"]:
            return "No meetings scheduled in the calendar, Sir."
        lines = ["Corporate & Branch Meetings Schedule:\n"]
        for m in data["meetings"]:
            lines.append(f"• **{m['title']}** ({m['date']} at {m['time']}):\n  - Agenda: {m['agenda']}\n  - Status: {m['status']}")
        return "\n\n".join(lines)

    elif qt == "TASKS":
        if not data["tasks"]:
            return "No tasks are currently registered, Sir."
        lines = ["Operations Tasks & Actions List:\n"]
        for t in data["tasks"]:
            lines.append(f"• **{t['title']}** (Due: {t['due_date']}):\n  - Priority: {t['priority']} | Status: {t['status']}\n  - Description: {t['description']}")
        return "\n\n".join(lines)

    elif qt == "COMPARISON":
        lines = [f"### Branch Performance Comparison ({data['date']}):"]
        for b in data["branches"]:
            if b["status"] == "SUBMITTED":
                lines.append(
                    f"• **{b['branch']}**:\n"
                    f"  - Total Revenue: {_fmt_currency(b['total_revenue'])}\n"
                    f"  - Gold: {_fmt_currency(b.get('gold_sales', 0))}\n"
                    f"  - Silver: {_fmt_currency(b.get('silver_sales', 0))}\n"
                    f"  - Platinum: {_fmt_currency(b.get('platinum_sales', 0))}\n"
                    f"  - Diamond: {_fmt_currency(b.get('diamond_sales', 0))}\n"
                    f"  - Staff Attendance: {b.get('attendance', 0)} present, {b.get('absent', 0)} absent\n"
                    f"  - Target Achievement: {b.get('target_achievement', 0):.1f}%\n"
                    f"  - Operational Issues: {b.get('operational_issues', 'None')}\n"
                    f"  - Remarks: \"{b.get('remarks', 'None')}\""
                )
            else:
                lines.append(f"• **{b['branch']}**: No report submitted yet.")
        return "\n\n".join(lines)

    # Generic fallback
    return json.dumps(data, indent=2, default=str)


async def _format_with_llm(query: str, data: dict) -> str:
    """Format structured data into a professional response using LLM."""
    if not settings.OPENAI_API_KEY or settings.OPENAI_API_KEY.startswith("mock-key"):
        return _format_deterministic(data)

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        system_prompt = (
            "You are an executive business analyst for Pothys Swarna Mahal, a premium jewellery retail chain in India.\n"
            "You will receive a user's question and structured JSON data from the database.\n"
            "Your task is to present the data clearly and professionally.\n"
            "RULES:\n"
            "- Do not mention SQL, database, JSON, rows, or queries.\n"
            "- Use professional Indian business formatting for monetary values:\n"
            "  * Less than ₹1,00,000: e.g. ₹95,000\n"
            "  * ₹1 Lakh to ₹99.99 Lakhs: e.g. ₹25.40L\n"
            "  * ₹1 Crore and above: e.g. ₹1.25Cr\n"
            "- Use bullet points for readability.\n"
            "- For branch reports, list: Revenue, Gold, Silver, Platinum, Diamond, DigiGold, DigiSilver, Attendance, Complaints, Operational Issues, and Manager Remarks.\n"
            "- Keep the tone professional, concise, and executive.\n"
            "- Address the user as 'Sir'."
        )

        data_str = json.dumps(data, indent=2, default=str)
        user_prompt = f"User Question: {query}\n\nDatabase Result:\n{data_str}"

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=500
        )

        return response.choices[0].message.content.strip()

    except Exception as e:
        logger.warning(f"LLM formatting failed: {e}. Falling back to deterministic formatting.")
        return _format_deterministic(data)


# ─────────────────────────────────────────────
# Main Entry Point
# ─────────────────────────────────────────────

class BusinessQueryExecutor:
    """
    Main entry point for business queries.

    Usage:
        executor = BusinessQueryExecutor()
        response = await executor.execute(
            intent="BRANCH_REPORT",
            query="Show me Padi report",
            db=session,
            branch_name="Padi"
        )
    """

    @staticmethod
    async def execute(
        intent: str,
        query: str,
        db: AsyncSession,
        branch_name: Optional[str] = None,
        current_user: Optional[Any] = None,
    ) -> str:
        """Execute a business query based on structured slot extraction."""
        from app.services.intent_classifier import intent_classifier
        slots = intent_classifier.classify_slots(query)
        print(f"[BUSINESS_EXECUTOR] Extracted Slots: {slots.to_dict()}")

        query_date = date.today()
        if slots.time == "yesterday":
            query_date = date.today() - timedelta(days=1)

        try:
            # Route based on extracted slots
            if slots.intent == BusinessIntent.BRANCH_METRIC and slots.branch and slots.metric:
                structured_data = await _query_branch_metric(db, slots.branch, slots.metric, query_date)

            elif slots.intent in (BusinessIntent.COMPARE_BRANCHES, BusinessIntent.COMPARISON) or slots.comparison:
                structured_data = await _query_comparison(db, query, query_date)

            elif slots.intent == BusinessIntent.BRANCH_REPORT and slots.branch:
                structured_data = await _query_branch_report(db, slots.branch, query_date)

            elif slots.intent == BusinessIntent.TOTAL_ABSENTEES:
                structured_data = await _query_attendance(db, query_date)
                structured_data["focus"] = "absentees"

            elif slots.intent == BusinessIntent.TOTAL_REVENUE:
                structured_data = await _query_today_revenue(db, query_date)

            elif slots.intent == BusinessIntent.TOTAL_METRIC and slots.metric:
                structured_data = await _query_total_metric(db, slots.metric, query_date)

            elif slots.intent == BusinessIntent.GOLD_SALES:
                if slots.branch:
                    structured_data = await _query_branch_metric(db, slots.branch, "gold_sales", query_date)
                else:
                    structured_data = await _query_gold_sales(db, query_date)

            elif slots.intent == BusinessIntent.DIAMOND_SALES:
                if slots.branch:
                    structured_data = await _query_branch_metric(db, slots.branch, "diamond_sales", query_date)
                else:
                    structured_data = await _query_diamond_sales(db, query_date)

            elif slots.intent == BusinessIntent.ATTENDANCE:
                if slots.branch:
                    structured_data = await _query_branch_metric(db, slots.branch, "attendance", query_date)
                else:
                    structured_data = await _query_attendance(db, query_date)

            elif slots.intent == BusinessIntent.COMPLAINTS:
                if slots.branch:
                    structured_data = await _query_branch_metric(db, slots.branch, "complaints", query_date)
                else:
                    structured_data = await _query_complaints(db, query_date)

            elif slots.intent == BusinessIntent.ALERTS:
                if slots.branch:
                    structured_data = await _query_branch_metric(db, slots.branch, "issues", query_date)
                else:
                    structured_data = await _query_alerts(db, query_date)

            elif slots.intent == BusinessIntent.REMARKS:
                if slots.branch:
                    structured_data = await _query_branch_metric(db, slots.branch, "remarks", query_date)
                else:
                    structured_data = await _query_remarks(db, query_date)

            elif slots.intent == BusinessIntent.DIGIGOLD:
                if slots.branch:
                    structured_data = await _query_branch_metric(db, slots.branch, "digigold", query_date)
                else:
                    structured_data = await _query_digigold(db, query_date)

            elif slots.intent == BusinessIntent.TOP_BRANCH:
                structured_data = await _query_top_branch(db, query_date)

            elif slots.intent == BusinessIntent.TOP_PERFORMER:
                structured_data = await _query_top_performer(db, query_date, slots.branch)

            elif slots.intent == BusinessIntent.PENDING_REPORTS:
                structured_data = await _query_pending_reports(db, query_date)

            elif slots.intent == BusinessIntent.SUBMITTED_REPORTS:
                structured_data = await _query_submitted_reports(db, query_date)

            elif slots.intent == BusinessIntent.AGENDA:
                structured_data = await _query_agenda(db, current_user.id if current_user else None, query_date)

            elif slots.intent == BusinessIntent.MEETINGS:
                structured_data = await _query_meetings(db, current_user.id if current_user else None)

            elif slots.intent == BusinessIntent.TASKS:
                structured_data = await _query_tasks(db, current_user.id if current_user else None)

            elif slots.branch:
                structured_data = await _query_branch_report(db, slots.branch, query_date)

            else:
                structured_data = await _query_report_status(db, query_date)

            print(f"[BUSINESS_EXECUTOR] Query returned: {json.dumps(structured_data, default=str)[:200]}...")
            response = await _format_with_llm(query, structured_data)
            print(f"[BUSINESS_EXECUTOR] Response formatted successfully.")
            return response

        except Exception as e:
            logger.error(f"Business query execution error: {e}", exc_info=True)
            return f"I encountered an issue processing your request: {str(e)}"


# Module-level singleton
business_executor = BusinessQueryExecutor()
