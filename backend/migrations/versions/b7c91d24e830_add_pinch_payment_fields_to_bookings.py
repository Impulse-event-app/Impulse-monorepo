"""add_pinch_payment_fields_to_bookings

Revision ID: b7c91d24e830
Revises: a62f430a1372
Create Date: 2026-07-25 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c91d24e830'
down_revision: Union[str, Sequence[str], None] = 'a62f430a1372'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bookings', sa.Column('deposit_amount_cents', sa.Integer(), nullable=True))
    op.add_column('bookings', sa.Column('balance_amount_cents', sa.Integer(), nullable=True))
    op.add_column('bookings', sa.Column('deposit_payment_id', sa.Text(), nullable=True))
    op.add_column('bookings', sa.Column('balance_payment_id', sa.Text(), nullable=True))
    op.add_column('bookings', sa.Column('pinch_payer_id', sa.Text(), nullable=True))
    op.add_column('bookings', sa.Column('pinch_source_id', sa.Text(), nullable=True))
    # payment_status values: unpaid | deposit_paid | fully_paid | cancelled
    op.add_column(
        'bookings',
        sa.Column('payment_status', sa.Text(), nullable=False, server_default='unpaid'),
    )
    # The webhook receiver looks bookings up by Pinch payment id.
    op.create_index('ix_bookings_deposit_payment_id', 'bookings', ['deposit_payment_id'])
    op.create_index('ix_bookings_balance_payment_id', 'bookings', ['balance_payment_id'])


def downgrade() -> None:
    op.drop_index('ix_bookings_balance_payment_id', table_name='bookings')
    op.drop_index('ix_bookings_deposit_payment_id', table_name='bookings')
    op.drop_column('bookings', 'payment_status')
    op.drop_column('bookings', 'pinch_source_id')
    op.drop_column('bookings', 'pinch_payer_id')
    op.drop_column('bookings', 'balance_payment_id')
    op.drop_column('bookings', 'deposit_payment_id')
    op.drop_column('bookings', 'balance_amount_cents')
    op.drop_column('bookings', 'deposit_amount_cents')
