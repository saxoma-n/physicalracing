// Writes the built-in tracks. Run: node tools/gen-tracks.mjs   (then npm test: an autopilot drives each one)
// A track is a list of moves from the start line:
//   S straight · C checkpoint · U slope up · D slope down · J jump (ramp, gap, landing) · F finish
//   L1 L3 L7 / R1 R3 R7  left / right turns of 20 m, 100 m and 260 m radius
//   "S*12" repeats a move.
import { writeFileSync } from 'node:fs';
import { PIECES, CELL, LEVEL } from '../game/pieces.js';

const TRACKS = {
  Warmup:   'S*8 L7 S*6 C R7 S*10 R3 S*5 C L3 S*8 F',
  Loops:    'S*5 L3 S*3 R1 S*3 C U S*6 L1 S*4 R3 S*5 D S*6 C L3 S*6 R1 S*5 F',
  Skyline:  'S*6 U S*4 U S*5 C L7 S*5 U S*8 R3 S*6 C D S*8 D S*6 L3 S*6 F',
  Gauntlet: 'S*130 C S*30 L7 S*8 J S*14 C R7 S*10 J S*16 R3 S*6 F',
};

const DIR = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // heading 0..3 = +z, +x, -z, -x
const rot = (q, [x, z]) => [[x, z], [z, -x], [-x, -z], [-z, x]][q];
const TURNS = { 1: 'turn', 3: 'turn-m', 7: 'turn-l' };

function build(name, moves) {
  const pieces = [];
  let e = [0, -CELL / 2], h = 0, d = 0; // entry edge point (x, z), height, heading
  // Place a piece entered at ends[from]; the car leaves by the other end.
  function put(type, from = 0) {
    const [a, b] = from === 0 ? PIECES[type].ends : [...PIECES[type].ends].reverse();
    const isTurn = type.startsWith('turn');
    const q = from === 0 ? d : (d + (isTurn ? 1 : 2)) % 4;
    const [ox, oz] = rot(q, [a[0], a[1]]);
    const x = (e[0] - ox) / CELL, z = (e[1] - oz) / CELL, y = (h - (a[2] ?? 0)) / LEVEL;
    if (![x, y, z].every(Number.isInteger)) throw new Error(`${name}: ${type} does not land on the grid`);
    pieces.push({ type, x, y, z, rot: q });
    const [px, pz] = rot(q, [b[0], b[1]]);
    e = [x * CELL + px, z * CELL + pz];
    h = y * LEVEL + (b[2] ?? (a[2] ?? 0));
    if (isTurn) d = (d + (from === 0 ? 1 : 3)) % 4;
  }
  put('start');
  for (const token of moves.split(/\s+/)) {
    const [move, n = 1] = token.split('*');
    for (let i = 0; i < n; i++) {
      if (move === 'S') put('straight');
      else if (move === 'C') put('checkpoint');
      else if (move === 'F') put('finish');
      else if (move === 'U') put('slope');
      else if (move === 'D') put('slope', 1);
      else if (move === 'J') { const h0 = h; put('ramp-up'); h = h0; put('gap'); h = h0 + LEVEL / 2; put('ramp-down'); } // gap sits at road level
      else if (/^[LR][137]$/.test(move)) put(TURNS[move[1]], move[0] === 'L' ? 0 : 1);
      else throw new Error(`${name}: unknown move ${token}`);
    }
  }
  const json = `{ "name": ${JSON.stringify(name)}, "pieces": [\n${pieces.map(p => '  ' + JSON.stringify(p)).join(',\n')}\n]}\n`;
  writeFileSync(new URL(`../tracks/${name.toLowerCase()}.json`, import.meta.url), json);
  console.log(`${name}: ${pieces.length} pieces`);
}

for (const [name, moves] of Object.entries(TRACKS)) build(name, moves);
