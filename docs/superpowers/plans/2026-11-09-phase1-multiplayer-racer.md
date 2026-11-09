# Phase 1 Multiplayer Racer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser racing game on GitHub Pages where up to 8 friends join a room by 4-letter code and race built-in low-poly tracks head-to-head with non-colliding ghost cars.

**Architecture:** Static ES-module site with no build step. Each client simulates only its own car (Rapier raycast vehicle) and renders with Three.js. Firebase Realtime Database relays positions and room state. Pure logic (track layout, race rules, room helpers, interpolation) lives in files with no browser or library imports, so `node --test` can test it.

**Tech Stack:** Three.js 0.170.0 and @dimforge/rapier3d-compat 0.14.0 (both vendored); Firebase JS SDK 11.0.2 from gstatic; Node's built-in test runner; Firebase emulator for rules tests; GitHub Actions for Pages.

**Spec:** `docs/superpowers/specs/2026-11-09-multiplayer-racer-design.md`

## Global Constraints

- Hosting: GitHub Pages only. No server code.
- All libraries vendored in `vendor/`, except Firebase, which loads from `https://www.gstatic.com/firebasejs/11.0.2/`.
- No build step. `index.html` uses an import map: `"three": "./vendor/three.module.js"`.
- Up to 8 players per room. Keyboard only: arrows/WASD to drive, **R** to respawn.
- Room codes: 4 letters from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I, no O).
- Countdown: `startAt = server time + 4000 ms`. The race ends when all players have finished, or 60 000 ms after the first finisher.
- Position updates: about 15 Hz. Remote cars render 100 ms behind.
- Cleanup: the host refreshes `lastActive` every 30 000 ms. Rooms with `lastActive` older than 3 600 000 ms are stale.
- Pure modules (`game/track.js`, `game/pieces.js`, `game/race.js`, `game/loop.js`, `game/net/rooms.js`, `game/net/interp.js`) must not import `three`, Rapier or Firebase.
- All handling constants live in `game/handling.js`.
- Player names reach the DOM only via `textContent`, never `innerHTML`.

## Review Focus

1. **Backgrounded tab** (school laptops switch windows a lot). On return, the car must not teleport or explode from one huge physics step. `advance()` clamps frame time; tested in Task 2.
2. **Typing a lowercase or wrong room code.** Codes are uppercased. An unknown code shows "Room not found", and a room with 8 players shows "Room is full". `normalizeCode` is tested in Task 6; the messages are checked in Task 8.
3. **Bad nicknames** (empty, 200 characters, `<script>`). Names are trimmed, must be 1–16 characters, and render as text. `validateName` is tested in Task 6, and the rules reject longer names in Task 7.
4. **Joining while a race is running.** The player waits in the lobby list (no car) and is in the next race. Checked in Task 9.
5. **Two people creating the same code at the same time.** Only one wins, because the rules allow creating a room only if it doesn't exist. Tested in Task 7.

## File Structure

```
index.html            menu, lobby, HUD overlays, canvas; import map
style.css
probe.html            Task 0 school-network check
game/
  config.js           Firebase config object (pasted by the user)
  handling.js         every car tuning constant
  pieces.js           piece type definitions → local geometry (pure)
  track.js            validateTrack, layoutTrack (pure)
  race.js             checkpoint/finish/respawn rules (pure)
  loop.js             fixed-timestep accumulator (pure)
  render.js           Three.js scene, track meshes, chase camera, ghost cars
  physics.js          Rapier world, track colliders, car vehicle
  input.js            keyboard state
  hud.js              timer, countdown, results, messages
  main.js             boots the menu; runs solo and multiplayer sessions
  net/
    rooms.js          code generation, validation, host/end rules (pure)
    interp.js         snapshot buffer + interpolation (pure)
    firebase.js       Firebase calls: auth, rooms, presence, positions
tracks/
  index.json          [{ "id", "name" }]
  test.json, warmup.json, …
vendor/three.module.js, vendor/rapier.es.js
database.rules.json, firebase.json, package.json   (rules tests only)
tests/*.test.js, tests/rules/rules.test.js
.github/workflows/pages.yml
```

