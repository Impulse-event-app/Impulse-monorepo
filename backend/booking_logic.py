"""
Pure booking logic: Borda resolution, share math, split validation, deal
cutoffs. Shared by every booking — solo, direct split and Huddle (a booking
with a voting stage). No DB, no I/O — unit tested in tests/test_booking_logic.py.
"""
from datetime import datetime, timedelta, timezone
from typing import Collection, Dict, List, Mapping, Optional, Sequence, Tuple
from zoneinfo import ZoneInfo

BORDA_POINTS = (3, 2, 1)   # 1st, 2nd, 3rd pick
# Deals store their date/slots as local display text ("Saturday 3 October
# 2026", "7:00 PM"). Every venue is in Sydney today; a per-venue zone would
# replace this constant.
VENUE_TZ = ZoneInfo("Australia/Sydney")
DEPOSIT_RATE = 0.20
DEPOSIT_FLOOR_CENTS = 100


def resolve_borda(
    ballots: Sequence[Sequence[str]],
    deal_cutoffs: Dict[str, Optional[datetime]],
) -> Optional[str]:
    """Winner by Borda count (3/2/1). Tiebreaks, in order:
    most first-place votes, then soonest-expiring deal (None expiry sorts
    last), then lexicographic deal id for total determinism.
    Only deals present in deal_cutoffs are eligible; stray picks are ignored.
    Returns None when no ballot names an eligible deal."""
    points: Dict[str, int] = {}
    firsts: Dict[str, int] = {}
    for ballot in ballots:
        eligible_rank = 0
        for pick in ballot:
            if pick not in deal_cutoffs or eligible_rank >= len(BORDA_POINTS):
                continue
            points[pick] = points.get(pick, 0) + BORDA_POINTS[eligible_rank]
            if eligible_rank == 0:
                firsts[pick] = firsts.get(pick, 0) + 1
            eligible_rank += 1

    if not points:
        return None

    far_future = datetime.max
    def sort_key(deal_id: str) -> Tuple:
        cutoff = deal_cutoffs.get(deal_id)
        return (
            -points[deal_id],
            -firsts.get(deal_id, 0),
            cutoff.replace(tzinfo=None) if cutoff else far_future,
            deal_id,
        )

    return min(points, key=sort_key)


class SplitError(ValueError):
    """A split the server refuses. The message is shown to the initiator as-is."""


def fmt_cents(cents: int) -> str:
    return f"${cents / 100:,.2f}"


def deposit_split(share_cents: int) -> Tuple[int, int]:
    """The one deposit rule: max(round(share * 0.20), 100), clamped to the
    share so a sub-$1 share can't produce a negative balance. Returns
    (deposit, balance)."""
    deposit = min(max(round(share_cents * DEPOSIT_RATE), DEPOSIT_FLOOR_CENTS), share_cents)
    return deposit, share_cents - deposit


def compute_shares(total_cents: int, n: int) -> List[dict]:
    """Split a group total into n member shares. Index 0 is the creator, who
    absorbs the rounding remainder so the shares always sum to the total.
    Each share: deposit = max(round(share * 0.20), 100) clamped to the share;
    balance = share - deposit."""
    if n < 1:
        raise ValueError("n must be >= 1")
    base = total_cents // n
    remainder = total_cents - base * n
    shares = []
    for i in range(n):
        share = base + (remainder if i == 0 else 0)
        deposit, balance = deposit_split(share)
        shares.append({
            "total_cents": share,
            "deposit_cents": deposit,
            "balance_cents": balance,
        })
    return shares


def validate_custom(amounts: Sequence[int], total_cents: int) -> None:
    """Custom amounts must be whole, non-negative cents summing exactly to the
    locked total. Never adjusted to fit — a mismatch is rejected."""
    if any(a < 0 for a in amounts):
        raise SplitError("Amounts can't be negative")
    got = sum(amounts)
    if got != total_cents:
        diff = total_cents - got
        hint = f"{fmt_cents(diff)} still to assign" if diff > 0 else f"{fmt_cents(-diff)} too much"
        raise SplitError(f"Shares add up to {fmt_cents(got)} — they need to total {fmt_cents(total_cents)} ({hint})")


