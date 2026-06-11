// The game: owns the tile map, camera and clock, and runs the frame loop.
//
// logi-sim minimal engine. Derived from farm-proto but stripped to the
// reusable engine layer — map generation, iso camera, and the season/clock.
// Domain logic for logistics (vehicles, depots, delivery orders) layers on
// top of this skeleton in later versions.

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
} from './config.js';
import { generateMap, mapStats } from './map/mapGenerator.js';
import { Camera } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { PathCache } from './core/pathfinder.js';
import {
  clockInfo,
  temperatureAt,
  daylightAt,
  SEASON_TINT,
} from './season.js';

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

  /** Generate a fresh map and re-center the camera. */
  newMap(seed) {
    this.map = generateMap(GRID_COLS, GRID_ROWS, seed);
    // Per-frame path cache for the A* pathfinder — reused once vehicle
    // routing is wired up; harmless to keep on the map now.
    this.map.pathCache = new PathCache();
    this.stats = mapStats(this.map);
    this.camera = new Camera(this._viewCols(), this._viewRows(), GRID_COLS, GRID_ROWS);
    this.camera.centerOn(GRID_COLS / 2, GRID_ROWS / 2);
    this.clock = 0;
    this._seasonEvent = null;
    this._updateEnvironment();
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
    // WASD pans in iso-screen directions to match the rotated view. Each key
    // contributes its iso vector, normalised by 1/√2 so cardinal keys cover
    // the same per-frame distance and combined presses cancel cleanly.
    const k = 1 / Math.sqrt(2);
    let dx = this.panDir.x;
    let dy = this.panDir.y;
    if (this.keys.has('w')) { dx -= k; dy -= k; }
    if (this.keys.has('s')) { dx += k; dy += k; }
    if (this.keys.has('a')) { dx -= k; dy += k; }
    if (this.keys.has('d')) { dx += k; dy -= k; }
    return { dx, dy };
  }

  update(realDt) {
    // The camera still pans while paused; the clock does not advance.
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
