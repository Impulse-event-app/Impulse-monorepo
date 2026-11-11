"""Google Maps place data through SerpApi: opening hours, contact details and
Popular Times for a venue, so onboarding can prefill them.

Google's own Places API has no Popular Times, so this goes through SerpApi's
google_maps engine, which returns the same graph Google Maps shows. One search
finds the place from the name and address the venue typed; a place_id lookup
fetches its details (Popular Times only come back on a single place).

Everything here degrades to "nothing found": without SERPAPI_API_KEY, or when
SerpApi is down, onboarding just works the way it did before.
"""
import logging
import os
import re
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger("impulse.google_places")

SERPAPI_URL = "https://serpapi.com/search.json"
SYDNEY_LL = "@-33.8688,151.2093,12z"   # biases the search to Sydney
TIMEOUT = 20.0

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_FULL = {
    "monday": "Mon", "tuesday": "Tue", "wednesday": "Wed", "thursday": "Thu",
    "friday": "Fri", "saturday": "Sat", "sunday": "Sun",
}


def configured() -> bool:
    return bool(os.getenv("SERPAPI_API_KEY"))


def _get(params: Dict[str, str]) -> Optional[Dict[str, Any]]:
    key = os.getenv("SERPAPI_API_KEY")
    if not key:
        return None
    try:
        r = httpx.get(SERPAPI_URL, params={"engine": "google_maps", "hl": "en", "gl": "au", **params, "api_key": key},
                      timeout=TIMEOUT)
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("SerpApi request failed: %s", exc)
        return None
    if data.get("error"):
        # "Google hasn't returned any results for this query." is an ordinary miss.
        logger.info("SerpApi: %s", data["error"])
        return None
    return data


# ── Parsing ───────────────────────────────────────────────────────────────────

_TIME = re.compile(r"^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$")


def _to24(t: str, meridiem: Optional[str] = None) -> Optional[str]:
    """'11 am' / '10:30 PM' / '12' (with the meridiem borrowed from the other
    end, as Google writes '12–11 pm') → '11:00'."""
    s = t.strip().lower().replace(" ", " ").replace(" ", " ")
    if s in ("midnight", "12 midnight"):
        return "00:00"
    if s in ("noon", "midday"):
        return "12:00"
    m = _TIME.match(s)
    if not m:
        bare = re.match(r"^(\d{1,2})(?::(\d{2}))?$", s)
        if not bare or not meridiem:
            return None
        h, mins, ap = bare.group(1), bare.group(2), meridiem
    else:
        h, mins, ap = m.group(1), m.group(2), m.group(3)
    hour = int(h) % 12 + (12 if ap == "p" else 0)
    return f"{hour:02d}:{mins or '00'}"


def _meridiem(t: str) -> Optional[str]:
    m = re.search(r"([ap])\.?\s*m\.?\s*$", t.strip().lower())
    return m.group(1) if m else None


def parse_day_hours(text: str) -> Optional[Dict[str, Any]]:
    """One day as Google writes it → {"open", "from", "to"} (24-h), or None
    if it can't be read. Split shifts ('11 am–2 pm, 5–10 pm') become one span
    from the first opening to the last close."""
    s = (text or "").strip().replace(" ", " ").replace(" ", " ")
    if not s:
        return None
    low = s.lower()
    if low == "closed":
        return {"open": False, "from": "10:00", "to": "22:00"}
    if "24 hours" in low:
        return {"open": True, "from": "00:00", "to": "00:00"}
    spans = [p.strip() for p in s.split(",") if p.strip()]
    first = re.split(r"\s*[–—-]\s*|\s+to\s+", spans[0])
    last = re.split(r"\s*[–—-]\s*|\s+to\s+", spans[-1])
    if len(first) != 2 or len(last) != 2:
        return None
    # A bare start borrows its end's am/pm: '12–11 pm' is noon to 11 pm.
    start = _to24(first[0], _meridiem(first[1]))
    end = _to24(last[1], _meridiem(last[0]))
    if not start or not end:
        return None
    return {"open": True, "from": start, "to": end}


