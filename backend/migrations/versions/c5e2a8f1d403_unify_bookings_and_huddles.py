"""unify bookings and huddles into one booking model

A Huddle becomes a booking with has_voting = true. Every booking — solo,
direct split, Huddle — now has participants (one row per seat) that carry the
share and the payment state; the booking carries the locked price and the
split. Solo bookings are simply bookings with one participant.

Data:
- Each existing booking gets one participant holding its Pinch fields.
- Unpaid solo checkouts are closed and their held spots returned (spots are
  now taken when the initiator pays, not at creation).
- Each huddle is copied into bookings with id = huddle.id (deep links and
  push `huddleId` payloads keep working); huddle_members are copied into
  booking_participants with the same ids.
- Aborts if a non-terminal huddle still has a guest seat (accounts are now
  required everywhere) — there is no user to attach it to.
- huddles / huddle_members are renamed to _legacy_* for one release, not dropped.

Status vocabulary (text, replacing the booking_status enum):
  voting | collecting | confirmed | redeemed | cancelled | expired | collapsed
  pending→collecting, attended→redeemed; open→voting,
  awaiting_payment→collecting, active→confirmed.

Realtime: bookings is already published; booking_participants is NOT, so
sealed ballots can never leak through a realtime payload. Members get a
read policy on bookings so the realtime poke reaches every participant.

Downgrade is not supported — restore from the pre-migration backup (the
_legacy_* tables still hold the huddle data).

Revision ID: c5e2a8f1d403
Revises: a3c6e1f09b27
Create Date: 2026-09-26

"""
import secrets
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from booking_logic import compute_shares

# revision identifiers, used by Alembic.
revision: str = 'c5e2a8f1d403'
down_revision: Union[str, Sequence[str], None] = 'a3c6e1f09b27'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_HUDDLE_STATUS = {
    "open": "voting",
    "voting_complete": "voting",
    "awaiting_payment": "collecting",
    "active": "confirmed",
    "redeemed": "redeemed",
    "expired": "expired",
    "collapsed": "collapsed",
    "cancelled": "cancelled",
}


