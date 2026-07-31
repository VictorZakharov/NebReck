import {
  AdditiveBlending,
  AmbientLight,
  Box3,
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  FogExp2,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  RingGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/Rng';
import { TURRET_COLLISION_RADIUS } from '../entities/ShipMeshTypes';
import { getSurfaceTexture } from '../rendering/SurfaceTextures';
import { AsteroidBody, makeBody } from './AsteroidField';
import { NebulaSkybox } from './NebulaSkybox';
import { TurretSpawn } from './CaveAsteroid';
import { makeRingTexture } from './Planet';
import { PlanetInfo } from './Sector';
import { buildSurfaceBase } from './PlanetSurfaceBase';
import { buildSurfaceCave } from './PlanetSurfaceCave';
import type {
  BaseKind,
  CaveLandmark,
  CaveWaypoint,
  SurfacePatrol,
  SurfaceStructureHost,
} from './PlanetSurfaceStructures';
import { displaceRock } from './PlanetSurfaceStructures';
export type {
  BaseKind,
  CaveLandmark,
  SurfacePatrol,
} from './PlanetSurfaceStructures';

const dummy = new Object3D();
const zeroMatrix = new Matrix4().makeScale(0, 0, 0);
const obstacleBounds = new Box3();
const obstacleCenter = new Vector3();
const obstacleSize = new Vector3();
const terrainProbe = new Vector3();
const SURFACE_SIZE = 2600;
const SURFACE_SEGMENTS = 180;

const BASE_KINDS: BaseKind[] = ['compound', 'comm', 'depot', 'fortress'];

interface Crater { x: number; z: number; r: number; depth: number }
interface Mountain { x: number; z: number; r: number; h: number }

/**
 * A landable planet surface — the "dungeon" the original Everspace never had.
 * v2: terrain with real drama (mountains, rimmed craters, strata + slope +
 * patch coloring), EXPLORABLE CAVES (hollow rock domes with wide glowing
 * entrances, crystal loot and stashes inside), and 2–3 Vigil bases drawn from
 * four templates, each with its own silhouette, turret mounts and loot.
 * Exposes the same body-list interface the asteroid field does, so
 * projectiles/mining/collisions work unchanged.
 */
export class PlanetSurface {
  readonly group = new Group();
  readonly bodies: AsteroidBody[] = [];
  readonly turretSpawns: TurretSpawn[] = [];
  readonly patrols: SurfacePatrol[] = [];
  readonly fog: FogExp2;
  /** Cave anchors for approach, traversal, and spawn-clearance regressions. */
  readonly caveLandmarks: CaveLandmark[] = [];
  /** Base anchors for the test harness (pad-level center + template). */
  readonly baseLandmarks: { center: Vector3; kind: BaseKind }[] = [];

  private readonly seedA: number;
  private readonly seedB: number;
  private readonly seedC: number;
  private readonly craters: Crater[] = [];
  private readonly mountains: Mountain[] = [];
  /** Flattened foundation discs blended into heightAt under each base. */
  private readonly pads: { x: number; z: number; r: number; h: number }[] = [];
  private readonly baseSites: { x: number; z: number; kind: BaseKind }[] = [];
  /** Gaussian pits carved into heightAt — the cave trenches live IN the
   *  heightfield, so terrain collision stays honest underground. */
  private readonly carves: { x: number; z: number; r: number; depth: number }[] = [];
  /** Planned cave systems: descending waypoint runs (built post-terrain). */
  private readonly caveRuns: { x: number; z: number; r: number; depth: number }[][] = [];
  /**
   * Exact heights of the PlaneGeometry vertices. Runtime ground collision
   * samples the rendered triangles instead of re-evaluating higher-frequency
   * noise between vertices.
   */
  private terrainHeights: Float32Array | null = null;

  constructor(rng: Rng, planet: PlanetInfo) {
    this.seedA = rng.range(0, 6.28);
    this.seedB = rng.range(0, 6.28);
    this.seedC = rng.range(0, 6.28);
    // Landmark features FIRST — heightAt depends on them.
    for (let i = 0; i < rng.int(3, 5); i++) {
      this.craters.push({
        x: rng.range(-1000, 1000),
        z: rng.range(-1000, 1000),
        r: rng.range(90, 200),
        depth: rng.range(25, 55),
      });
    }
    for (let i = 0; i < rng.int(2, 4); i++) {
      this.mountains.push({
        x: rng.range(-1100, 1100),
        z: rng.range(-1100, 1100),
        r: rng.range(160, 320),
        h: rng.range(70, 150),
      });
    }
    // Base sites BEFORE terrain: each registers a flattened foundation pad in
    // heightAt, so installations sit on level ground instead of floating over
    // (or sinking into) bumpy terrain.
    const baseCount = rng.int(2, 3);
    for (let b = 0; b < baseCount; b++) {
      const x = rng.range(-850, 850);
      const z = rng.sign() * rng.range(300, 900);
      const h = this.heightAt(x, z);
      this.baseSites.push({ x, z, kind: rng.pick(BASE_KINDS) });
      this.pads.push({ x, z, r: 95, h });
    }
    // Cave systems: BEFORE terrain build, plan each as a random walk of
    // waypoints descending UNDERGROUND; every waypoint carves a deep pit
    // into heightAt, and overlapping pits form a continuous buried trench.
    for (let i = 0; i < 2; i++) {
      let run: CaveWaypoint[] = [];
      for (let attempt = 0; attempt < 20; attempt++) {
        const candidate: CaveWaypoint[] = [];
        let wx = rng.range(-800, 800);
        let wz = rng.sign() * rng.range(250, 850);
        let heading = rng.range(0, Math.PI * 2);
        const hops = rng.int(3, 5);
        for (let k = 0; k <= hops; k++) {
          candidate.push({
            x: wx,
            z: wz,
            r: k === 0 ? 46 : rng.range(38, 54),
            depth: 26 + k * rng.range(12, 17),
          });
          // A cave is one continuous, flyable passage. Keep each bend broad
          // enough for the ship instead of folding a later waypoint back
          // through an earlier tunnel segment.
          heading += rng.range(-0.4, 0.4);
          const step = rng.range(68, 88);
          wx += Math.cos(heading) * step;
          wz += Math.sin(heading) * step;
        }

        const inBounds = candidate.every(
          (waypoint) =>
            Math.abs(waypoint.x) < 1080 &&
            Math.abs(waypoint.z) < 1080,
        );
        const clearOfBases = candidate.every((waypoint) =>
          this.baseSites.every(
            (base) =>
              (waypoint.x - base.x) ** 2 +
                (waypoint.z - base.z) ** 2 >
              300 ** 2,
          ),
        );
        const clearOfCaves = this.caveRuns.every(
          (other) =>
            (candidate[0].x - other[0].x) ** 2 +
              (candidate[0].z - other[0].z) ** 2 >
            380 ** 2,
        );
        run = candidate;
        if (inBounds && clearOfBases && clearOfCaves) break;
      }
      // Sample the whole route, not just its control points. A curved spline
      // can bow well away from sparse Gaussian pits and leave a solid terrain
      // hump across the visible tunnel.
      for (let segment = 0; segment < run.length - 1; segment++) {
        const from = run[segment];
        const to = run[segment + 1];
        const distance = Math.hypot(to.x - from.x, to.z - from.z);
        const steps = Math.max(2, Math.ceil(distance / 18));
        for (let step = 0; step < steps; step++) {
          const t = step / steps;
          this.carves.push({
            x: from.x + (to.x - from.x) * t,
            z: from.z + (to.z - from.z) * t,
            r: from.r + (to.r - from.r) * t,
            depth: from.depth + (to.depth - from.depth) * t,
          });
        }
      }
      this.carves.push({ ...run[run.length - 1] });

      // Two broad, progressively shallower cuts continue outward from the
      // mouth. They form a terrain ramp into the arch instead of leaving a
      // hard lip that looks open but catches the ship's collision sphere.
      const mouth = run[0];
      const toward = new Vector3(
        run[1].x - mouth.x,
        0,
        run[1].z - mouth.z,
      ).normalize();
      for (let approachStep = 1; approachStep <= 2; approachStep++) {
        const depthFactor = approachStep === 1 ? 0.58 : 0.24;
        this.carves.push({
          x: mouth.x - toward.x * approachStep * 36,
          z: mouth.z - toward.z * approachStep * 36,
          r: approachStep === 1 ? 54 : 48,
          depth: mouth.depth * depthFactor,
        });
      }
      this.caveRuns.push(run);
    }

    // ---- terrain ------------------------------------------------------------
    const geometry = new PlaneGeometry(
      SURFACE_SIZE,
      SURFACE_SIZE,
      SURFACE_SEGMENTS,
      SURFACE_SEGMENTS,
    );
    geometry.rotateX(-Math.PI / 2);
    const pos = geometry.attributes.position as BufferAttribute;
    const terrainHeights = new Float32Array(pos.count);
    const colors = new Float32Array(pos.count * 3);
    const low = planet.surfaceB.clone().multiplyScalar(0.75);
    const high = planet.surfaceA.clone().lerp(new Color(1, 1, 1), 0.2);
    const rockDark = planet.surfaceB.clone().multiplyScalar(0.4);
    const patchTint = planet.atmosphere.clone().lerp(planet.surfaceA, 0.5);
    const tint = new Color();
    let minH = Infinity;
    let maxH = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const h = this.analyticHeightAt(pos.getX(i), pos.getZ(i));
      minH = Math.min(minH, h);
      maxH = Math.max(maxH, h);
      terrainHeights[i] = h;
      pos.setY(i, h);
    }
    this.terrainHeights = terrainHeights;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = pos.getY(i);
      const t = (h - minH) / Math.max(1, maxH - minH);
      tint.copy(low).lerp(high, t);
      // Strata bands: thin lighter/darker elevation rings.
      const band = Math.sin(h * 0.25 + this.seedA * 3) * 0.5 + 0.5;
      tint.lerp(high, band * 0.12);
      // Mineral patches: big soft blotches of the accent-leaning tint.
      const patch =
        Math.sin(x * 0.006 + this.seedB * 2) * Math.sin(z * 0.007 + this.seedC * 2);
      if (patch > 0.35) tint.lerp(patchTint, Math.min(0.5, (patch - 0.35) * 1.1));
      // Slope shading: steep ground reads as bare dark rock.
      const slope =
        Math.abs(this.heightAt(x + 8, z) - h) + Math.abs(this.heightAt(x, z + 8) - h);
      tint.lerp(rockDark, Math.min(0.65, slope * 0.05));
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    // Smooth shading + finer grid + high-frequency detail in heightAt: the
    // flat-shaded low-poly facets read as "pixelated" terrain from the air.
    // Regolith texture multiplies over the vertex-color tinting.
    const regolith = getSurfaceTexture('regolith', 26, 26);
    const terrain = new Mesh(
      geometry,
      new MeshStandardMaterial({
        vertexColors: true, roughness: 0.95, metalness: 0.05,
        map: regolith, bumpMap: regolith, bumpScale: 0.8,
      }),
    );
    terrain.name = 'surface-terrain';
    this.group.add(terrain);

    // ---- sky & light --------------------------------------------------------
    const sky = new NebulaSkybox(
      {
        deep: planet.surfaceB.clone().multiplyScalar(0.25),
        primary: planet.atmosphere.clone().multiplyScalar(0.5),
        secondary: planet.surfaceA.clone().multiplyScalar(0.4),
        accent: planet.atmosphere.clone(),
      },
      new Vector3(rng.range(0, 40), rng.range(0, 40), rng.range(0, 40)),
    );
    this.group.add(sky.mesh);

    if (planet.ring) {
      const band = new Mesh(
        new RingGeometry(2600, 4300, 96, 1),
        new MeshBasicMaterial({
          map: makeRingTexture(planet.atmosphere.clone()),
          side: DoubleSide,
          transparent: true,
          opacity: 0.55,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      band.rotation.x = 1.32;
      band.rotation.z = rng.range(0, Math.PI);
      band.position.y = 400;
      this.group.add(band);
    }

    this.fog = new FogExp2(planet.atmosphere.clone().lerp(planet.surfaceB, 0.6), 0.0011);
    this.group.add(new AmbientLight(planet.atmosphere.clone().lerp(new Color(1, 1, 1), 0.5), 0.7));
    const sun = new DirectionalLight(0xfff2dd, 2.2);
    sun.position.set(600, 900, 300);
    this.group.add(sun);

    // ---- boulders (destructible, palette-tinted) ---------------------------
    const rockDetail = getSurfaceTexture('rock', 2, 2);
    const rockMat = new MeshStandardMaterial({
      color: planet.surfaceA.clone().multiplyScalar(0.75),
      roughness: 0.92, metalness: 0.06, flatShading: true,
      map: rockDetail, bumpMap: rockDetail, bumpScale: 0.7,
    });
    for (let v = 0; v < 2; v++) {
      const rockGeo = new IcosahedronGeometry(1, 1);
      displaceRock(rockGeo, rng, 0.26);
      const count = 45;
      const mesh = new InstancedMesh(rockGeo, rockMat, count);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      for (let i = 0; i < count; i++) {
        let x = rng.range(-1100, 1100);
        let z = rng.range(-1100, 1100);
        if (this.onPad(x, z)) { x += 260; z += 260; } // keep clutter off base pads
        const scale = Math.pow(rng.next(), 1.8) * 16 + 3;
        dummy.position.set(x, this.heightAt(x, z) + scale * 0.4, z);
        dummy.rotation.set(rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28));
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        this.bodies.push(makeBody({
          position: dummy.position.clone(),
          radius: scale * 1.1,
          hp: 24 + scale * 8,
          mesh,
          index: i,
        }));
      }
      this.group.add(mesh);
    }

    // ---- eroded rock formations + crystal landmarks ------------------------
    // Rounded, bounded lobes replace the old tall cones, which could collapse
    // into black needle silhouettes from common flight angles.
    const formationMat = new MeshStandardMaterial({
      color: planet.surfaceB.clone().multiplyScalar(0.6),
      roughness: 0.95, metalness: 0.05, flatShading: true,
      map: rockDetail, bumpMap: rockDetail, bumpScale: 0.7,
    });
    for (let i = 0; i < rng.int(6, 10); i++) {
      let x = rng.range(-1100, 1100);
      let z = rng.range(-1100, 1100);
      if (this.onPad(x, z)) { x += 260; z += 260; }
      const formation = new Group();
      formation.name = 'surface-rock-formation';
      const lobeCount = rng.int(2, 4);
      const baseScale = rng.range(6.5, 12);
      for (let lobeIndex = 0; lobeIndex < lobeCount; lobeIndex++) {
        const geometry = new IcosahedronGeometry(1, 1);
        displaceRock(geometry, rng, 0.2);
        const lobe = new Mesh(geometry, formationMat);
        lobe.name = 'surface-rock-lobe';
        const angle = rng.range(0, Math.PI * 2);
        const spread =
          lobeIndex === 0 ? 0 : rng.range(0.25, 0.72) * baseScale;
        const sx = baseScale * rng.range(0.65, 1.1);
        const sy = baseScale * rng.range(0.58, 1.18);
        const sz = baseScale * rng.range(0.65, 1.1);
        lobe.position.set(
          Math.cos(angle) * spread,
          sy * rng.range(0.55, 0.76),
          Math.sin(angle) * spread,
        );
        lobe.scale.set(sx, sy, sz);
        lobe.rotation.set(
          rng.range(-0.28, 0.28),
          rng.range(0, Math.PI * 2),
          rng.range(-0.28, 0.28),
        );
        formation.add(lobe);
      }
      formation.position.set(x, this.heightAt(x, z), z);
      this.group.add(formation);
      this.registerObstacle(formation, 0.2);
    }
    for (let i = 0; i < rng.int(4, 6); i++) {
      let x = rng.range(-1000, 1000);
      let z = rng.range(-1000, 1000);
      if (this.onPad(x, z)) { x += 260; z += 260; }
      this.addCrystalFormation(rng, x, this.heightAt(x, z), z);
    }

    // ---- Vigil bases: pre-picked sites, four templates ----------------------
    const structureHost: SurfaceStructureHost = {
      group: this.group,
      bodies: this.bodies,
      turretSpawns: this.turretSpawns,
      patrols: this.patrols,
      caveLandmarks: this.caveLandmarks,
      baseLandmarks: this.baseLandmarks,
      heightAt: (x, z) => this.heightAt(x, z),
      registerObstacle: (object, padding) => this.registerObstacle(object, padding),
      addCrystalFormation: (sourceRng, x, y, z) =>
        this.addCrystalFormation(sourceRng, x, y, z),
      addStash: (sourceRng, x, y, z) => this.addStash(sourceRng, x, y, z),
      addTurretPost: (x, y, z, lookX, lookZ) =>
        this.addTurretPost(x, y, z, lookX, lookZ),
    };
    for (const site of this.baseSites) {
      buildSurfaceBase(structureHost, rng, site.x, site.z, site.kind, planet);
    }

    // ---- underground cave systems (trenches carved into heightAt) ----------
    for (const run of this.caveRuns) buildSurfaceCave(structureHost, rng, run, planet);
    // Builders intentionally offer several candidate mounts. Reject any that
    // ended up intersecting later structure/cave collision instead of spawning
    // an invulnerable battery hidden behind that geometry.
    for (let index = this.turretSpawns.length - 1; index >= 0; index--) {
      if (!this.isTurretSpawnClear(this.turretSpawns[index].position)) {
        this.turretSpawns.splice(index, 1);
      }
    }
  }

  /** Interpolate the exact terrain triangles submitted to the renderer. */
  heightAt(x: number, z: number): number {
    const heights = this.terrainHeights;
    const half = SURFACE_SIZE * 0.5;
    if (
      !heights ||
      x < -half ||
      x > half ||
      z < -half ||
      z > half
    ) {
      return this.analyticHeightAt(x, z);
    }

    const gx = ((x + half) / SURFACE_SIZE) * SURFACE_SEGMENTS;
    const gz = ((z + half) / SURFACE_SIZE) * SURFACE_SEGMENTS;
    const ix = Math.min(
      SURFACE_SEGMENTS - 1,
      Math.max(0, Math.floor(gx)),
    );
    const iz = Math.min(
      SURFACE_SEGMENTS - 1,
      Math.max(0, Math.floor(gz)),
    );
    const fx = gx - ix;
    const fz = gz - iz;
    const stride = SURFACE_SEGMENTS + 1;
    const h00 = heights[iz * stride + ix];
    const h10 = heights[iz * stride + ix + 1];
    const h01 = heights[(iz + 1) * stride + ix];
    const h11 = heights[(iz + 1) * stride + ix + 1];

    // PlaneGeometry's two triangles are (00, 01, 10) and (01, 11, 10).
    if (fx + fz <= 1) {
      return h00 + fx * (h10 - h00) + fz * (h01 - h00);
    }
    return (
      h11 +
      (1 - fx) * (h01 - h11) +
      (1 - fz) * (h10 - h11)
    );
  }

  /** Continuous source function sampled into the rendered terrain grid. */
  private analyticHeightAt(x: number, z: number): number {
    let h =
      30 * Math.sin(x * 0.0035 + this.seedA) * Math.sin(z * 0.0032 + this.seedB) +
      14 * Math.sin(x * 0.009 + z * 0.008 + this.seedC) +
      6 * Math.sin(x * 0.028 - z * 0.021 + this.seedA * 2) +
      40 * Math.sin(x * 0.0012 + this.seedB * 1.7) * Math.sin(z * 0.0014 + this.seedC * 0.8) +
      2.4 * Math.sin(x * 0.07 + this.seedB * 3) * Math.sin(z * 0.09 + this.seedA * 2) +
      1.2 * Math.sin(x * 0.16 - z * 0.14 + this.seedC * 3);
    for (const m of this.mountains) {
      const dx = x - m.x;
      const dz = z - m.z;
      h += m.h * Math.exp(-(dx * dx + dz * dz) / (m.r * m.r));
    }
    for (const c of this.craters) {
      const d = Math.sqrt((x - c.x) ** 2 + (z - c.z) ** 2);
      if (d < c.r) {
        h -= c.depth * (Math.cos((Math.PI * d) / c.r) * 0.5 + 0.5); // bowl
      }
      const rimBand = (d - c.r) / (c.r * 0.22);
      h += c.depth * 0.4 * Math.exp(-rimBand * rimBand); // raised rim
    }
    // Cave trenches: deep gaussian pits — the underground lives in the
    // heightfield itself.
    let caveDepth = 0;
    for (const cv of this.carves) {
      const dx = x - cv.x;
      const dz = z - cv.z;
      caveDepth = Math.max(
        caveDepth,
        cv.depth * Math.exp(-(dx * dx + dz * dz) / (cv.r * cv.r)),
      );
    }
    h -= caveDepth;
    // Foundation pads LAST: smoothstep-blend toward level ground under bases.
    for (const p of this.pads) {
      const d = Math.sqrt((x - p.x) ** 2 + (z - p.z) ** 2);
      if (d < p.r) {
        const u = d / p.r;
        const s = u * u * (3 - 2 * u);
        h = p.h + (h - p.h) * s;
      }
    }
    return h;
  }

  /** True when (x, z) lies on a base foundation pad — keep clutter off it. */
  private onPad(x: number, z: number): boolean {
    for (const p of this.pads) {
      if ((x - p.x) ** 2 + (z - p.z) ** 2 < (p.r * 0.85) ** 2) return true;
    }
    return false;
  }

  /** Sample terrain occlusion between two points — true if terrain blocks LOS. */
  segmentTerrainHit(
    from: Vector3,
    to: Vector3,
    out: Vector3,
    includeEnd = true,
  ): boolean {
    const horizontalDistance = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(2, Math.min(96, Math.ceil(horizontalDistance / 6)));
    const lastSample = includeEnd ? steps : steps - 1;
    for (let i = 1; i <= lastSample; i++) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      const z = from.z + (to.z - from.z) * t;
      if (this.heightAt(x, z) > y) {
        let low = (i - 1) / steps;
        let high = t;
        for (let refine = 0; refine < 5; refine++) {
          const mid = (low + high) * 0.5;
          const mx = from.x + (to.x - from.x) * mid;
          const my = from.y + (to.y - from.y) * mid;
          const mz = from.z + (to.z - from.z) * mid;
          if (this.heightAt(mx, mz) > my) high = mid;
          else low = mid;
        }
        out.copy(from).lerp(to, high);
        return true;
      }
    }
    return false;
  }

  isCovered(from: Vector3, to: Vector3): boolean {
    return this.segmentTerrainHit(from, to, terrainProbe, false);
  }

  /** True when the complete turret hit sphere is exposed to incoming fire. */
  isTurretSpawnClear(position: Vector3, padding = 0.08): boolean {
    const radius = TURRET_COLLISION_RADIUS + padding;
    if (position.y - radius <= this.heightAt(position.x, position.z) + 0.05) {
      return false;
    }
    for (const body of this.bodies) {
      if (body.destroyed) continue;
      if (body.box) {
        const dx = Math.max(0, Math.abs(position.x - body.position.x) - body.box.hx);
        const dy = Math.max(0, Math.abs(position.y - body.position.y) - body.box.hy);
        const dz = Math.max(0, Math.abs(position.z - body.position.z) - body.box.hz);
        if (dx * dx + dy * dy + dz * dz < radius * radius) return false;
      } else if (position.distanceToSquared(body.position) < (body.radius + radius) ** 2) {
        return false;
      }
    }
    return true;
  }

  /**
   * Surface spawn using TERRAIN AS COVER: prefer spots far from hostiles
   * whose sightlines the ground physically blocks. Always on the surface.
   */
  pickSpawn(rng: Rng, hostilePositions: Vector3[]): Vector3 {
    let best: Vector3 | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 40; i++) {
      const x = rng.range(-1100, 1100);
      const z = rng.range(-1100, 1100);
      const p = new Vector3(x, this.heightAt(x, z) + 6, z);
      let minDist = Infinity;
      let covered = true;
      for (const h of hostilePositions) {
        minDist = Math.min(minDist, h.distanceTo(p));
        if (!this.isCovered(p, h)) covered = false;
      }
      const score = minDist + (covered ? 500 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best ?? new Vector3(0, this.heightAt(0, 0) + 6, 0);
  }

  destroyRock(body: AsteroidBody): void {
    if (body.destroyed) return;
    body.destroyed = true;
    if (body.mesh) {
      body.mesh.setMatrixAt(body.index, zeroMatrix);
      body.mesh.instanceMatrix.needsUpdate = true;
    }
    if (body.solo) body.solo.visible = false;
    body.ore = null;
    body.orePoints.length = 0;
  }

  depleteOre(body: AsteroidBody): void {
    body.ore = null; // surface crystals release their ore on destruction only
    body.orePoints.length = 0;
  }

  spawnChild(_position: Vector3, _radius: number, _rng: Rng, _palette?: number): AsteroidBody | null {
    return null; // surface rocks shatter without calving
  }

  // ---- construction helpers -------------------------------------------------

  /** Register a visible static object as a tight world-space AABB so sight,
   * projectiles and flight collision agree with what is drawn. */
  private registerObstacle(object: Object3D, padding = 0.12): void {
    object.updateWorldMatrix(true, true);
    obstacleBounds.setFromObject(object);
    if (obstacleBounds.isEmpty()) return;
    obstacleBounds.getCenter(obstacleCenter);
    obstacleBounds.getSize(obstacleSize);
    const hx = obstacleSize.x * 0.5 + padding;
    const hy = obstacleSize.y * 0.5 + padding;
    const hz = obstacleSize.z * 0.5 + padding;
    const radius = Math.hypot(hx, hy, hz);
    if (radius < 0.45) return;
    this.bodies.push(makeBody({
      position: obstacleCenter.clone(),
      radius,
      hp: Number.POSITIVE_INFINITY,
      hero: true,
      box: { hx, hy, hz },
    }));
  }

  /** Emissive crystal cluster; destroying it drops Ion Crystals. */
  private addCrystalFormation(rng: Rng, x: number, y: number, z: number): void {
    const cluster = new Group();
    const orePoints: Vector3[] = [];
    const mat = new MeshStandardMaterial({
      color: 0x0a1412, emissive: new Color(0x2ee6c8), emissiveIntensity: 2.1,
      roughness: 0.25, metalness: 0.1, flatShading: true,
    });
    for (let s = 0; s < 4; s++) {
      const spike = new Mesh(new OctahedronGeometry(1, 0), mat);
      spike.position.set(rng.range(-2.5, 2.5), rng.range(0, 1.5), rng.range(-2.5, 2.5));
      spike.scale.set(rng.range(0.9, 1.6), rng.range(2.6, 5), rng.range(0.9, 1.6));
      spike.rotation.set(rng.range(-0.3, 0.3), rng.range(0, 6), rng.range(-0.3, 0.3));
      cluster.add(spike);
      orePoints.push(spike.position.clone().add(new Vector3(x, y + 1, z)));
    }
    cluster.position.set(x, y + 1, z);
    this.group.add(cluster);
    this.bodies.push(makeBody({
      position: cluster.position.clone(),
      radius: 5,
      hp: 30,
      solo: cluster,
      ore: 'crystal',
      oreHp: Number.POSITIVE_INFINITY,
      orePoints,
    }));
  }

  /** Armored loot cache with the glowing amber seam. */
  private addStash(rng: Rng, x: number, y: number, z: number): void {
    const box = new Group();
    const shell = new Mesh(
      new BoxGeometry(4.2, 2.6, 2.8),
      new MeshStandardMaterial({ color: 0x2c3238, metalness: 0.75, roughness: 0.35, flatShading: true }),
    );
    box.add(shell);
    const seam = new Mesh(
      new BoxGeometry(4.3, 0.18, 0.5),
      new MeshStandardMaterial({ color: 0x110800, emissive: new Color(0xffb347), emissiveIntensity: 3 }),
    );
    box.add(seam);
    box.position.set(x, y, z);
    box.rotation.y = rng.range(0, 6.28);
    this.group.add(box);
    this.bodies.push(makeBody({
      position: box.position.clone(),
      radius: 3.5,
      hp: 26,
      solo: box,
      stash: true,
    }));
  }

  /** Octagonal mounting pad + a turret post on top of it. */
  private addTurretPost(x: number, y: number, z: number, lookX: number, lookZ: number): void {
    const pad = new Mesh(
      new CylinderGeometry(2.6, 3.2, 1.2, 8),
      new MeshStandardMaterial({ color: 0x3a4048, metalness: 0.6, roughness: 0.45, flatShading: true }),
    );
    pad.position.set(x, y + 0.5, z);
    this.group.add(pad);
    this.turretSpawns.push({
      // Root at +2.0 seats the visible base on the pad while keeping the tight
      // central hit sphere just above padded rooftop AABBs.
      position: new Vector3(x, y + 2.0, z),
      lookAt: new Vector3(lookX, y + 30, lookZ),
    });
  }

  /**
   * One Vigil installation from a template. v3 "real base" pass: every base
   * sits on a flattened foundation pad with a dark apron plate, perimeter
   * warning pylons, lit windows, floodlight poles, cargo clutter, service
   * pipes and a marked landing pad — then the template adds its silhouette.
   */


  /**
   * Underground cave system v4. A single tapered, roughened tunnel follows
   * the carved trench, so there are no disconnected roof slabs or visual
   * seams. Collision samples only its shoulders and ceiling, leaving the
   * visible interior genuinely flyable.
   */

}
