// Dublin Street Parking — app.js
// Phases 2–8: markers, time logic, panel, search, navigation, update form, polish

'use strict';

// ── State ──────────────────────────────────────────────────────────────────────
let map;
let clusterGroup;
let accessibleClusterGroup;
let evClusterGroup;
const markerMap = new Map();           // id → { marker, street }
const accessibleMarkerMap = new Map(); // id → { marker, bay }
const evMarkerMap = new Map();         // id → { marker, charger }
let currentStreet = null;
let currentAccessibleBay = null;
let currentEvCharger = null;
let currentDateTime = new Date();
let searchPin = null;
let searchHighlightTimer = null;
let clockInterval = null;
let searchDebounceTimer = null;
const filters = { cars: true, accessible: false, freeOnly: false, ev: false };
let manualOverride = false;

// ── Plan Mode state ────────────────────────────────────────────────────────────
const planState = {
  address: '', lat: null, lng: null,
  startISO: '', endISO: '',
  sortBy: 'distance', maxDistance: '',
  results: [], hasResults: false,
};

// ── Init ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

function init() {
  initMap();
  initDatetimePicker();
  initSearchBar();
  initPanel();
  initNavPicker();
  initFilters();
  initPlanMode();
  loadData();
}

// ── Phase 1: Map ───────────────────────────────────────────────────────────────
function initMap() {
  map = L.map('map', {
    center: [53.3498, -6.2603],
    zoom: 13,
    minZoom: 11,
    maxZoom: 18,
    maxBounds: [[53.15, -6.55], [53.65, -5.95]],
    zoomControl: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  map.on('click', () => {
    closePanel();
    closeNavPicker();
  });
}

// ── Phase 2: Load data & render markers ────────────────────────────────────────
async function loadData() {
  try {
    const [dccRes, fingalRes, dlrRes, sdccRes] = await Promise.all([
      fetch('data/dcc/parking_clean.json'),
      fetch('data/fingal/Fingal_clean.json'),
      fetch('data/dlr/dlr_clean.json'),
      fetch('data/sdcc/SDCC_parking_clean.json'),
    ]);
    if (!dccRes.ok) throw new Error(`HTTP ${dccRes.status}`);
    if (!fingalRes.ok) throw new Error(`HTTP ${fingalRes.status}`);
    if (!dlrRes.ok) throw new Error(`HTTP ${dlrRes.status}`);
    if (!sdccRes.ok) throw new Error(`HTTP ${sdccRes.status}`);
    const dccStreets = await dccRes.json();
    const fingalStreets = await fingalRes.json();
    const dlrStreets = await dlrRes.json();
    const sdccStreets = await sdccRes.json();
    // Namespace IDs to avoid collisions across councils
    for (const s of fingalStreets) s.id = 100000 + s.id;
    for (const s of dlrStreets)    s.id = 200000 + s.id;
    for (const s of sdccStreets)   s.id = 300000 + s.id;
    const streets = [...dccStreets, ...fingalStreets, ...dlrStreets, ...sdccStreets];

    clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 40,
      disableClusteringAtZoom: 16,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      chunkedLoading: true,
    });
    map.addLayer(clusterGroup);

    for (const street of streets) {
      if (street.lat === null || street.lng === null) continue;

      const status = getStatus(street, currentDateTime);
      const marker = L.marker([street.lat, street.lng], {
        icon: createMarkerIcon(status),
        title: street.location,
      });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        openPanel(street);
      });

      clusterGroup.addLayer(marker);
      markerMap.set(street.id, { marker, street });
    }

    loadAccessibleData();
    loadEvData();

  } catch (err) {
    console.error('Failed to load parking data:', err);
    document.getElementById('error-banner').classList.remove('hidden');
  } finally {
    document.getElementById('loading').classList.add('hidden');
  }
}

async function loadAccessibleData() {
  try {
    const [dccRes, dlrRes, fingalRes, sdccRes] = await Promise.all([
      fetch('data/dcc/disabled_clean.json'),
      fetch('data/dlr/disabled_clean.json'),
      fetch('data/fingal/disabled_clean.json'),
      fetch('data/sdcc/disabled_clean.json'),
    ]);
    if (!dccRes.ok) throw new Error(`HTTP ${dccRes.status}`);
    if (!dlrRes.ok) throw new Error(`HTTP ${dlrRes.status}`);
    if (!fingalRes.ok) throw new Error(`HTTP ${fingalRes.status}`);
    if (!sdccRes.ok) throw new Error(`HTTP ${sdccRes.status}`);
    const dccBays    = await dccRes.json();
    const dlrBays    = await dlrRes.json();
    const fingalBays = await fingalRes.json();
    const sdccBays   = await sdccRes.json();
    for (const b of dlrBays)    b.id = 200000 + b.id;
    for (const b of fingalBays) b.id = 100000 + b.id;
    for (const b of sdccBays)   b.id = 300000 + b.id;
    const bays = [...dccBays, ...dlrBays, ...fingalBays, ...sdccBays];

    accessibleClusterGroup = L.markerClusterGroup({
      maxClusterRadius: 40,
      disableClusteringAtZoom: 16,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      chunkedLoading: true,
      iconCreateFunction(cluster) {
        return L.divIcon({
          className: '',
          html: `<div class="d-cluster">${cluster.getChildCount()}</div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });
      },
    });

    for (const bay of bays) {
      const marker = L.marker([bay.lat, bay.lng], {
        icon: createAccessibleMarkerIcon(),
        title: bay.location,
      });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        openAccessiblePanel(bay);
      });
      accessibleClusterGroup.addLayer(marker);
      accessibleMarkerMap.set(bay.id, { marker, bay });
    }
    // Don't add to map — controlled by filters.accessible checkbox
  } catch (err) {
    console.error('Failed to load accessible bay data:', err);
  }
}

async function loadEvData() {
  try {
    const res = await fetch('data/ev_chargers_dublin.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const chargers = await res.json();

    evClusterGroup = L.markerClusterGroup({
      maxClusterRadius: 40,
      disableClusteringAtZoom: 16,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      chunkedLoading: true,
      iconCreateFunction(cluster) {
        return L.divIcon({
          className: '',
          html: `<div class="ev-cluster">${cluster.getChildCount()}</div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });
      },
    });

    for (const charger of chargers) {
      if (!charger.in_service) continue;
      if (charger.lat === null || charger.lng === null) continue;
      const marker = L.marker([charger.lat, charger.lng], {
        icon: createEvMarkerIcon(),
        title: charger.location,
      });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        openEvPanel(charger);
      });
      evClusterGroup.addLayer(marker);
      evMarkerMap.set(charger.id, { marker, charger });
    }
    // Don't add to map — controlled by filters.ev checkbox
  } catch (err) {
    console.error('Failed to load EV charger data:', err);
  }
}

// ── Phase 2: Marker icon ────────────────────────────────────────────────────────
function createMarkerIcon(status, highlighted = false) {
  const colours = { red: '#E74C3C', yellow: '#F39C12', green: '#27AE60', clearway: '#E74C3C' };
  const c = colours[status] || colours.red;
  const cls = `p-marker${highlighted ? ' highlighted' : ''}`;
  return L.divIcon({
    className: '',
    html: `<div class="${cls}" style="background:${c}">P</div>`,
    iconSize: highlighted ? [31, 31] : [22, 22],
    iconAnchor: highlighted ? [15, 15] : [11, 11],
  });
}

