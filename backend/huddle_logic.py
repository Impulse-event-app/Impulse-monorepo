"""
Pure huddle logic: Borda resolution, share math, deal cutoffs.
No DB, no I/O — unit tested in tests/test_huddle_logic.py.
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Sequence, Tuple

BORDA_POINTS = (3, 2, 1)   # 1st, 2nd, 3rd pick
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
        deposit = min(max(round(share * DEPOSIT_RATE), DEPOSIT_FLOOR_CENTS), share)
        shares.append({
            "total_cents": share,
            "deposit_cents": deposit,
            "balance_cents": share - deposit,
        })
    return shares


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


def deal_cutoff(
    expires_at: Optional[datetime],
    date_text: str,
    slots: Sequence[str],
) -> Optional[datetime]:
    """A deal's drop-dead time for huddle deadlines: expires_at or the LAST
    slot minus 1h, whichever is sooner. None when neither is known."""
    slot_times = [t for s in slots if (t := parse_slot_datetime(date_text, s))]
    last_slot_cutoff = (max(slot_times) - timedelta(hours=1)) if slot_times else None

    candidates = []
    if expires_at is not None:
        candidates.append(expires_at.replace(tzinfo=None) if expires_at.tzinfo else expires_at)
    if last_slot_cutoff is not None:
        candidates.append(last_slot_cutoff)
    return min(candidates) if candidates else None
