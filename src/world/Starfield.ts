import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
} from 'three';
import { Rng } from '../core/Rng';

/**
 * A shell of a few thousand point-sprite stars at far distance, with varied
 * sizes, subtle color temperature spread, and a gentle twinkle. Bright
 * outliers get picked up by bloom for the occasional flare.
 */
export class Starfield {
  readonly points: Points;
  private readonly material: ShaderMaterial;

  constructor(rng: Rng, count: number, radius = 8000) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);

    const warm = new Color(1.0, 0.85, 0.7);
    const cool = new Color(0.72, 0.82, 1.0);
    const white = new Color(1, 1, 1);
    const tmp = new Color();

    for (let i = 0; i < count; i++) {
      const [x, y, z] = rng.unitSphere();
      positions[i * 3] = x * radius;
      positions[i * 3 + 1] = y * radius;
      positions[i * 3 + 2] = z * radius;

      const t = rng.next();
      tmp.copy(t < 0.3 ? warm : t < 0.6 ? cool : white);
      const brightness = 0.35 + Math.pow(rng.next(), 3) * 1.9;
      colors[i * 3] = tmp.r * brightness;
      colors[i * 3 + 1] = tmp.g * brightness;
      colors[i * 3 + 2] = tmp.b * brightness;

      sizes[i] = rng.chance(0.03) ? rng.range(3.2, 5.2) : rng.range(1.0, 2.4);
      phases[i] = rng.range(0, Math.PI * 2);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new BufferAttribute(phases, 1));

    this.material = new ShaderMaterial({
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aPhase;
        uniform float uTime;
        varying vec3 vColor;
        void main() {
          float twinkle = 0.82 + 0.18 * sin(uTime * 1.7 + aPhase);
          vColor = aColor * twinkle;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (1400.0 / -mv.z) * 3.0;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv) * 2.0;
          float alpha = smoothstep(1.0, 0.15, d);
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    });

    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  update(elapsed: number): void {
    this.material.uniforms.uTime.value = elapsed;
  }
}
