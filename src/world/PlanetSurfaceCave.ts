import {
  BufferGeometry,
  CatmullRomCurve3,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Vector3,
} from 'three';
import { Rng } from '../core/Rng';
import { getSurfaceTexture } from '../rendering/SurfaceTextures';
import { makeBody } from './AsteroidField';
import { PlanetInfo } from './Sector';
import {
  CaveWaypoint,
  displaceRock,
  SurfaceStructureHost,
} from './PlanetSurfaceStructures';

const UP = new Vector3(0, 1, 0);

export function buildSurfaceCave(
  host: SurfaceStructureHost,
  rng: Rng,
  run: CaveWaypoint[],
  planet: PlanetInfo,
): void {
  new SurfaceCaveBuilder(host).build(rng, run, planet);
}

/**
 * Builds an open-bottomed rock arch over the terrain trench. The visual mesh
 * and every collision sample use the same profile function, so there is no
 * hidden solid tube occupying the space the player can see.
 */
class SurfaceCaveBuilder {
  constructor(private readonly host: SurfaceStructureHost) {}

  private get group() { return this.host.group; }
  private get bodies() { return this.host.bodies; }
  private get caveLandmarks() { return this.host.caveLandmarks; }
  private heightAt(x: number, z: number): number { return this.host.heightAt(x, z); }
  private registerObstacle(object: Object3D, padding?: number): void {
    this.host.registerObstacle(object, padding);
  }
  private addCrystalFormation(rng: Rng, x: number, y: number, z: number): void {
    this.host.addCrystalFormation(rng, x, y, z);
  }
  private addStash(rng: Rng, x: number, y: number, z: number): void {
    this.host.addStash(rng, x, y, z);
  }
  private addTurretPost(
    x: number,
    y: number,
    z: number,
    lookX: number,
    lookZ: number,
  ): void {
    this.host.addTurretPost(x, y, z, lookX, lookZ);
  }

  private bodyClearance(point: Vector3): number {
    let clearance = Number.POSITIVE_INFINITY;
    for (const body of this.bodies) {
      if (body.destroyed) continue;
      if (body.box) {
        const dx = Math.max(
          0,
          Math.abs(point.x - body.position.x) - body.box.hx,
        );
        const dy = Math.max(
          0,
          Math.abs(point.y - body.position.y) - body.box.hy,
        );
        const dz = Math.max(
          0,
          Math.abs(point.z - body.position.z) - body.box.hz,
        );
        clearance = Math.min(clearance, Math.hypot(dx, dy, dz));
      } else {
        clearance = Math.min(
          clearance,
          point.distanceTo(body.position) - body.radius,
        );
      }
    }
    return clearance;
  }

  private clearest(candidates: Vector3[]): Vector3 {
    let best = candidates[0];
    let bestClearance = this.bodyClearance(best);
    for (let index = 1; index < candidates.length; index++) {
      const clearance = this.bodyClearance(candidates[index]);
      if (clearance > bestClearance) {
        best = candidates[index];
        bestClearance = clearance;
      }
    }
    return best;
  }

