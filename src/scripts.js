// Auto-scripts — per-team strategies that QUEUE physical trade orders while
// running. A team worker then hauls the goods to/from the post.
//
//   hasty (拙速)    — chases immediate profit: dumps surplus wood at the
//                     nearest post even at a low price, tops up stone.
//   longterm (長期) — patient: only sells wood where the price has recovered,
//                     keeps a bigger reserve, buys stone only when cheap.
//
// The player's manual trades always take priority — scripts only enqueue when
// the team has no pending order and its trader is free.

import { SCRIPT_INTERVAL } from './config.js';
import { sellPrice, buyPrice } from './trade.js';

export const SCRIPTS = {
  hasty: { id: 'hasty', label: '拙速', keepWood: 50, sellBatch: 15, minStone: 8 },
  longterm: { id: 'longterm', label: '長期', keepWood: 150, sellBatch: 10, minStone: 16 },
};

function nearestPostIndex(team, posts) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const d = Math.abs(p.x - team.depot.x) + Math.abs(p.y - team.depot.y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function bestSellIndex(posts, good) {
  let best = -1;
  let bestPrice = -Infinity;
  for (let i = 0; i < posts.length; i++) {
    const pr = sellPrice(posts[i], good);
    if (pr > bestPrice) { bestPrice = pr; best = i; }
  }
  return best;
}

function cheapestBuyIndex(posts, good) {
  let best = -1;
  let bestPrice = Infinity;
  for (let i = 0; i < posts.length; i++) {
    const pr = buyPrice(posts[i], good);
    if (pr < bestPrice) { bestPrice = pr; best = i; }
  }
  return best;
}

function order(team, kind, good, postIndex, qty) {
  if (postIndex < 0 || qty <= 0) return;
  team.tradeQueue.push({ kind, good, postIndex, qty });
}

// Hasty: dump surplus wood at the nearest post (accepts a low price), else
// top up stone.
function actHasty(team, posts, cfg) {
  const pi = nearestPostIndex(team, posts);
  if (pi < 0) return;
  const post = posts[pi];
  if (team.stock.wood > cfg.keepWood && sellPrice(post, 'wood') >= post.table.wood.baseSell * 0.45) {
    order(team, 'sell', 'wood', pi, cfg.sellBatch);
    return;
  }
  if (team.stock.stone < cfg.minStone) {
    order(team, 'buy', 'stone', pi, cfg.minStone - team.stock.stone);
  }
}

// Long-term: sell wood only at the best (recovered) price; buy stone only
// when cheap.
function actLongterm(team, posts, cfg) {
  if (team.stock.wood > cfg.keepWood) {
    const pi = bestSellIndex(posts, 'wood');
    if (pi >= 0 && sellPrice(posts[pi], 'wood') >= posts[pi].table.wood.baseSell) {
      order(team, 'sell', 'wood', pi, cfg.sellBatch);
      return;
    }
  }
  if (team.stock.stone < cfg.minStone) {
    const pi = cheapestBuyIndex(posts, 'stone');
    if (pi >= 0 && buyPrice(posts[pi], 'stone') <= posts[pi].table.stone.baseBuy) {
      order(team, 'buy', 'stone', pi, cfg.minStone - team.stock.stone);
    }
  }
}

/**
 * Advance a running team's script; queues at most one order at a time (waits
 * until the trader has delivered the previous one).
 */
export function runScript(team, posts, dt) {
  if (!team.scriptRunning) return;
  team._scriptTimer += dt;
  if (team._scriptTimer < SCRIPT_INTERVAL) return;
  team._scriptTimer = 0;
  // One order in flight at a time: skip while a manual/earlier order is queued
  // or the trader is mid-haul.
  const trader = team.workers[0];
  if (team.tradeQueue.length || (trader && trader.job === 'trade')) return;
  const cfg = SCRIPTS[team.scriptId] || SCRIPTS.hasty;
  if (team.scriptId === 'longterm') actLongterm(team, posts, cfg);
  else actHasty(team, posts, cfg);
}
