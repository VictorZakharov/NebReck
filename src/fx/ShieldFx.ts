import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

const localImpact = new Vector3();

/**
 * Hexless energy-shield shell: invisible until hit, then a fresnel-edged
 * flash centered on the impact direction ripples and fades. One per ship
 * that has shields worth showing (the player, mainly).
 */
export class ShieldFx {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private age = 1;
  private readonly duration = 0.82;

  constructor(radius: number, color: Color) {
    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: {
        uColor: { value: color },
        uFlash: { value: 0 },
        uProgress: { value: 1 },
        uImpactDir: { value: new Vector3(0, 0, 1) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormalL;
        varying vec3 vNormalW;
        varying vec3 vViewDirW;
        void main() {
          vNormalL = normal;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vViewDirW = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uFlash;
        uniform float uProgress;
        uniform vec3 uImpactDir;
        varying vec3 vNormalL;
        varying vec3 vNormalW;
        varying vec3 vViewDirW;
        void main() {
          if (uFlash <= 0.001) discard;
          float sideDot = dot(normalize(vNormalL), normalize(uImpactDir));
          if (sideDot <= 0.0) discard;
          float fresnel = pow(1.0 - abs(dot(vNormalW, vViewDirW)), 2.6);
          float impact = pow(sideDot, 7.0);
          float impactAngle = acos(clamp(sideDot, -1.0, 1.0));
          float rippleRadius = mix(0.04, 1.5, min(1.0, uProgress * 1.35));
          float ripple = exp(-pow((impactAngle - rippleRadius) * 13.0, 2.0));
          float hemisphere = smoothstep(0.0, 0.22, sideDot);
          float a = (impact * 0.48 + ripple * 0.52 + fresnel * 0.1) * hemisphere * uFlash;
          vec3 energy = uColor * (0.7 + impact * 0.35 + ripple * 0.45);
          gl_FragColor = vec4(energy, clamp(a, 0.0, 0.72));
        }
      `,
    });
    this.mesh = new Mesh(new SphereGeometry(radius * 1.55, 32, 24), this.material);
    this.mesh.renderOrder = 6;
  }

  /** worldImpactPoint → highlight that side of the shell. */
  hit(worldImpactPoint: Vector3): void {
    this.age = 0;
    localImpact.copy(worldImpactPoint);
    this.mesh.worldToLocal(localImpact);
    localImpact.normalize();
    (this.material.uniforms.uImpactDir.value as Vector3).copy(localImpact);
  }

  update(dt: number): void {
    this.age = Math.min(this.duration, this.age + dt);
    const progress = this.age / this.duration;
    const flash = progress >= 1 ? 0 : (1 - progress) ** 1.35;
    this.material.uniforms.uFlash.value = flash;
    this.material.uniforms.uProgress.value = progress;
  }

  diagnostics(): { active: boolean; progress: number } {
    return {
      active: this.age < this.duration,
      progress: Math.min(1, this.age / this.duration),
    };
  }
}
