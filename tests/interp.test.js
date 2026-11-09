import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBuffer } from '../game/net/interp.js';

const Q0 = [0, 0, 0, 1];
const Q90 = [0, Math.SQRT1_2, 0, Math.SQRT1_2]; // 90° about Y
const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

test('sample interpolates halfway between two snapshots', () => {
  const b = createBuffer();
  b.push(0, [0, 0, 0], Q0);
  b.push(100, [10, 2, -4], Q90);
  const s = b.sample(50);
  assert.ok(close(s.pos, [5, 1, -2]));
  assert.ok(close(s.quat, [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)])); // 45°
});

test('sample takes the short way round when quaternions have opposite sign', () => {
  const b = createBuffer();
  b.push(0, [0, 0, 0], Q0);
  b.push(100, [0, 0, 0], [-0, -0, -0, -1]); // same rotation as Q0
  assert.ok(close(b.sample(50).quat.map(Math.abs), [0, 0, 0, 1]));
});

test('sample clamps to the latest snapshot when tMs is past it; null when empty', () => {
  const b = createBuffer();
  assert.equal(b.sample(10), null);
  b.push(0, [0, 0, 0], Q0);
  b.push(100, [10, 0, 0], Q0);
  assert.deepEqual(b.sample(500).pos, [10, 0, 0]);
  assert.deepEqual(b.sample(-50).pos, [0, 0, 0]);
});

test('buffer keeps at most 30 snapshots', () => {
  const b = createBuffer();
  for (let i = 0; i < 100; i++) b.push(i * 10, [i, 0, 0], Q0);
  assert.equal(b.size(), 30);
  assert.deepEqual(b.sample(0).pos, [70, 0, 0]); // oldest kept
});
