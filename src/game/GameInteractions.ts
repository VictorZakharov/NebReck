import {
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  PointLight,
  Vector3,
} from 'three';
import { EnemyShip } from '../entities/EnemyShip';
import { NeutralShip } from '../entities/NeutralShip';
import { TradeScreen } from '../ui/TradeScreen';
import { EMP_RADIUS, EMP_STUN, NANO_HEAL } from './Devices';
import { HunterSpawnSpec } from './EncounterDirector';
import { GameScreens } from './GameScreens';
import { findAimedLoot, nearestNeutral } from './InteractionTargeting';
import { Quest } from './Quests';
import { EXPLORE_COMMS } from './Story';
import { applyTrade, canTrade } from './Trade';
import { SYSTEM_LOCKOUT_RANGE_METERS } from './GameConstants';

/**
 * Player-triggered world interactions: travel, contracts, trade, devices, and
 * story events. Continuous simulation stays in GameRuntime.
 */
export abstract class GameInteractions extends GameScreens {
  /** The capital ship projects a jump-suppression field. */
  override get jumpSuppressed(): boolean {
    return this.worldFlow.jumpSuppressed;
  }

  startJump(auto = false): boolean {
    return this.worldFlow.startJump(auto);
  }

  override cancelJump(message: string | null): void {
    this.worldFlow.cancelJump(message);
  }

  /** Which planet, if any, sits in the crosshair cone. */
  protected override findAimedPlanet(): number | null {
    return this.worldFlow.findAimedPlanet();
  }

  /** Detach the space world and enter the persistent surface instance. */
  enterPlanet(index: number): void {
    this.worldFlow.enterPlanet(index);
  }

  /** Restore the exact space world that was present before planetfall. */
  exitPlanet(): void {
    this.worldFlow.exitPlanet();
  }

  protected override rebuildSector(): void {
    this.worldFlow.rebuildSector();
  }

  protected override deploySectorEntities(): void {
    this.worldFlow.deploySectorEntities();
  }

  protected override threatScale(): number {
    return this.worldFlow.threatScale();
  }

  /** Hail the nearest hauler: trade with merchants, contracts otherwise. */
  hailNearestNeutral(): boolean {
    const neutral = this.nearestNeutral();
    if (!neutral) return false;

    if (neutral.isMerchant) {
      this.openTrade();
      return true;
    }

    const turnIn = this.quests.tryTurnIn(this.inventory.counts);
    if (turnIn && turnIn.resource && turnIn.amount) {
      this.inventory.counts[turnIn.resource] -= turnIn.amount;
      this.completeQuest(turnIn);
      return true;
    }

    if (this.quests.active.length >= 2) {
      this.hud.showBanner('Contract log full');
      return false;
    }

    this.pendingOffer = this.quests.generateOffer(
      this.sectorIndex,
      this.player.position,
    );
    this.voice.speak(
      `${this.pendingOffer.title}. ${this.pendingOffer.description}`,
    );
    this.audio.uiClick();
    return true;
  }

  openTrade(): void {
    if (this.state !== 'playing') return;
    this.state = 'trade';
    this.audio.silenceEngine();
    this.hud.setVisible(false);
    this.input.exitPointerLock();
    this.tradeScreen = new TradeScreen(this.uiRoot, this.inventory, {
      onTrade: (id) => this.executeTrade(id),
      isAvailable: (id) => id !== 'buy-missiles' || this.weapons.missileRate > 0,
      onClose: () => this.closeTrade(),
      onHover: () => this.audio.uiHover(),
      onClick: () => this.audio.pickup(),
    });
  }

  closeTrade(): void {
    if (this.state !== 'trade') return;
    this.voice.cancel();
    this.closeOverlays();
    this.hud.setVisible(true);
    this.state = 'playing';
    this.autoPauseGraceUntil = performance.now() + 1500;
    if (!this.headless) this.input.enterFlightMode();
  }

