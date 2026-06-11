// Canvas 2D rendering: the visible slice of the tile map.
//
// logi-sim minimal engine renderer. Derived from farm-proto's renderer but
// stripped down to terrain only — the iso-projected tile grid with slope
// shading and the seasonal tint. Domain entities (vehicles, depots, orders)
// will get their own draw passes layered on top in later versions.

import { TileType } from '../map/tile.js';
import {
  worldToScreen,
  screenToWorld,
  ISO_TILE_W_RATIO,
  ISO_TILE_H_RATIO,
  ISO_ELEV_RATIO,
  elevationLift,
} from './camera.js';

const lerp = (a, b, t) => a + (b - a) * t;

// α36 perf: parse-once / multiply / format hot path for the per-tile slope
// shade. Caches by (color, shade-bucket) so a 100×100 map's per-tile fill
// stops reparsing the same "rgb(120,140,80)" 10,000 times a frame.
const _shadeCache = new Map();
function fastShade(color, mul) {
  const mulBucket = Math.round(mul * 50) / 50;
  const key = color + '|' + mulBucket;
  let v = _shadeCache.get(key);
  if (v !== undefined) return v;
  const open = color.indexOf('(');
  const close = color.indexOf(')');
  if (open < 0 || close < 0) { _shadeCache.set(key, color); return color; }
  const parts = color.slice(open + 1, close).split(',');
  const r = Math.max(0, Math.min(255, (parseInt(parts[0], 10) * mulBucket) | 0));
  const g = Math.max(0, Math.min(255, (parseInt(parts[1], 10) * mulBucket) | 0));
  const b = Math.max(0, Math.min(255, (parseInt(parts[2], 10) * mulBucket) | 0));
  v = `rgb(${r},${g},${b})`;
  if (_shadeCache.size > 4096) _shadeCache.clear();
  _shadeCache.set(key, v);
  return v;
}

function mix(c1, c2, t) {
  const r = Math.round(lerp(c1[0], c2[0], t));
  const g = Math.round(lerp(c1[1], c2[1], t));
  const b = Math.round(lerp(c1[2], c2[2], t));
  return `rgb(${r},${g},${b})`;
}

// Per water-kind tint. Ocean is the deep blue of the original; lakes are a
// slightly greener teal; rivers lean toward grey-blue.
const WATER_TINT = {
  ocean: { shallow: [92, 152, 200], deep: [28, 66, 122] },
  lake:  { shallow: [110, 168, 178], deep: [40, 90, 110] },
  river: { shallow: [120, 156, 180], deep: [50, 80, 110] },
};
function waterColor(tile) {
  const kind = tile.waterKind || 'ocean';
  const tint = WATER_TINT[kind] || WATER_TINT.ocean;
  return mix(tint.shallow, tint.deep, 1 - tile.elevation);
}

