import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTrack, layoutTrack } from '../game/track.js';
import { PIECES, CELL, LEVEL, worldGeometry } from '../game/pieces.js';

const p = (type, x, y, z, rot = 0) => ({ type, x, y, z, rot });
const minimal = () => ({ name: 'T', pieces: [p('start', 0, 0, 0), p('straight', 0, 0, 1), p('finish', 0, 0, 2)] });

test('valid minimal track has no errors', () => {
  assert.deepEqual(validateTrack(minimal()), []);
});

test('rejects zero or two starts', () => {
  const none = minimal(); none.pieces.shift();
  const two = minimal(); two.pieces.push(p('start', 0, 0, 3));
  assert.match(validateTrack(none).join(), /start/);
  assert.match(validateTrack(two).join(), /start/);
});

test('rejects missing finish', () => {
  const t = minimal(); t.pieces.pop();
  assert.match(validateTrack(t).join(), /finish/);
});

test('rejects unknown piece type', () => {
  const t = minimal(); t.pieces.push(p('loopdeloop', 0, 0, 5));
  assert.match(validateTrack(t).join(), /loopdeloop/);
});

test('rejects non-integer coords and rot outside 0–3', () => {
  const a = minimal(); a.pieces[1].x = 0.5;
  const b = minimal(); b.pieces[1].rot = 4;
  assert.notDeepEqual(validateTrack(a), []);
  assert.notDeepEqual(validateTrack(b), []);
});

test('rejects non-object input and missing pieces array', () => {
  assert.notDeepEqual(validateTrack(null), []);
  assert.notDeepEqual(validateTrack({ name: 'x' }), []);
});

test('layout orders checkpoints by array order', () => {
  const t = minimal();
  t.pieces.splice(1, 0, p('checkpoint', 0, 0, 9), p('checkpoint', 0, 0, 4));
  const L = layoutTrack(t);
  assert.equal(L.checkpoints.length, 2);
  assert.equal(L.checkpoints[0].pose.pos[2], 9 * CELL);
  assert.equal(L.checkpoints[1].pose.pos[2], 4 * CELL);
});

test('start pose sits above start cell facing rot', () => {
  const t = minimal(); t.pieces[0] = p('start', 2, 1, 3, 1);
  const L = layoutTrack(t);
  assert.deepEqual(L.start.pos, [2 * CELL, LEVEL * 1 + 1, 3 * CELL]);
  assert.equal(L.start.yaw, Math.PI / 2);
});

test('checkpoint box covers its cell footprint and 6 units above the road', () => {
  const t = minimal(); t.pieces.splice(1, 0, p('checkpoint', 1, 0, 1));
  const box = layoutTrack(t).checkpoints[0];
  assert.deepEqual([box.min[0], box.max[0], box.min[2], box.max[2]], [CELL / 2, CELL * 1.5, CELL / 2, CELL * 1.5]);
  assert.equal(box.max[1], 6);
});

test('bounds cover all pieces; minY is the lowest piece y*LEVEL', () => {
  const t = minimal(); t.pieces.push(p('straight', -3, -2, 7));
  const L = layoutTrack(t);
  assert.equal(L.minY, -2 * LEVEL);
  assert.ok(L.bounds.min[0] <= -3 * CELL - CELL / 2 && L.bounds.max[2] >= 7 * CELL + CELL / 2);
});

test('every non-gap piece geometry has indices divisible by 3 and in range', () => {
  for (const [type, def] of Object.entries(PIECES)) {
    const g = def.geometry();
    if (def.kind === 'gap') { assert.equal(g.indices.length, 0, type); continue; }
    assert.ok(g.indices.length > 0 && g.indices.length % 3 === 0, type);
    assert.ok(g.indices.every(i => i >= 0 && i < g.vertices.length / 3), type);
  }
});

test('worldGeometry rotates a quarter turn around +Y and moves to the cell', () => {
  const local = PIECES.straight.geometry().vertices;
  const w = worldGeometry(p('straight', 1, 2, 3, 1)).vertices;
  // local (x, y, z) -> world (cx + z, cy + y, cz - x) for yaw = π/2
  for (let i = 0; i < local.length; i += 3) {
    assert.ok(Math.abs(w[i] - (CELL + local[i + 2])) < 1e-9);
    assert.ok(Math.abs(w[i + 1] - (2 * LEVEL + local[i + 1])) < 1e-9);
    assert.ok(Math.abs(w[i + 2] - (3 * CELL - local[i])) < 1e-9);
  }
});

test('slope rises exactly one LEVEL from entry to exit', () => {
  const v = PIECES.slope.geometry().vertices;
  const ys = []; for (let i = 1; i < v.length; i += 3) ys.push(v[i]);
  assert.equal(Math.max(...ys), LEVEL);
});

function signedVolume(g) {
  const v = g.vertices; let vol = 0;
  for (let i = 0; i < g.indices.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => g.indices[i + k] * 3);
    vol += (v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1])
          - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c])
          + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])) / 6;
  }
  return vol;
}

test('every solid piece is closed with outward-facing triangles (positive volume)', () => {
  for (const [type, def] of Object.entries(PIECES)) {
    if (def.kind !== 'gap') assert.ok(signedVolume(def.geometry()) > 0, type);
  }
});

test('straight slab is 8 wide, 1 thick, one cell long', () => {
  assert.ok(Math.abs(signedVolume(PIECES.straight.geometry()) - 8 * 1 * CELL) < 1e-9);
});

test('tracks/test.json is valid', async () => {
  const { readFile } = await import('node:fs/promises');
  const t = JSON.parse(await readFile(new URL('../tracks/test.json', import.meta.url)));
  assert.deepEqual(validateTrack(t), []);
});
