import { PIECES, CELL, pieceTransform } from './pieces.js';

const BOX_HEIGHT = 30; // tall enough to catch a car in mid-jump

export function validateTrack(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.pieces)) return ['track must be an object with a pieces array'];
  const errors = [];
  json.pieces.forEach((p, i) => {
    if (!p || !PIECES[p.type]) return errors.push(`piece ${i}: unknown type "${p?.type}"`);
    if (![p.x, p.y, p.z].every(Number.isInteger)) errors.push(`piece ${i}: x, y, z must be integers`);
    if (![0, 1, 2, 3].includes(p.rot)) errors.push(`piece ${i}: rot must be 0–3`);
  });
  const count = type => json.pieces.filter(p => p?.type === type).length;
  if (count('start') !== 1) errors.push(`track needs exactly one start (has ${count('start')})`);
  if (count('finish') !== 1) errors.push(`track needs exactly one finish (has ${count('finish')})`);
  return errors;
}

function poseOf(piece) {
  const { pos, yaw } = pieceTransform(piece);
  return { pos: [pos[0], pos[1] + 1, pos[2]], yaw };
}

function boxOf(piece) {
  const { pos } = pieceTransform(piece);
  return {
    min: [pos[0] - CELL / 2, pos[1] - 1, pos[2] - CELL / 2],
    max: [pos[0] + CELL / 2, pos[1] + BOX_HEIGHT, pos[2] + CELL / 2],
    pose: poseOf(piece),
  };
}

export function layoutTrack(track) {
  const pieces = track.pieces.map(p => ({ ...p, pos: pieceTransform(p).pos }));
  const boxes = track.pieces.map(boxOf);
  const bounds = {
    min: [0, 1, 2].map(k => Math.min(...boxes.map(b => b.min[k]))),
    max: [0, 1, 2].map(k => Math.max(...boxes.map(b => b.max[k]))),
  };
  const of = type => track.pieces.flatMap((p, i) => (p.type === type ? [boxes[i]] : []));
  return {
    pieces,
    start: of('start')[0].pose,
    checkpoints: of('checkpoint'),
    finish: of('finish')[0],
    bounds,
    minY: Math.min(...pieces.map(p => p.pos[1])),
  };
}