---

### Task 0: Vendor libraries and school-network probe

**Files:**
- Create: `vendor/three.module.js`, `vendor/rapier.es.js`, `game/config.js`, `probe.html`, `.gitignore`

**Interfaces:**
- Produces: `export const firebaseConfig = {…}` in `game/config.js`.

- [ ] **Step 1: Download the vendored libraries**

```bash
curl -fsSL -o vendor/three.module.js https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js
curl -fsSL -o vendor/rapier.es.js https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/rapier.es.js
```

- [ ] **Step 2: Verify that both load standalone**

Run: `node -e "import('./vendor/three.module.js').then(t=>console.log('three',t.REVISION))" && node -e "import('./vendor/rapier.es.js').then(async r=>{await r.default.init();console.log('rapier ok')})"`
Expected: `three 170` and `rapier ok`.

If `three.module.js` imports a sibling file (for example `three.core.js`), download that file into `vendor/` too and re-run.

- [ ] **Step 3: Ask the user to create a Firebase project** (manual, done by the user)

1. In console.firebase.google.com, create a project.
2. Add a Web app and copy its config object.
3. Turn on **Realtime Database** in locked mode.
4. Turn on **Authentication → Anonymous**.

The user pastes the config into `game/config.js` as `export const firebaseConfig = {…}`. Firebase web config is public by design, so it is committed.

- [ ] **Step 4: Write `probe.html`**

The page shows one PASS/FAIL line, with any error message, for each check:
1. A WebGL2 context can be created on a canvas.
2. `vendor/rapier.es.js` loads and `init()` resolves.
3. Firebase anonymous sign-in resolves.
4. A read of `.info/connected` returns `true` within 10 s.

- [ ] **Step 5: Serve locally and check**

Run: `python3 -m http.server 8000` and open `/probe.html`.
Expected: all four PASS.

- [ ] **Step 6: Commit and STOP for the school test**

```bash
git add vendor game/config.js probe.html .gitignore
git commit -m "feat: vendored libs and school-network probe"
```

