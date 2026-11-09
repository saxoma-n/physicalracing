// Track pieces: one definition per type gives the geometry used by BOTH rendering and physics.
// Local cell space: centered on the cell, travel toward +z (entry z = -CELL/2, exit z = +CELL/2),
// road top at y = 0 on entry.

export const CELL = 10;
export const LEVEL = 2.5;
const HALF_W = 4;     // road is 8 wide
const THICK = 1;

// Extrude a road slab along centerline sections [{ x, z, y, dx, dz }] (d = unit travel direction).
function slab(sections) {
  const vertices = [], indices = [];
  for (const { x, z, y, dx, dz } of sections) {
    const nx = -dz * HALF_W, nz = dx * HALF_W; // left of travel
    vertices.push(
      x + nx, y, z + nz,           // 0 top-left
      x - nx, y, z - nz,           // 1 top-right
      x - nx, y - THICK, z - nz,   // 2 bottom-right
      x + nx, y - THICK, z + nz,   // 3 bottom-left
    );
  }
  const quad = (a, b, c, d) => indices.push(a, b, c, a, c, d);
  for (let i = 0; i + 1 < sections.length; i++) {
    const s = i * 4, t = s + 4;
    quad(s, t, t + 1, s + 1);         // top
    quad(s + 3, s + 2, t + 2, t + 3); // bottom
    quad(s, s + 3, t + 3, t);         // left side
    quad(s + 1, t + 1, t + 2, s + 2); // right side
  }
  const e = (sections.length - 1) * 4;
  quad(0, 1, 2, 3);          // entry cap
  quad(e, e + 3, e + 2, e + 1); // exit cap
  return { vertices, indices };
}

const H = CELL / 2;
const line = (y0, y1) => () => slab([
  { x: 0, z: -H, y: y0, dx: 0, dz: 1 },
  { x: 0, z: H, y: y1, dx: 0, dz: 1 },
]);

// Quarter turn: enters heading +z at (0, -H), exits heading +x at (H, 0); arc centered on (H, -H).
function turn() {
  const SEG = 8, sections = [];
  for (let i = 0; i <= SEG; i++) {
    const a = Math.PI - (i / SEG) * (Math.PI / 2);
    sections.push({ x: H + H * Math.cos(a), z: -H + H * Math.sin(a), y: 0, dx: Math.sin(a), dz: -Math.cos(a) });
  }
  return slab(sections);
}

const flat = line(0, 0);
export const PIECES = {
  start:       { kind: 'start', geometry: flat },
  finish:      { kind: 'finish', geometry: flat },
  checkpoint:  { kind: 'checkpoint', geometry: flat },
  straight:    { kind: 'road', geometry: flat },
  turn:        { kind: 'road', geometry: turn },
  slope:       { kind: 'road', geometry: line(0, LEVEL) },
  'ramp-up':   { kind: 'road', geometry: line(0, LEVEL / 2) },
  'ramp-down': { kind: 'road', geometry: line(LEVEL / 2, 0) },
  gap:         { kind: 'gap', geometry: () => ({ vertices: [], indices: [] }) },
};

export function pieceTransform({ x, y, z, rot }) {
  return { pos: [x * CELL, y * LEVEL, z * CELL], yaw: rot * Math.PI / 2 };
}

// Geometry of a placed piece in world space (rotation about +Y, then translation).
export function worldGeometry(piece) {
  const { vertices, indices } = PIECES[piece.type].geometry();
  const { pos, yaw } = pieceTransform(piece);
  const c = Math.cos(yaw), s = Math.sin(yaw), out = new Array(vertices.length);
  for (let i = 0; i < vertices.length; i += 3) {
    const lx = vertices[i], ly = vertices[i + 1], lz = vertices[i + 2];
    out[i] = pos[0] + lx * c + lz * s;
    out[i + 1] = pos[1] + ly;
    out[i + 2] = pos[2] - lx * s + lz * c;
  }
  return { vertices: out, indices };
}
