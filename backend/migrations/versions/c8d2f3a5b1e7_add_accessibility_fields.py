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
    op.add_column(
        'users',
        sa.Column(
            'accessibility_needs',
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default='{}',
        ),
    )
    op.add_column(
        'venues',
        sa.Column(
            'accessibility_features',
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default='{}',
        ),
    )


def downgrade() -> None:
    op.drop_column('venues', 'accessibility_features')
    op.drop_column('users', 'accessibility_needs')
