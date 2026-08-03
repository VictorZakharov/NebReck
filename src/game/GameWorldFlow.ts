import {
  Group,
  Material,
  Mesh,
  Object3D,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { Voice } from '../audio/Voice';
import { ProjectileSystem } from '../combat/ProjectileSystem';
import { EventBus } from '../core/EventBus';
import { Input } from '../core/Input';
import { Rng } from '../core/Rng';
import { CapitalShip } from '../entities/CapitalShip';
import { EnemyShip } from '../entities/EnemyShip';
import { NeutralShip } from '../entities/NeutralShip';
import { PickupSnapshot, PickupSystem } from '../entities/PickupSystem';
import { PlayerShip } from '../entities/PlayerShip';
import { Ship } from '../entities/Ship';
import { Turret } from '../entities/Turret';
import { WarpTunnel } from '../fx/WarpTunnel';
import { ChaseCamera } from '../rendering/ChaseCamera';
import { PostFx } from '../rendering/PostFx';
import { Hud } from '../ui/Hud';
import { AsteroidBody } from '../world/AsteroidField';
import { PlanetSurface } from '../world/PlanetSurface';
import { Sector } from '../world/Sector';
import { DifficultyDef } from './Difficulty';
import { EncounterDirector } from './EncounterDirector';
import {
  JUMP_FLUX_COST,
  JUMP_SPOOL_TIME,
  JUMP_SUPPRESS_RANGE,
} from './GameConstants';
import { Inventory } from './Inventory';
import { Quest, QuestSystem } from './Quests';
import { findSafeSectorEntry } from './SpawnSafety';

interface SpaceStash {
  enemies: EnemyShip[];
  turrets: Turret[];
  capitalTurrets: Turret[];
  neutrals: NeutralShip[];
  capital: CapitalShip | null;
  planetIndex: number;
  pickups: PickupSnapshot[];
}

interface PlanetVisitState {
  surface: PlanetSurface;
  enemies: EnemyShip[];
  turrets: Turret[];
  pickups: PickupSnapshot[];
}

interface CollidableWorld {
  bodies: AsteroidBody[];
}

export interface GameWorldFlowHost {
  readonly scene: Scene;
  readonly renderer: WebGLRenderer;
  readonly chaseCam: ChaseCamera;
  readonly audio: AudioEngine;
  readonly voice: Voice;
  readonly hud: Hud;
  readonly input: Input;
  readonly events: EventBus;
  readonly rng: Rng;
  readonly projectiles: ProjectileSystem;
  readonly pickups: PickupSystem;
  readonly warp: WarpTunnel;
  readonly questBeacons: Map<number, Group>;
  postFx: PostFx;
  sector: Sector;
  sectorIndex: number;
  jumpSpool: number;
  surface: PlanetSurface | null;
  player: PlayerShip;
  difficulty: DifficultyDef;
  inventory: Inventory;
  encounters: EncounterDirector | null;
  quests: QuestSystem;
  pendingOffer: Quest | null;
  enemies: EnemyShip[];
  turrets: Turret[];
  capitalTurrets: Turret[];
  neutrals: NeutralShip[];
  capital: CapitalShip | null;
  readonly world: CollidableWorld;
  isPlaying(): boolean;
  clearEntities(): void;
  removeQuestBeacon(id: number): void;
  completeQuest(quest: Quest): void;
  storyComms(key: string): void;
  clearNavigation(): void;
}

const jumpForward = new Vector3();
const jumpProbe = new Vector3();
const sectorHeart = new Vector3();
const arrivalTarget = new Vector3();

/** Free GPU resources owned by a discarded world subtree. */
function disposeGroup(root: Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as { material?: Material | Material[] }).material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
}

function disposeActors(
  enemies: readonly EnemyShip[],
  turrets: readonly Turret[],
  neutrals: readonly NeutralShip[] = [],
  capital: CapitalShip | null = null,
): void {
  for (const enemy of enemies) enemy.dispose();
  for (const turret of turrets) turret.dispose();
  for (const neutral of neutrals) neutral.dispose();
  capital?.dispose();
}

