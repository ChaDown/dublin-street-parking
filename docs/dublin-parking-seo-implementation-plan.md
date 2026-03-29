# Dublin Parking SEO — Full Implementation Plan
> Programmatic static page generation for County Dublin street parking data

---

## Overview

Build a system that generates hundreds of targeted static HTML pages from the existing parking dataset. Each page targets a specific search query, contains genuine data-driven content, embeds the live map, and links out to authoritative external sources. All pages are statically generated at build time — no backend required.

---

## Project Structure

```
project/
├── data/
│   ├── parking.json              ← master dataset (all street parking)
│   ├── areas.json                ← Dublin postal areas (D1–D24, county areas)
│   ├── landmarks.json            ← venues/landmarks with coordinates + external URLs
│   └── usecases.json             ← overnight, disabled, EV, free, etc.
├── templates/
│   ├── area.html                 ← template for /parking/dublin-1/
│   ├── landmark.html             ← template for /parking/near-croke-park/
│   ├── usecase.html              ← template for /parking/overnight-parking-dublin/
│   ├── county.html               ← template for broader county pages
│   └── partials/
│       ├── head.html             ← <head> with meta, schema, canonical
│       ├── map-embed.html        ← map iframe/embed focused to area
│       ├── breadcrumb.html       ← structured breadcrumb nav
│       └── footer.html           ← site-wide footer with internal links
├── scripts/
│   ├── generate.js               ← main build script
│   ├── scrape-landmarks.js       ← script to build landmarks.json from data
│   └── validate.js               ← checks every generated page for issues
├── dist/                         ← generated output (deploy this)
│   ├── parking/
│   │   ├── dublin-1/index.html
│   │   ├── dublin-2/index.html
│   │   ├── near-croke-park/index.html
│   │   └── ...
│   └── sitemap.xml               ← auto-generated, all pages
└── package.json
```

---

## Phase 1 — Data Preparation

### 1.1 Master Dataset Schema

Ensure `parking.json` has the following fields per entry. Add any missing fields before generation:

```json
{
  "id": "street-parking-001",
  "name": "Parnell Street North Side",
  "type": "street",
  "lat": 53.3522,
  "lng": -6.2633,
  "address": "Parnell Street, Dublin 1",
  "postcode": "D01",
  "area_slug": "dublin-1",
  "county_area": "dublin-city",
  "price_per_hour": 2.00,
  "price_currency": "EUR",
  "max_stay_hours": 2,
  "hours_start": "08:00",
  "hours_end": "19:00",
  "days_active": ["mon","tue","wed","thu","fri","sat"],
  "overnight_allowed": false,
  "disabled_badge_free": true,
  "ev_charging": false,
  "free_on_sunday": true,
  "pay_and_display": true,
  "permit_zone": null,
  "notes": "Two-hour limit, no return within 1 hour",
  "nearby_landmark_slugs": ["parnell-square", "gate-theatre", "rotunda-hospital"]
}
```

### 1.2 Landmarks Dataset

Build `landmarks.json` — a curated list of major venues, hospitals, universities, stadiums, parks, and transport hubs across County Dublin. This is what powers the "parking near X" pages and the external links.

