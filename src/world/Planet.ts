import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/Rng';
import { NOISE_GLSL } from './noiseGlsl';

export interface PlanetOptions {
  radius: number;
  surfaceA: Color;
  surfaceB: Color;
  atmosphere: Color;
  banded: boolean;   // gas-giant style latitude bands vs. rocky patches
  ring?: { inner: number; outer: number; color: Color };
  lightDir: Vector3;
}

/**
 * A distant procedural planet: noise-shaded surface (banded gas giant or
 * mottled rocky), day/night terminator from the sun direction, fresnel
 * atmosphere rim, optional alpha-gradient ring.
 */
export class Planet {
  readonly group: Group;
  private readonly surface: ShaderMaterial;

  constructor(rng: Rng, options: PlanetOptions) {
    this.group = new Group();

    this.surface = new ShaderMaterial({
      uniforms: {
        uSurfaceA: { value: options.surfaceA },
        uSurfaceB: { value: options.surfaceB },
        uAtmosphere: { value: options.atmosphere },
        uLightDir: { value: options.lightDir.clone().normalize() },
        uSeed: { value: rng.range(0, 100) },
        uBanded: { value: options.banded ? 1.0 : 0.0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormalW;
        varying vec3 vPosLocal;
        varying vec3 vViewDirW;
        void main() {
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vPosLocal = normalize(position);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vViewDirW = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vNormalW;
        varying vec3 vPosLocal;
        varying vec3 vViewDirW;
        uniform vec3 uSurfaceA;
        uniform vec3 uSurfaceB;
        uniform vec3 uAtmosphere;
        uniform vec3 uLightDir;
        uniform float uSeed;
        uniform float uBanded;
        ${NOISE_GLSL}
        void main() {
          vec3 p = vPosLocal + vec3(uSeed);
          float n;
          if (uBanded > 0.5) {
            // Latitude bands warped by noise — gas giant.
            float warp = fbm(p * 0.9) * 0.13;
            float broad = sin((vPosLocal.y + warp) * 9.0 + uSeed) * 0.5 + 0.5;
            float fine = sin((vPosLocal.y + warp * 0.55) * 20.0 + uSeed * 0.7) * 0.5 + 0.5;
            float weather = fbm(p * 1.35) * 0.5 + 0.5;
            n = clamp(broad * 0.68 + fine * 0.12 + weather * 0.20, 0.0, 1.0);
          } else {
            float continents = fbm(p * 0.82) * 0.5 + 0.5;
            float highlands = fbm(p * 1.9) * 0.5 + 0.5;
            float shelf = smoothstep(0.34, 0.66, continents);
            n = clamp(0.14 + shelf * 0.72 + (highlands - 0.5) * 0.14, 0.0, 1.0);
          }
          n = smoothstep(0.08, 0.92, n);
          vec3 col = mix(uSurfaceA, uSurfaceB, 0.18 + n * 0.64);

          float daylight = clamp(dot(vNormalW, uLightDir), 0.0, 1.0);
          col *= 0.06 + daylight * 1.1;

          // Atmosphere rim, strongest on the lit limb.
          float fresnel = pow(1.0 - clamp(dot(vNormalW, vViewDirW), 0.0, 1.0), 2.6);
          col += uAtmosphere * fresnel * (0.25 + daylight * 0.9);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.group.add(new Mesh(new SphereGeometry(options.radius, 48, 32), this.surface));

    if (options.ring) {
      const geo = new RingGeometry(options.ring.inner, options.ring.outer, 96, 1);
      const mat = new MeshBasicMaterial({
        map: makeRingTexture(options.ring.color),
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const ring = new Mesh(geo, mat);
      ring.rotation.x = Math.PI / 2 + rng.range(-0.35, 0.35);
      ring.rotation.y = rng.range(-0.2, 0.2);
      this.group.add(ring);
    }
  }
}

/** Radial banded alpha texture for planet rings, generated on a canvas. */
export function makeRingTexture(color: Color): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  const r = Math.floor(color.r * 255);
  const g = Math.floor(color.g * 255);
  const b = Math.floor(color.b * 255);
  for (let x = 0; x < size; x++) {
    const t = x / size;
    // Layered sine bands with edge falloff.
    const band =
      (Math.sin(t * 38) * 0.5 + 0.5) * 0.5 + (Math.sin(t * 90 + 1.7) * 0.5 + 0.5) * 0.3;
    const edge = Math.sin(t * Math.PI);
    const a = Math.max(0, band * edge * 0.75);
    ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
    ctx.fillRect(x, 0, 1, 8);
  }
  const tex = new CanvasTexture(canvas);
  // RingGeometry UVs run radially in u after this rotation trick isn't needed;
  // default UVs map u across the ring plane, so rotate the texture usage by
  // relying on radial u produced by RingGeometry (u follows radius).
  return tex;
}
