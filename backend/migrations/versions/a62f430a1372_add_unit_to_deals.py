"""add_unit_to_deals

Revision ID: a62f430a1372
Revises: 
Create Date: 2026-06-30 15:56:26.315380

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a62f430a1372'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('deals', sa.Column('unit', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('deals', 'unit')
