const FALL_MARGIN = 10;
const SIDE_MARGIN = 20;

const inside = (box, [x, y, z]) =>
  x >= box.min[0] && x <= box.max[0] && y >= box.min[1] && y <= box.max[1] && z >= box.min[2] && z <= box.max[2];

export function createRace(layout) {
  return { next: 0, respawn: layout.start, finishedAt: null };
}

// Mutates race. Returns 'checkpoint', 'finish' or null.
export function updateRace(race, layout, carPos, tMs) {
  if (race.finishedAt !== null) return null;
  const cp = layout.checkpoints[race.next];
  if (cp && inside(cp, carPos)) {
    race.next++;
    race.respawn = cp.pose;
    return 'checkpoint';
  }
  if (!cp && inside(layout.finish, carPos)) {
    race.finishedAt = tMs;
    return 'finish';
  }
  return null;
}

export function needsRespawn(layout, [x, y, z]) {
  const { min, max } = layout.bounds;
  return y < layout.minY - FALL_MARGIN
    || x < min[0] - SIDE_MARGIN || x > max[0] + SIDE_MARGIN
    || z < min[2] - SIDE_MARGIN || z > max[2] + SIDE_MARGIN;
}