const VIEW_MODES = {
  terrain(tile) {
    if (tile.type === TileType.WATER) return waterColor(tile);
    return mix([196, 184, 132], [70, 130, 55], tile.fertility);
  },
  fertility(tile) {
    if (tile.type === TileType.WATER) return 'rgb(45,52,64)';
    return mix([60, 50, 40], [120, 230, 110], tile.fertility);
  },
  moisture(tile) {
    return mix([200, 170, 120], [40, 110, 200], tile.moisture);
  },
  sunlight(tile) {
    return mix([25, 30, 45], [255, 225, 120], tile.sunlight);
  },
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ts = 20;
  }

  draw(scene) {
    const { map, camera, mode } = scene;
    this.ts = scene.tileSize;
    const ctx = this.ctx;
    const ts = this.ts;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const colorOf = VIEW_MODES[mode] || VIEW_MODES.terrain;

    ctx.clearRect(0, 0, cw, ch);

    // Visible-tile bounding box: conservatively enclose the canvas-visible
    // parallelogram in a rectangle by unprojecting the four canvas corners.
    const corners = [
      screenToWorld(0, 0, camera, ts, cw, ch),
      screenToWorld(cw, 0, camera, ts, cw, ch),
      screenToWorld(0, ch, camera, ts, cw, ch),
      screenToWorld(cw, ch, camera, ts, cw, ch),
    ];
    const minX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x))) - 1);
    const maxX = Math.min(map.cols - 1, Math.ceil(Math.max(...corners.map((c) => c.x))) + 1);
    const minY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y))) - 1);
    const maxY = Math.min(map.rows - 1, Math.ceil(Math.max(...corners.map((c) => c.y))) + 1);

    // Pre-compute corner projection ONCE for the visible region into typed
    // arrays. The corner grid is one wider/taller than the tile grid so every
    // tile can index its four corners directly.
    const cxN = maxX - minX + 2; // corners per row
    const ryN = maxY - minY + 2; // corner rows
    const cornerX = new Float32Array(cxN * ryN);
    const cornerY = new Float32Array(cxN * ryN);
    const camCx = camera.x + camera.viewCols / 2;
    const camCy = camera.y + camera.viewRows / 2;
    const projTW2 = ts * ISO_TILE_W_RATIO * 0.5;
    const projTH2 = ts * ISO_TILE_H_RATIO * 0.5;
    const elevPx = ts * ISO_ELEV_RATIO;
    const halfW = cw * 0.5;
    const halfH = ch * 0.5;
    const tilesArr = map.tiles;
    const mapCols = map.cols;
    const mapRows = map.rows;
    for (let cy = 0; cy < ryN; cy++) {
      const wy = minY + cy;
      for (let cx = 0; cx < cxN; cx++) {
        const wx = minX + cx;
        let sum = 0, n = 0;
        // 4 tiles sharing corner (wx, wy).
        if (wx - 1 >= 0 && wy - 1 >= 0 && wx - 1 < mapCols && wy - 1 < mapRows) {
          sum += tilesArr[wy - 1][wx - 1].elevation || 0; n++;
        }
        if (wx >= 0 && wy - 1 >= 0 && wx < mapCols && wy - 1 < mapRows) {
          sum += tilesArr[wy - 1][wx].elevation || 0; n++;
        }
        if (wx - 1 >= 0 && wy >= 0 && wx - 1 < mapCols && wy < mapRows) {
          sum += tilesArr[wy][wx - 1].elevation || 0; n++;
        }
        if (wx >= 0 && wy >= 0 && wx < mapCols && wy < mapRows) {
          sum += tilesArr[wy][wx].elevation || 0; n++;
        }
        const elev = n > 0 ? sum / n : 0;
        const dx = wx - camCx;
        const dy = wy - camCy;
        const idx = cy * cxN + cx;
        cornerX[idx] = (dx - dy) * projTW2 + halfW;
        cornerY[idx] = (dx + dy) * projTH2 + halfH - elevationLift(elev) * elevPx;
      }
    }
    // Slope shading runs at every zoom level — bucketed fills keep it cheap.
    const xSpan = maxX - minX + 1;
    const tileN = xSpan * (maxY - minY + 1);
    const shadeArr = new Float32Array(tileN);
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const here = tilesArr[ty][tx].elevation || 0;
        const eW = tx - 1 >= 0      ? (tilesArr[ty][tx - 1].elevation || 0) : here;
        const eE = tx + 1 < mapCols ? (tilesArr[ty][tx + 1].elevation || 0) : here;
        const eN = ty - 1 >= 0      ? (tilesArr[ty - 1][tx].elevation || 0) : here;
        const eS = ty + 1 < mapRows ? (tilesArr[ty + 1][tx].elevation || 0) : here;
        const slope = (-(eE - eW) - (eS - eN)) * 1.5;
        const shade = Math.max(0.55, Math.min(1.30, 1.0 + slope * 0.9));
        shadeArr[(ty - minY) * xSpan + (tx - minX)] = shade;
      }
    }
    // Tile fills batched by fillStyle into Path2D buckets.
    const fillBuckets = new Map(); // fillStyle → Path2D
    for (let mapY = minY; mapY <= maxY; mapY++) {
      const cyTop = mapY - minY;
      const cyBot = cyTop + 1;
      for (let mapX = minX; mapX <= maxX; mapX++) {
        const tile = tilesArr[mapY][mapX];
        const cxL = mapX - minX;
        const cxR = cxL + 1;
        const iTop    = cyTop * cxN + cxL;
        const iRight  = cyTop * cxN + cxR;
        const iBottom = cyBot * cxN + cxR;
        const iLeft   = cyBot * cxN + cxL;
        const topX = cornerX[iTop],    topY = cornerY[iTop];
        const rgtX = cornerX[iRight],  rgtY = cornerY[iRight];
        const botX = cornerX[iBottom], botY = cornerY[iBottom];
        const lftX = cornerX[iLeft],   lftY = cornerY[iLeft];
        const baseColor = colorOf(tile);
        const shade = shadeArr[(mapY - minY) * xSpan + (mapX - minX)];
        const fillStyle = shade === 1.0 ? baseColor : fastShade(baseColor, shade);
        let path = fillBuckets.get(fillStyle);
        if (!path) { path = new Path2D(); fillBuckets.set(fillStyle, path); }
        path.moveTo(topX, topY);
        path.lineTo(rgtX, rgtY);
        path.lineTo(botX, botY);
        path.lineTo(lftX, lftY);
        path.closePath();
      }
    }
    // Flush the bucketed tile fills (1 fill() per unique colour).
    for (const [fillStyle, path] of fillBuckets) {
      ctx.fillStyle = fillStyle;
      ctx.fill(path);
    }

    // --- seasonal tint (demand-cycle visual cue) ---
    if (scene.seasonTint) {
      ctx.fillStyle = scene.seasonTint;
      ctx.fillRect(0, 0, cw, ch);
    }
  }
}
