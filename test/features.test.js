// Natural-resource rules: harvest depletes stock; it regrows over time.
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createForest, createStoneHill, harvestFeature, regenFeature,
  canHarvest, featureStage, FEATURE_YIELD,
} from '../src/features.js';
import { RESOURCE_MAX, REGEN_INTERVAL } from '../src/config.js';

test('a fresh forest / stone hill starts at full stock', () => {
  assert.equal(createForest().stock, RESOURCE_MAX);
  assert.equal(createStoneHill().stock, RESOURCE_MAX);
  assert.equal(FEATURE_YIELD.forest, 'wood');
  assert.equal(FEATURE_YIELD.stonehill, 'stone');
});

test('harvesting a forest yields wood and lowers the stock', () => {
  const f = createForest();
  const got = harvestFeature(f);
  assert.equal(got, 'wood');
  assert.equal(f.stock, RESOURCE_MAX - 1);
});

test('a stone hill yields stone', () => {
  assert.equal(harvestFeature(createStoneHill()), 'stone');
});

test('an empty feature yields nothing but still exists (sapling/pebble)', () => {
  const f = createForest();
  for (let i = 0; i < RESOURCE_MAX; i++) harvestFeature(f);
  assert.equal(f.stock, 0);
  assert.equal(canHarvest(f), false);
  assert.equal(harvestFeature(f), null);
  assert.equal(featureStage(f), 0); // 0 = sapling look
});

test('stock regrows over time, capped at the max', () => {
  const f = createForest();
  for (let i = 0; i < RESOURCE_MAX; i++) harvestFeature(f); // empty it
  regenFeature(f, REGEN_INTERVAL);       // +1
  assert.equal(f.stock, 1);
  regenFeature(f, REGEN_INTERVAL * 100);  // would overshoot
  assert.equal(f.stock, RESOURCE_MAX);    // clamped
});

test('regrow needs a full interval to tick', () => {
  const f = createForest();
  harvestFeature(f);
  regenFeature(f, REGEN_INTERVAL * 0.5); // not yet a full interval
  assert.equal(f.stock, RESOURCE_MAX - 1);
});
