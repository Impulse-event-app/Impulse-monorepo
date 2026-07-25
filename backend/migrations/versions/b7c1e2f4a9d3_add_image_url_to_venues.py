"""add_image_url_to_venues

Revision ID: b7c1e2f4a9d3
Revises: d81f3ca66e42
Create Date: 2026-07-25 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c1e2f4a9d3'
down_revision: Union[str, Sequence[str], None] = 'd81f3ca66e42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('venues', sa.Column('image_url', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('venues', 'image_url')
