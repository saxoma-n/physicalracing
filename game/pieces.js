// Track pieces: one definition per type gives the geometry used by BOTH rendering and physics.
// Local space: centered on the piece's anchor cell, travel toward +z (entry at z = -CELL/2),
// road top at y = 0 on entry. Big turns reach beyond their anchor cell.

export const CELL = 40;       // sized for cars that pass 600 km/h
export const LEVEL = 5;
export const ROAD_HALF = 12;  // total width including walls
const THICK = 1;
const WALL_W = 1, WALL_H = 1.2;

// One box-section rail along centerline sections [{ x, z, y, dx, dz }] (d = unit travel direction),
// shifted `off` to the left of travel, with its top `top` above the road surface.
function rail(sections, off, halfW, top, thick) {
  const vertices = [], indices = [];
  for (const { x, z, y, dx, dz } of sections) {
    const lx = -dz, lz = dx; // left of travel
    const cx = x + lx * off, cz = z + lz * off, t = y + top;
    vertices.push(
      cx + lx * halfW, t, cz + lz * halfW,          // 0 top-left
      cx - lx * halfW, t, cz - lz * halfW,          // 1 top-right
      cx - lx * halfW, t - thick, cz - lz * halfW,  // 2 bottom-right
      cx + lx * halfW, t - thick, cz + lz * halfW,  // 3 bottom-left
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
  quad(0, 1, 2, 3);             // entry cap
  quad(e, e + 3, e + 2, e + 1); // exit cap
  return { vertices, indices };
}

function merge(parts) {
  const vertices = [], indices = [];
  for (const p of parts) {
    const base = vertices.length / 3;
    vertices.push(...p.vertices);
    for (const i of p.indices) indices.push(base + i);
  }
  return { vertices, indices };
}

// Road with a low wall along each edge.
function road(sections) {
  const wallOff = ROAD_HALF - WALL_W / 2;
  return merge([
    rail(sections, 0, ROAD_HALF - WALL_W, 0, THICK),
    rail(sections, wallOff, WALL_W / 2, WALL_H, WALL_H + THICK),
    rail(sections, -wallOff, WALL_W / 2, WALL_H, WALL_H + THICK),
  ]);
}

const H = CELL / 2;
const smooth = t => t * t * (3 - 2 * t);

// Straight-line piece whose height follows profile(t), t = 0..1 along the cell.
function line(profile, kind = 'road') {
  const SEG = profile(0.5) === profile(0) && profile(1) === profile(0) ? 1 : 10;
  const geometry = () => road(Array.from({ length: SEG + 1 }, (_, i) =>
    ({ x: 0, z: -H + (i / SEG) * CELL, y: profile(i / SEG), dx: 0, dz: 1 })));
  return { kind, geometry, profile, ends: [[0, -H, profile(0)], [0, H, profile(1)]] };
}

// Quarter turn to the left spanning `span` cells each way: enters heading +z at (0, -H),
// exits heading +x. Centerline radius is (span - 0.5) cells.
function turn(span) {
  const R = (span - 0.5) * CELL, SEG = Math.max(8, Math.ceil((Math.PI / 2) * R / 8));
  const geometry = () => road(Array.from({ length: SEG + 1 }, (_, i) => {
    const a = Math.PI - (i / SEG) * (Math.PI / 2);
    return { x: R + R * Math.cos(a), z: -H + R * Math.sin(a), y: 0, dx: Math.sin(a), dz: -Math.cos(a) };
  }));
  return { kind: 'road', geometry, radius: R, ends: [[0, -H, 0], [R, (span - 1) * CELL, 0]] };
}

const flat = () => 0;
export const PIECES = {
  start:       line(flat, 'start'),
  finish:      line(flat, 'finish'),
  checkpoint:  line(flat, 'checkpoint'),
  straight:    line(flat),
  turn:        turn(1),   // 20 m radius: a hairpin at these speeds
  'turn-m':    turn(3),   // 100 m
  'turn-l':    turn(7),   // 260 m sweeper
  slope:       line(t => LEVEL * smooth(t)),
  'ramp-up':   line(t => (LEVEL / 2) * t * t),             // kicks up at the lip
  'ramp-down': line(t => (LEVEL / 2) * (1 - t) * (1 - t)), // mirror: catches a landing
  gap:         { kind: 'gap', geometry: () => ({ vertices: [], indices: [] }), ends: [[0, -H, null], [0, H, null]] },
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
