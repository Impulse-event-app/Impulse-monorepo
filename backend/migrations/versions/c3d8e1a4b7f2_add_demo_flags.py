"""add is_demo to venues and users

App Review demo mode. A demo venue (venues.is_demo) is only shown to demo
accounts (users.is_demo), and its bookings never touch Stripe: they get a
"demo_" placeholder instead of a payment intent. Real users never see a demo
venue, and a demo booking never takes money.

Revision ID: c3d8e1a4b7f2
Revises: f2a9c4e7d815
Create Date: 2026-11-24 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c3d8e1a4b7f2'
down_revision: Union[str, Sequence[str], None] = 'f2a9c4e7d815'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('venues', sa.Column('is_demo', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('users', sa.Column('is_demo', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column('users', 'is_demo')
    op.drop_column('venues', 'is_demo')
