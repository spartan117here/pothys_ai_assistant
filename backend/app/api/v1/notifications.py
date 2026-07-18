from typing import List
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, desc, func as sqla_func

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.notification import Notification
from app.schemas.notification import NotificationInDB

router = APIRouter()

async def sync_user_notifications(db: AsyncSession, current_user: User):
    """
    Synchronizes notifications table with today's branch activity and seeds historical mocks.
    """
    from datetime import date, datetime, timedelta, timezone
    from sqlalchemy import select
    from app.models.branch import Branch
    from app.models.report import DailyReport
    
    target_date = date.today()
    
    # 1. Fetch branches and daily reports for today
    branches_res = await db.execute(select(Branch))
    branches = branches_res.scalars().all()
    
    reports_res = await db.execute(
        select(DailyReport).where(DailyReport.date == target_date)
    )
    reports = reports_res.scalars().all()
    reports_map = {r.branch_id: r for r in reports}
    
    # Get short branch name helper
    def get_short_branch_name(name: str) -> str:
        return name.replace("Swarna Mahal", "").strip()
        
    # Get existing notifications for this user
    existing_res = await db.execute(
        select(Notification).where(Notification.user_id == current_user.id)
    )
    existing_notifications = existing_res.scalars().all()
    existing_by_title = {n.title: n for n in existing_notifications}
    
    # Synchronize today's notifications
    for branch in branches:
        short_name = get_short_branch_name(branch.name)
        
        # Report Submitted vs Report Pending
        if branch.id in reports_map:
            report = reports_map[branch.id]
            
            # If "Report Pending" notification exists, remove it
            pending_title = f"Report Pending: {short_name}"
            if pending_title in existing_by_title:
                await db.delete(existing_by_title[pending_title])
                
            # Create "Report Submitted" notification
            submitted_title = f"Report Submitted: {short_name}"
            if submitted_title not in existing_by_title:
                new_notif = Notification(
                    user_id=current_user.id,
                    title=submitted_title,
                    message="Daily operations report has been successfully submitted and approved.",
                    type="Report Submitted",
                    is_read=False,
                    branch_id=branch.id,
                    created_at=datetime.now(timezone.utc) - timedelta(minutes=15)
                )
                db.add(new_notif)
                
            # Operational Issue (if any)
            if report.issues and report.issues.strip() and report.issues.lower() != "none":
                issue_title = f"Operational Issue at {short_name}"
                if issue_title not in existing_by_title:
                    new_notif = Notification(
                        user_id=current_user.id,
                        title=issue_title,
                        message=report.issues.strip(),
                        type="Operational Issue",
                        is_read=False,
                        branch_id=branch.id,
                        created_at=datetime.now(timezone.utc) - timedelta(minutes=30)
                    )
                    db.add(new_notif)
            else:
                # If there are no issues, ensure any active "Operational Issue" notification is removed
                issue_title = f"Operational Issue at {short_name}"
                if issue_title in existing_by_title:
                    await db.delete(existing_by_title[issue_title])
        else:
            # Report is pending
            # If "Report Submitted" notification exists, remove it
            submitted_title = f"Report Submitted: {short_name}"
            if submitted_title in existing_by_title:
                await db.delete(existing_by_title[submitted_title])
                
            # If "Operational Issue" notification exists, remove it
            issue_title = f"Operational Issue at {short_name}"
            if issue_title in existing_by_title:
                await db.delete(existing_by_title[issue_title])
                
            # Create "Report Pending" notification
            pending_title = f"Report Pending: {short_name}"
            if pending_title not in existing_by_title:
                new_notif = Notification(
                    user_id=current_user.id,
                    title=pending_title,
                    message="Daily operations report for today is still pending. Action required.",
                    type="Report Pending",
                    is_read=False,
                    branch_id=branch.id,
                    created_at=datetime.now(timezone.utc) - timedelta(hours=4)
                )
                db.add(new_notif)
                
    # Calculate Dashboard Aggregations for today's notifications
    total_rev = sum(r.total_revenue if r.total_revenue else r.sales_amount for r in reports)
    emp_absent = sum(r.employees_absent for r in reports if r.employees_absent)
    
    complaints = []
    for r in reports:
        if r.customer_complaints and r.customer_complaints.lower() != "none" and r.customer_complaints.strip():
            complaints.append(r.customer_complaints.strip())
            
    # Top Performing Branch
    top_branch_name = "N/A"
    top_branch_id = None
    max_rev = -1.0
    branch_map = {b.id: b for b in branches}
    for r in reports:
        rev = r.total_revenue if r.total_revenue else r.sales_amount
        if rev > max_rev:
            max_rev = rev
            if r.branch_id in branch_map:
                top_branch_name = get_short_branch_name(branch_map[r.branch_id].name)
                top_branch_id = r.branch_id
                
    # Top Performing Employee
    from app.models.employee import Employee
    from app.models.employee_performance import EmployeePerformance
    
    stmt = (
        select(EmployeePerformance, Employee, Branch)
        .join(Employee, EmployeePerformance.employee_id == Employee.id)
        .join(DailyReport, EmployeePerformance.report_id == DailyReport.id)
        .join(Branch, Employee.branch_id == Branch.id)
        .where(DailyReport.date == target_date)
        .order_by((EmployeePerformance.gold_amount + EmployeePerformance.silver_amount + EmployeePerformance.platinum_amount + EmployeePerformance.diamond_amount).desc())
        .limit(1)
    )
    top_perf_res = await db.execute(stmt)
    top_perf = top_perf_res.first()
    top_employee_branch_id = None
    if top_perf:
        perf, emp, b_obj = top_perf
        total_emp_sales = float(perf.gold_amount + perf.silver_amount + perf.platinum_amount + perf.diamond_amount)
        top_employee_str = f"{emp.name} ({get_short_branch_name(b_obj.name)}) - ₹{total_emp_sales:,.2f}"
        top_employee_branch_id = b_obj.id
    else:
        top_employee_str = "N/A"
        
    # Attendance Alert
    if emp_absent > 0:
        att_title = "Attendance Alert"
        if att_title not in existing_by_title:
            new_notif = Notification(
                user_id=current_user.id,
                title=att_title,
                message=f"{emp_absent} employee(s) absent today across all branches. Check rosters.",
                type="Attendance Alert",
                is_read=False,
                created_at=datetime.now(timezone.utc) - timedelta(hours=5)
            )
            db.add(new_notif)
    else:
        if "Attendance Alert" in existing_by_title:
            await db.delete(existing_by_title["Attendance Alert"])
            
    # Customer Complaints
    for idx, comp in enumerate(complaints):
        comp_title = f"New Customer Complaint #{idx+1}"
        if comp_title not in existing_by_title:
            new_notif = Notification(
                user_id=current_user.id,
                title=comp_title,
                message=f'Customer reported: "{comp}"',
                type="Customer Complaint",
                is_read=False,
                created_at=datetime.now(timezone.utc) - timedelta(hours=3)
            )
            db.add(new_notif)
            
    # Top Branch
    if top_branch_name != "N/A":
        top_b_title = "Highest Performing Branch"
        if top_b_title not in existing_by_title:
            new_notif = Notification(
                user_id=current_user.id,
                title=top_b_title,
                message=f"{top_branch_name} is leading in sales and revenue growth today.",
                type="Highest Performing Branch",
                is_read=False,
                branch_id=top_branch_id,
                created_at=datetime.now(timezone.utc) - timedelta(hours=2)
            )
            db.add(new_notif)
            
    # Top Employee
    if top_employee_str != "N/A":
        top_e_title = "Highest Performing Executive"
        if top_e_title not in existing_by_title:
            new_notif = Notification(
                user_id=current_user.id,
                title=top_e_title,
                message=f"{top_employee_str} achieved outstanding operations score today.",
                type="Highest Performing Executive",
                is_read=False,
                branch_id=top_employee_branch_id,
                created_at=datetime.now(timezone.utc) - timedelta(hours=1.5)
            )
            db.add(new_notif)
            
    # AI Recommendation
    ai_title = "AI RAG Insight"
    if ai_title not in existing_by_title:
        new_notif = Notification(
            user_id=current_user.id,
            title=ai_title,
            message="Based on today's run-rate, Swarna Mahal is projected to exceed its daily sales target by 12%.",
            type="AI Recommendation",
            is_read=False,
            created_at=datetime.now(timezone.utc) - timedelta(hours=6)
        )
        db.add(new_notif)
        
    # Yesterday / Earlier Mocks
    yesterday = datetime.now(timezone.utc) - timedelta(days=1)
    three_days_ago = datetime.now(timezone.utc) - timedelta(days=3)
    four_days_ago = datetime.now(timezone.utc) - timedelta(days=4)
    one_week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    
    historical_mocks = [
        {
            "title": "Report Submitted: Swarna Mahal Chromepet",
            "message": "Yesterday's daily report submitted by Manager and verified.",
            "type": "Report Submitted",
            "created_at": yesterday.replace(hour=20, minute=30, second=0)
        },
        {
            "title": "AI Recommendation - Promotion Strategy",
            "message": "DigiGold enrollments are up by 15%. Consider boosting local promo campaigns.",
            "type": "AI Recommendation",
            "created_at": yesterday.replace(hour=11, minute=15, second=0)
        },
        {
            "title": "Attendance Notice",
            "message": "Roster filled successfully. 100% staff attendance achieved yesterday.",
            "type": "Attendance Alert",
            "created_at": yesterday.replace(hour=9, minute=0, second=0)
        },
        {
            "title": "Operational Issue resolved: Swarna Mahal T-Nagar",
            "message": "POS billing terminal hardware failure resolved by support team.",
            "type": "Operational Issue",
            "created_at": three_days_ago
        },
        {
            "title": "Customer Complaint Resolved",
            "message": "Complaint ID 4032 regarding silver coin weight mismatch resolved in store.",
            "type": "Customer Complaint",
            "created_at": four_days_ago
        },
        {
            "title": "Monthly Branch Winner",
            "message": "Swarna Mahal T-Nagar awarded top branch for the previous month.",
            "type": "Highest Performing Branch",
            "created_at": one_week_ago
        }
    ]
    
    for mock in historical_mocks:
        if mock["title"] not in existing_by_title:
            new_notif = Notification(
                user_id=current_user.id,
                title=mock["title"],
                message=mock["message"],
                type=mock["type"],
                is_read=False,
                created_at=mock["created_at"]
            )
            db.add(new_notif)
            
    await db.commit()

@router.get("/unread-count", response_model=dict)
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lightweight endpoint returning just the unread notification count for bell badge."""
    await sync_user_notifications(db, current_user)
    result = await db.execute(
        select(sqla_func.count(Notification.id))
        .where(Notification.user_id == current_user.id)
        .where(Notification.is_read == False)
    )
    count = result.scalar() or 0
    return {"count": count}

@router.get("/", response_model=List[NotificationInDB])
async def get_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await sync_user_notifications(db, current_user)
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(desc(Notification.created_at))
    )
    return result.scalars().all()

@router.put("/{notification_id}/read", response_model=NotificationInDB)
async def mark_as_read(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id
        )
    )
    notification = result.scalars().first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    notification.is_read = True
    await db.commit()
    await db.refresh(notification)
    return notification

@router.put("/read-all", response_model=dict)
async def mark_all_as_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id)
        .where(Notification.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
    return {"status": "success", "message": "All notifications marked as read"}