/**
 * Owns travel state and swaps complete world populations in and out of Game.
 *
 * Keeping this state together is important: a planet visit parks the exact
 * sector population, and lift-off must restore that same graph rather than a
 * regenerated approximation.
 */
export class GameWorldFlow {
  private jumpAuto = false;
  private aimedPlanet: number | null = null;
  private spaceStash: SpaceStash | null = null;
  private readonly planetStates = new Map<number, PlanetVisitState>();

  constructor(
    private readonly host: GameWorldFlowHost,
    private readonly sectorRng: Rng,
  ) {}

  get jumpSuppressed(): boolean {
    const { capital, player } = this.host;
    return (
      !!capital?.alive &&
      capital.position.distanceTo(player.position) < JUMP_SUPPRESS_RANGE
    );
  }

  /** True only for a spooled sector jump; landing/lift-off never consumes Flux. */
  get jumpConsumesFlux(): boolean {
    return this.host.jumpSpool >= 0 && !this.host.surface && this.aimedPlanet === null;
  }

  resetTravelState(): void {
    this.jumpAuto = false;
    this.aimedPlanet = null;
    this.host.jumpSpool = -1;
  }

  disposeStoredPlanets(): void {
    for (const state of this.planetStates.values()) {
      this.host.scene.remove(state.surface.group);
      disposeGroup(state.surface.group);
      disposeActors(state.enemies, state.turrets);
    }
    this.planetStates.clear();
  }

  /** Died or quit while landed: drop every surface retained by this sortie. */
  discardSurface(): void {
    const { host } = this;
    const activeSurface = host.surface;
    if (!activeSurface) {
      this.disposeStoredPlanets();
      return;
    }
    host.scene.remove(activeSurface.group);
    disposeGroup(activeSurface.group);
    this.disposeStoredPlanets();
    if (this.spaceStash) {
      disposeActors(
        this.spaceStash.enemies,
        this.spaceStash.turrets,
        this.spaceStash.neutrals,
        this.spaceStash.capital,
      );
    }
    host.surface = null;
    host.scene.fog = null;
    host.scene.add(host.sector.group);
    this.spaceStash = null;
    this.rebuildPostFx();
  }

  /**
   * Begin a jump spool. Hold J: release cancels, taking fire cancels. A planet
   * in the crosshair enters its surface; an unobstructed deep-space aim jumps
   * to the next sector.
   */
  startJump(auto = false): boolean {
    const { host } = this;
    if (!host.isPlaying() || host.jumpSpool >= 0 || !host.player.alive) return false;

    if (host.surface) {
      host.player.forward(jumpForward);
      if (jumpForward.y < 0.5) {
        host.hud.showBanner('Point the nose skyward to lift off');
        host.audio.warning();
        return false;
      }
    } else {
      this.aimedPlanet = this.findAimedPlanet();
      if (this.aimedPlanet === null) {
        if (this.jumpSuppressed) {
          host.hud.showBanner('Jump suppressed — capital field');
          host.audio.warning();
          return false;
        }
        if (host.inventory.counts.flux < JUMP_FLUX_COST) {
          host.hud.showBanner(`Jump drive needs ${JUMP_FLUX_COST} flux cores`);
          host.audio.warning();
          return false;
        }
        if (this.jumpPathBlocked()) {
          host.hud.showBanner('Jump path obstructed — clear your nose');
          host.audio.warning();
          return false;
        }
      }
    }

    this.jumpAuto = auto;
    host.jumpSpool = JUMP_SPOOL_TIME;
    host.hud.showBanner(
      host.surface
        ? 'Lift-off burn — hold J'
        : this.aimedPlanet !== null
          ? 'Atmospheric entry — hold J'
          : 'Jump drive spooling — hold J',
    );
    host.audio.jumpSpool();
    return true;
  }

  cancelJump(message: string | null): void {
    if (this.host.jumpSpool < 0) return;
    this.resetTravelState();
    if (message) {
      this.host.hud.showBanner(message);
      this.host.audio.warning();
    }
  }