  executeTrade(id: string): boolean {
    if (id === 'buy-missiles' && this.weapons.missileRate <= 0) return false;
    if (!canTrade(id, this.inventory)) return false;
    applyTrade(id, this.inventory);
    return true;
  }

  acceptOffer(): boolean {
    const offer = this.pendingOffer;
    if (!offer) return false;
    this.voice.cancel();
    this.pendingOffer = null;
    this.quests.accept(offer);
    if (offer.kind === 'delivery' && offer.destination) {
      this.spawnQuestBeacon(offer);
    }
    this.hud.showBanner(`Contract accepted — ${offer.title}`);
    this.audio.uiClick();
    return true;
  }

  declineOffer(): void {
    if (!this.pendingOffer) return;
    this.voice.cancel();
    this.pendingOffer = null;
    this.hud.showBanner('Contract declined');
    this.audio.uiClick();
  }

  /**
   * Report loot under the boresight. While non-null, soft-lock disengages so
   * shots fly at the point of interest rather than curving toward a hostile.
   */
  protected aimedLoot(targetDot = -1, aimDirection?: Vector3): 'stash' | 'vein' | null {
    const result = findAimedLoot(
      this.player,
      this.surface?.interactionBodies ?? this.world.bodies,
      this.shootables,
      targetDot,
      (from, to, body) => this.combat.hasLineOfSight(from, to, body),
      aimDirection,
    );
    this.lootAimBody = result.body;
    if (result.kind === 'vein' && this.lootAimBody?.orePoints.length) {
      const anchor = this.lootAimPoint ?? new Vector3();
      anchor.set(0, 0, 0);
      for (const point of this.lootAimBody.orePoints) anchor.add(point);
      anchor.multiplyScalar(1 / this.lootAimBody.orePoints.length);
      this.lootAimPoint = anchor;
    } else if (result.kind === 'stash' && this.lootAimBody) {
      this.lootAimPoint = this.lootAimBody.position;
    } else {
      this.lootAimPoint = null;
    }
    return result.kind;
  }

  protected override nearestNeutral(): NeutralShip | null {
    return nearestNeutral(this.player.position, this.neutrals);
  }

  protected override completeQuest(quest: Quest): void {
    this.score += quest.reward.score;
    if (quest.reward.flux) this.inventory.add('flux', quest.reward.flux);
    if (quest.reward.crystal) {
      this.inventory.add('crystal', quest.reward.crystal);
    }
    if (quest.reward.scrap) this.inventory.add('scrap', quest.reward.scrap);
    this.hud.showBanner(`Contract complete — +${quest.reward.score}`);
    this.events.emit('comms', {
      speaker: 'HAULER',
      text: 'Payment transferred. The lanes remember their friends.',
    });
    this.audio.pickup();
    this.removeQuestBeacon(quest.id);
    this.events.emit('score-changed', { score: this.score });
  }

  private spawnQuestBeacon(quest: Quest): void {
    const beacon = new Group();
    const core = new Mesh(
      new OctahedronGeometry(4, 0),
      new MeshStandardMaterial({
        color: 0x1a1405,
        emissive: new Color(0xffd24a),
        emissiveIntensity: 2.6,
      }),
    );
    beacon.add(core);
    beacon.add(new PointLight(0xffd24a, 400, 220, 1.8));
    beacon.position.copy(quest.destination!);
    this.scene.add(beacon);
    this.questBeacons.set(quest.id, beacon);
  }

  protected override removeQuestBeacon(id: number): void {
    const beacon = this.questBeacons.get(id);
    if (!beacon) return;
    this.scene.remove(beacon);
    this.questBeacons.delete(id);
  }

  activateCloak(): boolean {
    if (this.state !== 'playing' || !this.player.alive) return false;
    if (this.devices.cloaked) {
      this.devices.breakCloak();
      this.cloakVisual.set(this.player, false);
      this.hud.showBanner('Cloak dropped');
      return true;
    }

    if (this.hasNearbyHostile(SYSTEM_LOCKOUT_RANGE_METERS)) {
      this.hud.showBanner('Too close — cloak refused');
      this.audio.uiHover();
      return false;
    }

    if (!this.devices.tryCloak()) return false;
    this.cloakVisual.set(this.player, true);
    this.audio.hitShield();
    this.hud.showBanner('Cloak engaged');
    return true;
  }

