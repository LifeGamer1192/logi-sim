// Trade-post pricing: sell/buy mutate the treasury and move prices, which
// recover over time. Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTradePost, sellPrice, buyPrice, doSell, doBuy, tickTradePost,
} from '../src/trade.js';
import { TRADE_BASE } from '../src/config.js';

const rng = () => 0.5; // jitter = 1.0 → prices equal the base
const freshTeam = () => ({ stock: { currency: 1000, wood: 500, stone: 30 } });

test('a new post quotes the base prices', () => {
  const p = createTradePost(rng, 'top');
  assert.equal(sellPrice(p, 'wood'), TRADE_BASE.wood.sell);
  assert.equal(buyPrice(p, 'wood'), TRADE_BASE.wood.buy);
});

test('selling reduces stock, adds currency, and pushes the sell price down', () => {
  const p = createTradePost(rng, 'top');
  const team = freshTeam();
  const before = sellPrice(p, 'wood');
  const r = doSell(team, p, 'wood', 50);
  assert.equal(r.sold, 50);
  assert.equal(team.stock.wood, 450);
  assert.equal(team.stock.currency, 1000 + r.gained);
  assert.ok(sellPrice(p, 'wood') < before, 'sell price should drop after a big sale');
});

test('selling never exceeds what the team holds', () => {
  const p = createTradePost(rng, 'top');
  const team = freshTeam();
  team.stock.wood = 5;
  const r = doSell(team, p, 'wood', 100);
  assert.equal(r.sold, 5);
  assert.equal(team.stock.wood, 0);
});

test('buying adds stock, spends currency, and pushes the buy price up', () => {
  const p = createTradePost(rng, 'top');
  const team = freshTeam();
  const before = buyPrice(p, 'stone');
  const r = doBuy(team, p, 'stone', 10);
  assert.equal(r.bought, 10);
  assert.equal(team.stock.stone, 40);
  assert.equal(team.stock.currency, 1000 - r.spent);
  assert.ok(buyPrice(p, 'stone') > before, 'buy price should rise after buying');
});

test('buying is capped by available currency', () => {
  const p = createTradePost(rng, 'top');
  const team = freshTeam();
  team.stock.currency = 5; // wood buy price is 3 → at most 1 unit
  const r = doBuy(team, p, 'wood', 100);
  assert.equal(r.bought, 1);
  assert.equal(team.stock.currency, 5 - r.spent);
});

test('prices recover toward base over time', () => {
  const p = createTradePost(rng, 'top');
  const team = freshTeam();
  doSell(team, p, 'wood', 80); // depress the sell price
  const depressed = sellPrice(p, 'wood');
  for (let i = 0; i < 600; i++) tickTradePost(p, 0.1); // ~60s of recovery
  const recovered = sellPrice(p, 'wood');
  assert.ok(recovered > depressed, 'price recovers upward');
  assert.equal(recovered, TRADE_BASE.wood.sell, 'returns to base');
});
