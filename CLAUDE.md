# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Dublin Parking Finder** — a zero-backend, mobile-first web app showing Dublin City Council permit and pay-and-display parking rules on an interactive map. The full product spec and phased implementation guide is in `docs/dublin-parking-guide.md`.

**Status: Prototype complete.** Phase 0 (data pipeline) and Phases 1–8 (full frontend) are implemented.

## Tech Stack

- **Vanilla JS + HTML + CSS** — no build step, no npm, no TypeScript
- **Leaflet.js 1.9.4** — map rendering (loaded via cdnjs CDN)
- **Leaflet.markercluster 1.5.3** — marker clustering (loaded via cdnjs CDN)
- **CartoDB Positron tiles** — clean light map tiles, free, no API key
- **Photon (Komoot)** — OSM-based geocoding for live search (`photon.komoot.io`). Note: Nominatim is blocked on this IP — use Photon instead.

## Running the App

```sh
# Serve locally (required for fetch() to work — can't open index.html directly from disk)
python3 -m http.server 8080
# Then open: http://localhost:8080
```

## Data Pipeline (Phase 0 — already run)

The pipeline has already been run. Output files are committed:
- `data/parking-data.json` — 909 streets (866 geocoded, 43 unmatched)
- `data/geocode-review.json` — 43 streets with no geocoordinates

To re-run (e.g. after updating the source XLS):
```sh
pip3 install pandas openpyxl requests
python3 scripts/build-data.py
```

**Important:** The `.xls` file is actually XLSX format — the script uses `engine='openpyxl'`, not `xlrd`. Nominatim is blocked on this machine's IP; the script uses Photon (`photon.komoot.io`) at 1.1s/request (~17 min for 911 streets). Do not commit `data/geocode-cache.json`.

## File Structure

```
index.html              # Single-page app
style.css               # All styles (~280 lines)
app.js                  # All client-side logic (~580 lines)
data/
  parking-data.json     # 909 streets with coordinates + rules
  geocode-review.json   # 43 streets with no geocoordinates
  geocode-cache.json    # (gitignored) pipeline cache
scripts/
  build-data.py         # One-time XLS → JSON + geocoding pipeline
docs/
  dublin-parking-guide.md  # Full product spec and implementation guide
  *.xls                    # Source data (Dublin City Council 2011)
```

## Architecture

All logic runs client-side in `app.js`. Key functions:

| Function | Purpose |
|---|---|
| `loadData()` | Fetches `parking-data.json`, renders all markers via MarkerCluster |
| `getStatus(street, dt)` | Returns `'red'`/`'yellow'`/`'green'` for a street at a datetime |
| `isActive(street, dt)` | Checks if parking is in force (day + time range check) |
| `parseTimeRange(raw)` | Parses the messy time strings into `{startMins, endMins}` |
| `parseDays(str)` | Parses day string into a `Set<number>` (0=Sun…6=Sat) |
| `recolourAllMarkers()` | Re-evaluates all 866 markers for current datetime (no marker re-creation) |
| `openPanel(street)` | Populates and slides in the street detail panel |
| `doSearch(query)` | Calls Photon geocoder with Dublin location bias |
| `highlightNearby(lat, lng, r)` | Enlarges markers within r metres of a point for 4s |

## Colour Logic

```
isActive? → NO  → GREEN (free)
isActive? → YES → type=pd_only or pd_and_dp → YELLOW (Pay & Display)
                → type=dp_only or unknown   → RED (Permit Only)
```

Active = day ∈ parseDays(street.days) AND time ∈ [startMins, endMins)

## Time String Parser

The `timesRaw` field has ~47 distinct messy formats (no space before AM/PM, `A.M.` dots, double-dots, "TO" vs "-", trailing commas, `MIDNIGHT` concatenated with day name, etc.). All 47 patterns from the real data parse correctly. See `parseTimeRange()` and `parseTimePart()` in `app.js`.

## Panel Animation

The street panel does **not** use `.hidden` to show/hide — it uses `.panel-open` class with CSS `transform: translateY/translateX` transitions. Using `.hidden { display:none }` would break the slide animation.

## Known Limitations

- 43 streets have no geocoordinates (parenthetical/qualifier names that Photon couldn't match) — they appear in `geocode-review.json` and are omitted from the map
- Source data is from 2011 — rules may have changed; users can submit updates via the panel's "Suggest Update" form
- Search uses Photon which may return occasional non-Dublin results despite the lat/lon bias
