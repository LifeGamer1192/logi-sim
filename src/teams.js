// Logistics teams. 1–8 teams compete on the same map; each owns a depot
// tile and fields several workers. Teams are colour-coded for rendering.

import {
  TEAM_COLORS, MAX_TEAMS, INIT_CURRENCY, INIT_WOOD, INIT_STONE,
} from './config.js';

/** Letter label for a team (0 → "A", 1 → "B", ...). */
export function teamLetter(id) {
  return String.fromCharCode(65 + id);
}

// The two auto-script strategies a team can run.
export const SCRIPT_IDS = ['hasty', 'longterm'];

/**
 * Build a team record. `depot` is the tile workers haul items back to.
 * `stock` is the team treasury (currency + bulk materials). `scriptId` is the
 * auto-strategy and `scriptRunning` whether it is currently acting.
 */
export function createTeam(id, depot, scriptId = 'hasty') {
  return {
    id,
    color: TEAM_COLORS[id % TEAM_COLORS.length],
    letter: teamLetter(id),
    depot: { x: depot.x, y: depot.y },
    workers: [],
    buildings: [],
    stock: { currency: INIT_CURRENCY, wood: INIT_WOOD, stone: INIT_STONE },
    scriptId: SCRIPT_IDS.includes(scriptId) ? scriptId : 'hasty',
    scriptRunning: true,
    _scriptTimer: 0,
    // Pending physical trade orders { kind, good, postIndex, qty }. Manual
    // orders go to the front; the team's trader worker fulfils them in order.
    tradeQueue: [],
  };
}

/** The default per-team script for a given team count (A/B hasty, C long). */
export function defaultScriptFor(teamIndex) {
  return teamIndex === 2 ? 'longterm' : 'hasty';
}

/** Clamp a requested team count into the supported 1..MAX_TEAMS range. */
export function clampTeamCount(n) {
  return Math.max(1, Math.min(MAX_TEAMS, Math.round(n) || 1));
}
