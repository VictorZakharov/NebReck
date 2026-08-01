import { Color } from 'three';
import { PlayerShip } from '../entities/PlayerShip';
import { ShieldFx } from '../fx/ShieldFx';
import { GameOverScreen } from '../ui/GameOverScreen';
import { HangarScreen } from '../ui/HangarScreen';
import { LegacyScreen } from '../ui/LegacyScreen';
import { LoadoutScreen } from '../ui/LoadoutScreen';
import { MainMenu } from '../ui/MainMenu';
import { PauseMenu } from '../ui/PauseMenu';
import { HangarBay } from '../world/HangarBay';
import { DeviceSystem } from './Devices';
import { getDifficulty } from './Difficulty';
import { EncounterDirector } from './EncounterDirector';
import { GameFoundation } from './GameFoundation';
import { saveHangarDifficulty, saveHangarShip } from './HangarPreferences';
import { Inventory, RECIPES } from './Inventory';
import { QuestSystem } from './Quests';
import { getShipDef } from './Ships';
import { SYSTEM_LOCKOUT_RANGE_METERS } from './GameConstants';

/**
 * Screen transitions and sortie lifecycle.
 *
 * Flight behavior and world interactions live in later controller layers;
 * this layer owns only menus, overlays, crafting, and mission setup/teardown.
 */
export abstract class GameScreens extends GameFoundation {
  /** Swap the piloted hull (menu preview + mission start). */
  protected override createPlayer(shipId: string): void {
    if (this.player) {
      this.cloakVisual.set(this.player, false);
      this.scene.remove(this.player.object);
      this.player.dispose();
    }
    this.player = new PlayerShip(getShipDef(shipId), {
      hull: this.meta.hullMult(),
      boost: this.meta.boostMult(),
    });
    this.scene.add(this.player.object);
    this.playerShield = new ShieldFx(
      this.player.radius,
      new Color(0.3, 0.85, 1.0),
    );
    this.player.object.add(this.playerShield.mesh);
  }

  /** Park the current ship as the menu/hangar backdrop model. */
  private parkShowcaseShip(): void {
    this.player.object.position.set(0, 0, 0);
    this.player.object.rotation.set(0, 0.6, 0);
    this.player.object.visible = true;
    this.player.exterior.visible = true;
    this.player.cockpit.visible = false;
    this.player.throttle = 0.45;
  }

  showMenu(): void {
    if (!this.headless) this.input.leaveFlightMode();
    this.state = 'menu';
    this.hangarVisor.unmount();
    if (this.hangarBay) this.scene.remove(this.hangarBay.group);
    for (const object of this.sector.backdropFx) object.visible = true;
    this.discardSurface();
    this.clearMission();
    this.hud.setVisible(false);
    this.closeOverlays();
    this.menu = new MainMenu(this.uiRoot, {
      onLaunch: () => this.showHangar(),
      onLegacy: () => this.showLegacy(),
      onHover: () => this.audio.uiHover(),
      onClick: () => {
        this.audio.init();
        this.audio.startMusic();
        this.audio.uiClick();
      },
    });
    this.parkShowcaseShip();
  }

  showLegacy(): void {
    this.closeOverlays();
    this.legacy = new LegacyScreen(this.uiRoot, this.meta, {
      onClose: () => this.showMenu(),
      onHover: () => this.audio.uiHover(),
      onClick: () => this.audio.uiClick(),
    });
  }

  showHangar(): void {
    this.state = 'hangar';
    this.closeOverlays();
    if (!this.hangarBay) this.hangarBay = new HangarBay();
    this.scene.add(this.hangarBay.group);
    // Hide space-side backdrop props that would intersect the hangar shell.
    for (const object of this.sector.backdropFx) object.visible = false;
    this.hangar = new HangarScreen(
      this.uiRoot,
      this.selectedShipId,
      this.selectedDifficultyId,
      {
        onRendered: () => this.hangarVisor.mount(),
        onShipSelected: (id) => {
          this.selectedShipId = id;
          saveHangarShip(id);
          this.createPlayer(id);
          this.parkShowcaseShip();
        },
        onDifficultySelected: (id) => {
          this.selectedDifficultyId = id;
          saveHangarDifficulty(id);
        },
        onEngage: (shipId, difficultyId) => {
          this.selectedShipId = shipId;
          this.selectedDifficultyId = difficultyId;
          this.startMission();
        },
        onBack: () => this.showMenu(),
        onHover: () => this.audio.uiHover(),
        onClick: () => this.audio.uiClick(),
      },
    );
    this.parkShowcaseShip();
  }

