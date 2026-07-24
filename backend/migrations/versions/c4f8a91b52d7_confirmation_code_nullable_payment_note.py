"""confirmation_code nullable + balance-outcome fields

The 6-digit code is now generated only after the Pinch deposit succeeds,
so bookings exist without a code until payment. payment_note carries the
customer-facing balance-charge outcome (in-app notification); payment_followup
flags bookings whose balance charge declined at redemption.

Revision ID: c4f8a91b52d7
Revises: b7c91d24e830
Create Date: 2026-07-25 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4f8a91b52d7'
down_revision: Union[str, Sequence[str], None] = 'b7c91d24e830'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('bookings', 'confirmation_code', existing_type=sa.Text(), nullable=True)
    op.add_column('bookings', sa.Column('payment_note', sa.Text(), nullable=True))
    op.add_column(
        'bookings',
        sa.Column('payment_followup', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('bookings', 'payment_followup')
    op.drop_column('bookings', 'payment_note')
    op.alter_column('bookings', 'confirmation_code', existing_type=sa.Text(), nullable=False)
