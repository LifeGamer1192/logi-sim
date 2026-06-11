// The game: owns the terraced tile map, camera, clock, the logistics teams
// with their workers, and the items resting on the floor. Runs the frame
// loop and the workers' simple haul-to-depot behaviour.
//
// logi-sim engine + first domain layer. Reuses farm-proto's engine pieces
// (seeded map gen, A* pathfinder, iso camera, season clock).

import {
  GRID_COLS,
  GRID_ROWS,
  CANVAS_W,
  CANVAS_H,
  ZOOM_LEVELS,
  DEFAULT_ZOOM,
  SPEED_LEVELS,
  DEFAULT_SPEED,
  CAMERA_SPEED,
  DEFAULT_TEAM_COUNT,
  DEFAULT_WORKERS_PER_TEAM,
  WORKER_SPEED,
} from './config.js';
import { generateMap, mapStats } from './map/mapGenerator.js';
import { TileType } from './map/tile.js';
import { Camera } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { PathCache, findPath } from './core/pathfinder.js';
import { clockInfo, temperatureAt, daylightAt, SEASON_TINT } from './season.js';
import { createTeam, clampTeamCount } from './teams.js';
import { Worker } from './entities/worker.js';
import { createItem, placeItemNear, removeItemAt } from './items.js';