  /** Update the jump effect. True means the completed jump changed worlds. */
  updateJumpSpool(dt: number): boolean {
    const { host } = this;
    if (host.jumpSpool >= 0) {
      if (!this.jumpAuto && !host.input.isDown('KeyJ')) {
        this.cancelJump(null);
      } else {
        host.jumpSpool -= dt;
        const progress = 1 - host.jumpSpool / JUMP_SPOOL_TIME;
        host.warp.progress = progress;
        host.postFx.punchAberration(0.005 * progress);
        if (host.jumpSpool <= 0) {
          host.jumpSpool = -1;
          this.jumpAuto = false;
          this.completeJump();
          return true;
        }
      }
    } else {
      host.warp.progress = Math.max(0, host.warp.progress - dt * 1.2);
    }
    return false;
  }

  /** Which planet, if any, sits in the crosshair cone. */
  findAimedPlanet(): number | null {
    const { player, sector } = this.host;
    player.forward(jumpForward);
    for (let index = 0; index < sector.planets.length; index++) {
      const planet = sector.planets[index];
      jumpProbe.copy(planet.position).sub(player.position);
      const distance = jumpProbe.length();
      jumpProbe.divideScalar(distance);
      const cone = Math.atan(planet.radius / distance) + 0.04;
      if (jumpForward.dot(jumpProbe) > Math.cos(cone)) return index;
    }
    return null;
  }

  /** Anything solid inside the forward corridor blocks a sector jump. */
  private jumpPathBlocked(): boolean {
    const { host } = this;
    host.player.forward(jumpForward);
    for (let distance = 40; distance <= 340; distance += 30) {
      jumpProbe.copy(host.player.position).addScaledVector(jumpForward, distance);
      for (const body of host.world.bodies) {
        if (body.destroyed) continue;
        if (body.position.distanceToSquared(jumpProbe) < (body.radius + 25) ** 2) return true;
      }
      if (
        host.capital?.alive &&
        host.capital.position.distanceToSquared(jumpProbe) < (host.capital.radius + 30) ** 2
      ) {
        return true;
      }
    }
    return false;
  }

  private completeJump(): void {
    const { host } = this;
    if (host.surface) {
      this.exitPlanet();
      return;
    }
    if (this.aimedPlanet !== null) {
      const index = this.aimedPlanet;
      this.aimedPlanet = null;
      this.enterPlanet(index);
      return;
    }
    if (host.inventory.counts.flux < JUMP_FLUX_COST) {
      this.cancelJump('Insufficient flux');
      return;
    }

    host.inventory.counts.flux -= JUMP_FLUX_COST;
    host.sectorIndex++;
    host.encounters?.onSectorJump();
    const { completed, voided } = host.quests.onJump();
    for (const quest of voided) {
      host.removeQuestBeacon(quest.id);
      host.events.emit('comms', {
        speaker: 'HAULER',
        text: 'You jumped with our cargo?! Contract void.',
      });
    }
    host.pendingOffer = null;
    host.voice.cancel();
    host.clearEntities();
    this.rebuildSector();
    this.deploySectorEntities();
    this.placePlayerSafely();

    host.player.forward(jumpForward);
    host.player.velocity.copy(jumpForward).multiplyScalar(55);
    host.chaseCam.snapTo(host.player.object);
    host.hud.flashJump();
    host.postFx.punchAberration(0.05);
    host.audio.jumpArrive();
    host.hud.showBanner(`Sector ${host.sectorIndex} — ${host.sector.themeName}`);
    for (const quest of completed) host.completeQuest(quest);
  }

