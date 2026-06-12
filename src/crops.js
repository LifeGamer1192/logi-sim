// Crop definitions and growth-rate calculations.
// Seeds and produce are the same item (simplified model):
//   planting 1 unit on a suitable land tile → grows → harvests N units.
//
// Five crops, each with distinct optimal conditions:
//   wheat   — temperate spring/summer, moderate conditions, fast
//   potato  — cool & moist, spring/autumn, medium speed, high yield
//   cotton  — hot & dry & sunny, summer only, slow, high value
//   turnip  — cold-tolerant, all seasons, fastest, low value
//   rice    — hot & very wet & needs water nearby, summer, slowest, highest yield

export const CROP_DEFS = {
  wheat: {
    tempRange:    [10, 28],
    fertilityMin: 0.35,
    moistureMin:  0.28,
    sunMin:       0.45,
    waterNear:    false,
    seasons:      ['spring', 'summer'],
    growTime:     60,       // sim-sec at perfect conditions (rate=2)
    baseYield:    3,        // max harvest units at perfect quality
    color:        '#d4b030',
  },
  potato: {
    tempRange:    [5, 20],
    fertilityMin: 0.50,
    moistureMin:  0.52,
    sunMin:       0.22,
    waterNear:    false,
    seasons:      ['spring', 'autumn'],
    growTime:     75,
    baseYield:    3,
    color:        '#a06428',
  },
  cotton: {
    tempRange:    [22, 42],
    fertilityMin: 0.28,
    moistureMin:  0.12,
    sunMin:       0.68,
    waterNear:    false,
    seasons:      ['summer'],
    growTime:     90,
    baseYield:    2,
    color:        '#d8d8c8',
  },
  turnip: {
    tempRange:    [2, 16],
    fertilityMin: 0.28,
    moistureMin:  0.38,
    sunMin:       0.20,
    waterNear:    false,
    seasons:      ['spring', 'summer', 'autumn', 'winter'],
    growTime:     42,
    baseYield:    2,
    color:        '#8030a0',
  },
  rice: {
    tempRange:    [20, 38],
    fertilityMin: 0.58,
    moistureMin:  0.65,
    sunMin:       0.55,
    waterNear:    true,   // requires water tile within CROP_WATER_RANGE tiles
    seasons:      ['summer'],
    growTime:     100,
    baseYield:    4,
    color:        '#50a828',
  },
};

export const CROP_IDS = Object.keys(CROP_DEFS);

/**
 * Growth-rate multiplier (0..2) for a crop at current conditions.
 * 0 = dormant (hard requirement unmet), 1 = normal, 2 = perfect.
 */
export function cropGrowthRate(kind, temperature, tile, season, hasWater) {
  const def = CROP_DEFS[kind];
  if (!def) return 0;

  // Hard cutoffs
  if (temperature < def.tempRange[0] - 5 || temperature > def.tempRange[1] + 5) return 0;
  if ((tile.fertility || 0) < def.fertilityMin * 0.5) return 0;
  if ((tile.moisture  || 0) < def.moistureMin  * 0.5) return 0;
  if (def.waterNear && !hasWater) return 0;

  const tempMid  = (def.tempRange[0] + def.tempRange[1]) / 2;
  const tempHalf = (def.tempRange[1] - def.tempRange[0]) / 2 + 3;
  const tempScore   = Math.max(0, 1 - Math.abs(temperature - tempMid) / tempHalf);
  const fertScore   = Math.min(1, (tile.fertility || 0) / (def.fertilityMin + 0.15));
  const moistScore  = Math.min(1, (tile.moisture  || 0) / (def.moistureMin  + 0.15));
  const sunScore    = Math.min(1, (tile.sunlight   || 0.5) / (def.sunMin + 0.20));
  const seasonScore = def.seasons.includes(season) ? 1.0 : 0.25;

  return ((tempScore + fertScore + moistScore + sunScore + seasonScore) / 5) * 2;
}

/** 0..1 suitability score for a tile (for auto-script tile picking). */
export function tileCropScore(kind, temperature, tile, season, hasWater) {
  return cropGrowthRate(kind, temperature, tile, season, hasWater) / 2;
}

/** Harvest yield from a ripe crop (growth >= 1). */
export function cropHarvestYield(crop) {
  const def = CROP_DEFS[crop.kind];
  if (!def) return 1;
  const avgRate = crop.growTime > 0 ? crop.qualityAcc / crop.growTime : 0;
  const quality = Math.min(1, avgRate / 2);
  return Math.max(1, Math.round(1 + quality * (def.baseYield - 1)));
}