```json
[
  {
    "slug": "croke-park",
    "name": "Croke Park",
    "type": "stadium",
    "lat": 53.3604,
    "lng": -6.2511,
    "area_slug": "dublin-3",
    "description": "Ireland's largest sports stadium, home of the GAA",
    "external_url": "https://www.crokepark.ie",
    "external_label": "Croke Park official site",
    "wikipedia_url": "https://en.wikipedia.org/wiki/Croke_Park",
    "capacity": 82300,
    "walk_radius_meters": 800
  },
  {
    "slug": "aviva-stadium",
    "name": "Aviva Stadium",
    "type": "stadium",
    "lat": 53.3352,
    "lng": -6.2285,
    "area_slug": "dublin-4",
    "description": "Home of Irish rugby and soccer internationals",
    "external_url": "https://www.avivastadium.ie",
    "external_label": "Aviva Stadium official site",
    "wikipedia_url": "https://en.wikipedia.org/wiki/Aviva_Stadium",
    "capacity": 51700,
    "walk_radius_meters": 600
  },
  {
    "slug": "trinity-college-dublin",
    "name": "Trinity College Dublin",
    "type": "university",
    "lat": 53.3438,
    "lng": -6.2546,
    "area_slug": "dublin-2",
    "description": "Ireland's oldest university, founded 1592",
    "external_url": "https://www.tcd.ie",
    "external_label": "Trinity College Dublin",
    "wikipedia_url": "https://en.wikipedia.org/wiki/Trinity_College_Dublin",
    "walk_radius_meters": 500
  },
  {
    "slug": "dublin-airport",
    "name": "Dublin Airport",
    "type": "transport",
    "lat": 53.4213,
    "lng": -6.2701,
    "area_slug": "fingal",
    "description": "Ireland's busiest airport",
    "external_url": "https://www.dublinairport.com",
    "external_label": "Dublin Airport official site",
    "walk_radius_meters": 1000
  },
  {
    "slug": "st-jamess-hospital",
    "name": "St James's Hospital",
    "type": "hospital",
    "lat": 53.3404,
    "lng": -6.2924,
    "area_slug": "dublin-8",
    "description": "Ireland's largest acute teaching hospital",
    "external_url": "https://www.stjames.ie",
    "external_label": "St James's Hospital",
    "walk_radius_meters": 500
  },
  {
    "slug": "phoenix-park",
    "name": "Phoenix Park",
    "type": "park",
    "lat": 53.3606,
    "lng": -6.3322,
    "area_slug": "dublin-8",
    "description": "One of the largest enclosed public parks in Europe",
    "external_url": "https://www.phoenixpark.ie",
    "external_label": "Phoenix Park visitor information",
    "wikipedia_url": "https://en.wikipedia.org/wiki/Phoenix_Park",
    "walk_radius_meters": 1200
  },
  {
    "slug": "connolly-station",
    "name": "Dublin Connolly Station",
    "type": "transport",
    "lat": 53.3519,
    "lng": -6.2480,
    "area_slug": "dublin-1",
    "description": "Dublin's main intercity rail terminus",
    "external_url": "https://www.irishrail.ie/travel-information/station/dublin-connolly",
    "external_label": "Irish Rail — Connolly Station",
    "walk_radius_meters": 600
  },
  {
    "slug": "heuston-station",
    "name": "Dublin Heuston Station",
    "type": "transport",
    "lat": 53.3465,
    "lng": -6.2939,
    "area_slug": "dublin-8",
    "description": "Major rail terminus serving the west and south of Ireland",
    "external_url": "https://www.irishrail.ie/travel-information/station/dublin-heuston",
    "external_label": "Irish Rail — Heuston Station",
    "walk_radius_meters": 700
  },
  {
    "slug": "grafton-street",
    "name": "Grafton Street",
    "type": "shopping",
    "lat": 53.3406,
    "lng": -6.2594,
    "area_slug": "dublin-2",
    "description": "Dublin's premier pedestrian shopping street",
    "external_url": "https://graftonstreet.ie",
    "external_label": "Grafton Street",
    "walk_radius_meters": 500
  },
  {
    "slug": "dublin-zoo",
    "name": "Dublin Zoo",
    "type": "attraction",
    "lat": 53.3605,
    "lng": -6.3085,
    "area_slug": "dublin-8",
    "description": "One of the world's oldest and most famous zoos",
    "external_url": "https://www.dublinzoo.ie",
    "external_label": "Dublin Zoo official site",
    "walk_radius_meters": 800
  },
  {
    "slug": "dun-laoghaire-pier",
    "name": "Dún Laoghaire Pier",
    "type": "attraction",
    "lat": 53.2935,
    "lng": -6.1355,
    "area_slug": "dun-laoghaire",
    "description": "Popular coastal town and ferry port south of Dublin",
    "external_url": "https://www.dlrcc.ie",
    "external_label": "Dún Laoghaire–Rathdown County Council",
    "walk_radius_meters": 700
  }
]
```

Add at minimum 80–100 landmarks covering: all major GAA clubs, hospitals, DART stations, Luas stops, schools/universities, shopping centres, beaches (Sandymount, Dollymount, Portmarnock), parks, and village centres in the county.

### 1.3 Areas Dataset

