import RAPIER from '../vendor/rapier.es.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createSession } from './session.js';
import { layoutTrack, validateTrack } from './track.js';
import { validateName, nextHost, raceOver } from './net/rooms.js';

await RAPIER.init();
const renderer = createRenderer(document.getElementById('view'));
const hud = createHud();
const input = createInput();
const $ = id => document.getElementById(id);

const COUNTDOWN_MS = 3000;
const TRACKS = await (await fetch('tracks/index.json')).json();
let stopCurrent = null;

export async function loadTrack(id) {
  const json = await (await fetch(`tracks/${id}.json`)).json();
  const errors = validateTrack(json);
  if (errors.length) throw new Error(`Track "${id}" is broken: ${errors[0]}`);
  return layoutTrack(json);
}

const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked: fine */ } },
};
$('name').value = store.get('name') ?? '';
$('name').addEventListener('input', () => store.set('name', $('name').value));

// Slowly orbit a track behind the menu.
function orbit(layout) {
  renderer.setTrack(layout);
  const c = layout.bounds.min.map((m, i) => (m + layout.bounds.max[i]) / 2);
  const r = Math.max(60, (layout.bounds.max[0] - layout.bounds.min[0]) * 0.8);
  let raf = requestAnimationFrame(function frame(t) {
    const a = t / 9000;
    renderer.setCamera([c[0] + Math.cos(a) * r, c[1] + r * 0.6, c[2] + Math.sin(a) * r], c);
    renderer.render();
    raf = requestAnimationFrame(frame);
  });
  return () => cancelAnimationFrame(raf);
}

export async function showMenu() {
  stopCurrent?.();
  $('menu').hidden = false;
  stopCurrent = orbit(await loadTrack(TRACKS[0].id));
}

export function runSolo(layout) {
  stopCurrent?.();
  $('menu').hidden = true;
  const now = () => performance.now();
  const session = createSession({
    RAPIER, renderer, hud, input, layout, now, startAt: now() + COUNTDOWN_MS,
    onEvent(evt) {
      if (evt === 'finish') hud.message('Finished! Enter to retry · Esc for menu');
      if (evt === 'retry') session.restart(now() + COUNTDOWN_MS);
    },
  });
  stopCurrent = () => session.stop();
}

for (const t of TRACKS) {
  const b = document.createElement('button');
  b.textContent = t.name;
  b.addEventListener('click', async () => runSolo(await loadTrack(t.id)));
  $('solo-tracks').append(b);
}

// ---------- multiplayer ----------
let net = null;
let leaveCurrent = null; // set while in a room

async function ensureNet() {
  if (!net) {
    const mod = await import('./net/firebase.js');
    await mod.connect();
    net = mod;
  }
  return net;
}

function netMessage(text) { $('net-msg').textContent = text ?? ''; }

async function withName(action) {
  const name = validateName($('name').value);
  if (!name) return netMessage('Enter a nickname (1–16 characters) first.');
  netMessage('Connecting…');
  for (const b of ['create', 'join']) $(b).disabled = true;
  try {
    await ensureNet();
    await action(name);
  } catch (e) {
    console.error(e);
    netMessage("Can't connect to multiplayer. Solo practice still works.");
  } finally {
    for (const b of ['create', 'join']) $(b).disabled = false;
  }
}

$('create').addEventListener('click', () => withName(async name => {
  const code = await net.createRoom(name, TRACKS[0].id);
  netMessage(null);
  runMulti(code);
}));

async function join() {
  await withName(async name => {
    const result = await net.joinRoom($('code').value, name);
    if (result === 'not-found') return netMessage('Room not found. Check the code.');
    if (result === 'full') return netMessage('Room is full (8 players).');
    netMessage(null);
    runMulti($('code').value.trim().toUpperCase());
  });
}
$('join').addEventListener('click', join);
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });

for (const t of TRACKS) $('lobby-track').append(new Option(t.name, t.id));

