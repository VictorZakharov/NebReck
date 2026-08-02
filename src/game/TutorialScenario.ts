import { Vector3 } from 'three';
import { EnemyShip } from '../entities/EnemyShip';
import { NeutralShip } from '../entities/NeutralShip';
import { AsteroidBody } from '../world/AsteroidField';
import { PlanetInfo } from '../world/Sector';
import { NavigationDestination } from './NavigationSystem';
import { TutorialStepId } from './TutorialCards';
import { debrisFlightCourse } from './TutorialFlightCourse';
import { TutorialHost } from './TutorialHost';
import {
  TutorialScenarioUpdate,
  TutorialStealthDrills,
} from './TutorialStealthDrills';
import { TutorialSurfaceTargets } from './TutorialSurfaceMission';

export type { TutorialScenarioEvent } from './TutorialStealthDrills';

const up = new Vector3(0, 1, 0);
const direction = new Vector3();
const sideDirection = new Vector3();
const scratch = new Vector3();
const path = new Vector3();
const nearestPoint = new Vector3();
/** Owns staged world actors, baselines, destinations, and objective completion. */
export class TutorialScenario {
  private readonly stealth: TutorialStealthDrills;
  private trainingTarget: EnemyShip | null = null;
  private oreBody: AsteroidBody | null = null;
  private merchant: NeutralShip | null = null;
  private planet: PlanetInfo | null = null;
  private surfaceMission: TutorialSurfaceTargets | null = null;
  private waypoint: Vector3 | null = null;
  private targetHealth = 0;
  private seekerImpactsBefore = 0;
  private pendingDamage: 'shield' | 'hull' | null = null;
  private damageRetry = 0;
  private trainingFireTimer = 0;
  private shieldBefore = 0;
  private hullBefore = 0;
  private holdingsBefore = 0;
  private sectorBefore = 1;
  private craftDone = false;
  private tradeDone = false;

  constructor(private readonly host: TutorialHost) {
    this.stealth = new TutorialStealthDrills(host);
  }

  reset(): void {
    this.clearTrainingTarget();
    this.host.releaseTrainingSeekers();
    this.oreBody = null;
    this.merchant = null;
    this.planet = null;
    this.surfaceMission = null;
    this.waypoint = null;
    this.pendingDamage = null;
    this.damageRetry = 0;
    this.stealth.reset();
  }

  prepare(id: TutorialStepId, restage = false): void {
    const h = this.host;
    const targetSteps: TutorialStepId[] = [
      'target', 'guns', 'seekers', 'missile-dodge', 'shield', 'hull',
      'cloak', 'cloak-break', 'emp',
    ];
    if (!targetSteps.includes(id)) this.clearTrainingTarget();
    if (id !== 'missile-dodge') h.releaseTrainingSeekers();
    if (id !== 'cloak' && id !== 'cloak-break') h.setTutorialCloak(false);
    if (!['surface-flight', 'surface-turret', 'surface-stash', 'lift'].includes(id)) {
      this.surfaceMission = null;
    }
    switch (id) {
      case 'craft': case 'loadout-close':
        this.supplyEngineeringMaterials();
        if (id === 'craft' || restage) h.stageTutorialScene('loadout');
        break;
      case 'trade': case 'trade-close':
        if (id === 'trade-close' && !restage) { h.stageTutorialScene('flight'); break; }
        if (h.state !== 'trade') h.stageTutorialScene('flight');
        h.inventory.add('scrap', Math.max(0, 8 - h.inventory.counts.scrap));
        this.prepareMerchant();
        h.stageTutorialScene('trade');
        break;
      case 'surface-flight': case 'surface-turret': case 'surface-stash': case 'lift':
        h.stageTutorialScene('surface');
        break;
      default:
        h.stageTutorialScene('flight');
        break;
    }
  }

