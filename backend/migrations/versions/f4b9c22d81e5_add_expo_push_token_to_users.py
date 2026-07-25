"""add expo_push_token to users

Expo push token (ExponentPushToken[...]) registered by the mobile app when
notification permission is granted. Used for huddle resolution / code-active
pushes. Null for users who declined notifications and for web sessions.

Revision ID: f4b9c22d81e5
Revises: e93a7d15fb28
Create Date: 2026-07-25 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f4b9c22d81e5'
down_revision: Union[str, Sequence[str], None] = 'e93a7d15fb28'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('expo_push_token', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'expo_push_token')
