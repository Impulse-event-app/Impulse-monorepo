"""Reading a venue's opening hours text.

The venue form stores hours as "Mon: 11am–10pm, Tue: Closed, ..., Sun: 4pm–1am"
(or "Every day 4pm–midnight"). Shared by the standard-offer generator and the
history seeder.
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

Hours = Optional[Tuple[int, int]]  # (open, close) in minutes since midnight; None = closed


def clock(text: str) -> Optional[int]:
    """'11am' / '4:30pm' / 'midnight' → minutes since midnight."""
    t = text.strip().lower()
    if t == "midnight":
        return 24 * 60
    if t in ("noon", "midday"):
        return 12 * 60
    m = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)", t)
    if not m:
        return None
    h = int(m.group(1)) % 12 + (12 if m.group(3) == "pm" else 0)
    return h * 60 + int(m.group(2) or 0)


def week_hours(text: Optional[str], default: Hours = None) -> Dict[int, Hours]:
    """Hours text → {weekday (0 = Monday): (open, close) or None}. Days the text
    doesn't mention, or can't be read, get `default`. A close at or before the
    open (past midnight) is cut to midnight, so a day's slots stay on its date."""
    week: Dict[int, Hours] = {d: default for d in range(7)}
    for part in (text or "").split(","):
        m = re.match(r"\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Every day|Daily):?\s*(.+)$", part.strip())
        if not m:
            continue
        days = range(7) if m.group(1) in ("Every day", "Daily") else [DAY_NAMES.index(m.group(1))]
        rng = m.group(2).strip()
        if rng.lower() == "closed":
            for d in days:
                week[d] = None
            continue
        ends = [clock(x) for x in re.split(r"[–-]", rng)]
        if len(ends) == 2 and None not in ends:
            open_, close = ends
            if close <= open_:
                close = 24 * 60
            for d in days:
                week[d] = (open_, close)
    return week


def hourly_slots(hours: Hours, length: int = 60) -> List[str]:
    """Start times every `length` minutes from opening, the last one `length`
    before closing, as '5:00 PM'. Closed → []."""
    if not hours:
        return []
    open_, close = hours
    first = -(-open_ // 30) * 30  # an 11:15am opening starts at 11:30
    out = []
    t = first
    while t + length <= close:
        h, m = divmod(t, 60)
        out.append(f"{h % 12 or 12}:{m:02d} {'AM' if h < 12 else 'PM'}")
        t += length
    return out