  build(rng: Rng, run: CaveWaypoint[], planet: PlanetInfo): void {
    const caveRock = getSurfaceTexture('rock', 1, 1);
    const caveTint = planet.surfaceB
      .clone()
      .lerp(planet.surfaceA, 0.32)
      .multiplyScalar(0.62);
    const rockMat = new MeshStandardMaterial({
      color: caveTint,
      emissive: caveTint.clone().multiplyScalar(0.16),
      emissiveIntensity: 0.48,
      roughness: 0.96,
      metalness: 0.04,
      side: DoubleSide,
      map: caveRock,
      bumpMap: caveRock,
      bumpScale: 0.8,
    });
    const boulderMat = new MeshStandardMaterial({
      color: caveTint.clone().multiplyScalar(0.9),
      emissive: caveTint.clone().multiplyScalar(0.14),
      emissiveIntensity: 0.45,
      roughness: 0.95,
      metalness: 0.05,
      flatShading: true,
      side: DoubleSide,
      map: caveRock,
      bumpMap: caveRock,
      bumpScale: 0.8,
    });
    const rockLobe = (
      px: number,
      pz: number,
      h: number,
      r: number,
      down: boolean,
      baseY: number,
    ): void => {
      const geometry = new IcosahedronGeometry(1, 1);
      displaceRock(geometry, rng, 0.24);
      const mesh = new Mesh(geometry, boulderMat);
      mesh.name = 'cave-rock-lobe';
      const sx = r * rng.range(0.9, 1.25);
      const sy = Math.min(h * rng.range(0.34, 0.44), r * 1.75);
      const sz = r * rng.range(0.9, 1.25);
      mesh.scale.set(
        sx,
        sy,
        sz,
      );
      mesh.position.set(
        px,
        baseY + (down ? -h * 0.22 : h * 0.3),
        pz,
      );
      mesh.rotation.z = rng.range(-0.25, 0.25);
      mesh.rotation.y = rng.range(0, Math.PI * 2);
      this.group.add(mesh);
      this.registerObstacle(mesh, 0.15);
    };

    const mouth = run[0];
    const tunnelRadius = Math.max(
      23,
      Math.min(
        30,
        run.reduce((sum, waypoint) => sum + waypoint.r, 0) /
          run.length *
          0.58,
      ),
    );
    const pathPoints = run.map((waypoint) => {
      const floorY = this.heightAt(waypoint.x, waypoint.z);
      return new Vector3(
        waypoint.x,
        floorY + tunnelRadius * 0.5,
        waypoint.z,
      );
    });
    const curve = new CatmullRomCurve3(pathPoints, false, 'centripetal');
    const pathLength = curve.getLength();
    const profileSeed = rng.range(0, 1000);
    const tunnelGeometry = createCaveArchGeometry(
      curve,
      pathLength,
      tunnelRadius,
      profileSeed,
      (x, z) => this.heightAt(x, z),
    );
    const tunnel = new Mesh(tunnelGeometry, rockMat);
    tunnel.name = 'cave-tunnel';
    this.group.add(tunnel);

    // A chain of small spheres sits OUTSIDE the rendered arch. Each sphere's
    // inner tangent nearly coincides with the visible rock, replacing the old
    // three giant overlapping balls whose invisible volume filled the cave.
    const colliderRadius = 5;
    const colliderSpacing = 6.5;
    const shellRings = Math.max(
      28,
      Math.ceil(pathLength / colliderSpacing),
    );
    const shellArcs = Math.max(
      16,
      Math.ceil(
        (Math.PI * (tunnelRadius + colliderRadius)) /
          colliderSpacing,
      ),
    );
    const shellPoint = new Vector3();
    const shellNormal = new Vector3();
    for (let ring = 0; ring <= shellRings; ring++) {
      const t = ring / shellRings;
      for (let arc = 0; arc <= shellArcs; arc++) {
        sampleCaveArch(
          curve,
          t,
          arc / shellArcs,
          tunnelRadius,
          profileSeed,
          (x, z) => this.heightAt(x, z),
          shellPoint,
          shellNormal,
        );
        this.bodies.push(makeBody({
          position: shellPoint
            .clone()
            .addScaledVector(shellNormal, colliderRadius + 0.45),
          radius: colliderRadius,
          hp: Number.POSITIVE_INFINITY,
          solo: null,
          hero: true,
          caveShell: true,
        }));
      }
    }

    // Natural, sparse cave dressing. It hugs the sides/roof and leaves a
    // continuous central flight lane through every chamber.
    const roofPoint = new Vector3();
    for (let k = 1; k < run.length; k++) {
      const waypoint = run[k];
      const floorY = this.heightAt(waypoint.x, waypoint.z);
      const t = k / (run.length - 1);
      sampleCaveArch(
        curve,
        t,
        0.5,
        tunnelRadius,
        profileSeed,
        (x, z) => this.heightAt(x, z),
        roofPoint,
      );

      for (let s = 0; s < 2; s++) {
        const angle = rng.range(0, Math.PI * 2);
        const distance = rng.range(tunnelRadius * 0.58, tunnelRadius * 0.76);
        const px = waypoint.x + Math.cos(angle) * distance;
        const pz = waypoint.z + Math.sin(angle) * distance;
        rockLobe(
          px,
          pz,
          rng.range(6, 12),
          rng.range(1.8, 3),
          false,
          this.heightAt(px, pz),
        );
      }
      if (k % 2 === 0) {
        const angle = rng.range(0, Math.PI * 2);
        const distance = rng.range(0, tunnelRadius * 0.35);
        rockLobe(
          waypoint.x + Math.cos(angle) * distance,
          waypoint.z + Math.sin(angle) * distance,
          rng.range(5, 9),
          rng.range(1.4, 2.4),
          true,
          roofPoint.y,
        );
      }

      if (k === run.length - 1) {
        this.addStash(
          rng,
          waypoint.x + tunnelRadius * 0.28,
          floorY + 2.5,
          waypoint.z,
        );
        this.addStash(
          rng,
          waypoint.x - tunnelRadius * 0.3,
          floorY + 2.5,
          waypoint.z + tunnelRadius * 0.18,
        );
        this.addCrystalFormation(
          rng,
          waypoint.x + tunnelRadius * 0.42,
          floorY + 1,
          waypoint.z - tunnelRadius * 0.25,
        );
        const glow = new PointLight(
          0xffb347,
          700,
          waypoint.r * 3,
          1.5,
        );
        glow.position.set(
          waypoint.x,
          floorY + waypoint.r * 0.5,
          waypoint.z,
        );
        this.group.add(glow);
      } else {
        const side = k % 2 === 0 ? -1 : 1;
        this.addCrystalFormation(
          rng,
          waypoint.x + side * tunnelRadius * 0.46,
          floorY + 1,
          waypoint.z + side * tunnelRadius * 0.14,
        );
        if (k === 1) {
          this.addStash(
            rng,
            waypoint.x + tunnelRadius * 0.35,
            floorY + 2.5,
            waypoint.z - tunnelRadius * 0.2,
          );
        }
        const glow = new PointLight(
          0x2ee6c8,
          500,
          waypoint.r * 2.6,
          1.5,
        );
        glow.position.set(
          waypoint.x,
          floorY + waypoint.r * 0.45,
          waypoint.z,
        );
        this.group.add(glow);
      }
    }

    // Close only the far treasure end. It sits beyond the last chamber, so
    // its approximate collider cannot steal usable room from the vault.
    const endTangent = curve.getTangentAt(1).normalize();
    const endWallGeometry = new IcosahedronGeometry(1, 2);
    displaceRock(endWallGeometry, rng, 0.24);
    const endWall = new Mesh(endWallGeometry, boulderMat);
    endWall.position
      .copy(pathPoints[pathPoints.length - 1])
      .addScaledVector(endTangent, tunnelRadius * 1.75);
    endWall.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), endTangent);
    endWall.scale.set(
      tunnelRadius * 1.18,
      tunnelRadius,
      tunnelRadius * 0.38,
    );
    this.group.add(endWall);
    this.bodies.push(makeBody({
      position: endWall.position.clone(),
      radius: tunnelRadius * 0.72,
      hp: Number.POSITIVE_INFINITY,
      solo: null,
      hero: true,
      caveShell: true,
    }));

    // Establish a guaranteed-clear mouth lane. Rubble lives on alternating
    // shoulders rather than forming a six-rock ring across the entrance.
    const mouthTangent = curve.getTangentAt(0);
    mouthTangent.y = 0;
    mouthTangent.normalize();
    const mouthSide = new Vector3().crossVectors(mouthTangent, UP).normalize();
    const outward = mouthTangent.clone().negate();
    for (let index = 0; index < 8; index++) {
      const sign = index % 2 === 0 ? -1 : 1;
      const tier = Math.floor(index / 2);
      const lateral =
        sign * tunnelRadius * (1.15 + rng.range(0.04, 0.18));
      const along = (tier - 1.5) * tunnelRadius * 0.42;
      const px =
        mouth.x +
        mouthSide.x * lateral +
        mouthTangent.x * along;
      const pz =
        mouth.z +
        mouthSide.z * lateral +
        mouthTangent.z * along;
      const size = rng.range(5, 8.5);
      const geometry = new IcosahedronGeometry(1, 1);
      displaceRock(geometry, rng, 0.3);
      const rock = new Mesh(geometry, boulderMat);
      rock.position.set(
        px,
        this.heightAt(px, pz) + size * 0.35,
        pz,
      );
      rock.rotation.set(
        rng.range(0, Math.PI * 2),
        rng.range(0, Math.PI * 2),
        0,
      );
      rock.scale.setScalar(size);
      this.group.add(rock);
      this.registerObstacle(rock, 0.1);
    }
    const crystalX = mouth.x + mouthSide.x * tunnelRadius * 1.05;
    const crystalZ = mouth.z + mouthSide.z * tunnelRadius * 1.05;
    this.addCrystalFormation(
      rng,
      crystalX,
      this.heightAt(crystalX, crystalZ),
      crystalZ,
    );

    const route = createEntranceRoute(
      curve,
      tunnelRadius,
      outward,
      (x, z) => this.heightAt(x, z),
    );
    const approach = route[0];
    const mouthFlight = route[8];
    const entry = route[route.length - 1];
    const center = caveFlightPoint(
      curve,
      0.88,
      tunnelRadius,
      (x, z) => this.heightAt(x, z),
    );

    // Both guards use known open floor positions. This prevents enemy markers
    // and fire from originating behind the visible roof shell.
    const interiorCandidates: Vector3[] = [];
    for (const t of [0.62, 0.7, 0.78, 0.84]) {
      const candidateCenter = curve.getPointAt(t);
      const candidateSide = new Vector3()
        .crossVectors(curve.getTangentAt(t), UP)
        .normalize();
      for (const lateral of [0, 0.16, -0.16, 0.29, -0.29]) {
        const candidate = candidateCenter
          .clone()
          .addScaledVector(candidateSide, tunnelRadius * lateral);
        candidate.y = this.heightAt(candidate.x, candidate.z) + 2.0;
        interiorCandidates.push(candidate);
      }
    }
    const interiorGuard = this.clearest(interiorCandidates);
    const interiorGround = interiorGuard.y - 2.0;
    this.addTurretPost(
      interiorGuard.x,
      interiorGround,
      interiorGuard.z,
      mouth.x,
      mouth.z,
    );

    const exteriorCandidates: Vector3[] = [];
    for (const sideFactor of [-1.8, -1.55, 1.55, 1.8]) {
      for (const alongFactor of [-0.15, 0.2, 0.5]) {
        const candidate = approach
          .clone()
          .addScaledVector(mouthSide, tunnelRadius * sideFactor)
          .addScaledVector(mouthTangent, tunnelRadius * alongFactor);
        candidate.y = this.heightAt(candidate.x, candidate.z) + 2.0;
        exteriorCandidates.push(candidate);
      }
    }
    const exteriorGuard = this.clearest(exteriorCandidates);
    const exteriorGround = exteriorGuard.y - 2.0;
    this.addTurretPost(
      exteriorGuard.x,
      exteriorGround,
      exteriorGuard.z,
      mouth.x,
      mouth.z,
    );

    this.caveLandmarks.push({
      center,
      mouth: mouthFlight,
      approach,
      entry,
      route,
      interiorGuard,
      exteriorGuard,
    });
  }
}

