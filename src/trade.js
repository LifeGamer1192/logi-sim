// Trade posts at the map edges. Each post pairs a sell point (換金所) and a
// buy point (購買所) and owns one trade table: per-good sell/buy unit prices.
//
// Prices move with use — selling a good repeatedly drives its sell price down
// (oversupply); buying drives its buy price up (scarcity). Demand recovers
// over time, so both prices drift back toward their base.

import {
  TRADE_GOODS, TRADE_BASE,
  PRICE_SELL_STEP, PRICE_BUY_STEP, PRICE_SELL_FLOOR, PRICE_BUY_CEIL, PRICE_RECOVER,
} from './config.js';

/**
 * Build a trade post's table. `rng` (0..1) adds a small per-post jitter so the
 * four posts quote slightly different prices. Positions are filled in later by
 * the game once it has chosen edge tiles.
 */
export function createTradePost(rng, edge) {
  const table = {};
  for (const good of TRADE_GOODS) {
    const base = TRADE_BASE[good];
    const jitter = 0.85 + rng() * 0.3; // 0.85..1.15
    table[good] = {
      baseSell: Math.max(1, Math.round(base.sell * jitter)),
      baseBuy: Math.max(2, Math.round(base.buy * jitter)),
      sellMult: 1,
      buyMult: 1,
    };
  }
  return { edge, table, x: -1, y: -1, sell: null, buy: null };
}

export function sellPrice(post, good) {
  const e = post.table[good];
  return Math.max(1, Math.round(e.baseSell * e.sellMult));
}
export function buyPrice(post, good) {
  const e = post.table[good];
  return Math.max(1, Math.round(e.baseBuy * e.buyMult));
}

/**
 * Sell up to `qty` of `good` from a team's stock at the post's 換金所.
 * Lowers the sell price (oversupply). Returns { sold, gained }.
 */
export function doSell(team, post, good, qty) {
  const have = team.stock[good] || 0;
  const sold = Math.max(0, Math.min(qty, have));
  if (sold === 0) return { sold: 0, gained: 0 };
  const unit = sellPrice(post, good);
  const gained = unit * sold;
  team.stock[good] = have - sold;
  team.stock.currency += gained;
  const e = post.table[good];
  e.sellMult = Math.max(PRICE_SELL_FLOOR, e.sellMult - PRICE_SELL_STEP * sold);
  return { sold, gained };
}

/**
 * Buy up to `qty` of `good` at the post's 購買所, limited by the team's
 * currency. Raises the buy price (scarcity). Returns { bought, spent }.
 */
export function doBuy(team, post, good, qty) {
  const unit = buyPrice(post, good);
  const affordable = Math.floor((team.stock.currency || 0) / unit);
  const bought = Math.max(0, Math.min(qty, affordable));
  if (bought === 0) return { bought: 0, spent: 0 };
  const spent = unit * bought;
  team.stock.currency -= spent;
  team.stock[good] = (team.stock[good] || 0) + bought;
  const e = post.table[good];
  e.buyMult = Math.min(PRICE_BUY_CEIL, e.buyMult + PRICE_BUY_STEP * bought);
  return { bought, spent };
}

// --- physical-haul helpers (operate on a carried load, not a treasury) ----

/**
 * Apply a sale of `qty` units of `good` at the post: returns the currency
 * gained and pushes the sell price down (oversupply). The caller credits the
 * team's currency and has already removed the goods from the load.
 */
export function sellUnits(post, good, qty) {
  if (qty <= 0) return 0;
  const gained = sellPrice(post, good) * qty;
  const e = post.table[good];
  e.sellMult = Math.max(PRICE_SELL_FLOOR, e.sellMult - PRICE_SELL_STEP * qty);
  return gained;
}

/**
 * Apply a purchase of `qty` units of `good` at the post: returns the currency
 * spent and pushes the buy price up (scarcity). The caller has already
 * checked affordability and will add the goods to the load.
 */
export function buyUnits(post, good, qty) {
  if (qty <= 0) return 0;
  const spent = buyPrice(post, good) * qty;
  const e = post.table[good];
  e.buyMult = Math.min(PRICE_BUY_CEIL, e.buyMult + PRICE_BUY_STEP * qty);
  return spent;
}

/** Recover a post's prices toward their base over time (demand returns). */
export function tickTradePost(post, dt) {
  const k = Math.min(1, PRICE_RECOVER * dt);
  for (const good of TRADE_GOODS) {
    const e = post.table[good];
    e.sellMult += (1 - e.sellMult) * k;
    e.buyMult += (1 - e.buyMult) * k;
  }
}
