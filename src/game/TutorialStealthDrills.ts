import { Vector3 } from 'three';
import { EnemyShip } from '../entities/EnemyShip';
import { TutorialHost } from './TutorialHost';

export type TutorialScenarioEvent = 'dodge-assist' | 'dodge-resume' | 'dodge-clean';
export interface TutorialScenarioUpdate {
  complete: boolean;
  event?: TutorialScenarioEvent;
}

const lateral = new Vector3();

/** Stateful seeker-evasion and cloak-infiltration training drills. */
export class TutorialStealthDrills {
  private readonly stageOrigin = new Vector3();
  private readonly dodgeApproach = new Vector3();
  private dodgeAssist = false;
  private dodgeReleased = false;
  private dodgeFinishTimer = 0;
  private dodgeHull = 0;
  private dodgeShield = 0;
  private cloakFireTimer = 0;
  private cloakBreakTimer = 0;

  constructor(private readonly host: TutorialHost) {}

  reset(): void {
    this.dodgeAssist = false;
    this.dodgeReleased = false;
    this.dodgeFinishTimer = 0;
    this.cloakFireTimer = 0;
    this.cloakBreakTimer = 0;
  }

  beginMissileDodge(target: EnemyShip): void {
    const h = this.host;
    h.player.faceToward(target.position);
    h.chaseCam.snapTo(h.player.object);
    this.stageOrigin.copy(h.player.position);
    this.dodgeApproach.copy(h.player.position).sub(target.position).normalize();
    this.dodgeAssist = false;
    this.dodgeReleased = false;
    this.dodgeFinishTimer = 0;
    this.dodgeHull = h.player.hull;
    this.dodgeShield = h.player.shield;
  }

  updateMissileDodge(target: EnemyShip, dt: number, narrationReady = true): TutorialScenarioUpdate {
    const player = this.host.player;
    player.hull = Math.max(player.hull, this.dodgeHull);
    player.shield = Math.max(player.shield, this.dodgeShield);
    player.alive = true;
    if (this.dodgeReleased) {
      this.dodgeFinishTimer -= dt;
      return { complete: this.dodgeFinishTimer <= 0 };
    }
    if (!narrationReady) return { complete: false };
    const offset = lateral.copy(this.host.player.position).sub(this.stageOrigin);
    offset.addScaledVector(this.dodgeApproach, -offset.dot(this.dodgeApproach));
    const displaced = offset.length() >= 24;
    const threat = this.host.incomingMissileThreat();
    if (displaced) {
      this.host.releaseTrainingSeekers();
      this.dodgeReleased = true;
      this.dodgeFinishTimer = 2.2;
      return { complete: false, event: this.dodgeAssist ? 'dodge-resume' : 'dodge-clean' };
    }
    if (!this.dodgeAssist && threat.imminent && threat.timeToImpact <= 1.05) {
      this.dodgeAssist = true;
      return { complete: false, event: 'dodge-assist' };
    }
    if (!threat.locked) this.host.fireTrainingSeeker(target);
    return { complete: false };
  }

  beginCloak(): void {
    this.cloakFireTimer = 0;
    this.host.weapons.energy = this.host.weapons.energyMax;
  }

  /** Keep training energy full and let the sentry visibly lose the pilot. */
  updateCloak(target: EnemyShip, dt: number): boolean {
    const h = this.host;
    if (h.devices.cloaked) {
      h.weapons.energy = h.weapons.energyMax;
      this.cloakFireTimer = 0.35;
    } else if (target.alive) {
      target.faceToward(h.player.position);
      this.cloakFireTimer -= dt;
      if (this.cloakFireTimer <= 0) {
        h.fireTrainingBurst(target);
        this.cloakFireTimer = 0.65;
      }
    }
    return h.devices.cloaked && h.player.position.distanceTo(target.position) <= 65;
  }

  beginCloakBreak(): void {
    this.cloakBreakTimer = 0;
    this.cloakFireTimer = 0;
  }

  updateCloakBreak(target: EnemyShip, dt: number): boolean {
    const h = this.host;
    if (h.devices.cloaked) {
      h.weapons.energy = h.weapons.energyMax;
      this.cloakBreakTimer = 0;
      return false;
    }
    this.cloakBreakTimer += dt;
    this.cloakFireTimer -= dt;
    if (target.alive && this.cloakFireTimer <= 0) {
      h.fireTrainingBurst(target);
      this.cloakFireTimer = 0.65;
    }
    return this.cloakBreakTimer >= 0.75;
  }
}