```json
[
  { "slug": "dublin-1", "name": "Dublin 1", "label": "D1", "lat": 53.3522, "lng": -6.2576, "description": "Dublin's northside city centre, including O'Connell Street, Parnell Square, and the IFSC." },
  { "slug": "dublin-2", "name": "Dublin 2", "label": "D2", "lat": 53.3376, "lng": -6.2529, "description": "Dublin's southside city centre, including Grafton Street, St Stephen's Green, and Merrion Square." },
  { "slug": "dublin-3", "name": "Dublin 3", "label": "D3", "lat": 53.3621, "lng": -6.2268, "description": "Clontarf, East Wall, and the area surrounding Croke Park." },
  { "slug": "dublin-4", "name": "Dublin 4", "label": "D4", "lat": 53.3256, "lng": -6.2282, "description": "Ballsbridge, Donnybrook, and Sandymount — home of the Aviva Stadium and many embassies." },
  { "slug": "dublin-6", "name": "Dublin 6", "label": "D6", "lat": 53.3179, "lng": -6.2615, "description": "Rathmines, Ranelagh, and Rathgar — popular residential suburbs south of the Grand Canal." },
  { "slug": "dublin-7", "name": "Dublin 7", "label": "D7", "lat": 53.3568, "lng": -6.2905, "description": "Stoneybatter, Phibsborough, and Cabra — a rapidly developing northside inner suburb." },
  { "slug": "dublin-8", "name": "Dublin 8", "label": "D8", "lat": 53.3403, "lng": -6.2886, "description": "The Liberties, Portobello, and the area around Heuston Station and St James's Hospital." },
  { "slug": "dublin-9", "name": "Dublin 9", "label": "D9", "lat": 53.3743, "lng": -6.2456, "description": "Drumcondra, Glasnevin, and Whitehall — northside suburbs close to the city." },
  { "slug": "dublin-12", "name": "Dublin 12", "label": "D12", "lat": 53.3211, "lng": -6.3106, "description": "Crumlin, Walkinstown, and Drimnagh — southside residential suburbs." },
  { "slug": "dublin-14", "name": "Dublin 14", "label": "D14", "lat": 53.3020, "lng": -6.2566, "description": "Dundrum, Rathfarnham, and Churchtown — home of Dundrum Town Centre." },
  { "slug": "dun-laoghaire", "name": "Dún Laoghaire", "label": "Dún Laoghaire", "lat": 53.2935, "lng": -6.1355, "description": "A coastal suburb and former ferry port, known for its pier, restaurants, and DART access." },
  { "slug": "swords", "name": "Swords", "label": "Swords", "lat": 53.4597, "lng": -6.2181, "description": "Fingal's county town, located north of Dublin city and close to Dublin Airport." },
  { "slug": "tallaght", "name": "Tallaght", "label": "Tallaght", "lat": 53.2878, "lng": -6.3742, "description": "South Dublin's largest town, served by the Luas red line." },
  { "slug": "blanchardstown", "name": "Blanchardstown", "label": "Blanchardstown", "lat": 53.3879, "lng": -6.3801, "description": "A major retail and residential hub in west Dublin." }
]
```

---

## Phase 2 — Page Templates

### 2.1 Area Page Template (`/parking/dublin-1/`)

**Target keywords:** `street parking dublin 1`, `parking dublin 1`, `pay and display dublin 1`, `free parking dublin 1`