def upgrade() -> None:
    bind = op.get_bind()

    guests = bind.execute(sa.text("""
        select count(*) from huddle_members m join huddles h on h.id = m.huddle_id
        where m.user_id is null and h.status in ('open', 'voting_complete', 'awaiting_payment', 'active')
    """)).scalar()
    if guests:
        raise RuntimeError(
            f"{guests} guest seat(s) in live huddles — accounts are now required. "
            "Let those huddles finish or cancel them, then re-run."
        )

    # ── booking_participants ─────────────────────────────────────────────────
    op.create_table(
        'booking_participants',
        sa.Column('id', postgresql.UUID(), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('booking_id', postgresql.UUID(), sa.ForeignKey('bookings.id'), nullable=False, index=True),
        sa.Column('user_id', postgresql.UUID(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('display_name', sa.Text(), nullable=True),
        sa.Column('seat_token', sa.Text(), nullable=True, unique=True),
        sa.Column('seat_label', sa.Text(), nullable=True),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('claimed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ballot', postgresql.JSONB(), nullable=True),
        sa.Column('ballot_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('share_amount_cents', sa.Integer(), nullable=True),
        sa.Column('deposit_cents', sa.Integer(), nullable=True),
        sa.Column('balance_cents', sa.Integer(), nullable=True),
        sa.Column('covered_by_member_id', postgresql.UUID(),
                  sa.ForeignKey('booking_participants.id'), nullable=True),
        sa.Column('pinch_payer_id', sa.Text(), nullable=True),
        sa.Column('pinch_source_id', sa.Text(), nullable=True),
        sa.Column('deposit_payment_id', sa.Text(), nullable=True, index=True),
        # unpaid | paid | guaranteed | settled | refunded | declined
        sa.Column('deposit_status', sa.Text(), nullable=False, server_default='unpaid'),
        sa.Column('deposit_attempt', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('balance_payment_id', sa.Text(), nullable=True, index=True),
        sa.Column('balance_status', sa.Text(), nullable=False, server_default='unpaid'),
        sa.Column('payment_note', sa.Text(), nullable=True),
        sa.Column('payment_followup', sa.Boolean(), nullable=False, server_default='false'),
    )
    # A signed-in user holds at most one seat per booking.
    op.create_index(
        'uq_booking_participants_booking_user', 'booking_participants', ['booking_id', 'user_id'],
        unique=True, postgresql_where=sa.text('user_id IS NOT NULL'),
    )

    # ── bookings: split + voting columns ─────────────────────────────────────
    op.add_column('bookings', sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False))
    op.add_column('bookings', sa.Column('has_voting', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('bookings', sa.Column('split_mode', sa.Text(), nullable=False, server_default='even'))
    op.add_column('bookings', sa.Column('locked_unit_price_cents', sa.Integer(), nullable=True))
    op.add_column('bookings', sa.Column('locked_price_cents', sa.Integer(), nullable=True))
    op.add_column('bookings', sa.Column('initiator_member_id', postgresql.UUID(), nullable=True))
    op.add_column('bookings', sa.Column('share_deadline', sa.DateTime(timezone=True), nullable=True))
    op.add_column('bookings', sa.Column('split_confirmed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('bookings', sa.Column('spots_held', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('bookings', sa.Column('join_token', sa.Text(), nullable=True, unique=True))
    op.add_column('bookings', sa.Column('voting_deadline', sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        'fk_bookings_initiator_member', 'bookings', 'booking_participants',
        ['initiator_member_id'], ['id'], use_alter=True,
    )
    op.alter_column('bookings', 'deal_id', nullable=True)
    op.alter_column('bookings', 'slot_time', nullable=True)

    # Enum → text, mapped onto the shared vocabulary.
    op.execute("alter table bookings alter column status drop default")
    op.execute("""
        alter table bookings alter column status type text using (
            case status::text
                when 'pending' then 'collecting'
                when 'attended' then 'redeemed'
                else status::text
            end
        )
    """)
    op.execute("alter table bookings alter column status set default 'collecting'")
    op.execute("drop type if exists booking_status")

    # ── existing bookings → one participant each ─────────────────────────────
    op.execute("""
        insert into booking_participants (
            id, booking_id, user_id, display_name, joined_at, claimed_at,
            share_amount_cents, deposit_cents, balance_cents,
            pinch_payer_id, pinch_source_id, deposit_payment_id, deposit_status,
            balance_payment_id, balance_status, payment_note, payment_followup
        )
        select
            gen_random_uuid(), b.id, b.user_id, u.full_name, b.created_at, b.created_at,
            coalesce(b.deposit_amount_cents, 0) + coalesce(b.balance_amount_cents, 0),
            b.deposit_amount_cents, b.balance_amount_cents,
            b.pinch_payer_id, b.pinch_source_id, b.deposit_payment_id,
            case when b.deposit_payment_id is not null then 'paid' else 'unpaid' end,
            b.balance_payment_id,
            case when b.payment_status = 'fully_paid' then 'paid'
                 when b.payment_followup then 'declined'
                 else 'unpaid' end,
            b.payment_note, b.payment_followup
        from bookings b left join users u on u.id = b.user_id
    """)
    op.execute("""
        update bookings b set
            initiator_member_id = p.id,
            locked_price_cents = p.share_amount_cents,
            locked_unit_price_cents = p.share_amount_cents / greatest(b.num_people, 1),
            split_confirmed_at = b.created_at,
            -- solo bookings took their spots at creation; cancel gave them back
            spots_held = b.status <> 'cancelled'
        from booking_participants p where p.booking_id = b.id
    """)

    # Abandoned unpaid solo checkouts held their spots at creation under the
    # old flow; spots are now taken when the initiator pays, so give them back
    # and close the attempt (a retry simply starts a fresh booking).
    op.execute("""
        update deals d set spots_remaining = least(d.spots_remaining + held.n, d.total_spots)
        from (
            select b.deal_id, sum(b.num_people) n from bookings b
            join booking_participants p on p.id = b.initiator_member_id
            where b.status = 'collecting' and p.deposit_status = 'unpaid'
            group by b.deal_id
        ) held where held.deal_id = d.id
    """)
    op.execute("""
        update bookings b set status = 'cancelled', spots_held = false
        from booking_participants p
        where p.id = b.initiator_member_id and b.status = 'collecting' and p.deposit_status = 'unpaid'
    """)

    # ── huddles → bookings (same ids) ────────────────────────────────────────
    huddles = bind.execute(sa.text("""
        select h.*, d.deal_price, d.slots from huddles h left join deals d on d.id = h.winning_deal_id
    """)).mappings().all()
    for h in huddles:
        members = bind.execute(sa.text("""
            select m.* from huddle_members m where m.huddle_id = :hid
            order by (m.id = :creator) desc, m.joined_at, m.id
        """), {"hid": h["id"], "creator": h["creator_member_id"]}).mappings().all()
        creator = next((m for m in members if m["id"] == h["creator_member_id"]), None)
        unit = int(round(float(h["deal_price"]) * 100)) if h["deal_price"] is not None else None
        total = unit * h["group_size"] if unit is not None else None
        shares = compute_shares(total, h["group_size"]) if total is not None else []
        slots = h["slots"] or []
        bind.execute(sa.text("""
            insert into bookings (
                id, deal_id, user_id, slot_time, num_people, total_paid, confirmation_code,
                status, created_at, updated_at, has_voting, split_mode,
                locked_unit_price_cents, locked_price_cents, share_deadline,
                split_confirmed_at, spots_held, join_token, voting_deadline
            ) values (
                :id, :deal_id, :user_id, :slot_time, :n, :total_paid, :code,
                :status, :created_at, :updated_at, true, 'even',
                :unit, :total, :share_deadline,
                :split_confirmed_at, false, :join_token, :voting_deadline
            )
        """), {
            "id": h["id"], "deal_id": h["winning_deal_id"],
            "user_id": creator["user_id"] if creator else None,
            "slot_time": slots[0] if slots else None,
            "n": h["group_size"], "total_paid": (total or 0) / 100,
            "code": h["common_code"], "status": _HUDDLE_STATUS.get(h["status"], h["status"]),
            "created_at": h["created_at"], "updated_at": h["updated_at"],
            "unit": unit, "total": total, "share_deadline": h["payment_deadline"],
            "split_confirmed_at": h["updated_at"] if h["winning_deal_id"] else None,
            "join_token": h["join_token"], "voting_deadline": h["voting_deadline"],
        })
        for i, m in enumerate(members):
            share = shares[i] if i < len(shares) else None
            bind.execute(sa.text("""
                insert into booking_participants (
                    id, booking_id, user_id, display_name, joined_at, claimed_at, ballot, ballot_at,
                    share_amount_cents, deposit_cents, balance_cents,
                    pinch_payer_id, pinch_source_id, deposit_payment_id, deposit_status,
                    balance_payment_id, balance_status, seat_token
                ) values (
                    :id, :bid, :user_id, :name, :joined_at, :joined_at, :ballot, :ballot_at,
                    :share, :deposit, :balance,
                    :payer, :source, :dep_pmt, :dep_status,
                    :bal_pmt, :bal_status, :seat_token
                )
            """).bindparams(sa.bindparam("ballot", type_=postgresql.JSONB)), {
                "id": m["id"], "bid": h["id"], "user_id": m["user_id"], "name": m["display_name"],
                "joined_at": m["joined_at"], "ballot": m["ballot"], "ballot_at": m["ballot_at"],
                "share": share["total_cents"] if share else None,
                "deposit": share["deposit_cents"] if share else None,
                "balance": share["balance_cents"] if share else None,
                "payer": m["pinch_payer_id"], "source": m["pinch_source_id"],
                "dep_pmt": m["deposit_payment_id"], "dep_status": m["deposit_status"],
                "bal_pmt": m["balance_payment_id"], "bal_status": m["balance_status"],
                "seat_token": secrets.token_urlsafe(16),
            })
        bind.execute(sa.text("update bookings set initiator_member_id = :c where id = :id"),
                     {"c": h["creator_member_id"], "id": h["id"]})

    # ── Constraints ──────────────────────────────────────────────────────────
    op.create_check_constraint('ck_bookings_deal_unless_voting', 'bookings', 'has_voting OR deal_id IS NOT NULL')

    # ── Booking-level payment fields now live on participants ────────────────
    for col in ('deposit_amount_cents', 'balance_amount_cents', 'deposit_payment_id', 'balance_payment_id',
                'pinch_payer_id', 'pinch_source_id', 'payment_status', 'payment_note', 'payment_followup'):
        op.execute(f"alter table bookings drop column if exists {col}")

    # ── Retire the huddle tables (kept one release as _legacy_*) ─────────────
    op.execute("""
        do $$ begin
            if exists (select 1 from pg_publication_tables
                       where pubname = 'supabase_realtime' and tablename = 'huddles') then
                alter publication supabase_realtime drop table public.huddles;
            end if;
        end $$;
    """)
    op.rename_table('huddles', '_legacy_huddles')
    op.rename_table('huddle_members', '_legacy_huddle_members')

    # ── RLS (backend connects as table owner and bypasses; these govern the
    #    supabase 'authenticated' role, used for realtime delivery) ───────────
    op.execute("alter table booking_participants enable row level security")
    op.execute("""
        create policy "booking_participants: read own seat"
          on booking_participants for select
          using (auth.uid() = user_id)
    """)
    op.execute("""
        create policy "bookings: participants read"
          on bookings for select
          using (id in (select booking_id from booking_participants where user_id = auth.uid()))
    """)


def downgrade() -> None:
    raise RuntimeError(
        "c5e2a8f1d403 is not reversible in place — restore from the pre-migration backup "
        "(huddle data is also still in _legacy_huddles / _legacy_huddle_members)."
    )