def _fmt12(hhmm: str) -> str:
    h, m = (int(x) for x in hhmm.split(":"))
    suffix = "pm" if h >= 12 else "am"
    h12 = h % 12 or 12
    return f"{h12}{suffix}" if m == 0 else f"{h12}:{m:02d}{suffix}"


def opening_hours_string(raw: Any) -> Optional[str]:
    """SerpApi operating_hours ({"monday": "11 am–10 pm", ...}, sometimes a
    list of one-key dicts) → the portal's stored form,
    'Mon: 11am–10pm, ..., Sun: Closed'. None unless every day was read."""
    if isinstance(raw, list):
        merged: Dict[str, Any] = {}
        for item in raw:
            if isinstance(item, dict):
                merged.update(item)
        raw = merged
    if not isinstance(raw, dict):
        return None
    week: Dict[str, Dict[str, Any]] = {}
    for key, value in raw.items():
        day = _FULL.get(str(key).strip().lower())
        if not day:
            continue
        text = ", ".join(value) if isinstance(value, list) else str(value)
        parsed = parse_day_hours(text)
        if parsed:
            week[day] = parsed
    if len(week) != 7:
        return None
    parts = []
    for d in DAYS:
        h = week[d]
        parts.append(f"{d}: Closed" if not h["open"] else f"{d}: {_fmt12(h['from'])}–{_fmt12(h['to'])}")
    return ", ".join(parts)


def _hour_of(label: str) -> Optional[int]:
    t = _to24(label)
    return int(t.split(":")[0]) if t else None


def popular_times(raw: Any) -> Optional[Dict[str, List[int]]]:
    """SerpApi popular_times → {"Mon": [24 ints 0-100], ...}, hour 0 first.
    Hours Google doesn't chart (closed) are 0. None when there's no graph."""
    graph = raw.get("graph_results") if isinstance(raw, dict) else None
    if not isinstance(graph, dict):
        return None
    out: Dict[str, List[int]] = {}
    for key, points in graph.items():
        day = _FULL.get(str(key).strip().lower())
        if not day or not isinstance(points, list):
            continue
        hours = [0] * 24
        for p in points:
            if not isinstance(p, dict):
                continue
            h = _hour_of(str(p.get("time", "")))
            score = p.get("busyness_score")
            if h is None or not isinstance(score, (int, float)):
                continue
            hours[h] = max(0, min(100, int(round(score))))
        out[day] = hours
    if not out or not any(any(v) for v in out.values()):
        return None
    for d in DAYS:
        out.setdefault(d, [0] * 24)
    return out


def _place(p: Dict[str, Any]) -> Dict[str, Any]:
    gps = p.get("gps_coordinates") or {}
    return {
        "place_id": p.get("place_id"),
        "name": p.get("title"),
        "address": p.get("address"),
        "phone": p.get("phone"),
        "website": p.get("website"),
        "lat": gps.get("latitude"),
        "lng": gps.get("longitude"),
        "opening_hours": opening_hours_string(p.get("operating_hours") or p.get("hours")),
        "popular_times": popular_times(p.get("popular_times")),
    }


def place_from_response(data: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """A search either lands on one place (place_results) or lists several
    (local_results, best match first)."""
    if not data:
        return None
    if isinstance(data.get("place_results"), dict):
        return _place(data["place_results"])
    results = data.get("local_results")
    if isinstance(results, list) and results and isinstance(results[0], dict):
        return _place(results[0])
    return None


# ── Calls ─────────────────────────────────────────────────────────────────────

def find_place(name: str, address: Optional[str] = None, suburb: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """The venue's Google Maps place from what they typed, with its details."""
    q = " ".join(x.strip() for x in (name, address or "", suburb or "") if x and x.strip())
    found = place_from_response(_get({"q": q, "type": "search", "ll": SYDNEY_LL}))
    if not found or not found.get("place_id"):
        return found
    # A list hit has no Popular Times; the place itself might.
    if found.get("popular_times") is None or found.get("opening_hours") is None:
        detail = place_details(found["place_id"])
        if detail:
            found = {k: (found.get(k) if found.get(k) is not None else detail.get(k)) for k in {**detail, **found}}
    return found


def place_details(place_id: str) -> Optional[Dict[str, Any]]:
    return place_from_response(_get({"place_id": place_id}))