const INITIAL_PACKAGES = 28; // packages scattered on a fresh map

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    this.renderer = new Renderer(canvas);

    this.viewMode = 'terrain';
    this.panDir = { x: 0, y: 0 };
    this.keys = new Set();
    this.hover = null;

    this.zoomIndex = DEFAULT_ZOOM;
    this.tileSize = ZOOM_LEVELS[DEFAULT_ZOOM].tile;
    this.speedIndex = DEFAULT_SPEED;

    this.map = null;
    this.camera = null;
    this.stats = null;
    this.paused = false;
    this.fps = null;

    this.teams = [];
    this.workers = [];

    this.clock = 0;
    this.environment = null;
    this._seasonEvent = null;

    this._loop = this._loop.bind(this);
    this._lastTime = 0;
  }

  get seed() {
    return this.map.seed;
  }
  get speed() {
    const idx = this.speedIndex;
    if (!Number.isInteger(idx) || idx < 0 || idx >= SPEED_LEVELS.length) {
      return SPEED_LEVELS[DEFAULT_SPEED];
    }
    return SPEED_LEVELS[idx];
  }

  _viewCols() {
    return Math.round(CANVAS_W / this.tileSize);
  }
  _viewRows() {
    return Math.round(CANVAS_H / this.tileSize);
  }

  /**
   * Generate a fresh map and populate teams, workers and packages.
   * @param {number} seed
   * @param {{teamCount?:number, workersPerTeam?:number}} [setup]
   */
  newMap(seed, setup = {}) {
    const teamCount = clampTeamCount(setup.teamCount ?? DEFAULT_TEAM_COUNT);
    const workersPerTeam = Math.max(1, Math.round(setup.workersPerTeam ?? DEFAULT_WORKERS_PER_TEAM));

    this.map = generateMap(GRID_COLS, GRID_ROWS, seed);
    this.map.pathCache = new PathCache();
    this.stats = mapStats(this.map);
    this.camera = new Camera(this._viewCols(), this._viewRows(), GRID_COLS, GRID_ROWS);

    // Teams: depots spread around the map centre, each with its workers.
    this.teams = [];
    this.workers = [];
    const depots = this._pickDepotTiles(teamCount);
    for (let id = 0; id < teamCount; id++) {
      const team = createTeam(id, depots[id]);
      this.teams.push(team);
      for (let i = 0; i < workersPerTeam; i++) {
        const spawn = this._findLandNear(depots[id].x, depots[id].y, i + 1);
        const w = new Worker(spawn.x, spawn.y, id);
        w.id = this.workers.length;
        this.workers.push(w);
        team.workers.push(w);
      }
    }

    // Scatter starter packages for the workers to haul.
    for (let i = 0; i < INITIAL_PACKAGES; i++) {
      const t = this._randomLandTile();
      if (t) placeItemNear(this.map, t.x, t.y, createItem('package'));
    }

    this.camera.centerOn(depots[0].x + 0.5, depots[0].y + 0.5);
    this.clock = 0;
    this._seasonEvent = null;
    this._updateEnvironment();
  }

  // --- spawn helpers --------------------------------------------------------

  _isLand(x, y) {
    if (x < 0 || y < 0 || x >= this.map.cols || y >= this.map.rows) return false;
    return this.map.tiles[y][x].type === TileType.LAND;
  }

  /** Nearest land tile to (x, y) by BFS. Falls back to (x, y). */
  _findLandNear(x, y) {
    const { cols, rows } = this.map;
    const seen = new Uint8Array(cols * rows);
    const cx = Math.max(0, Math.min(cols - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(rows - 1, Math.round(y)));
    const queue = [{ x: cx, y: cy }];
    seen[cy * cols + cx] = 1;
    const dirs = [1, 0, -1, 0, 0, 1, 0, -1];
    for (let h = 0; h < queue.length; h++) {
      const c = queue[h];
      if (this._isLand(c.x, c.y)) return c;
      for (let d = 0; d < 8; d += 2) {
        const nx = c.x + dirs[d];
        const ny = c.y + dirs[d + 1];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (seen[ni]) continue;
        seen[ni] = 1;
        queue.push({ x: nx, y: ny });
      }
    }
    return { x: cx, y: cy };
  }

  /** N depot tiles spread on a ring around the map centre, snapped to land. */
  _pickDepotTiles(n) {
    const cx = this.map.cols / 2;
    const cy = this.map.rows / 2;
    const radius = Math.min(this.map.cols, this.map.rows) * 0.32;
    const out = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
      const tx = cx + Math.cos(ang) * (n === 1 ? 0 : radius);
      const ty = cy + Math.sin(ang) * (n === 1 ? 0 : radius);
      out.push(this._findLandNear(tx, ty));
    }
    return out;
  }

  _randomLandTile() {
    for (let tries = 0; tries < 40; tries++) {
      const x = (Math.random() * this.map.cols) | 0;
      const y = (Math.random() * this.map.rows) | 0;
      if (this._isLand(x, y)) return { x, y };
    }
    return null;
  }

  // --- public interactions --------------------------------------------------

  /** Spawn a package at/near a tile (used by click-to-place). */
  spawnItemAt(x, y) {
    if (!this.map) return null;
    return placeItemNear(this.map, x, y, createItem('package'));
  }

  setSpeed(index) {
    this.speedIndex = Math.max(0, Math.min(SPEED_LEVELS.length - 1, index));
  }
  setZoom(index) {
    this.zoomIndex = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, index));
    this.tileSize = ZOOM_LEVELS[this.zoomIndex].tile;
    this.camera.resize(this._viewCols(), this._viewRows());
  }

  _panVector() {
    const k = 1 / Math.sqrt(2);
    let dx = this.panDir.x;
    let dy = this.panDir.y;
    if (this.keys.has('w')) { dx -= k; dy -= k; }
    if (this.keys.has('s')) { dx += k; dy += k; }
    if (this.keys.has('a')) { dx -= k; dy += k; }
    if (this.keys.has('d')) { dx += k; dy -= k; }
    return { dx, dy };
  }

  // --- frame loop -----------------------------------------------------------

  update(realDt) {
    const { dx, dy } = this._panVector();
    if (dx !== 0 || dy !== 0) {
      this.camera.pan(dx * CAMERA_SPEED * realDt, dy * CAMERA_SPEED * realDt);
    }
    if (this.paused) return;
    const simDt = realDt * this.speed;
    if (!Number.isFinite(simDt) || simDt <= 0) return;
    this.clock += simDt;
    if (this.map.pathCache) this.map.pathCache.nextFrame();
    const prevSeason = this.environment.seasonIndex;
    this._updateEnvironment();
    if (this.environment.seasonIndex !== prevSeason) {
      this._seasonEvent = this.environment.season;
    }
    for (const w of this.workers) this._stepWorker(w, simDt);
  }

  // Is `item` already someone's target or in someone's hand?
  _isClaimed(item) {
    for (const w of this.workers) {
      if (w.carrying === item || w.targetItem === item) return true;
    }
    return false;
  }

  // Nearest unclaimed, undelivered floor item to (x, y).
  _nearestFreeItem(x, y) {
    let best = null;
    let bestD = Infinity;
    for (let ty = 0; ty < this.map.rows; ty++) {
      for (let tx = 0; tx < this.map.cols; tx++) {
        const it = this.map.tiles[ty][tx].item;
        if (!it || it.delivered) continue;
        if (this._isClaimed(it)) continue;
        const d = Math.abs(tx - x) + Math.abs(ty - y);
        if (d < bestD) { bestD = d; best = it; }
      }
    }
    return best;
  }

  _routeTo(worker, gx, gy) {
    const path = findPath(this.map, { x: worker.x, y: worker.y }, { x: gx, y: gy }, false, {
      maxStep: 1,
      fallbackToNearest: true,
    });
    worker.path = path || [];
  }

  /**
   * One worker tick. Two-state haul loop:
   *   idle/toItem  → walk to the nearest free package, pick it up (one only)
   *   toDepot      → carry it to the team depot and drop it (overflow nearby)
   * Pathing uses maxStep 1, so cliffs taller than one terrace block routes.
   */
  _stepWorker(worker, simDt) {
    const team = this.teams[worker.teamId];
    if (worker.isCarrying) {
      if (worker.state !== 'toDepot') {
        worker.state = 'toDepot';
        worker.target = { x: team.depot.x, y: team.depot.y };
        this._routeTo(worker, team.depot.x, team.depot.y);
      }
      const done = worker.advance(simDt, WORKER_SPEED);
      if (done) {
        const tile = worker.dropCarried(this.map);
        if (tile) tile.item.delivered = true; // delivered goods stay put
        worker.state = 'idle';
        worker.target = null;
        worker.path = null;
      }
      return;
    }

    // Not carrying — acquire / pursue a target package.
    if (!worker.targetItem || worker.targetItem.delivered ||
        this.map.tiles[worker.targetItem.y]?.[worker.targetItem.x]?.item !== worker.targetItem) {
      worker.targetItem = this._nearestFreeItem(worker.x, worker.y);
      worker.path = null;
      worker.state = 'idle';
    }
    if (!worker.targetItem) return; // nothing to do

    if (worker.state !== 'toItem') {
      worker.state = 'toItem';
      this._routeTo(worker, worker.targetItem.x, worker.targetItem.y);
    }
    const done = worker.advance(simDt, WORKER_SPEED);
    if (done) {
      const it = worker.targetItem;
      if (it && this.map.tiles[it.y]?.[it.x]?.item === it &&
          Math.abs(worker.x - it.x) + Math.abs(worker.y - it.y) <= 1) {
        removeItemAt(this.map, it.x, it.y);
        worker.pickUp(it);          // one item only
        worker.targetItem = null;
        worker.state = 'toDepot';
        worker.path = null;
      } else {
        // couldn't reach it (claimed/gone) — drop the target and retry next tick
        worker.targetItem = null;
        worker.state = 'idle';
      }
    }
  }

  _updateEnvironment() {
    const info = clockInfo(this.clock);
    info.temperature = temperatureAt(info.yearProgress);
    info.daylight = Math.max(0, Math.min(1, daylightAt(info.yearProgress)));
    this.environment = info;
  }

  consumeSeasonChange() {
    const s = this._seasonEvent;
    this._seasonEvent = null;
    return s;
  }

  render() {
    this.renderer.draw({
      map: this.map,
      camera: this.camera,
      mode: this.viewMode,
      hover: this.hover,
      tileSize: this.tileSize,
      seasonTint: SEASON_TINT[this.environment.season],
      clock: this.clock,
      teams: this.teams,
      workers: this.workers,
    });
  }

  _loop(time) {
    const rawDt = (time - this._lastTime) / 1000;
    const dt = Math.min(rawDt, 0.05);
    this._lastTime = time;
    if (rawDt > 0 && rawDt < 1) {
      const instantFps = 1 / rawDt;
      this.fps = this.fps == null ? instantFps : this.fps * 0.92 + instantFps * 0.08;
    }
    this.update(dt);
    this.render();
    requestAnimationFrame(this._loop);
  }

  start() {
    this._lastTime = performance.now();
    requestAnimationFrame(this._loop);
  }
}
