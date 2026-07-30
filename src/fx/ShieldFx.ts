import { AdditiveBlending, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

const localImpact = new Vector3();

/**
 * Hexless energy-shield shell: invisible until hit, then a fresnel-edged
 * flash centered on the impact direction ripples and fades. One per ship
 * that has shields worth showing (the player, mainly).
 */
export class ShieldFx {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private flash = 0;

  constructor(radius: number, color: Color) {
    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uColor: { value: color },
        uFlash: { value: 0 },
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
        uniform vec3 uImpactDir;
        varying vec3 vNormalL;
        varying vec3 vNormalW;
        varying vec3 vViewDirW;
        void main() {
          if (uFlash <= 0.001) discard;
          float fresnel = pow(1.0 - abs(dot(vNormalW, vViewDirW)), 2.6);
          float impact = pow(max(0.0, dot(normalize(vNormalL), uImpactDir)), 6.0);
          float a = (fresnel * 0.22 + impact * 1.3) * uFlash;
          gl_FragColor = vec4(uColor * (1.0 + impact * 2.0), clamp(a, 0.0, 1.0));
        }
      `,
    });
    this.mesh = new Mesh(new SphereGeometry(radius * 1.5, 24, 18), this.material);
  }

  /** worldImpactPoint → highlight that side of the shell. */
  hit(worldImpactPoint: Vector3): void {
    this.flash = 1;
    localImpact.copy(worldImpactPoint);
    this.mesh.worldToLocal(localImpact);
    localImpact.normalize();
    (this.material.uniforms.uImpactDir.value as Vector3).copy(localImpact);
  }

  update(dt: number): void {
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.material.uniforms.uFlash.value = this.flash;
  }
}
