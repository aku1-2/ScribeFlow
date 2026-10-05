import logging
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

logger = logging.getLogger("scribeflow.database")


class Base(DeclarativeBase):
    pass


def create_resilient_engine():
    """Attempt connecting to the configured DATABASE_URL (PostgreSQL).

    If PostgreSQL is unreachable, fallback to SQLite for local development
    so the developer is not blocked, while logging clear setup instructions.
    """
    target_url = settings.database_url
    engine = None
    db_type = "unknown"

    if target_url.startswith("postgresql"):
        try:
            candidate = create_engine(
                target_url,
                pool_pre_ping=True,
                connect_args={"connect_timeout": 3},
            )
            with candidate.connect() as conn:
                conn.execute(text("SELECT 1"))
            engine = candidate
            db_type = "postgresql"
            logger.info("Connected successfully to PostgreSQL at %s", target_url.split("@")[-1])
        except (OperationalError, Exception) as e:
            logger.warning(
                "Could not connect to PostgreSQL (%s). Falling back to SQLite (sqlite:///./scribeflow.db) "
                "for prototype testing. Start PostgreSQL and restart the server to use PostgreSQL.",
                e,
            )
            engine = create_engine("sqlite:///./scribeflow.db", connect_args={"check_same_thread": False})
            db_type = "sqlite_fallback"
    else:
        engine = create_engine(target_url, connect_args={"check_same_thread": False} if "sqlite" in target_url else {})
        db_type = "sqlite"

    return engine, db_type


engine, db_engine_type = create_resilient_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db():
    """Create tables if they don't exist yet and ensure active-recall columns are present."""
    import app.models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        try:
            if db_engine_type == "postgresql":
                pg_cols = [
                    ("seq_num", "INTEGER DEFAULT 1"),
                    ("topic", "VARCHAR(150)"),
                    ("card_type", "VARCHAR(100) DEFAULT 'concept'"),
                    ("difficulty", "VARCHAR(50) DEFAULT 'Medium'"),
                    ("key_takeaway", "TEXT"),
                    ("source_reference", "TEXT"),
                    ("rich_data", "TEXT"),
                    ("rating", "INTEGER"),
                    ("review_count", "INTEGER DEFAULT 0"),
                    ("last_reviewed", "TIMESTAMP WITH TIME ZONE"),
                ]
                for col, col_def in pg_cols:
                    conn.execute(text(f"ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS {col} {col_def}"))
                conn.execute(text("ALTER TABLE study_sets ADD COLUMN IF NOT EXISTS user_id VARCHAR(64) NULL"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_study_sets_user_id ON study_sets(user_id)"))
                conn.commit()
            else:
                # SQLite fallback
                pragma = conn.execute(text("PRAGMA table_info(flashcards)")).fetchall()
                if pragma:
                    existing_cols = {row[1] for row in pragma}
                    columns_to_add = {
                        "seq_num": "INTEGER DEFAULT 1",
                        "topic": "VARCHAR(150)",
                        "card_type": "VARCHAR(100) DEFAULT 'concept'",
                        "difficulty": "VARCHAR(50) DEFAULT 'Medium'",
                        "key_takeaway": "TEXT",
                        "source_reference": "TEXT",
                        "rich_data": "TEXT",
                        "rating": "INTEGER",
                        "review_count": "INTEGER DEFAULT 0",
                        "last_reviewed": "TIMESTAMP",
                    }
                    for col, col_def in columns_to_add.items():
                        if col not in existing_cols:
                            conn.execute(text(f"ALTER TABLE flashcards ADD COLUMN {col} {col_def}"))
                    conn.commit()
                ss_pragma = conn.execute(text("PRAGMA table_info(study_sets)")).fetchall()
                if ss_pragma:
                    ss_cols = {row[1] for row in ss_pragma}
                    if "user_id" not in ss_cols:
                        conn.execute(text("ALTER TABLE study_sets ADD COLUMN user_id VARCHAR(64)"))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_study_sets_user_id ON study_sets(user_id)"))
                        conn.commit()
        except Exception as e:
            logger.warning("Database migration note: %s", e)


def get_db_status() -> dict[str, str]:
    return {
        "engine_type": db_engine_type,
        "configured_url": settings.database_url.split("@")[-1] if "@" in settings.database_url else settings.database_url,
    }


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