**Page structure:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <!-- PRIMARY SEO TAGS - generated per page -->
  <title>Street Parking in {{area.name}} | Dublin Parking Map</title>
  <meta name="description" content="Find all street parking in {{area.name}}, Dublin. {{totalSpots}} pay & display locations, prices from €{{minPrice}}/hr. Live map updated daily.">
  <link rel="canonical" href="https://yourdomain.com/parking/{{area.slug}}/">
  
  <!-- Open Graph -->
  <meta property="og:title" content="Street Parking in {{area.name}}">
  <meta property="og:description" content="{{totalSpots}} street parking spots in {{area.name}}. Find prices, hours, and restrictions on the map.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://yourdomain.com/parking/{{area.slug}}/">

  <!-- Structured Data: BreadcrumbList -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://yourdomain.com/" },
      { "@type": "ListItem", "position": 2, "name": "Parking in Dublin", "item": "https://yourdomain.com/parking/" },
      { "@type": "ListItem", "position": 3, "name": "{{area.name}}", "item": "https://yourdomain.com/parking/{{area.slug}}/" }
    ]
  }
  </script>

  <!-- Structured Data: ItemList of parking spots -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Street Parking in {{area.name}}",
    "numberOfItems": {{totalSpots}},
    "itemListElement": [
      {{#each spots}}
      {
        "@type": "ParkingFacility",
        "name": "{{this.name}}",
        "address": "{{this.address}}",
        "geo": { "@type": "GeoCoordinates", "latitude": {{this.lat}}, "longitude": {{this.lng}} },
        "priceRange": "€{{this.price_per_hour}}/hr"
      }{{#unless @last}},{{/unless}}
      {{/each}}
    ]
  }
  </script>
</head>
<body>
  <!-- Breadcrumb nav -->
  <nav aria-label="breadcrumb">
    <a href="/">Home</a> › <a href="/parking/">Parking Dublin</a> › {{area.name}}
  </nav>

  <h1>Street Parking in {{area.name}}</h1>

  <!-- DATA-DRIVEN SUMMARY — generated, not fluff -->
  <div class="parking-summary">
    <p>
      There are <strong>{{totalSpots}} street parking locations</strong> in {{area.name}}.
      Prices range from <strong>€{{minPrice}}/hr to €{{maxPrice}}/hr</strong>.
      {{#if freeSundayCount}}On Sundays, {{freeSundayCount}} locations are free to park.{{/if}}
      {{#if overnightCount}}Overnight parking is permitted at {{overnightCount}} locations.{{/if}}
      {{#if disabledCount}}{{disabledCount}} locations allow free parking with a valid disabled badge.{{/if}}
    </p>
    <p>{{area.description}}</p>
  </div>

  <!-- QUICK STATS BAR -->
  <div class="stats-bar">
    <div><strong>{{totalSpots}}</strong><span>Total spots</span></div>
    <div><strong>€{{avgPrice}}/hr</strong><span>Average price</span></div>
    <div><strong>{{maxStayHours}}hr</strong><span>Max stay</span></div>
    <div><strong>{{#if freeSunday}}Free{{else}}Paid{{/if}}</strong><span>Sundays</span></div>
  </div>

  <!-- EMBEDDED MAP — focused on this area -->
  <div class="map-container">
    <iframe
      src="/?area={{area.slug}}&embed=1"
      width="100%" height="500"
      loading="lazy"
      title="Street parking map for {{area.name}}">
    </iframe>
    <a href="/?area={{area.slug}}" class="open-full-map">Open full map →</a>
  </div>

  <!-- PARKING SPOTS TABLE -->
  <h2>All Street Parking Locations in {{area.name}}</h2>
  <table>
    <thead>
      <tr>
        <th>Location</th>
        <th>Price</th>
        <th>Max Stay</th>
        <th>Hours</th>
        <th>Free Sunday</th>
        <th>Disabled</th>
      </tr>
    </thead>
    <tbody>
      {{#each spots}}
      <tr>
        <td>{{this.name}}</td>
        <td>€{{this.price_per_hour}}/hr</td>
        <td>{{this.max_stay_hours}}hr</td>
        <td>{{this.hours_start}}–{{this.hours_end}}</td>
        <td>{{#if this.free_on_sunday}}✓{{else}}–{{/if}}</td>
        <td>{{#if this.disabled_badge_free}}Free{{else}}Paid{{/if}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <!-- NEARBY LANDMARKS with external links -->
  {{#if nearbyLandmarks.length}}
  <h2>Parking Near Key Locations in {{area.name}}</h2>
  <ul class="landmark-links">
    {{#each nearbyLandmarks}}
    <li>
      <a href="/parking/near-{{this.slug}}/">Parking near {{this.name}}</a>
      — <a href="{{this.external_url}}" target="_blank" rel="noopener">{{this.external_label}}</a>
    </li>
    {{/each}}
  </ul>
  {{/if}}

  <!-- USEFUL CONTEXT: link to DCC/council parking rules -->
  <h2>Parking Rules in {{area.name}}</h2>
  <p>
    Street parking in {{area.name}} is regulated by
    <a href="https://www.dublincity.ie/residential/parking/on-street-parking" target="_blank" rel="noopener">Dublin City Council's on-street parking scheme</a>.
    Pay &amp; display machines accept coins and cards.
    Parking wardens operate 7 days a week including bank holidays.
    Always check the signs at each location for current restrictions.
  </p>
  <p>
    For current parking charges and regulations, see the
    <a href="https://www.dublincity.ie/residential/parking/parking-charges" target="_blank" rel="noopener">Dublin City Council parking charges page</a>.
  </p>

  <!-- INTERNAL LINKS to adjacent areas -->
  <h2>Parking in Nearby Areas</h2>
  <ul>
    {{#each adjacentAreas}}
    <li><a href="/parking/{{this.slug}}/">Street parking in {{this.name}}</a></li>
    {{/each}}
  </ul>

  <!-- INTERNAL LINKS to use-case pages -->
  <h2>Specific Parking Needs in {{area.name}}</h2>
  <ul>
    {{#if overnightCount}}<li><a href="/parking/overnight/{{area.slug}}/">Overnight parking in {{area.name}}</a></li>{{/if}}
    {{#if freeSundayCount}}<li><a href="/parking/free-sunday/{{area.slug}}/">Free Sunday parking in {{area.name}}</a></li>{{/if}}
    {{#if disabledCount}}<li><a href="/parking/disabled/{{area.slug}}/">Disabled parking in {{area.name}}</a></li>{{/if}}
  </ul>
</body>
</html>
```

---

### 2.2 Landmark Page Template (`/parking/near-croke-park/`)

**Target keywords:** `parking near croke park`, `croke park parking`, `where to park for croke park`, `parking croke park match day`

```html
<title>Parking Near {{landmark.name}} | Street Parking Map</title>
<meta name="description" content="Find street parking near {{landmark.name}}, {{landmark.area_name}}. {{nearbyCount}} spots within walking distance. Prices, hours and live map.">

<!-- Structured Data -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Where can I park near {{landmark.name}}?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "There are {{nearbyCount}} street parking locations within {{walkMinutes}} minutes walk of {{landmark.name}}. The closest is {{closestSpot.name}} on {{closestSpot.address}}, approximately {{closestSpot.walkMinutes}} minutes walk away."
      }
    },
    {
      "@type": "Question", 
      "name": "How much does parking near {{landmark.name}} cost?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Street parking near {{landmark.name}} costs between €{{minPrice}} and €{{maxPrice}} per hour. Average price is €{{avgPrice}}/hr."
      }
    },
    {
      "@type": "Question",
      "name": "Is there free parking near {{landmark.name}}?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "{{#if freeSundayCount}}Yes, {{freeSundayCount}} nearby locations offer free parking on Sundays.{{else}}All street parking near {{landmark.name}} is paid. Free parking may be available on residential streets further away.{{/if}}"
      }
    }
  ]
}
</script>

<h1>Street Parking Near {{landmark.name}}</h1>

<p>
  {{landmark.name}} is {{landmark.description}}.
  There are <strong>{{nearbyCount}} street parking locations</strong> within walking distance,
  ranging from <strong>{{minWalkMinutes}}–{{maxWalkMinutes}} minutes on foot</strong>.
</p>

<!-- EXTERNAL LINK TO LANDMARK — key for SEO trust signals -->
<p>
  Planning a visit? See the
  <a href="{{landmark.external_url}}" target="_blank" rel="noopener">{{landmark.external_label}}</a>
  for event schedules, opening times, and visitor information.
  {{#if landmark.wikipedia_url}}
  Learn more about <a href="{{landmark.wikipedia_url}}" target="_blank" rel="noopener">{{landmark.name}} on Wikipedia</a>.
  {{/if}}
</p>

<!-- MAP focused on landmark location -->
<iframe src="/?landmark={{landmark.slug}}&embed=1" ...></iframe>

<!-- SORTED BY DISTANCE table -->
<h2>Closest Parking Spots to {{landmark.name}}</h2>
<table>
  <thead>
    <tr><th>Location</th><th>Walk</th><th>Price</th><th>Max Stay</th><th>Hours</th></tr>
  </thead>
  <tbody>
    {{#each nearbySpots}} <!-- sorted by distance -->
    <tr>
      <td>{{this.name}}</td>
      <td>{{this.walkMinutes}} min</td>
      <td>€{{this.price_per_hour}}/hr</td>
      <td>{{this.max_stay_hours}}hr</td>
      <td>{{this.hours_start}}–{{this.hours_end}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>

<!-- MATCH DAY / EVENT TIPS — genuinely useful content -->
<h2>Parking Tips for {{landmark.name}}</h2>
{{#if landmark.type == 'stadium'}}
<p>
  On match days and major events, street parking fills up quickly in the surrounding area.
  We recommend arriving at least 90 minutes before kick-off to secure a nearby spot.
  Streets to the north and west of {{landmark.name}} typically have more availability than those
  directly adjacent. Alternatively, consider parking further away and using public transport —
  see <a href="https://www.transportforireland.ie" target="_blank" rel="noopener">Transport for Ireland</a>
  for bus and Luas connections to this area.
</p>
{{/if}}
{{#if landmark.type == 'hospital'}}
<p>
  If visiting {{landmark.name}} for an appointment or to see a patient, note that on-street
  parking has time limits of {{nearestMaxStay}} hours. For longer stays, check the hospital's
  own car park on <a href="{{landmark.external_url}}" target="_blank" rel="noopener">their website</a>.
  Disabled badge holders can park free at {{disabledCount}} nearby locations.
</p>
{{/if}}

<!-- TRANSPORT ALTERNATIVES — adds value, earns trust -->
<h2>Getting to {{landmark.name}} Without a Car</h2>
<p>
  If parking is full or you prefer not to drive, {{landmark.name}} is accessible by public transport.
  Check <a href="https://www.transportforireland.ie/plan-a-journey/" target="_blank" rel="noopener">Transport for Ireland's journey planner</a>
  for real-time routes. Dublin Bikes stations are also available nearby —
  see <a href="https://www.dublinbikes.ie" target="_blank" rel="noopener">Dublin Bikes</a> for docking station locations.
</p>
```

---

### 2.3 Use-Case Pages

Generate these cross-cutting pages for each area + use-case combination:

| URL pattern | Target keyword | Filter logic |
|---|---|---|
| `/parking/overnight-parking-dublin/` | overnight parking dublin | `overnight_allowed: true` |
| `/parking/overnight/dublin-1/` | overnight parking dublin 1 | area + overnight |
| `/parking/free-sunday-parking-dublin/` | free parking sunday dublin | `free_on_sunday: true` |
| `/parking/free-sunday/dublin-4/` | free sunday parking dublin 4 | area + free sunday |
| `/parking/disabled-parking-dublin/` | disabled parking dublin | `disabled_badge_free: true` |
| `/parking/disabled/dublin-2/` | disabled parking dublin 2 | area + disabled |
| `/parking/2-hour-parking-dublin/` | 2 hour parking dublin | `max_stay_hours: 2` |
| `/parking/pay-display-dublin/` | pay and display parking dublin | `pay_and_display: true` |

---

## Phase 3 — Build Script

### `scripts/generate.js`

```javascript
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');

// Load data
const parkingData = JSON.parse(fs.readFileSync('./data/parking.json'));
const areas = JSON.parse(fs.readFileSync('./data/areas.json'));
const landmarks = JSON.parse(fs.readFileSync('./data/landmarks.json'));

// Load templates
const areaTemplate = Handlebars.compile(fs.readFileSync('./templates/area.html', 'utf8'));
const landmarkTemplate = Handlebars.compile(fs.readFileSync('./templates/landmark.html', 'utf8'));
const usecaseTemplate = Handlebars.compile(fs.readFileSync('./templates/usecase.html', 'utf8'));

// Helper: distance between two lat/lng points in metres
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Helper: walking minutes from metres (avg 80m/min)
function walkMinutes(metres) {
  return Math.round(metres / 80);
}

// Helper: write file, making dirs if needed
function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  console.log(`✓ ${filePath}`);
}

// --- GENERATE AREA PAGES ---
areas.forEach(area => {
  const spots = parkingData.filter(p => p.area_slug === area.slug);
  if (spots.length === 0) return;

  const prices = spots.map(s => s.price_per_hour).filter(Boolean);
  const nearbyLandmarks = landmarks.filter(l => l.area_slug === area.slug);

  const data = {
    area,
    spots,
    totalSpots: spots.length,
    minPrice: Math.min(...prices).toFixed(2),
    maxPrice: Math.max(...prices).toFixed(2),
    avgPrice: (prices.reduce((a,b) => a+b, 0) / prices.length).toFixed(2),
    maxStayHours: Math.max(...spots.map(s => s.max_stay_hours || 0)),
    freeSundayCount: spots.filter(s => s.free_on_sunday).length,
    overnightCount: spots.filter(s => s.overnight_allowed).length,
    disabledCount: spots.filter(s => s.disabled_badge_free).length,
    nearbyLandmarks,
    adjacentAreas: areas.filter(a2 => a2.slug !== area.slug).slice(0, 5), // TODO: actual adjacency
  };

  writeFile(`./dist/parking/${area.slug}/index.html`, areaTemplate(data));
});

// --- GENERATE LANDMARK PAGES ---
landmarks.forEach(landmark => {
  const nearbySpots = parkingData
    .map(spot => ({
      ...spot,
      distanceMetres: haversineDistance(landmark.lat, landmark.lng, spot.lat, spot.lng),
    }))
    .filter(s => s.distanceMetres <= landmark.walk_radius_meters)
    .sort((a, b) => a.distanceMetres - b.distanceMetres)
    .map(s => ({ ...s, walkMinutes: walkMinutes(s.distanceMetres) }));

  if (nearbySpots.length === 0) return;

  const prices = nearbySpots.map(s => s.price_per_hour).filter(Boolean);

  const data = {
    landmark,
    nearbySpots,
    nearbyCount: nearbySpots.length,
    minPrice: Math.min(...prices).toFixed(2),
    maxPrice: Math.max(...prices).toFixed(2),
    avgPrice: (prices.reduce((a,b) => a+b, 0) / prices.length).toFixed(2),
    minWalkMinutes: Math.min(...nearbySpots.map(s => s.walkMinutes)),
    maxWalkMinutes: Math.max(...nearbySpots.map(s => s.walkMinutes)),
    closestSpot: nearbySpots[0],
    freeSundayCount: nearbySpots.filter(s => s.free_on_sunday).length,
    disabledCount: nearbySpots.filter(s => s.disabled_badge_free).length,
    nearestMaxStay: nearbySpots[0]?.max_stay_hours,
  };

  writeFile(`./dist/parking/near-${landmark.slug}/index.html`, landmarkTemplate(data));
});

// --- GENERATE USE-CASE PAGES ---
const useCases = [
  { slug: 'overnight-parking-dublin', label: 'Overnight Parking', filter: s => s.overnight_allowed },
  { slug: 'free-sunday-parking-dublin', label: 'Free Sunday Parking', filter: s => s.free_on_sunday },
  { slug: 'disabled-parking-dublin', label: 'Disabled Parking', filter: s => s.disabled_badge_free },
  { slug: 'pay-display-dublin', label: 'Pay & Display Parking', filter: s => s.pay_and_display },
];

useCases.forEach(useCase => {
  const matchingSpots = parkingData.filter(useCase.filter);

  writeFile(`./dist/parking/${useCase.slug}/index.html`, usecaseTemplate({
    useCase,
    spots: matchingSpots,
    totalSpots: matchingSpots.length,
    areaBreakdown: areas.map(area => ({
      ...area,
      count: matchingSpots.filter(s => s.area_slug === area.slug).length,
    })).filter(a => a.count > 0),
  }));

  // Also generate per-area use-case pages
  areas.forEach(area => {
    const areaSpots = matchingSpots.filter(s => s.area_slug === area.slug);
    if (areaSpots.length === 0) return;

    writeFile(`./dist/parking/${useCase.slug}/${area.slug}/index.html`, usecaseTemplate({
      useCase,
      area,
      spots: areaSpots,
      totalSpots: areaSpots.length,
    }));
  });
});

// --- GENERATE SITEMAP ---
function getAllHtmlFiles(dir) {
  const results = [];
  fs.readdirSync(dir).forEach(file => {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) results.push(...getAllHtmlFiles(full));
    else if (file.endsWith('.html')) results.push(full);
  });
  return results;
}

const allFiles = getAllHtmlFiles('./dist');
const sitemapUrls = allFiles.map(f => {
  const urlPath = f.replace('./dist', '').replace('index.html', '');
  return `  <url><loc>https://yourdomain.com${urlPath}</loc><changefreq>weekly</changefreq></url>`;
});

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.join('\n')}
</urlset>`;

fs.writeFileSync('./dist/sitemap.xml', sitemap);
console.log(`\n✓ sitemap.xml — ${sitemapUrls.length} URLs`);
console.log('\n🚀 Build complete');
```

---

## Phase 4 — On-Page SEO Checklist

Apply these to every generated page:

### Title Tag Formulas
```
Area page:    "Street Parking in Dublin 1 | Find Pay & Display Spots"
Landmark:     "Parking Near Croke Park | Closest Street Parking Map"
Use-case:     "Free Parking on Sundays in Dublin | All Locations"
```

### Meta Description Formulas
```
Area:      "Find all {N} street parking spots in Dublin 1. Prices from €{X}/hr. 
            See hours, restrictions, and free Sunday parking on the live map."

Landmark:  "{N} street parking spots within walking distance of Croke Park. 
            Closest is {X} mins walk at €{Y}/hr. Live map and full list."

Use-case:  "{N} locations with free Sunday parking across Dublin. 
            Filtered map shows every eligible spot by area."
```

### Internal Linking Rules
- Every area page links to all landmark pages within it
- Every landmark page links to its parent area page
- Every use-case page links back to the relevant area pages
- Every page links to the homepage/full map
- Footer includes links to all area pages (acts as a crawlable sitemap)

### External Links to Include on Every Page Type

| Link | URL | Purpose |
|---|---|---|
| Dublin City Council parking | `https://www.dublincity.ie/residential/parking` | Authority + context |
| DCC parking charges | `https://www.dublincity.ie/residential/parking/parking-charges` | Specific & useful |
| Transport for Ireland | `https://www.transportforireland.ie` | Alt. to parking |
| Dublin Bikes | `https://www.dublinbikes.ie` | Alt. transport |
| Fingal Co. Council (north Dublin) | `https://www.fingal.ie/transport-roads-parking/parking` | For north Dublin pages |
| South Dublin Co. Council | `https://www.sdcc.ie/en/services/roads-and-parking/parking/` | For south Dublin pages |
| DLR County Council | `https://www.dlrcc.ie/parking` | For Dún Laoghaire pages |

---

## Phase 5 — Technical SEO

### 5.1 robots.txt
```
User-agent: *
Allow: /
Sitemap: https://yourdomain.com/sitemap.xml
```

### 5.2 Canonical URLs
Every page must have a `<link rel="canonical">` pointing to its own URL. Prevents duplicate content issues if pages are accessible via multiple routes.

### 5.3 Hreflang
If you ever add Irish language (`ga`) versions, add hreflang. For now, just set `<html lang="en-IE">`.

### 5.4 Page Speed
- Lazy-load the map iframe (`loading="lazy"`)
- Inline critical CSS in `<head>`, defer non-critical
- Keep total page weight under 100KB excluding the map
- Add `<link rel="preconnect">` for any external resources

### 5.5 Core Web Vitals targets
- LCP < 2.5s (serve static HTML from CDN — Netlify/Cloudflare Pages)
- CLS = 0 (set explicit width/height on map iframe)
- FID/INP < 100ms (minimal JS on static pages)

---

## Phase 6 — Deployment

These are static files — deploy for free on any of:

| Platform | Command | Notes |
|---|---|---|
| **Netlify** | `netlify deploy --dir=dist` | Free tier, great CDN |
| **Cloudflare Pages** | Push to GitHub, auto-deploy | Best performance |
| **GitHub Pages** | Push `dist/` to `gh-pages` branch | Free, simple |
| **Vercel** | `vercel --prod` | Free tier |

Add a `package.json` build script:
```json
{
  "scripts": {
    "build": "node scripts/generate.js",
    "build:watch": "nodemon scripts/generate.js",
    "deploy": "npm run build && netlify deploy --dir=dist --prod"
  }
}
```

---

## Phase 7 — Page Count Estimate

| Page type | Count estimate |
|---|---|
| Area pages (D1–D24 + county towns) | ~30 |
| Landmark pages | ~100 |
| Use-case city-wide pages | ~8 |
| Use-case × area combinations | ~120 |
| **Total** | **~260 pages** |

With a good dataset and 100+ landmarks this can scale to 500+ pages easily.

---

## Phase 8 — Post-Launch

1. **Submit sitemap** to Google Search Console immediately after deploy
2. **Request indexing** for the top 10–20 most important pages manually in Search Console
3. **Monitor** Search Console for crawl errors, coverage issues, and first impressions of rankings
4. **Add PostHog** to all generated pages (single script in the `head` partial)
5. **Iterate** — after 4–6 weeks, check which pages are getting impressions, double down on those page types

---

## Summary

```
data/parking.json          → master dataset
data/landmarks.json        → 100+ venues with external URLs
scripts/generate.js        → builds all pages at once
dist/                      → static output, deploy anywhere free
sitemap.xml                → auto-generated, submit to GSC

~260 pages targeting:
  - "parking dublin X" (area pages)
  - "parking near [venue]" (landmark pages)  
  - "overnight/free/disabled parking dublin" (use-case pages)

Every page has:
  - Data-driven content (not fluff)
  - Live map embed
  - External links to venue, council, transport
  - JSON-LD structured data
  - Internal links to related pages
```