def apply_cover(
    shares: Mapping[str, int],
    covered_by: Mapping[str, str],
    fixed: Collection[str],
    coverer: str,
    covered: str,
) -> Tuple[Dict[str, int], Dict[str, str]]:
    """`coverer` takes on `covered`'s share: the covered seat drops to 0 and
    owes nothing, the coverer's share grows by exactly that amount. `fixed`
    are seats whose amount can no longer change (already paid/guaranteed).
    Returns new (shares, covered_by)."""
    if coverer == covered:
        raise SplitError("You can't cover your own share")
    if coverer not in shares or covered not in shares:
        raise SplitError("That seat isn't part of this booking")
    if covered in fixed:
        raise SplitError("They've already paid their share")
    if coverer in fixed:
        raise SplitError("Your share is already paid, so it can't be increased")
    if covered in covered_by:
        raise SplitError("Someone is already covering their share")
    if coverer in covered_by:
        raise SplitError("Your own share is being covered, so you can't cover someone else")
    if any(c == covered for c in covered_by.values()):
        raise SplitError("They're covering someone else's share")
    new_shares = dict(shares)
    new_shares[coverer] += new_shares[covered]
    new_shares[covered] = 0
    return new_shares, {**covered_by, covered: coverer}


def recalc_unpaid(
    order: Sequence[str],
    shares: Mapping[str, int],
    covered_by: Mapping[str, str],
    fixed: Collection[str],
    total_cents: int,
) -> Dict[str, int]:
    """Re-split what's left of the total evenly across seats that haven't
    paid. Fixed (paid/guaranteed) seats keep their amount exactly. A covered
    seat's portion is folded into its coverer; if that coverer has paid, the
    covered seat stays at 0.

    `order` is share order (initiator first): the rounding remainder goes to
    the initiator when their seat is still open — the same rule as
    compute_shares — otherwise to the first open seat in order."""
    covered_by = {k: v for k, v in covered_by.items() if k in shares}
    fixed_total = sum(shares[s] for s in order if s in fixed)
    remaining = total_cents - fixed_total
    # Seats that take a slice: not paid, and not covered by someone who paid.
    open_units = [
        s for s in order
        if s not in fixed and not (s in covered_by and covered_by[s] in fixed)
    ]
    if remaining < 0:
        raise SplitError(
            f"Paid shares already come to {fmt_cents(fixed_total)}, more than the new total "
            f"of {fmt_cents(total_cents)} — that would mean refunding someone who's paid"
        )
    if not open_units:
        if remaining != 0:
            raise SplitError("Everyone has paid, so the split can't change")
        return {s: shares[s] for s in order}

    payers = [s for s in open_units if s not in covered_by]
    if not payers:
        raise SplitError("Nobody left to pay the remaining amount")
    base, remainder = divmod(remaining, len(open_units))
    new = {s: shares[s] for s in order if s in fixed}
    for s in order:
        if s in covered_by and covered_by[s] in fixed:
            new[s] = 0
    for s in open_units:
        new[s] = base
    new[payers[0]] += remainder          # payers[0] is the initiator whenever they're still open
    for covered, coverer in covered_by.items():
        if covered in open_units:
            new[coverer] += new[covered]
            new[covered] = 0
    return new


def parse_slot_datetime(date_text: str, slot_text: str) -> Optional[datetime]:
    """Parse the deals table's display strings, e.g.
    date='Friday 25 July 2026', slot='5:00 PM' → naive local datetime.
    Returns None when the text doesn't match the expected shapes."""
    for fmt in ("%A %d %B %Y %I:%M %p", "%d %B %Y %I:%M %p"):
        try:
            return datetime.strptime(f"{date_text} {slot_text}".strip(), fmt)
        except ValueError:
            continue
    return None


def slot_at(date_text: str, slot_text: str) -> Optional[datetime]:
    """The real instant a slot starts: the display text read in the venue's
    time zone, returned as aware UTC. None when the text doesn't parse."""
    naive = parse_slot_datetime(date_text, slot_text)
    if naive is None:
        return None
    return naive.replace(tzinfo=VENUE_TZ).astimezone(timezone.utc)


def deal_cutoff(
    expires_at: Optional[datetime],
    date_text: str,
    slots: Sequence[str],
) -> Optional[datetime]:
    """A deal's drop-dead time for booking deadlines: expires_at or the LAST
    slot minus 1h, whichever is sooner — as aware UTC. A naive expires_at is
    taken as UTC (how the database stores it). None when neither is known."""
    slot_times = [t for s in slots if (t := slot_at(date_text, s))]
    last_slot_cutoff = (max(slot_times) - timedelta(hours=1)) if slot_times else None

    candidates = []
    if expires_at is not None:
        candidates.append(expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc))
    if last_slot_cutoff is not None:
        candidates.append(last_slot_cutoff)
    return min(candidates) if candidates else None
