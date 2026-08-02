import { Color, Vector3 } from 'three';
import { CapitalBeamContext } from '../entities/CapitalShip';
import { STYLE_ENGINES } from '../entities/ShipMesh';
import { AdaptiveResolution } from '../rendering/AdaptiveResolution';
import { PostFx } from '../rendering/PostFx';
import type { AsteroidBody } from '../world/AsteroidField';
import { showPlayerDamageFeedback } from './DamageFeedback';
import {
  CAPITAL_TURRET_LOCK_RANGE_METERS,
  targetPresentation,
} from './GameConstants';
import { GameInteractions } from './GameInteractions';

const menuLook = new Vector3();
const trailPos = new Vector3();
const trailVel = new Vector3();
const aimForward = new Vector3();
const aimOffset = new Vector3();
const turretLosOrigin = new Vector3();

/**
 * Continuous simulation, input routing, rendering, and viewport management.
 *
 * The public Game facade initializes this layer after all inherited controller
 * state is constructed, avoiding event callbacks against a half-built object.
 */
export abstract class GameRuntime extends GameInteractions {
  readonly renderResolution = new AdaptiveResolution(
    window.innerWidth, window.innerHeight, window.devicePixelRatio,
  );
  private resizeRaf = 0;
  private resizeSettleTimer = 0;
  private viewportWidth = Math.max(1, window.innerWidth);
  private viewportHeight = Math.max(1, window.innerHeight);
  private viewportPixelRatio = this.renderResolution.pixelRatio;
  private missileWarning: 'none' | 'locked' | 'imminent' = 'none';
  private capitalBeamContext!: CapitalBeamContext;
  private readonly surfaceProjectileBodyQuery = (
    from: Vector3,
    to: Vector3,
    out: AsteroidBody[],
  ): readonly AsteroidBody[] => {
    if (!this.surface) {
      out.length = 0;
      return out;
    }
    return this.surface.queryBodiesAlongSegment(from, to, 1, out);
  };

  protected initializeRuntime(): void {
    const runtime = this;
    this.capitalBeamContext = {
      get player() { return runtime.player; },
      get playerVisible() { return runtime.player.alive && !runtime.devices.cloaked; },
      canSeePlayer: () => !!runtime.capital && runtime.combat.hasLineOfSight(
        runtime.capital.position,
        runtime.player.position,
      ),
      onCharge: () => {
        runtime.hud.showBanner('Capital annihilator charging');
        runtime.audio.capitalCharge();
      },
      onFire: (shot) => runtime.combat.capitalBeamFire(shot),
    };
    this.wireEvents();
    window.addEventListener('resize', () => this.scheduleResize());
    document.addEventListener('fullscreenchange', () => this.scheduleResize());
    document.addEventListener('pointerlockchange', () => {
      // Browser Esc exits pointer lock and should pause normal flight. Overlay
      // close paths briefly suppress this because lock reacquisition races the
      // pointerlockchange event.
      if (performance.now() < this.autoPauseGraceUntil) return;
      if (
        !this.headless &&
        !this.input.usesTouchControls &&
        this.state === 'playing' &&
        !this.input.isPointerLocked
      ) {
        this.pause();
      }
    });
  }

  protected override tick(dt: number, elapsed: number, wallDt?: number): void {
    if (wallDt && this.renderResolution.sampleFrame(wallDt)) {
      this.applyRenderResolution();
    }
    if (this.state === 'playing') {
      this.updatePlaying(dt);
    } else if (this.state === 'menu' || this.state === 'hangar') {
      this.updateMenuIdle(dt, elapsed);
    } else if (this.state === 'loadout') {
      if (this.input.wasPressed('Tab') || this.input.wasPressed('Escape')) {
        this.closeLoadout();
      }
    } else if (this.state === 'trade') {
      if (this.input.wasPressed('KeyR') || this.input.wasPressed('Escape')) {
        this.closeTrade();
      }
    }

    const frozen =
      this.state === 'paused' ||
      this.state === 'loadout' ||
      this.state === 'trade';
    this.sector.update(
      frozen ? 0 : dt,
      elapsed,
      this.chaseCam.camera.position,
    );
    if (!frozen) {
      this.particles.update(dt);
      this.explosions.update(dt);
      this.playerShield.update(dt);
      this.shipDebris.update(dt, this.surface);
      this.pulses.update(dt);
      this.warp.update(dt);
    }
    this.surface?.updatePresentation(this.chaseCam.camera.position);
    this.postFx.update(
      dt,
      this.state === 'playing' && this.player.boosting,
    );
    this.postFx.render(dt);
    this.touchControls.setVisible(this.state === 'playing');
    this.input.endFrame();
  }

