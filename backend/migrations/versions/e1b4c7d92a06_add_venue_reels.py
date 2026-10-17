"""add venue_reels (Discover feed)

Short vertical videos advertising a venue. Read only through the backend
(GET /reels); RLS is on with no policies, so the Supabase anon and
authenticated roles can't touch it directly.

Revision ID: e1b4c7d92a06
Revises: c5e2a8f1d403
Create Date: 2026-10-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e1b4c7d92a06'
down_revision: Union[str, Sequence[str], None] = 'c5e2a8f1d403'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'venue_reels',
        sa.Column('id', postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('venue_id', postgresql.UUID(as_uuid=False),
                  sa.ForeignKey('venues.id', ondelete='CASCADE'), nullable=False),
        sa.Column('video_url', sa.Text(), nullable=False),
        sa.Column('poster_url', sa.Text(), nullable=True),
        sa.Column('caption', sa.Text(), nullable=True),
        sa.Column('source_url', sa.Text(), nullable=True),
        sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_venue_reels_venue_id', 'venue_reels', ['venue_id'])
    op.execute("alter table venue_reels enable row level security")


def downgrade() -> None:
    op.drop_index('ix_venue_reels_venue_id', table_name='venue_reels')
    op.drop_table('venue_reels')
