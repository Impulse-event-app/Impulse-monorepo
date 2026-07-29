"""add waitlist

Pre-launch waitlist captured by the landing page. Anonymous signups — no auth,
no account, no FK into users. `referral_code` is the 8-char code we hand back to
the signup so they can recruit; `referred_by` stores whoever recruited *them*
(a raw code, deliberately NOT a foreign key — an unknown code is ignored
silently rather than rejected, per the spec).

`position` is denormalised: base rank by created_at ascending, minus
referral_count, floored at 1. It is recomputed only for the referrer on each
referred signup — everyone else's stored value is left alone.

NOTE ON PARENTAGE: the migration chain has two heads, c8d2f3a5b1e7
(add_accessibility_fields, never applied — its column was created by hand via
schema.sql) and f4b9c22d81e5 (applied; the DB is stamped here). This revision
parents onto f4b9c22d81e5 so the existing divergence is left exactly as it is.
Apply it explicitly — `alembic upgrade a1c7e94b3d20` — because `upgrade head`
still errors with multiple heads.

Revision ID: a1c7e94b3d20
Revises: f4b9c22d81e5
Create Date: 2026-07-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a1c7e94b3d20'
down_revision: Union[str, Sequence[str], None] = 'f4b9c22d81e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'waitlist',
        sa.Column('id', postgresql.UUID(as_uuid=False),
                  primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('email', sa.Text(), nullable=False),
        sa.Column('preferred_activity', sa.Text(), nullable=False),
        sa.Column('area', sa.Text(), nullable=False),
        sa.Column('referral_code', sa.Text(), nullable=False),
        sa.Column('referred_by', sa.Text(), nullable=True),
        sa.Column('referral_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('position', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.text('now()')),
        sa.UniqueConstraint('email', name='uq_waitlist_email'),
        sa.UniqueConstraint('referral_code', name='uq_waitlist_referral_code'),
    )
    # Email is matched case-insensitively on signup ("already on the list"), so
    # the lookup index has to be on the folded value, not the raw column.
    op.create_index('ix_waitlist_email_lower', 'waitlist',
                    [sa.text('lower(email)')], unique=True)
    # Base-rank counts scan by (created_at, id) — see _base_rank in the router.
    op.create_index('ix_waitlist_created_at', 'waitlist', ['created_at', 'id'])
    # Resolving ?ref=XXXX to the referrer on every signup and banner render.
    op.create_index('ix_waitlist_referred_by', 'waitlist', ['referred_by'])


def downgrade() -> None:
    op.drop_index('ix_waitlist_referred_by', table_name='waitlist')
    op.drop_index('ix_waitlist_created_at', table_name='waitlist')
    op.drop_index('ix_waitlist_email_lower', table_name='waitlist')
    op.drop_table('waitlist')
