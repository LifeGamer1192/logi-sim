// Floor-item placement rules: one item per tile, overflow to the nearest
// free land tile. Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { TileType } from '../src/map/tile.js';
import { createItem, placeItemNear, canHoldItem, removeItemAt } from '../src/items.js';

// Build a small all-land map (optionally mark some tiles as water).
function makeMap(cols, rows, water = []) {
  const waterSet = new Set(water.map(([x, y]) => `${x},${y}`));
  const tiles = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) {
      row.push({
        x, y,
        type: waterSet.has(`${x},${y}`) ? TileType.WATER : TileType.LAND,
        item: null,
        level: 0,
      });
    }
    tiles.push(row);
  }
  return { cols, rows, tiles };
}

test('an item drops onto the requested free tile', () => {
  const map = makeMap(5, 5);
  const item = createItem('package');
  const tile = placeItemNear(map, 2, 2, item);
  assert.equal(tile, map.tiles[2][2]);
  assert.equal(map.tiles[2][2].item, item);
  assert.equal(item.x, 2);
  assert.equal(item.y, 2);
});

test('a tile holds at most one item — overflow goes to a neighbour', () => {
  const map = makeMap(5, 5);
  const a = createItem();
  const b = createItem();
  placeItemNear(map, 2, 2, a);
  const tileB = placeItemNear(map, 2, 2, b); // (2,2) is taken
  assert.notEqual(tileB, map.tiles[2][2]);
  assert.equal(map.tiles[2][2].item, a);
  // b lands on a 4-neighbour of (2,2) (BFS nearest free).
  const d = Math.abs(tileB.x - 2) + Math.abs(tileB.y - 2);
  assert.equal(d, 1);
  assert.equal(tileB.item, b);
});

test('items never land on water — they spill to the nearest land', () => {
  // (2,2) and all its 4-neighbours are water; nearest land is distance 2.
  const map = makeMap(5, 5, [[2, 2], [1, 2], [3, 2], [2, 1], [2, 3]]);
  assert.equal(canHoldItem(map, 2, 2), false);
  const item = createItem();
  const tile = placeItemNear(map, 2, 2, item);
  assert.ok(tile);
  assert.equal(tile.type, TileType.LAND);
  assert.ok(Math.abs(tile.x - 2) + Math.abs(tile.y - 2) >= 2);
});

test('removeItemAt frees the tile and detaches the item', () => {
  const map = makeMap(3, 3);
  const item = createItem();
  placeItemNear(map, 1, 1, item);
  const removed = removeItemAt(map, 1, 1);
  assert.equal(removed, item);
  assert.equal(map.tiles[1][1].item, null);
  assert.equal(item.x, -1);
});

test('placeItemNear returns null when nowhere can hold the item', () => {
  const map = makeMap(2, 2, [[0, 0], [1, 0], [0, 1], [1, 1]]); // all water
  const tile = placeItemNear(map, 0, 0, createItem());
  assert.equal(tile, null);
});
