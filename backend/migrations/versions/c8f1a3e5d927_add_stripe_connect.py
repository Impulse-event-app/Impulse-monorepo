"""add Stripe Connect columns (Pinch → Stripe, hold at claim / capture at check-in)

Additive only. The Pinch columns and tables (users.pinch_payer_id,
booking_participants.pinch_*, venues.pinch_* and the onboarding fields,
merchant_documents, settlements, settlement_lines, payment_methods) are left
in place and dropped by a later cleanup migration once Stripe is live, so this
one can be applied and rolled back without losing anything.

IF NOT EXISTS throughout: schema.sql is applied by hand, so the live database
can be ahead of alembic_version.

Revision ID: c8f1a3e5d927
Revises: a9e4d2c7b318
Create Date: 2026-11-05

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'c8f1a3e5d927'
down_revision: Union[str, Sequence[str], None] = 'a9e4d2c7b318'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id text;
        CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_customer_id_key ON users (stripe_customer_id);

        ALTER TABLE venues ADD COLUMN IF NOT EXISTS stripe_account_id text;
        CREATE UNIQUE INDEX IF NOT EXISTS venues_stripe_account_id_key ON venues (stripe_account_id);
        ALTER TABLE venues ADD COLUMN IF NOT EXISTS stripe_transfers_status text;
        ALTER TABLE venues ADD COLUMN IF NOT EXISTS stripe_requirements jsonb;
        ALTER TABLE venues ADD COLUMN IF NOT EXISTS stripe_status_updated_at timestamptz;
        ALTER TABLE venues ADD COLUMN IF NOT EXISTS pilot_ends_at timestamptz;

        ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_payout_id text;
        ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payout_status text;

        ALTER TABLE booking_participants ADD COLUMN IF NOT EXISTS stripe_payment_method_id text;
        ALTER TABLE booking_participants ADD COLUMN IF NOT EXISTS hold_status text;
        ALTER TABLE booking_participants ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE booking_participants DROP COLUMN IF EXISTS hold_expires_at;
        ALTER TABLE booking_participants DROP COLUMN IF EXISTS hold_status;
        ALTER TABLE booking_participants DROP COLUMN IF EXISTS stripe_payment_method_id;
        ALTER TABLE bookings DROP COLUMN IF EXISTS payout_status;
        ALTER TABLE bookings DROP COLUMN IF EXISTS stripe_payout_id;
        ALTER TABLE venues DROP COLUMN IF EXISTS pilot_ends_at;
        ALTER TABLE venues DROP COLUMN IF EXISTS stripe_status_updated_at;
        ALTER TABLE venues DROP COLUMN IF EXISTS stripe_requirements;
        ALTER TABLE venues DROP COLUMN IF EXISTS stripe_transfers_status;
        DROP INDEX IF EXISTS venues_stripe_account_id_key;
        ALTER TABLE venues DROP COLUMN IF EXISTS stripe_account_id;
        DROP INDEX IF EXISTS users_stripe_customer_id_key;
        ALTER TABLE users DROP COLUMN IF EXISTS stripe_customer_id;
    """)
