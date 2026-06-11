// Logistics teams. 1–8 teams compete on the same map; each owns a depot
// tile and fields several workers. Teams are colour-coded for rendering.

import { TEAM_COLORS, MAX_TEAMS } from './config.js';

/** Letter label for a team (0 → "A", 1 → "B", ...). */
export function teamLetter(id) {
  return String.fromCharCode(65 + id);
}

/**
 * Build a team record. `depot` is the tile workers haul items back to.
 * Resources stay simple for now — the depot is just a drop-off point.
 */
export function createTeam(id, depot) {
  return {
    id,
    color: TEAM_COLORS[id % TEAM_COLORS.length],
    letter: teamLetter(id),
    depot: { x: depot.x, y: depot.y },
    workers: [],
  };
}

/** Clamp a requested team count into the supported 1..MAX_TEAMS range. */
export function clampTeamCount(n) {
  return Math.max(1, Math.min(MAX_TEAMS, Math.round(n) || 1));
}