  private updateMenuIdle(dt: number, elapsed: number): void {
    const inHangar = this.state === 'hangar';
    const time = elapsed * 0.1 + (inHangar ? this.hangarVisor.orbitYaw : 0);
    const lift = inHangar ? this.hangarVisor.orbitLift : 0;
    const orbitRadius = inHangar ? this.hangarVisor.orbitRadius : 10.5;
    const camera = this.chaseCam.camera;
    camera.position.set(
      Math.sin(time) * orbitRadius,
      3 + lift + Math.sin(time * 0.6) * 1.2,
      Math.cos(time) * orbitRadius,
    );
    menuLook.copy(this.player.object.position);
    if (inHangar) menuLook.y -= 2.6;
    camera.lookAt(menuLook);

    if (inHangar) {
      this.player.object.rotation.y = 0;
      camera.updateMatrixWorld();
      this.hangarVisor.place();
    } else {
      this.player.object.rotation.y += dt * 0.05;
    }
  }

  private updatePlaying(dt: number): void {
    const player = this.player;

    if (this.input.wasPressed('Escape')) {
      this.pause();
      return;
    }
    if (this.input.wasPressed('Tab')) {
      this.openLoadout();
      return;
    }
    if (this.input.wasPressed('KeyV')) {
      this.chaseCam.toggleMode();
      this.audio.uiClick();
    }
    if (this.jumpSpool < 0 && this.input.wasPressed('KeyJ')) this.startJump();
    if (this.input.wasPressed('KeyF')) this.activateCloak();
    if (this.input.wasPressed('KeyG')) this.activateEmp();
    if (this.input.wasPressed('KeyH')) this.useNanobots();
    if (this.input.wasPressed('KeyR')) {
      if (this.pendingOffer) this.acceptOffer();
      else this.hailNearestNeutral();
    }
    if (this.input.wasPressed('KeyX') && this.pendingOffer) {
      this.declineOffer();
    }
    // Docking changes state in the R handler. Do not restart engine audio.
    if (this.state !== 'playing') return;

    this.quests.updateCollectProgress(this.inventory.counts);
    for (const completed of this.quests.onPositionUpdate(player.position)) {
      this.completeQuest(completed);
    }
    this.missionTime += dt;
    this.inventory.regenerateMissiles(dt, player.def.missileRegenSeconds);

    this.updateDevices(dt);
    if (this.worldFlow.updateJumpSpool(dt)) return;
    this.resolvePlanetFloor();
    this.updateExplorationStory();
    this.rebuildTargetLists();
    this.updatePlayerFlight(dt);
    this.emitEngineTrail(dt);
    this.updateWorldActors(dt);

    this.projectiles.update(
      dt,
      this.shootables,
      player.alive ? player : null,
      this.world.bodies,
      (hit) => this.combat.resolveHit(hit),
      this.surface ? this.terrainProjectileHit : undefined,
      (target) => target !== player || !this.devices.cloaked,
      this.surface ? this.surfaceProjectileBodyQuery : undefined,
    );
    this.updateMissileWarning();
    this.pickups.update(
      dt,
      player.position,
      player.alive,
      (type) => this.combat.collect(type),
    );
    this.resolveShipCollisions(dt);

    if (this.updatePlayerDeath(dt)) return;
    if (this.sectorIndex > 1 && !this.surface) {
      this.encounters?.update(dt, player.position);
    }
    this.chaseCam.update(
      dt,
      player.object,
      player.speedFrac,
      player.boosting,
    );
    this.updateCameraPresentation(dt);
    this.updateHud(dt);
  }

