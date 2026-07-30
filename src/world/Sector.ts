import { AmbientLight, Color, DirectionalLight, FogExp2, Group, Scene, Vector3 } from 'three';
import { Rng } from '../core/Rng';
import { CONFIG } from '../game/Config';
import { AsteroidField } from './AsteroidField';
import { CaveAsteroid, TurretSpawn } from './CaveAsteroid';
import { NebulaSkybox, NebulaPalette } from './NebulaSkybox';
import { Planet } from './Planet';
import { FogBanks } from './FogBanks';
import { SpaceDust } from './SpaceDust';
import { WreckSite } from './WreckSite';
import { Starfield } from './Starfield';
import { Sun } from './Sun';

interface SectorTheme {
  name: string;
  nebula: NebulaPalette;
  sunColor: Color;
  sunDir: Vector3;
}

export interface PatrolPlan {
  waypoints: Vector3[];
  size: number;
}

export interface PlanetInfo {
  position: Vector3;
  radius: number;
  surfaceA: Color;
  surfaceB: Color;
  atmosphere: Color;
  /** Ringed from orbit → the ring band must arc across the surface sky too. */
  ring: boolean;
}

export interface SectorPlan {
  patrols: PatrolPlan[];
  haulerRoutes: Vector3[][];
  capitalPost: { position: Vector3; facing: Vector3 } | null;
  /** Trade route for the sector's merchant (null = no merchant here). */
  merchantRoute: Vector3[] | null;
}

/** Handcrafted color themes; which one you get is decided by the sector seed. */
const THEMES: SectorTheme[] = [
  {
    name: 'Halcyon Drift',
    nebula: {
      deep: new Color(0x030512),
      primary: new Color(0x38257e),
      secondary: new Color(0x136681),
      accent: new Color(0xff6a3d),
    },
    sunColor: new Color(1.0, 0.85, 0.65),
    sunDir: new Vector3(0.55, 0.28, -0.75),
  },
  {
    name: 'Vireo Expanse',
    nebula: {
      deep: new Color(0x040310),
      primary: new Color(0x6d1a7c),
      secondary: new Color(0x1d3778),
      accent: new Color(0x2ee6c8),
    },
    sunColor: new Color(0.8, 0.9, 1.0),
    sunDir: new Vector3(-0.6, 0.35, -0.65),
  },
  {
    name: 'Ember Reach',
    nebula: {
      deep: new Color(0x0a0406),
      primary: new Color(0x7c2626),
      secondary: new Color(0x573320),
      accent: new Color(0xffb347),
    },
    sunColor: new Color(1.0, 0.62, 0.4),
    sunDir: new Vector3(0.2, -0.15, -0.95),
  },
  {
    name: 'Verdant Shroud',
    nebula: {
      deep: new Color(0x030a06),
      primary: new Color(0x1c6b3a),
      secondary: new Color(0x14514f),
      accent: new Color(0xd8ff5a),
    },
    sunColor: new Color(0.95, 1.0, 0.8),
    sunDir: new Vector3(-0.4, 0.2, 0.88),
  },
  {
    name: 'Gilded Hollow',
    nebula: {
      deep: new Color(0x0a0703),
      primary: new Color(0x8a5c1c),
      secondary: new Color(0x5c3a14),
      accent: new Color(0x5ad8ff),
    },
    sunColor: new Color(1.0, 0.9, 0.6),
    sunDir: new Vector3(0.75, 0.2, 0.6),
  },
  {
    name: 'Pale Corridor',
    nebula: {
      deep: new Color(0x04060a),
      primary: new Color(0x2c5a80),
      secondary: new Color(0x1c3a5e),
      accent: new Color(0xff8ac2),
    },
    sunColor: new Color(0.85, 0.92, 1.0),
    sunDir: new Vector3(-0.2, 0.5, 0.85),
  },
  {
    name: 'Umbral Rift',
    nebula: {
      deep: new Color(0x060309),
      primary: new Color(0x4a1a6e),
      secondary: new Color(0x6e1a4a),
      accent: new Color(0x3aff8c),
    },
    sunColor: new Color(0.72, 0.6, 1.0),
    sunDir: new Vector3(0.6, -0.3, 0.7),
  },
];

/**
 * Assembles one playable sector from a seed: skybox, stars, sun + key light,
 * planets, asteroid field, space dust. Owns everything scenery so gameplay
 * code never touches scene graph setup.
 */
