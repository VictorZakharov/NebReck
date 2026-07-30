import {
  Box3,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Rng } from '../core/Rng';
import { CapitalShip } from '../entities/CapitalShip';
import { buildShipMesh, ShipKind } from '../entities/ShipMesh';
import { Turret } from '../entities/Turret';

const W = 170;
const H = 128;

/**
 * MechWarrior-style target readout: an edge-wireframe of the locked hostile,
 * oriented EXACTLY as the real ship is oriented relative to the player's
 * view (nose-on when it charges you, tail-on when it flees), tinted by its
 * remaining hull (green → amber → red). Wireframes are built once per hull
 * kind from the real meshes and cached.
 */
export class TargetPreview {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly mat = new LineBasicMaterial({ transparent: true, opacity: 0.92 });
  private readonly cache = new Map<string, Group>();
  private mounted: Group | null = null;
  private mountedKind: string | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'preview-canvas';
    this.renderer = new WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setSize(W, H);
    this.camera = new PerspectiveCamera(36, W / H, 0.1, 50);
    this.camera.position.set(0, 0, 4.4);
    this.camera.lookAt(0, 0, 0);
  }

  /** kind=null hides the readout; relQuat = inverse(viewQuat) · targetQuat. */
  update(kind: string | null, hullFrac: number, relQuat: Quaternion): void {
    if (kind !== this.mountedKind) {
      if (this.mounted) this.scene.remove(this.mounted);
      this.mounted = kind ? this.wireframeFor(kind) : null;
      if (this.mounted) this.scene.add(this.mounted);
      this.mountedKind = kind;
    }
    if (!this.mounted) return;
    this.mounted.quaternion.copy(relQuat);
    const f = Math.max(0, Math.min(1, hullFrac));
    this.mat.color.setHSL(f * 0.34, 0.95, 0.55); // red → green
    this.renderer.render(this.scene, this.camera);
  }

  private wireframeFor(kind: string): Group {
    let g = this.cache.get(kind);
    if (g) return g;
    let src: Object3D;
    if (kind === 'turret') src = new Turret(new Rng(7)).object;
    else if (kind === 'capital') src = new CapitalShip().object;
    else src = buildShipMesh(kind as ShipKind).group;
    src.updateMatrixWorld(true);
    const lines = new Group();
    src.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const seg = new LineSegments(new EdgesGeometry(mesh.geometry, 18), this.mat);
      seg.applyMatrix4(mesh.matrixWorld);
      lines.add(seg);
    });
    // Normalize: center on origin, fit the longest axis into ~2.4 units.
    const box = new Box3().setFromObject(lines);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const inner = new Group();
    inner.add(lines);
    lines.position.copy(center).multiplyScalar(-1);
    inner.scale.setScalar(2.4 / Math.max(size.x, size.y, size.z, 0.001));
    g = new Group();
    g.add(inner);
    this.cache.set(kind, g);
    return g;
  }
}
