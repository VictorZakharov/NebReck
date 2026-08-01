import { BufferGeometry, Group, Material, Matrix4, Mesh } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const SOURCE_LAYER = 31;
const relativeTransform = new Matrix4();
const inverseRoot = new Matrix4();

/**
 * Merge static primitives by material while retaining their source parts for
 * structural QA, collision metadata, and physical destruction. Source parts
 * move to a camera-disabled layer; the fused copies are rendering-only.
 */
export function batchStaticMeshes(root: Group): void {
  root.updateMatrixWorld(true);
  inverseRoot.copy(root.matrixWorld).invert();
  const byMaterial = new Map<Material, Mesh[]>();
  const sources: Mesh[] = [];

  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    if (mesh.userData.excludeFromBatching) return;
    sources.push(mesh);
    const material = mesh.material as Material;
    const group = byMaterial.get(material);
    if (group) group.push(mesh);
    else byMaterial.set(material, [mesh]);
  });

  let batchCount = 0;
  for (const [material, meshes] of byMaterial) {
    if (meshes.length < 2) continue;
    const transformed: BufferGeometry[] = [];
    for (const mesh of meshes) {
      relativeTransform.multiplyMatrices(inverseRoot, mesh.matrixWorld);
      const clone = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      clone.applyMatrix4(relativeTransform);
      transformed.push(clone);
    }
    const geometry = mergeGeometries(transformed, false);
    for (const clone of transformed) clone.dispose();
    if (!geometry) continue;

    const batch = new Mesh(geometry, material);
    batch.name = `static-render-batch-${batchCount++}`;
    batch.castShadow = meshes.some((mesh) => mesh.castShadow);
    batch.receiveShadow = meshes.some((mesh) => mesh.receiveShadow);
    batch.userData.renderBatch = true;
    batch.userData.excludeFromDebris = true;
    batch.userData.excludeFromConnectivityAudit = true;
    root.add(batch);

    for (const mesh of meshes) {
      mesh.layers.set(SOURCE_LAYER);
      mesh.userData.renderBatchSource = true;
    }
  }

  const renderedSources = sources.filter((mesh) => !mesh.userData.renderBatchSource).length;
  root.userData.renderBatchStats = {
    sourceMeshes: sources.length,
    renderMeshes: renderedSources + batchCount,
  };
}
