import { Vector3 } from 'three';
import { Targeting } from '../combat/Targeting';
import { ProjectileSystem } from '../combat/ProjectileSystem';
import { WeaponSystem } from '../combat/WeaponSystem';
import { GameLoop } from '../core/GameLoop';
import { NeutralShip } from '../entities/NeutralShip';
import { ResourceType } from '../entities/PickupSystem';
import { PlayerShip } from '../entities/PlayerShip';
import { Ship } from '../entities/Ship';
import { AsteroidBody } from '../world/AsteroidField';
import { PlanetSurface } from '../world/PlanetSurface';
import { ChaseCamera } from '../rendering/ChaseCamera';
import { Hud } from '../ui/Hud';
import { Radar3D } from '../ui/Radar3D';
import { TargetPreview } from '../ui/TargetPreview';
import { DeviceSystem } from './Devices';
import { EncounterDirector } from './EncounterDirector';
import { JUMP_FLUX_COST, JUMP_SPOOL_TIME, targetPresentation } from './GameConstants';
import { HudProjector } from './HudProjection';
import { Inventory } from './Inventory';
import { NavigationSystem } from './NavigationSystem';
import { Quest, QuestSystem } from './Quests';
import { TutorialStepId } from './TutorialCards';

const jumpDirection = new Vector3();

export interface GameHudHost {
  readonly hud: Hud;
  readonly chaseCam: ChaseCamera;
  readonly loop: GameLoop;
  readonly player: PlayerShip;
  readonly targeting: Targeting;
  readonly weapons: WeaponSystem;
  readonly projectiles: ProjectileSystem;
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
  readonly jumpConsumesFlux: boolean;
  readonly navigation: NavigationSystem;
  readonly tutorialStep: TutorialStepId | null;
  findAimedPlanet(): number | null;
  planetPosition(index: number): Vector3 | null;
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
    const missileThreat = host.projectiles.incomingThreat(player);
    const objectives = host.quests.active
      .filter((quest) => quest.kind === 'delivery' && quest.destination)
      .map((quest) => quest.destination!);
    const navigation = host.navigation.current;
    const {
      target: targetState,
      contacts,
      offscreen,
      radarContacts,
      navigation: navigationMarker,
    } = this.projector.project(
      camera,
      player.position,
      target,
      host.shootables,
      objectives,
      navigation,
      weaponReach,
      width,
      height,
    );

