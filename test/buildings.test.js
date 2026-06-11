// Building storage rules: per-type acceptance, capacity, and build cost.
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBuilding, capFor, accepts, deposit, take, isFull,
  total, teamStock, takeFromTeam,
} from '../src/buildings.js';
import { WAREHOUSE_CAP, LOGGING_CAP, QUARRY_CAP } from '../src/config.js';

test('capacities match config', () => {
  assert.equal(capFor('warehouse'), WAREHOUSE_CAP);
  assert.equal(capFor('loggingCamp'), LOGGING_CAP);
  assert.equal(capFor('stoneCutter'), QUARRY_CAP);
});

test('a logging camp accepts only wood; a stone cutter only stone', () => {
  const camp = createBuilding('loggingCamp', 0);
  const cutter = createBuilding('stoneCutter', 0);
  assert.equal(accepts(camp, 'wood'), true);
  assert.equal(accepts(camp, 'stone'), false);
  assert.equal(accepts(cutter, 'stone'), true);
  assert.equal(accepts(cutter, 'wood'), false);
});

test('a warehouse accepts both wood and stone', () => {
  const wh = createBuilding('warehouse', 0);
  assert.equal(accepts(wh, 'wood'), true);
  assert.equal(accepts(wh, 'stone'), true);
});

test('deposit honours type and fills up to capacity', () => {
  const camp = createBuilding('loggingCamp', 0); // cap 5, wood only
  assert.equal(deposit(camp, 'stone'), false);   // wrong type
  for (let i = 0; i < LOGGING_CAP; i++) assert.equal(deposit(camp, 'wood'), true);
  assert.equal(isFull(camp), true);
  assert.equal(deposit(camp, 'wood'), false);     // full
  assert.equal(camp.wood, LOGGING_CAP);
});

test('take removes one unit when present', () => {
  const wh = createBuilding('warehouse', 0, { wood: 2 });
  assert.equal(take(wh, 'wood'), true);
  assert.equal(wh.wood, 1);
  assert.equal(take(wh, 'stone'), false);
});

test('teamStock sums across buildings; takeFromTeam draws one unit', () => {
  const buildings = [
    createBuilding('warehouse', 0, { wood: 1, stone: 1 }),
    createBuilding('loggingCamp', 0, { wood: 3 }),
  ];
  const stock = teamStock(buildings);
  assert.equal(stock.wood, 4);
  assert.equal(stock.stone, 1);
  assert.equal(takeFromTeam(buildings, 'stone'), true);
  assert.equal(teamStock(buildings).stone, 0);
  assert.equal(takeFromTeam(buildings, 'stone'), false); // none left
});

test('total counts wood + stone', () => {
  assert.equal(total(createBuilding('warehouse', 0, { wood: 2, stone: 3 })), 5);
});
