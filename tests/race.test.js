import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRace, updateRace, needsRespawn } from '../game/race.js';
import { layoutTrack } from '../game/track.js';
import { CELL } from '../game/pieces.js';

const p = (type, z) => ({ type, x: 0, y: 0, z, rot: 0 });
const L = layoutTrack({ name: 'r', pieces: [p('start', 0), p('checkpoint', 1), p('checkpoint', 2), p('finish', 3)] });
const at = z => [0, 1, z * CELL];

test('entering checkpoint 0 returns "checkpoint", sets next=1 and respawn=checkpoints[0].pose', () => {
  const r = createRace(L);
  assert.deepEqual(r.respawn, L.start);
  assert.equal(updateRace(r, L, at(1), 100), 'checkpoint');
  assert.equal(r.next, 1);
  assert.deepEqual(r.respawn, L.checkpoints[0].pose);
});

test('entering checkpoint 1 before 0 does nothing', () => {
  const r = createRace(L);
  assert.equal(updateRace(r, L, at(2), 100), null);
  assert.equal(r.next, 0);
});

test('staying inside a checkpoint only counts once', () => {
  const r = createRace(L);
  updateRace(r, L, at(1), 100);
  assert.equal(updateRace(r, L, at(1), 116), null);
});

test('finish before all checkpoints does nothing', () => {
  const r = createRace(L);
  updateRace(r, L, at(1), 100);
  assert.equal(updateRace(r, L, at(3), 200), null);
  assert.equal(r.finishedAt, null);
});

test('finish after all checkpoints returns "finish" and sets finishedAt=tMs; later calls return null', () => {
  const r = createRace(L);
  updateRace(r, L, at(1), 100);
  updateRace(r, L, at(2), 200);
  assert.equal(updateRace(r, L, at(3), 300), 'finish');
  assert.equal(r.finishedAt, 300);
  assert.equal(updateRace(r, L, at(3), 400), null);
  assert.equal(r.finishedAt, 300);
});

test('needsRespawn true when y < minY - 10', () => {
  assert.equal(needsRespawn(L, [0, L.minY - 10.1, 0]), true);
  assert.equal(needsRespawn(L, [0, L.minY - 9.9, 0]), false);
});

test('needsRespawn true when x or z is more than 20 outside bounds', () => {
  assert.equal(needsRespawn(L, [L.bounds.max[0] + 20.1, 0, 0]), true);
  assert.equal(needsRespawn(L, [0, 0, L.bounds.min[2] - 20.1]), true);
  assert.equal(needsRespawn(L, [L.bounds.max[0] + 19.9, 0, 0]), false);
});

test('needsRespawn false on the track', () => {
  assert.equal(needsRespawn(L, at(2)), false);
});

test('formatTime shows m:ss.mmm', async () => {
  const { formatTime } = await import('../game/race.js');
  assert.equal(formatTime(0), '0:00.000');
  assert.equal(formatTime(61234.5), '1:01.234');
  assert.equal(formatTime(9999), '0:09.999');
});
