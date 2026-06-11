// Auto-scripts — per-team strategies that trade on their own while running.
//
//   hasty (拙速)    — chases immediate profit: sells surplus wood at the
//                     nearest post even at a mediocre price, tops up stone.
//   longterm (長期) — patient: only sells wood at the post offering the best
//                     (recovered) price, holds a bigger reserve, buys stone
//                     only when it is cheap.
//
// The player's manual trades always take priority — scripts only act on their
// own timer and never undo a manual action.

import { SCRIPT_INTERVAL } from './config.js';
import { sellPrice, buyPrice, doSell, doBuy } from './trade.js';

export const SCRIPTS = {
  hasty: { id: 'hasty', label: '拙速', keepWood: 50, sellBatch: 15, minStone: 8 },
  longterm: { id: 'longterm', label: '長期', keepWood: 150, sellBatch: 10, minStone: 16 },
};

function nearestPost(team, posts) {
  let best = null;
  let bestD = Infinity;
  for (const p of posts) {
    const d = Math.abs(p.x - team.depot.x) + Math.abs(p.y - team.depot.y);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function bestSellPost(posts, good) {
  let best = null;
  let bestPrice = -Infinity;
  for (const p of posts) {
    const pr = sellPrice(p, good);
    if (pr > bestPrice) { bestPrice = pr; best = p; }
  }
  return best;
}

function cheapestBuyPost(posts, good) {
  let best = null;
  let bestPrice = Infinity;
  for (const p of posts) {
    const pr = buyPrice(p, good);
    if (pr < bestPrice) { bestPrice = pr; best = p; }
  }
  return best;
}

// One hasty decision: dump surplus wood now (accepts a low price as long as
// it is above the floor) at the nearest post, then top up stone. Quick cash,
// even if it crashes the local price.
function actHasty(team, posts, cfg) {
  const post = nearestPost(team, posts);
  if (!post) return;
  if (team.stock.wood > cfg.keepWood && sellPrice(post, 'wood') >= post.table.wood.baseSell * 0.45) {
    doSell(team, post, 'wood', cfg.sellBatch);
    return;
  }
  if (team.stock.stone < cfg.minStone) {
    doBuy(team, post, 'stone', cfg.minStone - team.stock.stone);
  }
}

// One long-term decision: only sell wood where the price has recovered;
// buy stone only when cheap.
function actLongterm(team, posts, cfg) {
  if (team.stock.wood > cfg.keepWood) {
    const post = bestSellPost(posts, 'wood');
    if (post && sellPrice(post, 'wood') >= post.table.wood.baseSell) {
      doSell(team, post, 'wood', cfg.sellBatch);
      return;
    }
  }
  if (team.stock.stone < cfg.minStone) {
    const post = cheapestBuyPost(posts, 'stone');
    if (post && buyPrice(post, 'stone') <= post.table.stone.baseBuy) {
      doBuy(team, post, 'stone', cfg.minStone - team.stock.stone);
    }
  }
}

/** Advance a running team's script; acts once per SCRIPT_INTERVAL. */
export function runScript(team, posts, dt) {
  if (!team.scriptRunning) return;
  team._scriptTimer += dt;
  if (team._scriptTimer < SCRIPT_INTERVAL) return;
  team._scriptTimer = 0;
  const cfg = SCRIPTS[team.scriptId] || SCRIPTS.hasty;
  if (team.scriptId === 'longterm') actLongterm(team, posts, cfg);
  else actHasty(team, posts, cfg);
}
