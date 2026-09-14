"""keep bookings (anonymised) when a user deletes their account

In-app account deletion (App Store Review 5.1.1(v)) removes the Supabase auth
user, which cascades to public.users. Before this revision that cascade also
deleted the user's bookings — financial records the privacy policy says we
retain — and huddle_members' plain FK blocked the delete outright for anyone
who had ever joined a huddle.

Now both references are ON DELETE SET NULL, and bookings.user_id is nullable:
the booking survives with no link to the person. DELETE /users/me also unlinks
explicitly before deleting, so a database without this revision fails on the
NOT NULL constraint instead of silently cascading bookings away.

Downgrade restores NOT NULL, which fails if any anonymised booking exists —
deliberately: there is no correct user to put back.

Revision ID: a3c6e1f09b27
Revises: f7a2c418d9b6
Create Date: 2026-09-14

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a3c6e1f09b27'
down_revision: Union[str, Sequence[str], None] = 'f7a2c418d9b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("bookings", "user_id", nullable=True)
    op.drop_constraint("bookings_user_id_fkey", "bookings", type_="foreignkey")
    op.create_foreign_key(
        "bookings_user_id_fkey", "bookings", "users", ["user_id"], ["id"], ondelete="SET NULL",
    )
    op.drop_constraint("huddle_members_user_id_fkey", "huddle_members", type_="foreignkey")
    op.create_foreign_key(
        "huddle_members_user_id_fkey", "huddle_members", "users", ["user_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("huddle_members_user_id_fkey", "huddle_members", type_="foreignkey")
    op.create_foreign_key("huddle_members_user_id_fkey", "huddle_members", "users", ["user_id"], ["id"])
    op.drop_constraint("bookings_user_id_fkey", "bookings", type_="foreignkey")
    op.create_foreign_key(
        "bookings_user_id_fkey", "bookings", "users", ["user_id"], ["id"], ondelete="CASCADE",
    )
    op.alter_column("bookings", "user_id", nullable=False)
