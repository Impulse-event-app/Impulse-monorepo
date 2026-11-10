"""Set up the schema on a brand-new, empty Supabase database.

Alembic's history starts on top of a database that already had its tables, so
`alembic upgrade head` alone fails on a fresh project. This script:

  1. refuses unless the public schema has no tables (it never touches data),
  2. applies db/baseline.sql (the schema as of revision BASELINE_REVISION),
  3. stamps Alembic at BASELINE_REVISION,
  4. runs `alembic upgrade head` for anything newer.

Use it once per new environment (the production project, a fresh staging
project, or a local Postgres). After that, deploys run `alembic upgrade head`.
From backend/:

    DATABASE_URL=postgresql+psycopg://... uv run python scripts/bootstrap_db.py
"""
import os
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

BACKEND = Path(__file__).resolve().parent.parent
BASELINE_SQL = BACKEND / "db" / "baseline.sql"
BASELINE_REVISION = "b3f6a2d8e914"


def main() -> None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("Set DATABASE_URL to the new database first.")
    engine = create_engine(url)
    print(f"Database: {engine.url.host}/{engine.url.database}")

    tables = inspect(engine).get_table_names(schema="public")
    if tables:
        sys.exit(f"Refusing: public already has {len(tables)} tables ({', '.join(sorted(tables)[:5])}…). "
                 "This script is only for an empty database; use `alembic upgrade head` instead.")

    # One transaction: a failure part-way leaves the database empty again.
    with engine.begin() as conn:
        conn.exec_driver_sql(BASELINE_SQL.read_text())
    print(f"Applied {BASELINE_SQL.relative_to(BACKEND)}")

    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "migrations"))
    command.stamp(cfg, BASELINE_REVISION)
    command.upgrade(cfg, "head")
    print("Done: schema is at Alembic head.")


if __name__ == "__main__":
    main()
