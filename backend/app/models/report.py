import uuid
from datetime import date
from sqlalchemy import String, Numeric, Integer, Date, DateTime, ForeignKey, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base_class import Base

class DailyReport(Base):
    __tablename__ = "daily_reports"
    __table_args__ = (UniqueConstraint('branch_id', 'date', name='uq_branch_date'),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"), nullable=False)
    manager_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    sales_amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    attendance_count: Mapped[int] = mapped_column(Integer, nullable=False)
    target_achievement: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)  # Percentage achieved
    inventory_status: Mapped[str] = mapped_column(String(500), nullable=True)
    remarks: Mapped[str] = mapped_column(String(1000), nullable=True)
    issues: Mapped[str] = mapped_column(String(1000), nullable=True)
    original_file_url: Mapped[str] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="DRAFT")
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    branch: Mapped["Branch"] = relationship(back_populates="reports")
    manager: Mapped["User"] = relationship(back_populates="uploaded_reports")
    documents: Mapped[list["Document"]] = relationship(back_populates="report")
    document_chunks: Mapped[list["DocumentChunk"]] = relationship(back_populates="report")
