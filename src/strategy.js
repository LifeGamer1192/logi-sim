// Auto-build strategy: processing building prerequisites.
// Pure functions — no DOM dependency, fully testable.

function hasKind(team, kind) {
  return team.buildings.some(b => b.kind === kind);
}
function hasAny(team, kinds) {
  return kinds.some(k => hasKind(team, k));
}

/**
 * Processing building prerequisites.
 * Returns true when a team is ready to build that kind of processor.
 * All listed upstream buildings must already exist on the team.
 */
export const PROC_BUILD_PREREQS = {
  sawmill:           () => true,               // wood は常に入手可
  charcoalKiln:      () => true,               // 同上
  kiln:              (t) => hasAny(t, ['clayMine', 'sandMine']),
  smelter:           (t) => hasKind(t, 'charcoalKiln') &&
                            hasAny(t, ['ironMine', 'copperMine', 'tinMine']),
  alloyForge:        (t) => hasKind(t, 'smelter') &&
                            hasKind(t, 'copperMine') && hasKind(t, 'tinMine'),
  ropeMaker:         (t) => hasKind(t, 'farm'),
  windmill:          (t) => hasKind(t, 'farm'),
  weavery:           (t) => hasKind(t, 'farm'),
  smithy:            (t) => hasKind(t, 'smelter') && hasKind(t, 'sawmill'),
  precisionWorkshop: (t) => hasKind(t, 'alloyForge') && hasKind(t, 'smithy'),
  spinningMill:      () => true,                // cotton is buyable anytime
};
