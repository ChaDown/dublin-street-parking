# Dublin Parking Finder — Product & Agent Implementation Guide

> **Version:** 1.0  
> **Stack:** Vanilla JS + Leaflet.js + OpenStreetMap + Nominatim · Hosted free on GitHub Pages or Netlify · Zero backend

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Feature Specification](#2-feature-specification)
3. [Data Overview & Quirks](#3-data-overview--quirks)
4. [Architecture & Tech Stack](#4-architecture--tech-stack)
5. [File Structure](#5-file-structure)
6. [Agent Implementation Guide](#6-agent-implementation-guide)
   - [Phase 0 — Data Pipeline](#phase-0--data-pipeline-run-once-locally)
   - [Phase 1 — Project Scaffold](#phase-1--project-scaffold)
   - [Phase 2 — Map & Markers](#phase-2--map--markers)
   - [Phase 3 — Time Logic & Colour Coding](#phase-3--time-logic--colour-coding)
   - [Phase 4 — Street Detail Panel](#phase-4--street-detail-panel)
   - [Phase 5 — Search Bar](#phase-5--search-bar)
   - [Phase 6 — Navigation Links](#phase-6--navigation-links)
   - [Phase 7 — Update Submission](#phase-7--update-submission)
   - [Phase 8 — Polish & Performance](#phase-8--polish--performance)
7. [Colour Logic Reference](#7-colour-logic-reference)
8. [Known Data Issues & Handling](#8-known-data-issues--handling)
9. [Hosting & Deployment](#9-hosting--deployment)
10. [Cost Breakdown](#10-cost-breakdown)
11. [Future Roadmap](#11-future-roadmap)

---

## 1. Product Vision

**Dublin Parking Finder** is a lightweight, mobile-first web app that shows Dublin City Council permit and pay-and-display parking rules on an interactive map. A user can:

- Glance at the map and instantly see whether a street has paid/permit parking active *right now* (colour-coded markers)
- Tap/click any marker to see full rule details for that street
- Change the date and time to plan ahead (e.g. "Is this free on Sunday morning?")
- Search for any location in Dublin — streets, pubs, offices, landmarks — and see nearby parking markers
- Navigate to a street via Google Maps, Waze, or Apple Maps in one tap
- Submit a correction if a rule has changed

**Core design principles:**
- **Zero cost to run.** No server, no database, no API keys required.
- **Fast on mobile.** Static files, CDN-hosted libraries, all data loaded once as a single JSON bundle.
- **Intuitive.** A tourist or local should understand the app in under 10 seconds without instructions.
- **Offline-friendly.** Once loaded, the app works without internet (map tiles cached by browser).

---

## 2. Feature Specification

### 2.1 Map View (Default Screen)

- On load, the map opens centred on **Dublin City** at zoom level 13, bounded to Co. Dublin.
- Every street in the dataset is represented by a **circular `P` marker** placed at its geocoded coordinates.
- Marker colour reflects the **current time** parking status:

| Colour | Meaning |
|--------|---------|
| 🔴 Red | Permit-only (DP) active — no P&D spaces, or it's a DP-only street |
| 🟡 Yellow | Pay & Display (P&D) active — paid parking in force |
| 🟢 Green | Outside active hours — parking is free at this time |

- The default time used for colouring is the **device's current local time**.

### 2.2 Date & Time Picker

- A compact datetime picker (date + time) sits in the top bar alongside the search bar.
- Changing it instantly re-colours all markers to reflect parking rules at that time.
- Defaults to *now* (live clock, updated every minute).

### 2.3 Marker Hover / Tap → Street Panel

- **Desktop:** hovering a marker shows a small tooltip with the street name and current status.
- **All devices:** clicking/tapping a marker opens a **slide-up panel** (bottom sheet on mobile, sidebar on desktop) containing:
  - Street name
  - P&D spaces (or "None")
  - DP (permit) spaces (or "None")
  - Active hours (times + days, human-readable)
  - Extension notes if present (e.g. "Also Sunday 2–6pm")
  - Current status banner (Free / Pay & Display / Permit Only) in the appropriate colour
  - **Navigate** button (opens navigation picker)
  - **Suggest Update** button (opens inline update form)

### 2.4 Search Bar

- A single search input in the top bar.
- Accepts any location: street name, venue, eircode, landmark, anything Nominatim can geocode.
- On submit, the map **pans and zooms** to that location and shows a pin.
- Markers within ~500m are visually highlighted (larger, with a ring).
- Nominatim search is bounded to Dublin (`viewbox` parameter) with `countrycodes=ie`.
- A small autocomplete dropdown shows the top 5 Nominatim suggestions as the user types (debounced 400ms).

### 2.5 Navigation Button

Tapping **Navigate** inside the street panel opens a small picker:

| Option | Deep Link |
|--------|-----------|
| Google Maps | `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}` |
| Waze | `https://waze.com/ul?ll={lat},{lng}&navigate=yes` |
| Apple Maps | `maps://maps.apple.com/?daddr={lat},{lng}` |

Apple Maps link is shown only if the device is iOS (detected via `navigator.platform` or `navigator.userAgent`).

### 2.6 Update / Correction Form

- A simple inline form inside the street panel.
- Fields: **Street name** (pre-filled, read-only), **What has changed** (free text), **Your email** (optional).
- On submit, sends a `mailto:` to the developer's email address with the street name and details pre-filled as the email body. No backend required.
- A success message confirms the submission.
- Developer reviews and manually edits `parking-data.json` + optionally the source `.xls`.

### 2.7 Unmatched Streets

- Streets that could not be geocoded are listed in a `geocode-review.json` file (see Phase 0).
- They do **not** appear on the map.
- A small "?" badge in the footer shows the count of unmatched streets and links to the review file on GitHub.

---

## 3. Data Overview & Quirks

The source data is `dccparkingpermitschemeslnkp20110930-1115.xls`, sheet `LIST`.

### 3.1 Shape

| Field | Column | Notes |
|-------|--------|-------|
| Street name | `STREET` | Some have trailing spaces; some include area qualifier e.g. `"SANDFORD AVENUE, DUBLIN 4"` |
| P&D spaces | `P&D Spaces` | Integer or `None`. 95 streets have no count recorded. |
| DP spaces | `DP Spaces` | Integer, `None`, or the string `"(See above)"` on a handful of rows |
| Date started | `Date Started` | Mix of `datetime` objects and raw strings like `"27/1/97"` — **ignore for app purposes** |
| Times | `Times` | Free text, inconsistently formatted. ~20 distinct patterns. Must be parsed. |
| Days | `DAYS` | One of 7 patterns (see §3.2) |
| Extension | `EXTENSION` | Free text notes about rule changes/extensions. ~271 entries. Treat as display-only note. |

**Total streets: 910**  
- DP only: 732  
- Both P&D and DP: 75  
- P&D only: 8  
- No space counts recorded: 95

### 3.2 Day Patterns

```
MONDAY TO FRIDAY
MONDAY TO FRIDAY   (trailing space — normalise)
MONDAY TO SATURDAY
MONDAY TO SATURDAY *
MONDAY TO SUNDAY
SATURDAY
SUNDAY
```

Normalise all to trimmed uppercase. Treat `MONDAY TO SATURDAY *` as `MONDAY TO SATURDAY`.

### 3.3 Time String Patterns

Times are **not** consistently formatted. The parser must handle all of the following:

```
7.00 AM - 7.00 PM
8.00 AM - 6.30 PM
07.00 - 24.00 HRS
07.00 - 24.00
7 TO 12 MIDNIGHT
7 to 12 midnight
7.00 AM TO 9.00 PM
8.00 AM TO 6.30 PM
7.00 AM - 12 MIDNIGHT
7 TO 12 MIDNIGHT
10.00 AM - 4.00 PM
8.00 AM -  6.30 PM   (double space)
7.00 AM- 12 MIDNIGHT (no space before dash)
7.00 AM -6.30 PM     (no space after dash)
```

The time parser (see Phase 3) must normalise all of these into `{ startMinutes: number, endMinutes: number }` where minutes are counted from midnight.

### 3.4 Street Type Classification

Classify each street for the marker colour logic:

| Type | Condition |
|------|-----------|
| `dp_only` | `dpSpaces > 0` and `pdSpaces == 0` |
| `pd_and_dp` | both `pdSpaces > 0` and `dpSpaces > 0` |
| `pd_only` | `pdSpaces > 0` and `dpSpaces == 0` |
| `unknown` | both null — still show marker, treat as `dp_only` for display |

---

## 4. Architecture & Tech Stack

### 4.1 Frontend Only — No Backend

```
Browser
  └── index.html (single page)
       ├── style.css
       ├── app.js
       ├── data/parking-data.json   (910 streets, pre-geocoded)
       └── data/geocode-review.json (unmatched streets, for dev reference)
```

Everything is static. Hosted on **GitHub Pages** (free) or **Netlify** (free).

### 4.2 Libraries (CDN, no build step)

| Library | Purpose | CDN |
|---------|---------|-----|
| [Leaflet.js](https://leafletjs.com/) v1.9.x | Interactive map | `unpkg.com` or `cdnjs` |
| [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) | Cluster markers at low zoom | `unpkg.com` |
| No other dependencies | — | — |

No React, no bundler, no Node runtime needed on the client.  
Use vanilla JS (`fetch`, `classList`, `template literals`).

### 4.3 Map Tiles

Use **OpenStreetMap** tiles via Leaflet:
```
https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```
Free, no API key. Attribution required: `© OpenStreetMap contributors`.

Optionally use **CartoDB Positron** for a cleaner, less cluttered look:
```
https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png
```
Also free, no API key. Attribution: `© OpenStreetMap contributors © CARTO`.

**Recommended:** CartoDB Positron — cleaner contrast with coloured parking markers.

### 4.4 Geocoding (One-time, Offline)

Nominatim is used **once** during the data pipeline (Phase 0) to attach `lat/lng` to each street. Results are baked into `parking-data.json`. The live app never calls Nominatim during geocoding — only for **place search** by the user.

Nominatim rate limit: **1 request/second**. With 910 streets, the pipeline takes ~15 minutes. Do not exceed the rate limit.

### 4.5 Place Search (Live)

User-typed searches call Nominatim:
```
https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=5&countrycodes=ie&viewbox=-6.4,53.2,-6.1,53.4&bounded=0
```
Debounce at 400ms. Show top 5 results in a dropdown.

---

## 5. File Structure

```
dublin-parking/
├── index.html
├── style.css
├── app.js
├── data/
│   ├── parking-data.json       # 910 streets with lat/lng
│   └── geocode-review.json     # streets with no geocode match
├── scripts/
│   └── build-data.py           # one-time pipeline (Python, run locally)
├── README.md
└── .github/
    └── workflows/
        └── deploy.yml          # GitHub Pages auto-deploy (optional)
```

---

## 6. Agent Implementation Guide

Follow these phases in order. Each phase is self-contained. Do not jump ahead.

---

### Phase 0 — Data Pipeline (run once locally)

**Goal:** Convert `parking-data.xls` → `parking-data.json` with geocoordinates.

**Agent instructions:**

1. Create `scripts/build-data.py`. It must:

   a. **Read** the `.xls` file using `pandas` with `engine='xlrd'` (the file is legacy XLS format — `openpyxl` will reject it). Sheet name: `LIST`. Skip header row.

   b. **Normalise** each row:
      - Strip whitespace from `STREET`
      - Normalise `DAYS`: trim, uppercase, strip trailing `*` or spaces
      - Normalise `Times`: strip extra spaces. Store raw string as `timesRaw`.
      - Convert `P&D Spaces` and `DP Spaces` to `int` or `null`. If value is the string `"(See above)"`, set to `null`.
      - Classify `type` as `dp_only`, `pd_and_dp`, `pd_only`, or `unknown` per §3.4.
      - Store `extension` as raw string or `null`.

   c. **Geocode** each street via Nominatim. Query format:
      ```
      {STREET}, Dublin, Ireland
      ```
      - Use `requests` with `User-Agent: DublinParkingFinder/1.0 (your@email.com)` header (required by Nominatim ToS)
      - Rate-limit: `time.sleep(1.1)` between each request
      - If the response returns results, take the **first result** and store `lat`, `lng`.
      - If no result, set `lat: null, lng: null` and write the street to `geocode-review.json`.
      - Wrap each geocode call in try/except; on failure, log the street and continue.
      - **Cache results** to a local `geocode-cache.json` so the script can be re-run without re-geocoding already-matched streets.

   d. **Output** two files:
      - `data/parking-data.json` — array of street objects (structure below)
      - `data/geocode-review.json` — array of unmatched street names

2. **JSON structure** for each street object:
```json
{
  "id": 0,
  "street": "ADELAIDE ROAD",
  "pdSpaces": 68,
  "dpSpaces": 16,
  "type": "pd_and_dp",
  "timesRaw": "7.00 AM - 7.00 PM",
  "days": "MONDAY TO SATURDAY",
  "extension": null,
  "lat": 53.3302,
  "lng": -6.2612,
  "geocoded": true
}
```

3. Run the script locally. Expect ~15 minutes for 910 streets. Commit only the output JSON files, not the script's cache files.

4. Check `geocode-review.json`. For important unmatched streets, manually look up coordinates and add them directly to `parking-data.json`. Set `"geocoded": false` on manual entries so they're identifiable.

---

### Phase 1 — Project Scaffold

**Goal:** Working HTML page with map loading.

1. Create `index.html`:
   - `<meta name="viewport" content="width=device-width, initial-scale=1">`
   - Load Leaflet CSS and JS from CDN (cdnjs)
   - Load MarkerCluster CSS and JS from CDN
   - Load `style.css` and `app.js` (deferred)
   - A single `<div id="map">` that fills the viewport
   - A `<div id="ui-overlay">` (position absolute, top: 0, z-index 1000) containing:
     - `#search-bar` (text input + submit button)
     - `#datetime-picker` (date input + time input side by side)
   - A `<div id="street-panel" class="hidden">` (bottom sheet)
   - A `<div id="nav-picker" class="hidden">` (small modal)

2. Create `style.css`:
   - Map fills 100dvh, no margin/padding on body
   - UI overlay is a translucent pill/card at the top, blurred backdrop
   - Street panel slides up from bottom on mobile (transform translateY transition), is a right-side drawer on desktop (min-width: 768px)
   - Marker colours: CSS variables `--red: #E74C3C`, `--yellow: #F1C40F`, `--green: #27AE60`
   - Keep it minimal — no framework. Aim for under 150 lines of CSS.

3. Create `app.js` with a single `init()` function called on `DOMContentLoaded`.

4. In `init()`, initialise the Leaflet map:
   ```js
   const map = L.map('map', {
     center: [53.3498, -6.2603],
     zoom: 13,
     minZoom: 11,
     maxZoom: 18,
     maxBounds: [[53.15, -6.55], [53.55, -6.00]]
   });
   ```
   Add CartoDB Positron tiles with correct attribution.

5. Verify: `index.html` opens in a browser and shows the Dublin map.

---

### Phase 2 — Map & Markers

**Goal:** Load `parking-data.json` and render all 910 markers on the map.

1. In `app.js`, after map init, `fetch('data/parking-data.json')`.

2. Define a `createMarkerIcon(status)` function that returns an `L.divIcon`:
   ```js
   function createMarkerIcon(status) {
     const colours = { red: '#E74C3C', yellow: '#F1C40F', green: '#27AE60' };
     const c = colours[status] || colours.red;
     return L.divIcon({
       className: '',
       html: `<div class="p-marker" style="background:${c}">P</div>`,
       iconSize: [22, 22],
       iconAnchor: [11, 11]
     });
   }
   ```
   Add `.p-marker` to CSS: circular, bold white `P`, small drop shadow, transition on background-color (300ms).

3. Create a `MarkerClusterGroup` and add to map:
   ```js
   const clusterGroup = L.markerClusterGroup({ maxClusterRadius: 40 });
   map.addLayer(clusterGroup);
   ```

4. For each street in the JSON with `lat !== null`:
   - Compute `status = getStatus(street, currentDateTime)` (stub returning `'red'` for now)
   - Create `L.marker([lat, lng], { icon: createMarkerIcon(status) })`
   - Attach `.on('click', () => openPanel(street))`
   - Store marker reference in a `Map<id, marker>` for later re-colouring
   - Add to `clusterGroup`

5. Verify: markers appear on the map. All red for now. Clusters appear at low zoom.

---

### Phase 3 — Time Logic & Colour Coding

**Goal:** Implement `getStatus(street, datetime)` that correctly evaluates parking rules.

1. Implement `parseTimeRange(timesRaw)` → `{ startMins, endMins }`:
   - Normalise: uppercase, collapse multiple spaces, normalise separators (`-`, `TO`, `to`) to `-`
   - Parse AM/PM times and 24h times. 
   - Handle special words: `MIDNIGHT` = 1440 (24 * 60), `NOON` = 720
   - Return `null` if unparseable (will be treated as always-active)
   - Use a series of regex patterns covering all known formats from §3.3
   - Write unit tests as inline assertions at the bottom of the function file (comment them out for production, but run them during development)

2. Implement `parseDays(daysStr)` → `Set<number>` (0=Sun … 6=Sat):
   - `"MONDAY TO FRIDAY"` → `{1,2,3,4,5}`
   - `"MONDAY TO SATURDAY"` → `{1,2,3,4,5,6}`
   - `"MONDAY TO SUNDAY"` → `{0,1,2,3,4,5,6}`
   - `"SATURDAY"` → `{6}`
   - `"SUNDAY"` → `{0}`
   - Unknown → all days (failsafe)

3. Implement `isActive(street, datetime)` → `boolean`:
   - `dayOfWeek = datetime.getDay()`
   - `minutesFromMidnight = datetime.getHours() * 60 + datetime.getMinutes()`
   - Return `true` if `dayOfWeek ∈ parseDays(street.days)` AND `minutesFromMidnight >= startMins` AND `minutesFromMidnight < endMins`
   - If `parseTimeRange` returned `null`, return `true` (treat as always active)

4. Implement `getStatus(street, datetime)` → `'red' | 'yellow' | 'green'`:
   ```
   if !isActive(street, datetime) → 'green'
   else if street.type === 'pd_only' → 'yellow'
   else if street.type === 'pd_and_dp' → 'yellow'   // P&D available
   else → 'red'                                       // DP only
   ```

5. Hook up the datetime picker:
   - On change of either `#date-input` or `#time-input`, call `recolourAllMarkers()`
   - `recolourAllMarkers()` iterates the marker map, calls `getStatus()` per street, calls `marker.setIcon(createMarkerIcon(newStatus))`
   - Set the picker's default value to `new Date()` on init
   - Run a `setInterval` every 60,000ms to update the current time and call `recolourAllMarkers()` (live clock mode)

6. Verify: change the time to 9am Monday → most markers turn red/yellow. Change to Sunday 3am → most turn green.

---

### Phase 4 — Street Detail Panel

**Goal:** Tapping a marker opens a panel with full street info.

1. Implement `openPanel(street)`:
   - Populate `#street-panel` with:
     - `<h2>` street name (title-cased with a helper function)
     - Status banner div (coloured bg, e.g. "🅿 Permit Only — Active Now") 
     - Table or definition list:
       - P&D Spaces: `street.pdSpaces ?? 'Not recorded'`
       - Permit Spaces: `street.dpSpaces ?? 'Not recorded'`
       - Active hours: `street.timesRaw`
       - Days: title-cased days string
       - Extension notes: if `street.extension`, show in a `<small>` note block
     - **Navigate** button: `id="btn-navigate"`
     - **Suggest Update** button: `id="btn-update"`
   - Remove `hidden` class from `#street-panel`
   - Store `currentStreet = street` in module scope

2. Implement panel close:
   - A close `×` button in the panel header adds `hidden` back
   - Tapping the map outside the panel also closes it (`map.on('click', closePanel)`)

3. Title-case helper:
   ```js
   function toTitleCase(str) {
     return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
   }
   ```
   Apply to street name and days string for display.

4. Status banner: call `getStatus(currentStreet, currentDateTime)` and render with the appropriate colour class. Re-render the banner whenever the datetime picker changes (so the panel stays live if left open).

5. Verify: click a marker → panel slides up with correct info.

---

### Phase 5 — Search Bar

**Goal:** Search any Dublin location; map pans there and highlights nearby markers.

1. Add an `input` event listener on `#search-input` with 400ms debounce.

2. On debounce trigger, call Nominatim search:
   ```
   https://nominatim.openstreetmap.org/search
     ?q={encodeURIComponent(query)}
     &format=json
     &limit=5
     &countrycodes=ie
     &viewbox=-6.45,53.20,-6.05,53.45
     &bounded=0
     &addressdetails=1
   ```
   Set `User-Agent` header if using `fetch` in a service worker context; in plain browser fetch this is not settable but Nominatim still works for reasonable usage.

3. Show up to 5 results in `#search-dropdown` (positioned below the input). Each result shows `display_name` truncated to 60 chars.

4. On selecting a result:
   - Hide dropdown
   - Pan map: `map.setView([lat, lon], 16)`
   - Place a temporary pin (blue `L.marker`) at the result location that auto-removes after 10s
   - Call `highlightNearby(lat, lon, 500)` — find all markers within 500m using Leaflet's `distanceTo`, temporarily increase their icon size by 1.4x for 4 seconds

5. Pressing Enter on the input selects the top result automatically.

6. Clear button (×) inside the search input: clears text, hides dropdown, removes temp pin.

7. Verify: search "Grafton Street, Dublin" → map pans, nearby P markers briefly enlarge.

---

### Phase 6 — Navigation Links

**Goal:** Navigate button opens app deep links.

1. On `#btn-navigate` click:
   - Show `#nav-picker` modal (small, centred or anchored above button)
   - Content:
     ```html
     <button id="nav-google">Google Maps</button>
     <button id="nav-waze">Waze</button>
     <button id="nav-apple" class="ios-only">Apple Maps</button>
     ```
   - Apple Maps button: only show if `navigator.platform.includes('iPhone') || navigator.platform.includes('iPad') || /iPad|iPhone|iPod/.test(navigator.userAgent)`

2. On each button click, open in new tab:
   - Google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
   - Waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
   - Apple: `maps://maps.apple.com/?daddr=${lat},${lng}`

3. Use `currentStreet.lat` and `currentStreet.lng` for coordinates.

4. Close `#nav-picker` when clicking outside it or pressing Escape.

---

### Phase 7 — Update Submission

**Goal:** Users can submit rule correction via email.

1. On `#btn-update` click:
   - Toggle an inline form inside the panel (slide down)
   - Fields:
     ```html
     <input type="text" id="upd-street" readonly value="{street.street}">
     <textarea id="upd-message" placeholder="What has changed? (e.g. hours now 8am–8pm Mon–Sat)"></textarea>
     <input type="email" id="upd-email" placeholder="Your email (optional)">
     <button id="upd-submit">Send Update</button>
     ```

2. On `#upd-submit` click:
   - Validate: `#upd-message` is not empty
   - Construct a mailto link:
     ```js
     const subject = encodeURIComponent(`Parking Update: ${street.street}`);
     const body = encodeURIComponent(
       `Street: ${street.street}\n\nUpdate:\n${message}\n\nSubmitted by: ${email || 'Anonymous'}`
     );
     window.location.href = `mailto:YOUR_EMAIL@example.com?subject=${subject}&body=${body}`;
     ```
   - Replace `YOUR_EMAIL@example.com` with the developer's actual email before deploying.
   - Show a success message: "Thanks! Your update will be reviewed."
   - Hide the form after 3 seconds.

3. No backend, no spam risk, no API key. The user's email client opens pre-filled.

---

### Phase 8 — Polish & Performance

**Goal:** Production-ready experience.

1. **Loading state:** Show a centred spinner overlay while `parking-data.json` is fetching. Hide it once markers are rendered.

2. **Error handling:** If `parking-data.json` fails to load, show a user-friendly error banner: "Could not load parking data. Please refresh."

3. **Responsive layout:**
   - Mobile (< 768px): street panel is a bottom sheet, 60% viewport height, scrollable. Search bar collapses to icon on very small screens.
   - Desktop (≥ 768px): street panel is a right-side drawer, 320px wide, full height.

4. **Marker performance:** Do not re-create markers on time change. Only call `marker.setIcon()`. This keeps re-colouring under 50ms for 910 markers.

5. **Cluster configuration:**
   ```js
   L.markerClusterGroup({
     maxClusterRadius: 40,
     disableClusteringAtZoom: 16,
     spiderfyOnMaxZoom: true,
     showCoverageOnHover: false,
   })
   ```
   At zoom 16+ individual markers are always shown.

6. **Favicon:** A small green `P` circle as SVG favicon — inline it in `<head>` as `data:image/svg+xml`.

7. **Footer:** A slim fixed footer with:
   - "Data: Dublin City Council (2011)" 
   - "© OpenStreetMap contributors"
   - If `geocode-review.json` has entries: "ⓘ {N} streets not shown — data incomplete"

8. **Accessibility:**
   - `aria-label` on all icon buttons
   - Keyboard navigation: Escape closes panel and nav picker; Enter submits search
   - Sufficient contrast on all marker colours against map tiles

9. **Meta tags in `<head>`:**
   ```html
   <meta name="description" content="Check Dublin parking permit and pay-and-display rules by street.">
   <meta property="og:title" content="Dublin Parking Finder">
   <meta name="theme-color" content="#27AE60">
   ```

---

## 7. Colour Logic Reference

Quick reference for the agent implementing `getStatus()`:

```
Given: street object, datetime

Step 1: Is parking active at this time?
  → day ∈ parseDays(street.days)?     NO  → GREEN (free)
  → time ∈ [startMins, endMins)?      NO  → GREEN (free)

Step 2: What type of parking is active?
  → type === 'pd_only'    → YELLOW (Pay & Display)
  → type === 'pd_and_dp'  → YELLOW (Pay & Display available)
  → type === 'dp_only'    → RED    (Permit Only)
  → type === 'unknown'    → RED    (assume permit, safe default)
```

**Why `pd_and_dp` shows Yellow, not Red:**  
Streets with both P&D and permit spaces always have some metered spaces available to the public. Red is reserved for permit-only streets where a regular driver genuinely cannot park.

---

## 8. Known Data Issues & Handling

| Issue | Count | Handling |
|-------|-------|---------|
| No space count recorded | 95 streets | Display "Not recorded". Still show marker. |
| DP Spaces = `"(See above)"` | ~5 streets | Treat as `null` in JSON |
| Inconsistent time strings | ~20 patterns | Robust regex parser in Phase 3 |
| Street names with trailing spaces | Many | Strip on import in Phase 0 |
| `EXTENSION` column contains mix of date objects and free text | 271 entries | Stringify all to string in pipeline; display raw in panel |
| Date column has both datetime objects and strings like `"27/1/97"` | 204 | Ignore entirely — not used in the app |
| Duplicate/variant street names (e.g. `AILESBURY ROAD` + `AILESBURY ROAD (Merrion Road -> Sydney Parade)`) | ~10 | Keep both — they may have separate geocoordinates |
| Data last updated 2011 | All | Clearly label "Source: DCC 2011" in footer + update form encourages corrections |

---

## 9. Hosting & Deployment

### GitHub Pages (recommended)

1. Push the project to a GitHub repository (public or private)
2. Go to **Settings → Pages → Source → Deploy from branch → main / root**
3. App is live at `https://{username}.github.io/{repo-name}/`
4. Every push to `main` auto-deploys (no action needed)

### Netlify (alternative)

1. Connect repo to Netlify
2. Build command: *(none — static site)*
3. Publish directory: `/` (root)
4. Free tier: 100GB bandwidth/month, custom domain, HTTPS — more than sufficient

### Vercel (alternative)

Same as Netlify. Also free tier. Use if you prefer Vercel's dashboard.

### Custom Domain (optional)

Add a `CNAME` file with your domain. Point DNS to GitHub Pages or Netlify. Free SSL on all three platforms.

---

## 10. Cost Breakdown

| Service | Usage | Cost |
|---------|-------|------|
| GitHub Pages / Netlify | Hosting | **Free** |
| OpenStreetMap tiles | Map rendering | **Free** (fair use) |
| CartoDB Positron tiles | Map tiles | **Free** |
| Nominatim geocoding | One-time pipeline (910 req) + user searches | **Free** |
| Domain name | Optional | ~€10–15/year |
| **Total monthly** | | **€0** |

**Fair use notes:**
- OpenStreetMap tiles: do not cache tiles server-side or make bulk tile requests. Browser caching is fine.
- Nominatim: 1 req/sec in pipeline, max ~1000 user searches/day across all users. Fine for a small app.
- If the app grows popular (10,000+ daily users doing searches), consider self-hosting Nominatim or switching to a geocoding service with a free tier (e.g. Geoapify 3,000 req/day free).

---

## 11. Future Roadmap

These features are **out of scope for v1** but are worth planning for:

| Feature | Notes |
|---------|-------|
| **Service Worker / PWA** | Cache `parking-data.json` and tiles offline. Add `manifest.json`. |
| **User-contributed data backend** | Replace `mailto:` with a Supabase free tier table. Adds moderation UI. |
| **Route-based parking** | User enters start + end point; app highlights all parking near the route. |
| **Real-time parking sensor data** | DCC has open data APIs — could show live bay occupancy. |
| **DCC data refresh** | The current dataset is from 2011. File a DCC open data request for an updated version. |
| **Dark mode** | CSS custom property swap; use dark CartoDB tiles. |
| **Multi-language** | Irish (Gaeilge) toggle for street names and UI. |

---

*Document prepared for use with Claude Code. Each Phase is designed to be given as a standalone prompt to an agent working in the `dublin-parking/` project directory. Start with Phase 0 locally, commit the JSON output, then hand Phase 1–8 to the Claude Code agent in sequence.*
