// Vehicle definitions and cargo helpers.
// All transport-unit types live here so future upgrades (cart, wagon, …) only
// require a new VEHICLE_DEFS entry and possibly a new FSM phase.

export const VEHICLE_DEFS = {
  wheelbarrow: {
    slots:       5,    // max total item units
    speedFactor: 1.0,  // relative to WORKER_SPEED (human-powered → same speed)
    sell:        20,
    buy:         30,
  },
  // future example:
  // cart: { slots: 15, speedFactor: 1.5, sell: 60, buy: 90 },
};

export const VEHICLE_IDS = Object.keys(VEHICLE_DEFS);

/** Total units currently in a vehicle cargo array. */
export function vehicleCargoTotal(cargo) {
  return cargo.reduce((s, c) => s + c.qty, 0);
}

/**
 * Add `qty` units of `good` to cargo up to `slots` cap.
 * Returns the number of units actually added.
 */
export function vehicleAddCargo(cargo, good, qty, slots) {
  const free = slots - vehicleCargoTotal(cargo);
  const add = Math.max(0, Math.min(qty, free));
  if (add <= 0) return 0;
  const entry = cargo.find(c => c.good === good);
  if (entry) entry.qty += add;
  else cargo.push({ good, qty: add });
  return add;
}

/**
 * Remove up to `qty` units of `good` from cargo.
 * Returns the number of units actually removed.
 */
export function vehicleRemoveCargo(cargo, good, qty) {
  const entry = cargo.find(c => c.good === good);
  if (!entry) return 0;
  const removed = Math.min(entry.qty, qty);
  entry.qty -= removed;
  if (entry.qty === 0) cargo.splice(cargo.indexOf(entry), 1);
  return removed;
}