  /**
   * Dive onto a planet by detaching, but not destroying, the active space
   * population and swapping in the persisted surface dungeon.
   */
  enterPlanet(index: number): void {
    const { host } = this;
    const info = host.sector.planets[index];
    if (!info || host.surface) return;
    host.clearNavigation();
    host.voice.cancel();
    host.pendingOffer = null;

    for (const enemy of host.enemies) host.scene.remove(enemy.object);
    for (const turret of host.turrets) host.scene.remove(turret.object);
    for (const neutral of host.neutrals) host.scene.remove(neutral.object);
    if (host.capital) host.scene.remove(host.capital.object);
    for (const beacon of host.questBeacons.values()) host.scene.remove(beacon);

    this.spaceStash = {
      enemies: host.enemies,
      turrets: host.turrets,
      capitalTurrets: host.capitalTurrets,
      neutrals: host.neutrals,
      capital: host.capital,
      planetIndex: index,
      pickups: host.pickups.snapshot(),
    };
    host.enemies = [];
    host.turrets = [];
    host.capitalTurrets = [];
    host.neutrals = [];
    host.capital = null;
    host.projectiles.clear();
    host.pickups.clear();
    host.scene.remove(host.sector.group);

    const visited = this.planetStates.get(index) ?? null;
    this.planetStates.delete(index);
    host.surface = visited?.surface ?? new PlanetSurface(this.sectorRng.fork(), info);
    host.scene.add(host.surface.group);
    host.scene.fog = host.surface.fog;
    this.rebuildPostFx();

    if (visited) {
      host.enemies = visited.enemies;
      host.turrets = visited.turrets;
      for (const enemy of host.enemies) host.scene.add(enemy.object);
      for (const turret of host.turrets) host.scene.add(turret.object);
      host.pickups.restore(visited.pickups);
    } else {
      this.populateSurface();
    }

    const hostilePositions = [
      ...host.turrets.map((turret) => turret.position),
      ...host.enemies.map((enemy) => enemy.position),
    ];
    host.player.object.position.copy(host.surface.pickSpawn(host.rng, hostilePositions));
    host.player.object.rotation.set(0, host.rng.range(0, Math.PI * 2), 0);
    host.player.velocity.set(0, 0, 0);
    host.chaseCam.snapTo(host.player.object);
    host.hud.flashJump();
    host.audio.jumpArrive();
    host.hud.showBanner('Planetfall');
    host.storyComms('planetfall');
  }

  /** Restore the exact space world that was parked during planetfall. */
  exitPlanet(): void {
    const { host } = this;
    if (!host.surface || !this.spaceStash) return;
    host.clearNavigation();
    const planetIndex = this.spaceStash.planetIndex;

    this.planetStates.set(planetIndex, {
      surface: host.surface,
      enemies: host.enemies,
      turrets: host.turrets,
      pickups: host.pickups.snapshot(),
    });
    for (const enemy of host.enemies) host.scene.remove(enemy.object);
    for (const turret of host.turrets) host.scene.remove(turret.object);
    host.enemies = [];
    host.turrets = [];
    host.capitalTurrets = [];
    host.projectiles.clear();
    host.pickups.clear();
    host.scene.remove(host.surface.group);
    host.surface = null;
    host.scene.fog = null;

    host.scene.add(host.sector.group);
    host.enemies = this.spaceStash.enemies;
    host.turrets = this.spaceStash.turrets;
    host.capitalTurrets = this.spaceStash.capitalTurrets;
    host.neutrals = this.spaceStash.neutrals;
    host.capital = this.spaceStash.capital;
    const spacePickups = this.spaceStash.pickups;
    this.spaceStash = null;
    for (const enemy of host.enemies) host.scene.add(enemy.object);
    for (const turret of host.turrets) host.scene.add(turret.object);
    for (const neutral of host.neutrals) host.scene.add(neutral.object);
    if (host.capital) host.scene.add(host.capital.object);
    for (const beacon of host.questBeacons.values()) host.scene.add(beacon);
    host.pickups.restore(spacePickups);
    this.rebuildPostFx();

    const planet = host.sector.planets[planetIndex];
    jumpProbe.copy(planet.position).normalize();
    host.player.object.position
      .copy(planet.position)
      .addScaledVector(jumpProbe, -(planet.radius + 220));
    this.orientPlayerTowardTargets();
    host.player.velocity.set(0, 0, 0);
    host.chaseCam.snapTo(host.player.object);
    host.hud.flashJump();
    host.audio.jumpArrive();
    host.hud.showBanner(`Orbit — Sector ${host.sectorIndex}`);
  }

