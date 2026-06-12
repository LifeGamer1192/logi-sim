// Goods catalogue: structure, price spread, and derived TRADE_* exports.
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { GOODS, GOODS_MAP, TRADE_GOODS, TRADE_BASE } from '../src/goods.js';

test('catalogue has roughly 20 goods', () => {
  assert.ok(GOODS.length >= 18, `expected ≥18, got ${GOODS.length}`);
  assert.ok(GOODS.length <= 30, `expected ≤30, got ${GOODS.length}`);
});

test('every good has a non-empty id, en and ja name', () => {
  for (const g of GOODS) {
    assert.ok(g.id && typeof g.id === 'string', `bad id: ${JSON.stringify(g)}`);
    assert.ok(g.nameEn && typeof g.nameEn === 'string', `bad nameEn: ${g.id}`);
    assert.ok(g.nameJa && typeof g.nameJa === 'string', `bad nameJa: ${g.id}`);
  }
});

test('buy price > sell price (market spread) for every good', () => {
  for (const g of GOODS) {
    assert.ok(g.buy > g.sell,
      `${g.id}: buy(${g.buy}) must exceed sell(${g.sell})`);
  }
});

test('all prices are positive integers', () => {
  for (const g of GOODS) {
    assert.ok(Number.isInteger(g.sell) && g.sell > 0, `${g.id}: sell not a positive int`);
    assert.ok(Number.isInteger(g.buy) && g.buy > 0, `${g.id}: buy not a positive int`);
  }
});

test('GOODS_MAP keys match GOODS ids', () => {
  assert.equal(Object.keys(GOODS_MAP).length, GOODS.length);
  for (const g of GOODS) {
    assert.strictEqual(GOODS_MAP[g.id], g);
  }
});

test('TRADE_GOODS matches GOODS ids in order', () => {
  assert.deepEqual(TRADE_GOODS, GOODS.map(g => g.id));
});

test('TRADE_BASE has buy > sell for every good', () => {
  for (const id of TRADE_GOODS) {
    const { sell, buy } = TRADE_BASE[id];
    assert.ok(buy > sell, `TRADE_BASE[${id}]: buy(${buy}) must exceed sell(${sell})`);
  }
});

test('wood and stone are the first two goods', () => {
  assert.equal(GOODS[0].id, 'wood');
  assert.equal(GOODS[1].id, 'stone');
});
