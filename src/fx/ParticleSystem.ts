import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';

export interface ParticleSpawn {
  position: Vector3;
  velocity: Vector3;
  color: Color;
  size: number;
  life: number;
  /** Velocity damping per second (1 = none, 0.1 = heavy drag). */
  drag?: number;
}

/**
 * One pooled additive particle system for the whole game (sparks, trails,
 * explosion debris, missile exhaust). CPU-simulated ring buffer, GPU-drawn
 * as point sprites; particles shrink and fade out over their life.
 */
export class ParticleSystem {
  readonly points: Points;

  private readonly capacity: number;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly lifeFrac: Float32Array;

  private readonly velocities: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly drag: Float32Array;
  private cursor = 0;

  private readonly geometry: BufferGeometry;

  constructor(capacity = 4096) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.lifeFrac = new Float32Array(capacity);
    this.velocities = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aColor', new BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('aSize', new BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('aLifeFrac', new BufferAttribute(this.lifeFrac, 1));

    const material = new ShaderMaterial({
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aLifeFrac;
        varying vec3 vColor;
        varying float vLifeFrac;
        void main() {
          vColor = aColor;
          vLifeFrac = aLifeFrac;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float scale = aLifeFrac > 0.0 ? aSize * (0.4 + 0.6 * aLifeFrac) : 0.0;
          gl_PointSize = scale * (900.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vLifeFrac;
        void main() {
          if (vLifeFrac <= 0.0) discard;
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv) * 2.0;
          float alpha = smoothstep(1.0, 0.0, d) * vLifeFrac;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    });

    this.points = new Points(this.geometry, material);
    this.points.frustumCulled = false;
  }

  spawn(s: ParticleSpawn): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.positions[i * 3] = s.position.x;
    this.positions[i * 3 + 1] = s.position.y;
    this.positions[i * 3 + 2] = s.position.z;
    this.velocities[i * 3] = s.velocity.x;
    this.velocities[i * 3 + 1] = s.velocity.y;
    this.velocities[i * 3 + 2] = s.velocity.z;
    this.colors[i * 3] = s.color.r;
    this.colors[i * 3 + 1] = s.color.g;
    this.colors[i * 3 + 2] = s.color.b;
    this.sizes[i] = s.size;
    this.life[i] = s.life;
    this.maxLife[i] = s.life;
    this.drag[i] = s.drag ?? 1;
    this.lifeFrac[i] = 1;
  }

  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.lifeFrac[i] = 0;
        continue;
      }
      const dragFactor = this.drag[i] === 1 ? 1 : Math.pow(this.drag[i], dt);
      this.velocities[i * 3] *= dragFactor;
      this.velocities[i * 3 + 1] *= dragFactor;
      this.velocities[i * 3 + 2] *= dragFactor;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      this.lifeFrac[i] = this.life[i] / this.maxLife[i];
    }
    (this.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aColor as BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aSize as BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aLifeFrac as BufferAttribute).needsUpdate = true;
  }
}
