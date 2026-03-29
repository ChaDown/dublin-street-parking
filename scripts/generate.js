'use strict';

const fs   = require('fs');
const path = require('path');
const Handlebars = require('handlebars');

const ROOT = path.resolve(__dirname, '..');
const DIST = ROOT;  // Output directly to project root so /parking/ resolves correctly when served

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function walkMinutes(metres) {
  return Math.ceil(metres / 80); // ~80m/min walking pace
}

function distLabel(metres) {
  return metres < 1000 ? `${Math.round(metres)}m` : `${(metres/1000).toFixed(1)}km`;
}

// ── Data loading ──────────────────────────────────────────────────────────────

function loadAllParking() {
  const files = [
    path.join(ROOT, 'data/dcc/parking_clean.json'),
    path.join(ROOT, 'data/dlr/dlr_clean.json'),
    path.join(ROOT, 'data/fingal/Fingal_clean.json'),
    path.join(ROOT, 'data/sdcc/SDCC_parking_clean.json'),
  ];
  const streets = [];
  for (const f of files) {
    if (fs.existsSync(f)) {
      streets.push(...readJSON(f));
    } else {
      console.warn(`Warning: data file not found: ${f}`);
    }
  }
  // Also load merged file if it exists
  const merged = path.join(ROOT, 'data/parking-data.json');
  if (streets.length === 0 && fs.existsSync(merged)) {
    streets.push(...readJSON(merged));
  }
  return streets;
}

// ── Field derivation ──────────────────────────────────────────────────────────

function parsePricePerHour(tariff) {
  if (!tariff) return null;
  const m = String(tariff).match(/[\d]+\.?[\d]*/);
  if (!m) return null;
  const v = parseFloat(m[0]);
  return v > 0 ? v.toFixed(2) : null;
}

function parseHoursFromTimesRaw(timesRaw) {
  if (!timesRaw) return { start: null, end: null };
  // Try HH.MM-HH.MM or HH:MM-HH:MM
  const m = String(timesRaw).match(/(\d{1,2})[.:h](\d{2})\s*[-–to]+\s*(\d{1,2})[.:h](\d{2})/i);
  if (!m) return { start: null, end: null };
  const pad = n => String(n).padStart(2, '0');
  return {
    start: `${pad(m[1])}:${pad(m[2])}`,
    end:   `${pad(m[3])}:${pad(m[4])}`,
  };
}

function isOvernightAllowed(timesRaw) {
  // If we can parse an end time and it's before 21:00, overnight is allowed
  const { end } = parseHoursFromTimesRaw(timesRaw);
  if (!end) return true; // can't tell — assume allowed
  const [h] = end.split(':').map(Number);
  return h < 21;
}

function isFreeSunday(street) {
  const days = (street.days || '').toLowerCase();
  const extraDays = (street.extraDays || '').toLowerCase();
  // extraDays explicitly covers Sunday with no extra times → Sunday free window confirmed
  if (extraDays.includes('sun') && !street.extraTimes) return true;
  // Primary days don't include Sunday AND no Sunday extraDays → Sunday is free
  if (!days.includes('sun') && !extraDays.includes('sun')) return true;
  return false;
}

function assignAreaSlug(lat, lng, areas) {
  for (const area of areas) {
    const b = area.bounds;
    if (lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax) {
      return area.slug;
    }
  }
  return null;
}

function councilName(slug) {
  const map = {
    'dcc': 'Dublin City Council',
    'dlr': 'Dún Laoghaire-Rathdown County Council',
    'fingal': 'Fingal County Council',
    'sdcc': 'South Dublin County Council',
  };
  return map[slug] || 'Dublin City Council';
}

function normaliseDays(days) {
  if (!days) return null;
  // Shorten long forms
  return days.replace(/MONDAY/gi,'Mon').replace(/TUESDAY/gi,'Tue')
    .replace(/WEDNESDAY/gi,'Wed').replace(/THURSDAY/gi,'Thu')
    .replace(/FRIDAY/gi,'Fri').replace(/SATURDAY/gi,'Sat')
    .replace(/SUNDAY/gi,'Sun').replace(/ TO /gi,'–');
}

