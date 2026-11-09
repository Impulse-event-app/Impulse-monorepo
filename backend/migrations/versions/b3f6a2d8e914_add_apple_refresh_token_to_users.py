"""add apple_refresh_token to users

Sign in with Apple refresh token, obtained by exchanging the authorization
code the app sends right after an Apple sign-in. Kept only so account deletion
can revoke the Apple grant (App Store Review 5.1.1(v)). Null for users who
signed in some other way, or before this column existed.

Revision ID: b3f6a2d8e914
Revises: c8f1a3e5d927
Create Date: 2026-11-05 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b3f6a2d8e914'
down_revision: Union[str, Sequence[str], None] = 'c8f1a3e5d927'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('apple_refresh_token', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'apple_refresh_token')
