import {
  Box3,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { Rng } from '../core/Rng';
import { RESOURCE_INFO, ResourceType } from '../entities/PickupSystem';
import { buildShipMesh, ShipKind } from '../entities/ShipMesh';
import { Turret } from '../entities/Turret';

const W = 170;
const H = 128;

interface PreviewModel {
  wireframe: Group;
  silhouette: Group;
  normalizedSize: Vector3;
}

const OUTLINE_FRAGMENT = `
  uniform sampler2D maskTexture;
  uniform vec2 texel;
  varying vec2 vUv;

  float ring(float radius) {
    vec2 d = texel * radius;
    float a = 0.0;
    a = max(a, texture2D(maskTexture, vUv + vec2( d.x, 0.0)).a);
    a = max(a, texture2D(maskTexture, vUv + vec2(-d.x, 0.0)).a);
    a = max(a, texture2D(maskTexture, vUv + vec2(0.0,  d.y)).a);
    a = max(a, texture2D(maskTexture, vUv + vec2(0.0, -d.y)).a);
    a = max(a, texture2D(maskTexture, vUv + vec2( d.x,  d.y)).a);
    a = max(a, texture2D(maskTexture, vUv + vec2(-d.x,  d.y)).a);
    a = max(a, texture2D(maskTexture, vUv + vec2( d.x, -d.y)).a);
    return max(a, texture2D(maskTexture, vUv + vec2(-d.x, -d.y)).a);
  }

  void main() {
    float inside = texture2D(maskTexture, vUv).a;
    float core = max(0.0, ring(1.75) - inside);
    float halo = max(0.0, ring(4.5) - inside);
    float alpha = max(core * 0.95, halo * 0.32);
    gl_FragColor = vec4(1.0, 0.055, 0.035, alpha);
  }
`;

/**
 * MechWarrior-style target readout, oriented exactly like the real target.
 * Internal edges retain the hull-health color (green to amber to red), while
 * hostility is a separate red glow around the projected silhouette perimeter.
 */
export class TargetPreview {
  readonly canvas: HTMLCanvasElement;
  /** Last rendered relationship channel, exposed for deterministic visual assertions. */
  outlineActive = false;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly silhouetteScene = new Scene();
  private readonly outlineScene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly outlineCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 2);
  private readonly maskTarget = new WebGLRenderTarget(W, H, { depthBuffer: true });
  private readonly mat = new LineBasicMaterial({ transparent: true, opacity: 0.92 });
  private readonly silhouetteMat = new MeshBasicMaterial({ color: 0xffffff });
  private readonly outlineMat = new ShaderMaterial({
    uniforms: {
      maskTexture: { value: this.maskTarget.texture },
      texel: { value: new Vector2(1 / W, 1 / H) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: OUTLINE_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly cache = new Map<string, PreviewModel>();
  private readonly viewRotation = new Matrix4();
  private mounted: PreviewModel | null = null;
  private mountedKind: string | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'preview-canvas';
    this.renderer = new WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setSize(W, H, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.camera = new PerspectiveCamera(36, W / H, 0.1, 50);
    this.camera.position.set(0, 0, 4.4);
    this.camera.lookAt(0, 0, 0);
    this.outlineCamera.position.z = 1;
    this.outlineScene.add(new Mesh(new PlaneGeometry(2, 2), this.outlineMat));
  }

  /** kind=null hides the readout; relQuat = inverse(viewQuat) * targetQuat. */
  update(
    kind: string | null,
    hullFrac: number,
    relQuat: Quaternion,
    relationship: 'hostile' | 'friendly' | 'neutral' = 'hostile',
  ): void {
    if (kind !== this.mountedKind) {
      if (this.mounted) {
        this.scene.remove(this.mounted.wireframe);
        this.silhouetteScene.remove(this.mounted.silhouette);
      }
      this.mounted = kind ? this.modelFor(kind) : null;
      if (this.mounted) {
        this.scene.add(this.mounted.wireframe);
        this.silhouetteScene.add(this.mounted.silhouette);
      }
      this.mountedKind = kind;
    }
    if (!this.mounted) {
      this.outlineActive = false;
      return;
    }
    this.mounted.wireframe.quaternion.copy(relQuat);
    this.mounted.silhouette.quaternion.copy(relQuat);
    const zoom = this.orientationZoom(this.mounted, relQuat);
    this.mounted.wireframe.scale.setScalar(zoom);
    this.mounted.silhouette.scale.setScalar(zoom);
    const resource = kind?.startsWith('ore-')
      ? kind.slice(4) as ResourceType
      : null;
    if (resource && RESOURCE_INFO[resource]) this.mat.color.setHex(RESOURCE_INFO[resource].color);
    else if (relationship === 'friendly') this.mat.color.setHex(0x8aff9f);
    else if (relationship === 'neutral') this.mat.color.setHex(0x9fdcff);
    else {
      const f = Math.max(0, Math.min(1, hullFrac));
      this.mat.color.setHSL(f * 0.34, 0.95, 0.55);
    }
    this.render(relationship === 'hostile');
  }

  private render(hostile: boolean): void {
    this.outlineActive = hostile;
    if (hostile) {
      this.renderer.setRenderTarget(this.maskTarget);
      this.renderer.clear(true, true, true);
      this.renderer.render(this.silhouetteScene, this.camera);
    }
    this.renderer.setRenderTarget(null);
    this.renderer.clear(true, true, true);
    if (hostile) this.renderer.render(this.outlineScene, this.outlineCamera);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
  }

  private modelFor(kind: string): PreviewModel {
    let model = this.cache.get(kind);
    if (model) return model;
    let src: Object3D;
    if (kind === 'turret') src = new Turret(new Rng(7)).object;
    else if (kind === 'rocket-turret') src = new Turret(new Rng(7), 'homing').object;
    else if (kind.startsWith('ore-')) src = this.oreFormation();
    else src = buildShipMesh(kind as ShipKind).group;
    src.updateMatrixWorld(true);
    const lines = new Group();
    const solids = new Group();
    src.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const seg = new LineSegments(new EdgesGeometry(mesh.geometry, 18), this.mat);
      seg.applyMatrix4(mesh.matrixWorld);
      lines.add(seg);
      const solid = new Mesh(mesh.geometry, this.silhouetteMat);
      solid.applyMatrix4(mesh.matrixWorld);
      solids.add(solid);
    });
    const box = new Box3().setFromObject(lines);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const scale = 2.4 / Math.max(size.x, size.y, size.z, 0.001);
    lines.scale.setScalar(scale);
    solids.scale.setScalar(scale);
    // Child vertices are in source-world coordinates. Translate by the
    // *scaled* center so asymmetric long hulls remain at the preview origin.
    lines.position.copy(center).multiplyScalar(-scale);
    solids.position.copy(center).multiplyScalar(-scale);
    model = {
      wireframe: new Group().add(lines),
      silhouette: new Group().add(solids),
      normalizedSize: size.multiplyScalar(scale),
    };
    this.cache.set(kind, model);
    return model;
  }

  /** Keep a nose-on carrier readable without changing its view-space orientation. */
  private orientationZoom(model: PreviewModel, rotation: Quaternion): number {
    if (this.mountedKind !== 'capital') return 1;
    const e = this.viewRotation.makeRotationFromQuaternion(rotation).elements;
    const s = model.normalizedSize;
    const width = Math.abs(e[0]) * s.x + Math.abs(e[4]) * s.y + Math.abs(e[8]) * s.z;
    const height = Math.abs(e[1]) * s.x + Math.abs(e[5]) * s.y + Math.abs(e[9]) * s.z;
    return Math.min(2.8, Math.max(1, 2.1 / Math.max(width, height, 0.001)));
  }

  private oreFormation(): Group {
    const formation = new Group();
    const geometry = new OctahedronGeometry(1, 0);
    const placements = [
      [-0.65, -0.18, 0.1, 0.48, 1.35, 0.48, -0.24],
      [0, 0.15, 0, 0.62, 1.8, 0.62, 0.08],
      [0.68, -0.12, -0.08, 0.44, 1.15, 0.44, 0.28],
    ] as const;
    for (const [x, y, z, sx, sy, sz, rz] of placements) {
      const crystal = new Mesh(geometry, this.mat);
      crystal.position.set(x, y, z);
      crystal.scale.set(sx, sy, sz);
      crystal.rotation.z = rz;
      formation.add(crystal);
    }
    return formation;
  }
}