const DIS_PATHS = `
  <path d="M820.0921,500.2994c81.4852-7.5218,144.7921-77.7248,144.7921-159.8362,0-88.38-72.0826-160.4632-160.463-160.4632s-160.4617,72.0832-160.4617,160.4632c0,26.9527,7.5214,54.5319,20.0574,77.7246l57.175,804.5238,588.8577.161,241.5254,565.9059,317.1013-124.3625-49.1036-116.923-177.4651,64.06-233.6879-539.5145-547.5099,3.6787-7.5173-101.8869,396.3556.1584v-150.7529l-411.4722-.1603-18.1838-322.7761Z" fill="white" fill-rule="evenodd"/>
  <path d="M1412.3283,1654.099c-99.3879,196.4652-307.4101,325.901-529.2995,325.901-325.9,0-591.7051-265.8058-591.7051-591.7061,0-228.8246,138.6814-441.4683,345.6229-535.731l13.3909,174.7597c-122.3991,77.1286-197.8512,216.2961-197.8512,362.1696,0,236.4158,192.8213,429.2382,429.2369,429.2382,216.2951,0,400.7333-165.9942,425.8839-378.9373l104.7213,214.3059Z" fill="white" fill-rule="evenodd"/>`;

function createAccessibleMarkerIcon() {
  const svg = `<svg viewBox="0 0 2160 2160" xmlns="http://www.w3.org/2000/svg"><rect width="2160" height="2160" rx="290" ry="290" fill="#003f87"/>${DIS_PATHS}</svg>`;
  return L.divIcon({
    className: '',
    html: `<div class="d-marker">${svg}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function createEvMarkerIcon() {
  const svg = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="4" ry="4" fill="#27AE60"/>
    <polygon points="13,2 7,13 11,13 9,22 19,11 14,11" fill="white"/>
  </svg>`;
  return L.divIcon({
    className: '',
    html: `<div class="ev-marker">${svg}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// ── Phase 3: Time logic ────────────────────────────────────────────────────────

/**
 * Parse a raw time string from the dataset into { startMins, endMins }.
 * Both values are minutes from midnight. Returns null if unparseable.
 */
function parseTimeRange(timesRaw) {
  if (!timesRaw) return null;

  let s = timesRaw.toUpperCase().trim();

  // Strip leaked day text after MIDNIGHT (e.g. "12 MIDNIGHTMONDAY TO SATURDAY")
  s = s.replace(/(MIDNIGHT)(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)/, '$1');

  // Collapse multiple spaces, normalise dashes and "TO" as separator
  s = s.replace(/\s{2,}/g, ' ');
  s = s.replace(/\s*[-–—]\s*/g, ' - ');
  // Normalise "TO" only when surrounded by time-like tokens (not "MONDAY TO FRIDAY")
  s = s.replace(/(\d)\s+TO\s+(\d)/g, '$1 - $2');         // "7 TO 12"
  s = s.replace(/(\d)(AM|PM)\s+TO\s+/gi, '$1$2 - ');      // "7.00AM TO"
  s = s.replace(/(AM|PM)\s+TO\s+(\d)/gi, '$1 - $2');      // "7.00 AM TO 9"

  // Split on separator
  const parts = s.split(' - ');
  if (parts.length < 2) return null;

  const start = parseTimePart(parts[0].trim());
  const end   = parseTimePart(parts[1].trim());
  if (start === null || end === null) return null;

  // Heuristic: if no AM/PM given and end < start, assume end is PM
  // e.g. "8 to 6.30" → 480 to 390 → fix end to 390+720=1110
  let endMins = end;
  if (endMins < start && endMins < 720) endMins += 720;

  return { startMins: start, endMins: endMins };
}

function parseTimePart(part) {
  // MIDNIGHT → 1440, NOON → 720 (check before stripping)
  if (/MIDNIGHT/.test(part)) return 1440;
  if (/NOON/.test(part))     return 720;

  // Normalise A.M. / P.M. / A.M / P.M variants → AM / PM
  part = part.replace(/A\.M\.?/gi, 'AM').replace(/P\.M\.?/gi, 'PM');

  // Strip trailing punctuation and whitespace (commas, dots, etc.)
  part = part.replace(/[,.\s]+$/, '').trim();

  // Strip trailing "HRS" / "HOURS"
  part = part.replace(/\s*(HRS?|HOURS?)$/i, '').trim();

  // Collapse double dots (typo: "4..00" → "4.00")
  part = part.replace(/\.{2,}/g, '.');

  // Match: optional leading zero, decimal/colon separator, optional AM/PM
  // Also handles "7.00AM" (no space before AM)
  const m = part.match(/^(\d{1,2})(?:[.:](\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;

  let hours    = parseInt(m[1], 10);
  const mins   = m[2] ? parseInt(m[2], 10) : 0;
  const ampm   = m[3] ? m[3].toUpperCase() : null;

  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  return hours * 60 + mins;
}

/**
 * Parse a days string into a Set of day numbers (0=Sun … 6=Sat).
 * Handles both new abbreviated format (Mon-Sat) and old uppercase format.
 */
function parseDays(daysStr) {
  if (!daysStr) return new Set([0,1,2,3,4,5,6]);
  const s = daysStr.trim();

  // New abbreviated format: "Mon-Fri", "Mon-Sat", "Mon-Sun", "Tue-Sat", "Sat", "Sun", etc.
  const dayIndex = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:0 };
  const order = [1, 2, 3, 4, 5, 6, 0]; // Mon through Sun

  const abbrev = s.match(/^([A-Z][a-z]{2})(?:-([A-Z][a-z]{2}))?$/);
  if (abbrev) {
    const startDay = dayIndex[abbrev[1]];
    const endDay   = abbrev[2] !== undefined ? dayIndex[abbrev[2]] : undefined;
    if (startDay !== undefined) {
      if (endDay === undefined) return new Set([startDay]); // single day
      const startIdx = order.indexOf(startDay);
      const endIdx   = order.indexOf(endDay);
      const result   = new Set();
      if (startIdx <= endIdx) {
        for (let i = startIdx; i <= endIdx; i++) result.add(order[i]);
      } else {
        for (let i = startIdx; i < order.length; i++) result.add(order[i]);
        for (let i = 0; i <= endIdx; i++) result.add(order[i]);
      }
      return result;
    }
  }

  // Old uppercase format
  const u = s.toUpperCase();
  if (u === 'MONDAY TO FRIDAY')   return new Set([1,2,3,4,5]);
  if (u === 'MONDAY TO SATURDAY') return new Set([1,2,3,4,5,6]);
  if (u === 'MONDAY TO SUNDAY')   return new Set([0,1,2,3,4,5,6]);
  if (u === 'SATURDAY')           return new Set([6]);
  if (u === 'SUNDAY')             return new Set([0]);
  return new Set([0,1,2,3,4,5,6]); // failsafe
}

/**
 * Is the given day+time within the given days string and time range?
 */
function isInPeriod(daysStr, timesRaw, dt) {
  const dayOfWeek = dt.getDay();
  const minutesFromMidnight = dt.getHours() * 60 + dt.getMinutes();

  const days = parseDays(daysStr);
  if (!days.has(dayOfWeek)) return false;

  const timeRange = parseTimeRange(timesRaw);
  if (!timeRange) return true; // unparseable → treat as always active

  return minutesFromMidnight >= timeRange.startMins && minutesFromMidnight < timeRange.endMins;
}

/**
 * Is parking active for this street at the given datetime?
 * Checks both main period and extra period (e.g. Sunday hours).
 */
function isActive(street, dt) {
  if (isInPeriod(street.days, street.timesRaw, dt)) return true;
  if (street.extraDays && street.extraTimes) {
    return isInPeriod(street.extraDays, street.extraTimes, dt);
  }
  return false;
}

/**
 * Get the marker status colour string for a street at a given datetime.
 */
function isClearwayActive(street, dt) {
  if (!street.clearway) return false;
  if (!parseDays(street.days).has(dt.getDay())) return false;
  const mins = dt.getHours() * 60 + dt.getMinutes();
  if (!street.clearway_windows) {
    // No specific windows parsed — clearway whenever parking is not active
    return !isActive(street, dt);
  }
  return street.clearway_windows.some(([start, end]) => mins >= start && mins < end);
}

/**
 * Returns true if a street is suitable for public parking throughout [startDt, endDt].
 * Excludes permit-only streets and any with a clearway/bus lane during that window.
 * Sampled at 15-minute intervals.
 */
function isFullyParkable(street, startDt, endDt) {
  if (street.dp && !street.pd) return false; // permit-only
  const step = 15 * 60 * 1000;
  for (let t = startDt.getTime(); t <= endDt.getTime(); t += step) {
    if (isClearwayActive(street, new Date(t))) return false;
  }
  return true;
}

/**
 * Returns estimated parking cost (€) for the window [startDt, endDt].
 * Parses tariff string (e.g. "€3.20") for the hourly rate.
 * Samples at 15-minute intervals to count paid intervals.
 */
function calculateParkingCost(street, startDt, endDt) {
  const match = (street.tariff || '').match(/[\d]+\.?[\d]*/);
  if (!match) return 0;
  const ratePerHour = parseFloat(match[0]);
  if (!ratePerHour || isNaN(ratePerHour)) return 0;
  const step = 15 * 60 * 1000;
  let paidIntervals = 0;
  for (let t = startDt.getTime(); t <= endDt.getTime(); t += step) {
    if (isActive(street, new Date(t))) paidIntervals++;
  }
  return paidIntervals * 0.25 * ratePerHour;
}

function getStatus(street, dt) {
  if (isActive(street, dt)) {
    if (!street.pd && street.dp) return 'red';  // permit only
    return 'yellow';                             // pay & display (± permit)
  }
  if (isClearwayActive(street, dt)) return 'clearway';
  return 'green';
}

// ── Phase 3: Datetime picker ────────────────────────────────────────────────────
function setPickerToNow() {
  const dateInput = document.getElementById('date-input');
  const timeInput = document.getElementById('time-input');
  const now = new Date();
  dateInput.value = toDateInputValue(now);
  timeInput.value = toTimeInputValue(now);
  currentDateTime = now;
}

function initDatetimePicker() {
  const dateInput = document.getElementById('date-input');
  const timeInput = document.getElementById('time-input');

  setPickerToNow();

  dateInput.addEventListener('change', () => { dateInput.blur(); onDatetimeChange(); });
  timeInput.addEventListener('change', onDatetimeChange);

  // Live clock — update every minute when picker hasn't been manually changed
  dateInput.addEventListener('change', () => { manualOverride = true; });
  timeInput.addEventListener('change', () => { manualOverride = true; });

  // Now button — toggle expanded section + reset to current time
  document.getElementById('now-btn').addEventListener('click', () => {
    setPickerToNow();
    manualOverride = false;
    recolourAllMarkers();
    const overlay = document.getElementById('ui-overlay');
    const expanded = overlay.classList.toggle('expanded');
    document.getElementById('burger-btn').setAttribute('aria-expanded', expanded);
  });

  clockInterval = setInterval(() => {
    if (!manualOverride) {
      setPickerToNow();
      recolourAllMarkers();
    }
  }, 60000);
}

function onDatetimeChange() {
  const dateVal = document.getElementById('date-input').value;
  const timeVal = document.getElementById('time-input').value;
  if (!dateVal || !timeVal) return;
  currentDateTime = new Date(`${dateVal}T${timeVal}`);
  recolourAllMarkers();
  // If panel is open, refresh its status banner
  if (currentStreet) updatePanelBanner(currentStreet);
}

function recolourAllMarkers() {
  for (const [, { marker, street }] of markerMap) {
    const status = getStatus(street, currentDateTime);
    marker.setIcon(createMarkerIcon(status));
  }
  applyFilters();
}

function toDateInputValue(d) {
  // Use local date, not UTC (toISOString() returns UTC which can be wrong date)
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function toTimeInputValue(d) {
  return d.toTimeString().slice(0, 5);
}

// ── Phase 4: Street panel ──────────────────────────────────────────────────────
function initPanel() {
  document.getElementById('panel-close').addEventListener('click', closePanel);
  document.getElementById('btn-navigate').addEventListener('click', openNavPicker);
  document.getElementById('btn-update').addEventListener('click', toggleUpdateForm);
  document.getElementById('upd-submit').addEventListener('click', submitUpdate);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePlanSheet();
      closePanel();
      closeNavPicker();
      closeSearchDropdown();
    }
  });
}

// ── Dynamic parking sign SVG ────────────────────────────────────────────────

function escSVG(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function minsToTime(m) {
  if (m >= 1440) return '24:00';
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function signTime(timesRaw) {
  const r = parseTimeRange(timesRaw);
  if (!r) return timesRaw || '—';
  return `${minsToTime(r.startMins)} – ${minsToTime(r.endMins)}`;
}

function signDays(daysStr) {
  const s = (daysStr || '').trim();
  const map = {
    // New abbreviated format
    'Mon-Fri': { en: 'MON – FRI', ga: 'Luain – Aoine' },
    'Mon-Sat': { en: 'MON – SAT', ga: 'Luain – Sath'  },
    'Mon-Sun': { en: 'MON – SUN', ga: 'Luain – Dom'   },
    'Tue-Sat': { en: 'TUE – SAT', ga: 'Máirt – Sath'  },
    'Wed-Sat': { en: 'WED – SAT', ga: 'Céad – Sath'   },
    'Sat':     { en: 'SAT',       ga: 'Satharn'        },
    'Sun':     { en: 'SUN',       ga: 'Domhnach'       },
    // Old uppercase format
    'MONDAY TO FRIDAY':   { en: 'MON – FRI', ga: 'Luain – Aoine' },
    'MONDAY TO SATURDAY': { en: 'MON – SAT', ga: 'Luain – Sath'  },
    'MONDAY TO SUNDAY':   { en: 'MON – SUN', ga: 'Luain – Dom'   },
    'SATURDAY':           { en: 'SAT',        ga: 'Satharn'       },
    'SUNDAY':             { en: 'SUN',        ga: 'Domhnach'      },
  };
  return map[s] || { en: s || '—', ga: '' };
}

// Zone colours matching Dublin City Council zones
const ZONE_COLOURS = {
  Yellow: '#FCD301',
  Red:    '#CE1401',
  Green:  '#85B42B',
  Orange: '#E8680A',
};

function zoneColour(zone) {
  return ZONE_COLOURS[zone] || '#888888';
}

// Returns the two-rect SVG snippet for the zone colour strip at the bottom of a sign.
// H = total sign height, stripH = strip height (≈24-28px)
function zoneStrip(zoneCol, y, stripH) {
  return `  <rect x="0" y="${y}" width="200" height="${stripH}" rx="6" ry="6" fill="${zoneCol}"/>
  <rect x="0" y="${y}" width="200" height="6" fill="${zoneCol}"/>`;
}

function buildSignSVG(street) {
  const days = signDays(street.days);
  const timeStr = signTime(street.timesRaw);
  const timeFontSize = timeStr.length > 13 ? 13 : 16;
  const zoneCol = zoneColour(street.zone);

  if (street.pd && street.dp) {
    // Sign 1: Pay & Display + Permit — viewBox height 303 (strip at y=279, h=24)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 303" font-family="Arial, sans-serif">
  <rect x="0" y="0" width="200" height="303" rx="6" ry="6" fill="white" stroke="black" stroke-width="3"/>
  <circle cx="100" cy="72" r="55" fill="white" stroke="#CC0000" stroke-width="14"/>
  <text x="100" y="97" text-anchor="middle" font-size="64" font-weight="600" fill="black">P</text>
  <line x1="0" y1="138" x2="200" y2="138" stroke="black" stroke-width="2"/>
  <text x="100" y="157" text-anchor="middle" font-size="9" fill="#222" font-style="italic">Íoc &amp; Taispeáin agus</text>
  <text x="100" y="169" text-anchor="middle" font-size="9" fill="#222" font-style="italic">Ceadúnais Páirceála</text>
  <line x1="16" y1="175" x2="184" y2="175" stroke="black" stroke-width="0.8"/>
  <text x="100" y="191" text-anchor="middle" font-size="13" font-weight="bold" fill="black">PAY &amp; DISPLAY</text>
  <text x="100" y="206" text-anchor="middle" font-size="13" font-weight="bold" fill="black">AND PERMIT</text>
  <text x="100" y="221" text-anchor="middle" font-size="13" font-weight="bold" fill="black">PARKING</text>
  <line x1="16" y1="227" x2="184" y2="227" stroke="black" stroke-width="0.8"/>
  <text x="100" y="242" text-anchor="middle" font-size="9.5" fill="#222" font-style="italic">${escSVG(days.ga)}</text>
  <text x="100" y="256" text-anchor="middle" font-size="12" font-weight="bold" fill="black">${escSVG(days.en)}</text>
  <text x="100" y="272" text-anchor="middle" font-size="${timeFontSize}" font-weight="bold" fill="black">${escSVG(timeStr)}</text>
${zoneStrip(zoneCol, 279, 24)}
</svg>`;
  }

  if (street.extraDays && street.extraTimes) {
    // Sign 2: Two periods (main + extra) — viewBox height 332 (strip at y=305, h=27)
    const extraDays = signDays(street.extraDays);
    const extraTimeStr = signTime(street.extraTimes);
    const extraFontSize = extraTimeStr.length > 13 ? 13 : 15;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 332" font-family="Arial, sans-serif">
  <rect x="0" y="0" width="200" height="332" rx="6" ry="6" fill="white" stroke="black" stroke-width="3"/>
  <circle cx="100" cy="72" r="55" fill="white" stroke="#CC0000" stroke-width="14"/>
  <text x="100" y="97" text-anchor="middle" font-size="64" font-weight="600" fill="black">P</text>
  <line x1="0" y1="138" x2="200" y2="138" stroke="black" stroke-width="2"/>
  <text x="100" y="155" text-anchor="middle" font-size="9" fill="#222" font-style="italic">Íoc &amp; Taispeáin</text>
  <line x1="16" y1="161" x2="184" y2="161" stroke="black" stroke-width="0.8"/>
  <text x="100" y="177" text-anchor="middle" font-size="15" font-weight="bold" fill="black">PAY &amp; DISPLAY</text>
  <line x1="16" y1="183" x2="184" y2="183" stroke="black" stroke-width="0.8"/>
  <text x="100" y="197" text-anchor="middle" font-size="9" fill="#222" font-style="italic">${escSVG(days.ga)}</text>
  <text x="100" y="210" text-anchor="middle" font-size="12" font-weight="bold" fill="black">${escSVG(days.en)}</text>
  <text x="100" y="226" text-anchor="middle" font-size="${timeFontSize}" font-weight="bold" fill="black">${escSVG(timeStr)}</text>
  <line x1="30" y1="233" x2="170" y2="233" stroke="black" stroke-width="0.8"/>
  <text x="100" y="247" text-anchor="middle" font-size="9" fill="#222" font-style="italic">${escSVG(extraDays.ga)}</text>
  <text x="100" y="260" text-anchor="middle" font-size="12" font-weight="bold" fill="black">${escSVG(extraDays.en)}</text>
  <text x="100" y="277" text-anchor="middle" font-size="${extraFontSize}" font-weight="bold" fill="black">${escSVG(extraTimeStr)}</text>
${zoneStrip(zoneCol, 305, 27)}
</svg>`;
  }

  // Sign 3: Pay & Display single period — viewBox height 302 (strip at y=274, h=28)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 302" font-family="Arial, sans-serif">
  <rect x="0" y="0" width="200" height="302" rx="6" ry="6" fill="white" stroke="black" stroke-width="3"/>
  <circle cx="100" cy="72" r="55" fill="white" stroke="#CC0000" stroke-width="14"/>
  <text x="100" y="97" text-anchor="middle" font-size="64" font-weight="600" fill="black">P</text>
  <line x1="0" y1="138" x2="200" y2="138" stroke="black" stroke-width="2"/>
  <text x="100" y="157" text-anchor="middle" font-size="9" fill="#222" font-style="italic">Íoc &amp; Taispeáin</text>
  <line x1="16" y1="163" x2="184" y2="163" stroke="black" stroke-width="0.8"/>
  <text x="100" y="180" text-anchor="middle" font-size="15" font-weight="bold" fill="black">PAY &amp; DISPLAY</text>
  <line x1="16" y1="187" x2="184" y2="187" stroke="black" stroke-width="0.8"/>
  <text x="100" y="205" text-anchor="middle" font-size="9.5" fill="#222" font-style="italic">${escSVG(days.ga)}</text>
  <text x="100" y="220" text-anchor="middle" font-size="13" font-weight="bold" fill="black">${escSVG(days.en)}</text>
  <text x="100" y="244" text-anchor="middle" font-size="${timeFontSize}" font-weight="bold" fill="black">${escSVG(timeStr)}</text>
${zoneStrip(zoneCol, 274, 28)}
</svg>`;
}

function openPanel(street) {
  currentStreet = street;
  document.title = `${street.location} — Dublin Street Parking`;
  const panel = document.getElementById('street-panel');

  document.getElementById('panel-street-name').textContent = street.location;
  updatePanelBanner(street);

  document.getElementById('panel-sign').innerHTML = buildSignSVG(street);

  const details = document.getElementById('panel-details');
  let detailsHTML = `
    <dt>Total Spaces</dt><dd>${street.total_spaces ?? 'Not recorded'}</dd>
    <dt>Hourly Rate</dt><dd>${street.tariff ?? '—'}</dd>
    <dt>Active Hours</dt><dd>${signTime(street.timesRaw)}</dd>
    <dt>Days</dt><dd>${signDays(street.days).en}</dd>
    <dt>Zone</dt><dd>${street.zone ?? '—'}</dd>
  `;
  if (street.extraDays && street.extraTimes) {
    detailsHTML += `<dt>Also Active</dt><dd>${signDays(street.extraDays).en} ${signTime(street.extraTimes)}</dd>`;
  }
  if (street.disabled_bays > 0) {
    detailsHTML += `<dt>Accessible Bays</dt><dd>${street.disabled_bays}</dd>`;
  }
  if (street.clearway_info) {
    const cwLabel = street.clearway_type === 'bus_lane' ? 'Bus Lane' : 'Clearway';
    detailsHTML += `<dt>${cwLabel}</dt><dd>${street.clearway_info}</dd>`;
  } else if (street.clearway) {
    detailsHTML += `<dt>Clearway</dt><dd>Yes — see local signage</dd>`;
  }
  details.innerHTML = detailsHTML;

  document.getElementById('panel-extension').classList.add('hidden');

  // Reset update form
  document.getElementById('update-form').classList.add('hidden');
  document.getElementById('upd-street').value = street.location;
  document.getElementById('upd-message').value = '';
  document.getElementById('upd-email').value = '';
  document.getElementById('upd-success').classList.add('hidden');

  panel.classList.add('panel-open');
  document.getElementById('legend').classList.add('hidden');
  panel.setAttribute('aria-hidden', 'false');
}

function buildAccessibleSignSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2160 2160">
  <rect width="2160" height="2160" rx="135" ry="135" fill="#fff"/>
  <path d="M2025,2.25c35.46,0,68.79,13.81,93.87,38.88,25.07,25.07,38.88,58.41,38.88,93.87v1890c0,35.46-13.81,68.79-38.88,93.87s-58.41,38.88-93.87,38.88H135c-35.46,0-68.79-13.81-93.87-38.88C16.06,2092.79,2.25,2059.46,2.25,2025V135c0-35.46,13.81-68.79,38.88-93.87C66.21,16.06,99.54,2.25,135,2.25h1890ZM2025,0H135C60.44,0,0,60.44,0,135v1890c0,74.56,60.44,135,135,135h1890c74.56,0,135-60.44,135-135V135c0-74.56-60.44-135-135-135Z"/>
  <rect x="54" y="54" width="2052" height="2052" rx="81" ry="81" fill="#003f87"/>
  ${DIS_PATHS}
</svg>`;
}

function openAccessiblePanel(bay) {
  currentAccessibleBay = bay;
  currentStreet = null;
  document.title = `${bay.location} — Dublin Street Parking`;
  const panel = document.getElementById('street-panel');

  document.getElementById('panel-street-name').textContent = bay.location;

  const banner = document.getElementById('panel-status-banner');
  banner.textContent = '♿ Accessible Parking Bay';
  banner.className = 'blue';

  document.getElementById('panel-sign').innerHTML = buildAccessibleSignSVG();

  let detailsHTML = `<dt>Location</dt><dd>${bay.description ?? '—'}</dd>`;
  if (bay.side) detailsHTML += `<dt>Side of Road</dt><dd>${bay.side}</dd>`;
  document.getElementById('panel-details').innerHTML = detailsHTML;

  document.getElementById('panel-extension').classList.add('hidden');
  document.getElementById('update-form').classList.add('hidden');
  document.getElementById('btn-update').classList.add('hidden');

  panel.classList.add('panel-open');
  document.getElementById('legend').classList.add('hidden');
  panel.setAttribute('aria-hidden', 'false');
}

function buildEvSignSVG(charger) {
  const esc = escSVG;
  const speedColour = (charger.speed === 'Fast' || charger.speed === 'Rapid') ? '#FFD700' : '#fff';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280" font-family="Arial, sans-serif">
  <rect x="0" y="0" width="200" height="280" rx="6" ry="6" fill="#27AE60"/>
  <rect x="6" y="6" width="188" height="268" rx="4" ry="4" fill="none" stroke="white" stroke-width="2"/>
  <polygon points="108,18 88,58 100,58 92,82 120,44 107,44" fill="white"/>
  <text x="100" y="98" text-anchor="middle" font-size="11" font-weight="bold" fill="white">EV CHARGING POINT</text>
  <line x1="16" y1="105" x2="184" y2="105" stroke="white" stroke-width="0.8" opacity="0.6"/>
  <text x="16" y="122" font-size="9" fill="white" opacity="0.8">Operator</text>
  <text x="184" y="122" text-anchor="end" font-size="9" font-weight="bold" fill="white">${esc(charger.operator || '—')}</text>
  <text x="16" y="140" font-size="9" fill="white" opacity="0.8">Chargers</text>
  <text x="184" y="140" text-anchor="end" font-size="9" font-weight="bold" fill="white">${charger.num_chargers || '—'}</text>
  <text x="16" y="158" font-size="9" fill="white" opacity="0.8">Type</text>
  <text x="184" y="158" text-anchor="end" font-size="8" font-weight="bold" fill="white">${esc(charger.charger_type || '—')}</text>
  <text x="16" y="176" font-size="9" fill="white" opacity="0.8">Speed</text>
  <text x="184" y="176" text-anchor="end" font-size="9" font-weight="bold" fill="${speedColour}">${esc(charger.speed || '—')}</text>
  <line x1="16" y1="184" x2="184" y2="184" stroke="white" stroke-width="0.8" opacity="0.6"/>
  <text x="100" y="200" text-anchor="middle" font-size="8.5" fill="white" opacity="0.9">${esc(charger.parking_info || '')}</text>
</svg>`;
}

function openEvPanel(charger) {
  currentEvCharger = charger;
  currentStreet = null;
  currentAccessibleBay = null;
  document.title = `${charger.location} — Dublin Street Parking`;
  const panel = document.getElementById('street-panel');

  document.getElementById('panel-street-name').textContent = charger.location;

  const banner = document.getElementById('panel-status-banner');
  banner.textContent = '⚡ EV Charging Point';
  banner.className = 'green';

  document.getElementById('panel-sign').innerHTML = buildEvSignSVG(charger);

  const details = [
    charger.operator        ? `<dt>Operator</dt><dd>${escSVG(charger.operator)}</dd>` : '',
    charger.charger_type    ? `<dt>Charger Type</dt><dd>${escSVG(charger.charger_type)}</dd>` : '',
    charger.speed           ? `<dt>Speed</dt><dd>${escSVG(charger.speed)}</dd>` : '',
    charger.num_chargers    ? `<dt>No. of Chargers</dt><dd>${charger.num_chargers}</dd>` : '',
    charger.public_access   ? `<dt>Access</dt><dd>${escSVG(charger.public_access)}</dd>` : '',
    charger.parking_info    ? `<dt>Parking</dt><dd>${escSVG(charger.parking_info)}</dd>` : '',
    charger.comments        ? `<dt>Notes</dt><dd>${escSVG(charger.comments)}</dd>` : '',
  ].join('');
  document.getElementById('panel-details').innerHTML = details;

  document.getElementById('panel-extension').classList.add('hidden');
  document.getElementById('update-form').classList.add('hidden');
  document.getElementById('btn-update').classList.add('hidden');

  panel.classList.add('panel-open');
  document.getElementById('legend').classList.add('hidden');
  panel.setAttribute('aria-hidden', 'false');
}

function updatePanelBanner(street) {
  const status = getStatus(street, currentDateTime);
  const banner = document.getElementById('panel-status-banner');
  const labels = {
    yellow:   '🅿 Paid Parking — Active Now',
    red:      '🅿 Permit Parking — Active Now',
    green:    '✓ Free Parking Now',
    clearway: street.clearway_type === 'bus_lane' ? '🚌 Bus Lane in Operation' : '⛔ Clearway in Operation',
  };
  banner.textContent = labels[status];
  banner.className = status;
}

function closePanel() {
  document.title = 'Dublin Street Parking — Free & Pay-and-Display Parking Map';
  const panel = document.getElementById('street-panel');
  panel.classList.remove('panel-open');
  panel.setAttribute('aria-hidden', 'true');
  currentStreet = null;
  currentAccessibleBay = null;
  currentEvCharger = null;
  document.getElementById('update-form').classList.add('hidden');
  document.getElementById('btn-update').classList.remove('hidden');
  document.getElementById('legend').classList.remove('hidden');
}


function toggleUpdateForm() {
  const form = document.getElementById('update-form');
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) {
    document.getElementById('upd-message').focus();
  }
}

async function submitUpdate() {
  const street = currentStreet;
  if (!street) return;
  const message = document.getElementById('upd-message').value.trim();
  if (!message) {
    document.getElementById('upd-message').focus();
    return;
  }
  const email = document.getElementById('upd-email').value.trim();
  const btn = document.getElementById('upd-submit');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: '20f4d852-77a7-4d6e-a443-5f84aba61f06',
        subject: `Parking Update: ${street.location}`,
        name: email || 'Anonymous',
        email: email || '',
        message: `Street: ${street.location}\n\nUpdate:\n${message}`,
      }),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('upd-message').value = '';
      document.getElementById('upd-email').value = '';
      document.getElementById('upd-success').classList.remove('hidden');
      setTimeout(() => {
        document.getElementById('update-form').classList.add('hidden');
        document.getElementById('upd-success').classList.add('hidden');
      }, 3000);
    } else {
      alert('Failed to send — please try again.');
    }
  } catch {
    alert('Failed to send — please check your connection and try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Update';
  }
}

