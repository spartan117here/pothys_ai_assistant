import socket
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings

def is_postgres_available() -> bool:
    if "postgresql" not in settings.DATABASE_URL:
        return False
    try:
        host = "localhost"
        port = 5432
        if "@" in settings.DATABASE_URL:
            netloc = settings.DATABASE_URL.split("@")[1].split("/")[0]
            if ":" in netloc:
                host, port_str = netloc.split(":")
                port = int(port_str)
            else:
                host = netloc
        s = socket.create_connection((host, port), timeout=1.0)
        s.close()
        return True
    except Exception:
        return False

# Dynamically decide DB URL and Sync URL based on Postgres accessibility
use_postgres = is_postgres_available()

db_url = settings.DATABASE_URL if (use_postgres or "postgresql" not in settings.DATABASE_URL) else "sqlite+aiosqlite:///./pothys_agm.db"
db_sync_url = settings.DATABASE_SYNC_URL if (use_postgres or "postgresql" not in settings.DATABASE_URL) else "sqlite:///./pothys_agm.db"

if not use_postgres and "postgresql" in settings.DATABASE_URL:
    print("WARNING: PostgreSQL is not reachable at configured address. Falling back to SQLite.")

# Connection pool configurations are set only for non-sqlite connections
async_kwargs = {"future": True, "echo": False}
if "sqlite" not in db_url:
    async_kwargs["pool_size"] = 20
    async_kwargs["max_overflow"] = 10

async_engine = create_async_engine(db_url, **async_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

sync_kwargs = {"echo": False}
if "sqlite" not in db_sync_url:
    sync_kwargs["pool_size"] = 5
    sync_kwargs["max_overflow"] = 10

sync_engine = create_engine(db_sync_url, **sync_kwargs)

SessionLocal = sessionmaker(
    bind=sync_engine,
    class_=Session,
    expire_on_commit=False,
)

# Dependency injection for API route handlers
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