export function runMulti(code) {
  stopCurrent?.();
  stopCurrent = null;
  $('menu').hidden = true;
  $('lobby').hidden = false;
  $('lobby-code').textContent = code;
  const uid = net.myUid();
  let room = null, session = null, raceStartAt = null, overSince = null, menuStop = null;
  const timers = [];

  const isHost = () => room?.host === uid;

  function showLobby() {
    session?.stop();
    session = null;
    raceStartAt = null;
    $('lobby').hidden = false;
    menuStop ??= orbit(currentLayout ?? fallbackLayout);
  }

  function renderLobby() {
    const list = $('lobby-players');
    list.replaceChildren();
    const players = Object.entries(room.players ?? {}).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
    for (const [id, p] of players) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = p.name + (id === uid ? ' (you)' : '');
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = id === room.host ? 'host' : room.state !== 'lobby' && !p.raced ? 'waiting' : '';
      li.append(name, tag);
      list.append(li);
    }
    $('host-controls').hidden = !isHost();
    $('lobby-track').value = room.track;
    $('start').disabled = room.state !== 'lobby';
    const trackName = TRACKS.find(t => t.id === room.track)?.name ?? room.track;
    $('lobby-msg').textContent = room.state === 'lobby'
      ? (isHost() ? '' : `Waiting for the host to start · ${trackName}`)
      : 'Race in progress. You will join the next one.';
  }

  let currentLayout = null, fallbackLayout = null;

  async function startRace(r) {
    raceStartAt = r.startAt;
    menuStop?.(); menuStop = null;
    const layout = await loadTrack(r.track);
    currentLayout = layout;
    if (raceStartAt !== r.startAt) return; // a newer state arrived while loading
    $('lobby').hidden = true;
    await net.updateMe({ checkpoint: 0, finishTime: null, raced: true });
    session = createSession({
      RAPIER, renderer, hud, input, layout, now: net.serverNow, startAt: r.startAt,
      onEvent(evt, race) {
        if (evt === 'checkpoint') net.updateMe({ checkpoint: race.next });
        if (evt === 'finish') { net.updateMe({ finishTime: net.serverNow() }); hud.message('Finished! Waiting for the others…'); }
      },
    });
  }

  function onRoom(r) {
    if (!r) { leave('The room was closed.'); return; }
    room = r;
    if (!r.players?.[uid]) return; // our entry is being re-added after a reconnect
    if (!r.players[r.host] && nextHost(r.players) === uid) net.claimHost(code);
    renderLobby();
    const inCountdown = r.state === 'countdown' && net.serverNow() < r.startAt;
    if (inCountdown && raceStartAt !== r.startAt) startRace(r);
    if (r.state === 'lobby' && raceStartAt !== null) showLobby();
  }

  // host duties: heartbeat, countdown → racing, race end → lobby
  timers.push(setInterval(() => { if (isHost()) net.heartbeat(code); }, 30000));
  timers.push(setInterval(() => {
    if (!isHost() || !room) return;
    const now = net.serverNow();
    if (room.state === 'countdown' && now >= room.startAt) net.setState(code, 'racing');
    if (room.state === 'racing' && raceOver(room.players, now)) {
      overSince ??= now;
      if (now - overSince >= 10000) { overSince = null; net.setState(code, 'lobby'); }
    }
  }, 500));

  $('lobby-track').onchange = () => net.setTrack(code, $('lobby-track').value);
  $('start').onclick = () => net.startCountdown(code);
  $('leave').onclick = () => leave();

  async function leave(message) {
    timers.forEach(clearInterval);
    session?.stop();
    menuStop?.();
    leaveCurrent = null;
    $('lobby').hidden = true;
    await net.leaveRoom();
    await showMenu();
    if (message) netMessage(message);
  }
  leaveCurrent = leave;

  loadTrack(TRACKS[0].id).then(l => { fallbackLayout = l; if (!session) menuStop ??= orbit(l); });
  net.watchRoom(code, onRoom);
}

addEventListener('keydown', e => {
  if (e.code !== 'Escape') return;
  if (leaveCurrent) leaveCurrent();
  else if ($('menu').hidden) showMenu();
});
showMenu();
