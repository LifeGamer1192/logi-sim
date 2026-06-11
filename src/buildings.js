// Built facilities: warehouse, logging camp, stone cutter.
//
//   warehouse   — stores wood + stone (mixed), cap WAREHOUSE_CAP.
//   loggingCamp — stores wood only,           cap LOGGING_CAP.
//   stoneCutter — stores stone only,          cap QUARRY_CAP.
//
// Every building costs BUILD_COST (wood 1 + stone 1) to put up, drawn from
// the founding team's existing stock (see takeFromTeam).

import { WAREHOUSE_CAP, LOGGING_CAP, QUARRY_CAP } from './config.js';

export const BUILDING_KINDS = ['warehouse', 'loggingCamp', 'stoneCutter'];

export function capFor(kind) {
  if (kind === 'warehouse') return WAREHOUSE_CAP;
  if (kind === 'loggingCamp') return LOGGING_CAP;
  if (kind === 'stoneCutter') return QUARRY_CAP;
  return 0;
}

/** Which item types a building will store. */
export function accepts(building, itemType) {
  if (building.kind === 'warehouse') return itemType === 'wood' || itemType === 'stone';
  if (building.kind === 'loggingCamp') return itemType === 'wood';
  if (building.kind === 'stoneCutter') return itemType === 'stone';
  return false;
}

export function createBuilding(kind, teamId, init = {}) {
  return {
    kind,
    teamId,
    wood: init.wood || 0,
    stone: init.stone || 0,
    cap: capFor(kind),
  };
}

export function total(building) {
  return building.wood + building.stone;
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
  building[itemType] += 1;
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
  for (const b of buildings) { wood += b.wood; stone += b.stone; }
  return { wood, stone };
}

/**
 * Remove one unit of `itemType` from whichever of the team's buildings holds
 * it (warehouses first, then the matching camp). Returns true on success.
 */
export function takeFromTeam(buildings, itemType) {
  // Prefer warehouses so camps stay free to keep harvesting.
  const ordered = [...buildings].sort((a, b) =>
    (a.kind === 'warehouse' ? 0 : 1) - (b.kind === 'warehouse' ? 0 : 1));
  for (const b of ordered) {
    if ((b[itemType] || 0) > 0) { b[itemType] -= 1; return true; }
  }
  return false;
}
