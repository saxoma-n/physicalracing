import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitDiff, isBetter, parseBest } from '../game/records.js';
import { formatDiff } from '../game/race.js';

const best = { ms: 60000, splits: [10000, 30000] };

test('splitDiff compares a checkpoint time with the best run; null when there is nothing to compare', () => {
  assert.equal(splitDiff(best, 0, 9500), -500);
  assert.equal(splitDiff(best, 1, 31000), 1000);
  assert.equal(splitDiff(best, 2, 40000), null);
  assert.equal(splitDiff(null, 0, 9500), null);
});

test('isBetter: first run always counts, then only faster runs', () => {
  assert.equal(isBetter(null, 70000), true);
  assert.equal(isBetter(best, 59999), true);
  assert.equal(isBetter(best, 60000), false);
});

test('parseBest accepts a saved record and rejects anything malformed', () => {
  assert.deepEqual(parseBest(JSON.stringify(best)), best);
  for (const bad of [null, '', 'nope', '{}', '{"ms":"fast","splits":[]}', '{"ms":5,"splits":"x"}', '{"ms":5,"splits":[1,"a"]}']) {
    assert.equal(parseBest(bad), null, String(bad));
  }
});

test('formatDiff shows a sign and m:ss.mmm', () => {
  assert.equal(formatDiff(-37686), '-0:37.686');
  assert.equal(formatDiff(1234), '+0:01.234');
  assert.equal(formatDiff(0), '+0:00.000');
});
