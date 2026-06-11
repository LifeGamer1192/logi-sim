// The same seed must reproduce the same map AND the same placement of
// features, depots, trade posts and workers. Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../src/game.js';

// A headless canvas: the renderer is constructed but never drawn in these
// tests, so a no-op 2D context proxy is enough.
function fakeCanvas() {
  const ctx = new Proxy({}, { get: () => () => {} });
  return { width: 0, height: 0, getContext: () => ctx };
}

function snapshot(seed) {
  const g = new Game(fakeCanvas());
  g.newMap(seed, { teamCount: 3, workersPerTeam: 4 });
  return {
    levels: g.map.tiles.map((row) => row.map((t) => t.level)),
    features: g.features.map((f) => `${f.x},${f.y}`),
    posts: g.tradePosts.map((p) => `${p.edge}:${p.x},${p.y}:${p.buy.x},${p.buy.y}`),
    workers: g.workers.map((w) => `${w.teamId}:${w.x},${w.y}`),
    scripts: g.teams.map((tm) => tm.scriptId),
  };
}

test('same seed reproduces an identical world', () => {
  const a = snapshot(20260611);
  const b = snapshot(20260611);
  assert.deepEqual(a, b);
});

test('different seeds produce different worlds', () => {
  const a = snapshot(1);
  const b = snapshot(2);
  assert.notDeepEqual(a.levels, b.levels);
});

test('default scripts are A/B hasty, C long-term', () => {
  const a = snapshot(42);
  assert.deepEqual(a.scripts, ['hasty', 'hasty', 'longterm']);
});

test('four trade posts, one per edge', () => {
  const a = snapshot(99);
  assert.equal(a.posts.length, 4);
  const edges = new Set(a.posts.map((p) => p.split(':')[0]));
  assert.deepEqual([...edges].sort(), ['bottom', 'left', 'right', 'top']);
});
