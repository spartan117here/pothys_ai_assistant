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
                "original_file_url": report.original_file_url
            } if report else None
        })

    return result

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
        "recent_issues": issues_logged
    }
