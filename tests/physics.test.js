import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createPhysics } from '../game/physics.js';
import { layoutTrack } from '../game/track.js';

let RAPIER;
before(async () => { RAPIER = (await import('../vendor/rapier.es.js')).default; await RAPIER.init(); });

const straight = (n = 30) => layoutTrack({ name: 's', pieces: [
  { type: 'start', x: 0, y: 0, z: 0, rot: 0 },
  ...Array.from({ length: n }, (_, i) => ({ type: 'straight', x: 0, y: 0, z: i + 1, rot: 0 })),
  { type: 'finish', x: 0, y: 0, z: n + 1, rot: 0 },
] });

function drive(phys, controls, seconds) {
  phys.car.setControls(controls);
  for (let i = 0; i < seconds * 60; i++) phys.step();
}

test('car settles on its wheels on a flat road', () => {
  const L = straight(), phys = createPhysics(RAPIER, L);
  phys.car.teleport(L.start);
  drive(phys, { throttle: 0, steer: 0, brake: 0 }, 2);
  const y = phys.car.pose().pos[1];
  assert.ok(y > 0.2 && y < 2, `chassis height ${y}`);
  assert.ok(Math.abs(phys.car.speed()) < 0.5);
});

test('throttle drives forward along +z for yaw 0 without drifting sideways', () => {
  const L = straight(), phys = createPhysics(RAPIER, L);
  phys.car.teleport(L.start);
  drive(phys, { throttle: 1, steer: 0, brake: 0 }, 3);
  const [x, , z] = phys.car.pose().pos;
  assert.ok(z > 30, `z ${z}`);
  assert.ok(Math.abs(x) < 1, `x ${x}`);
  assert.ok(phys.car.speed() > 10, `speed ${phys.car.speed()}`);
});

test('steer +1 (left) turns toward +x while driving +z', () => {
  const L = straight(), phys = createPhysics(RAPIER, L);
  phys.car.teleport(L.start);
  drive(phys, { throttle: 1, steer: 0, brake: 0 }, 1);
  drive(phys, { throttle: 0.5, steer: 1, brake: 0 }, 0.5);
  assert.ok(phys.car.pose().pos[0] > 0.5, `x ${phys.car.pose().pos[0]}`);
});

test('brake stops the car', () => {
  const L = straight(), phys = createPhysics(RAPIER, L);
  phys.car.teleport(L.start);
  drive(phys, { throttle: 1, steer: 0, brake: 0 }, 2);
  phys.car.setControls({ throttle: 0, steer: 0, brake: 1 });
  let slowest = Infinity;
  for (let i = 0; i < 180; i++) { phys.step(); slowest = Math.min(slowest, Math.abs(phys.car.speed())); }
  assert.ok(slowest < 1, `slowest ${slowest}`);
});

test('reverse: brake held while stopped backs up', () => {
  const L = straight(), phys = createPhysics(RAPIER, L);
  phys.car.teleport({ pos: [0, 1, 50], yaw: 0 });
  drive(phys, { throttle: 0, steer: 0, brake: 1 }, 2);
  assert.ok(phys.car.pose().pos[2] < 49, `z ${phys.car.pose().pos[2]}`);
});

test('teleport sets pose facing yaw and zeroes velocity', () => {
  const L = straight(), phys = createPhysics(RAPIER, L);
  phys.car.teleport(L.start);
  drive(phys, { throttle: 1, steer: 0, brake: 0 }, 2);
  phys.car.teleport({ pos: [0, 2, 40], yaw: Math.PI / 2 });
  assert.deepEqual(phys.car.pose().pos.map(Math.round), [0, 2, 40]);
  assert.equal(phys.car.speed(), 0);
  const [, qy, , qw] = phys.car.pose().quat;
  assert.ok(Math.abs(qy - Math.sin(Math.PI / 4)) < 1e-6 && Math.abs(qw - Math.cos(Math.PI / 4)) < 1e-6);
});

test('car falls when driven off the end of the track', () => {
  const L = straight(3), phys = createPhysics(RAPIER, L);
  phys.car.teleport(L.start);
  drive(phys, { throttle: 1, steer: 0, brake: 0 }, 5);
  assert.ok(phys.car.pose().pos[1] < -5);
});

test('a ramp-up, one gap, ramp-down jump can be landed at full throttle', () => {
  const pieces = [{ type: 'start', x: 0, y: 0, z: 0, rot: 0 }];
  for (let z = 1; z <= 8; z++) pieces.push({ type: 'straight', x: 0, y: 0, z, rot: 0 });
  pieces.push({ type: 'ramp-up', x: 0, y: 0, z: 9, rot: 0 }, { type: 'gap', x: 0, y: 0, z: 10, rot: 0 }, { type: 'ramp-down', x: 0, y: 0, z: 11, rot: 0 });
  for (let z = 12; z <= 16; z++) pieces.push({ type: 'straight', x: 0, y: 0, z, rot: 0 });
  pieces.push({ type: 'finish', x: 0, y: 0, z: 17, rot: 0 });
  const L = layoutTrack({ name: 'j', pieces }), phys = createPhysics(RAPIER, L);
  phys.car.teleport(L.start);
  phys.car.setControls({ throttle: 1, steer: 0, brake: 0 });
  let landed = false;
  for (let i = 0; i < 600 && !landed; i++) {
    phys.step();
    const [, y, z] = phys.car.pose().pos;
    if (z > 125) landed = y > 0;
    if (y < -3) break;
  }
  assert.ok(landed, `ended at ${phys.car.pose().pos.map(n => n.toFixed(1))}`);
});

test('a one-cell left turn can be taken at a sensible speed by steering fully', () => {
  const pieces = [{ type: 'start', x: 0, y: 0, z: 0, rot: 0 }];
  for (let z = 1; z <= 3; z++) pieces.push({ type: 'straight', x: 0, y: 0, z, rot: 0 });
  pieces.push({ type: 'turn', x: 0, y: 0, z: 4, rot: 0 });
  for (let x = 1; x <= 4; x++) pieces.push({ type: 'straight', x, y: 0, z: 4, rot: 1 });
  pieces.push({ type: 'finish', x: 5, y: 0, z: 4, rot: 1 });
  const L = layoutTrack({ name: 't', pieces }), phys = createPhysics(RAPIER, L);
  phys.car.teleport(L.start);
  // simple driver: hold ~12 m/s, steer left once the turn starts
  for (let i = 0; i < 600; i++) {
    const [x, , z] = phys.car.pose().pos, v = phys.car.speed();
    if (x > 30) break;
    const turning = z > 33 && x < 5;
    phys.car.setControls({ throttle: v < 12 ? 1 : 0, brake: 0, steer: turning ? 1 : 0 });
    phys.step();
  }
  const [x, y, z] = phys.car.pose().pos;
  assert.ok(y > 0 && x > 30 && Math.abs(z - 40) < 4, `ended at ${[x, y, z].map(n => n.toFixed(1))}`);
});

test('free() releases the physics world so repeated races do not leak', () => {
  const L = straight(3), phys = createPhysics(RAPIER, L);
  phys.free();
  assert.throws(() => phys.step()); // world is gone
});
