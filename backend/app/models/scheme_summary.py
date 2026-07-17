import uuid
from sqlalchemy import Integer, String, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base_class import Base

class SchemeSummary(Base):
    __tablename__ = "scheme_summaries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("daily_reports.id", ondelete="CASCADE"), nullable=False)
    
    digigold_total: Mapped[int] = mapped_column(Integer, default=0)
    digisilver_total: Mapped[int] = mapped_column(Integer, default=0)
    overall_remarks: Mapped[str] = mapped_column(String(1000), nullable=True)
    
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    report: Mapped["DailyReport"] = relationship(back_populates="scheme_summary")