  private discardSurface(): void {
    this.worldFlow.discardSurface();
  }

  startMission(): void {
    // Called directly from Engage/Retry user activation, before synchronous
    // world setup consumes the opportunity to enter keyboard-lock fullscreen.
    if (!this.headless) this.input.enterFlightMode();
    this.hangarVisor.unmount();
    if (this.hangarBay) this.scene.remove(this.hangarBay.group);
    for (const object of this.sector.backdropFx) object.visible = true;
    this.discardSurface();
    this.clearMission();
    this.closeOverlays();

    // A new sortie receives a newly themed first sector. The seed stream keeps
    // explicit ?seed= test launches deterministic.
    this.rebuildSector();
    const shipDef = getShipDef(this.selectedShipId);
    this.weapons.setLoadout(
      shipDef.weapons,
      shipDef.missileRate,
      shipDef.stats.energyMax,
    );
    this.state = 'playing';
    this.score = 0;
    this.deathTimer = -1;
    this.sectorIndex = 1;
    this.missionTime = 0;
    this.worldFlow.resetTravelState();
    this.storyFired.clear();
    this.difficulty = getDifficulty(this.selectedDifficultyId);
    this.inventory = new Inventory();
    this.inventory.missiles = shipDef.startingMissiles;
    this.devices = new DeviceSystem();
    this.quests = new QuestSystem(this.rng.fork());
    this.pendingOffer = null;
    for (const beacon of this.questBeacons.values()) this.scene.remove(beacon);
    this.questBeacons.clear();
    this.inventory.add('flux', 2);
    if (this.meta.startingScrap() > 0) {
      this.inventory.add('scrap', this.meta.startingScrap());
    }

    // Fresh hull with fresh stats; crafting upgrades do not cross sorties.
    this.createPlayer(this.selectedShipId);
    const player = this.player;
    player.object.visible = true;
    this.weapons.energy = this.weapons.energyMax;
    this.weapons.weaponIndex = 0;
    this.weapons.damageMult = this.meta.damageMult();

    this.encounters = new EncounterDirector(
      this.events,
      this.rng.fork(),
      this.difficulty,
      (spec) => this.spawnEnemy(spec),
      () => this.enemies.reduce(
        (count, enemy) => count + Number(enemy.hunter && enemy.alive),
        0,
      ),
    );

    this.deploySectorEntities();
    this.placePlayerSafely();
    this.storyComms('mission-start');

    this.hud.setVisible(true);
    this.chaseCam.mode = 'third';
    this.chaseCam.snapTo(player.object);
    // Warm the shader cache so the first close-range fight does not hitch.
    this.renderer.compile(this.scene, this.chaseCam.camera);
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.exitPointerLock();
    this.pauseMenu = new PauseMenu(this.uiRoot, {
      onResume: () => this.resume(),
      onRestart: () => this.startMission(),
      onQuitToMenu: () => this.showMenu(),
      onHover: () => this.audio.uiHover(),
      onClick: () => this.audio.uiClick(),
    });
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.closeOverlays();
    this.state = 'playing';
    if (!this.headless) this.input.enterFlightMode();
  }

  openLoadout(): void {
    if (this.state !== 'playing') return;
    this.state = 'loadout';
    this.hud.setVisible(false);
    this.input.exitPointerLock();
    this.loadout = new LoadoutScreen(
      this.uiRoot,
      this.player.def.name,
      this.inventory,
      this.quests.active.map((quest) => ({
        title: quest.title,
        progress: quest.progress,
      })),
      {
        onCraft: (id) => this.craft(id),
        isUseful: (id) => {
          if (id === 'missile-rack') {
            return this.weapons.missileRate > 0;
          }
          if (id === 'shield-cell') {
            return this.player.shield < this.player.shieldMax;
          }
          return true;
        },
        canCraftSafely: () => !this.hasNearbyHostile(SYSTEM_LOCKOUT_RANGE_METERS),
        onClose: () => this.closeLoadout(),
        onHover: () => this.audio.uiHover(),
        onClick: () => this.audio.pickup(),
      },
    );
  }

