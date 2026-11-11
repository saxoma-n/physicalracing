// Handling targets come from two reference gameplay clips (speedometer + timer readings).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createPhysics } from '../game/physics.js';
import { layoutTrack } from '../game/track.js';
import { CELL } from '../game/pieces.js';

let RAPIER;
before(async () => { RAPIER = (await import('../vendor/rapier.es.js')).default; await RAPIER.init(); });

const piece = (type, z, x = 0) => ({ type, x, y: 0, z, rot: 0 });
const straight = (n = 30) => layoutTrack({ name: 's', pieces: [
  piece('start', 0), ...Array.from({ length: n }, (_, i) => piece('straight', i + 1)), piece('finish', n + 1),
] });
const kmh = phys => phys.car.speed() * 3.6;
const GO = { throttle: 1, steer: 0, brake: 0 }, COAST = { throttle: 0, steer: 0, brake: 0 }, STOP = { throttle: 0, steer: 0, brake: 1 };
const angles = ([x, y, z, w]) => ({ // degrees
  yaw: Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y)) * 57.2958,
  pitch: Math.asin(Math.max(-1, Math.min(1, -2 * (y * z - w * x)))) * 57.2958,
  roll: Math.atan2(2 * (x * y + w * z), 1 - 2 * (x * x + z * z)) * 57.2958,
});

function start(layout) {
  const phys = createPhysics(RAPIER, layout);
  phys.car.teleport(layout.start);
  phys.car.setControls(COAST);
  for (let i = 0; i < 60; i++) phys.step(); // settle on the suspension
  return phys;
}
function run(phys, controls, seconds, each = () => {}) {
  phys.car.setControls(controls);
  for (let i = 0; i < Math.round(seconds * 60); i++) { phys.step(); each(i); }
}
function until(phys, controls, done, maxSeconds) {
  phys.car.setControls(controls);
  for (let i = 1; i <= maxSeconds * 60; i++) { phys.step(); if (done()) return i / 60; }
  return Infinity;
}

test('car settles on its wheels on a flat road', () => {
  const phys = start(straight());
  const y = phys.car.pose().pos[1];
  assert.ok(y > 0.2 && y < 2, `chassis height ${y}`);
  assert.ok(Math.abs(phys.car.speed()) < 0.5);
});

test('launch: 0 to 100 km/h in about 1.6 s, in a straight line (clip 1: ~1.6 s)', () => {
  const phys = start(straight());
  const t = until(phys, GO, () => kmh(phys) >= 100, 5);
  assert.ok(t > 1.3 && t < 1.9, `0-100 took ${t.toFixed(2)} s`);
  assert.ok(Math.abs(phys.car.pose().pos[0]) < 1, `drifted sideways ${phys.car.pose().pos[0]}`);
});

test('4.5 s of full throttle from rest reaches about 245 km/h (clip 2: 243)', () => {
  const phys = start(straight(12));
  run(phys, GO, 4.5);
  assert.ok(kmh(phys) > 230 && kmh(phys) < 262, `${kmh(phys).toFixed(0)} km/h`);
});

test('top speed is 677 km/h: reached on a long straight, never exceeded, still driving straight', () => {
  const phys = start(straight(330));
  let max = 0;
  run(phys, GO, 55, () => { max = Math.max(max, kmh(phys)); });
  assert.ok(max >= 676 && max <= 678.5, `max ${max.toFixed(1)} km/h`);
  const [x, y] = phys.car.pose().pos;
  assert.ok(Math.abs(x) < 4 && y > 0.2 && y < 2, `off line at top speed: x ${x.toFixed(1)}, y ${y.toFixed(2)}`);
});

test('coasting at ~172 km/h loses 3.5 to 6 m/s² to drag (clip 2: ~4 on the ground, 5-6 in the air)', () => {
  const phys = start(straight(20));
  until(phys, GO, () => kmh(phys) >= 172, 10);
  const v0 = phys.car.speed();
  run(phys, COAST, 0.5);
  const decel = (v0 - phys.car.speed()) / 0.5;
  assert.ok(decel > 3.5 && decel < 6, `${decel.toFixed(1)} m/s²`);
});

test('braking: 150 km/h to a stop in about 0.65 s without spinning or tipping (clip 2: 0.63 s)', () => {
  const phys = start(straight(20));
  until(phys, GO, () => kmh(phys) >= 150, 10);
  let maxPitch = 0;
  const t = until(phys, STOP, () => { maxPitch = Math.max(maxPitch, Math.abs(angles(phys.car.pose().quat).pitch)); return kmh(phys) < 3; }, 5);
  assert.ok(t > 0.45 && t < 0.9, `stop took ${t.toFixed(2)} s`);
  assert.ok(maxPitch < 8, `dive ${maxPitch.toFixed(1)}°`);
  assert.ok(Math.abs(angles(phys.car.pose().quat).yaw) < 10, 'spun while braking');
});

test('the body stays flat under full power: under 2.5° of squat (clips: none visible)', () => {
  const phys = start(straight());
  let squat = 0;
  run(phys, GO, 1.5, () => { squat = Math.max(squat, Math.abs(angles(phys.car.pose().quat).pitch)); });
  assert.ok(squat < 2.5, `${squat.toFixed(1)}°`);
});

