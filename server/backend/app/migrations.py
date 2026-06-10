from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import NoSuchTableError


def _ensure_migrations_table(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )


def _is_applied(engine: Engine, version: int) -> bool:
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT 1 FROM schema_migrations WHERE version = :version LIMIT 1"),
            {"version": version},
        ).first()
    return row is not None


def _mark_applied(engine: Engine, version: int, name: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO schema_migrations(version, name) VALUES (:version, :name)"),
            {"version": version, "name": name},
        )


def _column_exists(engine: Engine, table_name: str, column_name: str) -> bool:
    inspector = inspect(engine)
    try:
        columns = inspector.get_columns(table_name)
    except NoSuchTableError:
        return False
    return any(column.get("name") == column_name for column in columns)


def apply_migrations(engine: Engine) -> None:
    """Apply explicit lightweight SQL migrations in-order.

    This keeps startup behavior deterministic for existing SQLite databases
    without introducing a full migration framework dependency.
    """
    _ensure_migrations_table(engine)

    migrations: list[tuple[int, str, list[str]]] = [
        (
            1,
            "add_patch_count_to_chat_sessions",
            [
                "ALTER TABLE chat_sessions ADD COLUMN patch_count INTEGER DEFAULT 0",
            ],
        ),
        (
            2,
            "add_session_id_to_model_usage",
            [
                "ALTER TABLE model_usage ADD COLUMN session_id VARCHAR(128)",
            ],
        ),
        (
            3,
            "add_query_indexes",
            [
                "CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_started_at ON chat_sessions(user_id, started_at)",
                "CREATE INDEX IF NOT EXISTS idx_model_usage_user_date_model ON model_usage(user_id, date, model)",
                "CREATE INDEX IF NOT EXISTS idx_model_usage_session_id ON model_usage(session_id)",
            ],
        ),
    ]

    for version, name, statements in migrations:
        if _is_applied(engine, version):
            continue

        # Handle pre-existing DBs where these columns were added manually before
        # the tracked migrations table existed.
        if version == 1 and _column_exists(engine, "chat_sessions", "patch_count"):
            _mark_applied(engine, version, name)
            continue
        if version == 2 and _column_exists(engine, "model_usage", "session_id"):
            _mark_applied(engine, version, name)
            continue

        with engine.begin() as conn:
            for statement in statements:
                conn.execute(text(statement))

        _mark_applied(engine, version, name)