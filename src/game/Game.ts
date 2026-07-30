import {
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  PointLight,
  Scene,
  Vector3,
} from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { ProjectileSystem, ProjectileHit } from '../combat/ProjectileSystem';
import { Targeting } from '../combat/Targeting';
import { WeaponSystem } from '../combat/WeaponSystem';
import { ENEMY_BOLT_COLOR } from '../combat/WeaponDefs';
import { EventBus } from '../core/EventBus';
import { GameLoop } from '../core/GameLoop';
import { Input } from '../core/Input';
import { Rng } from '../core/Rng';
import { CapitalShip } from '../entities/CapitalShip';
import { EnemyShip } from '../entities/EnemyShip';
import { NeutralShip } from '../entities/NeutralShip';
import { PickupSnapshot, PickupSystem, ResourceType } from '../entities/PickupSystem';
import { PlayerShip } from '../entities/PlayerShip';
import { Ship } from '../entities/Ship';
import { STYLE_ENGINES } from '../entities/ShipMesh';
import { Turret, TURRET_STATS } from '../entities/Turret';
import { ExplosionSystem } from '../fx/ExplosionSystem';
import { ParticleSystem } from '../fx/ParticleSystem';
import { ShieldFx } from '../fx/ShieldFx';
import { ChaseCamera } from '../rendering/ChaseCamera';
import { createRenderer } from '../rendering/createRenderer';
import { PostFx } from '../rendering/PostFx';
import { GameOverScreen } from '../ui/GameOverScreen';
import { HangarScreen } from '../ui/HangarScreen';
import { HangarVisor } from '../ui/HangarVisor';
import { Hud, HudFrameState } from '../ui/Hud';
import { LoadoutScreen } from '../ui/LoadoutScreen';
import { MainMenu } from '../ui/MainMenu';
import { PauseMenu } from '../ui/PauseMenu';
import { Radar3D } from '../ui/Radar3D';
import { TargetPreview } from '../ui/TargetPreview';
import { AsteroidDebris } from '../world/AsteroidDebris';
import { AsteroidBody } from '../world/AsteroidField';
import { PlanetSurface } from '../world/PlanetSurface';
import { HangarBay } from '../world/HangarBay';
import { Sector } from '../world/Sector';
import { PulseRing } from '../fx/PulseRing';
import { WarpTunnel } from '../fx/WarpTunnel';
import { Voice } from '../audio/Voice';
import { LegacyScreen } from '../ui/LegacyScreen';
import { TradeScreen } from '../ui/TradeScreen';
import { DeviceSystem, EMP_RADIUS, EMP_STUN, NANO_HEAL } from './Devices';
import { CloakVisual } from './CloakVisual';
import { DifficultyDef, getDifficulty } from './Difficulty';
import { EncounterDirector, HunterSpawnSpec } from './EncounterDirector';
import {
  loadGamePreferences,
  saveDifficultyPreference,
  saveShipPreference,
} from './GamePreferences';
import { findAimedLoot, nearestNeutral } from './InteractionTargeting';
import { HudProjector } from './HudProjection';
import { Inventory, RECIPES } from './Inventory';
import { MetaProgress } from './MetaProgress';
import { Quest, QuestSystem } from './Quests';
import { getShipDef } from './Ships';
import { applyTrade, canTrade } from './Trade';
import { EXPLORE_COMMS } from './Story';
import { pointInsideBody, rayHitsBodyBox } from './WorldCollision';

export type GameState =
  | 'menu'
  | 'hangar'
  | 'playing'
  | 'paused'
  | 'loadout'
  | 'trade'
  | 'gameover'
  | 'test';

const pushDir = new Vector3();
const boxClosest = new Vector3();
const menuLook = new Vector3();
const trailPos = new Vector3();
const trailVel = new Vector3();
const childOffset = new Vector3();
const jumpFwd = new Vector3();
const jumpProbe = new Vector3();
const losDir = new Vector3();
const losOff = new Vector3();
const aimForward = new Vector3();
const aimBlockOff = new Vector3();
const enemyRel = new Vector3();

export interface GameOptions {
  seed: number;
  /** Test harness mode: no pointer lock, no audio, no rAF loop. */
  headless: boolean;
  /** Restore preferences and retain the Engage fallback; clicks always save. */
  persistPreferences?: boolean;
}

interface PlanetVisitState {
  surface: PlanetSurface;
  enemies: EnemyShip[];
  turrets: Turret[];
  pickups: PickupSnapshot[];
}

const TARGET_NAMES: Record<string, string> = {
  raider: 'Vigil Raider',
  brute: 'Vigil Warden',
  turret: 'Vigil Battery',
  capital: 'Warden-class Carrier',
};

const CLOAK_MIN_RANGE = 180; // can't engage cloak with a hostile this close

const JUMP_FLUX_COST = 2;
const JUMP_SPOOL_TIME = 5;
const JUMP_SUPPRESS_RANGE = 600;
/** Free GPU resources of a discarded world subtree. */
function disposeGroup(root: import('three').Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as import('three').Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as { material?: import('three').Material | import('three').Material[] }).material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}

/**
 * Top-level orchestration: owns every subsystem, runs the state machine, and
 * routes gameplay events into FX / audio / UI. Systems stay decoupled — this
 * class is the only place that knows about all of them.
 */
export class Game {
  state: GameState = 'menu';
  score = 0;
  selectedShipId = 'kestrel';
  selectedDifficultyId = 'veteran';
  difficulty: DifficultyDef = getDifficulty('veteran');
  inventory = new Inventory();

  readonly scene = new Scene();
  readonly rng: Rng;
  readonly events = new EventBus();
  readonly loop: GameLoop;
  readonly input: Input;
  readonly audio = new AudioEngine();
  readonly chaseCam: ChaseCamera;
  postFx: PostFx;
  sector: Sector;
  private readonly sectorRng: Rng;
  readonly particles: ParticleSystem;
  readonly explosions: ExplosionSystem;
  readonly projectiles: ProjectileSystem;
  readonly pickups: PickupSystem;
  debris!: AsteroidDebris;
  readonly targeting = new Targeting();
  readonly weapons: WeaponSystem;
  readonly hud: Hud;
  private readonly targetPreview: TargetPreview;
  private readonly hudProjector = new HudProjector();
  private hangarBay: HangarBay | null = null;
  private readonly hangarVisor: HangarVisor;
  readonly radar: Radar3D;
  player!: PlayerShip;
  playerShield!: ShieldFx;
  enemies: EnemyShip[] = [];
  turrets: Turret[] = [];
  private capitalTurrets: Turret[] = [];
  neutrals: NeutralShip[] = [];
  capital: CapitalShip | null = null;
  encounters: EncounterDirector | null = null;
  /** 1-based sector number; each jump increments and rebuilds the world. */
  sectorIndex = 1;
  missionTime = 0;
  /** Seconds left on the jump-drive spool; negative = not spooling. */
  jumpSpool = -1;
  devices = new DeviceSystem();
  quests!: QuestSystem;
  /** Contract shown for review after a hail — R accepts, X declines. */
  pendingOffer: Quest | null = null;
  readonly voice = new Voice();
  private readonly warp = new WarpTunnel();
  /** True when a test forced the jump (skips the hold-J requirement). */
  private jumpAuto = false;
  private tradeScreen: TradeScreen | null = null;
  /** Non-null while landed on a planet (the "dungeon"). */
  surface: PlanetSurface | null = null;
  private aimedPlanet: number | null = null;
  /** The detached space world while we're on a planet — restored on lift-off. */
  private spaceStash: {
    enemies: EnemyShip[];
    turrets: Turret[];
    capitalTurrets: Turret[];
    neutrals: NeutralShip[];
    capital: CapitalShip | null;
    planetIndex: number;
    pickups: PickupSnapshot[];
  } | null = null;
  /** Detached, already-visited surfaces keyed by planet index in this sector. */
  private readonly planetStates = new Map<number, PlanetVisitState>();

  /** The active collidable world: planet surface when landed, else the field. */
  private get world(): {
    bodies: AsteroidBody[];
    destroyRock(b: AsteroidBody): void;
    depleteOre(b: AsteroidBody): void;
    spawnChild(p: Vector3, r: number, rng: Rng, palette?: number): AsteroidBody | null;
  } {
    return this.surface ?? this.sector.asteroids;
  }
  private readonly terrainProjectileHit = (
    from: Vector3,
    to: Vector3,
    out: Vector3,
  ): boolean => this.surface?.segmentTerrainHit(from, to, out) ?? false;
  private readonly questBeacons = new Map<number, import('three').Group>();
  readonly meta: MetaProgress;
  private readonly pulses = new PulseRing();
  private readonly cloakVisual = new CloakVisual();
  /** Loot under the boresight this frame ('stash' | 'vein' | null). */
  private lootAimed: 'stash' | 'vein' | null = null;
  /** Exact world-space vein point used to attach the contextual prompt. */
  private lootAimPoint: Vector3 | null = null;
  /** Owning vein body: all its crystals share one prompt + smoothing key. */
  private lootAimBody: AsteroidBody | null = null;
  /** Kept as a property for the smoke harness's render-resource assertion. */
  get cloakShellMat() {
    return this.cloakVisual.rimMaterial;
  }
  private legacy: LegacyScreen | null = null;
  private readonly storyFired = new Set<string>();
  /** Scratch: every hostile hull (enemies + turrets + capital), per frame. */
  private readonly hostiles: Ship[] = [];
  /** Auto-pause suppression window after closing an overlay (ms clock). */
  private autoPauseGraceUntil = 0;
  /** Scratch: everything player bolts can hit (hostiles + neutrals). */
  private readonly shootables: Ship[] = [];
  private trailAccum = 0;
  private resizeRaf = 0;
  private resizeSettleTimer = 0;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private viewportPixelRatio = 0;

