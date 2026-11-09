import { formatTime } from './race.js';

export function createHud(root = document.getElementById('hud')) {
  root.innerHTML = '<div class="hud-time"></div><div class="hud-center"></div><div class="hud-msg"></div><table class="hud-results"></table>';
  const [time, center, msg, results] = root.children;
  const show = (el, on) => { el.hidden = !on; };
  show(results, false);

  return {
    setTime(ms) { time.textContent = ms == null ? '' : formatTime(ms); },
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
