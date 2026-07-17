import uuid
from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.db.session import get_db
from app.api.deps import get_current_user, check_role
from app.models.user import User
from app.models.report import DailyReport
from app.repositories.branch import BranchRepository
from app.repositories.report import DailyReportRepository
from app.schemas.branch import BranchResponse

router = APIRouter()

@router.get("", response_model=List[dict])
async def list_branches_dashboard(
    report_date: Optional[date] = Query(None, description="Date to check operational status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_role(["AGM"]))
):
    """
    List all branches with their operational status for a specific date (defaults to today).
    Only accessible by AGM to monitor operations at a glance.
    """
    target_date = report_date or date.today()
    branch_repo = BranchRepository(db)
    report_repo = DailyReportRepository(db)

    branches = await branch_repo.get_all()
    reports = await report_repo.get_reports_for_date(target_date)

    # Map report by branch_id
    reports_map = {r.branch_id: r for r in reports}

    result = []
    for branch in branches:
        report = reports_map.get(branch.id)
        result.append({
            "id": branch.id,
            "name": branch.name,
            "code": branch.code,
            "monthly_sales_target": float(branch.monthly_sales_target) if branch.monthly_sales_target else 0.0,
            "status": "SUBMITTED" if report else "PENDING",
            "report": {
                "id": report.id,
                "sales_amount": float(report.sales_amount),
                "attendance_count": report.attendance_count,
                "target_achievement": float(report.target_achievement),
                "inventory_status": report.inventory_status,
                "remarks": report.remarks,
                "issues": report.issues,
                "original_file_url": report.original_file_url,
                "gold_sales": float(report.gold_sales) if report.gold_sales else 0.0,
                "silver_sales": float(report.silver_sales) if report.silver_sales else 0.0,
                "platinum_sales": float(report.platinum_sales) if report.platinum_sales else 0.0,
                "diamond_sales": float(report.diamond_sales) if report.diamond_sales else 0.0,
                "total_revenue": float(report.total_revenue) if report.total_revenue else 0.0,
                "digigold_enrollments": report.digigold_enrollments or 0,
                "digisilver_enrollments": report.digisilver_enrollments or 0,
                "employees_present": report.employees_present or 0,
                "employees_absent": report.employees_absent or 0,
                "customer_complaints": report.customer_complaints or "None"
            } if report else None
        })

    return result


@router.get("/dashboard-summary", response_model=dict)
async def get_dashboard_summary(
    report_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_role(["AGM"]))
):
    """Retrieve aggregate summary analytics for the AGM dashboard from uploaded templates."""
    target_date = report_date or date.today()
    report_repo = DailyReportRepository(db)
    branch_repo = BranchRepository(db)
    
    branches = await branch_repo.get_all()
    reports = await report_repo.get_reports_for_date(target_date)
    
    # 1. Aggregations
    total_rev = sum(r.total_revenue if r.total_revenue else r.sales_amount for r in reports)
    digigold = sum(r.digigold_enrollments for r in reports if r.digigold_enrollments)
    digisilver = sum(r.digisilver_enrollments for r in reports if r.digisilver_enrollments)
    
    # Present/Absent fallback to attendance_count if present/absent columns aren't filled
    emp_present = sum(r.employees_present if r.employees_present else r.attendance_count for r in reports)
    emp_absent = sum(r.employees_absent for r in reports if r.employees_absent)
    
    complaints = []
    for r in reports:
        if r.customer_complaints and r.customer_complaints.lower() != "none" and r.customer_complaints.strip():
            complaints.append(r.customer_complaints.strip())
            
    # 2. Top Performing Branch
    top_branch_name = "N/A"
    max_rev = -1.0
    branch_map = {b.id: b for b in branches}
    for r in reports:
        rev = r.total_revenue if r.total_revenue else r.sales_amount
        if rev > max_rev:
            max_rev = rev
            if r.branch_id in branch_map:
                top_branch_name = branch_map[r.branch_id].name.split(" ")[0]
                
    # 3. Top Performing Employee
    from app.models.employee import Employee
    from app.models.employee_performance import EmployeePerformance
    from app.models.branch import Branch
    
    stmt = (
        select(EmployeePerformance, Employee, Branch)
        .join(Employee, EmployeePerformance.employee_id == Employee.id)
        .join(DailyReport, EmployeePerformance.report_id == DailyReport.id)
        .join(Branch, Employee.branch_id == Branch.id)
        .where(DailyReport.date == target_date)
        .order_by((EmployeePerformance.gold_amount + EmployeePerformance.silver_amount + EmployeePerformance.platinum_amount + EmployeePerformance.diamond_amount).desc())
        .limit(1)
    )
    res = await db.execute(stmt)
    top_perf = res.first()
    if top_perf:
        perf, emp, b_obj = top_perf
        total_emp_sales = float(perf.gold_amount + perf.silver_amount + perf.platinum_amount + perf.diamond_amount)
        top_employee_str = f"{emp.name} ({b_obj.name.split(' ')[0]}) - ₹{total_emp_sales:,.2f}"
    else:
        top_employee_str = "N/A"

    return {
        "total_revenue": float(total_rev),
        "digigold_enrollments": digigold,
        "digisilver_enrollments": digisilver,
        "employees_present": emp_present,
        "employees_absent": emp_absent,
        "complaints_count": len(complaints),
        "top_performing_branch": top_branch_name,
        "top_performing_employee": top_employee_str,
        "complaints": complaints
    }