test('steer +1 (left) turns toward +x while driving +z', () => {
  const phys = start(straight());
  run(phys, GO, 0.5);
  run(phys, { throttle: 0.5, steer: 1, brake: 0 }, 0.4);
  assert.ok(phys.car.pose().pos[0] > 0.5, `x ${phys.car.pose().pos[0]}`);
});

test('reverse: brake held while stopped backs up', () => {
  const phys = start(straight());
  const z0 = phys.car.pose().pos[2];
  run(phys, STOP, 2);
  assert.ok(phys.car.pose().pos[2] < z0 - 1, `z ${phys.car.pose().pos[2]}`);
});

test('teleport sets pose facing yaw and zeroes velocity', () => {
  const phys = start(straight());
  run(phys, GO, 2);
  phys.car.teleport({ pos: [0, 2, 40], yaw: Math.PI / 2 });
  assert.deepEqual(phys.car.pose().pos.map(Math.round), [0, 2, 40]);
  assert.equal(phys.car.speed(), 0);
  const [, qy, , qw] = phys.car.pose().quat;
  assert.ok(Math.abs(qy - Math.sin(Math.PI / 4)) < 1e-6 && Math.abs(qw - Math.cos(Math.PI / 4)) < 1e-6);
});

test('car falls when driven off the end of the track', () => {
  const phys = start(straight(1));
  run(phys, GO, 6);
  assert.ok(phys.car.pose().pos[1] < -5);
});

// run-up cells a jump needs after a standing start; tracks.test.js holds built-in tracks to this
export const JUMP_RUNUP = 4;

test(`a jump (ramp-up, gap, ramp-down) is cleared from a standing start ${JUMP_RUNUP} cells back, level in the air, no bounce on landing`, () => {
  const pieces = [piece('start', 0)];
  for (let z = 1; z < JUMP_RUNUP; z++) pieces.push(piece('straight', z));
  pieces.push(piece('ramp-up', JUMP_RUNUP), piece('gap', JUMP_RUNUP + 1), piece('ramp-down', JUMP_RUNUP + 2));
  for (let z = JUMP_RUNUP + 3; z <= JUMP_RUNUP + 12; z++) pieces.push(piece('straight', z));
  pieces.push(piece('finish', JUMP_RUNUP + 13));
  const L = layoutTrack({ name: 'j', pieces }), phys = start(L);
  const lip = (JUMP_RUNUP + 0.5) * CELL, landing = (JUMP_RUNUP + 2.5) * CELL;
  let airPitch = 0, landedAt = null, rebounds = 0, lastVy = 0, lastY = phys.car.pose().pos[1], minY = 9;
  phys.car.setControls(GO);
  for (let i = 0; i < 60 * 12; i++) {
    phys.step();
    const { pos: [, y, z], quat } = phys.car.pose(), vy = (y - lastY) * 60;
    if (z > lip + 3 && z < landing - CELL) airPitch = Math.max(airPitch, Math.abs(angles(quat).pitch));
    if (z > landing) {
      landedAt ??= i; minY = Math.min(minY, y);
      if (i - landedAt > 3 && lastVy > 0.6 && vy <= 0.6 && y > 1.1) rebounds++; // chassis thrown back up
    }
    lastVy = vy; lastY = y;
    if (z > (JUMP_RUNUP + 10) * CELL) break;
  }
  const [, y, z] = phys.car.pose().pos;
  assert.ok(z > (JUMP_RUNUP + 10) * CELL && y > 0.2, `did not clear the jump: ended at y ${y.toFixed(1)}, z ${z.toFixed(0)}`);
  assert.ok(airPitch < 12, `pitched ${airPitch.toFixed(1)}° in the air`);
  assert.equal(rebounds, 0, 'bounced after landing');
});

test('glancing off a wall at 250 km/h keeps the car upright, on the road and above half speed', () => {
  const phys = start(straight(40));
  until(phys, GO, () => kmh(phys) >= 250, 10);
  const { pos } = phys.car.pose();
  phys.car.teleport({ pos, yaw: 0.14 }); // ~8° toward the +x wall
  phys.car.setControls(GO); // teleport zeroes speed: rebuild it pointing at the wall is too slow, so re-accelerate
  until(phys, { throttle: 1, steer: 0, brake: 0 }, () => Math.abs(phys.car.pose().pos[0]) > 8.5, 12);
  const vHit = kmh(phys);
  let maxRoll = 0;
  run(phys, GO, 1.5, () => { maxRoll = Math.max(maxRoll, Math.abs(angles(phys.car.pose().quat).roll)); });
  const [x, y] = phys.car.pose().pos;
  assert.ok(vHit > 100, `test setup: only ${vHit.toFixed(0)} km/h at the wall`);
  assert.ok(Math.abs(x) < 11.5 && y > 0.2 && y < 2.5, `left the road: x ${x.toFixed(1)}, y ${y.toFixed(1)}`);
  assert.ok(maxRoll < 35, `rolled ${maxRoll.toFixed(0)}°`);
  assert.ok(kmh(phys) > vHit * 0.5, `speed ${vHit.toFixed(0)} → ${kmh(phys).toFixed(0)} km/h`);
});

test('free() releases the physics world so repeated races do not leak', () => {
  const phys = createPhysics(RAPIER, straight(3));
  phys.free();
  assert.throws(() => phys.step()); // world is gone
});
