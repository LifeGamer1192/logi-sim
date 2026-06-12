// Tradeable goods catalogue. Wood and stone are the natural-resource staples;
// the remaining 18 are manufactured / exotic and obtained via trade posts.
//
// Each entry: { id, sell, buy, nameEn, nameJa }
//   sell  — base sell price at a trade post (units → currency)
//   buy   — base buy price at a trade post  (currency → units), always > sell
//
// TRADE_GOODS and TRADE_BASE are derived from GOODS so trade.js and config.js
// can import them without duplicating the data.

export const GOODS = [
  { id: 'wood',     sell:  2, buy:  3, nameEn: 'Wood',     nameJa: '木' },
  { id: 'stone',    sell:  4, buy:  6, nameEn: 'Stone',    nameJa: '石' },
  { id: 'plank',    sell:  5, buy:  8, nameEn: 'Plank',    nameJa: '板材' },
  { id: 'brick',    sell:  6, buy:  9, nameEn: 'Brick',    nameJa: 'レンガ' },
  { id: 'charcoal', sell:  7, buy: 10, nameEn: 'Charcoal', nameJa: '炭' },
  { id: 'iron',     sell: 10, buy: 15, nameEn: 'Iron',     nameJa: '鉄' },
  { id: 'copper',   sell:  8, buy: 12, nameEn: 'Copper',   nameJa: '銅' },
  { id: 'tin',      sell:  7, buy: 11, nameEn: 'Tin',      nameJa: 'スズ' },
  { id: 'bronze',   sell: 12, buy: 18, nameEn: 'Bronze',   nameJa: '青銅' },
  { id: 'coal',     sell:  9, buy: 14, nameEn: 'Coal',     nameJa: '石炭' },
  { id: 'clay',     sell:  3, buy:  5, nameEn: 'Clay',     nameJa: '粘土' },
  { id: 'sand',     sell:  2, buy:  4, nameEn: 'Sand',     nameJa: '砂' },
  { id: 'glass',    sell:  8, buy: 12, nameEn: 'Glass',    nameJa: 'ガラス' },
  { id: 'rope',     sell:  4, buy:  7, nameEn: 'Rope',     nameJa: 'ロープ' },
  { id: 'cloth',    sell:  6, buy: 10, nameEn: 'Cloth',    nameJa: '布' },
  { id: 'leather',  sell:  7, buy: 11, nameEn: 'Leather',  nameJa: '革' },
  { id: 'grain',    sell:  3, buy:  5, nameEn: 'Grain',    nameJa: '穀物' },
  { id: 'flour',    sell:  5, buy:  8, nameEn: 'Flour',    nameJa: '小麦粉' },
  { id: 'tool',     sell: 14, buy: 20, nameEn: 'Tool',     nameJa: '道具' },
  { id: 'gear',     sell: 16, buy: 24, nameEn: 'Gear',     nameJa: '歯車' },
];

export const GOODS_MAP = Object.fromEntries(GOODS.map(g => [g.id, g]));

/** All tradeable good ids in catalogue order. */
export const TRADE_GOODS = GOODS.map(g => g.id);

/** Base sell/buy prices keyed by good id (compatible with config.js callers). */
export const TRADE_BASE = Object.fromEntries(
  GOODS.map(g => [g.id, { sell: g.sell, buy: g.buy }]),
);
