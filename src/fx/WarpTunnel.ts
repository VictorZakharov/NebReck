import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
} from 'three';

const COUNT = 170;
const NEAR_Z = 12;
const SPAN = 140;

/**
 * Hyperspace streaks: a cylinder of light-lines PARENTED TO THE CAMERA that
 * rush past the viewer, intensity driven by jump-spool progress (0..1).
 * Deterministic layout (hash placement, no Math.random) so test captures of a
 * mid-spool frame are stable.
 */
export class WarpTunnel {
  readonly group = new Group();
  /** Externally driven 0..1; eases visually via opacity + streak speed. */
  progress = 0;

  private readonly positions: Float32Array;
  private readonly geometry: BufferGeometry;
  private readonly material: LineBasicMaterial;

  constructor() {
    this.positions = new Float32Array(COUNT * 6);
    for (let i = 0; i < COUNT; i++) {
      // Hash-based placement: stable across sessions.
      const a = (i * 2.399963) % (Math.PI * 2); // golden-angle spiral
      const radius = 5 + ((i * 7919) % 100) * 0.26;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius * 0.7;
      const z = NEAR_Z - ((i * 104729) % (SPAN * 10)) / 10;
      const length = 9 + ((i * 31) % 14);
      this.positions[i * 6] = x;
      this.positions[i * 6 + 1] = y;
      this.positions[i * 6 + 2] = z;
      this.positions[i * 6 + 3] = x;
      this.positions[i * 6 + 4] = y;
      this.positions[i * 6 + 5] = z - length;
    }
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.material = new LineBasicMaterial({
      color: 0xbfe4ff,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const lines = new LineSegments(this.geometry, this.material);
    lines.frustumCulled = false;
    lines.renderOrder = 999;
    this.group.add(lines);
    this.group.visible = false;
  }

  update(dt: number): void {
    this.material.opacity = Math.min(1, this.progress) * 0.8;
    this.group.visible = this.progress > 0.02;
    if (!this.group.visible) return;

    const speed = 40 + this.progress * 460;
    for (let i = 0; i < COUNT; i++) {
      let z0 = this.positions[i * 6 + 2] + speed * dt;
      const length = this.positions[i * 6 + 2] - this.positions[i * 6 + 5];
      if (z0 > NEAR_Z) z0 -= SPAN;
      this.positions[i * 6 + 2] = z0;
      this.positions[i * 6 + 5] = z0 - length;
    }
    (this.geometry.attributes.position as BufferAttribute).needsUpdate = true;
  }
}
