import * as THREE from 'three';
import { PIECES, worldGeometry, pieceTransform } from './pieces.js';

const COLORS = {
  skyTop: '#4b9ee0', skyBottom: '#e4f3ff', ground: 0xbfd8c6,
  road: 0xd6dae2, start: 0x7fcf95, checkpoint: 0xf2be4a, finish: 0xd6dae2, post: 0x30384a,
};

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, COLORS.skyTop);
  grad.addColorStop(1, COLORS.skyBottom);
  g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 16;
  const g = c.getContext('2d');
  for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) {
    g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
    g.fillRect(x * 8, y * 8, 8, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const CAR_RED = 0x8a0f24;
const mat = color => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 });

// Start, checkpoint and finish get a gate so they read from a distance.
function gate(kind, checker) {
  const g = new THREE.Group();
  const postMat = mat(COLORS.post);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 1), postMat);
    post.position.set(side * 12.5, 5, 0);
    post.castShadow = true;
    g.add(post);
  }
  const bannerMat = kind === 'finish'
    ? new THREE.MeshStandardMaterial({ map: checker, flatShading: true })
    : mat(COLORS[kind]);
  const banner = new THREE.Mesh(new THREE.BoxGeometry(26, 2.2, 0.6), bannerMat);
  banner.position.set(0, 10, 0);
  banner.castShadow = true;
  g.add(banner);
  if (kind === 'finish') {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(22, 3), new THREE.MeshStandardMaterial({ map: checker }));
    strip.rotation.x = -Math.PI / 2;
    strip.position.y = 0.02;
    g.add(strip);
  }
  return g;
}

// Loft a six-sided (chamfered) body along +z. Section: [z, halfWidth, bottomY, shoulderY, topY, topHalfWidth].
function loft(sections) {
  const ring = ([z, w, yb, ys, yt, wt]) => [[-w * 0.75, yb], [w * 0.75, yb], [w, ys], [wt, yt], [-wt, yt], [-w, ys]].map(([x, y]) => [x, y, z]);
  const rings = sections.map(ring), n = 6, pos = [], idx = [];
  rings.forEach(r => r.forEach(p => pos.push(...p)));
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let k = 0; k < n; k++) {
      const a = i * n + k, b = i * n + (k + 1) % n, c = (i + 1) * n + (k + 1) % n, d = (i + 1) * n + k;
      idx.push(a, b, c, a, c, d);
    }
  }
  const last = (rings.length - 1) * n;
  for (let k = 1; k + 1 < n; k++) idx.push(0, k + 1, k, last, last + k, last + k + 1); // end caps
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

const box = (w, h, d, material, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
};

const RIDE_HEIGHT = 0.738; // measured: chassis centre sits this far above the road at rest

// Low-poly open-wheel racer. Model space: ground at y = 0, nose toward +z.
export function makeCarMesh(color = CAR_RED) {
  const outer = new THREE.Group(), car = new THREE.Group();
  car.position.y = -RIDE_HEIGHT;
  outer.add(car);
  const paint = mat(color), dark = mat(0x16181d), black = mat(0x050507), rimMat = mat(0xc9cdd3);
  paint.userData.paint = true;

  // main body with side pods
  car.add(new THREE.Mesh(loft([
    [-1.65, 0.26, 0.22, 0.5, 0.66, 0.16],
    [-1.2, 0.36, 0.16, 0.56, 0.78, 0.24],
    [-0.75, 0.7, 0.15, 0.52, 0.72, 0.48],
    [0.25, 0.7, 0.15, 0.52, 0.72, 0.48],
    [0.55, 0.36, 0.17, 0.5, 0.68, 0.26],
    [1.3, 0.3, 0.2, 0.42, 0.52, 0.2],
    [2.0, 0.24, 0.2, 0.32, 0.38, 0.16],
  ]), paint));
  // raised centre: cockpit surround and engine cover
  car.add(new THREE.Mesh(loft([
    [-1.35, 0.16, 0.55, 0.72, 0.82, 0.1],
    [-0.9, 0.34, 0.55, 0.84, 0.98, 0.22],
    [0.1, 0.34, 0.55, 0.84, 0.96, 0.22],
    [0.6, 0.24, 0.55, 0.7, 0.74, 0.16],
  ]), paint));

  car.add(box(0.36, 0.06, 0.42, black, 0, 0.95, 0.2));             // cockpit opening
  for (const s of [-1, 1]) {
    const intake = box(0.42, 0.3, 0.04, black, s * 0.53, 0.38, 0.41); // side pod intakes, on the angled pod fronts
    intake.rotation.y = s * 0.694;
    car.add(intake);
    car.add(box(0.04, 0.18, 0.36, paint, s * 0.7, 0.24, 1.98));     // front wing endplates
    car.add(box(0.04, 0.38, 0.5, paint, s * 0.8, 0.98, -1.62));      // rear wing endplates
    car.add(box(0.05, 0.3, 0.14, dark, s * 0.2, 0.9, -1.55));        // rear wing pylons
  }
  car.add(box(1.4, 0.05, 0.36, paint, 0, 0.18, 1.98));              // front wing
  car.add(box(1.6, 0.06, 0.46, paint, 0, 1.1, -1.62));              // rear wing

  // axles + wheels (positions match the physics wheels)
  const axle = new THREE.CylinderGeometry(0.045, 0.045, 1.9, 6).rotateZ(Math.PI / 2);
  for (const [z, r, w] of [[1.2, 0.43, 0.34], [-1.2, 0.48, 0.42]]) {
    const a = new THREE.Mesh(axle, dark);
    a.position.set(0, r, z);
    car.add(a);
    for (const s of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.position.set(s * 0.95, r, z);
      wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2), mat(0x1b1c20)));
      const face = s * (w / 2 + 0.006);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.66, r * 0.66, 0.012, 14).rotateZ(Math.PI / 2), mat(0x2a2d33));
      disc.position.x = face;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.64, 0.035, 4, 14).rotateY(Math.PI / 2), rimMat);
      rim.position.x = face;
      wheel.add(disc, rim);
      for (let k = 0; k < 5; k++) {
        const spoke = box(0.02, r * 1.25, 0.1, rimMat, face + s * 0.004, 0, 0);
        spoke.rotation.x = (k * Math.PI * 2) / 5;
        wheel.add(spoke);
      }
      car.add(wheel);
    }
  }
  car.traverse(o => { o.castShadow = true; });
  return outer;
}

