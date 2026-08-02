import {
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Quaternion,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';

const MAX_BLIPS = 14;
const RANGE = 650;      // world units mapped onto the sphere
const RADIUS = 1;       // radar sphere radius

const relative = new Quaternion();
const toEnemy = new Vector3();

export interface RadarContact {
  position: Vector3;
  kind: string; // 'brute' renders a larger blip; 'turret' renders amber
  /** Within current weapon reach; out-of-range blips render grey. */
  inRange?: boolean;
}

const COLOR_SHIP = 0xff3b30;
const COLOR_TURRET = 0xffa73d;
const COLOR_FAR = 0x96a5af;
const COLOR_NEUTRAL = 0x9fdcff;
const COLOR_OBJECTIVE = 0xffd24a;
const COLOR_MERCHANT = 0x8aff9f;
const COLOR_NAVIGATION = 0x27e8ff;

/**
 * Elite-style holographic sphere radar: contacts are shown in the SHIP's
 * reference frame (forward = into the screen), as a blip plus a vertical stem
 * down to the ship's horizontal plane — one glance gives bearing AND
 * elevation. Rendered on its own tiny WebGL canvas layered into the HUD, so
 * it stays out of the main post-processing chain.
 */
export class Radar3D {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly blips: Mesh[] = [];
  private readonly stems: LineSegments;
  private readonly stemPositions: Float32Array;
  private readonly stemColors: Float32Array;
  private readonly stemColor = new Color();

  constructor(size = 148) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(size, size);
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'radar-canvas';

    // Mostly top-down: "up on screen" unambiguously means "ahead of you";
    // elevation is carried by the stems, not by screen position.
    this.camera = new PerspectiveCamera(38, 1, 0.1, 20);
    this.camera.position.set(0, 2.5, 1.35);
    this.camera.lookAt(0, -0.08, 0);

    const teal = new Color(0x27e8ff);

    // Equator ring (the ship's horizontal plane).
    const ring = new Mesh(
      new RingGeometry(RADIUS * 0.96, RADIUS, 48),
      new MeshBasicMaterial({
        color: teal, transparent: true, opacity: 0.55,
        blending: AdditiveBlending, depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    // Faint disc so the plane reads as a surface.
    const disc = new Mesh(
      new RingGeometry(0.02, RADIUS * 0.95, 48),
      new MeshBasicMaterial({
        color: teal, transparent: true, opacity: 0.06,
        blending: AdditiveBlending, depthWrite: false,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    this.scene.add(disc);
    // Wire dome.
    const dome = new Mesh(
      new SphereGeometry(RADIUS, 18, 9),
      new MeshBasicMaterial({
        color: teal, wireframe: true, transparent: true, opacity: 0.07,
        blending: AdditiveBlending, depthWrite: false,
      }),
    );
    this.scene.add(dome);
    // Forward wedge + heading line: "that way is your nose".
    const wedgeGeo = new BufferGeometry();
    wedgeGeo.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([
          0, 0, -RADIUS - 0.16,
          -0.09, 0, -RADIUS + 0.06,
          0.09, 0, -RADIUS + 0.06,
        ]),
        3,
      ),
    );
    const wedge = new Mesh(
      wedgeGeo,
      new MeshBasicMaterial({ color: teal, transparent: true, opacity: 0.95 }),
    );
    this.scene.add(wedge);
    const headingGeo = new BufferGeometry();
    headingGeo.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([0, 0, 0, 0, 0, -RADIUS]), 3),
    );
    this.scene.add(
      new LineSegments(
        headingGeo,
        new LineBasicMaterial({
          color: teal, transparent: true, opacity: 0.3,
          blending: AdditiveBlending, depthWrite: false,
        }),
      ),
    );
    // Player marker at the center.
    const self = new Mesh(
      new SphereGeometry(0.05, 8, 6),
      new MeshBasicMaterial({ color: 0xffffff }),
    );
    this.scene.add(self);

    // Contact blips + elevation stems.
    for (let i = 0; i < MAX_BLIPS; i++) {
      const blip = new Mesh(
        new SphereGeometry(0.055, 8, 6),
        new MeshBasicMaterial({ color: 0xff3b30 }),
      );
      blip.visible = false;
      this.scene.add(blip);
      this.blips.push(blip);
    }
    this.stemPositions = new Float32Array(MAX_BLIPS * 6);
    this.stemColors = new Float32Array(MAX_BLIPS * 6);
    const stemGeo = new BufferGeometry();
    stemGeo.setAttribute('position', new BufferAttribute(this.stemPositions, 3));
    stemGeo.setAttribute('color', new BufferAttribute(this.stemColors, 3));
    this.stems = new LineSegments(
      stemGeo,
      new LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.9,
        blending: AdditiveBlending, depthWrite: false,
      }),
    );
    this.scene.add(this.stems);

    this.scene.add(new AmbientLight(0xffffff, 2));
  }

  update(shipQuaternion: Quaternion, shipPosition: Vector3, contacts: readonly RadarContact[]): void {
    relative.copy(shipQuaternion).invert();

    let stemCount = 0;
    for (let i = 0; i < MAX_BLIPS; i++) {
      const blip = this.blips[i];
      const contact = contacts[i];
      if (!contact) {
        blip.visible = false;
        continue;
      }
      toEnemy.copy(contact.position).sub(shipPosition).applyQuaternion(relative);
      const dist = toEnemy.length();
      // sqrt scale: nearby contacts get more separation than far ones.
      const r = Math.sqrt(Math.min(1, dist / RANGE)) * RADIUS * 0.95;
      toEnemy.normalize().multiplyScalar(r);

      // Color semantics match the HUD: red ship / amber turret / blue neutral
      // / grey out-of-range.
      const hex =
        contact.kind === 'navigation' ? COLOR_NAVIGATION
        : contact.kind === 'objective' ? COLOR_OBJECTIVE
        : contact.kind === 'merchant' ? COLOR_MERCHANT
        : contact.kind === 'neutral' ? COLOR_NEUTRAL
        : contact.inRange === false ? COLOR_FAR
        : (contact.kind === 'turret' || contact.kind === 'rocket-turret') ? COLOR_TURRET
        : COLOR_SHIP;
      (blip.material as MeshBasicMaterial).color.setHex(hex);

      blip.visible = true;
      blip.position.copy(toEnemy);
      blip.scale.setScalar(
        contact.kind === 'navigation' ? 1.55
          : contact.kind === 'brute' ? 1.5
            : contact.kind === 'bomber' ? 1.3 : 1,
      );

      // Stem from the blip straight down/up to the equator plane.
      this.stemColor.setHex(hex);
      for (let v = 0; v < 2; v++) {
        this.stemColors[stemCount * 6 + v * 3] = this.stemColor.r;
        this.stemColors[stemCount * 6 + v * 3 + 1] = this.stemColor.g;
        this.stemColors[stemCount * 6 + v * 3 + 2] = this.stemColor.b;
      }
      this.stemPositions[stemCount * 6] = toEnemy.x;
      this.stemPositions[stemCount * 6 + 1] = toEnemy.y;
      this.stemPositions[stemCount * 6 + 2] = toEnemy.z;
      this.stemPositions[stemCount * 6 + 3] = toEnemy.x;
      this.stemPositions[stemCount * 6 + 4] = 0;
      this.stemPositions[stemCount * 6 + 5] = toEnemy.z;
      stemCount++;
    }
    for (let i = stemCount * 6; i < this.stemPositions.length; i++) this.stemPositions[i] = 0;
    (this.stems.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    (this.stems.geometry.attributes.color as BufferAttribute).needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }
}