  activateEmp(): boolean {
    if (
      this.state !== 'playing' ||
      !this.player.alive ||
      !this.devices.tryEmp()
    ) {
      return false;
    }

    this.pulses.spawn(this.player.position, EMP_RADIUS);
    this.audio.lance();
    const sparkColor = new Color(0.4, 1.5, 1.4);
    const zap = (ship: { position: Vector3 }): void => {
      for (let i = 0; i < 8; i++) {
        const [dx, dy, dz] = this.rng.unitSphere();
        this.particles.spawn({
          position: ship.position,
          velocity: new Vector3(dx * 14, dy * 14, dz * 14),
          color: sparkColor,
          size: 1.4,
          life: 0.5,
        });
      }
    };

    for (const enemy of this.enemies) {
      if (enemy.position.distanceTo(this.player.position) <= EMP_RADIUS) {
        enemy.stunTimer = EMP_STUN;
        zap(enemy);
      }
    }
    for (const turret of this.turrets) {
      if (turret.position.distanceTo(this.player.position) <= EMP_RADIUS) {
        turret.stunTimer = EMP_STUN;
        zap(turret);
      }
    }
    return true;
  }

  useNanobots(): boolean {
    const player = this.player;
    if (this.state !== 'playing' || !player.alive) return false;
    if (this.inventory.nanobots <= 0 || player.hull >= player.hullMax) {
      return false;
    }

    this.inventory.nanobots--;
    player.hull = Math.min(player.hullMax, player.hull + NANO_HEAL);
    const green = new Color(0.25, 1.2, 0.55);
    for (let i = 0; i < 14; i++) {
      const [dx, dy, dz] = this.rng.unitSphere();
      this.particles.spawn({
        position: player.position,
        velocity: new Vector3(dx * 8, dy * 8, dz * 8),
        color: green,
        size: 1.2,
        life: 0.7,
        drag: 0.4,
      });
    }
    this.audio.pickup();
    return true;
  }

  /** Opening fire drops the cloak instantly. */
  protected override breakCloakOnFire(): void {
    if (!this.devices.cloaked) return;
    this.devices.breakCloak();
    this.cloakVisual.set(this.player, false);
    this.hud.showBanner('Cloak broken');
  }

  /** Fire an exploration story beat exactly once per mission. */
  protected override storyComms(key: string): void {
    if (this.storyFired.has(key)) return;
    this.storyFired.add(key);
    const lines = EXPLORE_COMMS[key];
    if (!lines) return;
    lines.forEach((line, index) => {
      if (index === 0) this.events.emit('comms', line);
      else setTimeout(() => this.events.emit('comms', line), index * 2800);
    });
  }

  protected override placePlayerSafely(): void {
    this.worldFlow.placePlayerSafely();
  }

  protected wireEvents(): void {
    this.events.on('hunters-inbound', () => {
      this.hud.showBanner('Vigil hunters inbound');
      this.audio.warning();
      this.storyComms('hunters-inbound');
    });
    this.events.on('alert-changed', ({ alert }) => {
      if (alert > 0) this.audio.warning();
    });
    this.events.on('comms', ({ speaker, text }) => {
      this.hud.addComms(speaker, text);
    });
  }

  override spawnEnemy(spec: HunterSpawnSpec): void {
    const enemy = new EnemyShip(
      spec.kind,
      this.rng.fork(),
      spec.aggression,
      this.difficulty.enemyToughness * this.threatScale(),
      [],
      spec.weaponMode,
    );
    enemy.hunter = true;
    enemy.object.position.copy(spec.position);
    enemy.faceToward(this.player.position);
    this.scene.add(enemy.object);
    this.enemies.push(enemy);
  }
}
