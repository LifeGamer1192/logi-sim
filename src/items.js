// Floor items and where they may rest.
//
// Rule (logi-sim): a floor tile holds AT MOST ONE item. When a worker drops
// something onto an occupied (or impassable) tile, the item spills to the
// nearest free land tile instead. `placeItemNear` implements that search.

import { TileType } from './map/tile.js';

let _nextItemId = 1;

/** A movable good. `x`/`y` are set once the item rests on a tile. */
export function createItem(type = 'package') {
  return { id: _nextItemId++, type, x: -1, y: -1 };
}

/** A tile can hold an item only if it is land and currently empty. */
export function canHoldItem(map, x, y) {
  if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) return false;
  const tile = map.tiles[y][x];
  return tile.type === TileType.LAND && tile.item == null;
}

/**
 * Place `item` on tile (x, y) if free; otherwise search outward (BFS) for
 * the nearest free land tile and place it there. Returns the tile the item
 * landed on, or null if nowhere within reach could hold it.
 *
 * The BFS is breadth-first over 4-neighbours, so the chosen tile is the one
 * with the smallest step-distance from the requested spot — the intuitive
 * "put it down right next to where it overflowed" behaviour.
 */
export function placeItemNear(map, x, y, item) {
  const { cols, rows } = map;
  const start = { x: Math.round(x), y: Math.round(y) };
  const seen = new Uint8Array(cols * rows);
  const queue = [start];
  seen[start.y * cols + start.x] = 1;
  const dirs = [1, 0, -1, 0, 0, 1, 0, -1];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur.x >= 0 && cur.y >= 0 && cur.x < cols && cur.y < rows &&
        canHoldItem(map, cur.x, cur.y)) {
      const tile = map.tiles[cur.y][cur.x];
      tile.item = item;
      item.x = cur.x;
      item.y = cur.y;
      return tile;
    }
    for (let d = 0; d < 8; d += 2) {
      const nx = cur.x + dirs[d];
      const ny = cur.y + dirs[d + 1];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (seen[ni]) continue;
      seen[ni] = 1;
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

/** Remove and return the item on a tile, or null if there was none. */
export function removeItemAt(map, x, y) {
  if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) return null;
  const tile = map.tiles[y][x];
  const item = tile.item;
  if (item) {
    tile.item = null;
    item.x = -1;
    item.y = -1;
  }
  return item;
}

/** Collect every item currently resting on the map (for rendering). */
export function collectFloorItems(map) {
  const out = [];
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      const it = map.tiles[y][x].item;
      if (it) out.push(it);
    }
  }
  return out;
}