  private updateDevices(dt: number): void {
    const player = this.player;
    this.devices.update(dt);
    this.cloakVisual.sync(player, this.devices.cloaked, dt);
    if (!this.devices.cloaked) return;

    const speed = player.velocity.length();
    const drain = player.boosting ? 16 : speed > 12 ? 7 : 2.5;
    this.weapons.energy -= drain * dt;
    if (this.weapons.energy > 0) return;
    this.weapons.energy = 0;
    this.devices.breakCloak();
    this.cloakVisual.set(player, false);
    this.hud.showBanner('Cloak collapsed');
  }

  private resolvePlanetFloor(): void {
    const player = this.player;
    if (!this.surface || !player.alive) return;
    const ground = this.surface.heightAt(player.position.x, player.position.z);
    if (player.position.y >= ground + 2.2) return;

    const sinkSpeed = -player.velocity.y;
    player.position.y = ground + 2.2;
    if (sinkSpeed > 12) {
      const damage = Math.max(3, sinkSpeed * 0.3);
      const result = player.takeDamage(damage);
      showPlayerDamageFeedback(this, {
        point: player.position,
        amount: damage,
        shieldAbsorbed: result.shieldAbsorbed,
        hudStrength: 0.5,
      });
    }
    player.velocity.y = Math.abs(player.velocity.y) * 0.25;
  }

  private updateExplorationStory(): void {
    const player = this.player;
    if (!player.alive || this.surface) return;
    for (const enemy of this.enemies) {
      if (enemy.position.distanceToSquared(player.position) < 420 * 420) {
        this.storyComms('first-contact');
        break;
      }
    }
    for (const cave of this.sector.caves) {
      if (cave.center.distanceToSquared(player.position) < 150 * 150) {
        this.storyComms('first-cave');
        break;
      }
    }
    if (
      this.capital &&
      this.capital.position.distanceToSquared(player.position) < 500 * 500
    ) {
      this.storyComms('capital-sighted');
    }
  }

  private rebuildTargetLists(): void {
    this.hostiles.length = 0;
    for (const enemy of this.enemies) this.hostiles.push(enemy);
    for (const turret of this.turrets) {
      if (!turret.alive) continue;
      const distantCapitalMount =
        this.capitalTurrets.includes(turret) &&
        turret.position.distanceToSquared(this.player.position) >
          CAPITAL_TURRET_LOCK_RANGE_METERS ** 2;
      if (!distantCapitalMount) this.hostiles.push(turret);
    }
    if (this.capital?.alive) this.hostiles.push(this.capital);

    this.shootables.length = 0;
    // Collision remains exact at every range even while distant carrier mounts
    // are collapsed into the whole-hull targeting contact above.
    for (const enemy of this.enemies) {
      if (enemy.alive) this.shootables.push(enemy);
    }
    for (const turret of this.turrets) {
      if (turret.alive) this.shootables.push(turret);
    }
    if (this.capital?.alive) this.shootables.push(this.capital);
    for (const neutral of this.neutrals) {
      if (neutral.alive) this.shootables.push(neutral);
    }
  }

  private updatePlayerFlight(dt: number): void {
    const player = this.player;
    if (!player.alive) return;

    player.update(dt, this.input);
    const weapon = this.weapons.weapon;
    this.chaseCam.camera.getWorldDirection(aimForward);
    this.targeting.update(
      player,
      this.hostiles,
      this.neutrals,
      weapon.projectileSpeed,
      weapon.projectileSpeed * weapon.life,
      aimForward,
      this.enemies.some((enemy) => enemy.alive && enemy.pursuingPlayer),
      this.chaseCam.camera.position,
    );
    const closeCombatTarget =
      this.targeting.current?.aimAssist === true &&
      this.targeting.current.distance <= weapon.projectileSpeed * weapon.life;
    const targetDot = this.targeting.current
      ? aimOffset.copy(this.targeting.current.ship.position).sub(player.position).normalize()
          .dot(aimForward)
      : -1;
    // A formation is informational and never auto-aimed. A close combat lock
    // always wins; otherwise the object closest to the camera crosshair wins.
    this.lootAimed = this.aimedLoot(closeCombatTarget ? 1 : targetDot, aimForward);
    if (this.lootAimed && !closeCombatTarget) this.targeting.current = null;
    this.weapons.update(
      dt,
      this.input,
      player,
      this.targeting,
      () => this.rng.next(),
      this.inventory,
      !this.devices.cloaked,
    );
    this.audio.setEngine(player.throttle, player.boosting);
    // dt-scaled for consistent shake intensity at every frame rate.
    if (player.boosting) this.chaseCam.addTrauma(0.55 * dt);
  }

