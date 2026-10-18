"""add live_activity_tokens (iOS Live Activities for group bookings)

APNs push tokens for running Live Activities, written only through the
backend (PUT /bookings/{id}/live-activity-token); RLS is on with no
policies, so the Supabase anon and authenticated roles can't touch it.

Revision ID: b7d3e9a14c60
Revises: e1b4c7d92a06
Create Date: 2026-10-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b7d3e9a14c60'
down_revision: Union[str, Sequence[str], None] = 'e1b4c7d92a06'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'live_activity_tokens',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('booking_id', postgresql.UUID(as_uuid=False),
                  sa.ForeignKey('bookings.id', ondelete='CASCADE'), nullable=False),
        sa.Column('member_id', postgresql.UUID(as_uuid=False),
                  sa.ForeignKey('booking_participants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('push_token', sa.Text(), nullable=False, unique=True),
        sa.Column('environment', sa.Text(), server_default='production', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_live_activity_tokens_booking_id', 'live_activity_tokens', ['booking_id'])
    op.execute("alter table live_activity_tokens enable row level security")


def downgrade() -> None:
    op.drop_index('ix_live_activity_tokens_booking_id', table_name='live_activity_tokens')
    op.drop_table('live_activity_tokens')
