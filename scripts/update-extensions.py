#!/usr/bin/env python3
"""
update-extensions.py
Reads data/parking-data.json, applies extension-based updates to timesRaw/days,
and writes the result back (with a .bak backup).

Extension categorisation (in order):
  1. Skip if extension contains "WAS"
  2. Skip if extension is just a date (DD/MM/YYYY)
  3. "ALSO SUNDAY" → set sundayPeriod, leave timesRaw/days
  4. Day range + time range both parseable → overwrite timesRaw and days
  5. Everything else → leave unchanged
"""

import json, re, shutil, sys
from pathlib import Path

DATA_PATH = Path(__file__).parent.parent / 'data' / 'parking-data.json'

# ── Day normalisation map ──────────────────────────────────────────────────────
DAY_MAP = {
    r'MON[-/]SUN': 'MONDAY TO SUNDAY',
    r'MON[-/]SAT': 'MONDAY TO SATURDAY',
    r'MON[-/]FRI': 'MONDAY TO FRIDAY',
}

def extract_days(ext_upper):
    """Return normalised day string if a day range is found, else None."""
    for pattern, replacement in DAY_MAP.items():
        if re.search(pattern, ext_upper):
            return replacement
    return None

# ── Time extraction ────────────────────────────────────────────────────────────
# Matches things like 07.00, 7.00, 19.00, 24.00, 7:00, and also bare integers
TIME_PAT = r'\d{1,2}(?:[.:]\d{2})?'

def extract_time_range(ext_upper):
    """
    Try to find a time RANGE (start TO/- end) in ext_upper.
    Returns a formatted "HH.MM-HH.MM" string or None.

    Strategy: look for an explicit range pattern "HH.MM ... HH.MM" where
    both tokens have 2-digit minutes, connected by TO, -, or ().
    This avoids matching date fragments like "17.9.07".
    """
    # Normalise MIDNIGHT → 24.00
    s = ext_upper.replace('MIDNIGHT', '24.00')

    # A time token: HH.MM, HH:MM, or bare HH with optional AM/PM
    T = r'\d{1,2}(?:[.:]\d{2})?\s*(?:AM|PM)?'

    # Look for a connected pair: T (separator) T
    # Separators: TO, -, hyphen, or wrapped in parens like (07.00-24.00)
    # Require that at least one of the tokens has 2-digit minutes (HH.MM or HH:MM)
    HAS_MINS = r'\d{1,2}[.:]\d{2}'

    pattern = rf'({T})\s*(?:TO|-)\s*({T})'
    for m in re.finditer(pattern, s):
        t1, t2 = m.group(1).strip(), m.group(2).strip()
        # At least one must have explicit minutes to distinguish from date fragments
        if not (re.search(HAS_MINS, t1) or re.search(HAS_MINS, t2)):
            continue
        # Validate: hours 0-24, minutes 0-59
        def parse_mins(t):
            t = t.strip()
            pm = re.search(r'(AM|PM)$', t, re.I)
            ampm = pm.group(1).upper() if pm else None
            t = re.sub(r'\s*(AM|PM)$', '', t, flags=re.I).strip()
            mm = re.match(r'^(\d{1,2})(?:[.:](\d{2}))?$', t)
            if not mm:
                return None
            h, mi = int(mm.group(1)), int(mm.group(2) or 0)
            if ampm == 'PM' and h != 12: h += 12
            if ampm == 'AM' and h == 12: h = 0
            if h > 24 or mi > 59:
                return None
            return h * 60 + mi
        if parse_mins(t1) is None or parse_mins(t2) is None:
            continue

        def normalise_time(t):
            t = t.strip()
            t = re.sub(r':', '.', t)
            mm = re.match(r'^(\d{1,2})(?:\.(\d{2}))?\s*(AM|PM)?$', t, re.I)
            if not mm:
                return t
            hrs = mm.group(1)
            mins = mm.group(2) or '00'
            ampm = (mm.group(3) or '').upper()
            return f"{hrs}.{mins}{ampm}"

        return f"{normalise_time(t1)}-{normalise_time(t2)}"

    return None

