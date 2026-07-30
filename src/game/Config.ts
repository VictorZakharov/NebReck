/** Central tuning knobs. Gameplay values live here, not scattered in systems. */
export const CONFIG = {
  player: {
    maxSpeed: 85,
    boostSpeed: 160,
    accel: 90,
    strafeAccel: 60,
    turnRate: 2.6,        // rad/s at full mouse deflection
    rollRate: 2.4,
    mouseSensitivity: 0.0021,
    hullMax: 100,
    shieldMax: 80,
    shieldRegenRate: 9,
    shieldRegenDelay: 3.5,
    boostEnergyMax: 100,
    boostDrain: 34,
    boostRegen: 18,
    radius: 2.2,
  },
  weapons: {
    energyMax: 100,
    energyRegen: 26,
  },
  world: {
    starCount: 7000,
    dustCount: 420,
    asteroidCount: 420,
    fieldRadius: 1700,   // rocks everywhere the fight roams, not just near spawn
  },
  camera: {
    fov: 70,
    boostFovKick: 4,       // kept small — widening FOV shrinks the ship
    followDistance: 8.2,   // idle: ship large, hugging the bottom of frame
    boostDistancePull: 0.22, // fraction of distance removed at full boost speed
    followHeight: 2.3,
    lookUpOffset: 1.5,     // raises the aim point → ship sits low in frame
    positionLag: 5.2,      // higher = snappier
    lookAhead: 40,
  },
  bloom: {
    intensity: 1.15,
    luminanceThreshold: 0.22,
    luminanceSmoothing: 0.32,
  },
} as const;
