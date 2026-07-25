"""add huddles + huddle_members (group voting → shared booking)

Merge revision: joins the unapplied venues.image_url branch (b7c1e2f4a9d3)
with the mainline (d81f3ca66e42) so one `upgrade head` applies both.

Realtime: only `huddles` is added to the supabase_realtime publication —
member events bump huddles.updated_at, clients refetch the member list via
the API. huddle_members rows are never broadcast, so sealed ballots can't
leak through a realtime payload.

RLS: signed-in members may select their own huddles/membership rows (used by
realtime auth). Guests are served exclusively by the FastAPI backend, which
connects as the table owner and bypasses RLS.

Revision ID: e93a7d15fb28
Revises: b7c1e2f4a9d3, d81f3ca66e42
Create Date: 2026-07-25 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e93a7d15fb28'
down_revision: Union[str, Sequence[str], None] = ('b7c1e2f4a9d3', 'd81f3ca66e42')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'huddles',
        sa.Column('id', postgresql.UUID(), primary_key=True),
        # FK to huddle_members added below (use_alter — circular reference)
        sa.Column('creator_member_id', postgresql.UUID(), nullable=True),
        sa.Column('group_size', sa.Integer(), nullable=False),
        # open | voting_complete | awaiting_payment | active | expired | collapsed | redeemed
        sa.Column('status', sa.Text(), nullable=False, server_default='open'),
        sa.Column('join_token', sa.Text(), nullable=False, unique=True),
        sa.Column('winning_deal_id', postgresql.UUID(), sa.ForeignKey('deals.id'), nullable=True),
        sa.Column('common_code', sa.Text(), nullable=True, unique=True),
        sa.Column('voting_deadline', sa.DateTime(timezone=True), nullable=True),
        sa.Column('payment_deadline', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        # Bumped on every member join/vote/pay — the realtime poke channel.
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    op.create_table(
        'huddle_members',
        sa.Column('id', postgresql.UUID(), primary_key=True),
        sa.Column('huddle_id', postgresql.UUID(), sa.ForeignKey('huddles.id'), nullable=False, index=True),
        sa.Column('user_id', postgresql.UUID(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('display_name', sa.Text(), nullable=False),
        # Secret returned to the joining client; authenticates guests (no account)
        # on subsequent huddle calls. Signed-in members may use JWT instead.
        sa.Column('member_token', sa.Text(), nullable=False, unique=True),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        # Sealed until resolution: never exposed through any endpoint before then.
        sa.Column('ballot', postgresql.JSONB(), nullable=True),
        sa.Column('ballot_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('pinch_payer_id', sa.Text(), nullable=True),
        sa.Column('pinch_source_id', sa.Text(), nullable=True),
        sa.Column('deposit_payment_id', sa.Text(), nullable=True),
        sa.Column('deposit_status', sa.Text(), nullable=False, server_default='unpaid'),  # unpaid | paid | refunded
        sa.Column('balance_payment_id', sa.Text(), nullable=True),
        sa.Column('balance_status', sa.Text(), nullable=False, server_default='unpaid'),
    )
    # A signed-in user holds at most one seat per huddle (rejoin = same seat).
    op.create_index(
        'uq_huddle_members_huddle_user', 'huddle_members', ['huddle_id', 'user_id'],
        unique=True, postgresql_where=sa.text('user_id IS NOT NULL'),
    )
    op.create_foreign_key(
        'fk_huddles_creator_member', 'huddles', 'huddle_members',
        ['creator_member_id'], ['id'], use_alter=True,
    )

    # ── RLS (backend connects as table owner and bypasses; these govern the
    #    supabase 'authenticated' role, used only for realtime auth) ──────────
    op.execute("alter table huddles enable row level security")
    op.execute("alter table huddle_members enable row level security")
    op.execute("""
        create policy "huddle_members: read own seat"
          on huddle_members for select
          using (auth.uid() = user_id)
    """)
    op.execute("""
        create policy "huddles: members read"
          on huddles for select
          using (id in (select huddle_id from huddle_members where user_id = auth.uid()))
    """)

    # Realtime pokes: huddles only (see module docstring).
    op.execute("alter publication supabase_realtime add table public.huddles")


def downgrade() -> None:
    op.execute("alter publication supabase_realtime drop table public.huddles")
    op.drop_constraint('fk_huddles_creator_member', 'huddles', type_='foreignkey')
    op.drop_index('uq_huddle_members_huddle_user', table_name='huddle_members')
    op.drop_table('huddle_members')
    op.drop_table('huddles')
