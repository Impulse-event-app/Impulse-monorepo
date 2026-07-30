"""saved payment methods: user-level Pinch payer + vaulted cards

Also a merge point. The graph had two heads — c8d2f3a5b1e7 (accessibility) and
d4a7e91c3f28 (settlements) — which made `alembic upgrade head` ambiguous. This
revision joins them, the same way e93a7d15fb28 merged the earlier split.

Revision ID: e5c31a7f9042
Revises: c8d2f3a5b1e7, d4a7e91c3f28
Create Date: 2026-07-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'e5c31a7f9042'
down_revision: Union[str, Sequence[str], None] = ('c8d2f3a5b1e7', 'd4a7e91c3f28')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # One Pinch payer per user; cards hang off it as sources.
    op.add_column('users', sa.Column('pinch_payer_id', sa.Text(), nullable=True))

    op.create_table(
        'payment_methods',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column('user_id', sa.dialects.postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column('pinch_source_id', sa.Text(), nullable=False),
        sa.Column('card_scheme', sa.Text(), nullable=True),
        sa.Column('display_card_number', sa.Text(), nullable=True),
        sa.Column('expiry_date', sa.Text(), nullable=True),
        sa.Column('card_holder_name', sa.Text(), nullable=True),
        sa.Column('funding', sa.Text(), nullable=True),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('pinch_source_id', name='uq_payment_methods_pinch_source_id'),
    )
    op.create_index('ix_payment_methods_user_id', 'payment_methods', ['user_id'])

    # At most one default card per user — enforced in the DB so a partial
    # failure mid-update can't leave two rows flagged.
    op.create_index(
        'uq_payment_methods_one_default',
        'payment_methods',
        ['user_id'],
        unique=True,
        postgresql_where=sa.text('is_default'),
    )


def downgrade() -> None:
    op.drop_index('uq_payment_methods_one_default', table_name='payment_methods')
    op.drop_index('ix_payment_methods_user_id', table_name='payment_methods')
    op.drop_table('payment_methods')
    op.drop_column('users', 'pinch_payer_id')