function enrichStreet(street, areas) {
  const { start, end } = parseHoursFromTimesRaw(street.timesRaw);
  return {
    ...street,
    name:               street.location,
    price_per_hour:     parsePricePerHour(street.tariff),
    pay_and_display:    street.pd === true,
    disabled_badge_free: (street.disabled_bays || 0) > 0,
    overnight_allowed:  isOvernightAllowed(street.timesRaw),
    free_on_sunday:     isFreeSunday(street),
    hours_start:        start,
    hours_end:          end,
    days_active:        normaliseDays(street.days),
    area_slug:          assignAreaSlug(street.lat, street.lng, areas),
  };
}

// ── Handlebars helpers ────────────────────────────────────────────────────────

Handlebars.registerHelper('plusOne', i => i + 1);
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('pluralise', (n, singular, plural) => n === 1 ? singular : plural);
Handlebars.registerHelper('statsGt1', function() { return this.stats && this.stats.total > 1; });

Handlebars.registerHelper('landmarkIcon', type => {
  const icons = {
    stadium: '🏟', hospital: '🏥', university: '🎓', shopping: '🛍',
    park: '🌳', beach: '🏖', transport: '🚉', attraction: '🏛',
    village: '🏘', default: '📍',
  };
  return icons[type] || icons.default;
});

Handlebars.registerHelper('freeCountGt1', function() { return this.freeCount > 1; });

// ── Use cases ─────────────────────────────────────────────────────────────────

const USE_CASES = [
  {
    slug: 'free-parking-dublin',
    label: 'Free Parking Dublin',
    metaDesc: 'Find free street parking in Dublin',
    intro: 'Free street parking is available in Dublin outside of restricted hours — typically evenings and weekends. These streets have no pay & display requirement at certain times.',
    filter: s => s.free_on_sunday || !s.price_per_hour,
  },
  {
    slug: 'overnight-parking-dublin',
    label: 'Overnight Parking Dublin',
    metaDesc: 'Find overnight street parking in Dublin',
    intro: 'Looking for overnight street parking in Dublin? These streets allow parking outside of restricted daytime hours, making them suitable for overnight stays.',
    filter: s => s.overnight_allowed,
  },
  {
    slug: 'pay-and-display-parking-dublin',
    label: 'Pay & Display Parking Dublin',
    metaDesc: 'Pay & display street parking locations in Dublin',
    intro: 'Pay & display parking requires purchasing a ticket from a roadside machine or using the Payzone app. These streets have pay & display restrictions in force during the day.',
    filter: s => s.pay_and_display,
  },
  {
    slug: 'disabled-parking-dublin',
    label: 'Disabled Parking Dublin',
    metaDesc: 'Streets with disabled parking bays in Dublin',
    intro: 'These streets have designated disabled parking bays. Blue badge holders may also park on single or double yellow lines for up to 3 hours where no loading restrictions apply.',
    filter: s => s.disabled_badge_free,
  },
];

// ── Stat helpers ──────────────────────────────────────────────────────────────

function buildStats(spots) {
  const prices = spots.map(s => s.price_per_hour).filter(Boolean).map(Number);
  return {
    total:        spots.length,
    pdCount:      spots.filter(s => s.pay_and_display).length,
    freeCount:    spots.filter(s => !s.price_per_hour).length,
    disabledCount:spots.filter(s => s.disabled_badge_free).length,
    minPrice:     prices.length ? Math.min(...prices).toFixed(2) : null,
  };
}

function getAdjacentAreas(area, allAreas, streets) {
  // Areas that share streets (have a street within 1km of this area's centre)
  const nearby = allAreas.filter(a => {
    if (a.slug === area.slug) return false;
    const d = haversineDistance(area.lat, area.lng, a.lat, a.lng);
    return d < 5000; // within 5km
  });
  return nearby.slice(0, 6);
}

// ── Main build ─────────────────────────────────────────────────────────────────

