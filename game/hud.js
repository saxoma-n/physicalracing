import { formatTime, formatDiff } from './race.js';

export function createHud(root = document.getElementById('hud')) {
  root.innerHTML = `
    <div class="hud-center"></div><div class="hud-msg"></div><table class="hud-results"></table>
    <div class="hud-bar">
      <div class="hud-box hud-cp"><span class="hud-label">Checkpoints</span><b></b></div>
      <div class="hud-box hud-times">
        <div><span class="hud-label">Best</span><b class="hud-best"></b></div>
        <div class="hud-now"><span class="hud-label">Time</span><b class="hud-time"></b></div>
        <div><span class="hud-label">Split</span><b class="hud-diff"></b></div>
      </div>
      <div class="hud-box hud-speed"><b></b><span class="hud-label">km/h</span></div>
    </div>`;
  const q = sel => root.querySelector(sel);
  const center = q('.hud-center'), msg = q('.hud-msg'), results = q('.hud-results'), bar = q('.hud-bar');
  const time = q('.hud-time'), best = q('.hud-best'), diff = q('.hud-diff'), cp = q('.hud-cp b'), speed = q('.hud-speed b');
  const show = (el, on) => { el.hidden = !on; };
  show(results, false);
  show(bar, false);

  return {
    setTime(ms) { show(bar, ms != null); time.textContent = ms == null ? '' : formatTime(ms); },
    setSpeed(kmh) { speed.textContent = Math.round(kmh); },
    setCheckpoint(done, total) { cp.textContent = `${done}/${total}`; },
    setBest(ms) { best.textContent = ms == null ? '—' : formatTime(ms); },
    // negative = ahead of your best
    setDiff(ms) {
      diff.textContent = ms == null ? '—' : formatDiff(ms);
      diff.className = 'hud-diff' + (ms == null ? '' : ms < 0 ? ' ahead' : ' behind');
    },
    countdown(n) { center.textContent = n ?? ''; center.classList.toggle('go', n === 'GO'); },
    message(text) { msg.textContent = text ?? ''; show(msg, !!text); },
    // rows: [{ name, ms | null }] in finish order
    results(rows, title = 'Results') {
      show(results, !!rows);
      if (!rows) return;
      results.replaceChildren();
      const cap = results.createCaption();
      cap.textContent = title;
      rows.forEach((r, i) => {
        const tr = results.insertRow();
        for (const text of [r.ms == null ? '' : `${i + 1}.`, r.name, r.ms == null ? '—' : formatTime(r.ms)]) {
          tr.insertCell().textContent = text;
        }
      });
    },
    clear() { this.setTime(null); this.countdown(null); this.message(null); this.results(null); },
  };
}