  enter(id: TutorialStepId): void {
    const h = this.host;
    this.waypoint = null;
    switch (id) {
      case 'flight':
        const course = debrisFlightCourse(h.player, h.worldBodies);
        if (course) {
          h.player.position.copy(course.start);
          h.player.velocity.set(0, 0, 0);
        }
        this.waypoint = course?.gate ?? this.clearPoint(480, -240);
        direction.copy(this.waypoint).sub(h.player.position).normalize().applyAxisAngle(up, 0.48);
        h.player.faceToward(scratch.copy(h.player.position).add(direction));
        h.chaseCam.snapTo(h.player.object);
        break;
      case 'target':
        this.clearTrainingTarget();
        this.trainingTarget = h.spawnTrainingTarget(this.clearPoint(210, 55));
        break;
      case 'guns':
        this.ensureTrainingTarget(true);
        this.targetHealth = this.trainingHealth;
        break;
      case 'seekers':
        this.ensureTrainingTarget(true);
        h.inventory.missiles = Math.max(3, h.inventory.missiles);
        this.seekerImpactsBefore = this.trainingTarget
          ? h.playerSeekerImpacts(this.trainingTarget) : 0;
        break;
      case 'missile-dodge':
        this.clearTrainingTarget();
        this.trainingTarget = h.spawnTrainingTarget(this.clearPoint(300, 0));
        this.stealth.beginMissileDodge(this.trainingTarget);
        break;
      case 'shield': this.beginDamageLesson('shield'); break;
      case 'hull': this.beginDamageLesson('hull'); break;
      case 'repair':
        if (h.player.hull > h.player.hullMax - 1) {
          h.player.shield = 0;
          h.player.hull = h.player.hullMax * 0.62;
        }
        h.inventory.nanobots = Math.max(1, h.inventory.nanobots);
        this.hullBefore = h.player.hull;
        break;
      case 'cloak':
        this.clearTrainingTarget();
        this.trainingTarget = h.spawnTrainingTarget(this.clearPoint(230, 80));
        h.setTutorialCloak(false);
        h.devices.cloakCooldown = 0;
        h.player.hull = h.player.hullMax;
        h.player.shield = h.player.shieldMax;
        this.stealth.beginCloak();
        break;
      case 'cloak-break':
        this.ensureTrainingTarget(true, 65);
        h.setTutorialCloak(true);
        this.stealth.beginCloakBreak();
        break;
      case 'emp':
        this.clearTrainingTarget();
        h.devices.empCooldown = 0;
        this.trainingTarget = h.spawnTrainingTarget(this.clearPoint(135, 35));
        this.trainingFireTimer = 0;
        break;
      case 'mine':
        this.prepareMining();
        this.holdingsBefore = this.holdings;
        break;
      case 'loadout-open': this.supplyEngineeringMaterials(); break;
      case 'craft': this.craftDone = false; break;
      case 'trade-open': h.inventory.add('scrap', Math.max(0, 8 - h.inventory.counts.scrap)); this.prepareMerchant(); h.stageTutorialScene('trade'); break;
      case 'trade':
        this.tradeDone = false;
        h.inventory.add('scrap', Math.max(0, 8 - h.inventory.counts.scrap));
        break;
      case 'planet': this.preparePlanet(); break;
      case 'surface-flight':
        this.surfaceMission = h.prepareSurfaceMission();
        break;
      case 'surface-turret': this.ensureSurfaceMission(); break;
      case 'surface-stash': this.ensureSurfaceMission(); break;
      case 'lift':
        this.ensureSurfaceMission();
        this.waypoint = h.player.position.clone().addScaledVector(up, 140);
        break;
      case 'jump':
        this.sectorBefore = h.sectorIndex;
        h.inventory.add('flux', Math.max(0, 4 - h.inventory.counts.flux));
        this.prepareJumpVector();
        break;
    }
  }

