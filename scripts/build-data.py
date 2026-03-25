"""
Phase 0 — Data Pipeline
Converts the Dublin City Council parking XLS to parking-data.json with geocoordinates.
Run once locally. Takes ~15 minutes (Nominatim rate limit: 1 req/sec).
"""

import json
import os
import time

import pandas as pd
import requests

XLS_PATH = os.path.join(os.path.dirname(__file__), "../docs/dccparkingpermitschemeslnkp20110930-1115.xls")
OUT_DATA = os.path.join(os.path.dirname(__file__), "../data/parking-data.json")
OUT_REVIEW = os.path.join(os.path.dirname(__file__), "../data/geocode-review.json")
CACHE_PATH = os.path.join(os.path.dirname(__file__), "../data/geocode-cache.json")

# Photon (Komoot) geocoder — OSM-based, free, no API key required
# Location bias toward Dublin city centre ensures correct Dublin is chosen
PHOTON_URL = "https://photon.komoot.io/api/"
HEADERS = {"User-Agent": "DublinParkingFinder/1.0 (contact@example.com)"}
DUBLIN_LAT = 53.3498
DUBLIN_LON = -6.2603


def load_cache():
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH) as f:
            return json.load(f)
    return {}


def save_cache(cache):
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    with open(CACHE_PATH, "w") as f:
        json.dump(cache, f, indent=2)


def geocode(street, cache):
    if street in cache:
        return cache[street]

    query = f"{street}, Dublin, Ireland"
    try:
        resp = requests.get(
            PHOTON_URL,
            params={"q": query, "limit": 1, "lat": DUBLIN_LAT, "lon": DUBLIN_LON},
            headers=HEADERS,
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        features = data.get("features", [])
        if features:
            coords = features[0]["geometry"]["coordinates"]
            result = {"lat": float(coords[1]), "lng": float(coords[0]), "found": True}
        else:
            result = {"lat": None, "lng": None, "found": False}
    except Exception as e:
        print(f"  ERROR geocoding '{street}': {e}")
        result = {"lat": None, "lng": None, "found": False}

    cache[street] = result
    return result


def to_int_or_none(val):
    if pd.isna(val):
        return None
    if isinstance(val, str):
        val = val.strip()
        if val.lower() in ("(see above)", "", "none"):
            return None
        try:
            return int(float(val))
        except ValueError:
            return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def classify_type(pd_spaces, dp_spaces):
    has_pd = pd_spaces is not None and pd_spaces > 0
    has_dp = dp_spaces is not None and dp_spaces > 0
    if has_pd and has_dp:
        return "pd_and_dp"
    if has_dp:
        return "dp_only"
    if has_pd:
        return "pd_only"
    return "unknown"


def normalise_days(raw):
    if pd.isna(raw):
        return None
    days = str(raw).strip().upper()
    # Strip trailing * and spaces
    days = days.rstrip("* ").strip()
    return days


def normalise_times(raw):
    if pd.isna(raw):
        return None
    times = str(raw).strip()
    # Collapse multiple spaces
    import re
    times = re.sub(r" {2,}", " ", times)
    return times


def main():
    print(f"Reading XLS: {XLS_PATH}")
    # File has .xls extension but is actually XLSX format — use openpyxl
    df = pd.read_excel(XLS_PATH, sheet_name="LIST", engine="openpyxl")
    print(f"Loaded {len(df)} rows")
    print(f"Columns: {list(df.columns)}")

    cache = load_cache()
    print(f"Cache loaded: {len(cache)} entries")

    streets = []
    unmatched = []

    for idx, row in df.iterrows():
        street_raw = row.get("STREET", "")
        if pd.isna(street_raw):
            continue
        street = str(street_raw).strip()
        if not street:
            continue

        pd_spaces = to_int_or_none(row.get("P&D Spaces"))
        dp_spaces = to_int_or_none(row.get("DP Spaces"))
        days = normalise_days(row.get("DAYS"))
        times_raw = normalise_times(row.get("Times"))
        extension_raw = row.get("EXTENSION")
        if pd.isna(extension_raw):
            extension = None
        elif hasattr(extension_raw, "strftime"):
            # Some extension cells are dates parsed by pandas (e.g. extension dates)
            extension = extension_raw.strftime("%d/%m/%Y")
        else:
            extension = str(extension_raw).strip() or None
        street_type = classify_type(pd_spaces, dp_spaces)

        print(f"[{idx:4d}] {street}", end="")

        geo = geocode(street, cache)
        if geo["found"]:
            print(f" → {geo['lat']:.4f}, {geo['lng']:.4f}")
        else:
            print(" → NOT FOUND")
            unmatched.append(street)

        streets.append({
            "id": idx,
            "street": street,
            "pdSpaces": pd_spaces,
            "dpSpaces": dp_spaces,
            "type": street_type,
            "timesRaw": times_raw,
            "days": days,
            "extension": extension,
            "lat": geo["lat"],
            "lng": geo["lng"],
            "geocoded": geo["found"],
        })

        # Save cache after every geocode call (in case of interruption)
        save_cache(cache)

        time.sleep(1.1)

    # Final cache save
    save_cache(cache)

    os.makedirs(os.path.dirname(OUT_DATA), exist_ok=True)
    with open(OUT_DATA, "w") as f:
        json.dump(streets, f, indent=2)
    print(f"\nWrote {len(streets)} streets to {OUT_DATA}")

    with open(OUT_REVIEW, "w") as f:
        json.dump(unmatched, f, indent=2)
    print(f"Wrote {len(unmatched)} unmatched streets to {OUT_REVIEW}")
    print(f"\nDone. Cache saved to {CACHE_PATH}")
    print("Commit data/parking-data.json and data/geocode-review.json — NOT geocode-cache.json")


if __name__ == "__main__":
    main()