# ── ALSO SUNDAY extraction ─────────────────────────────────────────────────────
def extract_sunday_period(ext):
    """
    Extract the sunday time string from an ALSO SUNDAY extension.
    e.g. "*ALSO SUNDAY, 2PM - 6PM"  → "2PM - 6PM"
         "ALSO SUNDAY 2.00 TO 6.00 PM 07/04/03" → "2.00 TO 6.00 PM"
    Returns a raw string or None.
    """
    m = re.search(r'ALSO SUNDAY[,\s*]*(.+)', ext, re.IGNORECASE)
    if not m:
        return None
    tail = m.group(1).strip()
    # Strip trailing date (DD/MM/YYYY or similar)
    tail = re.sub(r'\s*\d{2}[/.-]\d{2}[/.-]\d{4}\s*$', '', tail).strip()
    tail = re.sub(r'\s*\d{2}[/.-]\d{1,2}[/.-]\d{2}\s*$', '', tail).strip()
    return tail or None

# ── Main ───────────────────────────────────────────────────────────────────────
def process(streets):
    updated = 0
    sunday_period_set = 0
    skipped_was = 0
    skipped_date = 0
    skipped_partial = 0
    unchanged = 0

    for street in streets:
        ext = street.get('extension')
        # Ensure sundayPeriod key exists
        street.setdefault('sundayPeriod', None)
        street.setdefault('extensionUpdated', False)

        if not ext:
            unchanged += 1
            continue

        ext_upper = ext.upper().strip()

        # 1. Skip if "WAS"
        if 'WAS' in ext_upper:
            skipped_was += 1
            continue

        # 2. Skip if date-only (DD/MM/YYYY)
        if re.match(r'^\d{2}/\d{2}/\d{4}$', ext_upper):
            skipped_date += 1
            continue

        # 3. ALSO SUNDAY
        if 'ALSO SUNDAY' in ext_upper:
            period = extract_sunday_period(ext)
            if period:
                street['sundayPeriod'] = period
                sunday_period_set += 1
            continue

        # 4. Day range + time range
        days_str = extract_days(ext_upper)
        time_str = extract_time_range(ext_upper)

        if days_str and time_str:
            street['timesRaw'] = time_str
            street['days'] = days_str
            street['extensionUpdated'] = True
            updated += 1
        else:
            skipped_partial += 1

    return updated, sunday_period_set, skipped_was, skipped_date, skipped_partial

def main():
    if not DATA_PATH.exists():
        print(f"ERROR: {DATA_PATH} not found", file=sys.stderr)
        sys.exit(1)

    # Backup
    bak = DATA_PATH.with_suffix('.json.bak')
    shutil.copy2(DATA_PATH, bak)
    print(f"Backup written to {bak}")

    with open(DATA_PATH, encoding='utf-8') as f:
        streets = json.load(f)

    print(f"Loaded {len(streets)} streets")

    updated, sunday_period_set, skipped_was, skipped_date, skipped_partial = process(streets)

    with open(DATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(streets, f, ensure_ascii=False, indent=2)

    print(f"\nDone:")
    print(f"  timesRaw/days updated : {updated}")
    print(f"  sundayPeriod set      : {sunday_period_set}")
    print(f"  skipped (WAS)         : {skipped_was}")
    print(f"  skipped (date-only)   : {skipped_date}")
    print(f"  skipped (partial)     : {skipped_partial}")
    print(f"\nSpot-check EDENVALE ROAD:")
    for s in streets:
        if 'EDENVALE' in s['street'].upper():
            print(f"  timesRaw={s.get('timesRaw')!r}  days={s.get('days')!r}  updated={s.get('extensionUpdated')}")
    print(f"\nSpot-check FLORENCE STREET:")
    for s in streets:
        if s['street'].upper() == 'FLORENCE STREET':
            print(f"  timesRaw={s.get('timesRaw')!r}  days={s.get('days')!r}  updated={s.get('extensionUpdated')}")
    print(f"\nSpot-check ALSO SUNDAY streets:")
    for s in streets:
        if s.get('sundayPeriod'):
            print(f"  {s['street']}: sundayPeriod={s['sundayPeriod']!r}")

if __name__ == '__main__':
    main()
