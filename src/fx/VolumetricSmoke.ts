import {
  BufferAttribute,
  BufferGeometry,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { Rng } from '../core/Rng';
import { getSmokeTexture } from './textures';

export type SmokeCloudKind = 'missile' | 'ship' | 'capital';

const TAU = Math.PI * 2;
const smokeDirection = new Vector3();

interface SmokeProfile {
  count: number;
  delay: number;
  lifeMin: number;
  lifeMax: number;
  spread: number;
  speedMin: number;
  speedMax: number;
  sizeMin: number;
  sizeMax: number;
  growthMin: number;
  growthMax: number;
  opacity: number;
}

const PROFILES: Readonly<Record<SmokeCloudKind, SmokeProfile>> = {
  missile: {
    count: 20,
    delay: 0.34,
    lifeMin: 2.4,
    lifeMax: 3.8,
    spread: 5.5,
    speedMin: 3.5,
    speedMax: 11,
    sizeMin: 2,
    sizeMax: 3.6,
    growthMin: 5,
    growthMax: 10,
    opacity: 0.22,
  },
  ship: {
    count: 42,
    delay: 0.75,
    lifeMin: 4.2,
    lifeMax: 7.2,
    spread: 14,
    speedMin: 4,
    speedMax: 13,
    sizeMin: 3,
    sizeMax: 5.2,
    growthMin: 8,
    growthMax: 15,
    opacity: 0.24,
  },
  capital: {
    count: 96,
    delay: 1.4,
    lifeMin: 6.5,
    lifeMax: 10.5,
    spread: 28,
    speedMin: 5,
    speedMax: 17,
    sizeMin: 4.8,
    sizeMax: 8,
    growthMin: 15,
    growthMax: 28,
    opacity: 0.28,
  },
};

/**
 * One draw-call, ring-buffered cloud of layered smoke puffs. Every puff lives
 * at a different point in 3D, expands, curls, cools from flame to soot, and
 * dissolves through an irregular procedural alpha map. The overlap reads as a
 * volume while keeping dense combat bounded and allocation-free per frame.
 */
export class VolumetricSmoke {
  readonly points: Points;
  readonly capacity: number;

  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly opacities: Float32Array;
  private readonly angles: Float32Array;
  private readonly velocities: Float32Array;
  private readonly ages: Float32Array;
  private readonly lifetimes: Float32Array;
  private readonly startSizes: Float32Array;
  private readonly growth: Float32Array;
  private readonly spin: Float32Array;
  private readonly heat: Float32Array;
  private readonly seed: Float32Array;
  private readonly peakOpacity: Float32Array;
  private readonly geometry: BufferGeometry;
  private cursor = 0;
  private liveCount = 0;

  constructor(capacity = 512) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.opacities = new Float32Array(capacity);
    this.angles = new Float32Array(capacity);
    this.velocities = new Float32Array(capacity * 3);
    this.ages = new Float32Array(capacity);
    this.lifetimes = new Float32Array(capacity);
    this.startSizes = new Float32Array(capacity);
    this.growth = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.heat = new Float32Array(capacity);
    this.seed = new Float32Array(capacity);
    this.peakOpacity = new Float32Array(capacity);

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aColor', new BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('aSize', new BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('aOpacity', new BufferAttribute(this.opacities, 1));
    this.geometry.setAttribute('aAngle', new BufferAttribute(this.angles, 1));

    const material = new ShaderMaterial({
      uniforms: { uMap: { value: getSmokeTexture() } },
      blending: NormalBlending,
      depthWrite: false,
      transparent: true,
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aOpacity;
        attribute float aAngle;
        varying vec3 vColor;
        varying float vOpacity;
        varying float vAngle;
        void main() {
          vColor = aColor;
          vOpacity = aOpacity;
          vAngle = aAngle;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * (900.0 / max(1.0, -mv.z)), 0.0, 220.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vOpacity;
        varying float vAngle;
        void main() {
          if (vOpacity <= 0.001) discard;
          vec2 p = gl_PointCoord - 0.5;
          float c = cos(vAngle);
          float s = sin(vAngle);
          vec2 uv = mat2(c, -s, s, c) * p + 0.5;
          float alpha = texture2D(uMap, uv).a * vOpacity;
          if (alpha <= 0.004) discard;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    });
    this.points = new Points(this.geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  get activeCount(): number {
    return this.liveCount;
  }

  /** World-space radius occupied by visible puffs around a cloud origin. */
  maxExtentFrom(origin: Vector3): number {
    let extent = 0;
    for (let index = 0; index < this.capacity; index++) {
      if (this.lifetimes[index] <= 0 || this.ages[index] < 0) continue;
      const base = index * 3;
      const dx = this.positions[base] - origin.x;
      const dy = this.positions[base + 1] - origin.y;
      const dz = this.positions[base + 2] - origin.z;
      extent = Math.max(extent, Math.hypot(dx, dy, dz) + this.sizes[index] * 0.5);
    }
    return extent;
  }

  spawnCloud(position: Vector3, scale: number, kind: SmokeCloudKind, rng: Rng): void {
    const profile = PROFILES[kind];
    const count = Math.min(
      kind === 'capital' ? profile.count : Math.ceil(profile.count * Math.sqrt(scale)),
      this.capacity,
    );
    for (let puff = 0; puff < count; puff++) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      if (this.lifetimes[index] <= 0) this.liveCount++;

      const [x, y, z] = rng.unitSphere();
      smokeDirection.set(x, y, z);
      const spread = rng.range(0.15, profile.spread) * scale;
      const base = index * 3;
      this.positions[base] = position.x + x * spread;
      this.positions[base + 1] = position.y + y * spread;
      this.positions[base + 2] = position.z + z * spread;
      const speed = rng.range(profile.speedMin, profile.speedMax) * Math.sqrt(scale);
      this.velocities[base] = x * speed;
      this.velocities[base + 1] = y * speed;
      this.velocities[base + 2] = z * speed;
      this.ages[index] = -rng.range(0, profile.delay);
      this.lifetimes[index] = rng.range(profile.lifeMin, profile.lifeMax) * (0.9 + scale * 0.1);
      this.startSizes[index] = rng.range(profile.sizeMin, profile.sizeMax) * scale;
      this.growth[index] = rng.range(profile.growthMin, profile.growthMax) * scale;
      this.spin[index] = rng.range(-1.4, 1.4);
      this.angles[index] = rng.range(0, TAU);
      this.heat[index] = rng.range(0.65, 1);
      this.seed[index] = rng.range(0, TAU);
      this.peakOpacity[index] = profile.opacity * rng.range(0.72, 1);
      this.sizes[index] = 0;
      this.opacities[index] = 0;
    }
    this.markAttributesDirty();
  }

  update(dt: number): void {
    const drag = Math.exp(-1.15 * dt);
    for (let index = 0; index < this.capacity; index++) {
      const lifetime = this.lifetimes[index];
      if (lifetime <= 0) continue;
      this.ages[index] += dt;
      const age = this.ages[index];
      if (age < 0) continue;
      if (age >= lifetime) {
        this.lifetimes[index] = 0;
        this.opacities[index] = 0;
        this.sizes[index] = 0;
        this.liveCount--;
        continue;
      }

      const fraction = age / lifetime;
      const base = index * 3;
      this.velocities[base] *= drag;
      this.velocities[base + 1] *= drag;
      this.velocities[base + 2] *= drag;
      const phase = this.seed[index] + age * (1.35 + this.heat[index] * 0.7);
      const curl = this.startSizes[index] * 0.055;
      this.positions[base] += (this.velocities[base] + Math.sin(phase) * curl) * dt;
      this.positions[base + 1] +=
        (this.velocities[base + 1] + Math.cos(phase * 0.83) * curl) * dt;
      this.positions[base + 2] +=
        (this.velocities[base + 2] + Math.sin(phase * 1.17) * curl) * dt;

      const easedGrowth = 1 - (1 - fraction) ** 3;
      this.sizes[index] = this.startSizes[index] + this.growth[index] * easedGrowth;
      this.angles[index] += this.spin[index] * dt * (1 - fraction * 0.7);
      const fadeIn = Math.min(1, fraction / 0.1);
      const fadeOut = 1 - smoothstep(0.56, 1, fraction);
      this.opacities[index] = this.peakOpacity[index] * fadeIn * fadeOut;

      const hot = Math.max(0, 1 - fraction * 5.2) * this.heat[index];
      const warm = Math.max(0, 1 - fraction * 1.75);
      const variation = 0.015 * Math.sin(this.seed[index] * 3.1);
      this.colors[base] = 0.045 + variation + warm * 0.055 + hot * 2.1;
      this.colors[base + 1] = 0.05 + variation + warm * 0.03 + hot * 0.38;
      this.colors[base + 2] = 0.065 + variation + warm * 0.015 + hot * 0.035;
    }
    this.markAttributesDirty();
  }

  private markAttributesDirty(): void {
    (this.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aColor as BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aSize as BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aOpacity as BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aAngle as BufferAttribute).needsUpdate = true;
  }
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
