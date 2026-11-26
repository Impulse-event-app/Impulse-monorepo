"""add price_drops to deals and deal_schedules

Falling discounts (price_drops.py): the steps a deal's discount takes as each
time slot fills, e.g. [{"after": 5, "discount_pct": 25}]. Null is a flat deal,
which is every deal so far.

Revision ID: e5c1a7d3f904
Revises: b8f3d6a2c591
Create Date: 2026-11-26 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e5c1a7d3f904'
down_revision: Union[str, Sequence[str], None] = 'b8f3d6a2c591'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('deals', sa.Column('price_drops', postgresql.JSONB(), nullable=True))
    op.add_column('deal_schedules', sa.Column('price_drops', postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column('deal_schedules', 'price_drops')
    op.drop_column('deals', 'price_drops')
