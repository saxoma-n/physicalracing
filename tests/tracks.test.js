import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateTrack } from '../game/track.js';
import { CELL } from '../game/pieces.js';
import { breaks } from './helpers/connect.js';
import { centreLine, drive, JUMP_RUNUP } from './helpers/autopilot.js';

let RAPIER;
before(async () => { RAPIER = (await import('../vendor/rapier.es.js')).default; await RAPIER.init(); });

const load = async f => JSON.parse(await readFile(new URL(`../tracks/${f}`, import.meta.url)));
const index = await load('index.json');
const results = {};

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

  test(`${id}: is at least 1.5 km long (sized for the car's speed)`, async () => {
    assert.ok(centreLine(await load(`${id}.json`)).length * 4 >= 1500);
  });

  test(`${id}: the road never runs into another part of itself`, async () => {
    const line = centreLine(await load(`${id}.json`));
    for (let i = 0; i < line.length; i += 2) {
      for (let j = i + 20; j < line.length; j += 2) { // 80 m further along or more
        const a = line[i].p, b = line[j].p;
        const clash = Math.hypot(a[0] - b[0], a[2] - b[2]) < 30 && Math.abs(a[1] - b[1]) < 15;
        assert.ok(!clash, `pieces ${line[i].piece} and ${line[j].piece} overlap`);
      }
    }
  });

  test(`${id}: every jump has ${JUMP_RUNUP} straight cells of run-up after the last checkpoint or turn`, async () => {
    const t = await load(`${id}.json`);
    t.pieces.forEach((p, i) => {
      if (p.type !== 'ramp-up') return;
      for (let k = 1; k < JUMP_RUNUP; k++) assert.equal(t.pieces[i - k]?.type, 'straight', `jump at piece ${i}`);
    });
  });

  test(`${id}: an autopilot can drive it from start to finish without falling off`, async () => {
    const r = results[id] = drive(RAPIER, await load(`${id}.json`));
    assert.ok(r.finished, r.reason);
    console.log(`    ${id}: ${r.seconds.toFixed(1)} s, top ${r.maxKmh.toFixed(0)} km/h`);
  });
}

test('gauntlet has a straight long enough to pass 650 km/h', () => {
  assert.ok(results.gauntlet?.maxKmh > 650, `top ${results.gauntlet?.maxKmh?.toFixed(0)} km/h`);
});

test('breaks() catches a height mismatch and a sideways jump', () => {
  const p = (type, x, y, z, rot = 0) => ({ type, x, y, z, rot });
  assert.deepEqual(breaks({ pieces: [p('start', 0, 0, 0), p('straight', 0, 1, 1)] }), [0]);
  assert.deepEqual(breaks({ pieces: [p('start', 0, 0, 0), p('straight', 1, 0, 1)] }), [0]);
  assert.deepEqual(breaks({ pieces: [p('start', 0, 0, 0), p('slope', 0, 0, 1), p('straight', 0, 1, 2)] }), []);
  assert.deepEqual(breaks({ pieces: [p('start', 0, 0, 0), p('turn', 0, 0, 1, 1), p('straight', -1, 0, 1, 3)] }), []); // right turn
  assert.deepEqual(breaks({ pieces: [p('start', 0, 0, 0), p('turn-m', 0, 0, 1), p('straight', 3, 0, 3, 1)] }), []); // 100 m turn spans 3 cells
  void CELL;
});