@router.get("/{branch_id}/analytics", response_model=dict)
async def get_branch_analytics(
    branch_id: uuid.UUID,
    start_date: Optional[date] = Query(None, description="Start date for trends"),
    end_date: Optional[date] = Query(None, description="End date for trends"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_role(["AGM", "MANAGER"]))
):
    """
    Get detailed metrics, charts, and operational trend details for a specific branch.
    AGM can view any branch; Branch Managers can only view their own branch.
    """
    if current_user.role == "MANAGER" and current_user.branch_id != branch_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are only authorized to access analytics for your own branch"
        )

    branch_repo = BranchRepository(db)
    branch = await branch_repo.get_by_id(branch_id)
    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found"
        )

    # Default to past 30 days if range is not supplied
    today = date.today()
    start = start_date or (today - timedelta(days=30))
    end = end_date or today

    # Query reports in date range
    result = await db.execute(
        select(DailyReport)
        .where(
            and_(
                DailyReport.branch_id == branch_id,
                DailyReport.date >= start,
                DailyReport.date <= end
            )
        )
        .order_by(DailyReport.date.asc())
    )
    reports = result.scalars().all()

    # Calculations
    total_sales = sum(r.sales_amount for r in reports)
    avg_attendance = sum(r.attendance_count for r in reports) / len(reports) if reports else 0.0
    avg_achievement = sum(r.target_achievement for r in reports) / len(reports) if reports else 0.0
    
    # Check flags for issues requiring AGM attention
    issues_logged = [
        {"date": r.date, "manager": r.manager_id, "issues": r.issues}
        for r in reports if r.issues and r.issues.strip()
    ]

    trends = [
        {
            "date": r.date,
            "sales_amount": float(r.sales_amount),
            "attendance_count": r.attendance_count,
            "target_achievement": float(r.target_achievement)
        }
        for r in reports
    ]

    # Fetch today's report details (including employee performances and scheme summary)
    from app.models.employee_performance import EmployeePerformance
    from app.models.employee import Employee
    from app.models.scheme_summary import SchemeSummary

    today_stmt = select(DailyReport).where(DailyReport.branch_id == branch_id, DailyReport.date == today)
    today_res = await db.execute(today_stmt)
    today_report = today_res.scalars().first()

    employee_performances_list = []
    top_performer_str = "N/A"
    scheme_sum_dict = {}

    if today_report:
        emp_perf_stmt = (
            select(EmployeePerformance, Employee)
            .join(Employee, EmployeePerformance.employee_id == Employee.id)
            .where(EmployeePerformance.report_id == today_report.id)
        )
        emp_perf_res = await db.execute(emp_perf_stmt)
        emp_perfs = emp_perf_res.all()

        max_emp_sales = -1.0
        for perf, emp in emp_perfs:
            total_sales = float(perf.gold_amount + perf.silver_amount + perf.platinum_amount + perf.diamond_amount)
            if total_sales > max_emp_sales:
                max_emp_sales = total_sales
                top_performer_str = f"{emp.name} (₹{total_sales:,.2f})"

            employee_performances_list.append({
                "employee_name": emp.name,
                "designation": emp.designation,
                "gold_grams": float(perf.gold_grams_sold),
                "gold_amount": float(perf.gold_amount),
                "silver_grams": float(perf.silver_grams_sold),
                "silver_amount": float(perf.silver_amount),
                "platinum_amount": float(perf.platinum_amount),
                "diamond_amount": float(perf.diamond_amount),
                "digigold": perf.digigold_enrollments,
                "digisilver": perf.digisilver_enrollments
            })

        ss_stmt = select(SchemeSummary).where(SchemeSummary.report_id == today_report.id)
        ss_res = await db.execute(ss_stmt)
        ss_obj = ss_res.scalars().first()
        if ss_obj:
            scheme_sum_dict = {
                "digigold_total": ss_obj.digigold_total,
                "digisilver_total": ss_obj.digisilver_total,
                "overall_remarks": ss_obj.overall_remarks
            }

    return {
        "branch": {
            "id": branch.id,
            "name": branch.name,
            "code": branch.code,
            "monthly_sales_target": float(branch.monthly_sales_target) if branch.monthly_sales_target else 0.0
        },
        "summary": {
            "total_sales": float(total_sales),
            "average_attendance": round(avg_attendance, 1),
            "average_target_achievement": round(avg_achievement, 2),
            "reports_count": len(reports),
            "issues_count": len(issues_logged)
        },
        "trends": trends,
        "recent_issues": issues_logged,
        "today_report_details": {
            "employee_performances": employee_performances_list,
            "top_performer": top_performer_str,
            "scheme_summary": scheme_sum_dict
        }
    }
