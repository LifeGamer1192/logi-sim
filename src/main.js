import './style.css';
import { GRID_COLS, GRID_ROWS, SCROLL_STEP } from './config.js';
import { hashSeed, randomSeed } from './core/rng.js';
import { t, setLang, getLang } from './i18n.js';
import { Game } from './game.js';
import { screenToWorld } from './render/camera.js';
import { TileType } from './map/tile.js';

const canvas = document.getElementById('map');
const game = new Game(canvas);

// Exposed for debugging and headless checks; harmless in production.
window.game = game;

const $ = (id) => document.getElementById(id);
const seedInput = $('seed');
const tooltip = $('tooltip');
const mapStatsEl = $('map-stats');
const envStatsEl = $('env-stats');
const legendEl = $('legend');
const viewModesEl = $('view-modes');
const speedsEl = $('speeds');
const zoomsEl = $('zooms');
const langsEl = $('langs');
const pauseBtn = $('pause-btn');
const pausedBadge = $('paused-badge');

// --- panels ---------------------------------------------------------------

const LEGENDS = {
  terrain: [
    ['#5c98c8', 'legend.water'],
    ['#c4b884', 'legend.poorSoil'],
    ['#468237', 'legend.richSoil'],
  ],
  fertility: [
    ['#3c3228', 'legend.low'],
    ['#78e66e', 'legend.high'],
    ['#2d343f', 'legend.waterNA'],
  ],
  moisture: [
    ['#c8aa78', 'legend.dry'],
    ['#286ec8', 'legend.wet'],
  ],
  sunlight: [
    ['#191e2d', 'legend.shade'],
    ['#ffe178', 'legend.bright'],
  ],
};

