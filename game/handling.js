// Every car tuning number lives here. Units: metres, seconds, kilograms, newtons.
export const HANDLING = {
  gravity: -20,             // heavier than real for snappy, arcade landings
  chassis: { hx: 0.9, hy: 0.3, hz: 1.8, mass: 150 },
  linearDamping: 0.05,
  angularDamping: 0.8,
  wheels: [                 // chassis-space connection points; first two are front (steering)
    [-0.95, -0.1, 1.2], [0.95, -0.1, 1.2],
    [-0.95, -0.1, -1.2], [0.95, -0.1, -1.2],
  ],
  wheelRadius: 0.4,
  suspensionRest: 0.35,
  suspensionStiffness: 40,
  suspensionCompression: 4,
  suspensionRelaxation: 5,
  maxSuspensionTravel: 0.4,
  frictionSlip: 2.6,
  sideFrictionStiffness: 1.2,
  engineForce: 800,         // per driven (rear) wheel
  reverseForce: 200,
  brakeForce: 12,
  maxSpeed: 45,             // m/s; engine cuts above this
  maxSteer: 0.5,            // radians at low speed
  minSteer: 0.18,           // radians at max speed
  steerSpeed: 6,            // how fast the wheels turn toward the target, rad/s
};
