"""
Merge clearway data from dccrdpanddclway.geojson into parking_clean.json.
Uses coordinate proximity matching and parses clearway time windows.
"""
import json
import math
import re

geojson_path = 'data/dcc/dccrdpanddclway.geojson'
parking_path = 'data/dcc/parking_clean.json'


def haversine_m(lat1, lng1, lat2, lng2):
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat/2)**2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2)
    return R * 2 * math.asin(math.sqrt(a))


def parse_time_mins(t):
    """Convert "10.00", "1600", "10:00", "07", "10" to minutes from midnight."""
    t = str(t).replace(':', '.').strip()
    if '.' in t:
        parts = t.split('.')
        return int(parts[0]) * 60 + int(parts[1][:2])
    v = int(t)
    if v > 24:  # e.g. 1600
        return (v // 100) * 60 + (v % 100)
    return v * 60  # bare hour e.g. 07, 10, 16


def extract_ranges(text):
    """
    Find all explicit time ranges 'X-Y' in text.
    Handles "07-10+16-19.00", "16.00-19.00", "19.00 - 06.00" etc.
    Returns list of [startMins, endMins], with wrap-around for e.g. 19:00-06:00.
    """
    # Match pairs: X (optional .MM) DASH Y (optional .MM)
    pairs = re.findall(
        r'(\d{1,2}(?:[.]\d{2})?)\s*[-–]\s*(\d{1,2}(?:[.]\d{2})?)',
        text
    )
    windows = []
    for a, b in pairs:
        try:
            start = parse_time_mins(a)
            end = parse_time_mins(b)
        except Exception:
            continue
        if start > 24 * 60 or end > 24 * 60:
            continue
        if start < end:
            windows.append([start, end])
        else:  # wrap-around e.g. 19:00 → 06:00
            windows.append([start, 1440])
            if end > 0:
                windows.append([0, end])
    return windows or None


def parse_keyword_windows(text):
    """
    Keyword-based parsing for "before X", "after Y", "before X and after Y".
    Returns list of [startMins, endMins] or None.
    """
    # Normalise: ensure space between keyword and digit (e.g. "after16.00" → "after 16.00")
    text = re.sub(r'(before|after|until)(\d)', r'\1 \2', text, flags=re.IGNORECASE)

    # Extract times with a decimal or 4-digit form (most reliable)
    raw = re.findall(r'\b(\d{1,2}[.]\d{2}|\d{4})\b', text)
    # Also pick up bare integers that look like hours (0-24) in a keyword context
    bare = re.findall(r'\b(\d{1,2})\b', text)
    # Combine: prefer decimal forms, deduplicate by value
    all_mins = []
    seen = set()
    for t in raw + bare:
        try:
            m = parse_time_mins(t)
        except Exception:
            continue
        if 0 <= m <= 1440 and m not in seen:
            seen.add(m)
            all_mins.append(m)

    tl = text.lower()
    has_before = bool(re.search(r'before|until', tl))
    has_after  = bool(re.search(r'\bafter\b', tl))

    if has_before and not has_after and all_mins:
        return [[0, all_mins[0]]]

    if has_after and not has_before and all_mins:
        return [[all_mins[0], 1440]]

    if has_before and has_after and len(all_mins) >= 2:
        return [[0, all_mins[0]], [all_mins[1], 1440]]

    return None


# Clearway_Hrs values that are too vague to parse → null fallback
UNPARSEABLE = {
    'no parking clearway', 'clearway for luas works', 'clearway zone',
    'clearway', 'bus lane', '', 'none',
}


def parse_clearway_windows(fi, ch):
    """
    Return list of [startMins, endMins] pairs (clearway active windows), or None.
    None means: clearway is active whenever parking is NOT active (fallback).

    Strategy:
    1. Try explicit ranges from Clearway_Hrs first (often most specific, e.g. "07-10+16-19.00")
    2. Try explicit ranges from Further_Information
    3. Keyword parsing on Further_Information (or Clearway_Hrs if FI is absent)
    """
    ch_text = (ch or '').strip()
    fi_text = (fi or '').strip()

    # 1. Explicit ranges from Clearway_Hrs
    if ch_text and ch_text.lower() not in UNPARSEABLE:
        w = extract_ranges(ch_text)
        if w:
            return w

    # 2. Explicit ranges from Further_Information
    if fi_text and fi_text.lower() not in UNPARSEABLE:
        w = extract_ranges(fi_text)
        if w:
            return w

    # 3. Keyword parsing — prefer FI, fall back to CH
    for text in [fi_text, ch_text]:
        if not text or text.lower() in UNPARSEABLE:
            continue
        w = parse_keyword_windows(text)
        if w:
            return w

    return None  # permanent / truly unparseable → fallback behaviour


# ── Load data ─────────────────────────────────────────────────────────────────

with open(geojson_path) as f:
    gj = json.load(f)
with open(parking_path) as f:
    parking = json.load(f)

# Build clearway feature list
clearways = []
for feat in gj['features']:
    p = feat['properties']
    fi = p.get('Further_Information')
    ch = p.get('Clearway_Hrs')
    info = (fi or ch or 'Clearway zone').strip()
    windows = parse_clearway_windows(fi, ch)
    clearways.append({
        'no': str(p['No']),
        'location': p.get('Location', ''),
        'info': info,
        'windows': windows,
        'lat': float(p['Latitude']),
        'lng': float(p['Longitude']),
    })

print(f"Clearway records in GeoJSON: {len(clearways)}\n")

# Clear existing clearway_windows from all records (clean slate for re-run)
for street in parking:
    street.pop('clearway_windows', None)

# Index DCC parking records with coordinates
dcc_records = [s for s in parking if s.get('lat') is not None and s.get('lng') is not None]

matched = 0
unmatched = []

for cw in clearways:
    best_dist = float('inf')
    best_record = None
    for street in dcc_records:
        d = haversine_m(cw['lat'], cw['lng'], street['lat'], street['lng'])
        if d < best_dist:
            best_dist = d
            best_record = street

    win_str = str(cw['windows']) if cw['windows'] else 'null (fallback = all off-hours)'
    if best_record and best_dist <= 200:
        best_record['clearway'] = True
        best_record['clearway_info'] = cw['info']
        best_record['clearway_windows'] = cw['windows']
        matched += 1
        print(f"  ✓ {cw['no']:>5} {cw['location']:<28} → {best_record['location']:<28} ({best_dist:.0f}m)  {win_str}")
    else:
        unmatched.append(cw)
        print(f"  ✗ {cw['no']:>5} {cw['location']:<28} — no match within 200m")

print(f"\nMatched: {matched} / {len(clearways)}")
if unmatched:
    print(f"Unmatched ({len(unmatched)}): {[c['no'] for c in unmatched]}")

with open(parking_path, 'w') as f:
    json.dump(parking, f, indent=2, ensure_ascii=False)

print("\nDone — parking_clean.json updated.")