function setPaint(car, color) {
  car.traverse(o => { if (o.isMesh && o.material.userData.paint) o.material.color.setHex(color); });
}

function nameLabel(name) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.6)'; g.strokeText(name, 128, 32);
  g.fillStyle = '#fff'; g.fillText(name, 128, 32);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.set(4, 1, 1);
  s.position.y = 2.2;
  return s;
}

function poseSetter(obj) {
  return (pos, quat) => { obj.position.fromArray(pos); obj.quaternion.fromArray(quat); };
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(COLORS.skyBottom, 900, 6000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8aa39a, 1.4));

  const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 300 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 9000);
  const checker = checkerTexture();
  const trackGroup = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000), mat(COLORS.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(trackGroup, ground);

  const player = makeCarMesh();
  player.visible = false;
  scene.add(player);
  const ghosts = new Map();

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  return {
    scene,
    setTrack(layout) {
      trackGroup.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      trackGroup.clear();
      // one mesh per colour, not per piece: big tracks have hundreds of pieces
      const byKind = {};
      for (const piece of layout.pieces) {
        const { kind } = PIECES[piece.type];
        if (kind === 'gap') continue;
        const { vertices, indices } = worldGeometry(piece);
        const m = (byKind[kind] ??= { vertices: [], indices: [] }), base = m.vertices.length / 3;
        for (const v of vertices) m.vertices.push(v);
        for (const i of indices) m.indices.push(base + i);
        if (kind !== 'road') {
          const { pos, yaw } = pieceTransform(piece);
          const g = gate(kind, checker);
          g.position.fromArray(pos);
          g.rotation.y = yaw;
          trackGroup.add(g);
        }
      }
      for (const [kind, { vertices, indices }] of Object.entries(byKind)) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setIndex(indices);
        const mesh = new THREE.Mesh(geo, mat(COLORS[kind] ?? COLORS.road));
        mesh.receiveShadow = mesh.castShadow = true;
        trackGroup.add(mesh);
      }
      ground.position.y = layout.minY - 40;
    },
    setCamera(pos, target, fov = 70) {
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.position.fromArray(pos);
      camera.lookAt(target[0], target[1], target[2]);
      // keep the shadow area centered on what we look at
      sun.target.position.fromArray(target);
      sun.position.set(target[0] + 60, target[1] + 120, target[2] + 40);
    },
    player: { setPose: poseSetter(player), show: v => { player.visible = v; }, setColor: c => setPaint(player, c) },
    addGhost(id, name, color) {
      const car = makeCarMesh(color);
      car.traverse(o => {
        if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; o.castShadow = false; }
      });
      car.add(nameLabel(name));
      scene.add(car);
      ghosts.set(id, car);
      return { setPose: poseSetter(car) };
    },
    removeGhost(id) {
      const car = ghosts.get(id);
      if (car) { scene.remove(car); ghosts.delete(id); }
    },
    render() {
      resize();
      renderer.render(scene, camera);
    },
  };
}
