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
  CLAY_PIT_COUNT,
  SAND_BAR_COUNT,
  COAL_VEIN_COUNT,
  CROP_FIELD_COUNT,
  IRON_VEIN_COUNT,
  COPPER_VEIN_COUNT,
  TIN_VEIN_COUNT,
  PASTURE_COUNT,
  HARVEST_NEAR,
  BUILD_COST,
  DRAIN_INTERVAL,
  BUILD_AUTO_INTERVAL,
  WAREHOUSE_AUTO_CAP,
  PROC_INTERVAL,
  PROC_OUTPUT_CAP,
} from './config.js';
import { mulberry32 } from './core/rng.js';
import { generateMap, mapStats } from './map/mapGenerator.js';
import { TileType } from './map/tile.js';
import { Camera } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { PathCache, findPath } from './core/pathfinder.js';
import { clockInfo, temperatureAt, daylightAt, SEASON_TINT } from './season.js';
import { createTeam, clampTeamCount, defaultScriptFor } from './teams.js';
import { Worker } from './entities/worker.js';
import { createItem } from './items.js';
import {
  createForest, createStoneHill,
  createClayPit, createSandBar, createCoalVein, createCropField,
  createIronVein, createCopperVein, createTinVein, createPasture,
  harvestFeature, regenFeature, canHarvest,
} from './features.js';
import { createBuilding, isFull, deposit, take, EXTRACTION_BUILDINGS, PROC_RECIPES } from './buildings.js';
import { createTradePost, tickTradePost, sellUnits, buyUnits, buyPrice } from './trade.js';
import { runScript } from './scripts.js';
import { TRADE_LOAD, ROAD_INTERVAL, ROAD_BUILD_TIME } from './config.js';
import { roadSpeedMultiplier, roadCostGood } from './roads.js';

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
    this.features = [];   // {x,y} list for regen ticks
    this.tradePosts = [];
    this._rng = null;     // seeded RNG for deterministic placement
    this._drainTimer = 0;

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

    // Deterministic placement RNG seeded from the map seed, so the same seed
    // reproduces the same map AND the same features / depots / trade posts.
    this._rng = mulberry32((seed >>> 0) ^ 0x9e3779b9);

    this.map = generateMap(GRID_COLS, GRID_ROWS, seed);
    this.map.pathCache = new PathCache();
    this.stats = mapStats(this.map);
    this.camera = new Camera(this._viewCols(), this._viewRows(), GRID_COLS, GRID_ROWS);

    this.buildings = [];
    this.features = [];
    this.tradePosts = [];
    this.teams = [];
    this.workers = [];
    this._drainTimer = 0;

    // Scatter natural resources on empty land (seeded).
    this._scatterFeatures(FOREST_COUNT,      createForest);
    this._scatterFeatures(STONEHILL_COUNT,   createStoneHill);
    this._scatterFeatures(CLAY_PIT_COUNT,    createClayPit);
    this._scatterFeatures(SAND_BAR_COUNT,    createSandBar);
    this._scatterFeatures(COAL_VEIN_COUNT,   createCoalVein);
    this._scatterFeatures(CROP_FIELD_COUNT,  createCropField);
    this._scatterFeatures(IRON_VEIN_COUNT,   createIronVein);
    this._scatterFeatures(COPPER_VEIN_COUNT, createCopperVein);
    this._scatterFeatures(TIN_VEIN_COUNT,    createTinVein);
    this._scatterFeatures(PASTURE_COUNT,     createPasture);

    // One trade post per map edge, at a seeded random spot along that edge.
    this._placeTradePosts();

    // Teams: depots spread around the centre, each with starter facilities
    // (paid from the treasury) and its workers. Default scripts: A/B hasty,
    // C long-term.
    const depots = this._pickDepotTiles(teamCount);
    for (let id = 0; id < teamCount; id++) {
      const team = createTeam(id, depots[id], defaultScriptFor(id));
      this.teams.push(team);

      // Starter facilities next to the nearest forest / stone hill, paid for
      // from the treasury so the harvest loop runs from the first frame.
      this._autoBuildStarter(team, 'loggingCamp', 'forest');
      this._autoBuildStarter(team, 'stoneCutter', 'stonehill');
      // Starter warehouse near the depot (hauler needs somewhere to deliver).
      this._placeStarterWarehouse(team);

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

  // Place one trade post (a 換金所 + 購買所 pair) on each of the four edges.
  _placeTradePosts() {
    const { cols, rows } = this.map;
    const edges = ['top', 'bottom', 'left', 'right'];
    for (const edge of edges) {
      const post = createTradePost(this._rng, edge);
      // Pick a seeded spot along the edge, then snap inward to open land.
      let ex; let ey;
      if (edge === 'top') { ex = 1 + ((this._rng() * (cols - 2)) | 0); ey = 1; }
      else if (edge === 'bottom') { ex = 1 + ((this._rng() * (cols - 2)) | 0); ey = rows - 2; }
      else if (edge === 'left') { ex = 1; ey = 1 + ((this._rng() * (rows - 2)) | 0); }
      else { ex = cols - 2; ey = 1 + ((this._rng() * (rows - 2)) | 0); }
      const sell = this._bfsFind(ex, ey, (a, b) => this._isOpenLand(a, b));
      if (!sell) continue;
      const buy = this._bfsFind(sell.x, sell.y, (a, b) =>
        this._isOpenLand(a, b) && !(a === sell.x && b === sell.y));
      if (!buy) continue;
      post.x = sell.x; post.y = sell.y;
      post.sell = { x: sell.x, y: sell.y };
      post.buy = { x: buy.x, y: buy.y };
      this.map.tiles[sell.y][sell.x].trade = { post, role: 'sell' };
      this.map.tiles[buy.y][buy.x].trade = { post, role: 'buy' };
      this.tradePosts.push(post);
    }
  }

  // --- setup helpers --------------------------------------------------------

  _isLand(x, y) {
    if (x < 0 || y < 0 || x >= this.map.cols || y >= this.map.rows) return false;
    return this.map.tiles[y][x].type === TileType.LAND;
  }

  /** Land tile with nothing on it (no item / feature / building / trade / road plan). */
  _isOpenLand(x, y) {
    if (!this._isLand(x, y)) return false;
    const t = this.map.tiles[y][x];
    return t.item == null && t.feature == null && t.building == null
      && t.trade == null && t.roadPlan == null;
  }

  _randomLandTile() {
    const rng = this._rng || Math.random;
    for (let tries = 0; tries < 40; tries++) {
      const x = (rng() * this.map.cols) | 0;
      const y = (rng() * this.map.rows) | 0;
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
   * treasury and puts the facility on the tile. Returns the building, or null
   * if the tile is blocked or the team cannot afford it.
   */
  build(teamId, kind, x, y) {
    const team = this.teams[teamId];
    if (!team || !this.canBuildAt(x, y)) return null;
    if (team.stock.wood < BUILD_COST.wood || team.stock.stone < BUILD_COST.stone) return null;
    team.stock.wood -= BUILD_COST.wood;
    team.stock.stone -= BUILD_COST.stone;
    return this._placeBuilding(team, kind, x, y);
  }

  // --- roads ----------------------------------------------------------------

  // A road may be planned on clear land (no feature / building / trade /
  // existing road or pending plan); an item on the tile is fine.
  _canBuildRoadAt(x, y) {
    if (!this._isLand(x, y)) return false;
    const t = this.map.tiles[y][x];
    return t.feature == null && t.building == null && t.trade == null
      && t.road == null && t.roadPlan == null;
  }

  /**
   * Plan a road of `kind` ('wood' | 'stone') for a team. The road is NOT laid
   * immediately — a builder worker hauls material to the site and constructs
   * it (see _stepRoad). Manual (priority) plans jump to the front of the
   * queue. Returns true if the plan was accepted.
   */
  planRoad(teamId, kind, x, y, priority = false) {
    const team = this.teams[teamId];
    if (!team || !this._canBuildRoadAt(x, y)) return false;
    this.map.tiles[y][x].roadPlan = kind;
    const plan = { x, y, kind };
    if (priority) team.roadQueue.unshift(plan);
    else team.roadQueue.push(plan);
    return true;
  }

  // A running script plans one road tile per ROAD_INTERVAL along a route from
  // the depot to a facility / nearest trade post (one in flight at a time).
  // Hasty plans wood (cheap), long-term plans stone — matching personalities.
  _autoBuildRoads(team, simDt) {
    if (!team.scriptRunning) return;
    team._roadTimer = (team._roadTimer || 0) + simDt;
    if (team._roadTimer < ROAD_INTERVAL) return;
    team._roadTimer = 0;
    // One plan in flight at a time (so construction paces naturally).
    const builder = team.workers[1] || team.workers[0];
    if (team.roadQueue.length || (builder && builder.job === 'road')) return;
    const kind = team.scriptId === 'longterm' ? 'stone' : 'wood';
    const good = roadCostGood(kind);
    if ((team.stock[good] || 0) < 1) return; // can't afford the preferred road

    const targets = [];
    for (const b of team.buildings) if (b.kind !== 'warehouse') targets.push({ x: b.x, y: b.y });
    let np = null;
    let nd = Infinity;
    for (const p of this.tradePosts) {
      const d = Math.abs(p.x - team.depot.x) + Math.abs(p.y - team.depot.y);
      if (d < nd) { nd = d; np = p; }
    }
    if (np) targets.push({ x: np.sell.x, y: np.sell.y });

    for (const tg of targets) {
      const path = findPath(this.map, { x: team.depot.x, y: team.depot.y }, { x: tg.x, y: tg.y }, false, {
        maxStep: 1, fallbackToNearest: true,
      });
      if (!path) continue;
      for (const step of path) {
        if (this._canBuildRoadAt(step.x, step.y)) {
          this.planRoad(team.id, kind, step.x, step.y);
          return;
        }
      }
    }
  }

  // --- trade orders (physically hauled by a worker) -------------------------

  /** Queue a trade order. Manual (priority) orders jump to the front. */
  enqueueTrade(teamId, kind, good, postIndex, qty, priority = false) {
    const team = this.teams[teamId];
    if (!team || !this.tradePosts[postIndex]) return null;
    const o = { kind, good, postIndex, qty: Math.max(1, qty | 0) };
    if (priority) team.tradeQueue.unshift(o);
    else team.tradeQueue.push(o);
    return o;
  }

  // Player-driven trades are manual commands → always queued at priority,
  // regardless of the team's script run/stop state.
  sellAt(teamId, postIndex, good, qty) {
    return this.enqueueTrade(teamId, 'sell', good, postIndex, qty, true);
  }
  buyAt(teamId, postIndex, good, qty) {
    return this.enqueueTrade(teamId, 'buy', good, postIndex, qty, true);
  }

  // --- auto-script control --------------------------------------------------

  setTeamScript(teamId, scriptId) {
    const team = this.teams[teamId];
    if (team) team.scriptId = scriptId;
  }
  setScriptRunning(teamId, running) {
    const team = this.teams[teamId];
    if (team) team.scriptRunning = !!running;
  }

  /** Place one starter warehouse adjacent to the depot (seeded BFS). */
  _placeStarterWarehouse(team) {
    const spot = this._bfsFind(team.depot.x, team.depot.y, (x, y) => this._isOpenLand(x, y));
    if (!spot) return null;
    return this.build(team.id, 'warehouse', spot.x, spot.y);
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

    // Demand recovers at every trade post (prices drift back to base).
    for (const post of this.tradePosts) tickTradePost(post, simDt);

    // Camps ship their buffered goods into the team treasury.
    this._drainTimer += simDt;
    if (this._drainTimer >= DRAIN_INTERVAL) {
      this._drainTimer = 0;
      this._drainCamps();
    }

    // Running auto-scripts act on their own timer (trade + road + warehouse building).
    for (const team of this.teams) {
      runScript(team, this.tradePosts, simDt);
      this._autoBuildRoads(team, simDt);
      this._autoBuildStructures(team, simDt);
    }

    // Processing buildings convert goods from team.stock on their own timer.
    this._tickProcessors(simDt);
  }

  // Fallback drain for teams with fewer than 3 workers (no dedicated hauler).
  // Teams with 3+ workers use the physical hauler instead.
  _drainCamps() {
    for (const b of this.buildings) {
      const team = this.teams[b.teamId];
      if (!team || team.workers.length >= 3) continue;
      const spec = EXTRACTION_BUILDINGS[b.kind];
      if (!spec) continue;
      const g = spec.good;
      if ((b[g] || 0) > 0) { b[g] -= 1; team.stock[g] = (team.stock[g] || 0) + 1; }
    }
  }

  _routeTo(worker, gx, gy) {
    const path = findPath(this.map, { x: worker.x, y: worker.y }, { x: gx, y: gy }, false, {
      maxStep: 1,
      fallbackToNearest: true,
    });
    worker.path = path || [];
  }

  // Advance a worker, scaling its speed by the road under it (shared infra:
  // any road on the current tile speeds anyone up). Returns true at path end.
  _advanceWorker(worker, simDt) {
    const tx = Math.max(0, Math.min(this.map.cols - 1, Math.round(worker.rx)));
    const ty = Math.max(0, Math.min(this.map.rows - 1, Math.round(worker.ry)));
    const mult = roadSpeedMultiplier(this.map.tiles[ty][tx].road);
    return worker.advance(simDt, WORKER_SPEED * mult);
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

    // The team's trader (worker[0]) preempts harvesting to fulfil a pending
    // trade order — so manual / script trades get hauled promptly.
    if (worker.job !== 'trade' && this._isTrader(worker, team) && team.tradeQueue.length) {
      this._startTrade(worker, team);
    }
    if (worker.job === 'trade') { this._stepTrade(worker, team, simDt); return; }

    // The team's builder (worker[1], or worker[0] solo) preempts harvesting to
    // construct a planned road.
    if (worker.job !== 'road' && this._isBuilder(worker, team) && team.roadQueue.length) {
      this._startRoad(worker, team);
    }
    if (worker.job === 'road') { this._stepRoad(worker, team, simDt); return; }

    // The team's hauler (worker[2]) physically moves goods from camps to warehouses.
    if (worker.job !== 'haul' && this._isHauler(worker, team)) {
      const camp = this._pickCampWithStock(team);
      const wh = this._nearestWarehouse(team, worker.x, worker.y);
      if (camp && wh) this._startHaul(worker, team, camp);
    }
    if (worker.job === 'haul') { this._stepHaul(worker, team, simDt); return; }

    if (!worker.job) {
      if (!this._assignJob(worker, team)) return; // nothing to do — idle
    }

    const camp = this._buildingAt(worker.campTile.x, worker.campTile.y);
    if (!camp) { this._endJob(worker); return; } // camp gone

    if (worker.phase === 'toCamp') {
      if (this._advanceWorker(worker, simDt)) {
        if (isFull(camp)) { this._endJob(worker); return; }
        this._headToResource(worker);
      }
      return;
    }

    if (worker.phase === 'toResource') {
      if (this._advanceWorker(worker, simDt)) {
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
      if (this._advanceWorker(worker, simDt)) {
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
    for (const [kind, spec] of Object.entries(EXTRACTION_BUILDINGS)) {
      const camp = this._pickCamp(team, kind, spec.featureKind, worker);
      if (camp) { this._beginJob(worker, kind, camp); return true; }
    }
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

  // --- physical trade hauling ----------------------------------------------

  _isTrader(worker, team) {
    return team.workers.length > 0 && team.workers[0] === worker;
  }

  // Begin fulfilling the next queued trade order. Drops any harvest load to
  // the floor first so nothing vanishes.
  _startTrade(worker, team) {
    if (worker.carrying) worker.dropCarried(this.map);
    this._endJob(worker);
    const o = team.tradeQueue.shift();
    if (!o) return;
    const post = this.tradePosts[o.postIndex];
    if (!post) return;
    worker.job = 'trade';
    worker.load = null;
    worker.trade = { kind: o.kind, good: o.good, postIndex: o.postIndex, qty: o.qty,
      phase: o.kind === 'sell' ? 'toDepot' : 'toPost' };
    if (o.kind === 'sell') this._routeTo(worker, team.depot.x, team.depot.y);
    else this._routeTo(worker, post.buy.x, post.buy.y);
  }

  _endTrade(worker) {
    worker.job = null;
    worker.trade = null;
    worker.load = null;
    worker.phase = null;
    worker.path = null;
  }

  // FSM:
  //   sell: toDepot (load up from treasury) → toPost (sell at 換金所)
  //   buy:  toPost (buy at 購買所)          → toDepot (drop into treasury)
  _stepTrade(worker, team, simDt) {
    const tr = worker.trade;
    const post = this.tradePosts[tr.postIndex];
    if (!post) { this._endTrade(worker); return; }
    if (!this._advanceWorker(worker, simDt)) return; // still travelling

    if (tr.kind === 'sell') {
      if (tr.phase === 'toDepot') {
        const avail = team.stock[tr.good] || 0;
        const load = Math.min(tr.qty, TRADE_LOAD, avail);
        if (load <= 0) { this._endTrade(worker); return; }
        team.stock[tr.good] = avail - load;
        worker.load = { good: tr.good, qty: load };
        tr.phase = 'toPost';
        this._routeTo(worker, post.sell.x, post.sell.y);
      } else { // toPost — sell the carried load
        if (worker.load) {
          team.stock.currency += sellUnits(post, worker.load.good, worker.load.qty);
          worker.load = null;
        }
        this._endTrade(worker);
      }
      return;
    }

    // buy
    if (tr.phase === 'toPost') {
      const unit = buyPrice(post, tr.good);
      const afford = Math.floor((team.stock.currency || 0) / unit);
      const qty = Math.min(tr.qty, TRADE_LOAD, afford);
      if (qty <= 0) { this._endTrade(worker); return; }
      team.stock.currency -= buyUnits(post, tr.good, qty);
      worker.load = { good: tr.good, qty };
      tr.phase = 'toDepot';
      this._routeTo(worker, team.depot.x, team.depot.y);
    } else { // toDepot — unload into the treasury
      if (worker.load) {
        team.stock[worker.load.good] = (team.stock[worker.load.good] || 0) + worker.load.qty;
        worker.load = null;
      }
      this._endTrade(worker);
    }
  }

  // --- physical road construction ------------------------------------------

  _isBuilder(worker, team) {
    const b = team.workers[1] || team.workers[0];
    return b === worker;
  }

  // --- physical goods hauling (camp → warehouse) ----------------------------

  _isHauler(worker, team) {
    return team.workers.length >= 3 && team.workers[2] === worker;
  }

  _pickCampWithStock(team) {
    for (const b of team.buildings) {
      const spec = EXTRACTION_BUILDINGS[b.kind];
      if (spec && (b[spec.good] || 0) > 0) return { x: b.x, y: b.y, good: spec.good };
    }
    return null;
  }

  _nearestWarehouse(team, fromX, fromY) {
    let best = null;
    let bestD = Infinity;
    for (const b of team.buildings) {
      if (b.kind !== 'warehouse' || isFull(b)) continue;
      const d = Math.abs(b.x - fromX) + Math.abs(b.y - fromY);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  _startHaul(worker, team, camp) {
    if (worker.carrying) worker.dropCarried(this.map);
    this._endJob(worker);
    worker.job = 'haul';
    worker.haul = { campX: camp.x, campY: camp.y, good: camp.good, phase: 'toCamp' };
    this._routeTo(worker, camp.x, camp.y);
  }

  _endHaul(worker) {
    worker.job = null;
    worker.haul = null;
    worker.load = null;
    worker.path = null;
  }

  // FSM: toCamp (arrive at camp, pick up 1 unit) → toWarehouse (deliver to warehouse)
  _stepHaul(worker, team, simDt) {
    const h = worker.haul;
    if (!h) { this._endHaul(worker); return; }

    if (h.phase === 'toCamp') {
      if (!this._advanceWorker(worker, simDt)) return;
      const camp = this._buildingAt(h.campX, h.campY);
      if (!camp || !take(camp, h.good)) { this._endHaul(worker); return; }
      worker.load = { good: h.good, qty: 1 };
      const wh = this._nearestWarehouse(team, worker.x, worker.y);
      if (!wh) {
        // No warehouse available — put unit back
        camp[h.good] += 1;
        worker.load = null;
        this._endHaul(worker);
        return;
      }
      h.warehouseX = wh.x;
      h.warehouseY = wh.y;
      h.phase = 'toWarehouse';
      this._routeTo(worker, wh.x, wh.y);
      return;
    }

    if (h.phase === 'toWarehouse') {
      if (!this._advanceWorker(worker, simDt)) return;
      const wh = this._buildingAt(h.warehouseX, h.warehouseY);
      if (wh && !isFull(wh) && deposit(wh, h.good)) {
        team.stock[h.good] = (team.stock[h.good] || 0) + 1;
      } else {
        // Warehouse gone or full — try the next available one
        const alt = this._nearestWarehouse(team, worker.x, worker.y);
        if (alt) {
          h.warehouseX = alt.x;
          h.warehouseY = alt.y;
          this._routeTo(worker, alt.x, alt.y);
          return;
        }
        // Nowhere to deliver — return goods to camp
        const camp = this._buildingAt(h.campX, h.campY);
        if (camp && !isFull(camp)) camp[h.good] = (camp[h.good] || 0) + 1;
      }
      worker.load = null;
      this._endHaul(worker);
    }
  }

  // --- processing buildings (auto-convert team.stock on a timer) -----------

  _tickProcessors(simDt) {
    for (const b of this.buildings) {
      const recipes = PROC_RECIPES[b.kind];
      if (!recipes) continue;
      const team = this.teams[b.teamId];
      if (!team) continue;
      b._procTimer = (b._procTimer || 0) + simDt;
      if (b._procTimer < PROC_INTERVAL) continue;
      b._procTimer -= PROC_INTERVAL;
      for (const r of recipes) {
        if (!r.inputs.every(([g, qty]) => (team.stock[g] || 0) >= qty)) continue;
        if ((team.stock[r.output] || 0) >= PROC_OUTPUT_CAP) continue;
        for (const [g, qty] of r.inputs) team.stock[g] -= qty;
        team.stock[r.output] = (team.stock[r.output] || 0) + 1;
        break;
      }
    }
  }

  // --- auto-build structures -----------------------------------------------

  // 加工 building の建築優先順位（依存関係の順）
  static PROC_BUILD_ORDER = [
    'sawmill', 'charcoalKiln', 'kiln', 'smelter', 'alloyForge',
    'ropeMaker', 'windmill', 'weavery', 'smithy', 'precisionWorkshop',
  ];

  /**
   * 実行中スクリプトが BUILD_AUTO_INTERVAL ごとに1棟ずつ建築する。
   * 優先順位：採取 building → 加工 building → 倉庫（上限 WAREHOUSE_AUTO_CAP）
   */
  _autoBuildStructures(team, simDt) {
    if (!team.scriptRunning) return;
    team._buildAutoTimer = (team._buildAutoTimer || 0) + simDt;
    if (team._buildAutoTimer < BUILD_AUTO_INTERVAL) return;
    team._buildAutoTimer = 0;
    if (team.stock.wood < BUILD_COST.wood || team.stock.stone < BUILD_COST.stone) return;

    // 1. 採取 building：feature が存在する種類ごとに1棟ずつ自動建築
    for (const [kind, spec] of Object.entries(EXTRACTION_BUILDINGS)) {
      if (team.buildings.some(b => b.kind === kind)) continue;
      const spot = this._findSpotForExtraction(team, spec.featureKind);
      if (spot && this.build(team.id, kind, spot.x, spot.y)) return;
    }

    // 2. 加工 building：依存順に1種類ずつ建築
    for (const kind of Game.PROC_BUILD_ORDER) {
      if (team.buildings.some(b => b.kind === kind)) continue;
      const spot = this._bfsFind(team.depot.x, team.depot.y, (x, y) => this.canBuildAt(x, y));
      if (spot && this.build(team.id, kind, spot.x, spot.y)) return;
    }

    // 3. 倉庫を上限まで増設
    const warehouses = team.buildings.filter(b => b.kind === 'warehouse');
    if (warehouses.length < WAREHOUSE_AUTO_CAP) {
      const spot = this._bfsFind(team.depot.x, team.depot.y, (x, y) => this.canBuildAt(x, y));
      if (spot) this.build(team.id, 'warehouse', spot.x, spot.y);
    }
  }

  /** 指定 featureKind が HARVEST_NEAR 内に存在する、開けた陸タイルを返す。 */
  _findSpotForExtraction(team, featureKind) {
    const feat = this._nearestFeature(
      team.depot.x, team.depot.y, featureKind,
      team.depot.x, team.depot.y, 50,
    );
    if (!feat) return null;
    return this._bfsFind(feat.x, feat.y, (a, b) =>
      this._isOpenLand(a, b) &&
      this._nearestFeature(a, b, featureKind, a, b, HARVEST_NEAR) != null);
  }

  // Begin the next queued road plan: haul material from the depot, carry it to
  // the site, then construct. Drops any harvest load first.
  _startRoad(worker, team) {
    if (worker.carrying) worker.dropCarried(this.map);
    this._endJob(worker);
    const plan = team.roadQueue.shift();
    if (!plan) return;
    worker.job = 'road';
    worker.load = null;
    worker.road = { x: plan.x, y: plan.y, kind: plan.kind, phase: 'toDepot', t: 0 };
    this._routeTo(worker, team.depot.x, team.depot.y);
  }

  _endRoad(worker) {
    worker.job = null;
    worker.road = null;
    worker.load = null;
    worker.phase = null;
    worker.path = null;
  }

  // FSM: toDepot (reserve 1 material) → toSite (carry it) → building (spend
  // ROAD_BUILD_TIME on site) → lay the road, consuming the material.
  _stepRoad(worker, team, simDt) {
    const r = worker.road;
    const tile = this.map.tiles[r.y]?.[r.x];
    if (!tile) { this._endRoad(worker); return; }

    if (r.phase === 'toDepot') {
      if (!this._advanceWorker(worker, simDt)) return;
      const good = roadCostGood(r.kind);
      if ((team.stock[good] || 0) < 1) { tile.roadPlan = null; this._endRoad(worker); return; }
      team.stock[good] -= 1;          // pick up the material
      worker.load = { good, qty: 1 };
      r.phase = 'toSite';
      this._routeTo(worker, r.x, r.y);
      return;
    }

    if (r.phase === 'toSite') {
      if (!this._advanceWorker(worker, simDt)) return;
      r.phase = 'building';
      r.t = 0;
      return;
    }

    // building — stand on site and work for ROAD_BUILD_TIME
    r.t += simDt;
    if (r.t >= ROAD_BUILD_TIME) {
      if (tile.building || tile.feature || tile.road) {
        // site became invalid — return the material to the treasury
        if (worker.load) { team.stock[worker.load.good] = (team.stock[worker.load.good] || 0) + worker.load.qty; }
      } else {
        tile.road = r.kind;  // road appears…
      }
      worker.load = null;    // …material is consumed (or already refunded)
      tile.roadPlan = null;
      this._endRoad(worker);
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