// ── Filters ────────────────────────────────────────────────────────────────────
function applyFilters() {
  if (!clusterGroup) return;

  // Cars layer
  if (filters.cars) {
    if (!map.hasLayer(clusterGroup)) map.addLayer(clusterGroup);
  } else {
    if (map.hasLayer(clusterGroup)) map.removeLayer(clusterGroup);
  }

  // Accessible layer
  if (accessibleClusterGroup) {
    if (filters.accessible) {
      if (!map.hasLayer(accessibleClusterGroup)) map.addLayer(accessibleClusterGroup);
    } else {
      if (map.hasLayer(accessibleClusterGroup)) map.removeLayer(accessibleClusterGroup);
    }
  }

  // EV layer
  if (evClusterGroup) {
    if (filters.ev) {
      if (!map.hasLayer(evClusterGroup)) map.addLayer(evClusterGroup);
    } else {
      if (map.hasLayer(evClusterGroup)) map.removeLayer(evClusterGroup);
    }
  }

  // Free Only — show only green markers when enabled
  if (filters.cars) {
    for (const [, { marker, street }] of markerMap) {
      const status = getStatus(street, currentDateTime);
      const shouldShow = !filters.freeOnly || status === 'green';
      const inGroup = clusterGroup.hasLayer(marker);
      if (shouldShow && !inGroup) clusterGroup.addLayer(marker);
      else if (!shouldShow && inGroup) clusterGroup.removeLayer(marker);
    }
  }
}

