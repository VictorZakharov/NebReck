import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  SphereGeometry,
  Vector3,
} from 'three';

/**
 * The system star: an HDR-bright self-lit core, a depth-tested extended
 * corona, and the key directional light for the whole scene.
 */
export class Sun {
  readonly group: Group;
  /** HDR core kept public for visual tests and scene inspection. */
  readonly core: Mesh;
  readonly light: DirectionalLight;

  constructor(position: Vector3, color: Color) {
    this.group = new Group();
    this.group.position.copy(position);

    const coreColor = color.clone().multiplyScalar(6); // HDR — drives bloom
    this.core = new Mesh(
      new SphereGeometry(140, 32, 32),
      new MeshBasicMaterial({ color: coreColor, toneMapped: false }),
    );
    // Keep rendering when the centre leaves frame but the limb remains.
    this.core.frustumCulled = false;
    this.group.add(this.core);

    // A billboarded radial field behaves like an extended emitter: clipping
    // the star at a screen edge or behind an asteroid clips only those
    // fragments. There is no single projected centre that can switch all
    // illumination on/off.
    const corona = new Sprite(
      new SpriteMaterial({
        map: getCoronaTexture(),
        color: color.clone().multiplyScalar(2.2),
        transparent: true,
        opacity: 0.72,
        depthTest: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    );
    corona.scale.setScalar(820);
    corona.frustumCulled = false;
    this.group.add(corona);

    this.light = new DirectionalLight(color, 3.0);
    this.light.position.copy(position);
    this.light.target.position.set(0, 0, 0);
  }
}

let coronaTexture: CanvasTexture | null = null;

/** Soft, wide solar field. A shared texture avoids reallocating it per sector. */
function getCoronaTexture(): CanvasTexture {
  if (coronaTexture) return coronaTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const glow = ctx.createRadialGradient(128, 128, 24, 128, 128, 128);
  glow.addColorStop(0, 'rgba(255,255,255,0.95)');
  glow.addColorStop(0.24, 'rgba(255,255,255,0.72)');
  glow.addColorStop(0.5, 'rgba(255,255,255,0.26)');
  glow.addColorStop(0.78, 'rgba(255,255,255,0.07)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 256, 256);
  coronaTexture = new CanvasTexture(canvas);
  coronaTexture.colorSpace = SRGBColorSpace;
  return coronaTexture;
}