function renderRows(el, rows) {
  if (!el) return;
  el.innerHTML = rows
    .map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`)
    .join('');
}

function updateLegend() {
  if (!legendEl) return;
  legendEl.innerHTML = (LEGENDS[game.viewMode] || [])
    .map(
      ([color, key]) =>
        `<span class="swatch"><i style="background:${color}"></i>${t(key)}</span>`,
    )
    .join('');
}

function updateMapStats() {
  if (!mapStatsEl || !game.stats) return;
  const s = game.stats;
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  const num = (v) => v.toFixed(3);
  renderRows(mapStatsEl, [
    [t('stat.seed'), game.seed],
    [t('stat.size'), `${GRID_COLS}×${GRID_ROWS}`],
    [t('stat.water'), `${s.water} (${pct(s.waterFraction)})`],
    [t('stat.land'), s.land],
    [t('stat.avgFertility'), num(s.avgFertility)],
    [t('stat.avgMoisture'), num(s.avgMoisture)],
    [t('stat.avgSunlight'), num(s.avgSunlight)],
    [t('stat.camera'), `(${Math.round(game.camera.x)}, ${Math.round(game.camera.y)})`],
  ]);
}

function updateEnvPanel() {
  if (!envStatsEl || !game.environment) return;
  const e = game.environment;
  const fpsTxt = game.fps == null ? '—' : Math.round(game.fps);
  renderRows(envStatsEl, [
    [t('stat.year'), e.year],
    [t('stat.season'), `${t('season.' + e.season)} · ${t('val.day', { n: e.day })}`],
    [t('stat.temperature'), `${Math.round(e.temperature)}°C`],
    [t('stat.daylight'), `${Math.round(e.daylight * 100)}%`],
    [t('stat.fps'), fpsTxt],
  ]);
}

function updatePausedBadge() {
  if (pausedBadge) pausedBadge.hidden = !game.paused;
  if (pauseBtn) pauseBtn.classList.toggle('active', game.paused);
}

function refreshPanels() {
  updateMapStats();
  updateEnvPanel();
  updateLegend();
  updatePausedBadge();
}

// --- map generation -------------------------------------------------------

function newMap(seed) {
  game.newMap(seed);
  if (seedInput) seedInput.value = game.seed;
  refreshPanels();
}

// --- tool button strips ---------------------------------------------------

function setActive(container, attr, value) {
  if (!container) return;
  for (const btn of container.querySelectorAll(`button[${attr}]`)) {
    btn.classList.toggle('active', btn.getAttribute(attr) === String(value));
  }
}

if (viewModesEl) {
  viewModesEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-mode]');
    if (!btn) return;
    game.viewMode = btn.dataset.mode;
    setActive(viewModesEl, 'data-mode', btn.dataset.mode);
    updateLegend();
  });
}

if (speedsEl) {
  speedsEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-speed]');
    if (!btn) return;
    game.setSpeed(Number(btn.dataset.speed));
    setActive(speedsEl, 'data-speed', btn.dataset.speed);
  });
}

if (zoomsEl) {
  zoomsEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-zoom]');
    if (!btn) return;
    game.setZoom(Number(btn.dataset.zoom));
    setActive(zoomsEl, 'data-zoom', btn.dataset.zoom);
  });
}

if (pauseBtn) {
  pauseBtn.addEventListener('click', () => {
    game.paused = !game.paused;
    updatePausedBadge();
  });
}

// --- language -------------------------------------------------------------

function applyLang(lang) {
  setLang(lang);
  document.documentElement.lang = lang;
  // Re-render any element carrying a data-i18n key.
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle);
  }
  setActive(langsEl, 'data-lang', lang);
  refreshPanels();
}

if (langsEl) {
  langsEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-lang]');
    if (!btn) return;
    applyLang(btn.dataset.lang);
  });
}

// --- seed / regenerate ----------------------------------------------------

const regenerateBtn = $('regenerate');
if (regenerateBtn) {
  regenerateBtn.addEventListener('click', () => newMap(randomSeed()));
}
if (seedInput) {
  seedInput.addEventListener('change', () => {
    const raw = seedInput.value.trim();
    if (!raw) return;
    const seed = /^\d+$/.test(raw) ? (Number(raw) >>> 0) : hashSeed(raw);
    newMap(seed);
  });
}

// --- camera panning -------------------------------------------------------

// Scroll arrows: hold to pan, release to stop.
for (const btn of document.querySelectorAll('.scroll-btn[data-dir]')) {
  const dir = btn.dataset.dir;
  const set = (on) => {
    const k = 1 / Math.sqrt(2);
    const v = on ? SCROLL_STEP : 0;
    // Match the iso pan directions used for WASD.
    if (dir === 'up')         game.panDir = { x: -k * v, y: -k * v };
    else if (dir === 'down')  game.panDir = { x: k * v, y: k * v };
    else if (dir === 'left')  game.panDir = { x: -k * v, y: k * v };
    else if (dir === 'right') game.panDir = { x: k * v, y: -k * v };
    if (!on) game.panDir = { x: 0, y: 0 };
  };
  btn.addEventListener('pointerdown', () => set(true));
  btn.addEventListener('pointerup', () => set(false));
  btn.addEventListener('pointerleave', () => set(false));
}

// Keyboard: arrows + WASD pan the camera; space toggles pause.
const KEY_TO_WASD = {
  ArrowUp: 'w', ArrowDown: 's', ArrowLeft: 'a', ArrowRight: 'd',
  w: 'w', a: 'a', s: 's', d: 'd', W: 'w', A: 'a', S: 's', D: 'd',
};
window.addEventListener('keydown', (ev) => {
  if (ev.target instanceof HTMLInputElement) return;
  const k = KEY_TO_WASD[ev.key];
  if (k) { game.keys.add(k); ev.preventDefault(); }
  if (ev.key === ' ') { game.paused = !game.paused; updatePausedBadge(); ev.preventDefault(); }
});
window.addEventListener('keyup', (ev) => {
  const k = KEY_TO_WASD[ev.key];
  if (k) game.keys.delete(k);
});

// Drag to pan.
let dragging = false;
let lastDrag = null;
canvas.addEventListener('pointerdown', (ev) => {
  dragging = true;
  lastDrag = { x: ev.clientX, y: ev.clientY };
  canvas.setPointerCapture(ev.pointerId);
});
canvas.addEventListener('pointermove', (ev) => {
  updateTooltip(ev); // hover read-out
  if (!dragging || !game.camera) return;
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width;
  const dxPx = (ev.clientX - lastDrag.x) * scale;
  const dyPx = (ev.clientY - lastDrag.y) * scale;
  lastDrag = { x: ev.clientX, y: ev.clientY };
  // Invert the iso projection for a 1:1 grab-and-drag feel.
  const tw = game.tileSize * 0.5;
  const th = game.tileSize * 0.25;
  const ax = -dxPx / tw;
  const ay = -dyPx / th;
  game.camera.pan((ay + ax) / 2, (ay - ax) / 2);
});
const endDrag = () => { dragging = false; lastDrag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// Wheel to zoom.
canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const dir = ev.deltaY > 0 ? -1 : 1;
  game.setZoom(game.zoomIndex + dir);
  setActive(zoomsEl, 'data-zoom', game.zoomIndex);
}, { passive: false });

// --- hover tooltip --------------------------------------------------------

function updateTooltip(ev) {
  if (!tooltip || !game.map || !game.camera) return;
  const rect = canvas.getBoundingClientRect();
  const sx = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const sy = (ev.clientY - rect.top) * (canvas.height / rect.height);
  const w = screenToWorld(sx, sy, game.camera, game.tileSize, canvas.width, canvas.height);
  const tx = Math.floor(w.x);
  const ty = Math.floor(w.y);
  if (tx < 0 || ty < 0 || tx >= GRID_COLS || ty >= GRID_ROWS) {
    tooltip.hidden = true;
    game.hover = null;
    return;
  }
  game.hover = { x: tx, y: ty };
  const tile = game.map.tiles[ty][tx];
  const kind = tile.type === TileType.WATER
    ? t('legend.water')
    : t('legend.richSoil');
  tooltip.hidden = false;
  tooltip.style.left = `${ev.clientX - rect.left + 12}px`;
  tooltip.style.top = `${ev.clientY - rect.top + 12}px`;
  tooltip.textContent =
    `(${tx}, ${ty}) ${kind} · ${t('stat.avgFertility')} ${tile.fertility.toFixed(2)}`;
}
canvas.addEventListener('pointerleave', () => {
  if (tooltip) tooltip.hidden = true;
  game.hover = null;
});

// --- boot -----------------------------------------------------------------

applyLang(getLang());
newMap(randomSeed());
game.start();

// Light-weight panel refresh poll (the canvas redraws every frame in the
// game loop; the side panels only need to track slower-moving numbers).
setInterval(refreshPanels, 200);
