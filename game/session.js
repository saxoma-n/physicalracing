import { createPhysics } from './physics.js';
import { createRace, updateRace, needsRespawn } from './race.js';
import { advance, STEP_MS } from './loop.js';
import { loadBest, saveBest, splitDiff, isBetter } from './records.js';

const IDLE = { throttle: 0, steer: 0, brake: 0 };

// Drives one car on one track. Time comes from now() so multiplayer can use server time.
// startAt: the now() value at which the race clock starts (input is locked before it).
export function createSession({ RAPIER, renderer, hud, input, layout, now, startAt, onEvent = () => {}, onFrame = () => {} }) {
  const phys = createPhysics(RAPIER, layout);
  let race, acc = 0, last = performance.now(), raf = 0, stopped = false;
  let best = null, splits = [];        // personal best for this track (layout.id), and this run's checkpoint times
  let camDir = null, camPrev = null;   // chase camera: smoothed direction of travel, last car position

  function reset(at) {
    startAt = at;
    race = createRace(layout);
    respawn(layout.start);
    best = layout.id ? loadBest(layout.id) : null;
    splits = [];
    hud.setBest(best?.ms ?? null);
    hud.setDiff(null);
    hud.results(null);
    hud.message(null);
  }
  function respawn(pose) {
    phys.car.teleport(pose);
    camDir = camPrev = null; // camera snaps behind the car instead of sweeping across the map
  }

  function record(evt, clock) {
    if (evt === 'checkpoint') { splits.push(clock); hud.setDiff(splitDiff(best, splits.length - 1, clock)); }
    if (evt === 'finish') {
      hud.setDiff(best ? clock - best.ms : null);
      if (layout.id && isBetter(best, clock)) saveBest(layout.id, { ms: clock, splits });
    }
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
      if (evt) { record(evt, clock); onEvent(evt, race, clock); }
    }
    if (keys.respawn || needsRespawn(layout, pos)) respawn(race.respawn);
    if (keys.retry) onEvent('retry', race, clock);

    hud.countdown(clock < 0 ? Math.ceil(-clock / 1000) : clock < 800 ? 'GO' : null);
    hud.setTime(race.finishedAt ?? Math.max(0, clock));
    hud.setSpeed(Math.abs(phys.car.speed()) * 3.6);
    hud.setCheckpoint(race.next, layout.checkpoints.length);

    const pose = phys.car.pose();
    renderer.player.setPose(pose.pos, pose.quat);
    chaseCamera(pose, step.steps * STEP_MS);
    onFrame(pose);
    renderer.render();
    raf = requestAnimationFrame(frame);
  }

  // Camera sits behind the car along its direction of TRAVEL (so slides and drifts are visible),
  // swinging round over ~0.2 s, and the view widens with speed. Fitted to the reference clips.
  function chaseCamera({ pos, quat: [x, y, z, w] }, dtMs) {
    const nose = [2 * (x * z + w * y), 1 - 2 * (x * x + y * y)];
    let want = nose, speed = 0;
    if (camPrev && dtMs > 0) {
      const vx = (pos[0] - camPrev[0]) / (dtMs / 1000), vz = (pos[2] - camPrev[2]) / (dtMs / 1000);
      speed = Math.hypot(vx, vz);
      if (speed > 3) want = [vx / speed, vz / speed];
      else if (camDir) want = camDir; // nearly stopped: hold the view
    }
    if (dtMs > 0 || !camPrev) camPrev = pos;
    const k = camDir ? 1 - Math.exp(-dtMs / 200) : 1;
    camDir ??= want;
    const d = [camDir[0] + (want[0] - camDir[0]) * k, camDir[1] + (want[1] - camDir[1]) * k], len = Math.hypot(d[0], d[1]) || 1;
    camDir = [d[0] / len, d[1] / len];
    const fov = 70 + 16 * (1 - Math.exp(-speed / 30));
    renderer.setCamera(
      [pos[0] - camDir[0] * 7.5, pos[1] + 2.4, pos[2] - camDir[1] * 7.5],
      [pos[0] + camDir[0] * 8, pos[1] + 0.8, pos[2] + camDir[1] * 8], fov);
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
