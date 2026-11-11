"""venues.video_shoot_requested_at: the complimentary video shoot is one per venue

Set when the venue ticks "get a complimentary video shot by the Impulse media
team" and the request email goes out; once set, the portal stops offering it.

Revision ID: d4e7a1c9b250
Revises: b3d6f8a2c415
Create Date: 2026-11-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e7a1c9b250'
down_revision: Union[str, Sequence[str], None] = 'b3d6f8a2c415'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('venues', sa.Column('video_shoot_requested_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('venues', 'video_shoot_requested_at')
