// Road rules: speed multipliers and build material. Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { roadSpeedMultiplier, roadCostGood, ROAD_KINDS } from '../src/roads.js';
import { ROAD_WOOD_MULT, ROAD_STONE_MULT } from '../src/config.js';

test('road speed multipliers: none / wood / stone', () => {
  assert.equal(roadSpeedMultiplier(null), 1);
  assert.equal(roadSpeedMultiplier(undefined), 1);
  assert.equal(roadSpeedMultiplier('wood'), ROAD_WOOD_MULT);
  assert.equal(roadSpeedMultiplier('stone'), ROAD_STONE_MULT);
});

test('wood road is 2× and stone road is 3×', () => {
  assert.equal(ROAD_WOOD_MULT, 2);
  assert.equal(ROAD_STONE_MULT, 3);
});

test('a wood road is paid in wood, a stone road in stone', () => {
  assert.equal(roadCostGood('wood'), 'wood');
  assert.equal(roadCostGood('stone'), 'stone');
});

test('there are two road kinds', () => {
  assert.deepEqual(ROAD_KINDS, ['wood', 'stone']);
});
