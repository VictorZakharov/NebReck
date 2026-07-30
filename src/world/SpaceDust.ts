import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { Rng } from '../core/Rng';

/**
 * Tiny motes drifting near the camera, wrapped inside a cube that travels
 * with it. They're what makes velocity *feel* fast — the classic space-game
 * speed-dust trick.
 */
export class SpaceDust {
  readonly points: Points;
  private readonly geometry: BufferGeometry;
  private readonly halfExtent = 90;

  constructor(rng: Rng, count: number) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      positions[i] = rng.range(-this.halfExtent, this.halfExtent);
    }
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(positions, 3));

    const material = new ShaderMaterial({
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      uniforms: {},
      vertexShader: /* glsl */ `
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 90.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float alpha = smoothstep(0.5, 0.1, length(uv)) * 0.5;
          gl_FragColor = vec4(0.75, 0.85, 1.0, alpha);
        }
      `,
    });

    this.points = new Points(this.geometry, material);
    this.points.frustumCulled = false;
  }

  /** Wrap motes so they always fill the cube around the camera. */
  update(cameraPosition: Vector3): void {
    const pos = this.geometry.attributes.position as BufferAttribute;
    const arr = pos.array as Float32Array;
    const h = this.halfExtent;
    const size = h * 2;
    for (let i = 0; i < arr.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        const camC = c === 0 ? cameraPosition.x : c === 1 ? cameraPosition.y : cameraPosition.z;
        let d = arr[i + c] - camC;
        if (d > h) arr[i + c] -= size * Math.ceil((d - h) / size);
        else if (d < -h) arr[i + c] += size * Math.ceil((-d - h) / size);
      }
    }
    pos.needsUpdate = true;
  }
}
