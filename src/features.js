// Natural resources that sit on the map: forests (yield wood) and stone
// hills (yield stone).
//
// Each feature holds a `stock` (0..RESOURCE_MAX). Harvesting takes one point;
// the look shrinks as the stock drops and bottoms out at a sapling (forest)
// or a pebble (stone hill) when stock is 0. Stock regrows over time back to
// the max — a depleted forest is never gone, just small.

import { RESOURCE_MAX, REGEN_INTERVAL } from './config.js';

/** The good a feature yields. */
export const FEATURE_YIELD = {
  forest:     'wood',
  stonehill:  'stone',
  clayPit:    'clay',
  sandBar:    'sand',
  coalVein:   'coal',
  cropField:  'grain',
  ironVein:   'ironOre',
  copperVein: 'copperOre',
  tinVein:    'tinOre',
  pasture:    'leather',
};

function createFeature(kind) {
  return { kind, stock: RESOURCE_MAX, max: RESOURCE_MAX, regen: 0 };
}

export function createForest()      { return createFeature('forest'); }
export function createStoneHill()   { return createFeature('stonehill'); }
export function createClayPit()     { return createFeature('clayPit'); }
export function createSandBar()     { return createFeature('sandBar'); }
export function createCoalVein()    { return createFeature('coalVein'); }
export function createCropField()   { return createFeature('cropField'); }
export function createIronVein()    { return createFeature('ironVein'); }
export function createCopperVein()  { return createFeature('copperVein'); }
export function createTinVein()     { return createFeature('tinVein'); }
export function createPasture()     { return createFeature('pasture'); }

/** True if there is anything left to take right now. */
export function canHarvest(feature) {
  return feature != null && feature.stock > 0;
}

/**
 * Take one unit from a feature. Returns the yielded item type ('wood' /
 * 'stone') or null if it was empty. Resets the regrow timer so a freshly
 * harvested feature waits a full interval before its next regrow tick.
 */
export function harvestFeature(feature) {
  if (!canHarvest(feature)) return null;
  feature.stock -= 1;
  feature.regen = 0;
  return FEATURE_YIELD[feature.kind] || null;
}

/** Advance a feature's regrow timer by `dt` seconds, restoring stock. */
export function regenFeature(feature, dt) {
  if (feature.stock >= feature.max) return;
  feature.regen += dt;
  while (feature.regen >= REGEN_INTERVAL && feature.stock < feature.max) {
    feature.regen -= REGEN_INTERVAL;
    feature.stock += 1;
  }
}

/**
 * Visual stage 0..RESOURCE_MAX for the renderer. 0 = sapling / pebble; higher
 * = a fuller tree / bigger rock. Simply the current stock.
 */
export function featureStage(feature) {
  return Math.max(0, Math.min(RESOURCE_MAX, feature.stock));
}
