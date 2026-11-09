// Browser regression tests. Needs: `npm run emulators` and `npm run serve` (port 8000) running.
// Run: npm run test:e2e
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const URL = 'http://localhost:8000/';
const DB = 'http://127.0.0.1:9000';
const NS = 'ns=demo-physicalracing-default-rtdb';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
after(() => browser.close());

async function open({ slowTrackMs = 0, blockDb = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 480 } });
  if (slowTrackMs) await ctx.route(/tracks\/(?!index)\w+\.json$/, async r => { await new Promise(res => setTimeout(res, slowTrackMs)); r.continue(); });
  const p = await ctx.newPage();
  if (blockDb) await p.routeWebSocket(/127\.0\.0\.1:9000/, () => {}); // accept the socket, never answer
  await p.goto(URL);
  await p.waitForSelector('#solo-tracks button');
  return p;
}

async function createRoom(p, name = 'Ana') {
  await p.fill('#name', name);
  await p.click('#create');
  await p.waitForSelector('#lobby:not([hidden])', { timeout: 15000 });
  return (await p.textContent('#lobby-code')).trim();
}

const admin = (path, body) => fetch(`${DB}/${path}.json?${NS}`, {
  method: 'PATCH', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(body),
});

test('leaving while the race track is still loading leaves no car running over the menu', async () => {
  const p = await open({ slowTrackMs: 2500 });
  await createRoom(p);
  await p.click('#start');
  await p.waitForTimeout(500);
  await p.click('#leave');
  await p.waitForSelector('#menu:not([hidden])');
  await p.waitForTimeout(4000); // the slow track has loaded by now
  assert.equal(await p.textContent('.hud-time'), '', 'a race HUD is running behind the menu');
  await p.context().close();
});

test('a new countdown that arrives without a lobby state does not run two sessions', async () => {
  const p = await open();
  const code = await createRoom(p);
  await p.click('#start');
  await p.waitForSelector('#lobby', { state: 'hidden', timeout: 15000 });
  await p.waitForTimeout(6000); // racing now
  const startAt = Date.now() + 6000;
  await admin(`rooms/${code}`, { state: 'countdown', startAt }); // skip 'lobby', as a missed update would
  await p.waitForTimeout(1500);
  const times = new Set();
  for (let i = 0; i < 8; i++) { times.add(await p.textContent('.hud-time')); await p.waitForTimeout(150); }
  assert.deepEqual([...times], ['0:00.000'], `HUD flips between sessions: ${[...times]}`);
  await p.context().close();
});

test('create shows an error instead of hanging when the database is unreachable', async () => {
  const p = await open({ blockDb: true });
  await p.fill('#name', 'Ana');
  await p.click('#create');
  await p.waitForFunction(() => /Can't connect/.test(document.querySelector('#net-msg').textContent), null, { timeout: 20000 });
  assert.equal(await p.isEnabled('#create'), true);
  await p.context().close();
});