function initFilters() {
  const chkCars     = document.getElementById('chk-cars');
  const chkDisabled = document.getElementById('chk-accessible');
  const chkFreeOnly = document.getElementById('chk-freeonly');
  const toggle      = document.getElementById('burger-btn');
  const overlay     = document.getElementById('ui-overlay');

  chkCars.addEventListener('change', () => {
    filters.cars = chkCars.checked;
    if (!filters.cars) {
      filters.freeOnly = false;
      chkFreeOnly.checked = false;
    }
    applyFilters();
  });

  chkDisabled.addEventListener('change', () => {
    filters.accessible = chkDisabled.checked;
    applyFilters();
  });

  chkFreeOnly.addEventListener('change', () => {
    filters.freeOnly = chkFreeOnly.checked;
    if (filters.freeOnly && !filters.cars) {
      filters.cars = true;
      chkCars.checked = true;
    }
    applyFilters();
  });

  const chkEv = document.getElementById('chk-ev');
  chkEv.addEventListener('change', () => {
    filters.ev = chkEv.checked;
    applyFilters();
  });

  toggle.addEventListener('click', () => {
    const expanded = overlay.classList.toggle('expanded');
    toggle.setAttribute('aria-expanded', expanded);
  });
}

// ── Phase 5: Search ────────────────────────────────────────────────────────────
function initSearchBar() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');
  const searchBtn = document.getElementById('search-btn');

  input.addEventListener('input', () => {
    clearBtn.classList.toggle('hidden', !input.value);
    clearTimeout(searchDebounceTimer);
    if (input.value.trim().length < 2) { closeSearchDropdown(); return; }
    searchDebounceTimer = setTimeout(() => doSearch(input.value.trim()), 400);
  });

  input.addEventListener('keydown', (e) => {
    const dropdown = document.getElementById('search-dropdown');
    const items = dropdown.querySelectorAll('li');
    if (e.key === 'Enter') {
      e.preventDefault();
      const active = dropdown.querySelector('li.active');
      if (active) active.click();
      else if (items[0]) items[0].click();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateDropdown(items, 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateDropdown(items, -1);
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.add('hidden');
    closeSearchDropdown();
    removeSearchPin();
    input.focus();
  });

  searchBtn.addEventListener('click', () => {
    if (input.value.trim()) doSearch(input.value.trim());
  });

  // Click outside dropdown closes it
  document.addEventListener('click', (e) => {
    if (!document.getElementById('search-wrapper').contains(e.target)) {
      closeSearchDropdown();
    }
  });
}

function navigateDropdown(items, dir) {
  const arr = Array.from(items);
  const current = arr.findIndex(li => li.classList.contains('active'));
  // If nothing active and going down, start at 0; going up, start at last
  let next = current === -1 ? (dir > 0 ? 0 : arr.length - 1) : current + dir;
  next = Math.max(0, Math.min(arr.length - 1, next));
  arr.forEach(li => li.classList.remove('active'));
  if (arr[next]) arr[next].classList.add('active');
}

async function doSearch(query) {
  // Photon (Komoot) — OSM-based geocoder, no API key required
  // Location bias (lat/lon) ensures Dublin city results are ranked first
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query + ' Dublin Ireland')}&limit=5&lat=53.3498&lon=-6.2603`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const features = data.features || [];
    showSearchDropdown(features);
  } catch (err) {
    console.error('Search failed:', err);
    closeSearchDropdown();
  }
}

function showSearchDropdown(features) {
  const dropdown = document.getElementById('search-dropdown');
  dropdown.innerHTML = '';
  if (features.length === 0) { closeSearchDropdown(); return; }

  for (const f of features) {
    const p = f.properties;
    const lat = f.geometry.coordinates[1];
    const lng = f.geometry.coordinates[0];
    const name = [p.name, p.street, p.city, p.county].filter(Boolean).join(', ');
    const li = document.createElement('li');
    li.textContent = name.length > 70 ? name.slice(0, 67) + '…' : name;
    li.setAttribute('role', 'option');
    li.addEventListener('click', () => selectSearchResult(lat, lng, name));
    dropdown.appendChild(li);
  }
  dropdown.classList.remove('hidden');
}

function closeSearchDropdown() {
  document.getElementById('search-dropdown').classList.add('hidden');
}

function selectSearchResult(lat, lng, name) {
  closeSearchDropdown();
  document.getElementById('search-input').value = name.split(',')[0];
  document.getElementById('search-clear').classList.remove('hidden');
  map.setView([lat, lng], 16);
  placeSearchPin(lat, lng);
  highlightNearby(lat, lng, 500);
}

function placeSearchPin(lat, lng) {
  removeSearchPin();
  searchPin = L.marker([lat, lng], {
    icon: L.divIcon({
      className: '',
      html: '<div style="width:16px;height:16px;border-radius:50%;background:#2980B9;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>',
      iconSize: [16, 16], iconAnchor: [8, 8],
    }),
  }).addTo(map);
  setTimeout(removeSearchPin, 10000);
}

function removeSearchPin() {
  if (searchPin) { map.removeLayer(searchPin); searchPin = null; }
}

function highlightNearby(lat, lng, radiusMeters) {
  const centre = L.latLng(lat, lng);
  const toHighlight = [];

  for (const [, { marker, street }] of markerMap) {
    const dist = centre.distanceTo(marker.getLatLng());
    if (dist <= radiusMeters) toHighlight.push({ marker, street });
  }

  // Highlight
  for (const { marker, street } of toHighlight) {
    const status = getStatus(street, currentDateTime);
    marker.setIcon(createMarkerIcon(status, true));
  }

  // Revert after 4 seconds
  clearTimeout(searchHighlightTimer);
  searchHighlightTimer = setTimeout(() => {
    for (const { marker, street } of toHighlight) {
      const status = getStatus(street, currentDateTime);
      marker.setIcon(createMarkerIcon(status, false));
    }
  }, 4000);
}

// ── Phase 6: Navigation picker ────────────────────────────────────────────────
function getNavTarget() {
  return currentStreet || currentAccessibleBay;
}

function initNavPicker() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent)); // iPad on iOS 13+
  if (isIOS) document.getElementById('nav-apple').classList.remove('hidden');

  document.getElementById('nav-google').addEventListener('click', () => {
    const target = getNavTarget();
    if (!target) return;
    // maps.google.com is an app link on Android and a universal link on iOS — opens the app directly
    window.location.href = `https://maps.google.com/maps?daddr=${target.lat},${target.lng}`;
    closeNavPicker();
  });
  document.getElementById('nav-waze').addEventListener('click', () => {
    const target = getNavTarget();
    if (!target) return;
    // waze:// opens the Waze app; fall back to web URL after 500ms if not installed
    window.location.href = `waze://ul?ll=${target.lat},${target.lng}&navigate=yes`;
    setTimeout(() => {
      window.open(`https://waze.com/ul?ll=${target.lat},${target.lng}&navigate=yes`, '_blank', 'noopener');
    }, 500);
    closeNavPicker();
  });
  document.getElementById('nav-apple').addEventListener('click', () => {
    const target = getNavTarget();
    if (!target) return;
    window.location.href = `maps://maps.apple.com/?daddr=${target.lat},${target.lng}`;
    closeNavPicker();
  });

  document.getElementById('nav-overlay').addEventListener('click', closeNavPicker);
}

