import uuid
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field

class DailyReportCreate(BaseModel):
    date: date
    sales_amount: float = Field(..., ge=0, description="Daily sales amount in INR")
    attendance_count: int = Field(..., ge=0, description="Total present count")
    target_achievement: float = Field(..., ge=0, description="Achievement level in percentage")
    inventory_status: Optional[str] = Field(None, max_length=500)
    remarks: Optional[str] = Field(None, max_length=1000)
    issues: Optional[str] = Field(None, max_length=1000)
    original_file_url: Optional[str] = Field(None, max_length=500)

class DailyReportResponse(BaseModel):
    id: uuid.UUID
    branch_id: uuid.UUID
    manager_id: uuid.UUID
    date: date
    sales_amount: float
    attendance_count: int
    target_achievement: float
    inventory_status: Optional[str]
    remarks: Optional[str]
    issues: Optional[str]
    original_file_url: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
