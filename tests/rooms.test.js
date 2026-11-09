import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE_ALPHABET, MAX_PLAYERS, STALE_MS, END_GRACE_MS, makeRoomCode, normalizeCode, validateName, isStale, nextHost, raceOver } from '../game/net/rooms.js';

test('constants match the spec', () => {
  assert.equal(CODE_ALPHABET, 'ABCDEFGHJKLMNPQRSTUVWXYZ');
  assert.equal(MAX_PLAYERS, 8);
  assert.equal(STALE_MS, 3600000);
  assert.equal(END_GRACE_MS, 60000);
});

test('makeRoomCode is 4 chars from CODE_ALPHABET', () => {
  for (let i = 0; i < 1000; i++) assert.match(makeRoomCode(), /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
  assert.equal(makeRoomCode(() => 0), 'AAAA');
  assert.equal(makeRoomCode(() => 0.9999), 'ZZZZ');
});

test('normalizeCode(" kxrt ") === "KXRT"; "KXR", "KX0T", "KXIT" → null', () => {
  assert.equal(normalizeCode(' kxrt '), 'KXRT');
  for (const bad of ['KXR', 'KX0T', 'KXIT', 'KXRTS', '', null, undefined, 42]) assert.equal(normalizeCode(bad), null, String(bad));
});

test('validateName trims; "" and 17 chars → null; "<b>x</b>" is returned unchanged (escaping is the DOM\'s job)', () => {
  assert.equal(validateName('  Ana  '), 'Ana');
  assert.equal(validateName(''), null);
  assert.equal(validateName('   '), null);
  assert.equal(validateName('x'.repeat(17)), null);
  assert.equal(validateName('x'.repeat(16)), 'x'.repeat(16));
  assert.equal(validateName('<b>x</b>'), '<b>x</b>');
  assert.equal(validateName(undefined), null);
});

test('isStale: now - lastActive > STALE_MS only', () => {
  assert.equal(isStale(0, STALE_MS), false);
  assert.equal(isStale(0, STALE_MS + 1), true);
  assert.equal(isStale(undefined, 5), true);
});

test('nextHost picks the earliest joinedAt; empty → null', () => {
  assert.equal(nextHost({ a: { joinedAt: 5 }, b: { joinedAt: 2 }, c: { joinedAt: 9 } }), 'b');
  assert.equal(nextHost({}), null);
  assert.equal(nextHost(undefined), null);
});

const P = (raced, finishTime = null) => ({ joinedAt: 1, raced, finishTime });

test('raceOver: false when nobody finished', () => {
  assert.equal(raceOver({ a: P(true), b: P(true) }, 1e9), false);
});

test('raceOver: true when every racer finished', () => {
  assert.equal(raceOver({ a: P(true, 100), b: P(true, 200) }, 300), true);
});

test('raceOver: true 60 s after first finish even if others have not', () => {
  const players = { a: P(true, 1000), b: P(true) };
  assert.equal(raceOver(players, 1000 + END_GRACE_MS - 1), false);
  assert.equal(raceOver(players, 1000 + END_GRACE_MS), true);
});

test('raceOver ignores players with raced=false (joined mid-race)', () => {
  assert.equal(raceOver({ a: P(true, 100), late: P(false) }, 200), true);
});

test('raceOver: true when no racers remain (everyone left)', () => {
  assert.equal(raceOver({ late: P(false) }, 0), true);
  assert.equal(raceOver({}, 0), true);
});
