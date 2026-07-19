import uuid
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.db.session import SessionLocal, sync_engine
from app.db.base import Base
from app.models.branch import Branch
from app.models.user import User
from app.models.report import DailyReport
from app.models.document import Document, DocumentChunk
from app.models.meeting import Meeting
from app.models.task import Task
from app.models.notification import Notification
from app.models.conversation import AIConversation, AIMessage
from app.models.audit import AuditLog
from app.models.ai_memory import AIMemory
from app.models.employee import Employee
from app.models.employee_performance import EmployeePerformance
from app.models.scheme_summary import SchemeSummary
from app.core.security import get_password_hash

# Set up branch list configurations
BRANCHES_TO_SEED = [
    {"name": "T. Nagar Swarna Mahal", "code": "TNAGAR", "target": 5000000.00},
    {"name": "Chromepet Swarna Mahal", "code": "CHROMEPET", "target": 3500000.00},
    {"name": "Coimbatore Swarna Mahal", "code": "COIMBATORE", "target": 4000000.00},
    {"name": "Madurai Swarna Mahal", "code": "MADURAI", "target": 3000000.00},
    {"name": "Trichy Swarna Mahal", "code": "TRICHY", "target": 2500000.00},
    {"name": "Tirunelveli Swarna Mahal", "code": "TIRUNELVELI", "target": 2000000.00},
    {"name": "Nagercoil Swarna Mahal", "code": "NAGERCOIL", "target": 1800000.00},
    {"name": "Pondicherry Swarna Mahal", "code": "PONDICHERRY", "target": 2200000.00},
]

MANAGERS_TO_SEED = [
    {"email": "tnagar@pothys.com", "code": "TNAGAR", "name": "Manager - T. Nagar"},
    {"email": "chromepet@pothys.com", "code": "CHROMEPET", "name": "Manager - Chromepet"},
    {"email": "coimbatore@pothys.com", "code": "COIMBATORE", "name": "Manager - Coimbatore"},
    {"email": "madurai@pothys.com", "code": "MADURAI", "name": "Manager - Madurai"},
    {"email": "trichy@pothys.com", "code": "TRICHY", "name": "Manager - Trichy"},
    {"email": "tirunelveli@pothys.com", "code": "TIRUNELVELI", "name": "Manager - Tirunelveli"},
    {"email": "nagercoil@pothys.com", "code": "NAGERCOIL", "name": "Manager - Nagercoil"},
    {"email": "pondicherry@pothys.com", "code": "PONDICHERRY", "name": "Manager - Pondicherry"},
]

def seed_database():
    print("Initializing database tables...")
    with sync_engine.connect() as conn:
        try:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            conn.commit()
            print("pgvector extension verified/created.")
        except Exception as e:
            print(f"Warning: Could not create pgvector extension directly (SQLite fallback): {e}")

    Base.metadata.create_all(bind=sync_engine)

    db: Session = SessionLocal()
    try:
        # Clear existing data to ensure a fresh seeding state for branches and manager roles
        print("Cleaning up old branch/manager data...")
        db.query(SchemeSummary).delete()
        db.query(EmployeePerformance).delete()
        db.query(Employee).delete()
        db.query(DocumentChunk).delete()
        db.query(Document).delete()
        db.query(DailyReport).delete()
        db.query(Task).delete()
        db.execute(text("DELETE FROM meeting_attendees"))
        db.query(Meeting).delete()
        db.query(Notification).delete()
        db.query(AIMessage).delete()
        db.query(AIConversation).delete()
        db.query(AuditLog).delete()
        db.query(AIMemory).delete()

        # Delete managers and branches (keeps the existing setup AGM users)
        db.query(User).filter(User.role == "MANAGER").delete()
        db.query(Branch).delete()
        db.commit()

        print("Seeding branches...")
        branch_map = {}
        for b_data in BRANCHES_TO_SEED:
            branch = Branch(
                name=b_data["name"],
                code=b_data["code"],
                monthly_sales_target=b_data["target"]
            )
            db.add(branch)
            db.flush()  # populate ID
            branch_map[b_data["code"]] = branch
            print(f"Created branch: {b_data['name']}")

        print("Seeding users...")
        for m_data in MANAGERS_TO_SEED:
            branch = branch_map[m_data["code"]]
            mgr = User(
                email=m_data["email"].lower(),
                password_hash=get_password_hash("manager123"),
                full_name=m_data["name"],
                role="MANAGER",
                branch_id=branch.id
            )
            db.add(mgr)
            print(f"Created Manager account for {m_data['code']} ({m_data['email']} / manager123)")

        db.commit()
        print("Database seeding completed successfully!")
    except Exception as e:
        db.rollback()
        print(f"Database seeding failed: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
