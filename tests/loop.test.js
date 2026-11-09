import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, STEP_MS } from '../game/loop.js';

test('advance(0, 50) -> 3 steps and keeps the remainder', () => {
  const { steps, acc } = advance(0, 50);
  assert.equal(steps, 3);
  assert.ok(Math.abs(acc - (50 - 3 * STEP_MS)) < 1e-9);
});

test('advance carries the remainder into the next frame', () => {
  const a = advance(0, 10);
  assert.equal(a.steps, 0);
  assert.equal(advance(a.acc, 10).steps, 1);
});

test('advance clamps frame to 250 ms: advance(0, 10000).steps === 15', () => {
  assert.equal(advance(0, 10000).steps, 15);
});
