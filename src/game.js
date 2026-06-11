// The game: owns the terraced tile map, camera, clock, the logistics teams
// with their workers, the natural resources (forests / stone hills) and the
// built facilities (warehouse / logging camp / stone cutter). Runs the frame
// loop, regrows resources, and drives the workers' harvest behaviour.

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
  FOREST_COUNT,
  STONEHILL_COUNT,
  HARVEST_NEAR,
  BUILD_COST,
  START_WOOD,
  START_STONE,
} from './config.js';
import { generateMap, mapStats } from './map/mapGenerator.js';
import { TileType } from './map/tile.js';
import { Camera } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { PathCache, findPath } from './core/pathfinder.js';
import { clockInfo, temperatureAt, daylightAt, SEASON_TINT } from './season.js';
import { createTeam, clampTeamCount } from './teams.js';
import { Worker } from './entities/worker.js';
import { createItem } from './items.js';
import { createForest, createStoneHill, harvestFeature, regenFeature, canHarvest } from './features.js';
import {
  createBuilding, isFull, deposit, teamStock, takeFromTeam,
} from './buildings.js';

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
    this.buildings = [];
    this.features = []; // {tile coords} list for regen ticks

    this.clock = 0;
    this.environment = null;
    this._seasonEvent = null;

    this._loop = this._loop.bind(this);
    this._lastTime = 0;
  }

  get seed() { return this.map.seed; }
  get speed() {
    const idx = this.speedIndex;
    if (!Number.isInteger(idx) || idx < 0 || idx >= SPEED_LEVELS.length) {
      return SPEED_LEVELS[DEFAULT_SPEED];
    }
    return SPEED_LEVELS[idx];
  }

  _viewCols() { return Math.round(CANVAS_W / this.tileSize); }
  _viewRows() { return Math.round(CANVAS_H / this.tileSize); }

  /**
   * Generate a fresh map and populate resources, teams, workers and the
   * starter facilities.
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

    this.buildings = [];
    this.features = [];
    this.teams = [];
    this.workers = [];

    // Scatter forests and stone hills on empty land.
    this._scatterFeatures(FOREST_COUNT, createForest);
    this._scatterFeatures(STONEHILL_COUNT, createStoneHill);

    // Teams: depots spread around the centre, each with a pre-stocked
    // warehouse, a starter logging camp + stone cutter, and its workers.
    const depots = this._pickDepotTiles(teamCount);
    for (let id = 0; id < teamCount; id++) {
      const team = createTeam(id, depots[id]);
      team.buildings = [];
      this.teams.push(team);

      // Founding warehouse on the depot tile (free, pre-stocked).
      this._placeBuilding(team, 'warehouse', depots[id].x, depots[id].y, {
        wood: START_WOOD, stone: START_STONE,
      });

      // Starter facilities next to the nearest forest / stone hill, paid for
      // from the warehouse so the harvest loop runs from the first frame.
      this._autoBuildStarter(team, 'loggingCamp', 'forest');
      this._autoBuildStarter(team, 'stoneCutter', 'stonehill');

      for (let i = 0; i < workersPerTeam; i++) {
        const spawn = this._findOpenLandNear(depots[id].x, depots[id].y);
        const w = new Worker(spawn.x, spawn.y, id);
        w.id = this.workers.length;
        this.workers.push(w);
        team.workers.push(w);
      }
    }

    this.camera.centerOn(depots[0].x + 0.5, depots[0].y + 0.5);
    this.clock = 0;
    this._seasonEvent = null;
    this._updateEnvironment();
  }

  // --- setup helpers --------------------------------------------------------

  _isLand(x, y) {
    if (x < 0 || y < 0 || x >= this.map.cols || y >= this.map.rows) return false;
    return this.map.tiles[y][x].type === TileType.LAND;
  }

  /** Land tile with nothing on it (no item / feature / building). */
  _isOpenLand(x, y) {
    if (!this._isLand(x, y)) return false;
    const t = this.map.tiles[y][x];
    return t.item == null && t.feature == null && t.building == null;
  }

  _randomLandTile() {
    for (let tries = 0; tries < 40; tries++) {
      const x = (Math.random() * this.map.cols) | 0;
      const y = (Math.random() * this.map.rows) | 0;
      if (this._isOpenLand(x, y)) return { x, y };
    }
    return null;
  }

  _scatterFeatures(count, make) {
    for (let i = 0; i < count; i++) {
      const t = this._randomLandTile();
      if (t) {
        this.map.tiles[t.y][t.x].feature = make();
        this.features.push({ x: t.x, y: t.y });
      }
    }
  }

  /** Nearest open land tile to (x, y) by BFS (for worker spawns). */
  _findOpenLandNear(x, y) {
    return this._bfsFind(x, y, (tx, ty) => this._isOpenLand(tx, ty)) || { x, y };
  }

  /** Nearest tile satisfying `ok` from (x, y); walkable-agnostic BFS. */
  _bfsFind(x, y, ok) {
    const { cols, rows } = this.map;
    const seen = new Uint8Array(cols * rows);
    const cx = Math.max(0, Math.min(cols - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(rows - 1, Math.round(y)));
    const queue = [{ x: cx, y: cy }];
    seen[cy * cols + cx] = 1;
    const dirs = [1, 0, -1, 0, 0, 1, 0, -1];
    for (let h = 0; h < queue.length; h++) {
      const c = queue[h];
      if (ok(c.x, c.y)) return c;
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
    return null;
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
      out.push(this._bfsFind(tx, ty, (a, b) => this._isOpenLand(a, b)) || { x: Math.round(tx), y: Math.round(ty) });
    }
    return out;
  }

  // --- features (natural resources) -----------------------------------------

  featureAt(x, y) {
    if (x < 0 || y < 0 || x >= this.map.cols || y >= this.map.rows) return null;
    return this.map.tiles[y][x].feature;
  }

  /** Nearest harvestable feature of `kind` to (fx, fy) within `near` of (nx, ny). */
  _nearestFeature(fx, fy, kind, nx, ny, near) {
    let best = null;
    let bestD = Infinity;
    const x0 = Math.max(0, nx - near);
    const x1 = Math.min(this.map.cols - 1, nx + near);
    const y0 = Math.max(0, ny - near);
    const y1 = Math.min(this.map.rows - 1, ny + near);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (Math.abs(tx - nx) + Math.abs(ty - ny) > near) continue;
        const feat = this.map.tiles[ty][tx].feature;
        if (!feat || feat.kind !== kind || !canHarvest(feat)) continue;
        const d = Math.abs(tx - fx) + Math.abs(ty - fy);
        if (d < bestD) { bestD = d; best = { x: tx, y: ty }; }
      }
    }
    return best;
  }

  // --- buildings ------------------------------------------------------------

  _placeBuilding(team, kind, x, y, init) {
    const b = createBuilding(kind, team.id, init);
    b.x = x;
    b.y = y;
    this.map.tiles[y][x].building = b;
    this.buildings.push(b);
    team.buildings.push(b);
    return b;
  }

  /** Buildable = in bounds, land, nothing already there. */
  canBuildAt(x, y) {
    return this._isOpenLand(x, y);
  }

  /**
   * Player-driven build. Deducts BUILD_COST (wood1 + stone1) from the team's
   * stored stock and puts the facility on the tile. Returns the building, or
   * null if the tile is blocked or the team cannot afford it.
   */
  build(teamId, kind, x, y) {
    const team = this.teams[teamId];
    if (!team || !this.canBuildAt(x, y)) return null;
    const stock = teamStock(team.buildings);
    if (stock.wood < BUILD_COST.wood || stock.stone < BUILD_COST.stone) return null;
    takeFromTeam(team.buildings, 'wood');
    takeFromTeam(team.buildings, 'stone');
    return this._placeBuilding(team, kind, x, y);
  }

  /** Auto-place a starter camp/cutter next to the nearest matching feature. */
  _autoBuildStarter(team, kind, featureKind) {
    const depot = team.depot;
    const feat = this._nearestFeature(depot.x, depot.y, featureKind, depot.x, depot.y, 24);
    if (!feat) return null;
    // Find an open land tile adjacent to the feature to host the facility.
    const spot = this._bfsFind(feat.x, feat.y, (a, b) =>
      this._isOpenLand(a, b) &&
      this._nearestFeature(a, b, featureKind, a, b, HARVEST_NEAR) != null);
    if (!spot) return null;
    return this.build(team.id, kind, spot.x, spot.y);
  }

  // --- public interactions --------------------------------------------------

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
    if (this.environment.seasonIndex !== prevSeason) this._seasonEvent = this.environment.season;

    // Regrow natural resources.
    for (const f of this.features) {
      const feat = this.map.tiles[f.y][f.x].feature;
      if (feat) regenFeature(feat, simDt);
    }
    for (const w of this.workers) this._stepWorker(w, simDt);
  }

  _routeTo(worker, gx, gy) {
    const path = findPath(this.map, { x: worker.x, y: worker.y }, { x: gx, y: gy }, false, {
      maxStep: 1,
      fallbackToNearest: true,
    });
    worker.path = path || [];
  }

  _buildingAt(x, y) {
    if (x < 0 || y < 0 || x >= this.map.cols || y >= this.map.rows) return null;
    return this.map.tiles[y][x].building;
  }

  /**
   * One worker tick. Picks up a harvest job (logging or mining) when its team
   * owns a non-full camp with a stocked resource nearby, then runs the loop:
   *   toCamp → toResource → harvest (carry 1) → toDeposit → store at camp …
   * Stops (idle) when the camp is full. Pathing uses maxStep 1 so cliffs block.
   */
  _stepWorker(worker, simDt) {
    const team = this.teams[worker.teamId];
    if (!worker.job) {
      if (!this._assignJob(worker, team)) return; // nothing to do — idle
    }

    const camp = this._buildingAt(worker.campTile.x, worker.campTile.y);
    if (!camp) { this._endJob(worker); return; } // camp gone

    if (worker.phase === 'toCamp') {
      if (worker.advance(simDt, WORKER_SPEED)) {
        if (isFull(camp)) { this._endJob(worker); return; }
        this._headToResource(worker);
      }
      return;
    }

    if (worker.phase === 'toResource') {
      if (worker.advance(simDt, WORKER_SPEED)) {
        const r = worker.resTile;
        const feat = r ? this.featureAt(r.x, r.y) : null;
        const near = r && Math.abs(worker.x - r.x) + Math.abs(worker.y - r.y) <= 1;
        if (feat && canHarvest(feat) && near) {
          const type = harvestFeature(feat);
          worker.pickUp(createItem(type));
          worker.phase = 'toDeposit';
          this._routeTo(worker, worker.campTile.x, worker.campTile.y);
        } else {
          // resource gone / unreachable — try another nearby one
          this._headToResource(worker);
        }
      }
      return;
    }

    if (worker.phase === 'toDeposit') {
      if (worker.advance(simDt, WORKER_SPEED)) {
        const type = worker.carrying?.type;
        if (type && deposit(camp, type)) {
          worker.carrying = null;
          // keep going while there is room and resources
          if (isFull(camp)) this._endJob(worker);
          else this._headToResource(worker);
        } else {
          // camp full / refuses — leave the load on the floor and stop
          worker.dropCarried(this.map);
          this._endJob(worker);
        }
      }
    }
  }

  _assignJob(worker, team) {
    const log = this._pickCamp(team, 'loggingCamp', 'forest', worker);
    if (log) { this._beginJob(worker, 'log', log); return true; }
    const mine = this._pickCamp(team, 'stoneCutter', 'stonehill', worker);
    if (mine) { this._beginJob(worker, 'mine', mine); return true; }
    return false;
  }

  // A non-full camp of `kind` that has a harvestable `featureKind` nearby,
  // nearest to the worker.
  _pickCamp(team, kind, featureKind, worker) {
    let best = null;
    let bestD = Infinity;
    for (const b of team.buildings) {
      if (b.kind !== kind || isFull(b)) continue;
      if (!this._nearestFeature(b.x, b.y, featureKind, b.x, b.y, HARVEST_NEAR)) continue;
      const d = Math.abs(b.x - worker.x) + Math.abs(b.y - worker.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best ? { x: best.x, y: best.y, featureKind } : null;
  }

  _beginJob(worker, job, camp) {
    worker.job = job;
    worker.campTile = { x: camp.x, y: camp.y };
    worker.featureKind = camp.featureKind;
    worker.phase = 'toCamp';
    this._routeTo(worker, camp.x, camp.y);
  }

  _headToResource(worker) {
    const r = this._nearestFeature(
      worker.x, worker.y, worker.featureKind,
      worker.campTile.x, worker.campTile.y, HARVEST_NEAR,
    );
    if (!r) { this._endJob(worker); return; }
    worker.resTile = r;
    worker.phase = 'toResource';
    this._routeTo(worker, r.x, r.y);
  }

  _endJob(worker) {
    worker.job = null;
    worker.phase = null;
    worker.resTile = null;
    worker.path = null;
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
