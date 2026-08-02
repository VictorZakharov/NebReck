import {
  BufferGeometry,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AsteroidBody } from '../world/AsteroidField';

const PRESERVED_NAMES = new Set([
  'surface-terrain',
  'cave-tunnel',
  'surface-rock-lobe',
  'cave-rock-lobe',
]);

export interface SurfaceBatchStats {
  sourceMeshes: number;
  batches: number;
}

/**
 * Merge immutable, opaque surface decoration by shared material.
 *
 * Collision bodies retain their original world-space bounds; only their
 * presentation meshes are consolidated. Destructible meshes and named test
 * landmarks stay independent, as do instanced rocks and transparent pieces.
 */
export function batchSurfaceStatics(
  root: Group,
  bodies: readonly AsteroidBody[],
): SurfaceBatchStats {
  root.updateWorldMatrix(true, true);
  const protectedRoots = new Set<Object3D>();
  for (const body of bodies) {
    if (body.solo instanceof Object3D && Number.isFinite(body.hp)) {
      protectedRoots.add(body.solo);
    }
  }

  const groups = new Map<string, { material: Material; meshes: Mesh[] }>();
  root.traverse((object) => {
    if (!(object instanceof Mesh) || object instanceof InstancedMesh) return;
    if (!object.visible || object.children.length > 0) return;
    if (PRESERVED_NAMES.has(object.name) || hasProtectedAncestor(object, root, protectedRoots)) {
      return;
    }
    if (Array.isArray(object.material) || object.material.transparent) return;
    const signature = geometrySignature(object.geometry);
    const key = `${object.material.uuid}:${signature}`;
    const existing = groups.get(key);
    if (existing) existing.meshes.push(object);
    else groups.set(key, { material: object.material, meshes: [object] });
  });

  const rootInverse = new Matrix4().copy(root.matrixWorld).invert();
  const localMatrix = new Matrix4();
  let sourceMeshes = 0;
  let batches = 0;
  for (const { material, meshes } of groups.values()) {
    if (meshes.length < 2) continue;
    const transformed: BufferGeometry[] = [];
    for (const mesh of meshes) {
      localMatrix.multiplyMatrices(rootInverse, mesh.matrixWorld);
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(localMatrix);
      transformed.push(geometry);
    }
    const merged = mergeGeometries(transformed, false);
    for (const geometry of transformed) geometry.dispose();
    if (!merged) continue;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const batch = new Mesh(merged, material);
    batch.name = 'surface-static-batch';
    root.add(batch);
    for (const mesh of meshes) mesh.removeFromParent();
    sourceMeshes += meshes.length;
    batches++;
  }
  return { sourceMeshes, batches };
}

function hasProtectedAncestor(
  object: Object3D,
  root: Object3D,
  protectedRoots: ReadonlySet<Object3D>,
): boolean {
  let current: Object3D | null = object;
  while (current && current !== root) {
    if (protectedRoots.has(current)) return true;
    current = current.parent;
  }
  return false;
}

function geometrySignature(geometry: BufferGeometry): string {
  const attributes = Object.entries(geometry.attributes)
    .map(([name, attribute]) =>
      `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`)
    .sort()
    .join('|');
  return `${geometry.index ? 'indexed' : 'plain'}:${attributes}`;
}
