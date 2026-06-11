// Worker carry rules: one item at a time; surplus is left on the floor.
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { TileType } from '../src/map/tile.js';
import { Worker } from '../src/entities/worker.js';
import { createItem } from '../src/items.js';

function makeMap(cols, rows) {
  const tiles = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) row.push({ x, y, type: TileType.LAND, item: null, level: 0 });
    tiles.push(row);
  }
  return { cols, rows, tiles };
}

test('a worker can pick up one item', () => {
  const w = new Worker(1, 1, 0);
  assert.equal(w.isCarrying, false);
  assert.equal(w.pickUp(createItem()), true);
  assert.equal(w.isCarrying, true);
});

test('a worker carries only one item at a time — a second pickup is refused', () => {
  const w = new Worker(1, 1, 0);
  w.pickUp(createItem());
  const refused = w.pickUp(createItem());
  assert.equal(refused, false);
  assert.equal(w.isCarrying, true);
});

test('dropping puts the carried item on the floor and frees the hand', () => {
  const map = makeMap(4, 4);
  const w = new Worker(2, 2, 0);
  const item = createItem();
  w.pickUp(item);
  const tile = w.dropCarried(map);
  assert.equal(tile, map.tiles[2][2]);
  assert.equal(map.tiles[2][2].item, item);
  assert.equal(w.isCarrying, false);
});

test('dropping onto an occupied tile overflows to a neighbour', () => {
  const map = makeMap(4, 4);
  map.tiles[2][2].item = createItem(); // tile already taken
  const w = new Worker(2, 2, 0);
  w.pickUp(createItem());
  const tile = w.dropCarried(map);
  assert.notEqual(tile, map.tiles[2][2]);
  assert.equal(Math.abs(tile.x - 2) + Math.abs(tile.y - 2), 1);
  assert.equal(w.isCarrying, false);
});

test('advance walks the worker along its path', () => {
  const w = new Worker(0, 0, 0);
  w.path = [{ x: 1, y: 0 }, { x: 2, y: 0 }];
  w.advance(10, 5); // plenty of budget to finish the 2-tile path
  assert.equal(w.x, 2);
  assert.equal(w.y, 0);
  assert.equal(w.atPathEnd(), true);
});