  update(
    id: TutorialStepId,
    dt: number,
    testCompletion = true,
    narrationReady = true,
  ): TutorialScenarioUpdate {
    const h = this.host;
    if ((id === 'shield' || id === 'hull') && narrationReady) this.updatePendingDamage(dt);
    if (id === 'mine' && this.oreBody?.ore !== null) h.player.faceToward(this.miningAimPoint);
    if (id === 'emp') this.updateEmp(dt);
    const cloakComplete = id === 'cloak' && this.trainingTarget
      ? this.stealth.updateCloak(this.trainingTarget, dt) : false;
    if (this.trainingTarget?.alive) {
      this.trainingTarget.velocity.multiplyScalar(Math.exp(-8 * dt));
    }
    if (!testCompletion) return { complete: false };
    if (id === 'missile-dodge' && this.trainingTarget) {
      return this.stealth.updateMissileDodge(this.trainingTarget, dt, narrationReady);
    }
    let complete = false;
    switch (id) {
      case 'flight': complete = !!this.waypoint && h.player.position.distanceTo(this.waypoint) < 38; break;
      case 'boost': complete = h.player.boosting; break;
      case 'target': complete = h.targeting.current?.ship === this.trainingTarget; break;
      case 'guns': complete = this.trainingHealth < this.targetHealth - 0.1; break;
      case 'seekers': complete = !!this.trainingTarget &&
        h.playerSeekerImpacts(this.trainingTarget) > this.seekerImpactsBefore; break;
      case 'shield': complete = h.player.shield < this.shieldBefore - 0.1; break;
      case 'hull': complete = h.player.hull < this.hullBefore - 0.1; break;
      case 'repair': complete = h.player.hull > this.hullBefore + 0.1; break;
      case 'cloak': complete = cloakComplete; break;
      case 'cloak-break': complete = !!this.trainingTarget &&
        this.stealth.updateCloakBreak(this.trainingTarget, dt); break;
      case 'emp': complete = (this.trainingTarget?.stunTimer ?? 0) > 0.2; break;
      case 'mine': complete = this.holdings > this.holdingsBefore || this.oreBody?.ore === null; break;
      case 'loadout-open': complete = h.state === 'loadout'; break;
      case 'craft': complete = this.craftDone; break;
      case 'loadout-close': complete = h.state === 'playing'; break;
      case 'trade-open': complete = h.state === 'trade'; break;
      case 'trade': complete = this.tradeDone; break;
      case 'trade-close': complete = h.state === 'playing'; break;
      case 'planet': complete = h.surface !== null; break;
      case 'surface-flight':
        complete = !!this.surfaceMission && h.player.position.distanceTo(this.surfaceMission.base) < 105;
        break;
      case 'surface-turret': complete = this.surfaceMission?.turret.alive === false; break;
      case 'surface-stash': complete = this.surfaceMission?.stash.destroyed === true; break;
      case 'lift': complete = h.surface === null; break;
      case 'jump': complete = h.sectorIndex > this.sectorBefore; break;
    }
    return { complete };
  }

  setCraftDone(): void { this.craftDone = true; }
  setTradeDone(): void { this.tradeDone = true; }

  protectPlayer(): void {
    const player = this.host.player;
    if (!player.alive) player.alive = true;
    player.hull = Math.max(player.hull, player.hullMax * 0.12);
  }

  navigation(id: TutorialStepId): NavigationDestination | null {
    const position = this.navigationPosition(id);
    if (!position) return null;
    const tracked = this.trainingTarget;
    return {
      key: position,
      label: this.navigationLabel(id),
      kind: id === 'planet' ? 'planet'
        : id === 'mine' ? 'vein'
          : id === 'surface-flight' ? 'base'
            : id === 'surface-stash' ? 'stash' : 'objective',
      position,
      valid: tracked && ['target', 'guns', 'seekers', 'missile-dodge', 'shield', 'hull', 'emp'].includes(id)
        ? () => tracked.alive : undefined,
    };
  }