  private emitEngineTrail(dt: number): void {
    const player = this.player;
    if (!player.alive || this.devices.cloaked || player.throttle <= 0.45) {
      return;
    }

    this.trailAccum += dt;
    const interval = player.boosting ? 0.008 : 0.016;
    const engineColor = new Color(STYLE_ENGINES[player.kind]);
    while (this.trailAccum >= interval) {
      this.trailAccum -= interval;
      for (const enginePoint of player.enginePoints) {
        trailPos.copy(enginePoint);
        player.object.localToWorld(trailPos);
        trailVel.copy(player.velocity).multiplyScalar(0.15);
        trailVel.x += (this.rng.next() - 0.5) * 3;
        trailVel.y += (this.rng.next() - 0.5) * 3;
        trailVel.z += (this.rng.next() - 0.5) * 3;
        this.particles.spawn({
          position: trailPos,
          velocity: trailVel,
          color: engineColor,
          size: player.boosting ? 1.5 : 1,
          life: player.boosting ? 0.5 : 0.3,
          drag: 0.5,
        });
      }
    }
  }

  private updateWorldActors(dt: number): void {
    const player = this.player;
    const playerVisible = player.alive && !this.devices.cloaked;
    for (const enemy of this.enemies) {
      const seesPlayer =
        playerVisible &&
        this.combat.hasLineOfSight(enemy.position, player.position);
      enemy.update(
        dt,
        player.position,
        player.velocity,
        (source) => this.combat.enemyFire(source),
        seesPlayer,
      );
      if (this.surface) this.combat.resolveEnemySurfaceCollision(enemy);
    }
    for (const turret of this.turrets) {
      turretLosOrigin.copy(turret.position);
      if (turret.mountNormal) turretLosOrigin.addScaledVector(turret.mountNormal, 3);
      const seesPlayer =
        playerVisible &&
        this.combat.hasLineOfSight(turretLosOrigin, player.position);
      turret.update(
        dt,
        player.position,
        player.alive,
        (source) => this.combat.turretFire(source),
        seesPlayer,
      );
    }
    for (const neutral of this.neutrals) neutral.update(dt);
    this.capital?.update(dt, this.capitalBeamContext);
  }

  private updateMissileWarning(): void {
    const threat = this.projectiles.incomingThreat(this.player);
    const next = threat.imminent ? 'imminent' : threat.locked ? 'locked' : 'none';
    if (next === this.missileWarning) return;
    this.missileWarning = next;
    if (next !== 'none') this.audio.missileWarning(next === 'imminent');
  }

  private updatePlayerDeath(dt: number): boolean {
    const player = this.player;
    if (!player.alive && this.deathTimer < 0) {
      this.deathTimer = 2.4;
      this.explosions.spawn(player.position, 2.2, 'ship');
      this.shipDebris.spawn(player.object, player.velocity, player.radius, this.rng);
      this.audio.explosion(true);
      this.chaseCam.addTrauma(1);
      player.object.visible = false;
      this.audio.setEngine(0, false);
      this.events.emit('player-died', undefined);
    }
    if (this.deathTimer <= 0) return false;

    this.deathTimer -= dt;
    if (this.deathTimer > 0) return false;
    this.gameOver();
    return true;
  }

