import { HANDLING as H } from './handling.js';
import { worldGeometry, PIECES } from './pieces.js';

const DT = 1 / 60;
const yawQuat = yaw => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });

export function createPhysics(RAPIER, layout) {
  const world = new RAPIER.World({ x: 0, y: H.gravity, z: 0 });
  world.timestep = DT;

  for (const piece of layout.pieces) {
    if (PIECES[piece.type].kind === 'gap') continue;
    const { vertices, indices } = worldGeometry(piece);
    world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(vertices), new Uint32Array(indices)).setFriction(0));
  }

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setLinearDamping(H.drag).setAngularDamping(H.angularDamping).setCanSleep(false).setCcdEnabled(true));
  const c = H.chassis, [ix, iy, iz] = c.inertia;
  // tyre grip comes from the wheel rays, so the body itself is frictionless: it glances off walls
  world.createCollider(RAPIER.ColliderDesc.cuboid(c.hx, c.hy, c.hz).setFriction(0)
    .setMassProperties(c.mass, { x: 0, y: c.comY, z: 0 }, { x: ix, y: iy, z: iz }, { x: 0, y: 0, z: 0, w: 1 }), body);
  // weightless bumper as wide as the wheels at centre-of-mass height: walls push the car sideways, not over
  const b = H.bumper;
  world.createCollider(RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(0, c.comY, 0).setFriction(0).setDensity(0), body);

  const vc = world.createVehicleController(body);
  vc.indexUpAxis = 1;
  vc.setIndexForwardAxis = 2; // rapier 0.14 exposes this as a property setter with a "set" name
  H.wheels.forEach(([x, y, z], i) => {
    vc.addWheel({ x, y, z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, H.suspensionRest, H.wheelRadius);
    vc.setWheelSuspensionStiffness(i, H.suspensionStiffness);
    vc.setWheelSuspensionCompression(i, H.suspensionCompression);
    vc.setWheelSuspensionRelaxation(i, H.suspensionRelaxation);
    vc.setWheelMaxSuspensionTravel(i, H.maxSuspensionTravel);
    vc.setWheelFrictionSlip(i, H.frictionSlip);
    vc.setWheelSideFrictionStiffness(i, H.sideFrictionStiffness);
  });

  let controls = { throttle: 0, steer: 0, brake: 0 };
  let steerAngle = 0;

  // signed speed along the car's nose (+z in chassis space)
  function speed() {
    const v = body.linvel(), q = body.rotation();
    const fx = 2 * (q.x * q.z + q.w * q.y), fy = 2 * (q.y * q.z - q.w * q.x), fz = 1 - 2 * (q.x * q.x + q.y * q.y);
    return v.x * fx + v.y * fy + v.z * fz;
  }

  const car = {
    setControls(c) { controls = c; },
    pose() {
      const t = body.translation(), q = body.rotation();
      return { pos: [t.x, t.y, t.z], quat: [q.x, q.y, q.z, q.w] };
    },
    speed,
    teleport({ pos, yaw }) {
      body.setTranslation({ x: pos[0], y: pos[1], z: pos[2] }, true);
      body.setRotation(yawQuat(yaw), true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      steerAngle = 0;
    },
  };

  function step() {
    const v = speed();
    const { throttle, steer, brake } = controls;
    let engine = v < H.maxSpeed ? throttle * H.engineForce : 0;
    let braking = brake * H.brakeForce;
    if (brake > 0 && throttle <= 0 && v < 0.5) { engine = -brake * H.reverseForce; braking = 0; } // reverse
    // full lock asks for a fixed cornering force, so the lock angle shrinks with speed²
    const maxSteer = Math.min(H.maxSteer, Math.atan(H.wheelbase * H.steerLateral / (v * v + 1e-6)));
    const target = steer * maxSteer, d = H.steerSpeed * DT;
    steerAngle += Math.max(-d, Math.min(d, target - steerAngle));

    for (let i = 0; i < 4; i++) {
      vc.setWheelSteering(i, i < 2 ? steerAngle : 0);
      vc.setWheelEngineForce(i, i < 2 ? 0 : engine);
      vc.setWheelBrake(i, braking);
    }
    vc.updateVehicle(DT);
    let grounded = false;
    for (let i = 0; i < 4; i++) grounded ||= vc.wheelIsInContact(i);
    body.setAngularDamping(grounded ? H.angularDamping : H.airAngularDamping);
    world.step();
  }

  return { car, step, free: () => world.free() };
}
