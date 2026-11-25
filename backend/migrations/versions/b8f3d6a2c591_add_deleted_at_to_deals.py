"""add deleted_at to deals

A deal with bookings can't be removed outright: each booking keeps its deal
(CHECK has_voting OR deal_id IS NOT NULL) as the financial record. Deleting
such a deal from the venue portal now stamps deleted_at and switches it off,
so it leaves the venue's list and the app but its bookings still resolve.

Revision ID: b8f3d6a2c591
Revises: c3d8e1a4b7f2
Create Date: 2026-11-25 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b8f3d6a2c591'
down_revision: Union[str, Sequence[str], None] = 'c3d8e1a4b7f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('deals', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('deals', 'deleted_at')
