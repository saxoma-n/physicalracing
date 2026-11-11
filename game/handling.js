// Every car tuning number lives here. Units: metres, seconds, kilograms, newtons.
// Values are fitted to speedometer/timer readings from two reference gameplay clips:
//   thrust ≈ 19 m/s² at any speed, drag ≈ 0.1 × speed (same on the ground and in the air),
//   150 → 0 km/h in ~0.63 s under brakes, no visible squat or dive, level flight over jumps.
export const HANDLING = {
  gravity: -20,             // heavier than real for snappy, arcade landings (not measurable from the clips)
  chassis: {
    hx: 0.9, hy: 0.3, hz: 1.8, mass: 150,
    comY: -0.45,            // centre of mass near axle height: keeps the body flat under 2 g launches and 6 g stops
    inertia: [166, 202, 45],
  },
  bumper: { hx: 1.18, hy: 0.12, hz: 2.05 },
  drag: 0.0977,             // per second, × speed. Thrust/drag balance at 700 km/h; the engine stops pushing at maxSpeed
  angularDamping: 0.8,
  airAngularDamping: 3,     // no wheels on the road: hold attitude instead of tumbling
  wheels: [                 // chassis-space connection points; first two are front (steering)
    [-0.95, -0.1, 1.2], [0.95, -0.1, 1.2],
    [-0.95, -0.1, -1.2], [0.95, -0.1, -1.2],
  ],
  wheelbase: 2.4,
  wheelRadius: 0.4,
  suspensionRest: 0.35,
  suspensionStiffness: 60,
  suspensionCompression: 7,
  suspensionRelaxation: 9,
  maxSuspensionTravel: 0.4,
  frictionSlip: 3.5,        // tyre grip as a multiple of wheel load: needed for the 6.5 g stops
  sideFrictionStiffness: 1.2, // front tyres
  rearSideFriction: 0.8,      // rear tyres: a little softer than the fronts so the tail rotates into corners.
                              // At 0.5 the car spins after jumps and under quick steering (autopilot tests fail)
  engineForce: 1425,        // per driven (rear) wheel: 2 × 1425 N / 150 kg = 19 m/s²
  reverseForce: 300,
  brakeForce: 41,           // per wheel, impulse per step: 4 × 41 × 60 / 150 kg ≈ 65 m/s²
  maxSpeed: 677 / 3.6,      // m/s
  maxSteer: 0.5,            // radians, parking speeds
  steerLateral: 50,         // m/s² of cornering that full lock asks for; lock shrinks with speed² to hold this
  steerSpeed: 6,            // how fast the wheels turn toward the target, rad/s
};
