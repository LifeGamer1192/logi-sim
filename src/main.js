import './style.css';
import { GRID_COLS, GRID_ROWS, SCROLL_STEP, DRAG_THRESHOLD } from './config.js';
import { hashSeed, randomSeed } from './core/rng.js';
import { t, setLang, getLang } from './i18n.js';
import { Game } from './game.js';
import { screenToWorld } from './render/camera.js';
import { TileType } from './map/tile.js';
import { teamLetter } from './teams.js';

const canvas = document.getElementById('map');
const game = new Game(canvas);
window.game = game; // debugging / headless checks

const $ = (id) => document.getElementById(id);
const tooltip = $('tooltip');
const mapStatsEl = $('map-stats');
const envStatsEl = $('env-stats');
const teamSummaryEl = $('team-summary');
const legendEl = $('legend');
const viewModesEl = $('view-modes');
const speedsEl = $('speeds');
const zoomsEl = $('zooms');
const langsEl = $('langs');
const pauseBtn = $('pause-btn');
const pausedBadge = $('paused-badge');

let started = false; // becomes true after the first Generate

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
    .map(([color, key]) => `<span class="swatch"><i style="background:${color}"></i>${t(key)}</span>`)
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
    [t('stat.fps'), fpsTxt],
  ]);
}

function updateTeamSummary() {
  if (!teamSummaryEl || !game.teams) return;
  if (!game.teams.length) { teamSummaryEl.textContent = ''; return; }
  const parts = game.teams.map(
    (tm) => `<b style="color:${tm.color.fill}">${teamLetter(tm.id)}</b>:${tm.workers.length}`,
  );
  teamSummaryEl.innerHTML = `Teams ${parts.join(' / ')}`;
}

function updatePausedBadge() {
  if (pausedBadge) pausedBadge.hidden = !game.paused;
  if (pauseBtn) pauseBtn.classList.toggle('active', game.paused);
}

function refreshPanels() {
  updateMapStats();
  updateEnvPanel();
  updateTeamSummary();
  updateLegend();
  updatePausedBadge();
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
  pauseBtn.addEventListener('click', () => { game.paused = !game.paused; updatePausedBadge(); });
}

// --- language -------------------------------------------------------------

function applyLang(lang) {
  setLang(lang);
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle);
  }
  setActive(langsEl, 'data-lang', lang);
  setActive($('start-langs'), 'data-lang', lang);
  refreshPanels();
}
function bindLangStrip(el) {
  if (!el) return;
  el.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-lang]');
    if (btn) applyLang(btn.dataset.lang);
  });
}
bindLangStrip(langsEl);
bindLangStrip($('start-langs'));

// --- start screen ---------------------------------------------------------

const startScreen = $('start-screen');
const startSeed = $('start-seed');
const teamCountInput = $('start-team-count');
const teamCountLabel = $('start-team-count-label');
const workersInput = $('start-workers');
const workersLabel = $('start-workers-label');

function bindSlider(input, label) {
  if (!input || !label) return;
  const sync = () => { label.textContent = input.value; };
  input.addEventListener('input', sync);
  sync();
}
bindSlider(teamCountInput, teamCountLabel);
bindSlider(workersInput, workersLabel);

$('start-seed-random')?.addEventListener('click', () => {
  if (startSeed) startSeed.value = String(randomSeed());
});

function readSeed(raw) {
  const v = (raw || '').trim();
  if (!v) return randomSeed();
  return /^\d+$/.test(v) ? (Number(v) >>> 0) : hashSeed(v);
}

function generate() {
  const seed = readSeed(startSeed?.value);
  const teamCount = Number(teamCountInput?.value) || 2;
  const workersPerTeam = Number(workersInput?.value) || 4;
  game.newMap(seed, { teamCount, workersPerTeam });
  if (startScreen) startScreen.hidden = true;
  refreshPanels();
  if (!started) { started = true; game.start(); }
}
$('start-generate')?.addEventListener('click', generate);

$('regenerate')?.addEventListener('click', () => {
  // Re-open the setup screen so teams / workers can be reconfigured.
  if (startScreen) startScreen.hidden = false;
});

// --- camera panning -------------------------------------------------------

