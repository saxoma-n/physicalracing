const MAX_SNAPSHOTS = 30;

const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function slerp(a, b, t) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (dot < 0) { b = b.map(v => -v); dot = -dot; } // take the short way round
  if (dot > 0.9995) {
    const q = lerp(a, b, t), n = Math.hypot(...q);
    return q.map(v => v / n);
  }
  const th = Math.acos(dot), s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + b[i] * wb);
}

// Remote car snapshots keyed by receive time; sample() a little in the past for smooth motion.
export function createBuffer() {
  const snaps = [];
  return {
    push(tMs, pos, quat) {
      snaps.push({ t: tMs, pos, quat });
      if (snaps.length > MAX_SNAPSHOTS) snaps.shift();
    },
    size: () => snaps.length,
    sample(tMs) {
      if (!snaps.length) return null;
      if (tMs <= snaps[0].t) return { pos: snaps[0].pos, quat: snaps[0].quat };
      for (let i = snaps.length - 1; i > 0; i--) {
        const a = snaps[i - 1], b = snaps[i];
        if (tMs >= a.t && tMs <= b.t) {
          const k = b.t === a.t ? 1 : (tMs - a.t) / (b.t - a.t);
          return { pos: lerp(a.pos, b.pos, k), quat: slerp(a.quat, b.quat, k) };
        }
      }
      const last = snaps.at(-1);
      return { pos: last.pos, quat: last.quat };
    },
  };
}
