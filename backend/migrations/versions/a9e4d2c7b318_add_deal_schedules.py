"""add deal_schedules (weekly deals) + deals.deal_date / deals.schedule_id

A venue's weekly deal lives in deal_schedules; the in-app generator
(deal_schedules.generate_scheduled_deals) turns it into a normal deals row on
each evening it runs. The partial unique index allows one deal per schedule per
evening, so several processes can run the generator at once. RLS is on with no
policies: only the backend reads or writes schedules.

Revision ID: a9e4d2c7b318
Revises: b7d3e9a14c60
Create Date: 2026-10-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a9e4d2c7b318'
down_revision: Union[str, Sequence[str], None] = 'b7d3e9a14c60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'deal_schedules',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('venue_id', postgresql.UUID(as_uuid=False),
                  sa.ForeignKey('venues.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('category', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('unit', sa.Text(), nullable=True),
        sa.Column('original_price', sa.Numeric(10, 2), nullable=False),
        sa.Column('discount_pct', sa.Numeric(5, 2), nullable=False),
        sa.Column('slots', postgresql.JSONB(), nullable=False),
        sa.Column('weekdays', postgresql.ARRAY(sa.SmallInteger()), nullable=False),
        sa.Column('starts_on', sa.Date(), nullable=True),
        sa.Column('ends_on', sa.Date(), nullable=True),
        sa.Column('max_group_size', sa.Integer(), server_default='6', nullable=False),
        sa.Column('total_spots', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_deal_schedules_venue_id', 'deal_schedules', ['venue_id'])
    op.execute("alter table deal_schedules enable row level security")

    op.add_column('deals', sa.Column('deal_date', sa.Date(), nullable=True))
    op.add_column('deals', sa.Column(
        'schedule_id', postgresql.UUID(as_uuid=False),
        sa.ForeignKey('deal_schedules.id', ondelete='SET NULL'), nullable=True,
    ))
    op.create_index(
        'uq_deals_schedule_date', 'deals', ['schedule_id', 'deal_date'], unique=True,
        postgresql_where=sa.text('schedule_id is not null'),
    )


def downgrade() -> None:
    op.drop_index('uq_deals_schedule_date', table_name='deals')
    op.drop_column('deals', 'schedule_id')
    op.drop_column('deals', 'deal_date')
    op.drop_index('ix_deal_schedules_venue_id', table_name='deal_schedules')
    op.drop_table('deal_schedules')
