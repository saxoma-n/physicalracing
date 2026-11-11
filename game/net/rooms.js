export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: they read as 1 and 0
export const MAX_PLAYERS = 8;
export const STALE_MS = 3600000;
export const END_GRACE_MS = 60000;
export const MAX_NAME = 16;

export function makeRoomCode(rng = Math.random) {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return code;
}

export function normalizeCode(input) {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/.test(code) ? code : null;
}

export function validateName(input) {
  if (typeof input !== 'string') return null;
  const name = input.trim();
  return name.length >= 1 && name.length <= MAX_NAME ? name : null;
}

export const isStale = (lastActive, now) => !(now - lastActive <= STALE_MS);

export function nextHost(players) {
  const entries = Object.entries(players ?? {});
  if (!entries.length) return null;
  return entries.reduce((a, b) => (b[1].joinedAt < a[1].joinedAt ? b : a))[0];
}

// players: { uid: { raced, finishTime } } with finishTime in server ms.
// startAt: times before it belong to an earlier race (a player who missed this one) and don't count.
export function raceOver(players, now, startAt = -Infinity) {
  const racers = Object.values(players ?? {}).filter(p => p.raced);
  const times = racers.map(p => p.finishTime).filter(t => typeof t === 'number' && t >= startAt);
  if (times.length === racers.length) return true;
  return times.length > 0 && now - Math.min(...times) >= END_GRACE_MS;
}

export const CAR_COLORS = [0x8a0f24, 0x1f5fbf, 0x1e8a4c, 0xe0a100, 0x6b2bb5, 0xe2601c, 0x0f9aa8, 0xd23f8e, 0x3c4452, 0xf2f2f2];

// Same uid → same colour on every screen.
export function colorFor(uid) {
  let h = 0;
  for (const ch of String(uid)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CAR_COLORS[h % CAR_COLORS.length];
}