function build() {
  console.log('Loading data...');
  const areas     = readJSON(path.join(ROOT, 'data/areas.json'));
  const landmarks = readJSON(path.join(ROOT, 'data/landmarks.json'));
  const rawStreets = loadAllParking();

  if (rawStreets.length === 0) {
    console.error('No parking data found. Aborting.');
    process.exit(1);
  }

  const streets = rawStreets
    .filter(s => s.lat && s.lng)
    .map(s => enrichStreet(s, areas));

  console.log(`Loaded ${streets.length} streets, ${areas.length} areas, ${landmarks.length} landmarks`);

  // Build area lookup map
  const areaBySlug = Object.fromEntries(areas.map(a => [a.slug, a]));
  areas.forEach(a => { a.council_name = councilName(a.council); });

  // Attach area_name to streets
  streets.forEach(s => {
    if (s.area_slug && areaBySlug[s.area_slug]) {
      s.area_name = areaBySlug[s.area_slug].name;
    }
  });

  // Compile templates
  const areaTpl     = Handlebars.compile(fs.readFileSync(path.join(ROOT, 'templates/area.html'), 'utf8'));
  const landmarkTpl = Handlebars.compile(fs.readFileSync(path.join(ROOT, 'templates/landmark.html'), 'utf8'));
  const usecaseTpl  = Handlebars.compile(fs.readFileSync(path.join(ROOT, 'templates/usecase.html'), 'utf8'));
  const hubTpl      = Handlebars.compile(fs.readFileSync(path.join(ROOT, 'templates/hub.html'), 'utf8'));

  const sitemapUrls = ['https://dublinstreetparking.ie/'];

  // ── Landmark pages (first pass — build set of generated slugs) ──
  console.log('Generating landmark pages...');
  const generatedLandmarkSlugs = new Set();
  for (const landmark of landmarks) {
    const nearby = streets
      .filter(s => s.lat && s.lng)
      .map(s => {
        const dist = haversineDistance(landmark.lat, landmark.lng, s.lat, s.lng);
        return { ...s, _dist: dist, walkMins: walkMinutes(dist) };
      })
      .filter(s => s._dist <= (landmark.walk_radius_meters || 800))
      .sort((a, b) => a._dist - b._dist);

    if (nearby.length === 0) {
      console.log(`  Skipping ${landmark.slug} (no nearby spots)`);
      continue;
    }

    const area = areaBySlug[landmark.area_slug] || areas[0];
    const prices = nearby.map(s => s.price_per_hour).filter(Boolean).map(Number);
    const freeCount = nearby.filter(s => !s.price_per_hour).length;
    const closest = nearby[0];

    let typeSpecificTip = null;
    if (landmark.type === 'stadium') {
      typeSpecificTip = {
        class: 'warning',
        title: 'Match day parking advice',
        body: 'On match days, streets near this venue fill up early. Arrive at least 90 minutes before kick-off or consider public transport. Some nearby streets may be closed to non-permit holders.',
      };
    } else if (landmark.type === 'hospital') {
      typeSpecificTip = {
        class: '',
        title: 'Hospital parking advice',
        body: 'If visiting for an appointment or long-term visit, street parking nearby may be time-limited. Consider the hospital\'s own car park for stays longer than 2–3 hours.',
      };
    }

    const html = landmarkTpl({
      landmark,
      area,
      nearbySpots:   nearby,
      nearbyCount:   nearby.length,
      walkRadiusLabel: distLabel(landmark.walk_radius_meters || 800),
      closestSpot:   closest.name,
      closestDist:   distLabel(closest._dist),
      minPrice:      prices.length ? Math.min(...prices).toFixed(2) : null,
      freeCount,
      freeCountGt1:  freeCount > 1,
      typeSpecificTip,
      allAreas:      areas,
    });

    const outPath = path.join(DIST, 'parking', `near-${landmark.slug}`, 'index.html');
    writeFile(outPath, html);
    sitemapUrls.push(`https://dublinstreetparking.ie/parking/near-${landmark.slug}/`);
    generatedLandmarkSlugs.add(landmark.slug);
    console.log(`  ✓ /parking/near-${landmark.slug}/ (${nearby.length} spots)`);
  }

  // ── Area pages ──
  console.log('Generating area pages...');
  for (const area of areas) {
    const spots = streets.filter(s => s.area_slug === area.slug);
    if (spots.length === 0) {
      console.log(`  Skipping ${area.slug} (no spots)`);
      continue;
    }

    // Only include landmarks that have generated pages (have nearby spots)
    const areaLandmarks = landmarks.filter(l => l.area_slug === area.slug && generatedLandmarkSlugs.has(l.slug));
    const adjacentAreas = getAdjacentAreas(area, areas, streets);
    const stats = buildStats(spots);
    const topSpots = spots.slice(0, 10);

    const html = areaTpl({
      area,
      spots,
      topSpots,
      stats,
      landmarks: areaLandmarks,
      adjacentAreas,
      allAreas: areas,
      useCases: USE_CASES.map(uc => ({
        slug: uc.slug,
        label: uc.label,
        count: spots.filter(uc.filter).length,
      })).filter(uc => uc.count > 0),
    });

    const outPath = path.join(DIST, 'parking', area.slug, 'index.html');
    writeFile(outPath, html);
    sitemapUrls.push(`https://dublinstreetparking.ie/parking/${area.slug}/`);
    console.log(`  ✓ /parking/${area.slug}/ (${spots.length} spots)`);
  }

  // ── Hub / index page ──
  console.log('Generating hub page...');
  const streetsByArea = {};
  for (const s of streets) {
    if (s.area_slug) (streetsByArea[s.area_slug] = streetsByArea[s.area_slug] || []).push(s);
  }
  const hubHtml = hubTpl({
    areas: areas.map(a => ({ ...a, spotCount: (streetsByArea[a.slug] || []).length })).filter(a => a.spotCount > 0),
    useCases: USE_CASES.map(uc => ({ slug: uc.slug, label: uc.label })),
    landmarks: [...generatedLandmarkSlugs].map(slug => landmarks.find(l => l.slug === slug)).filter(Boolean),
    allAreas: areas,
  });
  writeFile(path.join(DIST, 'parking', 'index.html'), hubHtml);
  sitemapUrls.splice(1, 0, 'https://dublinstreetparking.ie/parking/');
  console.log('  ✓ /parking/ (hub page)');

  // ── Use-case pages (city-wide + per-area) ──
  console.log('Generating use-case pages...');
  for (const uc of USE_CASES) {
    const allMatching = streets.filter(uc.filter);

    // City-wide page
    const areaBreakdown = areas
      .map(a => ({ ...a, count: allMatching.filter(s => s.area_slug === a.slug).length }))
      .filter(a => a.count > 0)
      .sort((a, b) => b.count - a.count);

    const cityHtml = usecaseTpl({
      useCase:      uc,
      area:         null,
      spots:        allMatching.slice(0, 100),
      stats:        buildStats(allMatching),
      statsGt1:     allMatching.length > 1,
      areaBreakdown,
      allAreas:     areas,
    });
    writeFile(path.join(DIST, 'parking', uc.slug, 'index.html'), cityHtml);
    sitemapUrls.push(`https://dublinstreetparking.ie/parking/${uc.slug}/`);
    console.log(`  ✓ /parking/${uc.slug}/ (${allMatching.length} total)`);

    // Per-area pages
    for (const area of areas) {
      const areaSpots = allMatching.filter(s => s.area_slug === area.slug);
      if (areaSpots.length === 0) continue;

      const otherAreas = areaBreakdown.filter(a => a.slug !== area.slug);
      const areaHtml = usecaseTpl({
        useCase:      uc,
        area,
        spots:        areaSpots,
        stats:        buildStats(areaSpots),
        statsGt1:     areaSpots.length > 1,
        areaBreakdown: otherAreas,
        allAreas:     areas,
      });
      writeFile(path.join(DIST, 'parking', uc.slug, area.slug, 'index.html'), areaHtml);
      sitemapUrls.push(`https://dublinstreetparking.ie/parking/${uc.slug}/${area.slug}/`);
    }
  }

  // ── Sitemap ──
  console.log('Generating sitemap...');
  const today = new Date().toISOString().split('T')[0];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((url, i) => `  <url>
    <loc>${url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${i === 0 ? 'weekly' : 'monthly'}</changefreq>
    <priority>${i === 0 ? '1.0' : '0.7'}</priority>
  </url>`).join('\n')}
</urlset>`;

  writeFile(path.join(ROOT, 'sitemap.xml'), sitemap);

  console.log(`\n✅ Build complete!`);
  console.log(`   ${sitemapUrls.length} pages generated → parking/`);
  console.log(`   Sitemap: sitemap.xml`);
}

build();