  closeLoadout(): void {
    if (this.state !== 'loadout') return;
    this.closeOverlays();
    this.hud.setVisible(true);
    this.state = 'playing';
    this.autoPauseGraceUntil = performance.now() + 1500;
    if (!this.headless) this.input.enterFlightMode();
  }

  /** Validate and apply a crafting recipe. */
  craft(recipeId: string): boolean {
    if (this.hasNearbyHostile(SYSTEM_LOCKOUT_RANGE_METERS)) return false;
    const recipe = RECIPES.find((candidate) => candidate.id === recipeId);
    if (!recipe || !this.inventory.canCraft(recipe)) return false;
    if (recipeId === 'missile-rack' && this.weapons.missileRate <= 0) return false;
    const player = this.player;
    if (recipeId === 'patch-hull' && player.hull >= player.hullMax) return false;
    if (recipeId === 'shield-cell' && player.shield >= player.shieldMax) return false;

    this.inventory.pay(recipe);
    switch (recipeId) {
      case 'nanobot-kit':
        this.inventory.nanobots++;
        break;
      case 'missile-rack':
        this.inventory.missiles += 2;
        break;
      case 'shield-cell':
        player.shield = Math.min(player.shieldMax, player.shield + 40);
        break;
      case 'weapon-amp':
        this.weapons.damageMult += 0.15;
        break;
      case 'engine-tune':
        player.speedMult += 0.08;
        break;
      case 'shield-matrix':
        player.shieldMax += 25;
        player.shield += 25;
        break;
    }
    return true;
  }

  protected gameOver(): void {
    this.state = 'gameover';
    if (!this.headless) this.input.leaveFlightMode(false);
    else this.input.exitPointerLock();
    this.hud.setVisible(false);
    const minutes = Math.floor(this.missionTime / 60);
    const seconds = Math.floor(this.missionTime % 60);
    const creditsEarned = this.meta.bankScore(this.score);
    this.gameOverScreen = new GameOverScreen(
      this.uiRoot,
      this.score,
      `${minutes}:${String(seconds).padStart(2, '0')}`,
      this.sectorIndex,
      creditsEarned,
      this.meta.credits,
      this.rng.int(0, 2),
      {
        onRetry: () => this.startMission(),
        onMenu: () => this.showMenu(),
        onHover: () => this.audio.uiHover(),
        onClick: () => this.audio.uiClick(),
      },
    );
  }

  protected closeOverlays(): void {
    this.menu?.destroy();
    this.menu = null;
    this.hangar?.destroy();
    this.hangar = null;
    this.pauseMenu?.destroy();
    this.pauseMenu = null;
    this.loadout?.destroy();
    this.loadout = null;
    this.tradeScreen?.destroy();
    this.tradeScreen = null;
    this.legacy?.destroy();
    this.legacy = null;
    this.gameOverScreen?.destroy();
    this.gameOverScreen = null;
  }

  private clearMission(): void {
    this.clearEntities();
    this.encounters = null;
  }

  protected override clearEntities(): void {
    for (const enemy of this.enemies) {
      this.scene.remove(enemy.object);
      enemy.dispose();
    }
    this.enemies = [];
    for (const turret of this.turrets) {
      this.scene.remove(turret.object);
      turret.dispose();
    }
    this.turrets = [];
    this.capitalTurrets = [];
    for (const neutral of this.neutrals) {
      this.scene.remove(neutral.object);
      neutral.dispose();
    }
    this.neutrals = [];
    if (this.capital) {
      this.scene.remove(this.capital.object);
      this.capital.dispose();
      this.capital = null;
    }
    this.projectiles.clear();
    this.pickups.clear();
  }
}
