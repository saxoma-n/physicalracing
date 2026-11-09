import { createPhysics } from './physics.js';
import { createRace, updateRace, needsRespawn } from './race.js';
import { advance, STEP_MS } from './loop.js';

const IDLE = { throttle: 0, steer: 0, brake: 0 };

// Drives one car on one track. Time comes from now() so multiplayer can use server time.
// startAt: the now() value at which the race clock starts (input is locked before it).
export function createSession({ RAPIER, renderer, hud, input, layout, now, startAt, onEvent = () => {}, onFrame = () => {} }) {
  const phys = createPhysics(RAPIER, layout);
  let race, acc = 0, last = performance.now(), raf = 0, cam = null, stopped = false;

  function reset(at) {
    startAt = at;
    race = createRace(layout);
    phys.car.teleport(layout.start);
    hud.results(null);
    hud.message(null);
  }
  reset(startAt);
  renderer.setTrack(layout);
  renderer.player.show(true);

  function frame() {
    const t = performance.now();
    const step = advance(acc, t - last);
    acc = step.acc; last = t;
    const clock = now() - startAt; // ms since GO; negative during countdown
    const keys = input.read();
    const racing = clock >= 0 && race.finishedAt === null;

    phys.car.setControls(racing ? keys : IDLE);
    for (let i = 0; i < step.steps; i++) phys.step();

    const { pos } = phys.car.pose();
    if (racing) {
      const evt = updateRace(race, layout, pos, clock);
      if (evt) onEvent(evt, race, clock);
    }
    if (keys.respawn || needsRespawn(layout, pos)) phys.car.teleport(race.respawn);
    if (keys.retry) onEvent('retry', race, clock);

    hud.countdown(clock < 0 ? Math.ceil(-clock / 1000) : clock < 800 ? 'GO' : null);
    hud.setTime(race.finishedAt ?? Math.max(0, clock));

    const pose = phys.car.pose();
    renderer.player.setPose(pose.pos, pose.quat);
    chaseCamera(pose, step.steps * STEP_MS);
    onFrame(pose);
    renderer.render();
    raf = requestAnimationFrame(frame);
  }

  function chaseCamera({ pos, quat: [x, y, z, w] }, dtMs) {
    const fx = 2 * (x * z + w * y), fz = 1 - 2 * (x * x + y * y), len = Math.hypot(fx, fz) || 1;
    const f = [fx / len, fz / len];
    const want = [pos[0] - f[0] * 7.5, pos[1] + 3.2, pos[2] - f[1] * 7.5];
    const k = cam ? 1 - Math.exp(-dtMs / 90) : 1;
    cam = (cam ?? want).map((c, i) => c + (want[i] - c) * k);
    renderer.setCamera(cam, [pos[0] + f[0] * 4, pos[1] + 1, pos[2] + f[1] * 4]);
  }

  raf = requestAnimationFrame(frame);
  return {
    restart: reset,
    stop() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf); phys.free(); renderer.player.show(false); hud.clear();
    },
  };
}