export class Sector {
  readonly themeName: string;
  readonly group: Group;
  readonly asteroids: AsteroidField;
  readonly sun: Sun;
  /** Defense turret posts inside the cave asteroids (consumed by Game). */
  readonly turretSpawns: TurretSpawn[] = [];
  /** Explorable hollow asteroids (exposed for the test harness). */
  readonly caves: CaveAsteroid[] = [];
  /** Derelict hulks with lootable blackboxes — unmarked, found by eye. */
  readonly wrecks: WreckSite[] = [];
  /** Landable planets (position/radius/palette) for atmospheric entry. */
  readonly planets: PlanetInfo[] = [];
  /** Planet scene groups — hidden while the hangar interior is up (their
   *  additive ring discs otherwise slice visibly through the bay walls). */
  readonly planetGroups: Group[] = [];
  /** Everything that photobombs the hangar interior (rocks, ring discs, fog
   *  sprites, dust points) — Game toggles this set as one backdrop. */
  readonly backdropFx: { visible: boolean }[] = [];
  /** Level population blueprint, consumed by Game at mission start. */
  readonly plan: SectorPlan = { patrols: [], haulerRoutes: [], capitalPost: null, merchantRoute: null };
  private readonly starfield: Starfield;
  private readonly dust: SpaceDust;
  private readonly fogBanks: FogBanks;

