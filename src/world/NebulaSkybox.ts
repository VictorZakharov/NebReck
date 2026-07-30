import {
  BackSide,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { NOISE_GLSL } from './noiseGlsl';

export interface NebulaPalette {
  deep: Color;      // darkest space color
  primary: Color;   // main nebula cloud color
  secondary: Color; // second cloud color
  accent: Color;    // hot highlight color
}

/**
 * Procedural nebula skybox: an inverted far sphere shaded with layered fbm
 * noise. Two cloud colors mix over deep space, with hot accent cores where
 * density peaks — the classic vibrant space-shooter backdrop.
 */
export class NebulaSkybox {
  readonly mesh: Mesh;

  constructor(palette: NebulaPalette, seedOffset: Vector3) {
    const material = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uDeep: { value: palette.deep },
        uPrimary: { value: palette.primary },
        uSecondary: { value: palette.secondary },
        uAccent: { value: palette.accent },
        uOffset: { value: seedOffset },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = pos.xyww; // force depth to far plane
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform vec3 uDeep;
        uniform vec3 uPrimary;
        uniform vec3 uSecondary;
        uniform vec3 uAccent;
        uniform vec3 uOffset;
        ${NOISE_GLSL}
        void main() {
          vec3 dir = normalize(vDir);
          vec3 p = dir * 2.3 + uOffset;

          // Domain-warped fbm gives the wispy filament look.
          vec3 warp = vec3(fbm(p * 1.4), fbm(p * 1.4 + 11.7), fbm(p * 1.4 + 27.2));
          float cloudA = fbm(p + warp * 0.9);
          float cloudB = fbm(p * 1.9 - warp * 0.6 + 53.1);

          float dA = smoothstep(-0.15, 0.75, cloudA);
          float dB = smoothstep(0.0, 0.85, cloudB);

          vec3 col = uDeep;
          col = mix(col, uPrimary, dA * 0.85);
          col = mix(col, uSecondary, dB * 0.6);

          // Hot cores where both layers stack up.
          float core = smoothstep(0.55, 1.05, dA * dB * 2.0);
          col = mix(col, uAccent, core * 0.7);

          // Faint large-scale luminance variation so no direction is flat.
          col *= 0.85 + 0.3 * smoothstep(-0.6, 0.9, snoise(p * 0.5));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.mesh = new Mesh(new SphereGeometry(9000, 48, 32), material);
    this.mesh.frustumCulled = false;
  }
}
