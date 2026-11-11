// Personal best per track, kept in this browser only.
export const splitDiff = (best, index, ms) => (typeof best?.splits?.[index] === 'number' ? ms - best.splits[index] : null);
export const isBetter = (best, ms) => !best || ms < best.ms;

export function parseBest(text) {
  try {
    const b = JSON.parse(text);
    const ok = b && typeof b.ms === 'number' && Array.isArray(b.splits) && b.splits.every(s => typeof s === 'number');
    return ok ? { ms: b.ms, splits: b.splits } : null;
  } catch { return null; }
}

export function loadBest(trackId) {
  try { return parseBest(localStorage.getItem(`best:${trackId}`)); } catch { return null; }
}

export function saveBest(trackId, run) {
  try { localStorage.setItem(`best:${trackId}`, JSON.stringify(run)); } catch { /* storage blocked: the record just isn't kept */ }
}
