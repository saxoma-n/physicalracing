import { createRenderer } from './render.js';
import { layoutTrack } from './track.js';

const r = createRenderer(document.getElementById('view'));
const layout = layoutTrack(await (await fetch('tracks/test.json')).json());
r.setTrack(layout);
const c = layout.bounds.min.map((m, i) => (m + layout.bounds.max[i]) / 2);
(function frame(t) {
  const a = t / 4000;
  r.setCamera([c[0] + Math.cos(a) * 60, c[1] + 35, c[2] + Math.sin(a) * 60], c);
  r.render();
  requestAnimationFrame(frame);
})(0);
