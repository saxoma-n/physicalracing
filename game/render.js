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

const mat = color => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 });

// Start, checkpoint and finish get a gate so they read from a distance.
function gate(kind, checker) {
  const g = new THREE.Group();
  const postMat = mat(COLORS.post);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.5), postMat);
    post.position.set(side * 4.6, 2.5, 0);
    post.castShadow = true;
    g.add(post);
  }
  const bannerMat = kind === 'finish'
    ? new THREE.MeshStandardMaterial({ map: checker, flatShading: true })
    : mat(COLORS[kind]);
  const banner = new THREE.Mesh(new THREE.BoxGeometry(9.7, 1.1, 0.3), bannerMat);
  banner.position.set(0, 5, 0);
  banner.castShadow = true;
  g.add(banner);
  if (kind === 'finish') {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5), new THREE.MeshStandardMaterial({ map: checker }));
    strip.rotation.x = -Math.PI / 2;
    strip.position.y = 0.02;
    g.add(strip);
  }
  return g;
}

export function makeCarMesh(color = 0xe8553d) {
  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 3.6), mat(color));
  body.position.y = 0.15;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 1.6), mat(0x2b3245));
  cabin.position.set(0, 0.62, -0.25);
  const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.35, 10).rotateZ(Math.PI / 2);
  const wheelMat = mat(0x1d1f26);
  for (const [x, z] of [[-0.95, 1.2], [0.95, 1.2], [-0.95, -1.2], [0.95, -1.2]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, -0.1, z);
    car.add(w);
  }
  car.add(body, cabin);
  car.traverse(o => { o.castShadow = true; });
  return car;
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
  scene.fog = new THREE.Fog(COLORS.skyBottom, 180, 650);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8aa39a, 1.4));

  const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 300 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1200);
  const checker = checkerTexture();
  const trackGroup = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), mat(COLORS.ground));
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
      for (const piece of layout.pieces) {
        const { kind } = PIECES[piece.type];
        if (kind === 'gap') continue;
        const { vertices, indices } = worldGeometry(piece);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setIndex(indices);
        const mesh = new THREE.Mesh(geo, mat(COLORS[kind] ?? COLORS.road));
        mesh.receiveShadow = mesh.castShadow = true;
        trackGroup.add(mesh);
        if (kind !== 'road') {
          const { pos, yaw } = pieceTransform(piece);
          const g = gate(kind, checker);
          g.position.fromArray(pos);
          g.rotation.y = yaw;
          trackGroup.add(g);
        }
      }
      ground.position.y = layout.minY - 40;
    },
    setCamera(pos, target) {
      camera.position.fromArray(pos);
      camera.lookAt(target[0], target[1], target[2]);
      // keep the shadow area centered on what we look at
      sun.target.position.fromArray(target);
      sun.position.set(target[0] + 60, target[1] + 120, target[2] + 40);
    },
    player: { setPose: poseSetter(player), show: v => { player.visible = v; } },
    addGhost(id, name) {
      const car = makeCarMesh(0x4c7bd9);
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
