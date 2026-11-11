// Test helper: a simple driver that follows the track's centre line, to prove a track can be finished.
import { PIECES, worldPoint } from '../../game/pieces.js';
import { createPhysics } from '../../game/physics.js';
import { layoutTrack } from '../../game/track.js';
import { createRace, updateRace, needsRespawn } from '../../game/race.js';

// Comfortable speeds (m/s) per piece type: ~80% of the measured clean limit for each turn radius.
const LIMIT = { turn: 125 / 3.6, 'turn-m': 205 / 3.6, 'turn-l': 310 / 3.6, slope: 250 / 3.6 };
const STEP_M = 4;

// run-up cells a jump needs after a standing start (physics.test.js proves it; tracks.test.js enforces it)
export const JUMP_RUNUP = 4;

// Centre line in driving order: [{ p: [x, y, z], limit, piece }]
export function centreLine(track) {
  const line = [];
  let prev = null;
  track.pieces.forEach((piece, index) => {
    const def = PIECES[piece.type];
    const a = worldPoint(piece, [def.ends[0][0], 0, def.ends[0][1]]), b = worldPoint(piece, [def.ends[1][0], 0, def.ends[1][1]]);
    const length = def.radius ? (Math.PI / 2) * def.radius : Math.hypot(b[0] - a[0], b[2] - a[2]);
    const n = Math.max(2, Math.ceil(length / STEP_M));
    const backward = prev && Math.hypot(b[0] - prev[0], b[2] - prev[2]) < Math.hypot(a[0] - prev[0], a[2] - prev[2]);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, s = def.at(backward ? 1 - t : t);
      line.push({ p: worldPoint(piece, [s.x, s.y, s.z]), limit: LIMIT[piece.type] ?? Infinity, piece: index });
    }
    prev = backward ? a : b;
  });
  return line;
}

// Drives the track. Returns { finished, seconds, maxKmh, reason }.
export function drive(RAPIER, track, maxSeconds = 600) {
  const layout = layoutTrack(track), line = centreLine(track), phys = createPhysics(RAPIER, layout), race = createRace(layout);
  phys.car.teleport(layout.start);
  let at = 0, maxV = 0;
  const done = (finished, i, reason) => { phys.free(); return { finished, seconds: i / 60, maxKmh: maxV * 3.6, reason }; };
  for (let i = 0; i < maxSeconds * 60; i++) {
    const { pos, quat: [x, y, z, w] } = phys.car.pose(), v = phys.car.speed();
    maxV = Math.max(maxV, v);
    for (let k = at; k < Math.min(line.length, at + 60); k++) { // nearest point, never going backward
      if (Math.hypot(line[k].p[0] - pos[0], line[k].p[2] - pos[2]) < Math.hypot(line[at].p[0] - pos[0], line[at].p[2] - pos[2])) at = k;
    }
    const target = line[Math.min(line.length - 1, at + Math.ceil(Math.max(8, v * 0.3) / STEP_M))].p;
    let turn = Math.atan2(target[0] - pos[0], target[2] - pos[2]) - Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y));
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    let allowed = Infinity; // slow down in time for anything ahead (planning on gentle 30 m/s² braking)
    for (let k = at, dist = 0; k < line.length && dist < 700; k++, dist += STEP_M) allowed = Math.min(allowed, Math.sqrt(line[k].limit ** 2 + 60 * dist));
    phys.car.setControls({ throttle: v < allowed ? 1 : 0, brake: v > allowed + 3 ? 1 : 0, steer: Math.max(-1, Math.min(1, turn * 4)) });
    phys.step();
    const now = phys.car.pose().pos;
    if (updateRace(race, layout, now, i * 1000 / 60) === 'finish') return done(true, i);
    if (needsRespawn(layout, now)) return done(false, i, `fell off near piece ${line[at].piece} (${track.pieces[line[at].piece].type}) at ${(v * 3.6).toFixed(0)} km/h, checkpoint ${race.next}`);
  }
  return done(false, maxSeconds * 60, `timed out near piece ${line[at].piece}`);
}
