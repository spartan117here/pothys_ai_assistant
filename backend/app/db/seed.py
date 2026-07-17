import uuid
from sqlalchemy.orm import Session
from app.db.session import SessionLocal, sync_engine
from app.db.base import Base
from app.models.branch import Branch
from app.models.user import User
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

def seed_database():
    print("Initializing database tables...")
    # This automatically registers tables in the database if not using alembic (e.g. SQLite/rapid local dev)
    # For production pgvector, pgvector extension MUST exist. Let's make sure it gets created first.
    with sync_engine.connect() as conn:
        from sqlalchemy import text
        try:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            conn.commit()
            print("pgvector extension verified/created.")
        except Exception as e:
            print(f"Warning: Could not create pgvector extension directly (might be missing permissions or using SQLite): {e}")

    Base.metadata.create_all(bind=sync_engine)

    db: Session = SessionLocal()
    try:
        print("Seeding branches...")
        branch_map = {}
        for b_data in BRANCHES_TO_SEED:
            existing_branch = db.query(Branch).filter(Branch.code == b_data["code"]).first()
            if not existing_branch:
                branch = Branch(
                    name=b_data["name"],
                    code=b_data["code"],
                    monthly_sales_target=b_data["target"]
                )
                db.add(branch)
                db.flush()  # populate ID
                branch_map[b_data["code"]] = branch
                print(f"Created branch: {b_data['name']}")
            else:
                branch_map[b_data["code"]] = existing_branch
                print(f"Branch {b_data['name']} already exists.")

        print("Seeding users...")

        # Branch Manager Accounts
        for code, branch in branch_map.items():
            email = f"manager.{code.lower()}@pothys.com"
            existing_mgr = db.query(User).filter(User.email == email).first()
            if not existing_mgr:
                mgr = User(
                    email=email,
                    password_hash=get_password_hash("managerPassword123"),
                    full_name=f"Manager - {branch.name.split(' ')[0]}",
                    role="MANAGER",
                    branch_id=branch.id
                )
                db.add(mgr)
                print(f"Created Manager account for {code} ({email} / managerPassword123)")
            else:
                print(f"Manager account for {code} already exists.")

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