  /** Tear down the old world and generate the next one from the seed stream. */
  rebuildSector(): void {
    const { host } = this;
    host.clearNavigation();
    this.disposeStoredPlanets();
    host.scene.remove(host.sector.group);
    disposeGroup(host.sector.group);
    host.scene.fog = null;
    host.sector = new Sector(host.scene, this.sectorRng.fork());
    this.rebuildPostFx();
  }

  /** Add the generated sector's static batteries and planned population. */
  deploySectorEntities(): void {
    const { host } = this;
    const hostileSector = host.sectorIndex > 1;
    if (hostileSector) {
      const turretMix = ['bolt', 'autogun', 'homing', 'fast'] as const;
      for (let index = 0; index < host.sector.turretSpawns.length; index++) {
        const spawn = host.sector.turretSpawns[index];
        const turret = new Turret(host.rng.fork(), turretMix[index % turretMix.length]);
        turret.object.position.copy(spawn.position);
        turret.faceToward(spawn.lookAt);
        host.scene.add(turret.object);
        host.turrets.push(turret);
      }
    }
    this.populateLevel(hostileSector);
  }

  /** Threat multiplier: each sector deeper into the Drift is meaner. */
  threatScale(): number {
    return 1 + (this.host.sectorIndex - 1) * 0.15;
  }

  /** Instantiate patrol wings, hauler routes, the merchant and capital post. */
  private populateLevel(includeHostiles = true): void {
    const { host } = this;
    const plan = host.sector.plan;
    for (const patrol of includeHostiles ? plan.patrols : []) {
      for (let index = 0; index < patrol.size; index++) {
        const kind = index === 0 && patrol.size > 2
          ? 'brute'
          : index === patrol.size - 1 ? 'bomber' : 'raider';
        const enemy = new EnemyShip(
          kind,
          host.rng.fork(),
          Math.min(0.5 * host.difficulty.aggression, 0.85),
          host.difficulty.enemyToughness * this.threatScale(),
          patrol.waypoints,
          kind === 'raider' && index % 2 === 0 ? 'autogun' : undefined,
        );
        enemy.object.position.copy(patrol.waypoints[0]);
        enemy.position.x += index * 14;
        enemy.position.y += index * 5;
        enemy.faceToward(patrol.waypoints[1]);
        host.scene.add(enemy.object);
        host.enemies.push(enemy);
      }
    }

    for (const route of plan.haulerRoutes) {
      const hauler = new NeutralShip(route);
      hauler.object.position.copy(route[0]).lerp(route[1], 0.2 + 0.25 * host.neutrals.length);
      hauler.faceToward(route[1]);
      host.scene.add(hauler.object);
      host.neutrals.push(hauler);
    }

    let merchantRoute = plan.merchantRoute;
    if (!merchantRoute && host.sectorIndex === 1 && plan.haulerRoutes.length > 0) {
      const anchor = plan.haulerRoutes[0][0].clone().multiplyScalar(0.35);
      merchantRoute = [
        anchor.clone(),
        anchor.clone().add(new Vector3(140, 10, 30)),
        anchor.clone().add(new Vector3(60, -10, 130)),
      ];
    }
    if (merchantRoute) {
      const merchant = new NeutralShip(merchantRoute, true);
      merchant.object.position.copy(merchantRoute[0]);
      merchant.faceToward(merchantRoute[1]);
      host.scene.add(merchant.object);
      host.neutrals.push(merchant);
    }

    if (plan.capitalPost && includeHostiles) {
      host.capital = new CapitalShip();
      host.capital.object.position.copy(plan.capitalPost.position);
      host.capital.faceToward(plan.capitalPost.facing);
      host.scene.add(host.capital.object);
      host.capitalTurrets = [];
      for (const mount of host.capital.turretMounts) {
        const world = mount.position.clone()
          .applyQuaternion(host.capital.object.quaternion)
          .add(host.capital.position);
        const normal = mount.normal.clone().applyQuaternion(host.capital.object.quaternion).normalize();
        const turret = new Turret(host.rng.fork(), mount.weapon, normal);
        turret.object.position.copy(world);
        turret.faceToward(world.clone().add(normal));
        host.scene.add(turret.object);
        host.turrets.push(turret);
        host.capitalTurrets.push(turret);
      }
    }
  }

