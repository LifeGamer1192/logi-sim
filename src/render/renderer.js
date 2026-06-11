// Canvas 2D rendering: the visible slice of the terraced tile map plus the
// teams' workers and the items resting on the floor.
//
// logi-sim renders the map as DISCRETE STEPPED TERRACES (not a smooth mesh):
// every tile gets a flat diamond top at its own quantized elevation, and the
// two front edges drop as vertical cliff faces to the lower neighbour (or to
// a deep base block at the map border). This makes height read clearly and
// makes it a gameplay factor.

import { TileType } from '../map/tile.js';
import { BASE_ELEV, TEAM_COLORS } from '../config.js';
import { getLang } from '../i18n.js';
import {
  worldToScreen,
  screenToWorld,
  ISO_TILE_W_RATIO,
  ISO_TILE_H_RATIO,
  ISO_ELEV_RATIO,
  elevationLift,
} from './camera.js';

const lerp = (a, b, t) => a + (b - a) * t;

function mix(c1, c2, t) {
  const r = Math.round(lerp(c1[0], c2[0], t));
  const g = Math.round(lerp(c1[1], c2[1], t));
  const b = Math.round(lerp(c1[2], c2[2], t));
  return `rgb(${r},${g},${b})`;
}

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

// Cliff-face dirt palette. The SW (front-left) face catches more light than
// the SE (front-right) face, which sells the block relief.
const FACE_LIT = '#8a6740';
const FACE_SHADED = '#5f4528';
const FACE_BASE = '#3a2a18';   // the deep border base block
const OUTLINE = 'rgba(20,14,8,0.35)';

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
    const elevPx = ts * ISO_ELEV_RATIO;

    ctx.clearRect(0, 0, cw, ch);

    const proj = (wx, wy, e) => worldToScreen(wx, wy, camera, ts, cw, ch, e);

    // Visible-tile bounding box from the four unprojected canvas corners.
    const corners = [
      screenToWorld(0, 0, camera, ts, cw, ch),
      screenToWorld(cw, 0, camera, ts, cw, ch),
      screenToWorld(0, ch, camera, ts, cw, ch),
      screenToWorld(cw, ch, camera, ts, cw, ch),
    ];
    const minX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x))) - 1);
    const maxX = Math.min(map.cols - 1, Math.ceil(Math.max(...corners.map((c) => c.x))) + 1);
    // Pad the top generously: tall terraces above the viewport drop faces
    // down into view. Pad the bottom a little for the same reason.
    const minY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y))) - 8);
    const maxY = Math.min(map.rows - 1, Math.ceil(Math.max(...corners.map((c) => c.y))) + 2);

    const tiles = map.tiles;
    const cols = map.cols;
    const rows = map.rows;
    const neighborElev = (nx, ny) => {
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return BASE_ELEV;
      return tiles[ny][nx].elevation;
    };
    const isBorder = (nx, ny) => nx < 0 || ny < 0 || nx >= cols || ny >= rows;

    // --- terrain: back-to-front, faces then top -------------------------
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = tiles[y][x];
        const e = tile.elevation;
        const back  = proj(x,     y,     e);
        const right = proj(x + 1, y,     e);
        const front = proj(x + 1, y + 1, e);
        const left  = proj(x,     y + 1, e);

        // Front-right face → neighbour (x+1, y).
        const erR = neighborElev(x + 1, y);
        if (e > erR + 1e-4) {
          const lowR  = proj(x + 1, y,     erR);
          const lowF  = proj(x + 1, y + 1, erR);
          ctx.fillStyle = isBorder(x + 1, y) ? FACE_BASE : FACE_SHADED;
          ctx.beginPath();
          ctx.moveTo(right.x, right.y);
          ctx.lineTo(front.x, front.y);
          ctx.lineTo(lowF.x, lowF.y);
          ctx.lineTo(lowR.x, lowR.y);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = OUTLINE;
          ctx.stroke();
        }
        // Front-left face → neighbour (x, y+1).
        const elL = neighborElev(x, y + 1);
        if (e > elL + 1e-4) {
          const lowL  = proj(x,     y + 1, elL);
          const lowF  = proj(x + 1, y + 1, elL);
          ctx.fillStyle = isBorder(x, y + 1) ? FACE_BASE : FACE_LIT;
          ctx.beginPath();
          ctx.moveTo(left.x, left.y);
          ctx.lineTo(front.x, front.y);
          ctx.lineTo(lowF.x, lowF.y);
          ctx.lineTo(lowL.x, lowL.y);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = OUTLINE;
          ctx.stroke();
        }
        // Flat diamond top.
        ctx.fillStyle = colorOf(tile);
        ctx.beginPath();
        ctx.moveTo(back.x, back.y);
        ctx.lineTo(right.x, right.y);
        ctx.lineTo(front.x, front.y);
        ctx.lineTo(left.x, left.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = OUTLINE;
        ctx.stroke();
        // Road surface — an inset diamond in the paving colour.
        if (tile.road) {
          const ccx = (back.x + right.x + front.x + left.x) * 0.25;
          const ccy = (back.y + right.y + front.y + left.y) * 0.25;
          const k = 0.74; // inset toward centre
          ctx.fillStyle = tile.road === 'stone' ? '#8b9099' : '#9c7338';
          ctx.beginPath();
          ctx.moveTo(ccx + (back.x - ccx) * k, ccy + (back.y - ccy) * k);
          ctx.lineTo(ccx + (right.x - ccx) * k, ccy + (right.y - ccy) * k);
          ctx.lineTo(ccx + (front.x - ccx) * k, ccy + (front.y - ccy) * k);
          ctx.lineTo(ccx + (left.x - ccx) * k, ccy + (left.y - ccy) * k);
          ctx.closePath();
          ctx.fill();
          if (tile.road === 'stone') {
            ctx.strokeStyle = 'rgba(40,44,50,0.5)';
            ctx.stroke();
          }
        }
      }
    }

    // --- seasonal tint (demand-cycle cue) -------------------------------
    if (scene.seasonTint) {
      ctx.fillStyle = scene.seasonTint;
      ctx.fillRect(0, 0, cw, ch);
    }

    // --- features, buildings, items, workers — back-to-front ------------
    const drawables = [];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = tiles[y][x];
        const e = tile.elevation;
        if (tile.feature) drawables.push({ kind: 'feature', x: x + 0.5, y: y + 0.5, e, ref: tile.feature });
        if (tile.building) drawables.push({ kind: 'building', x: x + 0.5, y: y + 0.5, e, ref: tile.building });
        if (tile.trade) drawables.push({ kind: 'trade', x: x + 0.5, y: y + 0.5, e, ref: tile.trade });
        if (tile.item) drawables.push({ kind: 'item', x: x + 0.5, y: y + 0.5, e, ref: tile.item });
      }
    }
    const workers = scene.workers || [];
    for (const w of workers) {
      const iy0 = Math.max(0, Math.min(rows - 1, Math.round(w.ry)));
      const ix0 = Math.max(0, Math.min(cols - 1, Math.round(w.rx)));
      const e = tiles[iy0][ix0].elevation;
      drawables.push({ kind: 'worker', x: w.rx + 0.5, y: w.ry + 0.5, e, ref: w });
    }
    drawables.sort((a, b) => (a.y + a.x) - (b.y + b.x));
    for (const d of drawables) {
      const p = proj(d.x, d.y, d.e);
      if (d.kind === 'feature') this._drawFeature(ctx, p.x, p.y, ts, d.ref);
      else if (d.kind === 'building') this._drawBuilding(ctx, p.x, p.y, ts, d.ref, scene.teams);
      else if (d.kind === 'trade') this._drawTrade(ctx, p.x, p.y, ts, d.ref);
      else if (d.kind === 'item') this._drawItem(ctx, p.x, p.y, ts, d.ref);
      else this._drawWorker(ctx, p.x, p.y, ts, d.ref, scene.teams);
    }
  }

  // Forest / stone hill. Size scales with stock; at stock 0 it bottoms out
  // as a sapling (forest) or a single pebble (stone hill).
  _drawFeature(ctx, cx, cy, ts, feat) {
    const stock = Math.max(0, Math.min(feat.max, feat.stock));
    const frac = feat.max > 0 ? stock / feat.max : 0;
    if (feat.kind === 'forest') {
      const trunkH = Math.max(2, ts * (0.12 + 0.30 * frac));
      const crownR = Math.max(2.5, ts * (0.14 + 0.30 * frac));
      // trunk
      ctx.fillStyle = '#7a5230';
      ctx.fillRect(cx - ts * 0.04, cy - trunkH, Math.max(2, ts * 0.08), trunkH);
      // crown — darker/greener when full, paler sapling when low
      const green = stock === 0 ? '#9ec47a' : '#3f7a36';
      ctx.fillStyle = green;
      ctx.beginPath();
      ctx.ellipse(cx, cy - trunkH - crownR * 0.6, crownR, crownR * 1.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,40,16,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      // stone hill — a clump of rocks; a lone pebble at 0.
      const R = Math.max(3, ts * (0.16 + 0.34 * frac));
      ctx.fillStyle = '#9aa0a6';
      ctx.strokeStyle = 'rgba(40,44,50,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - R, cy);
      ctx.lineTo(cx - R * 0.4, cy - R * 0.9);
      ctx.lineTo(cx + R * 0.5, cy - R * 1.0);
      ctx.lineTo(cx + R, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c2c7cc';
      ctx.fillRect(cx - R * 0.5, cy - R * 0.5, R * 0.5, R * 0.4);
    }
  }

  // Warehouse / logging camp / stone cutter — a small coloured box with a
  // team-tinted roof and a stored-count badge.
  _drawBuilding(ctx, cx, cy, ts, b, teams) {
    const w = Math.max(8, ts * 0.7);
    const h = Math.max(7, ts * 0.55);
    const roof = {
      warehouse: '#c8985a',
      loggingCamp: '#6f8f4a',
      stoneCutter: '#8a8f96',
    }[b.kind] || '#b0b0b0';
    // walls
    ctx.fillStyle = '#e3d6bd';
    ctx.fillRect(cx - w / 2, cy - h, w, h);
    ctx.strokeStyle = 'rgba(40,30,16,0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - w / 2, cy - h, w, h);
    // roof band
    ctx.fillStyle = roof;
    ctx.fillRect(cx - w / 2, cy - h, w, h * 0.4);
    // team chip
    const teamColor = (teams && teams[b.teamId]?.color);
    if (teamColor) {
      ctx.fillStyle = teamColor.fill;
      ctx.fillRect(cx - w / 2, cy - h, w * 0.22, h * 0.4);
    }
    // stored count
    const n = b.wood + b.stone;
    if (n > 0) {
      ctx.fillStyle = '#23303a';
      ctx.font = `${Math.max(7, Math.round(ts * 0.42))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n), cx, cy - h * 0.45);
    }
  }

  // Trade-post endpoint: a striped market stall. 換金所 (sell) is gold with a
  // coin; 購買所 (buy) is teal with a basket.
  _drawTrade(ctx, cx, cy, ts, trade) {
    const sell = trade.role === 'sell';
    const w = Math.max(9, ts * 0.8);
    const h = Math.max(8, ts * 0.6);
    // post + canopy
    ctx.fillStyle = '#caa15a';
    ctx.fillRect(cx - w / 2, cy - h, w, h * 0.7);
    ctx.fillStyle = sell ? '#e8c44e' : '#46c0b0';
    ctx.fillRect(cx - w / 2, cy - h - h * 0.28, w, h * 0.32);
    ctx.strokeStyle = 'rgba(40,30,16,0.75)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - w / 2, cy - h - h * 0.28, w, h * 0.28 + h * 0.7);
    // canopy stripes
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      const sx = cx - w / 2 + (w / 4) * i;
      ctx.moveTo(sx, cy - h - h * 0.28);
      ctx.lineTo(sx, cy - h + h * 0.04);
    }
    ctx.stroke();
    // role glyph
    ctx.fillStyle = sell ? '#7a5c10' : '#15524b';
    ctx.font = `bold ${Math.max(8, Math.round(ts * 0.5))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ja = getLang() === 'ja';
    ctx.fillText(sell ? (ja ? '換' : 'S') : (ja ? '買' : 'B'), cx, cy - h * 0.30);
  }

  _drawItem(ctx, cx, cy, ts, item) {
    const type = item?.type || 'package';
    const s = Math.max(4, ts * 0.42);
    if (type === 'wood') {
      // a couple of stacked logs
      const w = s * 1.0;
      const h = s * 0.34;
      ctx.fillStyle = '#9c7338';
      ctx.strokeStyle = 'rgba(40,28,12,0.6)';
      ctx.lineWidth = 1;
      ctx.fillRect(cx - w / 2, cy - h * 2, w, h);
      ctx.strokeRect(cx - w / 2, cy - h * 2, w, h);
      ctx.fillRect(cx - w / 2, cy - h, w, h);
      ctx.strokeRect(cx - w / 2, cy - h, w, h);
      ctx.fillStyle = '#c79a5a';
      ctx.beginPath(); ctx.arc(cx - w / 2, cy - h * 1.5, h * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx - w / 2, cy - h * 0.5, h * 0.5, 0, Math.PI * 2); ctx.fill();
      return;
    }
    if (type === 'stone') {
      const R = s * 0.55;
      ctx.fillStyle = '#9aa0a6';
      ctx.strokeStyle = 'rgba(40,44,50,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - R, cy);
      ctx.lineTo(cx - R * 0.3, cy - R);
      ctx.lineTo(cx + R * 0.6, cy - R * 0.9);
      ctx.lineTo(cx + R, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      return;
    }
    // default crate (package)
    const h = s * 0.62;
    ctx.fillStyle = '#c79a5a';
    ctx.fillRect(cx - s / 2, cy - h, s, h);
    ctx.fillStyle = '#9c7338';
    ctx.fillRect(cx - s / 2, cy - h * 0.42, s, h * 0.42);
    ctx.strokeStyle = 'rgba(40,28,12,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - s / 2, cy - h, s, h);
  }

  _drawWorker(ctx, cx, cy, ts, w, teams) {
    const color = (teams && teams[w.teamId]?.color) || TEAM_COLORS[w.teamId % TEAM_COLORS.length];
    const r = Math.max(3, ts * 0.22);
    // body
    ctx.fillStyle = color.fill;
    ctx.strokeStyle = color.dark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy - r, r, r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // head
    ctx.beginPath();
    ctx.arc(cx, cy - r * 2.2, r * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = '#e8d2b0';
    ctx.fill();
    ctx.stroke();
    // carried floor item marker, tinted by what's in hand
    if (w.carrying) {
      const s = r * 0.95;
      const t = w.carrying.type;
      ctx.fillStyle = t === 'stone' ? '#9aa0a6' : t === 'wood' ? '#9c7338' : '#c79a5a';
      ctx.fillRect(cx - s / 2, cy - r * 3.5, s, s);
      ctx.strokeStyle = 'rgba(40,28,12,0.7)';
      ctx.strokeRect(cx - s / 2, cy - r * 3.5, s, s);
    }
    // trade haul: a bigger crate with the carried quantity
    if (w.load && w.load.qty > 0) {
      const s = r * 1.6;
      ctx.fillStyle = w.load.good === 'stone' ? '#9aa0a6' : '#9c7338';
      ctx.fillRect(cx - s / 2, cy - r * 4.0, s, s * 0.85);
      ctx.strokeStyle = 'rgba(40,28,12,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - s / 2, cy - r * 4.0, s, s * 0.85);
      ctx.fillStyle = '#11240f';
      ctx.font = `bold ${Math.max(7, Math.round(ts * 0.38))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(w.load.qty), cx, cy - r * 4.0 + s * 0.45);
    }
  }
}