function caveTunnelTaper(t: number): number {
  const u = Math.max(0, Math.min(1, t / 0.16));
  const smooth = u * u * (3 - 2 * u);
  return 0.9 + smooth * 0.1;
}

/**
 * Position one point on the shared asymmetric arch profile. `u` runs from
 * left shoulder through roof to right shoulder.
 */
function sampleCaveArch(
  curve: CatmullRomCurve3,
  t: number,
  u: number,
  radius: number,
  seed: number,
  heightAt: (x: number, z: number) => number,
  out: Vector3,
  outward?: Vector3,
): void {
  const center = curve.getPointAt(t);
  const tangent = curve.getTangentAt(t).normalize();
  const side = new Vector3().crossVectors(tangent, UP);
  if (side.lengthSq() < 1e-5) side.set(1, 0, 0);
  else side.normalize();
  const roofUp = new Vector3().crossVectors(side, tangent).normalize();
  if (roofUp.y < 0) roofUp.negate();

  const taper = caveTunnelTaper(t);
  const broadA = Math.sin(t * 12.7 + seed * 0.37);
  const broadB = Math.sin(t * 7.1 + seed * 0.83);
  const width = radius * taper * (1.14 + broadA * 0.12);
  const height = radius * taper * (1.08 + broadB * 0.16);
  const angle = u * Math.PI;
  const archMask = Math.sin(angle);
  const rough =
    Math.sin(t * 31 + u * 8.7 + seed) * 0.055 +
    Math.sin(t * 13 - u * 15.3 + seed * 1.71) * 0.04;
  const contour =
    1 +
    archMask *
      (
        rough +
        Math.sin(u * 17.3 + seed * 0.61 + t * 5.2) * 0.075 +
        Math.sin(u * 6.1 - seed * 0.43 + t * 11.4) * 0.045
      );
  const lateral =
    Math.cos(angle) * width * contour +
    Math.sin(t * 9 + seed) * radius * 0.08 * archMask;
  const vertical =
    Math.pow(archMask, 0.86) *
    height *
    (
      1 +
      rough +
      Math.sin(u * 11.7 + seed * 0.29 - t * 8.4) * 0.055
    );

  // Seat both arch shoulders into the terrain that is actually rendered at
  // their world positions. Using only the trench-centre height left visible
  // daylight gaps under a wall that still had collision.
  const leftGround = heightAt(
    center.x + side.x * width,
    center.z + side.z * width,
  );
  const rightGround = heightAt(
    center.x - side.x * width,
    center.z - side.z * width,
  );
  const sideBlend = Math.cos(angle) * 0.5 + 0.5;
  const seatedGround =
    rightGround + (leftGround - rightGround) * sideBlend;
  out
    .set(center.x, seatedGround - 2.2, center.z)
    .addScaledVector(side, lateral)
    .addScaledVector(roofUp, vertical);

  if (outward) {
    outward
      .copy(side)
      .multiplyScalar(Math.cos(angle) / width)
      .addScaledVector(roofUp, Math.sin(angle) / height)
      .normalize();
  }
}