  private updateCameraPresentation(dt: number): void {
    const player = this.player;
    if (!player.alive) return;

    const blend = this.chaseCam.blend;
    player.exterior.visible = blend < 0.85;
    player.cockpit.visible = blend > 0.5;
    this.playerShield.mesh.visible = blend < 0.85;
    if (blend <= 0.2) return;

    const target = this.targeting.current;
    player.displays.update(dt, {
      weaponName: this.weapons.weapon.name,
      energyFrac: this.weapons.energy / this.weapons.energyMax,
      seekersReadyFrac: 1 - this.weapons.missileCooldown / 1.35,
      targetName: target ? targetPresentation(target.ship, target.aimAssist).name : null,
      targetDistance: target?.distance ?? 0,
      shield: player.shield,
      shieldMax: player.shieldMax,
      hull: player.hull,
      hullMax: player.hullMax,
      speed: player.velocity.length(),
      boostFrac: player.boostEnergy / player.stats.boostEnergyMax,
      alert: this.encounters?.alert ?? 0,
      sector: this.sectorIndex,
      scrap: this.inventory.counts.scrap,
      crystal: this.inventory.counts.crystal,
      flux: this.inventory.counts.flux,
    });
  }

  /** Ship-vs-asteroid and ship-vs-ship ramming. */
  resolveShipCollisions(dt: number): void {
    this.combat.resolveShipCollisions(dt);
  }

  private updateHud(dt = 1 / 60): void {
    this.hudPresenter.update(dt);
  }

  /** Test-harness hook: refresh the HUD once outside the playing state. */
  renderHudOnce(): void {
    this.updateHud();
  }

  /** Test-harness hook: kill lingering warp streaks after a staged jump. */
  settleWarpFx(): void {
    this.warp.progress = 0;
    this.warp.update(0);
  }

  /** Resize promptly, then rebuild post FX after fullscreen settles. */
  private scheduleResize(): void {
    if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
    if (this.resizeSettleTimer) {
      window.clearTimeout(this.resizeSettleTimer);
    }
    this.resizeRaf = requestAnimationFrame(() => {
      this.resizeRaf = requestAnimationFrame(() => {
        this.resizeRaf = 0;
        this.onResize();
        this.resizeSettleTimer = window.setTimeout(() => {
          this.resizeSettleTimer = 0;
          this.onResize(true);
        }, 140);
      });
    });
  }

  private onResize(rebuildPostFx = false): void {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    const width = Math.max(
      1,
      Math.round(bounds.width || document.documentElement.clientWidth),
    );
    const height = Math.max(
      1,
      Math.round(bounds.height || document.documentElement.clientHeight),
    );
    this.renderResolution.resize(width, height, window.devicePixelRatio);
    const pixelRatio = this.renderResolution.pixelRatio;
    const layoutChanged =
      width !== this.viewportWidth || height !== this.viewportHeight;
    const ratioChanged = pixelRatio !== this.viewportPixelRatio;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.viewportPixelRatio = pixelRatio;

    if (ratioChanged) this.renderer.setPixelRatio(pixelRatio);
    if (layoutChanged) this.renderer.setSize(width, height, false);
    this.chaseCam.setAspect(width / height);
    if (rebuildPostFx) {
      this.postFx.composer.dispose();
      this.postFx = new PostFx(
        this.renderer,
        this.scene,
        this.chaseCam.camera,
      );
    }
    this.postFx.setSize(width, height);
    this.hangarVisor.resize(
      width,
      height,
      pixelRatio,
      layoutChanged,
      ratioChanged,
    );
    if (this.state === 'hangar' && this.hangarVisor.active) {
      if (layoutChanged) this.hangarVisor.mount();
      this.updateMenuIdle(0, performance.now() * 0.001);
      this.hangarVisor.scheduleRender();
    }
    this.renderer.resetState();
    this.postFx.render(0);
  }

  private applyRenderResolution(): void {
    const pixelRatio = this.renderResolution.pixelRatio;
    if (
      Math.abs(pixelRatio - this.viewportPixelRatio) <= 1e-4 ||
      this.viewportWidth < 1 ||
      this.viewportHeight < 1
    ) return;
    this.viewportPixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.postFx.setSize(this.viewportWidth, this.viewportHeight);
    this.hangarVisor.resize(
      this.viewportWidth, this.viewportHeight, pixelRatio, false, true,
    );
  }
}
