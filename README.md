# Dublin Street Parking

A mobile-first interactive map showing Dublin City Council permit and pay-and-display parking rules across the city. See at a glance whether parking on a given street is free, paid, or permit-only — right now, or at any time you choose.

**[dublinstreetparking.ie](https://dublinstreetparking.ie)**

---

## Features

- Interactive map with colour-coded markers — green (free), yellow (pay & display), red (permit only)
- Clearway and bus lane restrictions shown in real time
- Search any Dublin address or landmark
- Tap a street marker to see full parking rules, hours, tariff, and disabled bays
- Time travel — adjust the date/time picker to check rules at any point
- Get directions via Google Maps, Waze, or Apple Maps
- Suggest a correction if rules have changed on your street

## Data

Parking data is sourced from **[data.smartdublin.ie](https://data.smartdublin.ie)** (Dublin City Council open data). It covers permit parking, pay-and-display zones, disabled bays, clearways, and bus lanes across the city.

The base dataset reflects rules as published by Dublin City Council. As on-street signage changes over time, some information may be out of date. If you spot an error, use the **Suggest a correction** button on any street panel — submissions go directly to the maintainer for review.

## Tech

- Vanilla JS, HTML, CSS — no framework, no build step
- [Leaflet.js](https://leafletjs.com) for map rendering
- [CartoDB Positron](https://carto.com/basemaps/) map tiles
- [Photon](https://photon.komoot.io) (Komoot) for address search
- [Web3Forms](https://web3forms.com) for user update submissions
- Fully static — runs on GitHub Pages with no backend

## Local development

```sh
python3 -m http.server 8080
# Open http://localhost:8080
```

`fetch()` requires a local server — opening `index.html` directly from disk will not work.

## Data pipeline

The raw data was downloaded from data.smartdublin.ie and processed via `scripts/build-data.py`, which cleans the spreadsheet, geocodes street names using Photon, and merges clearway/bus lane data from a separate DCC GeoJSON layer. The processed output is committed to the repo — there is no need to re-run the pipeline unless the source data is updated.

## Contributing

If parking rules have changed on a street, use the in-app **Suggest a correction** form. For bugs or feature ideas, open an issue on GitHub.

## License

Data © Dublin City Council, sourced via [data.smartdublin.ie](https://data.smartdublin.ie) under the Creative Commons Attribution 4.0 licence.
