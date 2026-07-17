import uuid
from datetime import date as date_type
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, BackgroundTasks
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db, AsyncSessionLocal
from app.api.deps import get_current_user, check_role
from app.models.user import User
from app.models.report import DailyReport
from app.models.document import DocumentChunk
from app.repositories.report import DailyReportRepository
from app.repositories.branch import BranchRepository
from app.repositories.document import DocumentRepository
from app.schemas.report import DailyReportResponse, DailyReportCreate
from app.services.storage import storage_service
from app.services.doc_parser import document_parser
from app.services.rag_engine import rag_engine

router = APIRouter()

async def vector_index_report_text(report_id: uuid.UUID, text_content: str):
    """Background task to slice, embed, and store report chunks in the vector DB."""
    if not text_content or not text_content.strip():
        return
        
    chunks = rag_engine.chunk_text(text_content)
    if not chunks:
        return
        
    chunks_data = []
    for chunk in chunks:
        try:
            embedding = await rag_engine.get_embedding(chunk)
            chunks_data.append({
                "report_id": report_id,
                "source_type": "REPORT",
                "content": chunk,
                "embedding": embedding
            })
        except Exception as e:
            print(f"Error generating embedding for chunk in background: {e}")
            continue
            
    if not chunks_data:
        return

    async with AsyncSessionLocal() as db:
        try:
            # Delete any existing chunks for this report to prevent duplicates on upsert
            await db.execute(delete(DocumentChunk).where(DocumentChunk.report_id == report_id))
            
            doc_repo = DocumentRepository(db)
            await doc_repo.create_chunks(chunks_data)
            print(f"Successfully vectorized and indexed {len(chunks_data)} chunks for report {report_id}")
        except Exception as e:
            print(f"Error storing report vector chunks in background: {e}")

@router.post("/upload", response_model=DailyReportResponse, status_code=status.HTTP_201_CREATED)
async def upload_daily_report(
    report_date: date_type = Form(...),
    sales_amount: Optional[float] = Form(None),
    attendance_count: Optional[int] = Form(None),
    target_achievement: Optional[float] = Form(None),
    inventory_status: Optional[str] = Form(None),
    remarks: Optional[str] = Form(None),
    issues: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_role(["MANAGER"]))
):
    """
    Upload daily report (PDF, Excel, Word).
    Branch Managers upload daily data. Automatically extracts metrics from files if not manually entered.
    """
    if not current_user.branch_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not assigned to any branch"
        )

    file_url = None
    extracted_text = ""
    parsed_metrics = {}

    # If a file is uploaded, save to storage and parse it
    if file:
        file_content = await file.read()
        
        # Upload file to Storage (Supabase with local fallback)
        try:
            file_url = await storage_service.upload_file(
                file_content=file_content,
                file_name=file.filename,
                content_type=file.content_type
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload raw document: {str(e)}"
            )

        # Parse document contents
        try:
            parsed_metrics, extracted_text = document_parser.parse_document(file_content, file.filename)
        except Exception as e:
            # Clean up uploaded file if parsing fails
            if file_url:
                await storage_service.delete_file(file_url)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Failed to parse report file format: {str(e)}"
            )

    # Merge manually entered values with parsed values (manual input takes precedence)
    final_sales = sales_amount if sales_amount is not None else parsed_metrics.get("sales_amount")
    final_attendance = attendance_count if attendance_count is not None else parsed_metrics.get("attendance_count")
    final_target = target_achievement if target_achievement is not None else parsed_metrics.get("target_achievement")
    final_inventory = inventory_status if inventory_status is not None else parsed_metrics.get("inventory_status", "")
    final_remarks = remarks if remarks is not None else parsed_metrics.get("remarks", "")
    final_issues = issues if issues is not None else parsed_metrics.get("issues", "")

    # Validation: Ensure we have core metrics
    if final_sales is None or final_attendance is None or final_target is None:
        if file_url:
            await storage_service.delete_file(file_url)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing core metrics (Sales, Attendance, and Target Achievement). Please provide them manually or verify the uploaded file contains these metrics."
        )

    report_repo = DailyReportRepository(db)
    
    # Check if a report for this branch and date already exists (Upsert logic)
    existing_report = await report_repo.get_by_branch_and_date(current_user.branch_id, report_date)
    
    # Prepare text for vector indexing (use file extracted text or fallback to structured fields)
    index_text = extracted_text if file else f"Daily operational report for branch on {report_date}.\nSales Amount: {final_sales} INR\nStaff Attendance: {final_attendance} present\nTarget Achievement: {final_target}%\nInventory status: {final_inventory}\nRemarks: {final_remarks}\nIssues: {final_issues}"

    if existing_report:
        # Delete old file from storage if updated
        if existing_report.original_file_url and file_url:
            await storage_service.delete_file(existing_report.original_file_url)
            
        # Update existing report fields
        existing_report.sales_amount = final_sales
        existing_report.attendance_count = final_attendance
        existing_report.target_achievement = final_target
        existing_report.inventory_status = final_inventory
        existing_report.remarks = final_remarks
        existing_report.issues = final_issues
        if file_url:
            existing_report.original_file_url = file_url
            
        await db.commit()
        await db.refresh(existing_report)
        
        # Trigger background vector indexing
        background_tasks.add_task(vector_index_report_text, existing_report.id, index_text)
        return existing_report

    # Create new report entry
    report_in = DailyReportCreate(
        date=report_date,
        sales_amount=final_sales,
        attendance_count=final_attendance,
        target_achievement=final_target,
        inventory_status=final_inventory,
        remarks=final_remarks,
        issues=final_issues,
        original_file_url=file_url
    )

    try:
        new_report = await report_repo.create(
            branch_id=current_user.branch_id,
            manager_id=current_user.id,
            report_in=report_in
        )
        
        # Trigger background vector indexing
        background_tasks.add_task(vector_index_report_text, new_report.id, index_text)
        return new_report
    except Exception as e:
        if file_url:
            await storage_service.delete_file(file_url)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database insertion failed: {str(e)}"
        )

@router.get("/pending", response_model=List[dict])
async def get_pending_reports(
    report_date: Optional[date_type] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_role(["AGM"]))
):
    """
    Get list of branches that have NOT uploaded daily reports for the specified date (defaults to today).
    Only accessible by AGM.
    """
    target_date = report_date or date_type.today()
    
    branch_repo = BranchRepository(db)
    report_repo = DailyReportRepository(db)
    
    all_branches = await branch_repo.get_all()
    reports_today = await report_repo.get_reports_for_date(target_date)
    
    uploaded_branch_ids = {r.branch_id for r in reports_today}
    
    pending_branches = []
    for branch in all_branches:
        if branch.id not in uploaded_branch_ids:
            pending_branches.append({
                "branch_id": branch.id,
                "branch_name": branch.name,
                "branch_code": branch.code,
                "missing_date": target_date
            })
            
    return pending_branches

@router.get("/branch/{branch_id}", response_model=List[DailyReportResponse])
async def get_branch_reports(
    branch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_role(["AGM", "MANAGER"]))
):
    """
    Get all daily reports for a branch.
    AGM can fetch any branch; Managers can only fetch their own branch reports.
    """
    if current_user.role == "MANAGER" and current_user.branch_id != branch_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are only authorized to access metrics for your own branch"
        )
        
    report_repo = DailyReportRepository(db)
    reports = await report_repo.get_all_by_branch(branch_id)
    return reports
