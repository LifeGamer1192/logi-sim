// Roads: paving a tile speeds up anyone walking over it.
//
//   wood  road — costs 1 wood,  ×2 walking speed
//   stone road — costs 1 stone, ×3 walking speed
//
// Roads are shared infrastructure: the speed bonus applies to any worker on
// the tile, regardless of which team paid to lay it.

import { ROAD_WOOD_MULT, ROAD_STONE_MULT } from './config.js';

export const ROAD_KINDS = ['wood', 'stone'];

/** Walking-speed multiplier for a tile's road ('wood' | 'stone' | null). */
export function roadSpeedMultiplier(road) {
  if (road === 'stone') return ROAD_STONE_MULT;
  if (road === 'wood') return ROAD_WOOD_MULT;
  return 1;
}

/** Which material a road of `kind` is built from. */
export function roadCostGood(kind) {
  return kind === 'stone' ? 'stone' : 'wood';
}
