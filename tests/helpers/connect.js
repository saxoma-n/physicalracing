// Test helper: where does each piece open? Returns world-space ends [{ x, z, h }] (h = null for gaps: air has no height).
import { PIECES, pieceTransform } from '../../game/pieces.js';

export function ends(piece) {
  const { pos, yaw } = pieceTransform(piece);
  const c = Math.round(Math.cos(yaw)), s = Math.round(Math.sin(yaw));
  return PIECES[piece.type].ends.map(([lx, lz, h]) => ({
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
