import { Mesh, Vector3 } from 'three';
import { buildShipMesh } from './ShipMeshFactory';
import { ShipKind } from './ShipMeshTypes';

export interface ShipAudit {
  kind: ShipKind;
  parts: number;
  components: number;
  /** Parts not attached to the main body (empty when the hull is sound). */
  orphans: string[];
}

/**
 * Structural QA: every hull must be ONE connected body — no floating plates,
 * fins or pods ("ship slop"). Parts are connected when any sampled vertex of
 * one lies within `eps` of the other's oriented bounding box. The smoke test
 * asserts components === 1 for every kind, at geometry level — which covers
 * every viewing angle at once.
 */
export function auditShipConnectivity(eps = 0.045): ShipAudit[] {
  const kinds: ShipKind[] = [
    'kestrel', 'vanta', 'aegis', 'raider', 'brute', 'turret', 'hauler', 'capital',
  ];
  const local = new Vector3();
  const clamped = new Vector3();
  const results: ShipAudit[] = [];

  for (const kind of kinds) {
    const { group } = buildShipMesh(kind);
    group.updateMatrixWorld(true);
    interface Part {
      name: string;
      verts: Vector3[];
      inv: import('three').Matrix4;
      min: Vector3;
      max: Vector3;
    }
    const parts: Part[] = [];
    group.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const geo = mesh.geometry;
      geo.computeBoundingBox();
      const pos = geo.attributes.position;
      const stride = Math.max(1, Math.floor(pos.count / 120));
      const verts: Vector3[] = [];
      for (let i = 0; i < pos.count; i += stride) {
        verts.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
      }
      // Vertices alone miss face-to-face contact (a box resting mid-face on
      // another part has all CORNERS far away) — add bbox center, face
      // centers and edge midpoints as extra probes.
      const bb = geo.boundingBox!;
      const cx = [bb.min.x, (bb.min.x + bb.max.x) / 2, bb.max.x];
      const cy = [bb.min.y, (bb.min.y + bb.max.y) / 2, bb.max.y];
      const cz = [bb.min.z, (bb.min.z + bb.max.z) / 2, bb.max.z];
      for (const px of cx) for (const py of cy) for (const pz of cz) {
        if (px === cx[1] || py === cy[1] || pz === cz[1]) {
          verts.push(new Vector3(px, py, pz).applyMatrix4(mesh.matrixWorld));
        }
      }
      parts.push({
        name: `${geo.type.replace('Geometry', '')}#${parts.length}`,
        verts,
        inv: mesh.matrixWorld.clone().invert(),
        min: geo.boundingBox!.min,
        max: geo.boundingBox!.max,
      });
    });

    const touches = (a: Part, b: Part): boolean => {
      for (const v of a.verts) {
        local.copy(v).applyMatrix4(b.inv);
        clamped.set(
          Math.max(b.min.x, Math.min(b.max.x, local.x)),
          Math.max(b.min.y, Math.min(b.max.y, local.y)),
          Math.max(b.min.z, Math.min(b.max.z, local.z)),
        );
        if (clamped.distanceToSquared(local) < eps * eps) return true;
      }
      return false;
    };

    // Union-find over pairwise contact.
    const parent = parts.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        if (touches(parts[i], parts[j]) || touches(parts[j], parts[i])) {
          parent[find(i)] = find(j);
        }
      }
    }
    const roots = new Map<number, number[]>();
    parts.forEach((_, i) => {
      const r = find(i);
      if (!roots.has(r)) roots.set(r, []);
      roots.get(r)!.push(i);
    });
    let mainRoot = -1;
    let mainSize = 0;
    for (const [r, members] of roots) {
      if (members.length > mainSize) { mainSize = members.length; mainRoot = r; }
    }
    const orphans: string[] = [];
    parts.forEach((p, i) => { if (find(i) !== mainRoot) orphans.push(p.name); });
    results.push({ kind, parts: parts.length, components: roots.size, orphans });
  }
  return results;
}