for (const btn of document.querySelectorAll('.scroll-btn[data-dir]')) {
  const dir = btn.dataset.dir;
  const set = (on) => {
    const k = 1 / Math.sqrt(2);
    const v = on ? SCROLL_STEP : 0;
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

// Keyboard shortcuts: 1–5 speed, 6–9/0 zoom, space pause, WASD/arrows pan.
const KEY_TO_WASD = {
  ArrowUp: 'w', ArrowDown: 's', ArrowLeft: 'a', ArrowRight: 'd',
  w: 'w', a: 'a', s: 's', d: 'd',
};
window.addEventListener('keydown', (ev) => {
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
  const k = ev.key.toLowerCase();
  if (k === ' ') { game.paused = !game.paused; updatePausedBadge(); ev.preventDefault(); return; }
  if (k >= '1' && k <= '5') {
    const idx = Number(k) - 1;
    game.setSpeed(idx);
    setActive(speedsEl, 'data-speed', idx);
    ev.preventDefault();
    return;
  }
  if ((k >= '6' && k <= '9') || k === '0') {
    const idx = k === '0' ? 4 : Number(k) - 6;
    game.setZoom(idx);
    setActive(zoomsEl, 'data-zoom', idx);
    ev.preventDefault();
    return;
  }
  const wasd = KEY_TO_WASD[ev.key] || (('wasd'.includes(k)) ? k : null);
  if (wasd) { game.keys.add(wasd); ev.preventDefault(); }
});
window.addEventListener('keyup', (ev) => {
  const k = ev.key.toLowerCase();
  const wasd = KEY_TO_WASD[ev.key] || (('wasd'.includes(k)) ? k : null);
  if (wasd) game.keys.delete(wasd);
});
window.addEventListener('blur', () => { game.keys.clear(); game.panDir = { x: 0, y: 0 }; });

// Drag to pan; a press that barely moves counts as a click (spawn a package).
let dragging = false;
let lastDrag = null;
let pressStart = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (!game.map) return;
  dragging = true;
  lastDrag = { x: ev.clientX, y: ev.clientY };
  pressStart = { x: ev.clientX, y: ev.clientY };
  canvas.setPointerCapture(ev.pointerId);
});
canvas.addEventListener('pointermove', (ev) => {
  updateTooltip(ev);
  if (!dragging || !game.camera) return;
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width;
  const dxPx = (ev.clientX - lastDrag.x) * scale;
  const dyPx = (ev.clientY - lastDrag.y) * scale;
  lastDrag = { x: ev.clientX, y: ev.clientY };
  const tw = game.tileSize * 0.5;
  const th = game.tileSize * 0.25;
  const ax = -dxPx / tw;
  const ay = -dyPx / th;
  game.camera.pan((ay + ax) / 2, (ay - ax) / 2);
});
canvas.addEventListener('pointerup', (ev) => {
  if (pressStart && game.map) {
    const moved = Math.hypot(ev.clientX - pressStart.x, ev.clientY - pressStart.y);
    if (moved < DRAG_THRESHOLD) spawnAtPointer(ev);
  }
  dragging = false; lastDrag = null; pressStart = null;
});
canvas.addEventListener('pointercancel', () => { dragging = false; lastDrag = null; pressStart = null; });

canvas.addEventListener('wheel', (ev) => {
  if (!game.map) return;
  ev.preventDefault();
  const dir = ev.deltaY > 0 ? -1 : 1;
  game.setZoom(game.zoomIndex + dir);
  setActive(zoomsEl, 'data-zoom', game.zoomIndex);
}, { passive: false });

// --- pointer → tile -------------------------------------------------------

function pointerTile(ev) {
  const rect = canvas.getBoundingClientRect();
  const sx = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const sy = (ev.clientY - rect.top) * (canvas.height / rect.height);
  const w = screenToWorld(sx, sy, game.camera, game.tileSize, canvas.width, canvas.height);
  return { x: Math.floor(w.x), y: Math.floor(w.y) };
}

function spawnAtPointer(ev) {
  const { x, y } = pointerTile(ev);
  if (x < 0 || y < 0 || x >= GRID_COLS || y >= GRID_ROWS) return;
  game.spawnItemAt(x, y);
}

function updateTooltip(ev) {
  if (!tooltip || !game.map || !game.camera) return;
  const { x, y } = pointerTile(ev);
  if (x < 0 || y < 0 || x >= GRID_COLS || y >= GRID_ROWS) { tooltip.hidden = true; game.hover = null; return; }
  game.hover = { x, y };
  const tile = game.map.tiles[y][x];
  const kind = tile.type === TileType.WATER ? t('legend.water') : t('legend.richSoil');
  const rect = canvas.getBoundingClientRect();
  tooltip.hidden = false;
  tooltip.style.left = `${ev.clientX - rect.left + 12}px`;
  tooltip.style.top = `${ev.clientY - rect.top + 12}px`;
  tooltip.textContent = `(${x}, ${y}) ${kind} · Lv ${tile.level}${tile.item ? ' · 荷物' : ''}`;
}
canvas.addEventListener('pointerleave', () => { if (tooltip) tooltip.hidden = true; game.hover = null; });

// --- boot -----------------------------------------------------------------

applyLang(getLang());
// Pre-fill a random seed so Generate is one click away.
if (startSeed) startSeed.value = String(randomSeed());
setInterval(refreshPanels, 200);
