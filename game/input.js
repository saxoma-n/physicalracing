const KEYS = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
};

export function createInput() {
  const held = new Set();
  let respawn = false, retry = false;
  const typing = e => e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
  addEventListener('keydown', e => {
    if (typing(e)) return;
    held.add(e.code);
    if (e.code === 'KeyR' && !e.repeat) respawn = true;
    if (e.code === 'Enter' && !e.repeat) retry = true;
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', e => held.delete(e.code));
  addEventListener('blur', () => held.clear());
  const any = k => KEYS[k].some(c => held.has(c));

  return {
    // respawn and retry are true once per key press
    read() {
      const out = {
        throttle: any('up') ? 1 : 0,
        brake: any('down') ? 1 : 0,
        steer: (any('left') ? 1 : 0) - (any('right') ? 1 : 0),
        respawn, retry,
      };
      respawn = retry = false;
      return out;
    },
  };
}
