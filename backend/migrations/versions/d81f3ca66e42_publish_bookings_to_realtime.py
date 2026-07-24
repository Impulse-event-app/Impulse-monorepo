"""publish bookings to supabase realtime

Adds the bookings table to the supabase_realtime publication so the mobile
app can subscribe to row updates (venue verifies code → customer's screen
flips to verified/charged live). RLS "bookings: user read own" already
restricts delivery to the booking owner.

Revision ID: d81f3ca66e42
Revises: c4f8a91b52d7
Create Date: 2026-07-25 13:30:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd81f3ca66e42'
down_revision: Union[str, Sequence[str], None] = 'c4f8a91b52d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        do $$ begin
            if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
                create publication supabase_realtime;
            end if;
        end $$;
    """)
    op.execute("alter publication supabase_realtime add table public.bookings")


def downgrade() -> None:
    op.execute("alter publication supabase_realtime drop table public.bookings")
