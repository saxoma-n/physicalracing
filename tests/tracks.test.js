import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateTrack } from '../game/track.js';
import { breaks } from './helpers/connect.js';

const load = async f => JSON.parse(await readFile(new URL(`../tracks/${f}`, import.meta.url)));
const index = await load('index.json');

test('index lists the four built-in tracks', () => {
  assert.deepEqual(index.map(t => t.id), ['warmup', 'loops', 'skyline', 'gauntlet']);
});

for (const { id, name } of index) {
  test(`${id}: valid, named, has a checkpoint, starts with start and ends with finish`, async () => {
    const t = await load(`${id}.json`);
    assert.deepEqual(validateTrack(t), []);
    assert.equal(t.name, name);
    assert.ok(t.pieces.some(p => p.type === 'checkpoint'));
    assert.equal(t.pieces[0].type, 'start');
    assert.equal(t.pieces.at(-1).type, 'finish');
  });

  test(`${id}: every piece connects to the next`, async () => {
    assert.deepEqual(breaks(await load(`${id}.json`)), []);
  });

  test(`${id}: no two pieces share a cell`, async () => {
    const t = await load(`${id}.json`);
    const cells = t.pieces.map(p => `${p.x},${p.y},${p.z}`);
    assert.equal(new Set(cells).size, cells.length);
  });

  test(`${id}: pieces stacked in the same column leave room to drive underneath`, async () => {
    const t = await load(`${id}.json`), cols = {};
    for (const p of t.pieces) {
      for (const y of (cols[`${p.x},${p.z}`] ??= [])) assert.ok(Math.abs(y - p.y) >= 3, `${p.x},${p.z}`);
      cols[`${p.x},${p.z}`].push(p.y);
    }
  });
}

test('breaks() catches a height mismatch and a sideways jump', () => {
  const p = (type, x, y, z, rot = 0) => ({ type, x, y, z, rot });
  assert.deepEqual(breaks({ pieces: [p('start', 0, 0, 0), p('straight', 0, 1, 1)] }), [0]);
  assert.deepEqual(breaks({ pieces: [p('start', 0, 0, 0), p('straight', 1, 0, 1)] }), [0]);
  assert.deepEqual(breaks({ pieces: [p('start', 0, 0, 0), p('slope', 0, 0, 1), p('straight', 0, 1, 2)] }), []);
  assert.deepEqual(breaks({ pieces: [p('start', 0, 0, 0), p('turn', 0, 0, 1, 1), p('straight', -1, 0, 1, 3)] }), []); // right turn
});
