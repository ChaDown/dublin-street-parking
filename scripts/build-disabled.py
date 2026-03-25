"""
build-disabled.py
Converts raw disabled/accessible parking GeoJSON for DLR, Fingal, and SDCC
into the shared disabled_clean format used by the app:
  { id, location, description, side, lat, lng }
"""

import json, os

BASE = os.path.join(os.path.dirname(__file__), '..', 'data')

def write_clean(path, records):
    with open(path, 'w') as f:
        json.dump(records, f, indent=2)
    print(f'  → {path} ({len(records)} records)')


# ── DLR ──────────────────────────────────────────────────────────────────────
# Fields: Location, Descriptio, geometry.coordinates[0=lng, 1=lat]
print('DLR...')
with open(os.path.join(BASE, 'dlr', 'disabled_raw.json')) as f:
    dlr_raw = json.load(f)

dlr_clean = []
for i, feat in enumerate(dlr_raw['features'], 1):
    p = feat['properties']
    coords = feat['geometry']['coordinates']
    dlr_clean.append({
        'id': i,
        'location': (p.get('Location') or '').strip() or None,
        'description': (p.get('Descriptio') or '').strip() or None,
        'side': None,
        'lat': coords[1],
        'lng': coords[0],
    })

write_clean(os.path.join(BASE, 'dlr', 'disabled_clean.json'), dlr_clean)


# ── Fingal ────────────────────────────────────────────────────────────────────
# Fields: WHERE_ (street), NEARBY (landmark), LAT/LONG properties (or geometry)
print('Fingal...')
with open(os.path.join(BASE, 'fingal', 'disabled_raw.json')) as f:
    fingal_raw = json.load(f)

fingal_clean = []
for i, feat in enumerate(fingal_raw['features'], 1):
    p = feat['properties']
    # Prefer explicit LAT/LONG properties; fall back to geometry coords
    lat = p.get('LAT') or (feat['geometry']['coordinates'][1] if feat['geometry'] else None)
    lng = p.get('LONG') or (feat['geometry']['coordinates'][0] if feat['geometry'] else None)
    if lat is None or lng is None:
        continue
    fingal_clean.append({
        'id': i,
        'location': (p.get('WHERE_') or '').strip() or None,
        'description': (p.get('NEARBY') or '').strip() or None,
        'side': None,
        'lat': lat,
        'lng': lng,
    })

write_clean(os.path.join(BASE, 'fingal', 'disabled_clean.json'), fingal_clean)


# ── SDCC ──────────────────────────────────────────────────────────────────────
# Fields: Road_Name (street), Location (landmark), Latitude, Longitude
print('SDCC...')
with open(os.path.join(BASE, 'sdcc', 'disabled_raw.json')) as f:
    sdcc_raw = json.load(f)

sdcc_clean = []
for i, feat in enumerate(sdcc_raw['features'], 1):
    p = feat['properties']
    coords = feat['geometry']['coordinates']
    lat = p.get('Latitude') or coords[1]
    lng = p.get('Longitude') or coords[0]
    sdcc_clean.append({
        'id': i,
        'location': (p.get('Road_Name') or '').strip() or None,
        'description': (p.get('Location') or '').strip() or None,
        'side': None,
        'lat': lat,
        'lng': lng,
    })

write_clean(os.path.join(BASE, 'sdcc', 'disabled_clean.json'), sdcc_clean)

print('Done.')
