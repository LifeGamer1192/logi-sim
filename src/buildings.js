// Built facilities: warehouse (storage), extraction buildings (harvest from
// nearby features), and processing buildings (convert goods from team.stock).
//
//   warehouse   — accepts any good; cap WAREHOUSE_CAP.
//   extraction  — each kind accepts one good from EXTRACTION_BUILDINGS spec.
//   processing  — auto-convert team.stock on a timer; no physical storage.

import { WAREHOUSE_CAP, LOGGING_CAP } from './config.js';

/** All goods IDs that may be physically stored in buildings. */
export const ALL_GOODS_IDS = [
  'wood', 'stone', 'plank', 'brick', 'charcoal', 'iron', 'copper', 'tin',
  'bronze', 'coal', 'clay', 'sand', 'glass', 'rope', 'cloth', 'leather',
  'grain', 'flour', 'tool', 'gear', 'ironOre', 'copperOre', 'tinOre',
  'wheat', 'potato', 'cotton', 'turnip', 'rice',
  'thread', 'cottonCloth', 'canvas', 'wheelbarrow',
];

const ALL_GOODS_SET = new Set(ALL_GOODS_IDS);

/** Extraction building kind → { featureKind, good }. */
export const EXTRACTION_BUILDINGS = {
  loggingCamp:  { featureKind: 'forest',     good: 'wood' },
  stoneCutter:  { featureKind: 'stonehill',  good: 'stone' },
  clayMine:     { featureKind: 'clayPit',    good: 'clay' },
  sandMine:     { featureKind: 'sandBar',    good: 'sand' },
  coalMine:     { featureKind: 'coalVein',   good: 'coal' },
  farm:         { featureKind: 'cropField',  good: 'grain' },
  ironMine:     { featureKind: 'ironVein',   good: 'ironOre' },
  copperMine:   { featureKind: 'copperVein', good: 'copperOre' },
  tinMine:      { featureKind: 'tinVein',    good: 'tinOre' },
  ranch:        { featureKind: 'pasture',    good: 'leather' },
};

/**
 * Processing building recipes. Each recipe fires once per PROC_INTERVAL,
 * consuming inputs from and depositing the output into the team treasury.
 */
export const PROC_RECIPES = {
  sawmill:           [{ inputs: [['wood', 2]],                     output: 'plank' }],
  charcoalKiln:      [{ inputs: [['wood', 3]],                     output: 'charcoal' }],
  kiln:              [
    { inputs: [['clay', 2]],                                       output: 'brick' },
    { inputs: [['sand', 3]],                                       output: 'glass' },
  ],
  smelter:           [
    { inputs: [['ironOre', 1], ['charcoal', 1]],                   output: 'iron' },
    { inputs: [['copperOre', 1], ['charcoal', 1]],                 output: 'copper' },
    { inputs: [['tinOre', 1], ['charcoal', 1]],                    output: 'tin' },
  ],
  alloyForge:        [{ inputs: [['copper', 1], ['tin', 1]],       output: 'bronze' }],
  ropeMaker:         [{ inputs: [['grain', 2]],                    output: 'rope' }],
  windmill:          [{ inputs: [['grain', 2]],                    output: 'flour' }],
  weavery: [
    { inputs: [['grain', 3]],                                      output: 'cloth' },
    { inputs: [['thread', 2]],                                     output: 'cottonCloth' },
    { inputs: [['cottonCloth', 2]],                                output: 'canvas' },
  ],
  smithy:            [{ inputs: [['iron', 2], ['plank', 1]],       output: 'tool' }],
  precisionWorkshop: [{ inputs: [['bronze', 2], ['tool', 1]],      output: 'gear' }],
  spinningMill:      [{ inputs: [['cotton', 1]],                   output: 'thread' }],
};

export const BUILDING_KINDS = [
  'warehouse',
  ...Object.keys(EXTRACTION_BUILDINGS),
  ...Object.keys(PROC_RECIPES),
];

export function capFor(kind) {
  if (kind === 'warehouse') return WAREHOUSE_CAP;
  if (EXTRACTION_BUILDINGS[kind]) return LOGGING_CAP;
  return 0;
}

/** Which item types a building accepts via physical deposit. */
export function accepts(building, itemType) {
  const spec = EXTRACTION_BUILDINGS[building.kind];
  if (spec) return itemType === spec.good;
  if (building.kind === 'warehouse') return ALL_GOODS_SET.has(itemType);
  return false;
}

export function createBuilding(kind, teamId, init = {}) {
  const b = { kind, teamId, cap: capFor(kind) };
  const spec = EXTRACTION_BUILDINGS[kind];
  if (spec) {
    b[spec.good] = init[spec.good] || 0;
  } else if (kind === 'warehouse') {
    b.wood = init.wood || 0;
    b.stone = init.stone || 0;
  }
  return b;
}

export function total(building) {
  let t = 0;
  for (const g of ALL_GOODS_IDS) t += building[g] || 0;
  return t;
}

export function isFull(building) {
  return total(building) >= building.cap;
}

/**
 * Put one unit of `itemType` into a building. Returns true on success, false
 * if the building won't take that type or is full.
 */
export function deposit(building, itemType) {
  if (!accepts(building, itemType)) return false;
  if (isFull(building)) return false;
  building[itemType] = (building[itemType] || 0) + 1;
  return true;
}

/** Remove one unit of `itemType` from a building. Returns true on success. */
export function take(building, itemType) {
  if ((building[itemType] || 0) <= 0) return false;
  building[itemType] -= 1;
  return true;
}

/** Sum a team's stored wood + stone across a list of its buildings. */
export function teamStock(buildings) {
  let wood = 0;
  let stone = 0;
  for (const b of buildings) { wood += b.wood || 0; stone += b.stone || 0; }
  return { wood, stone };
}

/**
 * Remove one unit of `itemType` from whichever of the team's buildings holds
 * it (warehouses first, then the matching camp). Returns true on success.
 */
export function takeFromTeam(buildings, itemType) {
  const ordered = [...buildings].sort((a, b) =>
    (a.kind === 'warehouse' ? 0 : 1) - (b.kind === 'warehouse' ? 0 : 1));
  for (const b of ordered) {
    if ((b[itemType] || 0) > 0) { b[itemType] -= 1; return true; }
  }
  return false;
}
