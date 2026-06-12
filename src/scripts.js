// Auto-scripts — per-team strategies that queue physical trade orders.
// A team worker hauls the goods to/from the post.
//
//   hasty (拙速)    — 余剰品を即売り、石を補充。
//   longterm (長期) — 相場が回復してから売る。石も安い時のみ買う。

import { SCRIPT_INTERVAL, CART_AUTO_COUNT } from './config.js';
import { sellPrice, buyPrice } from './trade.js';
import { CROP_IDS } from './crops.js';
import { VEHICLE_IDS } from './transport.js';

export const SCRIPTS = {
  hasty:    { id: 'hasty',    label: '拙速', keepWood: 50, sellBatch: 15, minStone: 8 },
  longterm: { id: 'longterm', label: '長期', keepWood: 150, sellBatch: 10, minStone: 16 },
};

// 売却優先順位：高価値品から順に余剰分を売る
const SELL_PRIORITY = [
  'gear', 'tool', 'bronze', 'cotton', 'iron', 'rice', 'copper', 'tin', 'glass', 'brick',
  'plank', 'charcoal', 'wheat', 'potato', 'cloth', 'leather', 'rope', 'flour',
  'coal', 'turnip', 'grain', 'clay', 'sand', 'stone', 'wood',
];

// 加工の投入素材として最低限キープする量（農作物は5粒をキープして植え付け用に確保）
const KEEP_MIN = {
  charcoal: 3,  // 精錬所の燃料バッファ
  iron:     2,  // 鍛冶場の投入バッファ
  plank:    2,  // 鍛冶場の投入バッファ
  copper:   2,  // 合金炉バッファ
  tin:      2,  // 合金炉バッファ
  bronze:   2,  // 精密工房バッファ
  grain:    5,  // 複数加工所への共通投入素材
  wheat:    5,  // 植え付け用確保
  potato:   5,
  cotton:   5,
  turnip:   5,
  rice:     5,
};

/** good を売る際に手元にキープする最低量 */
function keepOf(cfg, good) {
  if (good === 'wood')  return cfg.keepWood;
  if (good === 'stone') return cfg.minStone;
  return KEEP_MIN[good] ?? 0;
}

function nearestPostIndex(team, posts) {
  let best = -1; let bestD = Infinity;
  for (let i = 0; i < posts.length; i++) {
    const d = Math.abs(posts[i].x - team.depot.x) + Math.abs(posts[i].y - team.depot.y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function bestSellIndex(posts, good) {
  let best = -1; let bestP = -Infinity;
  for (let i = 0; i < posts.length; i++) {
    if (!posts[i].table[good]) continue;
    const p = sellPrice(posts[i], good);
    if (p > bestP) { bestP = p; best = i; }
  }
  return best;
}

function cheapestBuyIndex(posts, good) {
  let best = -1; let bestP = Infinity;
  for (let i = 0; i < posts.length; i++) {
    if (!posts[i].table[good]) continue;
    const p = buyPrice(posts[i], good);
    if (p < bestP) { bestP = p; best = i; }
  }
  return best;
}

function order(team, kind, good, postIndex, qty) {
  if (postIndex < 0 || qty <= 0) return;
  team.tradeQueue.push({ kind, good, postIndex, qty });
}

// 拙速：余剰品を高価値から即売り → 石を補充
function actHasty(team, posts, cfg) {
  const pi = nearestPostIndex(team, posts);
  if (pi < 0) return;
  const post = posts[pi];
  for (const good of SELL_PRIORITY) {
    const keep = keepOf(cfg, good);
    const surplus = (team.stock[good] || 0) - keep;
    if (surplus <= 0) continue;
    const entry = post.table[good];
    if (!entry) continue; // 交易不可（ironOre 等）
    if (sellPrice(post, good) >= entry.baseSell * 0.45) {
      order(team, 'sell', good, pi, Math.min(surplus, cfg.sellBatch));
      return;
    }
  }
  if ((team.stock.stone || 0) < cfg.minStone) {
    order(team, 'buy', 'stone', pi, cfg.minStone - (team.stock.stone || 0));
  }
}

// 長期：相場が回復してから売る。石も安い時のみ買う。
function actLongterm(team, posts, cfg) {
  for (const good of SELL_PRIORITY) {
    const keep = keepOf(cfg, good);
    const surplus = (team.stock[good] || 0) - keep;
    if (surplus <= 0) continue;
    const pi = bestSellIndex(posts, good);
    if (pi < 0) continue;
    const entry = posts[pi].table[good];
    if (!entry) continue;
    if (sellPrice(posts[pi], good) >= entry.baseSell * 0.9) {
      order(team, 'sell', good, pi, Math.min(surplus, cfg.sellBatch));
      return;
    }
  }
  if ((team.stock.stone || 0) < cfg.minStone) {
    const pi = cheapestBuyIndex(posts, 'stone');
    if (pi >= 0 && buyPrice(posts[pi], 'stone') <= posts[pi].table.stone.baseBuy) {
      order(team, 'buy', 'stone', pi, cfg.minStone - (team.stock.stone || 0));
    }
  }
}

// 手押し車が不足していたら交易所から購入する。
function actBuyVehicles(team, posts) {
  for (const kind of VEHICLE_IDS) {
    if ((team.stock[kind] || 0) >= CART_AUTO_COUNT) continue;
    const pi = cheapestBuyIndex(posts, kind);
    if (pi < 0) continue;
    const need = CART_AUTO_COUNT - (team.stock[kind] || 0);
    const cost = buyPrice(posts[pi], kind) * need;
    if ((team.stock.currency || 0) < cost + 300) continue; // 300通貨の余裕を残す
    order(team, 'buy', kind, pi, need);
    return true;
  }
  return false;
}

// 農作物の種（= 農作物）が不足していたら交易所から購入する。
// 注文を 1 件キューしたら true を返す（runScript はそこで終了）。
function actBuyCrops(team, posts) {
  for (const kind of CROP_IDS) {
    if ((team.stock[kind] || 0) >= 5) continue;
    const pi = cheapestBuyIndex(posts, kind);
    if (pi < 0) continue;
    const need = 5 - (team.stock[kind] || 0);
    const cost = buyPrice(posts[pi], kind) * need;
    if ((team.stock.currency || 0) < cost + 200) continue; // 200通貨の余裕を残す
    order(team, 'buy', kind, pi, need);
    return true;
  }
  return false;
}

/**
 * 実行中チームのスクリプトを進める。
 * 一度に 1 つの注文のみキュー（配送員が前の注文を終えるまで待つ）。
 */
export function runScript(team, posts, dt) {
  if (!team.scriptRunning) return;
  team._scriptTimer += dt;
  if (team._scriptTimer < SCRIPT_INTERVAL) return;
  team._scriptTimer = 0;
  const trader = team.workers[0];
  if (team.tradeQueue.length || (trader && trader.job === 'trade')) return;
  const cfg = SCRIPTS[team.scriptId] || SCRIPTS.hasty;
  // 手押し車が不足していたら優先購入
  if (actBuyVehicles(team, posts)) return;
  // 農作物の種が不足していたら優先購入
  if (actBuyCrops(team, posts)) return;
  if (team.scriptId === 'longterm') actLongterm(team, posts, cfg);
  else actHasty(team, posts, cfg);
}
