"""add contact-match hashes to users

SHA-256 of a user's verified phone number and provider-verified email, so a
friend's app can find them from its address book (POST /users/match-contacts)
without the server ever receiving or storing anyone's contacts in the clear.
Null until the user has a verified phone or a Google/Apple email. Both
nullable, so the running code is unaffected.

Revision ID: f2a9c4e7d815
Revises: d4e7a1c9b250
Create Date: 2026-11-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f2a9c4e7d815'
down_revision: Union[str, Sequence[str], None] = 'd4e7a1c9b250'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('phone_hash', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('email_hash', sa.Text(), nullable=True))
    op.create_index('ix_users_phone_hash', 'users', ['phone_hash'])
    op.create_index('ix_users_email_hash', 'users', ['email_hash'])


def downgrade() -> None:
    op.drop_index('ix_users_email_hash', table_name='users')
    op.drop_index('ix_users_phone_hash', table_name='users')
    op.drop_column('users', 'email_hash')
    op.drop_column('users', 'phone_hash')
