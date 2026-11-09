// All Firebase traffic goes through here. Loaded only when the player opens multiplayer.
import { firebaseConfig, useEmulator, FIREBASE_SDK } from '../config.js';
import { STALE_MS, MAX_PLAYERS, makeRoomCode, normalizeCode } from './rooms.js';

let D, db, uid = null, offset = 0;
let me = null; // { ref, data } for my entry in the current room
const unsubs = [];

const timeout = (ms, what) => new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error(`${what} timed out`), { timeout: true })), ms));
// sign-in can succeed on networks that block the database socket: never wait forever on the database
const NET_MS = 10000;
const within = (promise, what) => Promise.race([promise, timeout(NET_MS, what)]);

export async function connect() {
  if (uid) return { uid };
  const [{ initializeApp }, A, Dm] = await Promise.all([
    import(`${FIREBASE_SDK}/firebase-app.js`),
    import(`${FIREBASE_SDK}/firebase-auth.js`),
    import(`${FIREBASE_SDK}/firebase-database.js`),
  ]);
  D = Dm;
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  db = D.getDatabase(app);
  if (useEmulator) {
    A.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    D.connectDatabaseEmulator(db, '127.0.0.1', 9000);
  }
  // each tab gets its own anonymous identity, so two tabs on one computer can race each other
  await A.setPersistence(auth, A.inMemoryPersistence);
  const cred = await Promise.race([A.signInAnonymously(auth), timeout(10000, 'sign-in')]);
  uid = cred.user.uid;
  D.onValue(D.ref(db, '.info/serverTimeOffset'), s => { offset = s.val() ?? 0; });
  // after a dropped connection the server removed my entry (onDisconnect): put it back
  D.onValue(D.ref(db, '.info/connected'), s => {
    if (s.val() && me) { D.onDisconnect(me.ref).remove(); D.set(me.ref, me.data).catch(() => {}); }
  });
  return { uid };
}

export const myUid = () => uid;
export const serverNow = () => Date.now() + offset;
const roomRef = (code, path = '') => D.ref(db, `rooms/${code}${path}`);

export async function sweepStale() {
  const old = await within(D.get(D.query(D.ref(db, 'rooms'), D.orderByChild('lastActive'), D.endAt(serverNow() - STALE_MS))), 'cleanup');
  const codes = Object.keys(old.val() ?? {});
  await Promise.all(codes.map(c => D.remove(roomRef(c)).catch(() => {})));
  return codes.length;
}

async function enter(code, name) {
  me = { ref: roomRef(code, `/players/${uid}`), data: { name, joinedAt: serverNow(), checkpoint: 0, raced: false } };
  await within(D.set(me.ref, me.data), 'joining');
  await D.onDisconnect(me.ref).remove();
}

export async function createRoom(name, track) {
  await sweepStale().catch(e => { if (e.timeout) throw e; });
  for (let i = 0; i < 5; i++) {
    const code = makeRoomCode();
    const data = { name, joinedAt: serverNow(), checkpoint: 0, raced: false };
    try {
      // rules refuse to overwrite an existing room, so a taken code just fails and we pick another
      await within(D.set(roomRef(code), { host: uid, track, state: 'lobby', lastActive: D.serverTimestamp(), players: { [uid]: data } }), 'creating room');
    } catch (e) { if (e.timeout) throw e; continue; }
    me = { ref: roomRef(code, `/players/${uid}`), data };
    await D.onDisconnect(me.ref).remove();
    return code;
  }
  throw new Error('Could not create a room, try again');
}

export async function joinRoom(input, name) {
  const code = normalizeCode(input);
  if (!code) return 'not-found';
  const room = (await within(D.get(roomRef(code)), 'finding room')).val();
  if (!room) return 'not-found';
  if (Object.keys(room.players ?? {}).length >= MAX_PLAYERS) return 'full';
  try { await enter(code, name); } catch (e) { if (e.timeout) throw e; return 'not-found'; }
  return 'ok';
}

export async function leaveRoom() {
  unsubs.splice(0).forEach(u => u());
  if (!me) return;
  const ref = me.ref;
  me = null;
  await D.onDisconnect(ref).cancel().catch(() => {});
  await D.remove(ref).catch(() => {});
}

export function watchRoom(code, cb) {
  const u = D.onValue(roomRef(code), s => cb(s.val()));
  unsubs.push(u);
  return u;
}

export const setTrack = (code, id) => D.set(roomRef(code, '/track'), id);
export const setState = (code, s) => D.set(roomRef(code, '/state'), s);
export const startCountdown = (code, ms = 4000) => D.update(roomRef(code), { state: 'countdown', startAt: serverNow() + ms });
export const heartbeat = code => D.set(roomRef(code, '/lastActive'), D.serverTimestamp());
export const claimHost = code => D.set(roomRef(code, '/host'), uid);

export function updateMe(fields) {
  if (!me) return Promise.resolve();
  for (const [k, v] of Object.entries(fields)) { if (v === null) delete me.data[k]; else me.data[k] = v; }
  return D.update(me.ref, fields).catch(() => {});
}
