"""add standard offers (is_standard on deal_schedules and deals)

A venue's standard offer is a full-price deal_schedules row (is_standard),
bookable every day it's open; the generator turns it into a deals row
(is_standard) per day. At most one per venue. Both columns default false, so
the running code is unaffected.

Revision ID: c4d8e2f6a913
Revises: e5c1a7d3f904
Create Date: 2026-11-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c4d8e2f6a913'
down_revision: Union[str, Sequence[str], None] = 'e5c1a7d3f904'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('deal_schedules', sa.Column('is_standard', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('deals', sa.Column('is_standard', sa.Boolean(), server_default='false', nullable=False))
    op.create_index(
        'uq_deal_schedules_standard_venue', 'deal_schedules', ['venue_id'],
        unique=True, postgresql_where=sa.text('is_standard'),
    )


def downgrade() -> None:
    op.drop_index('uq_deal_schedules_standard_venue', table_name='deal_schedules')
    op.drop_column('deals', 'is_standard')
    op.drop_column('deal_schedules', 'is_standard')
