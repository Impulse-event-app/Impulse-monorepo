import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

load_dotenv()

DATABASE_URL: str = os.environ["DATABASE_URL"]

# Name the schema in every query (public.deals), so a search_path some other
# client leaves on a shared Supabase pooler connection can't hide our tables.
# Done on the engine rather than the models so Alembic's autogenerate, which
# reflects tables without a schema, still sees no difference.
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    execution_options={"schema_translate_map": {None: "public"}},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    __allow_unmapped__ = True


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
