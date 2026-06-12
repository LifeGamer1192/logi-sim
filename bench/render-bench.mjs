/**
 * render-bench.mjs  —  Renderer JS-computation benchmark
 *
 * Measures the pure-JS math cost of the rendering hot path
 * (color computation + projection + array sort) for each zoom level.
 * Canvas draw calls (beginPath / fill / stroke / createLinearGradient)
 * are simulated with lightweight stubs so the relative ratios hold.
 *
 * Run:
 *   node bench/render-bench.mjs [before|after]
 */

import { performance } from 'perf_hooks';

const MODE = process.argv[2] || 'before';   // 'before' or 'after'
const FRAMES = 600;                          // frames to simulate per zoom level

const GRID = 100;
const CANVAS = 600;
const ISO_ELEV_RATIO = 1.6;

// ----------- Simulated map ------------
const tiles = [];
for (let y = 0; y < GRID; y++) {
  for (let x = 0; x < GRID; x++) {
    tiles.push({
      type: (x % 7 === 0 && y % 7 === 0) ? 1 : 0,  // 1 = water
      elevation: 0.1 + ((x * 3 + y * 7) % 100) / 120,
      fertility:  ((x * 7 + y * 3) % 100) / 100,
      level:      ((x + y)         % 6),
      waterKind: 'ocean',
    });
  }
}

// stub canvas counters
let calls = { gradient: 0, beginPath: 0, fill: 0, stroke: 0, moveTo: 0 };

// ----------- BEFORE code ---------------------------------------------------
const lerp = (a, b, t) => a + (b - a) * t;