  constructor(scene: Scene, rng: Rng, themeIndex?: number) {
    const theme = THEMES[themeIndex ?? rng.int(0, THEMES.length - 1)];
    this.themeName = theme.name;
    this.group = new Group();

    const skybox = new NebulaSkybox(theme.nebula, new Vector3(rng.range(0, 40), rng.range(0, 40), rng.range(0, 40)));
    this.group.add(skybox.mesh);

    this.starfield = new Starfield(rng.fork(), CONFIG.world.starCount);
    this.group.add(this.starfield.points);

    const sunPos = theme.sunDir.clone().normalize().multiplyScalar(7200);
    this.sun = new Sun(sunPos, theme.sunColor);
    this.group.add(this.sun.group);
    this.group.add(this.sun.light);
    this.group.add(this.sun.light.target);

    // Nebula "bounce": ambient tinted by the cloud color plus a soft fill
    // from the anti-sun direction, so hulls never collapse into silhouettes.
    const ambientTint = theme.nebula.primary.clone().lerp(new Color(1, 1, 1), 0.45);
    this.group.add(new AmbientLight(ambientTint, 0.85));
    const fill = new DirectionalLight(theme.nebula.accent.clone().lerp(new Color(1, 1, 1), 0.35), 0.9);
    fill.position.copy(theme.sunDir).multiplyScalar(-7200);
    fill.target.position.set(0, 0, 0);
    this.group.add(fill);
    this.group.add(fill.target);

    // One or two distant planets, placed away from the sun's screen position.
    // Placements are rejection-sampled against each other using RING
    // clearance (outer ring = 2.2 × radius) — two independent random bearings
    // could land giants overlapping on screen (this shipped).
    const planetCount = rng.int(1, 2);
    const placedPlanets: { pos: Vector3; clearance: number }[] = [];
    for (let i = 0; i < planetCount; i++) {
      const banded = rng.chance(0.6);
      const radius = rng.range(400, 900);
      // Keep a planet's geology in one coherent colour family. Independent
      // random hues produced complementary pink/green speckling that read like
      // a colour-vision test rather than continents or cloud bands. Consume
      // the same two RNG values so downstream seeded layouts remain stable.
      const baseHue = rng.next();
      const paletteRoll = rng.next();
      const hueShift = (paletteRoll - 0.5) * (banded ? 0.1 : 0.07);
      const surfaceA = new Color().setHSL(baseHue, banded ? 0.34 : 0.29, banded ? 0.38 : 0.29);
      const surfaceB = new Color().setHSL(
        (baseHue + hueShift + 1) % 1,
        banded ? 0.27 : 0.24,
        banded ? 0.21 : 0.15,
      );
      const atmosphere = theme.nebula.accent.clone();
      const hasRing = rng.chance(0.55);
      const planet = new Planet(rng.fork(), {
        radius,
        banded,
        surfaceA,
        surfaceB,
        atmosphere,
        ring: hasRing
          ? { inner: radius * 1.35, outer: radius * 2.2, color: theme.nebula.accent.clone() }
          : undefined,
        lightDir: theme.sunDir.clone(),
      });
      const clearance = hasRing ? radius * 2.2 : radius;
      const pos = new Vector3();
      for (let attempt = 0; attempt < 24; attempt++) {
        const [dx, dy, dz] = rng.unitSphere();
        const away = new Vector3(dx, dy * 0.4, dz).normalize();
        if (away.dot(theme.sunDir) > 0.3) away.negate();
        pos.copy(away).multiplyScalar(rng.range(3000, 5200));
        const clear = placedPlanets.every(
          (p) => pos.distanceTo(p.pos) > (clearance + p.clearance) * 1.25 + 400,
        );
        if (clear) break;
      }
      placedPlanets.push({ pos: pos.clone(), clearance });
      planet.group.position.copy(pos);
      this.group.add(planet.group);
      this.planetGroups.push(planet.group);
      this.planets.push({
        position: planet.group.position.clone(),
        radius,
        surfaceA,
        surfaceB,
        atmosphere,
        ring: hasRing,
      });
    }

    this.asteroids = new AsteroidField(rng.fork(), CONFIG.world.asteroidCount, CONFIG.world.fieldRadius);
    for (const m of this.asteroids.meshes) this.group.add(m);

    this.dust = new SpaceDust(rng.fork(), CONFIG.world.dustCount);
    this.group.add(this.dust.points);

    // Depth haze: distant hulls and rocks sink into the nebula color.
    // (Custom shaders — skybox, planets, particles — ignore fog; only
    // standard-material geometry participates, which is exactly right.)
    const fogColor = theme.nebula.primary.clone().lerp(theme.nebula.deep, 0.55);
    scene.fog = new FogExp2(fogColor, 0.00035);

    // NOTE: new rng.fork() consumers must stay appended AFTER existing ones —
    // reordering shifts every later stream and invalidates all baselines.
    this.fogBanks = new FogBanks(rng.fork(), theme.nebula.primary, theme.nebula.secondary);
    this.group.add(this.fogBanks.group);

    // Assemble the hangar-hideable backdrop set (see backdropFx docs).
    // The DIRECTIONAL lights are included: without shadow maps the sector sun
    // pours straight through the bay walls — inside, only the hangar's own
    // lights (and the nebula through the aperture) should illuminate.
    for (const m of this.asteroids.meshes) this.backdropFx.push(m);
    for (const g of this.planetGroups) this.backdropFx.push(g);
    this.backdropFx.push(this.dust.points, this.fogBanks.group, this.sun.light, fill);

    // Two explorable cave asteroids, off the beaten path.
    const caveRng = rng.fork();
    for (let i = 0; i < 2; i++) {
      const [dx, dy, dz] = caveRng.unitSphere();
      const center = new Vector3(dx, dy * 0.35, dz).normalize().multiplyScalar(caveRng.range(380, 540));
      const cave = new CaveAsteroid(caveRng, center, this.asteroids.bodies);
      this.group.add(cave.group);
      this.turretSpawns.push(...cave.turretSpawns);
      this.caves.push(cave);
    }

    // Population blueprint: patrol loops, hauler trade routes, capital post.
    // (Appended last — see the fork-order note above.)
    const popRng = rng.fork();
    for (let i = 0; i < 3; i++) {
      const [dx, dy, dz] = popRng.unitSphere();
      const center = new Vector3(dx, dy * 0.3, dz).normalize().multiplyScalar(popRng.range(320, 900));
      const loopRadius = popRng.range(150, 260);
      const phase = popRng.range(0, Math.PI * 2);
      const waypoints = Array.from({ length: 4 }, (_, k) => {
        const a = phase + (k / 4) * Math.PI * 2;
        return new Vector3(
          center.x + Math.cos(a) * loopRadius,
          center.y + popRng.range(-40, 40),
          center.z + Math.sin(a) * loopRadius,
        );
      });
      this.plan.patrols.push({ waypoints, size: popRng.int(2, 3) });
    }
    for (let i = 0; i < 3; i++) {
      const [dx, dy, dz] = popRng.unitSphere();
      const a = new Vector3(dx, dy * 0.25, dz).normalize().multiplyScalar(popRng.range(700, 1300));
      const b = a.clone().multiplyScalar(-1);
      b.x += popRng.range(-200, 200);
      b.y += popRng.range(-60, 60);
      this.plan.haulerRoutes.push([a, b]);
    }
    {
      const [dx, dy, dz] = popRng.unitSphere();
      const position = new Vector3(dx, dy * 0.25, dz).normalize().multiplyScalar(popRng.range(620, 820));
      const [fx, fy, fz] = popRng.unitSphere();
      const facing = position.clone().add(new Vector3(fx, fy * 0.2, fz).multiplyScalar(300));
      this.plan.capitalPost = { position, facing };
    }

    // Merchant: a short local loop, present in most sectors.
    if (popRng.chance(0.7)) {
      const [mx, my, mz] = popRng.unitSphere();
      const mCenter = new Vector3(mx, my * 0.2, mz).normalize().multiplyScalar(popRng.range(250, 650));
      const mRadius = popRng.range(90, 150);
      this.plan.merchantRoute = Array.from({ length: 3 }, (_, k) => {
        const a = (k / 3) * Math.PI * 2;
        return new Vector3(
          mCenter.x + Math.cos(a) * mRadius,
          mCenter.y + popRng.range(-25, 25),
          mCenter.z + Math.sin(a) * mRadius,
        );
      });
    }

    // Derelict wreck sites with blackboxes (appended after — fork-order note).
    const wreckKinds = ['hauler', 'raider', 'brute', 'raider'] as const;
    for (const kind of wreckKinds) {
      const [dx, dy, dz] = popRng.unitSphere();
      const pos = new Vector3(dx, dy * 0.3, dz).normalize().multiplyScalar(popRng.range(260, 1100));
      const wreck = new WreckSite(popRng, pos, kind, this.asteroids.bodies);
      this.group.add(wreck.group);
      this.wrecks.push(wreck);
    }

    scene.add(this.group);
  }

  update(dt: number, elapsed: number, cameraPosition: Vector3): void {
    this.starfield.update(elapsed);
    this.asteroids.update(dt);
    this.dust.update(cameraPosition);
    this.fogBanks.update(dt);
  }
}
