// A worker (driver) belonging to a team.
//
// Core rule (logi-sim): a worker carries AT MOST ONE item at a time. Picking
// up is refused while already carrying; the surplus is left on the floor by
// the caller (see game.js / items.placeItemNear).

import { placeItemNear } from '../items.js';

export class Worker {
  constructor(x, y, teamId) {
    this.x = x;          // current tile (integer)
    this.y = y;
    this.rx = x;         // smoothed render position (floats)
    this.ry = y;
    this.teamId = teamId;
    this.carrying = null; // the single item in hand, or null
    this.path = null;     // remaining waypoints [{x,y}, ...]
    this.target = null;   // logical goal {x,y} this trip is for
    this.state = 'idle';  // 'idle' | 'toItem' | 'toDepot'
  }

  get isCarrying() {
    return this.carrying != null;
  }

  /**
   * Take an item into hand. Refused (returns false) if already carrying —
   * a worker can only hold one thing at once.
   */
  pickUp(item) {
    if (this.carrying) return false;
    this.carrying = item;
    item.x = -1;
    item.y = -1;
    return true;
  }

  /**
   * Put the carried item down at/near the worker's tile. Honours the
   * one-item-per-tile rule: an occupied tile overflows to the nearest free
   * land tile. Returns the tile it landed on, or null if it could not be
   * placed (item stays in hand in that case).
   */
  dropCarried(map) {
    if (!this.carrying) return null;
    const tile = placeItemNear(map, this.x, this.y, this.carrying);
    if (tile) this.carrying = null;
    return tile;
  }

  /** True once the worker has consumed its whole path. */
  atPathEnd() {
    return !this.path || this.path.length === 0;
  }

  /**
   * Advance the render position toward the next waypoint, snapping the
   * logical tile (x, y) as each waypoint is reached. Returns true when the
   * path has been fully walked this frame.
   */
  advance(dt, speed) {
    if (this.atPathEnd()) {
      this.rx = this.x;
      this.ry = this.y;
      return true;
    }
    let budget = speed * dt;
    while (budget > 0 && this.path.length > 0) {
      const next = this.path[0];
      const dx = next.x - this.rx;
      const dy = next.y - this.ry;
      const dist = Math.hypot(dx, dy);
      if (dist <= budget || dist < 1e-4) {
        this.rx = next.x;
        this.ry = next.y;
        this.x = next.x;
        this.y = next.y;
        this.path.shift();
        budget -= dist;
      } else {
        this.rx += (dx / dist) * budget;
        this.ry += (dy / dist) * budget;
        budget = 0;
      }
    }
    return this.atPathEnd();
  }
}