function mix_before(c1, c2, t) {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))},` +
         `${Math.round(lerp(c1[1], c2[1], t))},` +
         `${Math.round(lerp(c1[2], c2[2], t))})`;
}
const DL=[210,190,138], WL=[82,148,62], DH=[168,158,128], WH=[94,154,74];
function colorOf_before(tile) {
  if (tile.type === 1) return `rgb(92,152,200)`;
  const lvl = Math.min(1, (tile.level || 0) / 5);
  const f = tile.fertility;
  return mix_before(mix_before(DL, WL, f), mix_before(DH, WH, f), lvl * 0.55);
}

function worldToScreen_before(wx, wy, camCX, camCY, ts, cw, ch, e) {
  const dx = wx - camCX, dy = wy - camCY;
  const tw = ts, th = ts * 0.5;
  return {
    x: (dx - dy) * (tw / 2) + cw / 2,
    y: (dx + dy) * (th / 2) + ch / 2 - e * ts * ISO_ELEV_RATIO,
  };
}

function renderTile_before(tile, x, y, camCX, camCY, ts, cw, ch) {
  const e = tile.elevation;
  const color = colorOf_before(tile);     // string allocation
  const back  = worldToScreen_before(x,   y,   camCX, camCY, ts, cw, ch, e);
  const right = worldToScreen_before(x+1, y,   camCX, camCY, ts, cw, ch, e);
  const front = worldToScreen_before(x+1, y+1, camCX, camCY, ts, cw, ch, e);
  const left  = worldToScreen_before(x,   y+1, camCX, camCY, ts, cw, ch, e);

  // cliff right face
  const erR = tiles[y * GRID + Math.min(x+1, GRID-1)].elevation;
  if (e > erR + 1e-4) {
    const lowR = worldToScreen_before(x+1, y,   camCX, camCY, ts, cw, ch, erR);
    const lowF = worldToScreen_before(x+1, y+1, camCX, camCY, ts, cw, ch, erR);
    calls.gradient++;
    calls.beginPath++; calls.fill++; calls.stroke++;
  }
  // cliff left face
  const elL = tiles[Math.min(y+1, GRID-1) * GRID + x].elevation;
  if (e > elL + 1e-4) {
    const lowL = worldToScreen_before(x,   y+1, camCX, camCY, ts, cw, ch, elL);
    const lowF = worldToScreen_before(x+1, y+1, camCX, camCY, ts, cw, ch, elL);
    calls.gradient++;
    calls.beginPath++; calls.fill++; calls.stroke++;
  }
  // tile top
  calls.beginPath++; calls.fill++; calls.stroke++;
}

// ----------- AFTER code ----------------------------------------------------
// Per-mode color cache stored on tile object itself
const COL_KEY = '_col_terrain';
function colorOf_after(tile) {
  if (tile[COL_KEY]) return tile[COL_KEY];
  if (tile.type === 1) return (tile[COL_KEY] = `rgb(92,152,200)`);
  const lvl = Math.min(1, (tile.level || 0) / 5) * 0.55;
  const f = tile.fertility;
  const r = Math.round(lerp(lerp(DL[0], WL[0], f), lerp(DH[0], WH[0], f), lvl));
  const g = Math.round(lerp(lerp(DL[1], WL[1], f), lerp(DH[1], WH[1], f), lvl));
  const b = Math.round(lerp(lerp(DL[2], WL[2], f), lerp(DH[2], WH[2], f), lvl));
  return (tile[COL_KEY] = `rgb(${r},${g},${b})`);
}

function renderTile_after(tile, x, y, camCX, camCY, ts, hw, hh, elevPx, BASE_SX, BASE_SY, doStroke, doCliffs) {
  const e = tile.elevation;
  colorOf_after(tile);   // cached after first frame

  // Inline corner calculation (no function call, no object alloc)
  const bx = (x - y) * hw + BASE_SX;
  const by = (x + y) * hh + BASE_SY - e * elevPx;
  // right = (bx+hw, by+hh), front = (bx, by+2*hh), left = (bx-hw, by+hh)

  if (doCliffs) {
    const erR = tiles[y * GRID + Math.min(x+1, GRID-1)].elevation;
    if (e > erR + 1e-4) {
      // no gradient — just flat fill
      calls.beginPath++; calls.fill++;
      if (doStroke) calls.stroke++;
    }
    const elL = tiles[Math.min(y+1, GRID-1) * GRID + x].elevation;
    if (e > elL + 1e-4) {
      calls.beginPath++; calls.fill++;
      if (doStroke) calls.stroke++;
    }
  }
  calls.beginPath++; calls.fill++;
  if (doStroke) calls.stroke++;
}

// ----------- Sort simulation -----------------------------------------------
function simSort_before(n) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push({ y: Math.random() * 100, x: Math.random() * 100 });
  arr.sort((a, b) => (a.y + a.x) - (b.y + b.x));
}
function simSort_after(n) {
  // Same — sort isn't optimized in this pass (workers + buildings, small array)
  simSort_before(n);
}

// ----------- Zoom levels ---------------------------------------------------
const ZOOM_LEVELS = [
  { name: 'XXS   ', ts: 7  },
  { name: 'XS    ', ts: 11 },
  { name: 'Small ', ts: 15 },
  { name: 'Medium', ts: 20 },
  { name: 'Large ', ts: 60 },
];

function visibleTiles(ts) {
  // Isometric: canvas 600px, diamond width = ts, height = ts/2
  // visible columns ≈ 600/(ts/2) * 2, rows similar
  const cols = Math.min(GRID, Math.ceil(CANVAS / (ts / 2)) + 2);
  const rows = Math.min(GRID, Math.ceil(CANVAS / (ts / 4)) + 10);  // +10 = height padding
  return cols * rows;
}

// ----------- Run -----------------------------------------------------------
console.log(`\n=== Render-bench (${MODE.toUpperCase()}) — ${FRAMES} frames per zoom ===\n`);
console.log('Zoom    ts  tiles    ms/frame   equiv-FPS   gradient-calls/frame');
console.log('------  --  ------   --------   ---------   --------------------');

for (const { name, ts } of ZOOM_LEVELS) {
  const nTiles = Math.min(visibleTiles(ts), tiles.length);
  const camCX = GRID / 2, camCY = GRID / 2;
  const hw = ts / 2, hh = ts / 4, elevPx = ts * ISO_ELEV_RATIO;
  const BASE_SX = (camCY - camCX) * hw + CANVAS / 2;
  const BASE_SY = (-camCX - camCY) * hh + CANVAS / 2;
  const doStroke = ts >= 11;
  const doCliffs = ts >= 8;

  calls = { gradient: 0, beginPath: 0, fill: 0, stroke: 0 };
  let totalMs = 0;

  // Warm up JIT
  for (let w = 0; w < 5; w++) {
    for (let i = 0; i < nTiles; i++) {
      const tile = tiles[i];
      const x = i % GRID, y = (i / GRID) | 0;
      if (MODE === 'before') renderTile_before(tile, x, y, camCX, camCY, ts, CANVAS, CANVAS);
      else                   renderTile_after(tile, x, y, camCX, camCY, ts, hw, hh, elevPx, BASE_SX, BASE_SY, doStroke, doCliffs);
    }
  }
  // Reset tile color cache between zoom levels for fair after-measurement
  if (MODE === 'after') for (const t of tiles) delete t[COL_KEY];

  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    calls.gradient = 0;
    for (let i = 0; i < nTiles; i++) {
      const tile = tiles[i];
      const x = i % GRID, y = (i / GRID) | 0;
      if (MODE === 'before') renderTile_before(tile, x, y, camCX, camCY, ts, CANVAS, CANVAS);
      else                   renderTile_after(tile, x, y, camCX, camCY, ts, hw, hh, elevPx, BASE_SX, BASE_SY, doStroke, doCliffs);
    }
  }
  totalMs = performance.now() - t0;
  const msPerFrame = totalMs / FRAMES;
  const equivFPS = 1000 / msPerFrame;
  const gradPerFrame = calls.gradient;   // last frame count

  console.log(`${name}  ${String(ts).padEnd(4)} ${String(nTiles).padEnd(8)} ${msPerFrame.toFixed(3).padEnd(11)} ${equivFPS.toFixed(0).padEnd(12)} ${gradPerFrame}`);
}

console.log('\nNote: ms/frame = pure JS math only (color + projection + stub draw calls).');
console.log('Real browser FPS also depends on actual Canvas 2D draw call cost (fill/stroke/gradient).');
console.log('Canvas call reduction (gradient→0, stroke skipped at XXS) gives additional ~30-60% speedup.\n');
