"""settlements: record Pinch transfers so venues can see money actually land

A Pinch payment being "approved" only means the card worked. The venue-facing
question — "when did the money go in?" — is answered by a transfer, which is
Pinch sending funds to a bank account. This adds the two tables that mirror
GET /transfers/{id} and GET /transfers/items/{id}.

Two tables rather than one because a transfer is not venue-scoped today: every
charge currently runs through the single Impulse merchant, so one transfer
spans many venues and the per-venue split only exists at line level. When
venues become managed merchants a transfer maps to one venue and
settlements.venue_id is set — the lines keep working unchanged either way.

Amounts are integer cents throughout, matching Pinch and the existing
bookings.deposit_amount_cents / balance_amount_cents columns.

Revision ID: d4a7e91c3f28
Revises: b2d8f05c1e39
Create Date: 2026-07-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd4a7e91c3f28'
down_revision: Union[str, Sequence[str], None] = 'b2d8f05c1e39'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "settlements",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("pinch_transfer_id", sa.Text(), nullable=False),
        sa.Column("pinch_merchant_id", sa.Text(), nullable=True),
        sa.Column("venue_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("venues.id"), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="processing"),
        sa.Column("amount_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_fees_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("currency", sa.Text(), nullable=False, server_default="AUD"),
        sa.Column("reference", sa.Text(), nullable=True),
        sa.Column("account_name", sa.Text(), nullable=True),
        sa.Column("bsb", sa.Text(), nullable=True),
        sa.Column("account_number", sa.Text(), nullable=True),
        sa.Column("transfer_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    # Transfer webhooks can arrive more than once for the same transfer as its
    # status moves processing → complete; the unique key makes ingest an upsert.
    op.create_unique_constraint("uq_settlements_pinch_transfer_id", "settlements", ["pinch_transfer_id"])
    op.create_index("ix_settlements_venue_id", "settlements", ["venue_id"])

    op.create_table(
        "settlement_lines",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("settlement_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("settlements.id"), nullable=False),
        sa.Column("pinch_line_id", sa.Text(), nullable=True),
        sa.Column("pinch_payment_id", sa.Text(), nullable=True),
        sa.Column("booking_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("bookings.id"), nullable=True),
        sa.Column("venue_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("venues.id"), nullable=True),
        sa.Column("kind", sa.Text(), nullable=True),
        sa.Column("line_type", sa.Text(), nullable=True),
        sa.Column("gross_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fees_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("venue_amount_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("transaction_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_settlement_lines_settlement_id", "settlement_lines", ["settlement_id"])
    op.create_index("ix_settlement_lines_booking_id", "settlement_lines", ["booking_id"])
    op.create_index("ix_settlement_lines_venue_id", "settlement_lines", ["venue_id"])
    op.create_index("ix_settlement_lines_pinch_payment_id", "settlement_lines", ["pinch_payment_id"])


def downgrade() -> None:
    op.drop_index("ix_settlement_lines_pinch_payment_id", table_name="settlement_lines")
    op.drop_index("ix_settlement_lines_venue_id", table_name="settlement_lines")
    op.drop_index("ix_settlement_lines_booking_id", table_name="settlement_lines")
    op.drop_index("ix_settlement_lines_settlement_id", table_name="settlement_lines")
    op.drop_table("settlement_lines")
    op.drop_index("ix_settlements_venue_id", table_name="settlements")
    op.drop_constraint("uq_settlements_pinch_transfer_id", "settlements", type_="unique")
    op.drop_table("settlements")
