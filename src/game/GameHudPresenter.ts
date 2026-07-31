import { Vector3 } from 'three';
import { Targeting } from '../combat/Targeting';
import { WeaponSystem } from '../combat/WeaponSystem';
import { GameLoop } from '../core/GameLoop';
import { NeutralShip } from '../entities/NeutralShip';
import { ResourceType } from '../entities/PickupSystem';
import { PlayerShip } from '../entities/PlayerShip';
import { Ship } from '../entities/Ship';
import { AsteroidBody } from '../world/AsteroidField';
import { PlanetSurface } from '../world/PlanetSurface';
import { ChaseCamera } from '../rendering/ChaseCamera';
import { Hud, HudFrameState } from '../ui/Hud';
import { Radar3D } from '../ui/Radar3D';
import { TargetPreview } from '../ui/TargetPreview';
import { DeviceSystem } from './Devices';
import { EncounterDirector } from './EncounterDirector';
import { JUMP_FLUX_COST, JUMP_SPOOL_TIME, targetPresentation } from './GameConstants';
import { HudProjector } from './HudProjection';
import { Inventory } from './Inventory';
import { Quest, QuestSystem } from './Quests';

const jumpDirection = new Vector3();

export interface GameHudHost {
  readonly hud: Hud;
  readonly chaseCam: ChaseCamera;
  readonly loop: GameLoop;
  readonly player: PlayerShip;
  readonly targeting: Targeting;
  readonly weapons: WeaponSystem;
  readonly shootables: Ship[];
  readonly quests: QuestSystem;
  readonly inventory: Inventory;
  readonly devices: DeviceSystem;
  readonly neutrals: NeutralShip[];
  readonly encounters: EncounterDirector | null;
  readonly surface: PlanetSurface | null;
  readonly pendingOffer: Quest | null;
  readonly lootAimed: 'stash' | 'vein' | null;
  readonly lootAimPoint: Vector3 | null;
  readonly lootAimBody: AsteroidBody | null;
  readonly score: number;
  readonly sectorIndex: number;
  readonly jumpSpool: number;
  readonly jumpSuppressed: boolean;
  findAimedPlanet(): number | null;
  nearestNeutral(): NeutralShip | null;
}

/**
 * Converts live simulation state into one HUD frame. Projection smoothing,
 * radar rendering, target preview orientation, and prompt precedence live here
 * rather than in the game-state orchestrator.
 */
export class GameHudPresenter {
  readonly radar = new Radar3D();
  private readonly projector = new HudProjector();
  private readonly targetPreview = new TargetPreview();

  constructor(private readonly host: GameHudHost) {
    host.hud.attachRadar(this.radar.canvas);
    host.hud.attachTargetPreview(this.targetPreview.canvas);
  }

  flyPickup(type: ResourceType): void {
    const host = this.host;
    const anchor = this.projector.projectAnchor(
      host.player.position,
      host.chaseCam.camera,
      window.innerWidth,
      window.innerHeight,
    );
    if (anchor) host.hud.flyPickup(type, anchor.x, anchor.y);
  }