function createCaveArchGeometry(
  curve: CatmullRomCurve3,
  pathLength: number,
  radius: number,
  seed: number,
  heightAt: (x: number, z: number) => number,
): BufferGeometry {
  const rings = Math.max(56, Math.ceil(pathLength / 3.2));
  const arcs = 20;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const point = new Vector3();

  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    for (let arc = 0; arc <= arcs; arc++) {
      const u = arc / arcs;
      sampleCaveArch(
        curve,
        t,
        u,
        radius,
        seed,
        heightAt,
        point,
      );
      positions.push(point.x, point.y, point.z);
      // World-proportional repeats keep the rock pattern isotropic; the old
      // two repeats over an entire cave stretched cracks into wood grain.
      uvs.push(t * (pathLength / 22), u * 2.2);
    }
  }
  for (let ring = 0; ring < rings; ring++) {
    for (let arc = 0; arc < arcs; arc++) {
      const a = ring * (arcs + 1) + arc;
      const b = a + arcs + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function caveFlightPoint(
  curve: CatmullRomCurve3,
  t: number,
  radius: number,
  heightAt: (x: number, z: number) => number,
): Vector3 {
  const point = curve.getPointAt(t);
  point.y = heightAt(point.x, point.z) + radius * 0.48;
  return point;
}

/**
 * Dense route from the outside ramp onto the curved tunnel centreline. A
 * single chord cuts through a wall when the first bend is sharp; following
 * the same spline as the visible arch keeps every seed genuinely flyable.
 */
function createEntranceRoute(
  curve: CatmullRomCurve3,
  radius: number,
  outward: Vector3,
  heightAt: (x: number, z: number) => number,
): Vector3[] {
  const route: Vector3[] = [];
  const mouth = curve.getPointAt(0);
  const lift = radius * 0.44;

  // Eight short outside segments follow the carved approach ramp.
  for (let index = 0; index <= 8; index++) {
    const distance = radius * 2.5 * (1 - index / 8);
    const point = mouth.clone().addScaledVector(outward, distance);
    point.y = heightAt(point.x, point.z) + lift;
    route.push(point);
  }
  // Then follow the actual cave bend instead of cutting a straight chord.
  for (let index = 1; index <= 10; index++) {
    const point = curve.getPointAt(0.12 * (index / 10));
    point.y = heightAt(point.x, point.z) + lift;
    route.push(point);
  }
  return route;
}