function openNavPicker() {
  document.getElementById('nav-picker').classList.remove('hidden');
  document.getElementById('nav-overlay').classList.remove('hidden');
}

function closeNavPicker() {
  document.getElementById('nav-picker').classList.add('hidden');
  document.getElementById('nav-overlay').classList.add('hidden');
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function toTitleCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ── Plan Mode ──────────────────────────────────────────────────────────────────
function openPlanSheet() {
  const sheet = document.getElementById('plan-sheet');
  sheet.classList.add('plan-open');
  sheet.setAttribute('aria-hidden', 'false');
  document.getElementById('legend').classList.add('hidden');

  // Restore state to inputs
  document.getElementById('plan-address-input').value = planState.address;
  document.getElementById('plan-address-clear').classList.toggle('hidden', !planState.address);
  if (planState.startISO) document.getElementById('plan-start').value = planState.startISO;
  if (planState.endISO)   document.getElementById('plan-end').value   = planState.endISO;
  const distBtn  = document.getElementById('plan-sort-distance');
  const priceBtn = document.getElementById('plan-sort-price');
  if (planState.sortBy === 'distance') {
    distBtn.className  = 'pill-btn pill-green';
    priceBtn.className = 'pill-btn pill-outline';
  } else {
    distBtn.className  = 'pill-btn pill-outline';
    priceBtn.className = 'pill-btn pill-green';
  }
  document.getElementById('plan-maxdist').value = planState.maxDistance;
  document.getElementById('plan-maxdist-wrapper').classList.toggle('hidden', planState.sortBy !== 'price');

  if (planState.hasResults) renderPlanResults();
  else document.getElementById('plan-results').classList.add('hidden');
}

function closePlanSheet() {
  const sheet = document.getElementById('plan-sheet');
  if (!sheet.classList.contains('plan-open')) return;
  sheet.classList.remove('plan-open');
  sheet.setAttribute('aria-hidden', 'true');
  if (!document.getElementById('street-panel').classList.contains('panel-open')) {
    document.getElementById('legend').classList.remove('hidden');
  }
}

function invalidatePlanResults() {
  planState.hasResults = false;
  planState.results = [];
  document.getElementById('plan-results').classList.add('hidden');
}

function executePlanSearch() {
  const startDt = new Date(planState.startISO);
  const endDt   = new Date(planState.endISO);

  if (isNaN(startDt) || isNaN(endDt) || endDt <= startDt) {
    const list = document.getElementById('plan-results-list');
    list.innerHTML = '<li id="plan-no-results">Please set a valid start and end time.</li>';
    document.getElementById('plan-results').classList.remove('hidden');
    planState.hasResults = false;
    return;
  }

  const centre = L.latLng(planState.lat, planState.lng);
  const candidates = [];

  for (const [, { street }] of markerMap) {
    if (!isFullyParkable(street, startDt, endDt)) continue;
    const distance = centre.distanceTo(L.latLng(street.lat, street.lng));
    const cost     = calculateParkingCost(street, startDt, endDt);
    candidates.push({ street, distance, cost });
  }

  let filtered = candidates;
  if (planState.sortBy === 'price' && planState.maxDistance && Number(planState.maxDistance) > 0) {
    filtered = candidates.filter(c => c.distance <= Number(planState.maxDistance));
  }

  if (planState.sortBy === 'distance') {
    filtered.sort((a, b) => a.distance - b.distance);
  } else {
    filtered.sort((a, b) => a.cost - b.cost || a.distance - b.distance);
  }

  planState.results    = filtered.slice(0, 5);
  planState.hasResults = true;
  renderPlanResults();
}

function renderPlanResults() {
  const list = document.getElementById('plan-results-list');
  document.getElementById('plan-results').classList.remove('hidden');
  list.innerHTML = '';

  if (planState.results.length === 0) {
    list.innerHTML = '<li id="plan-no-results">No suitable parking found nearby. Try a different time or address.</li>';
    return;
  }

  for (const { street, distance, cost } of planState.results) {
    const distStr  = distance < 1000 ? `${Math.round(distance)}m` : `${(distance / 1000).toFixed(1)}km`;
    const costStr  = cost === 0 ? 'Free' : `€${cost.toFixed(2)}`;
    const costClass = cost === 0 ? 'free' : 'paid';

    const li = document.createElement('li');
    li.className = 'plan-result-item';
    li.setAttribute('role', 'listitem');
    li.innerHTML = `
      <span class="plan-result-name">${escSVG(street.location)}</span>
      <span class="plan-result-meta">
        <span class="plan-result-dist">${distStr}</span>
        <span class="plan-result-cost ${costClass}">${costStr}</span>
      </span>`;
    li.addEventListener('click', () => {
      closePlanSheet();
      openPanel(street);
    });
    list.appendChild(li);
  }
}

async function doPlanAddressSearch(query) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query + ' Dublin Ireland')}&limit=5&lat=53.3498&lon=-6.2603`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    showPlanAddressDropdown(data.features || []);
  } catch {
    document.getElementById('plan-address-dropdown').classList.add('hidden');
  }
}

function showPlanAddressDropdown(features) {
  const drop = document.getElementById('plan-address-dropdown');
  drop.innerHTML = '';
  if (!features.length) { drop.classList.add('hidden'); return; }

  for (const f of features) {
    const p    = f.properties;
    const lat  = f.geometry.coordinates[1];
    const lng  = f.geometry.coordinates[0];
    const name = [p.name, p.street, p.city, p.county].filter(Boolean).join(', ');
    const li   = document.createElement('li');
    li.textContent = name.length > 60 ? name.slice(0, 57) + '…' : name;
    li.setAttribute('role', 'option');
    li.addEventListener('click', () => {
      planState.address = name.split(',')[0];
      planState.lat     = lat;
      planState.lng     = lng;
      document.getElementById('plan-address-input').value = planState.address;
      document.getElementById('plan-address-clear').classList.remove('hidden');
      drop.classList.add('hidden');
    });
    drop.appendChild(li);
  }
  drop.classList.remove('hidden');
}

function initPlanMode() {
  document.getElementById('plan-mode-btn').addEventListener('click', () => {
    // Collapse the burger menu
    const overlay = document.getElementById('ui-overlay');
    overlay.classList.remove('expanded');
    document.getElementById('burger-btn').setAttribute('aria-expanded', 'false');
    openPlanSheet();
  });
  document.getElementById('plan-close').addEventListener('click', closePlanSheet);

  // Address input
  const addrInput = document.getElementById('plan-address-input');
  const addrClear = document.getElementById('plan-address-clear');
  const addrDrop  = document.getElementById('plan-address-dropdown');
  let addrDebounce = null;

  addrInput.addEventListener('input', () => {
    planState.address = addrInput.value;
    planState.lat = null;
    planState.lng = null;
    addrClear.classList.toggle('hidden', !addrInput.value);
    invalidatePlanResults();
    clearTimeout(addrDebounce);
    if (addrInput.value.trim().length < 2) { addrDrop.classList.add('hidden'); return; }
    addrDebounce = setTimeout(() => doPlanAddressSearch(addrInput.value.trim()), 400);
  });

  addrClear.addEventListener('click', () => {
    addrInput.value = '';
    planState.address = '';
    planState.lat = null;
    planState.lng = null;
    addrClear.classList.add('hidden');
    addrDrop.classList.add('hidden');
    invalidatePlanResults();
    addrInput.focus();
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('plan-address-wrapper').contains(e.target)) {
      addrDrop.classList.add('hidden');
    }
  });

  // Start/end time inputs
  document.getElementById('plan-start').addEventListener('change', () => {
    planState.startISO = document.getElementById('plan-start').value;
    invalidatePlanResults();
  });
  document.getElementById('plan-end').addEventListener('change', () => {
    planState.endISO = document.getElementById('plan-end').value;
    invalidatePlanResults();
  });

  // Search button
  document.getElementById('plan-search-btn').addEventListener('click', () => {
    if (!planState.lat || !planState.lng) { addrInput.focus(); return; }
    executePlanSearch();
  });

  // Sort toggle — two buttons
  function setSortMode(mode) {
    planState.sortBy = mode;
    const distBtn    = document.getElementById('plan-sort-distance');
    const priceBtn   = document.getElementById('plan-sort-price');
    const maxWrapper = document.getElementById('plan-maxdist-wrapper');
    if (mode === 'distance') {
      distBtn.className  = 'pill-btn pill-green';
      priceBtn.className = 'pill-btn pill-outline';
      maxWrapper.classList.add('hidden');
      planState.maxDistance = '';
      document.getElementById('plan-maxdist').value = '';
    } else {
      distBtn.className  = 'pill-btn pill-outline';
      priceBtn.className = 'pill-btn pill-green';
      maxWrapper.classList.remove('hidden');
    }
    if (planState.hasResults) executePlanSearch();
  }
  document.getElementById('plan-sort-distance').addEventListener('click', () => setSortMode('distance'));
  document.getElementById('plan-sort-price').addEventListener('click', () => setSortMode('price'));

  // Max distance
  document.getElementById('plan-maxdist').addEventListener('change', () => {
    planState.maxDistance = document.getElementById('plan-maxdist').value;
    if (planState.hasResults) executePlanSearch();
  });
}
