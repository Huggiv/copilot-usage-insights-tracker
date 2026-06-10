import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

DB_PATH = os.getenv("DB_PATH", "/app/data/copilot_usage.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

# check_same_thread=False is required when using SQLite with FastAPI worker threads.
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