  update(dt = 1 / 60): void {
    const host = this.host;
    const player = host.player;
    const camera = host.chaseCam.camera;
    const width = window.innerWidth;
    const height = window.innerHeight;

    const target = host.targeting.current;
    const weapon = host.weapons.weapon;
    const weaponReach = weapon.projectileSpeed * weapon.life;
    const objectives = host.quests.active
      .filter((quest) => quest.kind === 'delivery' && quest.destination)
      .map((quest) => quest.destination!);
    const {
      target: targetState,
      contacts,
      offscreen,
      radarContacts,
    } = this.projector.project(
      camera,
      player.position,
      target,
      host.shootables,
      objectives,
      weaponReach,
      width,
      height,
    );

    let promptAnchor: HudFrameState['promptAnchor'] = null;
    if (host.lootAimed === 'vein' && host.lootAimPoint && host.lootAimBody) {
      promptAnchor = this.projector.projectSmoothedAnchor(
        host.lootAimPoint,
        host.lootAimBody,
        camera,
        width,
        height,
        dt,
        1.05,
      );
    } else {
      this.projector.resetPromptAnchor();
    }

    const nearHauler = host.nearestNeutral();
    const veinPromptActive =
      !host.pendingOffer &&
      !nearHauler &&
      host.lootAimed === 'vein' &&
      promptAnchor !== null;
    const prompt = host.pendingOffer
      ? null
      : nearHauler
        ? nearHauler.isMerchant
          ? 'R · Dock & trade'
          : host.quests.hasTurnIn(host.inventory.counts)
            ? 'R · Deliver goods'
            : 'R · Hail hauler'
        : host.lootAimed === 'stash'
          ? 'Shoot · Crack the stash open'
          : veinPromptActive
            ? 'Shoot · Mine the vein'
            : !host.surface && host.findAimedPlanet() !== null
              ? 'Hold J · Land on planet'
              : null;

    const pendingOffer = host.pendingOffer;
    const offer = pendingOffer
      ? {
          title: pendingOffer.title,
          description: pendingOffer.description,
          reward:
            `Pay: +${pendingOffer.reward.score} pts` +
            (pendingOffer.reward.flux ? ` · ✦ ${pendingOffer.reward.flux}` : '') +
            (pendingOffer.reward.crystal ? ` · ◆ ${pendingOffer.reward.crystal}` : '') +
            (pendingOffer.reward.scrap ? ` · ▲ ${pendingOffer.reward.scrap}` : ''),
        }
      : null;

    this.radar.update(player.object.quaternion, player.position, radarContacts);

    const targetRotation = this.projector.targetRotation(camera, target?.ship ?? null);
    const targetInfo = target
      ? targetPresentation(target.ship, target.aimAssist)
      : null;
    if (target) {
      this.targetPreview.update(
        target.ship.kind,
        target.ship.hull / target.ship.hullMax,
        targetRotation,
        targetInfo!.relationship,
      );
    } else {
      this.targetPreview.update(null, 0, targetRotation);
    }

    host.hud.update({
      hull: player.hull,
      hullMax: player.hullMax,
      shield: player.shield,
      shieldMax: player.shieldMax,
      energy: host.weapons.energy,
      energyMax: host.weapons.energyMax,
      boost: player.boostEnergy,
      boostMax: player.stats.boostEnergyMax,
      speed: player.velocity.length(),
      boosting: player.boosting,
      weaponIndex: host.weapons.weaponIndex,
      weaponNames: host.weapons.weaponNames,
      missileReadyFrac: 1 - host.weapons.missileCooldown / 1.35,
      missiles: host.weapons.missileRate > 0 ? host.inventory.missiles : null,
      score: host.score,
      alert: host.encounters?.alert ?? 0,
      sector: host.sectorIndex,
      jump: this.jumpStatus(),
      devices: {
        cloak: host.devices.cloakState(),
        emp: host.devices.empState(),
        nano: host.inventory.nanobots,
      },
      prompt,
      promptAnchor: veinPromptActive ? promptAnchor : null,
      questLog: host.quests.active.map((quest) => ({
        title: quest.title,
        progress: quest.progress,
      })),
      offer,
      merchantPresent: host.neutrals.some((neutral) => neutral.alive && neutral.isMerchant),
      onPlanet: host.surface !== null,
      targetPreview: target
        ? {
            name: targetInfo!.name,
            detail: targetInfo!.detail,
            relationship: targetInfo!.relationship,
            hullFrac: target.ship.hull / target.ship.hullMax,
          }
        : null,
      fps: host.loop.fps,
      target: targetState,
      contacts,
      offscreen,
      resources: {
        scrap: host.inventory.counts.scrap,
        crystal: host.inventory.counts.crystal,
        flux: host.inventory.counts.flux,
      },
    });
  }

  private jumpStatus(): { label: string; frac: number } {
    const host = this.host;
    if (host.jumpSpool >= 0) {
      const fraction = 1 - host.jumpSpool / JUMP_SPOOL_TIME;
      return { label: `Spooling ${Math.round(fraction * 100)}%`, frac: fraction };
    }
    if (host.surface) {
      host.player.forward(jumpDirection);
      return jumpDirection.y > 0.5
        ? { label: 'Hold J — lift off', frac: 1 }
        : { label: 'Aim skyward to leave', frac: 0 };
    }
    if (host.findAimedPlanet() !== null) return { label: 'Hold J — LAND', frac: 1 };
    if (host.jumpSuppressed) return { label: 'Suppressed', frac: 0 };
    if (host.inventory.counts.flux < JUMP_FLUX_COST) {
      return { label: `Need ${JUMP_FLUX_COST} ✦ flux`, frac: 0 };
    }
    return { label: 'Hold J', frac: 1 };
  }
}