    const tutorialStep = host.tutorialStep;
    const nearHauler = host.nearestNeutral();
    const aimedPlanetIndex = !host.surface ? host.findAimedPlanet() : null;
    const aimedPlanetPosition = aimedPlanetIndex === null
      ? null
      : host.planetPosition(aimedPlanetIndex);
    let objectPrompt: { text: string; point: Vector3; key: object } | null = null;
    if (!host.pendingOffer && nearHauler && allowsTutorialPrompt(tutorialStep, 'merchant')) {
      objectPrompt = {
        text: nearHauler.isMerchant
          ? 'R · Dock & trade'
          : host.quests.hasTurnIn(host.inventory.counts)
            ? 'R · Deliver goods'
            : 'R · Hail hauler',
        point: nearHauler.position,
        key: nearHauler.object,
      };
    } else if (
      !host.pendingOffer && host.lootAimed &&
      allowsTutorialPrompt(tutorialStep, host.lootAimed) &&
      host.lootAimPoint && host.lootAimBody
    ) {
      objectPrompt = {
        text: host.lootAimed === 'stash'
          ? 'Shoot · Crack the stash open'
          : 'Shoot · Mine the vein',
        point: host.lootAimPoint,
        key: host.lootAimBody,
      };
    } else if (
      !host.pendingOffer && aimedPlanetPosition &&
      allowsTutorialPrompt(tutorialStep, 'planet')
    ) {
      objectPrompt = {
        text: 'Hold J · Land on planet',
        point: aimedPlanetPosition,
        key: aimedPlanetPosition,
      };
    }
    const promptAnchor = objectPrompt
      ? this.projector.projectSmoothedAnchor(
          objectPrompt.point,
          objectPrompt.key,
          camera,
          width,
          height,
          dt,
          1.05,
        )
      : null;
    if (!objectPrompt) this.projector.resetPromptAnchor();
    const prompt = promptAnchor ? objectPrompt!.text : null;

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
    const oreBody = !target && host.lootAimed === 'vein' ? host.lootAimBody : null;
    const ore = oreBody?.ore ?? null;
    const previewInfo = target
      ? {
          kind: target.ship.kind,
          name: targetInfo!.name,
          detail: targetInfo!.detail,
          relationship: targetInfo!.relationship,
          hullFrac: target.ship.hull / target.ship.hullMax,
        }
      : ore
        ? {
            kind: `ore-${ore}`,
            name: ore === 'crystal' ? 'Ion Crystal Vein' : 'Scrap Alloy Vein',
            detail: 'Mineable · Exposed formation · Fire to extract',
            relationship: 'neutral' as const,
            hullFrac: Number.isFinite(oreBody!.oreHpMax)
              ? oreBody!.oreHp / Math.max(1, oreBody!.oreHpMax)
              : 1,
          }
        : null;
    this.targetPreview.update(
      previewInfo?.kind ?? null,
      previewInfo?.hullFrac ?? 0,
      targetRotation,
      previewInfo?.relationship,
    );

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
      missileThreat: {
        locked: missileThreat.locked,
        imminent: missileThreat.imminent,
        timeToImpact: missileThreat.timeToImpact,
        count: missileThreat.count,
      },
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
      promptAnchor,
      questLog: host.quests.active.map((quest) => ({
        title: quest.title,
        progress: quest.progress,
      })),
      offer,
      merchantPresent: host.neutrals.some((neutral) => neutral.alive && neutral.isMerchant),
      onPlanet: host.surface !== null,
      targetPreview: previewInfo
        ? {
            name: previewInfo.name,
            detail: previewInfo.detail,
            relationship: previewInfo.relationship,
            hullFrac: previewInfo.hullFrac,
          }
        : null,
      fps: host.loop.fps,
      target: targetState,
      contacts,
      offscreen,
      navigation: navigationMarker,
      resources: {
        scrap: host.inventory.counts.scrap,
        crystal: host.inventory.counts.crystal,
        flux: host.inventory.counts.flux,
      },
    });
  }

  private jumpStatus(): { label: string; frac: number } {
    const host = this.host;
    const fluxCount = `${JUMP_FLUX_COST}/${host.inventory.counts.flux}`;
    if (host.jumpSpool >= 0) {
      const fraction = 1 - host.jumpSpool / JUMP_SPOOL_TIME;
      return {
        label: `Spool ${Math.round(fraction * 100)}%${host.jumpConsumesFlux ? ` · ${fluxCount}` : ''}`,
        frac: fraction,
      };
    }
    if (host.tutorialStep && !['planet', 'lift', 'jump'].includes(host.tutorialStep)) {
      return { label: 'Training lock', frac: 0 };
    }
    if (host.surface) {
      host.player.forward(jumpDirection);
      return jumpDirection.y > 0.5
        ? { label: 'J · Lift off', frac: 1 }
        : { label: 'Aim skyward', frac: 0 };
    }
    if (host.tutorialStep === 'planet') {
      return host.findAimedPlanet() !== null
        ? { label: 'J · Land', frac: 1 }
        : { label: 'Align with planet', frac: 0 };
    }
    if (host.tutorialStep === null && host.findAimedPlanet() !== null) {
      return { label: 'J · Land', frac: 1 };
    }
    if (host.jumpSuppressed) return { label: 'Suppressed', frac: 0 };
    if (host.inventory.counts.flux < JUMP_FLUX_COST) {
      return { label: `${fluxCount} · Low flux`, frac: 0 };
    }
    return { label: `J · Flux ${fluxCount}`, frac: 1 };
  }
}

type TutorialPromptKind = 'merchant' | 'stash' | 'vein' | 'planet';

function allowsTutorialPrompt(
  step: TutorialStepId | null,
  kind: TutorialPromptKind,
): boolean {
  if (step === null) return true;
  return (step === 'trade-open' && kind === 'merchant') ||
    (step === 'mine' && kind === 'vein') ||
    (step === 'surface-stash' && kind === 'stash') ||
    (step === 'planet' && kind === 'planet');
}
