import RAPIER from '../vendor/rapier.es.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createSession } from './session.js';
import { layoutTrack } from './track.js';

await RAPIER.init();
const renderer = createRenderer(document.getElementById('view'));
const hud = createHud();
const input = createInput();

const COUNTDOWN_MS = 3000;

export function runSolo(layout) {
  const now = () => performance.now();
  const session = createSession({
    RAPIER, renderer, hud, input, layout, now, startAt: now() + COUNTDOWN_MS,
    onEvent(evt, race) {
      if (evt === 'finish') hud.message(`Finished! Press Enter to retry`);
      if (evt === 'retry') session.restart(now() + COUNTDOWN_MS);
    },
  });
  return () => session.stop();
}

runSolo(layoutTrack(await (await fetch('tracks/test.json')).json()));