  private populateSurface(): void {
    const { host } = this;
    if (!host.surface) return;
    const turretMix = ['bolt', 'autogun', 'homing', 'fast'] as const;
    for (let index = 0; index < host.surface.turretSpawns.length; index++) {
      const spawn = host.surface.turretSpawns[index];
      const turret = new Turret(host.rng.fork(), turretMix[index % turretMix.length]);
      turret.object.position.copy(spawn.position);
      turret.faceToward(spawn.lookAt);
      host.scene.add(turret.object);
      host.turrets.push(turret);
    }
    for (const patrol of host.surface.patrols) {
      for (let index = 0; index < patrol.size; index++) {
        const kind = index === patrol.size - 1 && patrol.size > 1 ? 'bomber' : 'raider';
        const enemy = new EnemyShip(
          kind,
          host.rng.fork(),
          Math.min(0.5 * host.difficulty.aggression, 0.85),
          host.difficulty.enemyToughness * this.threatScale(),
          patrol.waypoints,
          kind === 'raider' && index % 2 === 0 ? 'autogun' : undefined,
        );
        enemy.object.position.copy(patrol.waypoints[0]);
        enemy.position.x += index * 12;
        enemy.faceToward(patrol.waypoints[1]);
        host.scene.add(enemy.object);
        host.enemies.push(enemy);
      }
    }
  }

  /**
   * Spawn away from every hostile and every point on the generated patrol
   * routes, while rejecting candidates embedded in asteroids.
   */
  placePlayerSafely(): void {
    const { host } = this;
    const hostilePositions = [
      ...host.enemies.map((enemy) => enemy.position),
      ...host.turrets.map((turret) => turret.position),
      ...(host.capital ? [host.capital.position] : []),
    ];
    const patrolWaypoints = host.sector.plan.patrols.flatMap((patrol) => patrol.waypoints);
    host.player.position.copy(findSafeSectorEntry(
      host.rng,
      host.sector.asteroids.bodies,
      hostilePositions,
      patrolWaypoints,
    ));
    this.orientPlayerTowardTargets();
  }

  /** Face the equal-weight mean bearing of targetable contacts on arrival. */
  private orientPlayerTowardTargets(): void {
    const { host } = this;
    sectorHeart.set(0, 0, 0);
    arrivalTarget.set(0, 0, 0);
    let nearestDistanceSq = Infinity;
    const include = (ship: Ship): void => {
      if (!ship.alive) return;
      jumpProbe.copy(ship.position).sub(host.player.position);
      const distanceSq = jumpProbe.lengthSq();
      if (distanceSq < 1e-5) return;
      sectorHeart.add(jumpProbe.normalize());
      if (distanceSq < nearestDistanceSq) {
        nearestDistanceSq = distanceSq;
        arrivalTarget.copy(ship.position);
      }
    };
    for (const enemy of host.enemies) include(enemy);
    for (const turret of host.turrets) {
      if (!host.capitalTurrets.includes(turret)) include(turret);
    }
    for (const neutral of host.neutrals) include(neutral);
    if (host.capital) include(host.capital);
    if (sectorHeart.lengthSq() > 1e-4) {
      arrivalTarget.copy(sectorHeart).normalize().add(host.player.position);
    } else if (nearestDistanceSq === Infinity) {
      arrivalTarget.set(0, 0, 0);
      if (host.player.position.lengthSq() < 1e-5) arrivalTarget.z = -1;
    }
    host.player.faceToward(arrivalTarget);
  }

  private rebuildPostFx(): void {
    const { host } = this;
    host.postFx.composer.dispose();
    host.postFx = new PostFx(host.renderer, host.scene, host.chaseCam.camera);
    host.postFx.setSize(window.innerWidth, window.innerHeight);
  }
}
