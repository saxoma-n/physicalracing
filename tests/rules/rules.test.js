// Runs against the Realtime Database emulator: npm run test:rules (or node --test tests/rules with emulators running).
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-rules',
    database: { rules: readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9000 },
  });
});
after(() => env.cleanup());
beforeEach(() => env.clearDatabase());

const db = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).database();
const HOUR = 3600000;
const player = (name = 'Ana') => ({ name, joinedAt: 1, checkpoint: 0, raced: false });
const room = (host = 'alice', lastActive = Date.now()) => ({
  host, track: 'warmup', state: 'lobby', lastActive, players: { [host]: player() },
});
const seed = (code, data) => env.withSecurityRulesDisabled(ctx => ctx.database().ref(`rooms/${code}`).set(data));

test('unauthenticated read fails', async () => {
  await assertFails(db(null).ref('rooms').get());
  await assertSucceeds(db('alice').ref('rooms').get());
});

test('create room with self as host succeeds', async () => {
  await assertSucceeds(db('alice').ref('rooms/KXRT').set({ ...room(), lastActive: { '.sv': 'timestamp' } }));
});

test('create room with someone else as host fails', async () => {
  await assertFails(db('alice').ref('rooms/KXRT').set(room('bob')));
});

test('create room with a code outside the alphabet fails', async () => {
  await assertFails(db('alice').ref('rooms/KXIT').set(room()));
});

test('create over an existing room fails', async () => {
  await seed('KXRT', room('bob'));
  await assertFails(db('alice').ref('rooms/KXRT').set(room()));
});

test('player writes own entry; writing another uid fails', async () => {
  await seed('KXRT', room('alice'));
  await assertSucceeds(db('bob').ref('rooms/KXRT/players/bob').set(player('Bob')));
  await assertSucceeds(db('bob').ref('rooms/KXRT/players/bob').update({ pos: { x: 1, y: 2, z: 3, qx: 0, qy: 0, qz: 0, qw: 1 }, finishTime: 123 }));
  await assertFails(db('bob').ref('rooms/KXRT/players/alice/finishTime').set(1));
  await assertFails(db('bob').ref('rooms/KXRT/players/carol').set(player('Carol')));
});

test('joining a room that does not exist fails', async () => {
  await assertFails(db('bob').ref('rooms/ZZZZ/players/bob').set(player('Bob')));
});

test('name of 17 chars fails; empty name fails', async () => {
  await seed('KXRT', room('alice'));
  await assertFails(db('bob').ref('rooms/KXRT/players/bob').set(player('x'.repeat(17))));
  await assertFails(db('bob').ref('rooms/KXRT/players/bob').set(player('')));
});

test('player can remove their own entry (leaving / onDisconnect)', async () => {
  await seed('KXRT', { ...room('alice'), players: { alice: player(), bob: player('Bob') } });
  await assertSucceeds(db('bob').ref('rooms/KXRT/players/bob').remove());
});

test('non-host cannot change state/track/startAt', async () => {
  await seed('KXRT', { ...room('alice'), players: { alice: player(), bob: player('Bob') } });
  await assertFails(db('bob').ref('rooms/KXRT/state').set('countdown'));
  await assertFails(db('bob').ref('rooms/KXRT/track').set('loops'));
  await assertFails(db('bob').ref('rooms/KXRT/startAt').set(5));
});

test('host can change state, track, startAt and lastActive', async () => {
  await seed('KXRT', room('alice'));
  await assertSucceeds(db('alice').ref('rooms/KXRT').update({ state: 'countdown', startAt: 5, track: 'loops', lastActive: { '.sv': 'timestamp' } }));
  await assertFails(db('alice').ref('rooms/KXRT/state').set('exploded'));
});

test('lastActive cannot be set into the future (would make a room undeletable)', async () => {
  await seed('KXRT', room('alice'));
  await assertFails(db('alice').ref('rooms/KXRT/lastActive').set(Date.now() + 10 * HOUR));
});

test('delete fresh room fails; delete room with lastActive 2h ago succeeds', async () => {
  await seed('KXRT', room('alice'));
  await seed('OLDD', room('alice', Date.now() - 2 * HOUR));
  await assertFails(db('bob').ref('rooms/KXRT').remove());
  await assertSucceeds(db('bob').ref('rooms/OLDD').remove());
});

test('non-host claims host while host present fails; after host entry removed succeeds', async () => {
  await seed('KXRT', { ...room('alice'), players: { alice: player(), bob: player('Bob') } });
  await assertFails(db('bob').ref('rooms/KXRT/host').set('bob'));
  await env.withSecurityRulesDisabled(ctx => ctx.database().ref('rooms/KXRT/players/alice').remove());
  await assertSucceeds(db('bob').ref('rooms/KXRT/host').set('bob'));
});

test('host must be a player in the room', async () => {
  await seed('KXRT', room('alice'));
  await assertFails(db('alice').ref('rooms/KXRT/host').set('nobody'));
});

test('unknown key under room fails', async () => {
  await seed('KXRT', room('alice'));
  await assertFails(db('alice').ref('rooms/KXRT/hack').set(1));
  await assertFails(db('alice').ref('rooms/KXRT/players/alice/admin').set(true));
});
