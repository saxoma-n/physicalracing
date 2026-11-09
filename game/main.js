import RAPIER from '../vendor/rapier.es.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createSession } from './session.js';
import { layoutTrack, validateTrack } from './track.js';

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

addEventListener('keydown', e => { if (e.code === 'Escape' && $('menu').hidden) showMenu(); });
showMenu();
