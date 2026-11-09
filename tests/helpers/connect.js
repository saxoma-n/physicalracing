// Test helper: where does each piece open? Returns world-space ends [{ x, z, h }] (h = null for gaps: air has no height).
import { CELL, LEVEL, pieceTransform } from '../../game/pieces.js';

const H = CELL / 2;
const LOCAL_ENDS = {
  turn: [[0, -H, 0], [H, 0, 0]],
  slope: [[0, -H, 0], [0, H, LEVEL]],
  'ramp-up': [[0, -H, 0], [0, H, LEVEL / 2]],
  'ramp-down': [[0, -H, LEVEL / 2], [0, H, 0]],
  gap: [[0, -H, null], [0, H, null]],
};

export function ends(piece) {
  const { pos, yaw } = pieceTransform(piece);
  const c = Math.round(Math.cos(yaw)), s = Math.round(Math.sin(yaw));
  return (LOCAL_ENDS[piece.type] ?? [[0, -H, 0], [0, H, 0]]).map(([lx, lz, h]) => ({
    x: pos[0] + lx * c + lz * s, z: pos[2] - lx * s + lz * c, h: h === null ? null : pos[1] + h,
  }));
}

const meet = (a, b) => a.x === b.x && a.z === b.z && (a.h === null || b.h === null || Math.abs(a.h - b.h) < 1e-9);

// Indices i where pieces[i] and pieces[i+1] share no end.
export function breaks(track) {
  const out = [];
  for (let i = 0; i + 1 < track.pieces.length; i++) {
    const A = ends(track.pieces[i]), B = ends(track.pieces[i + 1]);
    if (!A.some(a => B.some(b => meet(a, b)))) out.push(i);
  }
  return out;
}
