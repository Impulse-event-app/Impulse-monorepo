"""add_accessibility_fields

Adds users.accessibility_needs and venues.accessibility_features (text[]).

Revision ID: c8d2f3a5b1e7
Revises: b7c1e2f4a9d3
Create Date: 2026-07-25 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c8d2f3a5b1e7'
down_revision: Union[str, Sequence[str], None] = 'b7c1e2f4a9d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # IF NOT EXISTS because schema.sql is applied to the database by hand
    # (supabase/migrations/…_remote_schema.sql is empty), so these columns can
    # already be present without alembic having recorded this revision. Same
    # resulting schema either way; this just lets `alembic upgrade` run through
    # a database that was set up out of band.
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
        "accessibility_needs TEXT[] NOT NULL DEFAULT '{}'"
    )
    op.execute(
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS "
        "accessibility_features TEXT[] NOT NULL DEFAULT '{}'"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE venues DROP COLUMN IF EXISTS accessibility_features")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS accessibility_needs")