  private beginDamageLesson(kind: 'shield' | 'hull'): void {
    const h = this.host;
    this.clearTrainingTarget();
    this.ensureTrainingTarget(true, 105);
    h.player.alive = true;
    h.player.object.visible = true;
    h.player.velocity.set(0, 0, 0);
    h.player.hull = h.player.hullMax;
    h.player.shield = kind === 'shield' ? h.player.shieldMax : 0;
    this.shieldBefore = h.player.shield;
    this.hullBefore = h.player.hull;
    this.pendingDamage = kind;
    this.damageRetry = 0;
  }

  private updatePendingDamage(dt: number): void {
    const kind = this.pendingDamage;
    if (!kind || !this.trainingTarget?.alive) return;
    const player = this.host.player;
    const landed = kind === 'shield'
      ? player.shield < this.shieldBefore - 0.1
      : player.hull < this.hullBefore - 0.1;
    if (landed) { this.pendingDamage = null; return; }
    this.damageRetry -= dt;
    if (this.damageRetry > 0) return;
    this.damageRetry = 1.35;
    this.host.fireTrainingHit(
      this.trainingTarget,
      kind === 'shield' ? Math.max(12, player.shieldMax * 0.32)
        : Math.max(18, player.hullMax * 0.38),
    );
  }

  private updateEmp(dt: number): void {
    const target = this.trainingTarget;
    this.host.devices.empCooldown = 0;
    if (!target?.alive || target.stunTimer > 0) return;
    this.trainingFireTimer -= dt;
    if (this.trainingFireTimer <= 0) {
      this.host.fireTrainingBurst(target);
      this.trainingFireTimer = 0.42;
    }
  }

  private navigationPosition(id: TutorialStepId): Vector3 | null {
    switch (id) {
      case 'target': case 'guns': case 'seekers': case 'missile-dodge':
      case 'shield': case 'hull': case 'cloak': case 'cloak-break': case 'emp':
        return this.trainingTarget?.position ?? null;
      case 'mine': return this.oreBody?.position ?? null;
      case 'trade-open': return this.merchant?.position ?? null;
      case 'planet': return this.planet?.position ?? null;
      case 'surface-flight': return this.surfaceMission?.base ?? null;
      case 'surface-turret': return this.surfaceMission?.turret.position ?? null;
      case 'surface-stash': return this.surfaceMission?.stash.position ?? null;
      default: return this.waypoint;
    }
  }

  private navigationLabel(id: TutorialStepId): string {
    switch (id) {
      case 'flight': return 'Navigation gate';
      case 'target': case 'guns': case 'seekers': case 'shield': case 'hull': case 'emp':
        return 'Training contact';
      case 'missile-dodge': return 'Seeker source';
      case 'cloak': case 'cloak-break': return 'Training sentry';
      case 'mine': return 'Mineral vein';
      case 'trade-open': return 'Merchant';
      case 'planet': return 'Planetfall';
      case 'surface-flight': return 'Vigil base';
      case 'surface-turret': return 'Training battery';
      case 'surface-stash': return 'Salvage cache';
      case 'lift': return 'Skyward';
      case 'jump': return 'Jump vector';
      default: return 'Objective';
    }
  }

  private supplyEngineeringMaterials(): void {
    const inventory = this.host.inventory;
    inventory.add('scrap', Math.max(0, 12 - inventory.counts.scrap));
    inventory.add('crystal', Math.max(0, 8 - inventory.counts.crystal));
  }

  private ensureTrainingTarget(aimed: boolean, distance = 190): void {
    const h = this.host;
    if (!this.trainingTarget?.alive) {
      this.trainingTarget = h.spawnTrainingTarget(this.clearPoint(distance, aimed ? 0 : 55));
    }
    if (!aimed || !this.trainingTarget) return;
    h.player.faceToward(this.trainingTarget.position);
    h.chaseCam.snapTo(h.player.object);
    h.targeting.current = {
      ship: this.trainingTarget,
      leadPoint: this.trainingTarget.position.clone(),
      distance: h.player.position.distanceTo(this.trainingTarget.position),
      aimAssist: true,
    };
  }