The user publishes the site (Task 10's workflow can be pulled forward, or Pages can be pointed at the branch) and opens `probe.html` on a school computer. **Do not continue until all four checks pass there.** If Firebase fails, return to brainstorming.

---

### Task 1: Track format and layout

**Files:**
- Create: `game/pieces.js`, `game/track.js`, `tracks/test.json`
- Test: `tests/track.test.js`

**Interfaces:**
- Produces:
  - `CELL = 10`, `LEVEL = 2.5` (world units).
  - `PIECES: Record<type, { geometry(): { vertices: number[], indices: number[] }, kind: 'road'|'start'|'checkpoint'|'finish'|'gap' }>`
  - `validateTrack(json) -> string[]` (an empty array means valid).
  - `layoutTrack(track) -> Layout`.
- `Layout = { pieces: [{ type, pos:[x,y,z], rot }], start: Pose, checkpoints: Box[], finish: Box, bounds: Box, minY: number }`
- `Box = { min:[x,y,z], max:[x,y,z], pose: Pose }`, where `pose` is where you respawn for that box.
- `Pose = { pos:[x,y,z], yaw }`

**Coordinate rules:**
- A piece occupies the cell whose world center is `(x*CELL, y*LEVEL, z*CELL)`.
- `rot` is a quarter-turn count around +Y. With `rot` 0, the piece travels toward +z, so yaw = `rot * π/2`.
- **Checkpoint order is the order the checkpoint pieces appear in the `pieces` array.**

- [ ] **Step 1: Write the failing tests**

```js
test('valid minimal track has no errors')            // start, straight, finish → []
test('rejects zero or two starts')                    // errors mention "start"
test('rejects missing finish')
test('rejects unknown piece type')                    // error names the type
test('rejects non-integer coords and rot outside 0–3')
test('layout orders checkpoints by array order')      // two checkpoints, reversed in z → order follows the array
test('start pose sits above start cell facing rot')   // pos = [0, LEVEL*y + 1, 0], yaw = rot*π/2
test('bounds cover all pieces; minY is the lowest piece y*LEVEL')
test('every non-gap piece geometry has indices divisible by 3 and in range')
```

- [ ] **Step 2: Run them and check they fail**

Run: `node --test tests/track.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `pieces.js` and `track.js`**

Geometry is in local cell space before rotation, with a road slab 8 wide and 1 thick:
- `straight` / `start` / `checkpoint` / `finish`: a flat slab.
- `turn`: a quarter annulus, 8 segments, from entry −z to exit +x.
- `slope`: rises one LEVEL across the cell.
- `ramp-up`: a kicker that rises LEVEL/2 with an open end.
- `ramp-down`: a landing that falls LEVEL/2.
- `gap`: no geometry. It reserves the cell so it counts toward bounds.

The physics and render tasks rotate and translate the geometry. `track.js` only computes poses and boxes. Each box is the cell's square footprint, with a height of 6 units above the road.

- [ ] **Step 4: Run them and check they pass**

Run: `node --test tests/track.test.js`
Expected: PASS.

- [ ] **Step 5: Add `tracks/test.json`** (start, three straights, a turn, a checkpoint, a slope, finish), plus a test that it validates. Then commit.

```bash
git add game/pieces.js game/track.js tracks/test.json tests/track.test.js
git commit -m "feat: track format, piece geometry, layout"
```

---

### Task 2: Race rules and fixed-timestep loop

**Files:**
- Create: `game/race.js`, `game/loop.js`
- Test: `tests/race.test.js`, `tests/loop.test.js`

**Interfaces:**
- Consumes: `Layout`, `Box` and `Pose` from Task 1.
- Produces:
  - `createRace(layout) -> Race`, where `Race = { next: 0, respawn: Pose, finishedAt: null }`.
  - `updateRace(race, layout, carPos, tMs) -> 'checkpoint'|'finish'|null`. It mutates `race`.
  - `needsRespawn(layout, carPos) -> boolean`.
  - `STEP_MS = 1000/60`.
  - `advance(accMs, frameMs) -> { steps, acc }`.

- [ ] **Step 1: Write the failing tests**

```js
test('entering checkpoint 0 returns "checkpoint", sets next=1 and respawn=checkpoints[0].pose')
test('entering checkpoint 1 before 0 does nothing')
test('finish before all checkpoints does nothing')
test('finish after all checkpoints returns "finish" and sets finishedAt=tMs; later calls return null')
test('needsRespawn true when y < minY - 10')
test('needsRespawn true when x or z is more than 20 outside bounds')
test('needsRespawn false on the track')
test('advance(0, 50) -> 3 steps')                      // 50 / 16.67
test('advance clamps frame to 250 ms: advance(0, 10000).steps === 15')   // Review Focus 1
```

- [ ] **Step 2: Run them and check they fail**

Run: `node --test tests/race.test.js tests/loop.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement both modules.** A point counts as inside a box when it is within `min..max` on all three axes.

- [ ] **Step 4: Run them and check they pass**

Run: `node --test tests/race.test.js tests/loop.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add game/race.js game/loop.js tests/race.test.js tests/loop.test.js
git commit -m "feat: race rules and fixed-timestep loop"
```

---

### Task 3: Render a track in the browser

**Files:**
- Create: `index.html`, `style.css`, `game/render.js`, `game/main.js` (initial version)

**Interfaces:**
- Consumes: `layoutTrack` and `PIECES`.
- Produces:
  - `createRenderer(canvas) -> { scene, setTrack(layout), setCamera(pose), addGhost(id, name) -> ghost, removeGhost(id), render() }`
  - `ghost.setPose(pos:[x,y,z], quat:[x,y,z,w])`
- Original look: a sky gradient background and a directional sun with soft shadows. Road is light grey, with start/finish/checkpoint pieces tinted (start green, checkpoint amber, finish red-white checker texture drawn on a canvas). Use flat shading.

- [ ] **Step 1: Build `render.js`.** One mesh per piece: `PIECES[type].geometry()`, rotated by yaw and placed at the cell center. Make `index.html` with an import map, a full-window canvas, and `main.js` that loads `tracks/test.json` and orbits the camera around it.

- [ ] **Step 2: Check it in the browser**

Run: `python3 -m http.server 8000`, then open `/`.
Expected: the test track renders, pieces connect without visible seams, and the console shows no errors.

- [ ] **Step 3: Commit**

```bash
git add index.html style.css game/render.js game/main.js
git commit -m "feat: render track with three.js"
```

---

### Task 4: Solo driving and time trial

**Files:**
- Create: `game/physics.js`, `game/input.js`, `game/handling.js`, `game/hud.js`
- Modify: `game/main.js`, `index.html` (HUD elements)

**Interfaces:**
- Consumes: Tasks 1–3, `createRace`, `updateRace`, `needsRespawn`, `advance`.
- Produces:
  - `createPhysics(RAPIER, layout) -> { car, step() }`
  - `car.setControls({ throttle, steer, brake })` (values in −1..1)
  - `car.pose() -> { pos:[x,y,z], quat:[x,y,z,w] }`
  - `car.speed() -> number`
  - `car.teleport(Pose)` (zeroes velocity)
  - `createInput() -> { read() -> { throttle, steer, brake, respawn } }`. `respawn` is true once per R press.
  - `createHud() -> { setTime(ms), countdown(n|'GO'|null), results(rows|null), message(text|null) }`
  - `runSolo(layout) -> stop()` in `main.js`.

- [ ] **Step 1: Write `handling.js`.** It holds named constants: chassis size and mass, wheel positions, suspension rest length, stiffness and damping, friction slip, wheel radius, engine force, brake force, max steer angle, steer speed, and gravity. Start from Rapier's vehicle example values, then tune.

- [ ] **Step 2: Implement `physics.js`**
  - Track colliders are fixed trimesh colliders built from the same `PIECES` geometry, transformed exactly as in `render.js`. Share a `pieceTransform(piece)` helper in `pieces.js` so the two can't diverge.
  - The car is a dynamic cuboid chassis with `world.createVehicleController`, 4 wheels, and rear-wheel drive.

- [ ] **Step 3: Implement the solo loop**
  1. `advance(acc, frameMs)`.
  2. For each step: read input → `setControls` → `step()` → `updateRace` → if `needsRespawn` or `respawn` is pressed, `teleport(race.respawn)`.
  3. Then update the chase camera (behind and above, lerped) and `render()`.
  4. The HUD shows elapsed time. On `'finish'`, show the time and "Press Enter to retry".

  The race clock starts at the first frame after a 3-2-1 countdown, which uses the same `hud.countdown`.

- [ ] **Step 4: Check it in the browser**

Expected:
- the car drives, steers and lands jumps without falling through the road;
- R returns you to the last checkpoint, stopped;
- driving off the edge respawns you at the last checkpoint;
- reaching the finish only counts after all checkpoints;
- switching to another tab for 30 s and coming back does not fling the car.

- [ ] **Step 5: Commit**

```bash
git add game index.html
git commit -m "feat: solo driving and time trial"
```

---

### Task 5: Built-in tracks and solo track select

**Files:**
- Create: `tracks/index.json`, `tracks/warmup.json`, `tracks/loops.json`, `tracks/skyline.json`, `tracks/gauntlet.json`
- Modify: `index.html`, `game/main.js` (menu: nickname, Solo practice with a track list, Create / Join)
- Test: `tests/tracks.test.js`

**Interfaces:**
- Produces: `tracks/index.json` = `[{ "id": "warmup", "name": "Warmup" }, …]`. The file `tracks/<id>.json` must exist for every entry.

- [ ] **Step 1: Write the failing test.** For every entry in `index.json`, `validateTrack(track)` returns `[]` and the track has at least 1 checkpoint.

- [ ] **Step 2: Run it and check it fails**

Run: `node --test tests/tracks.test.js`
Expected: FAIL (no index).

- [ ] **Step 3: Write the four tracks:**
  - `warmup`: flat, gentle turns, 2 checkpoints.
  - `loops`: tight turns, height changes on slopes.
  - `skyline`: elevated track, falling off is easy.
  - `gauntlet`: ramp-up / gap / ramp-down jumps.

  Then add the menu.

- [ ] **Step 4: Run the test and check it passes, then drive each track to the finish**

Run: `node --test tests/tracks.test.js`
Expected: PASS, and every track can be finished in the browser.

- [ ] **Step 5: Commit**

```bash
git add tracks index.html game/main.js tests/tracks.test.js
git commit -m "feat: built-in tracks and solo menu"
```

---

### Task 6: Pure netcode helpers

**Files:**
- Create: `game/net/rooms.js`, `game/net/interp.js`
- Test: `tests/rooms.test.js`, `tests/interp.test.js`

**Interfaces:**
- Produces:
  - `CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'`, `MAX_PLAYERS = 8`, `STALE_MS = 3600000`, `END_GRACE_MS = 60000`
  - `makeRoomCode(rng = Math.random) -> string`
  - `normalizeCode(input) -> string|null`
  - `validateName(input) -> string|null` (trimmed; 1–16 characters)
  - `isStale(lastActive, now) -> boolean`
  - `nextHost(players) -> uid|null`
  - `raceOver(players, now) -> boolean`. `players` is the `{uid: {joinedAt, finishTime, raced}}` map; `finishTime` is server ms.
  - `createBuffer() -> { push(tMs, pos, quat), sample(tMs) -> { pos, quat }|null }`

- [ ] **Step 1: Write the failing tests**

```js
test('makeRoomCode is 4 chars from CODE_ALPHABET')            // run 1000 times
test('normalizeCode(" kxrt ") === "KXRT"; "KXR", "KX0T", "KXIT" → null')
test('validateName trims; "" and 17 chars → null; "<b>x</b>" is returned unchanged (escaping is the DOM's job)')
test('isStale: now - lastActive > STALE_MS only')
test('nextHost picks the earliest joinedAt; empty → null')
test('raceOver: false when nobody finished')
test('raceOver: true when every racer finished')
test('raceOver: true 60 s after first finish even if others have not')
test('raceOver ignores players with raced=false (joined mid-race)')
test('sample interpolates halfway between two snapshots')     // pos lerp; quat slerp
test('sample clamps to the latest snapshot when tMs is past it; null when empty')
test('buffer keeps at most 30 snapshots')
```

- [ ] **Step 2: Run them and check they fail**

Run: `node --test tests/rooms.test.js tests/interp.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement both modules.** Quaternion slerp is written by hand (about 15 lines), because pure modules can't import three.

- [ ] **Step 4: Run them and check they pass**

Run: `node --test tests/rooms.test.js tests/interp.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add game/net tests/rooms.test.js tests/interp.test.js
git commit -m "feat: room helpers and snapshot interpolation"
```

---

### Task 7: Firebase security rules

**Files:**
- Create: `database.rules.json`, `firebase.json` (emulator: database on port 9000), `package.json` (devDependencies: `firebase-tools`, `@firebase/rules-unit-testing`, `firebase`)
- Test: `tests/rules/rules.test.js`

**Interfaces:**
- Produces: rules that enforce the spec's data shape:

```
rooms/$code (code matches /^[A-HJ-NP-Z]{4}$/)
  host, track, state ∈ {lobby, countdown, racing}, startAt, lastActive
  players/$uid: name (1–16), joinedAt, checkpoint, finishTime|null, raced (bool), pos{x,y,z,qx,qy,qz,qw}
```

- **Create:** allowed only if `!data.exists()` and `newData.child('host').val() === auth.uid`.
- **Delete room:** allowed when `data.child('lastActive').val() < now - 3600000`.
- **Room fields:** writable only when `data.parent().child('host').val() === auth.uid`.
- **`host`:** writable by the current host, or by anyone when `players/<current host>` no longer exists. The new value must be an existing player.
- **`players/$uid`:** writable only when `auth.uid === $uid`.
- Unknown keys are rejected with `"$other": { ".validate": false }`.
- All reads require auth. `.indexOn: ["lastActive"]` is set on `rooms`.

- [ ] **Step 1: Write the failing tests** (use `@firebase/rules-unit-testing`, then call `assertSucceeds` or `assertFails`)

```js
test('unauthenticated read fails')
test('create room with self as host succeeds')
test('create over an existing room fails')                    // Review Focus 5
test('player writes own entry; writing another uid fails')
test('name of 17 chars fails')                                // Review Focus 3
test('non-host cannot change state/track/startAt')
test('host can change state')
test('delete fresh room fails; delete room with lastActive 2h ago succeeds')
test('non-host claims host while host present fails; after host entry removed succeeds')
test('unknown key under room fails')
```

- [ ] **Step 2: Run them and check they fail**

Run: `npm install && npx firebase emulators:exec --only database "node --test tests/rules"`
Expected: FAIL (no rules file → defaults). The emulator needs Java 11+. If it's missing, install it first: `sudo apt-get install -y openjdk-17-jre-headless`.

- [ ] **Step 3: Write `database.rules.json`**

- [ ] **Step 4: Run them and check they pass**

Run: same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Commit, then ask the user to publish the rules.** The user can paste the file into Firebase console → Realtime Database → Rules, or run `npx firebase deploy --only database`.

```bash
git add database.rules.json firebase.json package.json package-lock.json tests/rules
git commit -m "feat: firebase security rules with emulator tests"
```

---

### Task 8: Firebase client, lobby and countdown

**Files:**
- Create: `game/net/firebase.js`
- Modify: `game/main.js`, `index.html` (lobby screen: code, player list, host's track dropdown, Start button)

**Interfaces:**
- Consumes: `firebaseConfig` and `rooms.js`.
- Produces (all return Promises unless noted):
  - `connect() -> { uid }`
  - `serverNow() -> number` (sync; `Date.now() + .info/serverTimeOffset`)
  - `sweepStale()`
  - `createRoom(name) -> code`
  - `joinRoom(code, name) -> 'ok'|'not-found'|'full'`
  - `leaveRoom()`
  - `watchRoom(code, cb(room))` → unsubscribe (sync)
  - `setTrack(id)`
  - `startCountdown()`
  - `setState(s)`
  - `heartbeat()`
  - `claimHost(uid)`
  - `updateMe(fields)`

- [ ] **Step 1: Implement `firebase.js`**
  - `createRoom`:
    1. Call `sweepStale()`, a query `orderByChild('lastActive').endAt(serverNow() - STALE_MS)` that removes each match, with errors ignored.
    2. Try `makeRoomCode()` up to 5 times with `runTransaction`, aborting when the code exists.
    3. Write the host's player entry.
  - `joinRoom` uses `normalizeCode`, then a get. It returns `'not-found'` if the room is missing and `'full'` if it already has ≥ `MAX_PLAYERS` players.
  - Every write to the player's own entry also registers `onDisconnect(ref).remove()`.
  - `startCountdown` writes `{ state: 'countdown', startAt: serverNow() + 4000 }`.
  - **Host migration:** when a `watchRoom` update shows `players[room.host]` is missing, the client whose uid equals `nextHost(players)` calls `claimHost(uid)`.

- [ ] **Step 2: Build the lobby UI**
  - Menu: Create, or Join (code input with the message strip).
  - The lobby lists names via `textContent`.
  - The host gets a track dropdown from `tracks/index.json` and a Start button.
  - The host runs `heartbeat()` every 30 s.
  - If Firebase fails, the menu shows "Can't connect to multiplayer" and Solo still works.

- [ ] **Step 3: Add the countdown**
  - On `state === 'countdown'`, every client:
    1. loads the room's track;
    2. resets its own entry with `updateMe({ checkpoint: 0, finishTime: null, raced: true })`;
    3. shows 3-2-1-GO keyed off `startAt - serverNow()`.
  - The host sets `state: 'racing'` at `startAt`.

- [ ] **Step 4: Check it in two browser windows** (one normal, one private, so they get two anonymous uids)

Expected:
- create shows a code, and the join shows the same player list in both windows;
- a lowercase code works;
- `ZZZZ` → "Room not found";
- the countdown starts within ~100 ms in both windows;
- closing the host window makes the other window the host within ~5 s.

- [ ] **Step 5: Commit**

```bash
git add game index.html
git commit -m "feat: firebase rooms, lobby and countdown"
```

---

### Task 9: Multiplayer racing, ghosts and results

**Files:**
- Modify: `game/main.js`, `game/hud.js`, `game/render.js`

**Interfaces:**
- Consumes: Tasks 4, 6 and 8.
- Produces: `runMulti(roomCode)` in `main.js`.

- [ ] **Step 1: Wire up the race**
  - The solo loop runs with input locked until `startAt`.
  - Every 66 ms (~15 Hz) the client calls `updateMe({ pos })`.
  - On `'checkpoint'` → `updateMe({ checkpoint })`. On `'finish'` → `updateMe({ finishTime: serverNow() })`.

- [ ] **Step 2: Add ghosts**
  - For each other player with `raced: true`: `addGhost`, then push each position into a `createBuffer()` keyed by receive time.
  - Each frame: `ghost.setPose(buffer.sample(now - 100))`.
  - The name label is a sprite drawn from a canvas.
  - Ghosts are semi-transparent, with no colliders.
  - Remove the ghost when the player leaves.

- [ ] **Step 3: Add results and race end**
  - The HUD results table shows finish order, then `finishTime - startAt` formatted `m:ss.mmm`. Players who haven't finished show `—`.
  - The host checks `raceOver(players, serverNow())` every second. When it's true, the host keeps the results up for 10 s, then writes `state: 'lobby'`.
  - Players who join mid-race have `raced: false`. They wait in the lobby list and get no ghost (Review Focus 4).

- [ ] **Step 4: Check it in two windows**

Expected:
- both cars are visible to each other and move smoothly;
- falling off and pressing R work during a race;
- the results agree in both windows;
- the race ends 60 s after the first finish if the other player idles;
- a third window joining mid-race waits and then races next time;
- the database console shows `pos` updating at about 15 Hz.

- [ ] **Step 5: Commit**

```bash
git add game
git commit -m "feat: multiplayer racing with ghost cars and results"
```

---

### Task 10: Deploy to GitHub Pages

**Files:**
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Write the workflow.** It runs on push to `main`:
  1. `node --test tests/*.test.js`;
  2. `actions/upload-pages-artifact` of the repo root, excluding `tests`, `docs`, `node_modules` and `.github`;
  3. `actions/deploy-pages`.

  Use Node 22. Rules tests are not run in CI, because of the emulator and its Java dependency.

- [ ] **Step 2: Have the user enable Pages.** In repo Settings → Pages → Source, choose "GitHub Actions". Then push.

Expected: the Actions run is green, and the Pages URL serves the menu with a working Solo mode.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/pages.yml
git commit -m "ci: deploy to github pages"
```

---

## Done when

Friends on school computers open the Pages URL, create and join a room by code, race a built-in track together with visible ghost cars, and see matching results. Stale rooms disappear the next time anyone creates a room.