  readonly renderer;
  private readonly uiRoot: HTMLElement;
  /** Public for the test harness (controls-screen staging). */
  menu: MainMenu | null = null;
  private hangar: HangarScreen | null = null;
  private pauseMenu: PauseMenu | null = null;
  private loadout: LoadoutScreen | null = null;
  private gameOverScreen: GameOverScreen | null = null;
  private deathTimer = -1;
  private readonly headless: boolean;
  private readonly persistPreferences: boolean;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, options: GameOptions) {
    this.headless = options.headless;
    this.persistPreferences = options.persistPreferences ?? !options.headless;
    this.uiRoot = uiRoot;
    this.meta = new MetaProgress(!options.headless);
    if (this.persistPreferences) {
      const preferences = loadGamePreferences({
        shipId: this.selectedShipId,
        difficultyId: this.selectedDifficultyId,
      });
      this.selectedShipId = preferences.shipId;
      this.selectedDifficultyId = preferences.difficultyId;
      this.difficulty = getDifficulty(preferences.difficultyId);
    }
    this.rng = new Rng(options.seed);
    this.renderer = createRenderer(canvas);
    this.chaseCam = new ChaseCamera(window.innerWidth / window.innerHeight);
    this.hangarVisor = new HangarVisor(
      canvas,
      uiRoot,
      this.chaseCam.camera,
      () => this.state === 'hangar',
    );

    this.sectorRng = this.rng.fork();
    this.sector = new Sector(this.scene, this.sectorRng.fork());
    this.postFx = new PostFx(this.renderer, this.scene, this.chaseCam.camera);

    this.particles = new ParticleSystem();
    this.scene.add(this.particles.points);
    this.explosions = new ExplosionSystem(this.particles, this.rng.fork());
    this.scene.add(this.explosions.group);
    this.projectiles = new ProjectileSystem(this.particles);
    this.scene.add(this.projectiles.group);
    this.pickups = new PickupSystem();
    this.scene.add(this.pickups.group);
    this.debris = new AsteroidDebris(this.rng.fork());
    this.scene.add(this.debris.group);
    this.scene.add(this.pulses.group);
    // The warp tunnel rides the camera (which must be in the scene graph
    // for its children to render).
    this.scene.add(this.chaseCam.camera);
    this.chaseCam.camera.add(this.warp.group);

    this.createPlayer(this.selectedShipId);

    this.weapons = new WeaponSystem(this.projectiles, this.particles, {
      onPrimaryShot: (w) => {
        this.breakCloakOnFire();
        if (w.id === 'pulse') this.audio.laser();
        else if (w.id === 'autogun') this.audio.laser(0.35);
        else if (w.id === 'scatter') this.audio.scatter();
        else this.audio.lance();
        this.chaseCam.addTrauma(w.id === 'autogun' ? 0.025 : 0.06);
      },
      onMissileShot: () => {
        this.breakCloakOnFire();
        this.audio.missileLaunch();
      },
      onWeaponSwitched: (w) => {
        this.audio.uiClick();
        this.events.emit('weapon-switched', { name: w.name });
      },
    });

    this.voice.muted = options.headless;
    this.hud = new Hud(uiRoot);
    this.radar = new Radar3D();
    this.hud.attachRadar(this.radar.canvas);
    this.targetPreview = new TargetPreview();
    this.hud.attachTargetPreview(this.targetPreview.canvas);
    this.input = new Input(canvas);
    this.loop = new GameLoop((dt, elapsed) => this.tick(dt, elapsed));

    this.wireEvents();
    window.addEventListener('resize', () => this.scheduleResize());
    document.addEventListener('fullscreenchange', () => this.scheduleResize());
    document.addEventListener('pointerlockchange', () => {
      // Browser Esc kicks us out of pointer lock → auto-pause. Suppressed for
      // a beat after closing an overlay (trade/loadout): the lock re-acquire
      // races this event and the player would land in the pause menu.
      if (performance.now() < this.autoPauseGraceUntil) return;
      if (!this.headless && this.state === 'playing' && !this.input.isPointerLocked) {
        this.pause();
      }
    });
  }

  /** Swap the piloted hull (menu preview + mission start). */
  private createPlayer(shipId: string): void {
    if (this.player) {
      this.cloakVisual.set(this.player, false);
      this.scene.remove(this.player.object);
    }
    this.player = new PlayerShip(getShipDef(shipId), {
      hull: this.meta.hullMult(),
      boost: this.meta.boostMult(),
    });
    this.scene.add(this.player.object);
    this.playerShield = new ShieldFx(this.player.radius, new Color(0.3, 0.85, 1.0));
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

  // ---- state transitions ----------------------------------------------------

  showMenu(): void {
    this.state = 'menu';
    this.hangarVisor.unmount();
    if (this.hangarBay) this.scene.remove(this.hangarBay.group);
    for (const o of this.sector.backdropFx) o.visible = true;
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
    // Rocks loom through the bay aperture; planet RING discs and fog-bank
    // sprites slice visible bands through the walls; dust floats indoors —
    // the whole backdrop set hides while the interior is up (nebula/stars
    // remain through the aperture).
    for (const o of this.sector.backdropFx) o.visible = false;
    this.hangar = new HangarScreen(this.uiRoot, this.selectedShipId, this.selectedDifficultyId, {
      onRendered: () => this.hangarVisor.mount(),
      onShipSelected: (id) => {
        this.selectedShipId = id;
        // A hangar choice is the preference commit point. Do not defer this
        // to ENGAGE (or gate it on the route's gameplay/headless mode): the
        // player may reload or close the tab directly from the hangar.
        saveShipPreference(id);
        this.createPlayer(id);
        this.parkShowcaseShip();
      },
      onDifficultySelected: (id) => {
        this.selectedDifficultyId = id;
        saveDifficultyPreference(id);
      },
      onEngage: (shipId, difficultyId) => {
        this.selectedShipId = shipId;
        this.selectedDifficultyId = difficultyId;
        if (this.persistPreferences) {
          saveShipPreference(shipId);
          saveDifficultyPreference(difficultyId);
        }
        this.startMission();
      },
      onBack: () => this.showMenu(),
      onHover: () => this.audio.uiHover(),
      onClick: () => this.audio.uiClick(),
    });
    this.parkShowcaseShip();
  }

  private disposeStoredPlanets(): void {
    for (const state of this.planetStates.values()) {
      this.scene.remove(state.surface.group);
      disposeGroup(state.surface.group);
    }
    this.planetStates.clear();
  }

  /** Died/quit while landed: drop every surface retained by this sortie. */
  private discardSurface(): void {
    const activeSurface = this.surface;
    if (!activeSurface) {
      this.disposeStoredPlanets();
      return;
    }
    this.scene.remove(activeSurface.group);
    disposeGroup(activeSurface.group);
    this.disposeStoredPlanets();
    this.surface = null;
    this.scene.fog = null;
    this.scene.add(this.sector.group);
    this.spaceStash = null;
    this.postFx.composer.dispose();
    this.postFx = new PostFx(this.renderer, this.scene, this.chaseCam.camera);
    this.postFx.setSize(window.innerWidth, window.innerHeight);
  }

  startMission(): void {
    this.hangarVisor.unmount();
    if (this.hangarBay) this.scene.remove(this.hangarBay.group);
    for (const o of this.sector.backdropFx) o.visible = true;
    this.discardSurface();
    this.clearMission();
    this.closeOverlays();
    // A new sortie gets a newly themed first sector. The seed stream still
    // keeps explicit ?seed= test launches perfectly reproducible.
    this.rebuildSector();
    const shipDef = getShipDef(this.selectedShipId);
    this.weapons.setLoadout(shipDef.weapons, shipDef.missileRate, shipDef.stats.energyMax);
    this.state = 'playing';
    this.score = 0;
    this.deathTimer = -1;
    this.sectorIndex = 1;
    this.missionTime = 0;
    this.jumpSpool = -1;
    this.storyFired.clear();
    this.difficulty = getDifficulty(this.selectedDifficultyId);
    this.inventory = new Inventory();
    this.devices = new DeviceSystem();
    this.quests = new QuestSystem(this.rng.fork());
    this.pendingOffer = null;
    for (const b of this.questBeacons.values()) this.scene.remove(b);
    this.questBeacons.clear();
    this.inventory.add('flux', 2); // full jump fuel — leave sector 1 whenever you like
    if (this.meta.startingScrap() > 0) this.inventory.add('scrap', this.meta.startingScrap());

    // Fresh hull with fresh stats (upgrades don't carry across missions).
    this.createPlayer(this.selectedShipId);
    const p = this.player;
    p.object.visible = true;

    this.weapons.energy = this.weapons.energyMax;
    this.weapons.weaponIndex = 0;
    this.weapons.damageMult = this.meta.damageMult();

    this.encounters = new EncounterDirector(this.events, this.rng.fork(), this.difficulty, (spec) =>
      this.spawnEnemy(spec),
    );

    this.deploySectorEntities();
    this.placePlayerSafely();
    this.storyComms('mission-start');

    this.hud.setVisible(true);
    this.chaseCam.mode = 'third';
    this.chaseCam.snapTo(p.object);
    // Warm the shader cache so the first close-range fight doesn't hitch.
    this.renderer.compile(this.scene, this.chaseCam.camera);
    if (!this.headless) this.input.requestPointerLock();
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
    if (!this.headless) this.input.requestPointerLock();
  }

  openLoadout(): void {
    if (this.state !== 'playing') return;
    this.state = 'loadout';
    this.hud.setVisible(false); // HUD corners fought the overlay panels
    this.input.exitPointerLock();
    this.loadout = new LoadoutScreen(
      this.uiRoot,
      this.player.def.name,
      this.inventory,
      this.quests.active.map((q) => ({ title: q.title, progress: q.progress })),
      {
      onCraft: (id) => this.craft(id),
      isUseful: (id) => {
        if (id === 'shield-cell') return this.player.shield < this.player.shieldMax;
        return true;
      },
      onClose: () => this.closeLoadout(),
      onHover: () => this.audio.uiHover(),
      onClick: () => this.audio.pickup(),
    });
  }

  closeLoadout(): void {
    if (this.state !== 'loadout') return;
    this.closeOverlays();
    this.hud.setVisible(true);
    this.state = 'playing';
    this.autoPauseGraceUntil = performance.now() + 1500;
    if (!this.headless) this.input.requestPointerLock();
  }

  /** Validate + apply a crafting recipe. Returns false if nothing happened. */
  craft(recipeId: string): boolean {
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (!recipe || !this.inventory.canCraft(recipe)) return false;
    const p = this.player;
    // Consumables that would be wasted are refused.
    if (recipeId === 'patch-hull' && p.hull >= p.hullMax) return false;
    if (recipeId === 'shield-cell' && p.shield >= p.shieldMax) return false;

    this.inventory.pay(recipe);
    switch (recipeId) {
      case 'nanobot-kit':
        this.inventory.nanobots++;
        break;
      case 'missile-rack':
        this.inventory.missiles += 2;
        break;
      case 'shield-cell':
        p.shield = Math.min(p.shieldMax, p.shield + 40);
        break;
      case 'weapon-amp':
        this.weapons.damageMult += 0.15;
        break;
      case 'engine-tune':
        p.speedMult += 0.08;
        break;
      case 'shield-matrix':
        p.shieldMax += 25;
        p.shield += 25;
        break;
    }
    return true;
  }

  private gameOver(): void {
    this.state = 'gameover';
    this.input.exitPointerLock();
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

  private closeOverlays(): void {
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

  private clearEntities(): void {
    for (const e of this.enemies) this.scene.remove(e.object);
    this.enemies = [];
    for (const t of this.turrets) this.scene.remove(t.object);
    this.turrets = [];
    for (const n of this.neutrals) this.scene.remove(n.object);
    this.neutrals = [];
    if (this.capital) {
      this.scene.remove(this.capital.object);
      this.capital = null;
    }
    this.projectiles.clear();
    this.pickups.clear();
  }

  // ---- sector travel --------------------------------------------------------

  /** The capital ship projects a jump-suppression field (kill it or leave). */
  get jumpSuppressed(): boolean {
    return (
      !!this.capital?.alive &&
      this.capital.position.distanceTo(this.player.position) < JUMP_SUPPRESS_RANGE
    );
  }

  /**
   * Begin a jump spool. HOLD J: release cancels, taking fire cancels. Where
   * you end up depends on where the nose points — a planet in the crosshair
   * means atmospheric entry (free), otherwise a sector jump (2 flux, clear
   * path required, capital field suppresses).
   */
  startJump(auto = false): boolean {
    if (this.state !== 'playing' || this.jumpSpool >= 0 || !this.player.alive) return false;

    if (this.surface) {
      this.player.forward(jumpFwd);
      if (jumpFwd.y < 0.5) {
        this.hud.showBanner('Point the nose skyward to lift off');
        this.audio.warning();
        return false;
      }
    } else {
      this.aimedPlanet = this.findAimedPlanet();
      if (this.aimedPlanet === null) {
        if (this.jumpSuppressed) {
          this.hud.showBanner('Jump suppressed — capital field');
          this.audio.warning();
          return false;
        }
        if (this.inventory.counts.flux < JUMP_FLUX_COST) {
          this.hud.showBanner(`Jump drive needs ${JUMP_FLUX_COST} flux cores`);
          this.audio.warning();
          return false;
        }
        if (this.jumpPathBlocked()) {
          this.hud.showBanner('Jump path obstructed — clear your nose');
          this.audio.warning();
          return false;
        }
      }
    }

    this.jumpAuto = auto;
    this.jumpSpool = JUMP_SPOOL_TIME;
    this.hud.showBanner(
      this.surface
        ? 'Lift-off burn — hold J'
        : this.aimedPlanet !== null
          ? 'Atmospheric entry — hold J'
          : 'Jump drive spooling — hold J',
    );
    this.audio.jumpSpool();
    return true;
  }

  cancelJump(message: string | null): void {
    if (this.jumpSpool < 0) return;
    this.jumpSpool = -1;
    this.jumpAuto = false;
    this.aimedPlanet = null;
    if (message) {
      this.hud.showBanner(message);
      this.audio.warning();
    }
  }

  /** Anything solid inside the forward corridor blocks the jump. */
  private jumpPathBlocked(): boolean {
    this.player.forward(jumpFwd);
    for (let d = 40; d <= 340; d += 30) {
      jumpProbe.copy(this.player.position).addScaledVector(jumpFwd, d);
      for (const b of this.world.bodies) {
        if (b.destroyed) continue;
        if (b.position.distanceToSquared(jumpProbe) < (b.radius + 25) ** 2) return true;
      }
      if (this.capital?.alive) {
        if (this.capital.position.distanceToSquared(jumpProbe) < (this.capital.radius + 30) ** 2) {
          return true;
        }
      }
    }
    return false;
  }

  /** Which planet (if any) sits in the crosshair cone. */
  private findAimedPlanet(): number | null {
    this.player.forward(jumpFwd);
    for (let i = 0; i < this.sector.planets.length; i++) {
      const p = this.sector.planets[i];
      jumpProbe.copy(p.position).sub(this.player.position);
      const dist = jumpProbe.length();
      jumpProbe.divideScalar(dist);
      const cone = Math.atan(p.radius / dist) + 0.04;
      if (jumpFwd.dot(jumpProbe) > Math.cos(cone)) return i;
    }
    return null;
  }

  private completeJump(): void {
    if (this.surface) {
      this.exitPlanet();
      return;
    }
    if (this.aimedPlanet !== null) {
      const index = this.aimedPlanet;
      this.aimedPlanet = null;
      this.enterPlanet(index);
      return;
    }
    if (this.inventory.counts.flux < JUMP_FLUX_COST) {
      this.cancelJump('Insufficient flux'); // spent mid-spool in Engineering?
      return;
    }
    this.inventory.counts.flux -= JUMP_FLUX_COST;
    this.sectorIndex++;
    this.encounters?.onSectorJump();
    // Courier contracts pay out on arrival; in-sector deliveries are void.
    const { completed, voided } = this.quests.onJump();
    for (const q of voided) {
      this.removeQuestBeacon(q.id);
      this.events.emit('comms', { speaker: 'HAULER', text: 'You jumped with our cargo?! Contract void.' });
    }
    this.pendingOffer = null; // the hauler making the offer is a sector behind us
    this.voice.cancel();
    this.clearEntities();
    this.rebuildSector();
    this.deploySectorEntities();
    this.placePlayerSafely();
    // Smooth landing: glide in with headway instead of appearing parked.
    this.player.forward(jumpFwd);
    this.player.velocity.copy(jumpFwd).multiplyScalar(55);
    this.chaseCam.snapTo(this.player.object);
    this.hud.flashJump();
    this.postFx.punchAberration(0.05);
    this.audio.jumpArrive();
    this.hud.showBanner(`Sector ${this.sectorIndex} — ${this.sector.themeName}`);
    for (const q of completed) this.completeQuest(q);
  }

  // ---- planetfall -----------------------------------------------------------

  /**
   * Dive onto a planet: DETACH the space world (nothing is destroyed — the
   * sector must be exactly as you left it when you lift off) and swap in the
   * surface dungeon.
   */
  enterPlanet(index: number): void {
    const info = this.sector.planets[index];
    if (!info || this.surface) return;
    this.voice.cancel();
    this.pendingOffer = null;

    // Stash the living space world: remove objects from the scene but keep
    // every entity, position, and destroyed-rock flag intact.
    for (const e of this.enemies) this.scene.remove(e.object);
    for (const t of this.turrets) this.scene.remove(t.object);
    for (const n of this.neutrals) this.scene.remove(n.object);
    if (this.capital) this.scene.remove(this.capital.object);
    for (const b of this.questBeacons.values()) this.scene.remove(b);
    const spacePickups = this.pickups.snapshot();
    this.spaceStash = {
      enemies: this.enemies,
      turrets: this.turrets,
      capitalTurrets: this.capitalTurrets,
      neutrals: this.neutrals,
      capital: this.capital,
      planetIndex: index,
      pickups: spacePickups,
    };
    this.enemies = [];
    this.turrets = [];
    this.capitalTurrets = [];
    this.neutrals = [];
    this.capital = null;
    this.projectiles.clear();
    this.pickups.clear();
    this.scene.remove(this.sector.group); // detached, NOT disposed

    const visited = this.planetStates.get(index) ?? null;
    this.planetStates.delete(index); // the state is live until the next lift-off
    this.surface = visited?.surface ?? new PlanetSurface(this.sectorRng.fork(), info);
    this.scene.add(this.surface.group);
    this.scene.fog = this.surface.fog;
    // No sun mesh down here → rebuild the post chain without god rays.
    this.postFx.composer.dispose();
    this.postFx = new PostFx(this.renderer, this.scene, this.chaseCam.camera);
    this.postFx.setSize(window.innerWidth, window.innerHeight);

    if (visited) {
      // Reattach the actual survivors. Hull, AI route progress, destroyed
      // rocks/stashes and loose salvage all remain exactly as they were.
      this.enemies = visited.enemies;
      this.turrets = visited.turrets;
      for (const enemy of this.enemies) this.scene.add(enemy.object);
      for (const turret of this.turrets) this.scene.add(turret.object);
      this.pickups.restore(visited.pickups);
    } else {
      // First visit: build the ground garrison, scaled to sector threat.
      for (const spawn of this.surface.turretSpawns) {
        const turret = new Turret(this.rng.fork());
        turret.object.position.copy(spawn.position);
        turret.faceToward(spawn.lookAt);
        this.scene.add(turret.object);
        this.turrets.push(turret);
      }
      for (const patrol of this.surface.patrols) {
        for (let i = 0; i < patrol.size; i++) {
          const enemy = new EnemyShip(
            'raider',
            this.rng.fork(),
            Math.min(0.5 * this.difficulty.aggression, 0.85),
            this.difficulty.enemyToughness * this.threatScale(),
            patrol.waypoints,
          );
          enemy.object.position.copy(patrol.waypoints[0]);
          enemy.position.x += i * 12;
          enemy.faceToward(patrol.waypoints[1]);
          this.scene.add(enemy.object);
          this.enemies.push(enemy);
        }
      }
    }

    // Surface spawn: far from the garrison AND behind terrain cover.
    const hostilePositions = [
      ...this.turrets.map((t) => t.position),
      ...this.enemies.map((e) => e.position),
    ];
    this.player.object.position.copy(this.surface.pickSpawn(this.rng, hostilePositions));
    // Level attitude: wings parallel to the ground, random heading only.
    this.player.object.rotation.set(0, this.rng.range(0, Math.PI * 2), 0);
    this.player.velocity.set(0, 0, 0);
    this.chaseCam.snapTo(this.player.object);
    this.hud.flashJump();
    this.audio.jumpArrive();
    this.hud.showBanner('Planetfall');
    this.storyComms('planetfall');
  }

  /** Lift off: restore the EXACT space world you left — same rocks, same
   *  ships, same everything. You reappear in orbit above the planet. */
  exitPlanet(): void {
    if (!this.surface || !this.spaceStash) return;
    const planetIndex = this.spaceStash.planetIndex;
    // Park the whole live surface rather than regenerating it. Filtered enemy
    // arrays contain survivors only, and body records retain every harvested
    // vein, cracked stash and destroyed obstacle.
    this.planetStates.set(planetIndex, {
      surface: this.surface,
      enemies: this.enemies,
      turrets: this.turrets,
      pickups: this.pickups.snapshot(),
    });
    for (const enemy of this.enemies) this.scene.remove(enemy.object);
    for (const turret of this.turrets) this.scene.remove(turret.object);
    this.enemies = [];
    this.turrets = [];
    this.capitalTurrets = [];
    this.projectiles.clear();
    this.pickups.clear();
    this.scene.remove(this.surface.group);
    this.surface = null;
    this.scene.fog = null;

    // Reattach the stashed sector and its population.
    this.scene.add(this.sector.group);
    this.enemies = this.spaceStash.enemies;
    this.turrets = this.spaceStash.turrets;
    this.capitalTurrets = this.spaceStash.capitalTurrets;
    this.neutrals = this.spaceStash.neutrals;
    this.capital = this.spaceStash.capital;
    const spacePickups = this.spaceStash.pickups;
    this.spaceStash = null;
    for (const e of this.enemies) this.scene.add(e.object);
    for (const t of this.turrets) this.scene.add(t.object);
    for (const n of this.neutrals) this.scene.add(n.object);
    if (this.capital) this.scene.add(this.capital.object);
    for (const b of this.questBeacons.values()) this.scene.add(b);
    this.pickups.restore(spacePickups);

    // Post chain gets its god rays back (the sector sun still exists).
    this.postFx.composer.dispose();
    this.postFx = new PostFx(this.renderer, this.scene, this.chaseCam.camera);
    this.postFx.setSize(window.innerWidth, window.innerHeight);

    // Reappear in orbit above the planet, nose toward the sector heart.
    const planet = this.sector.planets[planetIndex];
    jumpProbe.copy(planet.position).normalize();
    this.player.object.position
      .copy(planet.position)
      .addScaledVector(jumpProbe, -(planet.radius + 220));
    this.player.faceToward(new Vector3(0, 0, 0));
    this.player.velocity.set(0, 0, 0);
    this.chaseCam.snapTo(this.player.object);
    this.hud.flashJump();
    this.audio.jumpArrive();
    this.hud.showBanner(`Orbit — Sector ${this.sectorIndex}`);
  }

  /** Tear down the old world and generate the next one from the seed stream. */
  private rebuildSector(): void {
    // Cached planet dungeons belong to the departing sector only.
    this.disposeStoredPlanets();
    this.scene.remove(this.sector.group);
    disposeGroup(this.sector.group);
    this.scene.fog = null;
    this.sector = new Sector(this.scene, this.sectorRng.fork());
    this.postFx.composer.dispose();
    this.postFx = new PostFx(this.renderer, this.scene, this.chaseCam.camera);
    this.postFx.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Cave turrets + the sector plan's population, fresh per sector.
   * SECTOR 1 IS PEACEFUL: no Vigil at all — a safe space to learn the ship,
   * mine, meet the haulers, and spool the first jump. War starts one jump in.
   */
  private deploySectorEntities(): void {
    const hostileSector = this.sectorIndex > 1;
    if (hostileSector) {
      for (const spawn of this.sector.turretSpawns) {
        const turret = new Turret(this.rng.fork());
        turret.object.position.copy(spawn.position);
        turret.faceToward(spawn.lookAt);
        this.scene.add(turret.object);
        this.turrets.push(turret);
      }
    }
    this.populateLevel(hostileSector);
  }

  /** Threat multiplier: each sector deeper into the Drift is meaner. */
  private threatScale(): number {
    return 1 + (this.sectorIndex - 1) * 0.15;
  }

  // ---- contracts ------------------------------------------------------------

  /** Hail the nearest hauler (R): trade with merchants, contracts otherwise. */
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
    // Present the contract for review — nothing is committed yet. The
    // captain reads the terms over the wire (browser speech synthesis).
    this.pendingOffer = this.quests.generateOffer(this.sectorIndex, this.player.position);
    this.voice.speak(`${this.pendingOffer.title}. ${this.pendingOffer.description}`);
    this.audio.uiClick();
    return true;
  }

  // ---- merchant trading -----------------------------------------------------

  openTrade(): void {
    if (this.state !== 'playing') return;
    this.state = 'trade';
    this.audio.silenceEngine();
    this.hud.setVisible(false);
    this.input.exitPointerLock();
    this.tradeScreen = new TradeScreen(this.uiRoot, this.inventory, {
      onTrade: (id) => this.executeTrade(id),
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
    if (!this.headless) this.input.requestPointerLock();
  }

  executeTrade(id: string): boolean {
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
    if (offer.kind === 'delivery' && offer.destination) this.spawnQuestBeacon(offer);
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

  /** What loot the boresight rests on: a stash, an ore/crystal vein, or
   *  nothing. While non-null, soft-lock DISENGAGES so shots fly straight at
   *  the point of interest instead of curving toward some hostile. */
  private aimedLoot(hostileDot = -1): 'stash' | 'vein' | null {
    const result = findAimedLoot(
      this.player,
      this.world.bodies,
      this.shootables,
      hostileDot,
      (from, to, body) => this.hasLineOfSight(from, to, body),
    );
    this.lootAimBody = result.kind === 'vein' ? result.body : null;
    if (this.lootAimBody && this.lootAimBody.orePoints.length > 0) {
      const anchor = this.lootAimPoint ?? new Vector3();
      anchor.set(0, 0, 0);
      for (const point of this.lootAimBody.orePoints) anchor.add(point);
      anchor.multiplyScalar(1 / this.lootAimBody.orePoints.length);
      this.lootAimPoint = anchor;
    } else {
      this.lootAimPoint = null;
    }
    return result.kind;
  }

  private nearestNeutral(): NeutralShip | null {
    return nearestNeutral(this.player.position, this.neutrals);
  }

  private completeQuest(q: Quest): void {
    this.score += q.reward.score;
    if (q.reward.flux) this.inventory.add('flux', q.reward.flux);
    if (q.reward.crystal) this.inventory.add('crystal', q.reward.crystal);
    if (q.reward.scrap) this.inventory.add('scrap', q.reward.scrap);
    this.hud.showBanner(`Contract complete — +${q.reward.score}`);
    this.events.emit('comms', { speaker: 'HAULER', text: 'Payment transferred. The lanes remember their friends.' });
    this.audio.pickup();
    this.removeQuestBeacon(q.id);
    this.events.emit('score-changed', { score: this.score });
  }

  private spawnQuestBeacon(q: Quest): void {
    const beacon = new Group();
    const core = new Mesh(
      new OctahedronGeometry(4, 0),
      new MeshStandardMaterial({
        color: 0x1a1405, emissive: new Color(0xffd24a), emissiveIntensity: 2.6,
      }),
    );
    beacon.add(core);
    const light = new PointLight(0xffd24a, 400, 220, 1.8);
    beacon.add(light);
    beacon.position.copy(q.destination!);
    this.scene.add(beacon);
    this.questBeacons.set(q.id, beacon);
  }

  private removeQuestBeacon(id: number): void {
    const beacon = this.questBeacons.get(id);
    if (beacon) {
      this.scene.remove(beacon);
      this.questBeacons.delete(id);
    }
  }

  // ---- devices & consumables ------------------------------------------------

  activateCloak(): boolean {
    if (this.state !== 'playing' || !this.player.alive) return false;
    // F toggles: dropping the cloak voluntarily still starts the cooldown.
    if (this.devices.cloaked) {
      this.devices.breakCloak();
      this.cloakVisual.set(this.player, false);
      this.hud.showBanner('Cloak dropped');
      return true;
    }
    // Sensor proximity: can't fade out while a hostile has a hard lock zone
    // on you — gain distance first.
    for (const h of this.hostiles) {
      if (h.alive && h.position.distanceToSquared(this.player.position) < CLOAK_MIN_RANGE * CLOAK_MIN_RANGE) {
        this.hud.showBanner('Too close — cloak refused');
        this.audio.uiHover();
        return false;
      }
    }
    if (!this.devices.tryCloak()) return false;
    this.cloakVisual.set(this.player, true);
    this.audio.hitShield();
    this.hud.showBanner('Cloak engaged');
    return true;
  }

  activateEmp(): boolean {
    if (this.state !== 'playing' || !this.player.alive || !this.devices.tryEmp()) return false;
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
    for (const e of this.enemies) {
      if (e.position.distanceTo(this.player.position) <= EMP_RADIUS) {
        e.stunTimer = EMP_STUN;
        zap(e);
      }
    }
    for (const t of this.turrets) {
      if (t.position.distanceTo(this.player.position) <= EMP_RADIUS) {
        t.stunTimer = EMP_STUN;
        zap(t);
      }
    }
    return true;
  }

  useNanobots(): boolean {
    const p = this.player;
    if (this.state !== 'playing' || !p.alive) return false;
    if (this.inventory.nanobots <= 0 || p.hull >= p.hullMax) return false;
    this.inventory.nanobots--;
    p.hull = Math.min(p.hullMax, p.hull + NANO_HEAL);
    const green = new Color(0.25, 1.2, 0.55);
    for (let i = 0; i < 14; i++) {
      const [dx, dy, dz] = this.rng.unitSphere();
      this.particles.spawn({
        position: p.position,
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

  /** Opening fire drops the cloak instantly — stealth or violence, not both. */
  private breakCloakOnFire(): void {
    if (!this.devices.cloaked) return;
    this.devices.breakCloak();
    this.cloakVisual.set(this.player, false);
    this.hud.showBanner('Cloak broken');
  }

  /** Fire an exploration story beat exactly once per mission. */
  private storyComms(key: string): void {
    if (this.storyFired.has(key)) return;
    this.storyFired.add(key);
    const lines = EXPLORE_COMMS[key];
    if (!lines) return;
    lines.forEach((line, i) => {
      if (i === 0) this.events.emit('comms', line);
      else setTimeout(() => this.events.emit('comms', line), i * 2800);
    });
  }

  /** Instantiate the sector plan: patrol wings, hauler routes, capital post. */
  private populateLevel(includeHostiles = true): void {
    const plan = this.sector.plan;
    for (const patrol of includeHostiles ? plan.patrols : []) {
      for (let i = 0; i < patrol.size; i++) {
        const enemy = new EnemyShip(
          i === 0 && patrol.size > 2 ? 'brute' : 'raider',
          this.rng.fork(),
          Math.min(0.5 * this.difficulty.aggression, 0.85),
          this.difficulty.enemyToughness * this.threatScale(),
          patrol.waypoints,
        );
        // fromWave stays false — patrols don't count toward wave clearance.
        enemy.object.position.copy(patrol.waypoints[0]);
        enemy.position.x += i * 14;
        enemy.position.y += i * 5;
        enemy.faceToward(patrol.waypoints[1]);
        this.scene.add(enemy.object);
        this.enemies.push(enemy);
      }
    }

    for (const route of plan.haulerRoutes) {
      const hauler = new NeutralShip(route);
      // Start partway along the route so traffic feels ongoing, not staged.
      hauler.object.position.copy(route[0]).lerp(route[1], 0.2 + 0.25 * this.neutrals.length);
      hauler.faceToward(route[1]);
      this.scene.add(hauler.object);
      this.neutrals.push(hauler);
    }

    // The merchant: guaranteed in the peaceful first sector, likely elsewhere.
    let merchantRoute = plan.merchantRoute;
    if (!merchantRoute && this.sectorIndex === 1 && plan.haulerRoutes.length > 0) {
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
      this.scene.add(merchant.object);
      this.neutrals.push(merchant);
    }

    if (plan.capitalPost && includeHostiles) {
      this.capital = new CapitalShip();
      this.capital.object.position.copy(plan.capitalPost.position);
      this.capital.faceToward(plan.capitalPost.facing);
      this.scene.add(this.capital.object);
      // Turret batteries mounted on the hull — they die with the ship.
      this.capitalTurrets = [];
      for (const mount of this.capital.turretMounts) {
        const turret = new Turret(this.rng.fork());
        const world = mount.clone();
        this.capital.object.localToWorld(world);
        turret.object.position.copy(world);
        turret.faceToward(world.clone().multiplyScalar(1.2));
        this.scene.add(turret.object);
        this.turrets.push(turret);
        this.capitalTurrets.push(turret);
      }
    }
  }

  /**
   * Spawn the player away from every pre-placed hostile — including the FULL
   * patrol routes, not just where the patrols happen to be right now (a loop
   * can sweep straight through an otherwise-quiet spot).
   */
  private placePlayerSafely(): void {
    // Wide net: the spawn must beat the 380 u patrol-detection radius with
    // margin, so no candidate pool stinginess — 48 tries out to 750 u.
    const candidates = 48;
    let bestPos: Vector3 | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < candidates; i++) {
      const [dx, dy, dz] = this.rng.unitSphere();
      const pos = new Vector3(dx, dy * 0.4, dz).multiplyScalar(this.rng.range(150, 750));
      // Reject spots inside rocks.
      let insideRock = false;
      for (const b of this.sector.asteroids.bodies) {
        if (!b.destroyed && b.position.distanceToSquared(pos) < (b.radius + 20) ** 2) {
          insideRock = true;
          break;
        }
      }
      if (insideRock) continue;
      let minHostile = Infinity;
      for (const e of this.enemies) minHostile = Math.min(minHostile, e.position.distanceTo(pos));
      for (const t of this.turrets) minHostile = Math.min(minHostile, t.position.distanceTo(pos));
      if (this.capital) minHostile = Math.min(minHostile, this.capital.position.distanceTo(pos));
      for (const patrol of this.sector.plan.patrols) {
        for (const wp of patrol.waypoints) {
          minHostile = Math.min(minHostile, wp.distanceTo(pos));
        }
      }
      if (minHostile > bestScore) {
        bestScore = minHostile;
        bestPos = pos;
      }
    }
    if (bestPos) this.player.object.position.copy(bestPos);
  }

  // ---- event wiring ---------------------------------------------------------

  private wireEvents(): void {
    this.events.on('hunters-inbound', () => {
      this.hud.showBanner('Vigil hunters inbound');
      this.audio.warning();
      this.storyComms('hunters-inbound');
    });
    this.events.on('alert-changed', ({ alert }) => {
      if (alert > 0) this.audio.warning();
    });
    this.events.on('comms', ({ speaker, text }) => this.hud.addComms(speaker, text));
  }

  spawnEnemy(spec: HunterSpawnSpec): void {
    const enemy = new EnemyShip(
      spec.kind,
      this.rng.fork(),
      spec.aggression,
      this.difficulty.enemyToughness * this.threatScale(),
    );
    enemy.hunter = true;
    enemy.object.position.copy(spec.position);
    enemy.faceToward(this.player.position); // NOT lookAt — ships nose along -Z
    this.scene.add(enemy.object);
    this.enemies.push(enemy);
  }

  // ---- per-frame ------------------------------------------------------------

  private tick(dt: number, elapsed: number): void {
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
    // Paused / loadout / gameover: world freezes but keeps rendering.

    const frozen =
      this.state === 'paused' || this.state === 'loadout' || this.state === 'trade';
    this.sector.update(frozen ? 0 : dt, elapsed, this.chaseCam.camera.position);
    if (!frozen) {
      this.particles.update(dt);
      this.explosions.update(dt);
      this.playerShield.update(dt);
      this.debris.update(dt);
      this.pulses.update(dt);
      this.warp.update(dt);
    }
    this.postFx.update(dt, this.state === 'playing' && this.player.boosting);
    this.postFx.render(dt);
    this.input.endFrame();
  }

  private updateMenuIdle(dt: number, elapsed: number): void {
    // Slow cinematic orbit around the parked ship. In the hangar the card row
    // occupies the bottom of the screen, so aim BELOW the ship to push it into
    // the clear upper half of the frame.
    const inHangar = this.state === 'hangar';
    const t = elapsed * 0.1 + (inHangar ? this.hangarVisor.orbitYaw : 0);
    const lift = inHangar ? this.hangarVisor.orbitLift : 0;
    const orbitR = inHangar ? this.hangarVisor.orbitRadius : 10.5; // wheel-zoomable in the hangar
    const cam = this.chaseCam.camera;
    cam.position.set(Math.sin(t) * orbitR, 3 + lift + Math.sin(t * 0.6) * 1.2, Math.cos(t) * orbitR);
    menuLook.copy(this.player.object.position);
    if (inHangar) menuLook.y -= 2.6;
    cam.lookAt(menuLook);
    if (inHangar) {
      // Parked like a real ship: nose toward the bay aperture (-Z).
      this.player.object.rotation.y = 0;
      // The meshes stay screen-aligned and head-locked; their subdivided
      // geometry supplies the actual convex helmet-glass distortion.
      cam.updateMatrixWorld();
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
    if (this.jumpSpool < 0 && this.input.wasPressed('KeyJ')) {
      this.startJump();
    }
    if (this.input.wasPressed('KeyF')) this.activateCloak();
    if (this.input.wasPressed('KeyG')) this.activateEmp();
    if (this.input.wasPressed('KeyH')) this.useNanobots();
    if (this.input.wasPressed('KeyR')) {
      if (this.pendingOffer) this.acceptOffer();
      else this.hailNearestNeutral();
    }
    if (this.input.wasPressed('KeyX') && this.pendingOffer) this.declineOffer();
    // Docking changes state inside the R-key handler. Do not run another
    // flight/audio update after the engine has been explicitly silenced.
    if (this.state !== 'playing') return;

    // Contract bookkeeping: collect progress + delivery beacon proximity.
    this.quests.updateCollectProgress(this.inventory.counts);
    for (const done of this.quests.onPositionUpdate(player.position)) {
      this.completeQuest(done);
    }

    this.missionTime += dt;

    this.devices.update(dt);
    this.cloakVisual.sync(player, this.devices.cloaked, dt);
    if (this.devices.cloaked) {
      // Cloak feeds on the weapon energy bank: idling sips, cruising drinks,
      // boosting gulps. Dry bank = cloak collapse.
      const speed = player.velocity.length();
      const drain = player.boosting ? 16 : speed > 12 ? 7 : 2.5;
      this.weapons.energy -= drain * dt;
      if (this.weapons.energy <= 0) {
        this.weapons.energy = 0;
        this.devices.breakCloak();
        this.cloakVisual.set(this.player, false);
        this.hud.showBanner('Cloak collapsed');
      }
    }

    // Jump-drive spool: HOLD J to charge — release cancels, damage cancels.
    // The warp tunnel intensity tracks charge progress.
    if (this.jumpSpool >= 0) {
      if (!this.jumpAuto && !this.input.isDown('KeyJ')) {
        this.cancelJump(null);
      } else {
        this.jumpSpool -= dt;
        const progress = 1 - this.jumpSpool / JUMP_SPOOL_TIME;
        this.warp.progress = progress;
        this.postFx.punchAberration(0.005 * progress);
        if (this.jumpSpool <= 0) {
          this.jumpSpool = -1;
          this.jumpAuto = false;
          this.completeJump();
          return;
        }
      }
    } else {
      this.warp.progress = Math.max(0, this.warp.progress - dt * 1.2);
    }

    // Planet terrain: hard floor with scrape damage.
    if (this.surface && player.alive) {
      const ground = this.surface.heightAt(player.position.x, player.position.z);
      if (player.position.y < ground + 2.2) {
        const sinkSpeed = -player.velocity.y;
        player.position.y = ground + 2.2;
        if (sinkSpeed > 12) {
          const dmg = Math.max(3, sinkSpeed * 0.3);
          const result = player.takeDamage(dmg);
          this.playerShield.hit(player.position);
          this.chaseCam.addTrauma(0.4);
          this.hud.flashDamage(0.5);
          this.audio.hitHull();
          this.events.emit('player-hit', { amount: dmg, shieldAbsorbed: result.shieldAbsorbed });
        }
        player.velocity.y = Math.abs(player.velocity.y) * 0.25;
      }
    }

    // Exploration story triggers (each fires once; space-side only).
    if (player.alive && !this.surface) {
      for (const e of this.enemies) {
        if (e.position.distanceToSquared(player.position) < 420 * 420) {
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
      if (this.capital && this.capital.position.distanceToSquared(player.position) < 500 * 500) {
        this.storyComms('capital-sighted');
      }
    }

    // Hostile/shootable lists rebuilt BEFORE targeting so lock-on can pick
    // turrets and the capital too — not just fighters (one-frame-stale
    // positions are fine at any playable frame rate).
    this.hostiles.length = 0;
    for (const e of this.enemies) this.hostiles.push(e);
    // Capital-mounted batteries are excluded: the capital's big hull sphere
    // swallows bolts before they reach a mounted turret's own sphere, so they
    // read as indestructible — the lock (and the damage) goes to the SHIP.
    for (const t of this.turrets) {
      if (t.alive && !this.capitalTurrets.includes(t)) this.hostiles.push(t);
    }
    if (this.capital?.alive) this.hostiles.push(this.capital);
    this.shootables.length = 0;
    for (const s of this.hostiles) this.shootables.push(s);
    for (const n of this.neutrals) if (n.alive) this.shootables.push(n);

    if (player.alive) {
      player.update(dt, this.input);
      this.targeting.update(player, this.hostiles, this.weapons.weapon.projectileSpeed);
      let hostileDot = -1;
      if (this.targeting.current) {
        player.forward(aimForward);
        aimBlockOff
          .copy(this.targeting.current.ship.position)
          .sub(player.position)
          .normalize();
        hostileDot = aimForward.dot(aimBlockOff);
      }
      this.lootAimed = this.aimedLoot(hostileDot);
      if (this.lootAimed) this.targeting.current = null; // free-fire at the loot
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
      // dt-scaled: constant shake intensity at any frame rate (a fixed
      // per-frame amount shook 2.4× harder at 144 Hz than at 60 Hz).
      if (player.boosting) this.chaseCam.addTrauma(0.55 * dt);
    }

    // Engine exhaust trail (frame-rate independent emission).
    if (player.alive && !this.devices.cloaked && player.throttle > 0.45) {
      this.trailAccum += dt;
      const interval = player.boosting ? 0.008 : 0.016;
      const engineColor = new Color(STYLE_ENGINES[player.kind]);
      while (this.trailAccum >= interval) {
        this.trailAccum -= interval;
        for (const ep of player.enginePoints) {
          trailPos.copy(ep);
          player.object.localToWorld(trailPos);
          trailVel.copy(player.velocity).multiplyScalar(0.15);
          trailVel.x += (this.rng.next() - 0.5) * 3;
          trailVel.y += (this.rng.next() - 0.5) * 3;
          trailVel.z += (this.rng.next() - 0.5) * 3;
          this.particles.spawn({
            position: trailPos,
            velocity: trailVel,
            color: engineColor,
            size: player.boosting ? 1.5 : 1.0,
            life: player.boosting ? 0.5 : 0.3,
            drag: 0.5,
          });
        }
      }
    }

    // Enemies think, steer, shoot; turrets track and fire; traffic trundles.
    // While cloaked, nothing can see the player.
    const playerVisible = player.alive && !this.devices.cloaked;
    for (const enemy of this.enemies) {
      const enemySeesPlayer =
        playerVisible && this.hasLineOfSight(enemy.position, player.position);
      enemy.update(
        dt,
        player.position,
        player.velocity,
        (e) => this.enemyFire(e),
        enemySeesPlayer,
      );
      if (this.surface) this.resolveEnemySurfaceCollision(enemy);
    }
    for (const turret of this.turrets) {
      turret.update(dt, player.position, player.alive, (t) => this.turretFire(t), playerVisible);
    }
    for (const n of this.neutrals) n.update(dt);
    this.capital?.update(dt);

    // Projectiles + hits.
    this.projectiles.update(
      dt,
      this.shootables,
      player.alive ? player : null,
      this.world.bodies,
      (hit) => this.resolveHit(hit),
      this.surface ? this.terrainProjectileHit : undefined,
    );

    // Salvage drifting toward the hold.
    this.pickups.update(dt, player.position, player.alive, (type) => this.collect(type));

    this.resolveShipCollisions(dt);

    // Player death sequencing.
    if (!player.alive && this.deathTimer < 0) {
      this.deathTimer = 2.4;
      this.explosions.spawn(player.position, 2.2);
      this.audio.explosion(true);
      this.chaseCam.addTrauma(1);
      player.object.visible = false;
      this.audio.setEngine(0, false);
      this.events.emit('player-died', undefined);
    }
    if (this.deathTimer > 0) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) {
        this.gameOver();
        return;
      }
    }

    // Hunter dispatches only exist beyond the peaceful first sector, in space.
    if (this.sectorIndex > 1 && !this.surface) this.encounters?.update(dt, player.position);
    this.chaseCam.update(dt, player.object, player.speedFrac, player.boosting);

    // Camera-mode visibility: hide the hull once the eye is inside it.
    if (player.alive) {
      const blend = this.chaseCam.blend;
      player.exterior.visible = blend < 0.85;
      player.cockpit.visible = blend > 0.5;
      this.playerShield.mesh.visible = blend < 0.85;

      // Feed the cockpit console displays with live data while in (or near)
      // first person.
      if (blend > 0.2) {
        const t = this.targeting.current;
        player.displays.update(dt, {
          weaponName: this.weapons.weapon.name,
          energyFrac: this.weapons.energy / this.weapons.energyMax,
          seekersReadyFrac: 1 - this.weapons.missileCooldown / 1.35,
          targetName: t ? TARGET_NAMES[t.ship.kind] ?? 'Vigil Raider' : null,
          targetDistance: t?.distance ?? 0,
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
    }

    this.updateHud(dt);
  }

  private collect(type: ResourceType): void {
    this.inventory.add(type); // instant — crafting never waits on the theater
    // The glyph flies from where the salvage vanished (the ship) to its
    // HUD counter, which bumps on arrival.
    const anchor = this.hudProjector.projectAnchor(
      this.player.position,
      this.chaseCam.camera,
      window.innerWidth,
      window.innerHeight,
    );
    if (anchor) this.hud.flyPickup(type, anchor.x, anchor.y);
    this.audio.pickup();
    this.storyComms('first-ore');
    this.events.emit('pickup-collected', { kind: type });
  }

  private enemyFire(enemy: EnemyShip): void {
    if (!this.hasLineOfSight(enemy.position, this.player.position)) return;
    const dir = new Vector3();
    enemy.forward(dir);
    for (const gp of enemy.gunpoints) {
      const muzzle = gp.clone();
      enemy.object.localToWorld(muzzle);
      this.projectiles.spawnBolt({
        position: muzzle,
        direction: dir,
        speed: enemy.stats.projectileSpeed,
        damage: enemy.stats.damage * this.difficulty.enemyDamage,
        faction: 'enemy',
        color: ENEMY_BOLT_COLOR,
        boltLength: 3.4,
        boltWidth: 0.18,
        life: 2.2,
      });
    }
    if (enemy.position.distanceTo(this.player.position) < 400) {
      this.audio.laser(0.6);
    }
  }

  private resolveHit(hit: ProjectileHit): void {
    if (!hit.ship) {
      // Asteroid strike — dusty pop, mining, and structural damage.
      this.explosions.spawn(hit.point, hit.wasMissile ? 1.2 : 0.35);
      const rock = hit.asteroid;
      if (!rock || rock.destroyed || hit.faction !== 'player') return;

      // Crack the ore vein first (it's softer than the rock).
      if (rock.ore) {
        rock.oreHp -= hit.damage;
        if (rock.oreHp <= 0) {
          const type: ResourceType = rock.ore;
          this.world.depleteOre(rock);
          const count = type === 'crystal' ? this.rng.int(2, 4) : this.rng.int(3, 5);
          this.pickups.spawn(hit.point, type, count, this.rng);
          this.explosions.spawn(hit.point, 0.9);
          this.audio.explosion(false);
        }
      }

      // Structural damage — shatter when spent.
      rock.hp -= hit.damage;
      if (rock.hp <= 0) {
        // Ore still in the rock comes out in the wreckage.
        const buriedOre: ResourceType | null = rock.ore;
        this.world.destroyRock(rock);
        this.debris.spawn(rock.position, rock.radius, this.rng);
        this.explosions.spawn(rock.position, Math.min(2.4, 0.7 + rock.radius * 0.06));
        this.audio.explosion(rock.radius > 14);
        if (buriedOre) {
          this.pickups.spawn(rock.position, buriedOre, this.rng.int(2, 4), this.rng);
        }
        if (rock.stash) {
          // Secret cache: mixed loot burst.
          this.pickups.spawn(rock.position, 'scrap', 3, this.rng);
          this.pickups.spawn(rock.position, 'crystal', 3, this.rng);
          this.pickups.spawn(rock.position, 'flux', 2, this.rng);
          this.audio.pickup();
          this.storyComms('first-stash');
        } else if (rock.radius >= 9) {
          // Big rocks calve into smaller collidable rocks; small ones just pop.
          const children = this.rng.int(2, 3);
          for (let i = 0; i < children; i++) {
            const [dx, dy, dz] = this.rng.unitSphere();
            childOffset.set(dx, dy, dz).multiplyScalar(rock.radius * 0.55);
            this.world.spawnChild(
              childOffset.add(rock.position),
              rock.radius * this.rng.range(0.32, 0.48),
              this.rng,
              rock.palette,
            );
          }
        }
      }
      return;
    }

    const result = hit.ship.takeDamage(hit.damage);

    if (hit.ship === this.player) {
      if (this.jumpSpool >= 0) this.cancelJump('Jump disrupted — taking fire!');
      this.playerShield.hit(hit.point);
      this.hud.flashDamage(result.shieldAbsorbed ? 0.35 : 0.7);
      this.chaseCam.addTrauma(result.shieldAbsorbed ? 0.25 : 0.45);
      if (result.shieldAbsorbed) this.audio.hitShield();
      else this.audio.hitHull();
      this.events.emit('player-hit', {
        amount: hit.damage,
        shieldAbsorbed: result.shieldAbsorbed,
      });
    } else if (hit.ship instanceof EnemyShip) {
      const enemy = hit.ship;
      enemy.notifyDamaged();
      this.hud.flashHitmarker(result.died);
      this.explosions.spawn(hit.point, hit.wasMissile ? 1.1 : 0.28);
      if (result.died) this.killEnemy(enemy);
      else this.audio.hitShield();
    } else if (hit.ship instanceof Turret) {
      this.hud.flashHitmarker(result.died);
      this.explosions.spawn(hit.point, hit.wasMissile ? 1.1 : 0.28);
      if (result.died) this.killTurret(hit.ship);
      else this.audio.hitShield();
    } else if (hit.ship instanceof CapitalShip) {
      this.hud.flashHitmarker(result.died);
      this.explosions.spawn(hit.point, hit.wasMissile ? 1.3 : 0.4);
      if (result.died) this.killCapital(hit.ship);
    } else if (hit.ship instanceof NeutralShip) {
      this.hud.flashHitmarker(result.died);
      this.explosions.spawn(hit.point, 0.4);
      if (result.died) this.killNeutral(hit.ship);
    }
  }

  private killCapital(capital: CapitalShip): void {
    // The hull batteries go with the ship.
    for (const turret of this.capitalTurrets) {
      if (!turret.alive) continue;
      turret.alive = false;
      this.explosions.spawn(turret.position, 1.1);
      this.debris.spawn(turret.position, 4, this.rng);
      this.scene.remove(turret.object);
    }
    this.turrets = this.turrets.filter((t) => !this.capitalTurrets.includes(t));
    this.capitalTurrets = [];
    // A capital death is an event: chained blasts along the hull.
    for (let i = 0; i < 5; i++) {
      const [dx, dy, dz] = this.rng.unitSphere();
      const p = capital.position.clone().add(new Vector3(dx * 12, dy * 5, dz * 20));
      this.explosions.spawn(p, 1.6 + this.rng.next());
    }
    this.explosions.spawn(capital.position, 3);
    this.audio.explosion(true);
    this.debris.spawn(capital.position, 20, this.rng);
    this.scene.remove(capital.object);
    this.capital = null;
    this.score += Math.round(2500 * this.difficulty.scoreMult * this.threatScale());
    this.pickups.spawn(capital.position, 'scrap', 6, this.rng);
    this.pickups.spawn(capital.position, 'crystal', 4, this.rng);
    this.pickups.spawn(capital.position, 'flux', 3, this.rng);
    this.hud.showBanner('Capital ship destroyed — jump field clear');
    this.encounters?.onVigilKill('capital');
    this.storyComms('capital-destroyed');
    this.events.emit('score-changed', { score: this.score });
  }

  private killNeutral(neutral: NeutralShip): void {
    this.explosions.spawn(neutral.position, 1.6);
    this.audio.explosion(true);
    this.debris.spawn(neutral.position, 8, this.rng);
    this.scene.remove(neutral.object);
    this.neutrals = this.neutrals.filter((n) => n !== neutral);
    // Piracy pays in salvage, not score — and ECHO remembers.
    this.pickups.spawn(neutral.position, 'scrap', this.rng.int(3, 5), this.rng);
    this.events.emit('comms', { speaker: 'ECHO', text: 'That hauler was no threat to us. Logged.' });
  }

  private killTurret(turret: Turret): void {
    this.explosions.spawn(turret.position, 1.4);
    this.audio.explosion(true);
    this.debris.spawn(turret.position, 5, this.rng);
    this.scene.remove(turret.object);
    this.turrets = this.turrets.filter((t) => t !== turret);
    this.score += Math.round(TURRET_STATS.score * this.difficulty.scoreMult * this.threatScale());
    this.encounters?.onVigilKill('turret');
    this.pickups.spawn(turret.position, 'scrap', 2, this.rng);
    this.pickups.spawn(turret.position, 'flux', this.rng.int(1, 2), this.rng);
    this.events.emit('score-changed', { score: this.score });
  }

  /**
   * True if nothing solid sits between two points: checks big world bodies
   * (skipping any sphere that CONTAINS `from` — a turret's own mount) and, on
   * a planet, the terrain itself. Turrets consult this before firing so they
   * never blast their own rock/roof or a hillside.
   */
  private hasLineOfSight(
    from: Vector3,
    to: Vector3,
    ignoredBody: AsteroidBody | null = null,
  ): boolean {
    if (this.surface?.isCovered(from, to)) return false;
    losDir.copy(to).sub(from);
    const dist = losDir.length();
    if (dist < 1e-5) return true;
    losDir.divideScalar(dist);
    for (const b of this.world.bodies) {
      if (b === ignoredBody || b.destroyed || b.radius < 0.8) continue;
      losOff.copy(b.position).sub(from);
      const along = losOff.dot(losDir);
      if (along < 0 || along > dist) continue;
      const perpSq = losOff.lengthSq() - along * along;
      if (perpSq > b.radius * b.radius) continue;
      if (b.box) {
        // Buildings block by their TIGHT box, not the fat broadphase sphere
        // — a rooftop turret must be able to see over its own roofline.
        if (!rayHitsBodyBox(from, losDir, dist, b)) continue;
      }
      if (pointInsideBody(from, b, 4)) continue; // own mount
      return false;
    }
    return true;
  }

  private turretFire(turret: Turret): void {
    if (!this.hasLineOfSight(turret.position, this.player.position)) return;
    const dir = new Vector3();
    turret.forward(dir);
    for (const gp of turret.gunpoints) {
      const muzzle = gp.clone();
      turret.object.localToWorld(muzzle);
      this.projectiles.spawnBolt({
        position: muzzle,
        direction: dir,
        speed: TURRET_STATS.projectileSpeed,
        damage: TURRET_STATS.damage * this.difficulty.enemyDamage,
        faction: 'enemy',
        color: ENEMY_BOLT_COLOR,
        boltLength: 3.0,
        boltWidth: 0.18,
        life: 2.0,
      });
    }
    if (turret.position.distanceTo(this.player.position) < 400) this.audio.laser(0.5);
  }

  private killEnemy(enemy: EnemyShip): void {
    this.explosions.spawn(enemy.position, enemy.kind === 'brute' ? 1.9 : 1.2);
    this.audio.explosion(enemy.kind === 'brute');
    this.debris.spawn(enemy.position, enemy.kind === 'brute' ? 6 : 4, this.rng);
    this.scene.remove(enemy.object);
    this.enemies = this.enemies.filter((e) => e !== enemy);
    this.score += Math.round(enemy.stats.score * this.difficulty.scoreMult * this.threatScale());
    this.encounters?.onVigilKill('fighter');
    for (const done of this.quests.onVigilKill()) this.completeQuest(done);
    this.storyComms('first-kill');

    // Salvage drops.
    if (enemy.kind === 'brute') {
      this.pickups.spawn(enemy.position, 'scrap', this.rng.int(2, 3), this.rng);
      this.pickups.spawn(enemy.position, 'flux', this.rng.int(1, 2), this.rng);
    } else {
      this.pickups.spawn(enemy.position, 'scrap', this.rng.int(1, 2), this.rng);
      if (this.rng.chance(0.2)) this.pickups.spawn(enemy.position, 'flux', 1, this.rng);
    }

    this.events.emit('enemy-killed', {
      position: [enemy.position.x, enemy.position.y, enemy.position.z],
      score: enemy.stats.score,
      enemyKind: enemy.kind,
    });
    this.events.emit('score-changed', { score: this.score });
  }

  /** Keep surface patrols above the analytic floor and outside every visible
   * registered obstacle, including buildings and cave roofs. */
  private resolveEnemySurfaceCollision(enemy: EnemyShip): void {
    const surface = this.surface;
    if (!surface || !enemy.alive) return;

    const minY = surface.heightAt(enemy.position.x, enemy.position.z) + enemy.radius + 0.8;
    if (enemy.position.y < minY) {
      enemy.position.y = minY;
      enemy.velocity.y = Math.max(8, Math.abs(enemy.velocity.y) * 0.35);
    }

    for (const body of surface.bodies) {
      if (body.destroyed) continue;
      const broadRadius = body.radius + enemy.radius;
      if (body.position.distanceToSquared(enemy.position) > broadRadius * broadRadius) continue;

      let touching = false;
      if (body.box) {
        enemyRel.copy(enemy.position).sub(body.position);
        const px = body.box.hx + enemy.radius - Math.abs(enemyRel.x);
        const py = body.box.hy + enemy.radius - Math.abs(enemyRel.y);
        const pz = body.box.hz + enemy.radius - Math.abs(enemyRel.z);
        if (px > 0 && py > 0 && pz > 0) {
          touching = true;
          if (px <= py && px <= pz) {
            pushDir.set(enemyRel.x >= 0 ? 1 : -1, 0, 0);
            enemy.position.x = body.position.x + pushDir.x * (body.box.hx + enemy.radius + 0.3);
          } else if (py <= pz) {
            pushDir.set(0, enemyRel.y >= 0 ? 1 : -1, 0);
            enemy.position.y = body.position.y + pushDir.y * (body.box.hy + enemy.radius + 0.3);
          } else {
            pushDir.set(0, 0, enemyRel.z >= 0 ? 1 : -1);
            enemy.position.z = body.position.z + pushDir.z * (body.box.hz + enemy.radius + 0.3);
          }
        }
      } else {
        enemyRel.copy(enemy.position).sub(body.position);
        if (enemyRel.lengthSq() < broadRadius * broadRadius) {
          touching = true;
          if (enemyRel.lengthSq() < 1e-6) enemyRel.set(0, 1, 0);
          pushDir.copy(enemyRel).normalize();
          enemy.position.copy(body.position).addScaledVector(pushDir, broadRadius + 0.3);
        }
      }
      if (touching) {
        enemy.velocity.reflect(pushDir).multiplyScalar(0.35).addScaledVector(pushDir, 10);
        break;
      }
    }
  }

  /** Ship-vs-asteroid and ship-vs-ship ramming. */
  private resolveShipCollisions(dt: number): void {
    const player = this.player;
    if (player.alive) {
      for (const a of this.world.bodies) {
        if (a.destroyed) continue;
        const rr = a.radius + player.radius;
        if (Math.abs(a.position.x - player.position.x) > rr) continue;
        if (Math.abs(a.position.y - player.position.y) > rr) continue;
        if (Math.abs(a.position.z - player.position.z) > rr) continue;
        let touching: boolean;
        if (a.box) {
          // Box bodies (buildings): closest point on the AABB — the fat
          // broadphase sphere must not act as an invisible wall over roofs.
          boxClosest.set(
            Math.max(a.position.x - a.box.hx, Math.min(a.position.x + a.box.hx, player.position.x)),
            Math.max(a.position.y - a.box.hy, Math.min(a.position.y + a.box.hy, player.position.y)),
            Math.max(a.position.z - a.box.hz, Math.min(a.position.z + a.box.hz, player.position.z)),
          );
          const dSq = boxClosest.distanceToSquared(player.position);
          touching = dSq < player.radius * player.radius;
          if (touching) {
            pushDir.copy(player.position).sub(boxClosest);
            if (pushDir.lengthSq() < 1e-6) pushDir.set(0, 1, 0);
            pushDir.normalize();
            player.position.copy(boxClosest).addScaledVector(pushDir, player.radius + 0.5);
          }
        } else {
          touching = a.position.distanceToSquared(player.position) < rr * rr;
          if (touching) {
            pushDir.copy(player.position).sub(a.position).normalize();
            player.position.copy(a.position).addScaledVector(pushDir, rr + 0.5);
          }
        }
        if (touching) {
          // Only velocity INTO the wall is an impact. Depenetrating a parked
          // ship or sliding along a cave arch must not inflict the old
          // unconditional four damage every frame.
          const normalSpeed = player.velocity.dot(pushDir);
          const impactSpeed = Math.max(0, -normalSpeed);
          if (normalSpeed < 0) {
            // Preserve tangential motion and bounce only the closing component.
            player.velocity.addScaledVector(pushDir, -normalSpeed * 1.3);
          }
          const dmg = Math.max(0, (impactSpeed - 4) * 0.22);
          if (dmg >= 0.2) {
            const result = player.takeDamage(dmg);
            this.playerShield.hit(
              player.position.clone().addScaledVector(pushDir, -player.radius),
            );
            this.chaseCam.addTrauma(Math.min(0.65, 0.12 + dmg * 0.04));
            this.hud.flashDamage(Math.min(0.8, 0.18 + dmg * 0.04));
            this.audio.hitHull();
            this.events.emit('player-hit', {
              amount: dmg,
              shieldAbsorbed: result.shieldAbsorbed,
            });
          }
          break;
        }
      }
    }
    // Capital ship hull is a hard wall.
    if (player.alive && this.capital?.alive) {
      const rr = this.capital.radius + player.radius;
      if (this.capital.position.distanceToSquared(player.position) < rr * rr) {
        const speed = player.velocity.length();
        pushDir.copy(player.position).sub(this.capital.position).normalize();
        player.position.copy(this.capital.position).addScaledVector(pushDir, rr + 0.5);
        player.velocity.reflect(pushDir).multiplyScalar(0.3);
        const dmg = Math.max(5, speed * 0.25);
        const result = player.takeDamage(dmg);
        this.chaseCam.addTrauma(0.5);
        this.hud.flashDamage(0.6);
        this.audio.hitHull();
        this.events.emit('player-hit', { amount: dmg, shieldAbsorbed: result.shieldAbsorbed });
      }
    }
    // Enemy ramming the player.
    if (player.alive) {
      for (const e of this.enemies) {
        const rr = e.radius + player.radius;
        if (e.position.distanceToSquared(player.position) < rr * rr) {
          pushDir.copy(player.position).sub(e.position).normalize();
          player.position.addScaledVector(pushDir, rr * 0.4 * dt * 30);
          const result = player.takeDamage(10 * dt * 10);
          e.takeDamage(20 * dt * 10);
          if (!e.alive) this.killEnemy(e);
          this.chaseCam.addTrauma(0.3);
          if (!result.died) this.hud.flashDamage(0.4);
          break;
        }
      }
    }
  }

  // ---- HUD assembly ---------------------------------------------------------

  private updateHud(dt = 1 / 60): void {
    const player = this.player;
    const cam = this.chaseCam.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;

    const target = this.targeting.current;
    const weapon = this.weapons.weapon;
    const weaponReach = weapon.projectileSpeed * weapon.life;
    const objectives = this.quests.active
      .filter((quest) => quest.kind === 'delivery' && quest.destination)
      .map((quest) => quest.destination!);
    const projection = this.hudProjector.project(
      cam,
      player.position,
      target,
      this.shootables,
      objectives,
      weaponReach,
      w,
      h,
    );
    const {
      target: targetState,
      contacts,
      offscreen,
      radarContacts,
    } = projection;

    let promptAnchor: HudFrameState['promptAnchor'] = null;
    if (this.lootAimed === 'vein' && this.lootAimPoint && this.lootAimBody) {
      promptAnchor = this.hudProjector.projectSmoothedAnchor(
        this.lootAimPoint,
        this.lootAimBody,
        cam,
        w,
        h,
        dt,
        1.05,
      );
    } else {
      this.hudProjector.resetPromptAnchor();
    }

    const nearHauler = this.nearestNeutral();
    const veinPromptActive =
      !this.pendingOffer &&
      !nearHauler &&
      this.lootAimed === 'vein' &&
      promptAnchor !== null;
    const prompt = this.pendingOffer
      ? null // the offer panel carries its own key hints
      : nearHauler
        ? nearHauler.isMerchant
          ? 'R · Dock & trade'
          : this.quests.hasTurnIn(this.inventory.counts)
            ? 'R · Deliver goods'
            : 'R · Hail hauler'
        : this.lootAimed === 'stash'
          ? 'Shoot · Crack the stash open'
          : veinPromptActive
            ? 'Shoot · Mine the vein'
            : !this.surface && this.findAimedPlanet() !== null
              ? 'Hold J · Land on planet'
              : null;

    const po = this.pendingOffer;
    const offer = po
      ? {
          title: po.title,
          description: po.description,
          reward:
            `Pay: +${po.reward.score} pts` +
            (po.reward.flux ? ` · ✦ ${po.reward.flux}` : '') +
            (po.reward.crystal ? ` · ◆ ${po.reward.crystal}` : '') +
            (po.reward.scrap ? ` · ▲ ${po.reward.scrap}` : ''),
        }
      : null;

    this.radar.update(player.object.quaternion, player.position, radarContacts);

    // Wireframe target readout: oriented as the REAL ship sits in view space
    // — nose-on when it faces you, tail-on when it flees.
    const targetRotation = this.hudProjector.targetRotation(cam, target?.ship ?? null);
    if (target) {
      this.targetPreview.update(
        target.ship.kind,
        target.ship.hull / target.ship.hullMax,
        targetRotation,
      );
    } else {
      this.targetPreview.update(null, 0, targetRotation);
    }

    this.hud.update({
      hull: player.hull,
      hullMax: player.hullMax,
      shield: player.shield,
      shieldMax: player.shieldMax,
      energy: this.weapons.energy,
      energyMax: this.weapons.energyMax,
      boost: player.boostEnergy,
      boostMax: player.stats.boostEnergyMax,
      speed: player.velocity.length(),
      boosting: player.boosting,
      weaponIndex: this.weapons.weaponIndex,
      weaponNames: this.weapons.weaponNames,
      missileReadyFrac: 1 - this.weapons.missileCooldown / 1.35,
      missiles: this.weapons.missileRate > 0 ? this.inventory.missiles : null,
      score: this.score,
      alert: this.encounters?.alert ?? 0,
      sector: this.sectorIndex,
      jump: this.jumpStatus(),
      devices: {
        cloak: this.devices.cloakState(),
        emp: this.devices.empState(),
        nano: this.inventory.nanobots,
      },
      prompt,
      promptAnchor: veinPromptActive ? promptAnchor : null,
      questLog: this.quests.active.map((q) => ({ title: q.title, progress: q.progress })),
      offer,
      merchantPresent: this.neutrals.some((n) => n.alive && n.isMerchant),
      onPlanet: this.surface !== null,
      targetPreview: target
        ? {
            name: TARGET_NAMES[target.ship.kind] ?? 'Vigil Raider',
            hullFrac: target.ship.hull / target.ship.hullMax,
          }
        : null,
      fps: this.loop.fps,
      target: targetState,
      contacts,
      offscreen,
      resources: {
        scrap: this.inventory.counts.scrap,
        crystal: this.inventory.counts.crystal,
        flux: this.inventory.counts.flux,
      },
    });
  }

  private jumpStatus(): { label: string; frac: number } {
    if (this.jumpSpool >= 0) {
      const frac = 1 - this.jumpSpool / JUMP_SPOOL_TIME;
      return { label: `Spooling ${Math.round(frac * 100)}%`, frac };
    }
    if (this.surface) {
      this.player.forward(jumpFwd);
      return jumpFwd.y > 0.5
        ? { label: 'Hold J — lift off', frac: 1 }
        : { label: 'Aim skyward to leave', frac: 0 };
    }
    if (this.findAimedPlanet() !== null) return { label: 'Hold J — LAND', frac: 1 };
    if (this.jumpSuppressed) return { label: 'Suppressed', frac: 0 };
    if (this.inventory.counts.flux < JUMP_FLUX_COST) {
      return { label: `Need ${JUMP_FLUX_COST} ✦ flux`, frac: 0 };
    }
    return { label: 'Hold J', frac: 1 };
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

  /** Fullscreen transitions report intermediate viewports. Resize promptly,
   * then rebuild the post chain once Chrome's F11 transition has settled. */
  private scheduleResize(): void {
    if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
    if (this.resizeSettleTimer) window.clearTimeout(this.resizeSettleTimer);
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
    // The CSS-sized canvas is the authoritative viewport during browser F11;
    // innerWidth/innerHeight can briefly describe the departing window.
    const bounds = this.renderer.domElement.getBoundingClientRect();
    const w = Math.max(1, Math.round(bounds.width || document.documentElement.clientWidth));
    const h = Math.max(1, Math.round(bounds.height || document.documentElement.clientHeight));
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    const layoutChanged = w !== this.viewportWidth || h !== this.viewportHeight;
    const ratioChanged = pixelRatio !== this.viewportPixelRatio;
    this.viewportWidth = w;
    this.viewportHeight = h;
    this.viewportPixelRatio = pixelRatio;

    if (ratioChanged) this.renderer.setPixelRatio(pixelRatio);
    if (layoutChanged) this.renderer.setSize(w, h, false);
    this.chaseCam.setAspect(w / h);
    if (rebuildPostFx) {
      // A browser fullscreen transition may invalidate a half-float target
      // without losing the WebGL context. Recreating the small post chain
      // after the viewport settles prevents a permanently cleared frame.
      this.postFx.composer.dispose();
      this.postFx = new PostFx(this.renderer, this.scene, this.chaseCam.camera);
    }
    this.postFx.setSize(w, h);
    this.hangarVisor.resize(w, h, pixelRatio, layoutChanged, ratioChanged);
    if (this.state === 'hangar' && this.hangarVisor.active) {
      if (layoutChanged) this.hangarVisor.mount();
      this.updateMenuIdle(0, performance.now() * 0.001);
      this.hangarVisor.scheduleRender();
    }
    // Refill newly allocated targets immediately. resetState also clears any
    // stale viewport/scissor bookkeeping retained across the F11 transition.
    this.renderer.resetState();
    this.postFx.render(0);
  }
}