  private clearPoint(distance: number, sideOffset: number): Vector3 {
    const player = this.host.player;
    player.forward(direction).normalize();
    sideDirection.set(-direction.z, 0.18, direction.x).normalize();
    for (const multiplier of [1, -1, 2, -2, 0]) {
      const point = player.position.clone()
        .addScaledVector(direction, distance)
        .addScaledVector(sideDirection, sideOffset * multiplier);
      path.copy(point).sub(player.position);
      const blocked = this.host.worldBodies.some((body) => {
        const t = Math.max(0, Math.min(1,
          scratch.copy(body.position).sub(player.position).dot(path) / path.lengthSq()));
        nearestPoint.copy(player.position).addScaledVector(path, t);
        return !body.destroyed && nearestPoint.distanceTo(body.position) < body.radius + 18;
      });
      if (!blocked) return point;
    }
    return player.position.clone().addScaledVector(up, distance);
  }

  private prepareMining(): void {
    const body = this.host.worldBodies.find((candidate) =>
      !candidate.destroyed && candidate.ore !== null && candidate.orePoints.length > 0,
    ) ?? null;
    this.oreBody = body;
    if (!body) return;
    body.oreHp = Math.min(body.oreHp, 12);
    const aimPoint = this.miningAimPoint;
    direction.copy(aimPoint).sub(body.position).normalize();
    this.host.player.position.copy(aimPoint).addScaledVector(direction, 34);
    this.host.player.velocity.set(0, 0, 0);
    this.host.player.faceToward(aimPoint);
    this.host.targeting.current = null;
    this.host.chaseCam.snapTo(this.host.player.object);
  }

  private prepareMerchant(): void {
    this.merchant = this.host.neutrals.find((neutral) => neutral.alive && neutral.isMerchant) ?? null;
    if (!this.merchant) return;
    this.merchant.forward(direction);
    this.host.player.position.copy(this.merchant.position)
      .addScaledVector(direction, -72).addScaledVector(up, 18);
    this.host.player.velocity.set(0, 0, 0);
    this.host.player.faceToward(this.merchant.position);
    this.host.chaseCam.snapTo(this.host.player.object);
  }

  private preparePlanet(): void {
    this.planet = this.host.planets[0] ?? null;
    if (!this.planet) return;
    direction.copy(this.planet.position).normalize();
    this.host.player.position.copy(this.planet.position)
      .addScaledVector(direction, -(this.planet.radius + 760));
    this.host.player.velocity.set(0, 0, 0);
    this.host.player.faceToward(this.planet.position);
    this.host.chaseCam.snapTo(this.host.player.object);
  }

  private prepareJumpVector(): void {
    const player = this.host.player;
    if (this.planet) direction.copy(player.position).sub(this.planet.position).normalize();
    else player.forward(direction);
    this.waypoint = player.position.clone().addScaledVector(direction, 420);
    player.faceToward(this.waypoint);
    player.velocity.set(0, 0, 0);
    this.host.chaseCam.snapTo(player.object);
  }

  private ensureSurfaceMission(): void {
    this.surfaceMission ??= this.host.prepareSurfaceMission();
  }

  private get trainingHealth(): number {
    return this.trainingTarget ? this.trainingTarget.hull + this.trainingTarget.shield : 0;
  }

  private get holdings(): number {
    const counts = this.host.inventory.counts;
    return counts.scrap + counts.crystal + counts.flux;
  }

  private get miningAimPoint(): Vector3 {
    const points = this.oreBody?.orePoints;
    return points?.[Math.floor(points.length / 2)] ?? this.oreBody?.position ?? scratch;
  }

  private clearTrainingTarget(): void {
    if (!this.trainingTarget) return;
    this.host.removeTrainingTarget(this.trainingTarget);
    this.trainingTarget = null;
    this.host.targeting.current = null;
  }
}
