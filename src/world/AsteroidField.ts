import {
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  Quaternion,
  RepeatWrapping,
  Vector3,
} from 'three';
import { Rng } from '../core/Rng';

let rockTex: CanvasTexture | null = null;

/**
 * Shared procedural rock surface: speckles, micro-craters and hairline
 * cracks on a neutral grey — multiplied by each palette's color and reused
 * as a bump map for lighting detail. Fixed-seed PRNG keeps baselines stable.
 */
function makeRockTexture(): CanvasTexture {
  if (rockTex) return rockTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  let s = 1337 >>> 0;
  const rnd = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  g.fillStyle = '#a9a49c';
  g.fillRect(0, 0, 256, 256);
  // Mottled speckle bed — high contrast so it survives palette tinting.
  for (let i = 0; i < 700; i++) {
    const shade = 110 + Math.floor(rnd() * 110);
    g.fillStyle = `rgba(${shade}, ${shade - 5}, ${shade - 11}, ${0.2 + rnd() * 0.22})`;
    g.beginPath();
    g.ellipse(rnd() * 256, rnd() * 256, 1 + rnd() * 6, 1 + rnd() * 6, rnd() * 3.14, 0, 6.28);
    g.fill();
  }
  // Micro-craters: dark bowl + bright rim arc.
  for (let i = 0; i < 22; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const r = 5 + rnd() * 13;
    g.fillStyle = 'rgba(52, 48, 43, 0.42)';
    g.beginPath();
    g.arc(x, y, r, 0, 6.28);
    g.fill();
    g.strokeStyle = 'rgba(240, 235, 225, 0.5)';
    g.lineWidth = 1.8;
    g.beginPath();
    g.arc(x, y, r, rnd() * 3, rnd() * 2 + 2.4);
    g.stroke();
  }
  // Hairline cracks.
  g.strokeStyle = 'rgba(42, 38, 34, 0.55)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 12; i++) {
    let x = rnd() * 256;
    let y = rnd() * 256;
    g.beginPath();
    g.moveTo(x, y);
    for (let seg = 0; seg < 5; seg++) {
      x += (rnd() - 0.5) * 60;
      y += (rnd() - 0.5) * 60;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  rockTex = new CanvasTexture(c);
  rockTex.wrapS = RepeatWrapping;
  rockTex.wrapT = RepeatWrapping;
  rockTex.repeat.set(2, 2);
  return rockTex;
}

export type OreType = 'crystal' | 'scrap';

/** Anything hideable — Mesh or Group both qualify. */
export interface Object3DLike {
  visible: boolean;
}

export interface AsteroidBody {
  position: Vector3;
  radius: number;
  /** Structural hitpoints — reach 0 and the rock shatters. */
  hp: number;
  destroyed: boolean;
  /** Which instance of which rock mesh this body is (for hiding on destroy). */
  mesh: InstancedMesh | null;
  index: number;
  /** Material palette index (children inherit their parent's rock type). */
  palette: number;
  /** Standalone-mesh bodies (cave boulders, interior rocks, stashes, wrecks). */
  solo: Object3DLike | null;
  /** Optional tight axis-aligned box collider (buildings) — `radius` then
   *  serves only as the broadphase bound. */
  box: { hx: number; hy: number; hz: number } | null;
  /** Cave-structure boulder: indestructible, never splits. */
  hero: boolean;
  /** Thin sampled collider belonging to a visible planetary cave arch. */
  caveShell: boolean;
  /** Secret cache: destroying it bursts a mixed loot drop. */
  stash: boolean;
  /** Non-null while the rock still carries a minable ore vein. */
  ore: OreType | null;
  oreHp: number;
  /** Which instance of which crystal mesh visualizes the vein. */
  crystalMesh: InstancedMesh | null;
  crystalIndex: number;
  /** World-space crystal centers used for true vein aiming/visibility. */
  orePoints: Vector3[];
}

/** Fresh body record with the common defaults filled in. */
export function makeBody(partial: Partial<AsteroidBody> & Pick<AsteroidBody, 'position' | 'radius' | 'hp'>): AsteroidBody {
  return {
    destroyed: false,
    mesh: null,
    index: -1,
    palette: 0,
    solo: null,
    box: null,
    hero: false,
    caveShell: false,
    stash: false,
    ore: null,
    oreHp: Infinity,
    crystalMesh: null,
    crystalIndex: -1,
    orePoints: [],
    ...partial,
  };
}

/** Rock material families — clusters get a family each, so regions of the
 *  sector read as distinct: rusty iron, pale ice, warm copper, dark basalt. */
const ROCK_PALETTES = [
  { color: 0x746f67, roughness: 0.94, metalness: 0.04 }, // iron (also scattered filler)
  { color: 0x8d9da6, roughness: 0.76, metalness: 0.02 }, // ice-rich stone
  { color: 0x77543d, roughness: 0.9, metalness: 0.08 },  // copper-bearing rock
  { color: 0x383d45, roughness: 0.97, metalness: 0.03 }, // basalt
];

const dummy = new Object3D();
const spinQuat = new Quaternion();
const tmpMat = new Matrix4();
const spinRotMat = new Matrix4();
const spinAboutMat = new Matrix4();
const spinToOrigin = new Matrix4();
const zeroMatrix = new Matrix4().makeScale(0, 0, 0);
const rockNormal = new Vector3();
const crystalNormal = new Vector3();
const crystalTangent = new Vector3();
const crystalBitangent = new Vector3();
const UP = new Vector3(0, 1, 0);
const RIGHT = new Vector3(1, 0, 0);

interface Placement {
  pos: Vector3;
  scale: number;
  palette: number;
  variant: number;
  /** Per-axis stretch: round rocks, cigars and slabs — not just spheres. */
  stretch: [number, number, number];
}

/** Shape family roll: 60% round-ish, 25% elongated, 15% flattened slab. */
function rollStretch(rng: Rng): [number, number, number] {
  const roll = rng.next();
  const s: [number, number, number] = [
    rng.range(0.9, 1.15), rng.range(0.9, 1.15), rng.range(0.9, 1.15),
  ];
  const axis = rng.int(0, 2);
  if (roll < 0.25) s[axis] = rng.range(1.5, 2.0);      // cigar
  else if (roll < 0.4) s[axis] = rng.range(0.5, 0.65); // slab
  return s;
}

/**
 * Clustered instanced asteroid field: ~6 material-themed clusters plus
 * scattered filler rocks, spread across the whole flight envelope. Every
 * rock is a destructible collider; big ones split into palette-matched
 * children drawn from reserved instance slots.
 */
export class AsteroidField {
  readonly meshes: InstancedMesh[] = [];
  readonly bodies: AsteroidBody[] = [];

  private readonly spins: {
    body: AsteroidBody;
    mesh: InstancedMesh;
    index: number;
    axis: Vector3;
    speed: number;
  }[] =
    [];
  private readonly freeSlots = new Map<number, { mesh: InstancedMesh; index: number }[]>();

  constructor(rng: Rng, count: number, fieldRadius: number, exclusionRadius = 120) {
    // Cluster plan.
    const clusters = Array.from({ length: 6 }, () => {
      const [dx, dy, dz] = rng.unitSphere();
      const dist = rng.range(exclusionRadius + 180, fieldRadius * 0.88);
      return {
        center: new Vector3(dx * dist, dy * dist * 0.35, dz * dist),
        radius: rng.range(140, 280),
        palette: rng.int(0, ROCK_PALETTES.length - 1),
      };
    });

    // Decide every rock's placement first, then batch by palette × variant.
    const placements: Placement[] = [];
    for (let i = 0; i < count; i++) {
      const scale = Math.pow(rng.next(), 2.2) * 26 + 3;
      if (rng.chance(0.8)) {
        const c = rng.pick(clusters);
        const [dx, dy, dz] = rng.unitSphere();
        const r = Math.pow(rng.next(), 0.7) * c.radius;
        placements.push({
          pos: new Vector3(c.center.x + dx * r, c.center.y + dy * r * 0.55, c.center.z + dz * r),
          scale,
          palette: c.palette,
          variant: rng.int(0, 2),
          stretch: rollStretch(rng),
        });
      } else {
        const [dx, dy, dz] = rng.unitSphere();
        const dist = exclusionRadius + Math.pow(rng.next(), 0.6) * (fieldRadius - exclusionRadius);
        placements.push({
          pos: new Vector3(dx * dist, dy * dist * 0.45, dz * dist),
          scale,
          palette: 0,
          variant: rng.int(0, 2),
          stretch: rollStretch(rng),
        });
      }
    }

    for (let p = 0; p < ROCK_PALETTES.length; p++) {
      const def = ROCK_PALETTES[p];
      const material = new MeshStandardMaterial({
        color: new Color(def.color),
        roughness: def.roughness,
        metalness: def.metalness,
        map: makeRockTexture(), // speckle/crater/crack surface detail
        bumpMap: makeRockTexture(),
        bumpScale: 0.8,
      });
      this.freeSlots.set(p, []);

      for (let v = 0; v < 3; v++) {
        const items = placements.filter((pl) => pl.palette === p && pl.variant === v);
        // Dense enough for close fly-bys. Variant 2 stays craggier without
        // turning a large asteroid into a twenty-face die.
        const geometry = new IcosahedronGeometry(1, v === 2 ? 1 : 2);
        displace(geometry, rng, v === 2 ? 0.3 : undefined);
        // Reserve capacity beyond the initial rocks for split-off children.
        const capacity = Math.max(items.length * 2, 8);
        const mesh = new InstancedMesh(geometry, material, capacity);
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);

        items.forEach((pl, i) => {
          dummy.position.copy(pl.pos);
          dummy.rotation.set(rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28));
          dummy.scale.set(
            pl.scale * pl.stretch[0], pl.scale * pl.stretch[1], pl.scale * pl.stretch[2],
          );
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);

          // ~1 in 5 rocks carries a glowing ore vein worth mining.
          const oreRoll = rng.next();
          const ore: OreType | null = oreRoll < 0.13 ? 'crystal' : oreRoll < 0.22 ? 'scrap' : null;
          const maxAxis = Math.max(...pl.stretch);
          const body = makeBody({
            position: pl.pos.clone(),
            radius: pl.scale * 1.15 * (0.7 * maxAxis + 0.3),
            hp: 24 + pl.scale * 8, // small rocks pop, big ones soak sustained fire
            mesh,
            index: i,
            palette: p,
            ore,
            oreHp: 26 + pl.scale * 0.8,
          });
          this.bodies.push(body);

          if (i % 3 === 0) {
            // Only a third tumble — keeps the per-frame matrix writes cheap.
            const [ax, ay, az] = rng.unitSphere();
            this.spins.push({
              body,
              mesh,
              index: i,
              axis: new Vector3(ax, ay, az),
              speed: rng.range(0.05, 0.3),
            });
          }
        });

        for (let i = items.length; i < capacity; i++) {
          mesh.setMatrixAt(i, zeroMatrix);
          this.freeSlots.get(p)!.push({ mesh, index: i });
        }
        mesh.instanceMatrix.needsUpdate = true;
        this.meshes.push(mesh);
      }
    }

    this.buildOreCrystals(rng);
  }

  /** Emissive crystal spikes on ore-bearing rocks (teal = crystal, amber = scrap). */
  private buildOreCrystals(rng: Rng): void {
    const byOre: Record<OreType, AsteroidBody[]> = { crystal: [], scrap: [] };
    for (const b of this.bodies) if (b.ore) byOre[b.ore].push(b);

    const colors: Record<OreType, number> = { crystal: 0x2ee6c8, scrap: 0xffa040 };
    for (const ore of ['crystal', 'scrap'] as const) {
      const rich = byOre[ore];
      if (rich.length === 0) continue;
      const mat = new MeshStandardMaterial({
        color: 0x0a1412,
        emissive: new Color(colors[ore]),
        emissiveIntensity: 1.9,
        roughness: 0.25,
        metalness: 0.1,
        flatShading: true,
      });
      // Three spikes per rock, jutting at different angles.
      const mesh = new InstancedMesh(new OctahedronGeometry(1, 0), mat, rich.length * 3);
      rich.forEach((body, bi) => {
        body.crystalMesh = mesh;
        body.crystalIndex = bi * 3;
        body.orePoints.length = 0;
        const [nx, ny, nz] = rng.unitSphere();
        rockNormal.set(nx, ny, nz).normalize();
        crystalTangent
          .crossVectors(rockNormal, Math.abs(rockNormal.y) < 0.9 ? UP : RIGHT)
          .normalize();
        crystalBitangent.crossVectors(rockNormal, crystalTangent).normalize();
        for (let s = 0; s < 3; s++) {
          crystalNormal
            .copy(rockNormal)
            .addScaledVector(crystalTangent, rng.range(-0.16, 0.16))
            .addScaledVector(crystalBitangent, rng.range(-0.16, 0.16))
            .normalize();
          dummy.position
            .copy(body.position)
            .addScaledVector(rockNormal, body.radius * 0.78)
            .addScaledVector(crystalTangent, (s - 1) * body.radius * 0.11)
            .addScaledVector(crystalBitangent, rng.range(-0.08, 0.08) * body.radius);
          dummy.quaternion.setFromUnitVectors(UP, crystalNormal);
          dummy.scale.set(
            body.radius * 0.12,
            body.radius * rng.range(0.25, 0.33),
            body.radius * 0.12,
          );
          dummy.updateMatrix();
          mesh.setMatrixAt(bi * 3 + s, dummy.matrix);
          body.orePoints.push(dummy.position.clone());
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.meshes.push(mesh);
    }
  }

  /** Called when a vein is mined out: hide its crystals, mark the rock barren. */
  depleteOre(body: AsteroidBody): void {
    if (body.crystalMesh) {
      for (let s = 0; s < 3; s++) {
        body.crystalMesh.setMatrixAt(body.crystalIndex + s, zeroMatrix);
      }
      body.crystalMesh.instanceMatrix.needsUpdate = true;
    }
    body.ore = null;
    body.crystalMesh = null;
    body.orePoints.length = 0;
  }

  /** Shatter a rock: hide its instance (and any crystals), mark it gone. */
  destroyRock(body: AsteroidBody): void {
    if (body.destroyed) return;
    body.destroyed = true;
    if (body.mesh) {
      body.mesh.setMatrixAt(body.index, zeroMatrix);
      body.mesh.instanceMatrix.needsUpdate = true;
    }
    if (body.solo) body.solo.visible = false;
    if (body.ore) this.depleteOre(body);
  }

  /** Split-off child rock, palette-matched to its parent. */
  spawnChild(position: Vector3, radius: number, rng: Rng, palette = 0): AsteroidBody | null {
    let slots = this.freeSlots.get(palette);
    if (!slots || slots.length === 0) {
      // Fall back to any palette with room rather than dropping the child.
      for (const s of this.freeSlots.values()) {
        if (s.length > 0) {
          slots = s;
          break;
        }
      }
    }
    const slot = slots?.pop();
    if (!slot) return null;
    const scale = radius / 1.15;
    dummy.position.copy(position);
    dummy.rotation.set(rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28));
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    slot.mesh.setMatrixAt(slot.index, dummy.matrix);
    slot.mesh.instanceMatrix.needsUpdate = true;
    const body = makeBody({
      position: position.clone(),
      radius,
      hp: 24 + scale * 8,
      mesh: slot.mesh,
      index: slot.index,
      palette,
    });
    this.bodies.push(body);
    return body;
  }

  update(dt: number): void {
    for (const s of this.spins) {
      s.mesh.getMatrixAt(s.index, tmpMat);
      spinQuat.setFromAxisAngle(s.axis, s.speed * dt);
      spinRotMat.makeRotationFromQuaternion(spinQuat);
      spinToOrigin.copy(tmpMat).invert();
      tmpMat.multiply(spinRotMat);
      s.mesh.setMatrixAt(s.index, tmpMat);
      if (s.body.crystalMesh) {
        // Exact incremental world transform of the parent instance, including
        // its initial orientation/non-uniform stretch.
        spinAboutMat.copy(tmpMat).multiply(spinToOrigin);
        for (let i = 0; i < 3; i++) {
          const crystalIndex = s.body.crystalIndex + i;
          s.body.crystalMesh.getMatrixAt(crystalIndex, tmpMat);
          tmpMat.premultiply(spinAboutMat);
          s.body.crystalMesh.setMatrixAt(crystalIndex, tmpMat);
          s.body.orePoints[i]?.applyMatrix4(spinAboutMat);
        }
        s.body.crystalMesh.instanceMatrix.needsUpdate = true;
      }
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}

/**
 * Rocky silhouette via radial displacement. IcosahedronGeometry is
 * NON-indexed (vertices duplicated per face), so displacement must be a pure
 * function of vertex position — duplicated corners then move identically and
 * the mesh stays watertight instead of tearing into shards.
 */
function displace(geometry: IcosahedronGeometry, rng: Rng, amountOverride?: number): void {
  const pos = geometry.attributes.position;
  const v = new Vector3();
  const amount = amountOverride ?? rng.range(0.14, 0.24);
  const seed = rng.range(0, 100);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Cheap continuous value noise: layered sines of position.
    const n =
      Math.sin(v.x * 3.1 + seed) +
      Math.sin(v.y * 4.3 + seed * 1.7) +
      Math.sin(v.z * 3.7 + seed * 2.3) +
      0.6 * Math.sin(v.x * 7.9 + v.y * 6.1 + v.z * 5.3 + seed * 3.1);
    v.multiplyScalar(1 + (n / 3.6) * amount);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  // PolyhedronGeometry duplicates corners per triangle, so its computed
  // normals otherwise preserve giant visible facets. Radial normals keep the
  // irregular silhouette while producing continuous standard-material light.
  const normal = geometry.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    rockNormal.fromBufferAttribute(pos, i).normalize();
    normal.setXYZ(i, rockNormal.x, rockNormal.y, rockNormal.z);
  }
  normal.needsUpdate = true;
}
