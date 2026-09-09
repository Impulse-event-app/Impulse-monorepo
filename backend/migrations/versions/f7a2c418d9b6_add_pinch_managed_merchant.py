"""pinch managed merchants: per-venue merchant accounts and compliance state

Every venue's card charge currently runs through one hardcoded merchant
(PINCH_TEST_MERCHANT_ID), so all money lands in a single account and the
per-venue split is done by hand afterwards. This adds the columns needed to
onboard a venue as its own Pinch managed merchant.

Deliberately additive and entirely nullable. A NULL pinch_merchant_id means
"not onboarded", which is every venue that exists today; those keep charging
through the hardcoded merchant exactly as before. Nothing in this revision
reroutes money — it records the account so a later, explicit cutover can.

merchant_documents holds metadata only. The documents themselves are identity
documents (drivers licences, passports, bank statements) which are streamed
straight through to Pinch and never persisted, so there is no path or blob
column here by design. There is no filename column either: filenames of ID
documents routinely contain the holder's name and licence number, so we store
a label we generate ourselves instead.

The full bank account number is likewise never given a column. It passes
through onboarding_draft between the bank step and submission, is stripped
from every API read, and is deleted once the merchant has been created.

Revision ID: f7a2c418d9b6
Revises: e5c31a7f9042
Create Date: 2026-09-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f7a2c418d9b6'
down_revision: Union[str, Sequence[str], None] = 'e5c31a7f9042'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Added in one batch so a partially-applied revision is not possible.
_VENUE_COLUMNS = [
    sa.Column("pinch_merchant_id", sa.Text(), nullable=True),
    sa.Column("pinch_compliance_status", sa.Text(), nullable=True),
    sa.Column("pinch_submission_status", sa.Text(), nullable=True),
    sa.Column("pinch_merchant_status", sa.Text(), nullable=True),
    sa.Column("pinch_compliance_notes", sa.Text(), nullable=True),
    sa.Column("pinch_compliance_updated_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("pinch_webhook_secret", sa.Text(), nullable=True),
    sa.Column("pinch_contacts", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column("abn", sa.Text(), nullable=True),
    sa.Column("afsl_held", sa.Boolean(), nullable=True),
    sa.Column("afsl_number", sa.Text(), nullable=True),
    sa.Column("austrac_registered", sa.Boolean(), nullable=True),
    sa.Column("bank_account_name", sa.Text(), nullable=True),
    sa.Column("bank_bsb", sa.Text(), nullable=True),
    sa.Column("bank_account_last3", sa.Text(), nullable=True),
    sa.Column("onboarding_draft", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
]


def upgrade() -> None:
    for column in _VENUE_COLUMNS:
        op.add_column("venues", column)

    # Partial, so the many venues that will never be onboarded can all sit at NULL
    # while a real mch_XXX can only ever be claimed by one venue.
    op.create_index(
        "ix_venues_pinch_merchant_id", "venues", ["pinch_merchant_id"],
        unique=True, postgresql_where=sa.text("pinch_merchant_id IS NOT NULL"),
    )

    op.create_table(
        "merchant_documents",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("venue_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("pinch_document_id", sa.Text(), nullable=False),
        sa.Column("document_type", sa.Text(), nullable=False),
        sa.Column("pinch_contact_id", sa.Text(), nullable=True),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("content_type", sa.Text(), nullable=True),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["venue_id"], ["venues.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_merchant_documents_venue_id", "merchant_documents", ["venue_id"])
    # Re-uploading is a normal correction path, but the same doc_XXX must not be
    # recorded twice — this makes an accidental double-POST a no-op rather than a
    # duplicate row in the venue's "what's outstanding" checklist.
    op.create_unique_constraint(
        "uq_merchant_documents_pinch_document_id", "merchant_documents", ["pinch_document_id"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_merchant_documents_pinch_document_id", "merchant_documents", type_="unique")
    op.drop_index("ix_merchant_documents_venue_id", table_name="merchant_documents")
    op.drop_table("merchant_documents")

    op.drop_index("ix_venues_pinch_merchant_id", table_name="venues")
    for column in reversed(_VENUE_COLUMNS):
        op.drop_column("venues", column.name)
