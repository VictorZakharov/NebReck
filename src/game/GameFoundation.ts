import { Group, Scene, Vector3 } from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { Voice } from '../audio/Voice';
import { ProjectileSystem } from '../combat/ProjectileSystem';
import { Targeting } from '../combat/Targeting';
import { WeaponSystem } from '../combat/WeaponSystem';
import { EventBus } from '../core/EventBus';
import { GameLoop } from '../core/GameLoop';
import { Input } from '../core/Input';
import { Rng } from '../core/Rng';
import { CapitalShip } from '../entities/CapitalShip';
import { EnemyShip } from '../entities/EnemyShip';
import { NeutralShip } from '../entities/NeutralShip';
import { PickupSystem } from '../entities/PickupSystem';
import { PlayerShip } from '../entities/PlayerShip';
import { Ship } from '../entities/Ship';
import { Turret } from '../entities/Turret';
import { ExplosionSystem } from '../fx/ExplosionSystem';
import { ParticleSystem } from '../fx/ParticleSystem';
import { PulseRing } from '../fx/PulseRing';
import { ShieldFx } from '../fx/ShieldFx';
import { ShipDebris } from '../fx/ShipDebris';
import { WarpTunnel } from '../fx/WarpTunnel';
import { ChaseCamera } from '../rendering/ChaseCamera';
import { createRenderer } from '../rendering/createRenderer';
import { PostFx } from '../rendering/PostFx';
import { GameOverScreen } from '../ui/GameOverScreen';
import { HangarScreen } from '../ui/HangarScreen';
import { HangarVisor } from '../ui/HangarVisor';
import { Hud } from '../ui/Hud';
import { LegacyScreen } from '../ui/LegacyScreen';
import { LoadoutScreen } from '../ui/LoadoutScreen';
import { MainMenu } from '../ui/MainMenu';
import { PauseMenu } from '../ui/PauseMenu';
import { Radar3D } from '../ui/Radar3D';
import { TradeScreen } from '../ui/TradeScreen';
import { TouchControls } from '../ui/TouchControls';
import { AsteroidBody, ChildAsteroidMotion } from '../world/AsteroidField';
import { HangarBay } from '../world/HangarBay';
import { PlanetSurface } from '../world/PlanetSurface';
import { Sector } from '../world/Sector';
import { CloakVisual } from './CloakVisual';
import { DeviceSystem } from './Devices';
import { DifficultyDef, getDifficulty } from './Difficulty';
import { EncounterDirector, HunterSpawnSpec } from './EncounterDirector';
import { GameCombat } from './GameCombat';
import { loadHangarPreferences } from './HangarPreferences';
import { GameHudPresenter } from './GameHudPresenter';
import { GameWorldFlow } from './GameWorldFlow';
import { Inventory } from './Inventory';
import { MetaProgress } from './MetaProgress';
import { NavigationSystem } from './NavigationSystem';
import { Quest, QuestSystem } from './Quests';
import { TutorialDirector } from './TutorialDirector';
import { prepareTutorialSurfaceMission } from './TutorialSurfaceMission';

export type GameState =
  | 'menu'
  | 'hangar'
  | 'playing'
  | 'paused'
  | 'loadout'
  | 'trade'
  | 'gameover'
  | 'test';

export interface GameOptions {
  seed: number;
  /** Test harness mode: no pointer lock, no audio, no rAF loop. */
  headless: boolean;
}

/**
 * Shared state and subsystem construction for the game controller layers.
 *
 * This class deliberately contains no screen transitions or frame behavior.
 * Its abstract hooks let the focused layers provide those responsibilities
 * without rebuilding large callback adapters in the public Game facade.
 */
export abstract class GameFoundation {
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
  readonly touchControls: TouchControls;
  readonly audio = new AudioEngine();
  readonly chaseCam: ChaseCamera;
  postFx: PostFx;
  sector: Sector;
  readonly particles: ParticleSystem;
  readonly explosions: ExplosionSystem;
  readonly projectiles: ProjectileSystem;
  readonly pickups: PickupSystem;
  shipDebris!: ShipDebris;
  readonly targeting = new Targeting();
  readonly navigation = new NavigationSystem();
  readonly weapons: WeaponSystem;
  readonly hud: Hud;
  protected readonly hudPresenter: GameHudPresenter;
  protected readonly combat: GameCombat;
  protected readonly worldFlow: GameWorldFlow;
  readonly tutorial: TutorialDirector;
  protected hangarBay: HangarBay | null = null;
  protected readonly hangarVisor: HangarVisor;
  readonly radar: Radar3D;
  player!: PlayerShip;
  playerShield!: ShieldFx;
  enemies: EnemyShip[] = [];
  turrets: Turret[] = [];
  protected capitalTurrets: Turret[] = [];
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
  protected readonly warp = new WarpTunnel();
  protected tradeScreen: TradeScreen | null = null;
  /** Non-null while landed on a planet (the "dungeon"). */
  surface: PlanetSurface | null = null;

  /** The active collidable world: planet surface when landed, else the field. */
  protected get world(): {
    bodies: AsteroidBody[];
    destroyRock(body: AsteroidBody): void;
    depleteOre(body: AsteroidBody): void;
    spawnChild(
      position: Vector3,
      radius: number,
      rng: Rng,
      palette?: number,
      motion?: ChildAsteroidMotion,
    ): AsteroidBody | null;
  } {
    return this.surface ?? this.sector.asteroids;
  }

  protected readonly terrainProjectileHit = (
    from: Vector3,
    to: Vector3,
    out: Vector3,
  ): boolean => this.surface?.segmentTerrainHit(from, to, out) ?? false;

  protected readonly questBeacons = new Map<number, Group>();
  readonly meta: MetaProgress;
  protected readonly pulses = new PulseRing();
  protected readonly cloakVisual = new CloakVisual();
  /** Loot under the boresight this frame ('stash' | 'vein' | null). */
  protected lootAimed: 'stash' | 'vein' | null = null;
  /** Exact world-space vein point used to attach the contextual prompt. */
  protected lootAimPoint: Vector3 | null = null;
  /** Owning vein body: all its crystals share one prompt + smoothing key. */
  protected lootAimBody: AsteroidBody | null = null;

  /** Kept as a property for the smoke harness's render-resource assertion. */
  get cloakShellMat() {
    return this.cloakVisual.rimMaterial;
  }

  protected legacy: LegacyScreen | null = null;
  protected readonly storyFired = new Set<string>();
  /** Scratch: every hostile hull (enemies + turrets + capital), per frame. */
  protected readonly hostiles: Ship[] = [];
  /** Auto-pause suppression window after closing an overlay (ms clock). */
  protected autoPauseGraceUntil = 0;
  /** Scratch: everything player bolts can hit (hostiles + neutrals). */
  protected readonly shootables: Ship[] = [];
  protected trailAccum = 0;

  /** Query live populations directly so overlay actions never depend on frame scratch lists. */
  protected hasNearbyHostile(range: number): boolean {
    const rangeSq = range * range;
    const nearby = (ship: Ship): boolean =>
      ship.alive && ship.position.distanceToSquared(this.player.position) < rangeSq;
    return this.enemies.some(nearby) || this.turrets.some(nearby) ||
      (!!this.capital && nearby(this.capital));
  }

  readonly renderer;
  protected readonly uiRoot: HTMLElement;
  /** Public for the test harness (controls-screen staging). */
  menu: MainMenu | null = null;
  protected hangar: HangarScreen | null = null;
  protected pauseMenu: PauseMenu | null = null;
  protected loadout: LoadoutScreen | null = null;
  protected gameOverScreen: GameOverScreen | null = null;
  protected deathTimer = -1;
  protected readonly headless: boolean;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, options: GameOptions) {
    this.headless = options.headless;
    this.uiRoot = uiRoot;
    this.meta = new MetaProgress(!options.headless);
    const preferences = loadHangarPreferences({
      shipId: this.selectedShipId,
      difficultyId: this.selectedDifficultyId,
    });
    this.selectedShipId = preferences.shipId;
    this.selectedDifficultyId = preferences.difficultyId;
    this.difficulty = getDifficulty(preferences.difficultyId);

    this.rng = new Rng(options.seed);
    this.renderer = createRenderer(canvas);
    this.chaseCam = new ChaseCamera(window.innerWidth / window.innerHeight);
    this.hangarVisor = new HangarVisor(
      canvas,
      uiRoot,
      this.chaseCam.camera,
      () => this.state === 'hangar',
    );

    const sectorRng = this.rng.fork();
    this.sector = new Sector(this.scene, sectorRng.fork());
    this.postFx = new PostFx(this.renderer, this.scene, this.chaseCam.camera);

    this.particles = new ParticleSystem();
    this.scene.add(this.particles.points);
    this.explosions = new ExplosionSystem(this.particles, this.rng.fork());
    this.scene.add(this.explosions.group);
    this.projectiles = new ProjectileSystem(this.particles);
    this.scene.add(this.projectiles.group);
    this.pickups = new PickupSystem();
    this.scene.add(this.pickups.group);
    this.rng.fork(); // Preserve the former debris RNG slot for seeded world stability.
    this.shipDebris = new ShipDebris();
    this.scene.add(this.shipDebris.group);
    this.scene.add(this.pulses.group);
    // The warp tunnel rides the camera, which must be in the scene graph for
    // its children to render.
    this.scene.add(this.chaseCam.camera);
    this.chaseCam.camera.add(this.warp.group);

    this.createPlayer(this.selectedShipId);

    this.weapons = new WeaponSystem(this.projectiles, this.particles, {
      onPrimaryShot: (weapon) => {
        this.breakCloakOnFire();
        if (weapon.id === 'pulse') this.audio.laser();
        else if (weapon.id === 'autogun') this.audio.laser(0.35);
        else if (weapon.id === 'scatter') this.audio.scatter();
        else this.audio.lance();
        this.chaseCam.addTrauma(weapon.id === 'autogun' ? 0.025 : 0.06);
      },
      onMissileShot: () => {
        this.breakCloakOnFire();
        this.audio.missileLaunch();
      },
      onWeaponSwitched: (weapon) => {
        this.audio.uiClick();
        this.events.emit('weapon-switched', { name: weapon.name });
      },
    });

    this.voice.muted = options.headless;
    this.hud = new Hud(uiRoot);
    this.input = new Input(canvas);
    this.touchControls = new TouchControls(uiRoot, this.input);
    this.loop = new GameLoop((dt, elapsed, wallDt) => this.tick(dt, elapsed, wallDt));

    const game = this;
    this.hudPresenter = new GameHudPresenter({
      hud: this.hud,
      chaseCam: this.chaseCam,
      loop: this.loop,
      targeting: this.targeting,
      weapons: this.weapons,
      projectiles: this.projectiles,
      get player() {
        return game.player;
      },
      get shootables() {
        return game.shootables;
      },
      get quests() {
        return game.quests;
      },
      get inventory() {
        return game.inventory;
      },
      get devices() {
        return game.devices;
      },
      get neutrals() {
        return game.neutrals;
      },
      get encounters() {
        return game.encounters;
      },
      get surface() {
        return game.surface;
      },
      get pendingOffer() {
        return game.pendingOffer;
      },
      get lootAimed() {
        return game.lootAimed;
      },
      get lootAimPoint() {
        return game.lootAimPoint;
      },
      get lootAimBody() {
        return game.lootAimBody;
      },
      get score() {
        return game.score;
      },
      get sectorIndex() {
        return game.sectorIndex;
      },
      get jumpSpool() {
        return game.jumpSpool;
      },
      get jumpSuppressed() {
        return game.jumpSuppressed;
      },
      get jumpConsumesFlux() {
        return game.worldFlow.jumpConsumesFlux;
      },
      get navigation() {
        return game.navigation;
      },
      get tutorialStep() {
        return game.tutorial?.active ? game.tutorial.stepId : null;
      },
      findAimedPlanet: () => game.findAimedPlanet(),
      planetPosition: (index) => game.sector.planets[index]?.position ?? null,
      nearestNeutral: () => game.nearestNeutral(),
    });
    this.radar = this.hudPresenter.radar;

    this.combat = new GameCombat({
      scene: this.scene,
      rng: this.rng,
      audio: this.audio,
      projectiles: this.projectiles,
      explosions: this.explosions,
      pickups: this.pickups,
      shipDebris: this.shipDebris,
      chaseCam: this.chaseCam,
      hud: this.hud,
      events: this.events,
      get inventory() {
        return game.inventory;
      },
      get player() {
        return game.player;
      },
      get playerShield() {
        return game.playerShield;
      },
      get world() {
        return game.world;
      },
      get surface() {
        return game.surface;
      },
      get difficulty() {
        return game.difficulty;
      },
      get encounters() {
        return game.encounters;
      },
      get quests() {
        return game.quests;
      },
      get enemies() {
        return game.enemies;
      },
      set enemies(value) {
        game.enemies = value;
      },
      get turrets() {
        return game.turrets;
      },
      set turrets(value) {
        game.turrets = value;
      },
      get capitalTurrets() {
        return game.capitalTurrets;
      },
      set capitalTurrets(value) {
        game.capitalTurrets = value;
      },
      get neutrals() {
        return game.neutrals;
      },
      set neutrals(value) {
        game.neutrals = value;
      },
      get capital() {
        return game.capital;
      },
      set capital(value) {
        game.capital = value;
      },
      get score() {
        return game.score;
      },
      set score(value) {
        game.score = value;
      },
      get jumpSpool() {
        return game.jumpSpool;
      },
      threatScale: () => game.threatScale(),
      cancelJump: (message) => game.cancelJump(message),
      completeQuest: (quest) => game.completeQuest(quest),
      storyComms: (key) => game.storyComms(key),
      flyPickup: (type) => game.hudPresenter.flyPickup(type),
    });

    this.worldFlow = new GameWorldFlow(
      {
        scene: this.scene,
        renderer: this.renderer,
        chaseCam: this.chaseCam,
        audio: this.audio,
        voice: this.voice,
        hud: this.hud,
        input: this.input,
        events: this.events,
        rng: this.rng,
        projectiles: this.projectiles,
        pickups: this.pickups,
        warp: this.warp,
        questBeacons: this.questBeacons,
        get postFx() {
          return game.postFx;
        },
        set postFx(value) {
          game.postFx = value;
        },
        get sector() {
          return game.sector;
        },
        set sector(value) {
          game.sector = value;
        },
        get sectorIndex() {
          return game.sectorIndex;
        },
        set sectorIndex(value) {
          game.sectorIndex = value;
        },
        get jumpSpool() {
          return game.jumpSpool;
        },
        set jumpSpool(value) {
          game.jumpSpool = value;
        },
        get surface() {
          return game.surface;
        },
        set surface(value) {
          game.surface = value;
        },
        get player() {
          return game.player;
        },
        set player(value) {
          game.player = value;
        },
        get difficulty() {
          return game.difficulty;
        },
        set difficulty(value) {
          game.difficulty = value;
        },
        get inventory() {
          return game.inventory;
        },
        set inventory(value) {
          game.inventory = value;
        },
        get encounters() {
          return game.encounters;
        },
        set encounters(value) {
          game.encounters = value;
        },
        get quests() {
          return game.quests;
        },
        set quests(value) {
          game.quests = value;
        },
        get pendingOffer() {
          return game.pendingOffer;
        },
        set pendingOffer(value) {
          game.pendingOffer = value;
        },
        get enemies() {
          return game.enemies;
        },
        set enemies(value) {
          game.enemies = value;
        },
        get turrets() {
          return game.turrets;
        },
        set turrets(value) {
          game.turrets = value;
        },
        get capitalTurrets() {
          return game.capitalTurrets;
        },
        set capitalTurrets(value) {
          game.capitalTurrets = value;
        },
        get neutrals() {
          return game.neutrals;
        },
        set neutrals(value) {
          game.neutrals = value;
        },
        get capital() {
          return game.capital;
        },
        set capital(value) {
          game.capital = value;
        },
        get world() {
          return game.world;
        },
        isPlaying: () => game.state === 'playing',
        clearEntities: () => game.clearEntities(),
        removeQuestBeacon: (id) => game.removeQuestBeacon(id),
        completeQuest: (quest) => game.completeQuest(quest),
        storyComms: (key) => game.storyComms(key),
        clearNavigation: () => game.navigation.clearForWorldSwap(),
      },
      sectorRng,
    );

    this.tutorial = new TutorialDirector(uiRoot, this.voice, {
      get state() { return game.state; },
      get player() { return game.player; },
      get input() { return game.input; },
      get touchControlsEnabled() { return game.touchControls.enabled; },
      get chaseCam() { return game.chaseCam; },
      get targeting() { return game.targeting; },
      get weapons() { return game.weapons; },
      get inventory() { return game.inventory; },
      get devices() { return game.devices; },
      get neutrals() { return game.neutrals; },
      get worldBodies() { return game.world.bodies; },
      get planets() { return game.sector.planets; },
      get surface() { return game.surface; },
      get sectorIndex() { return game.sectorIndex; },
      spawnTrainingTarget: (position) => {
        const target = new EnemyShip('brute', game.rng.fork(), 0);
        target.training = true;
        target.hullMax = target.hull = 280;
        target.shieldMax = target.shield = 90;
        target.position.copy(position);
        target.faceToward(game.player.position);
        game.scene.add(target.object);
        game.enemies.push(target);
        return target;
      },
      removeTrainingTarget: (target) => {
        game.targeting.current = game.targeting.current?.ship === target
          ? null
          : game.targeting.current;
        game.enemies = game.enemies.filter((enemy) => enemy !== target);
        game.scene.remove(target.object);
        target.dispose();
      },
      fireTrainingBurst: (target) => game.combat.trainingFire(target),
      fireTrainingHit: (target, damage) => game.combat.trainingHit(target, damage),
      fireTrainingSeeker: (target) => game.combat.trainingSeeker(target),
      playerSeekerImpacts: (target) => game.combat.playerSeekerImpacts(target),
      releaseTrainingSeekers: () => game.projectiles.releaseIncomingTarget(game.player),
      incomingMissileThreat: () => game.projectiles.incomingThreat(game.player),
      prepareSurfaceMission: () => prepareTutorialSurfaceMission(game),
      setTutorialControls: (gate, preserveHeld) => {
        game.input.setControlGate(gate, preserveHeld);
        game.touchControls.setControlGate(gate);
      },
      stageTutorialScene: (scene) => {
        if (game.state === 'loadout' && scene !== 'loadout') game.closeLoadout();
        if (game.state === 'trade' && scene !== 'trade') game.closeTrade();
        if (game.surface && scene !== 'surface') game.exitPlanet();
        if (scene === 'surface' && !game.surface) game.enterPlanet(0);
        else if (scene === 'loadout' && game.state === 'playing') game.openLoadout();
        else if (scene === 'trade' && game.state === 'playing') game.openTrade();
      },
      setTutorialCloak: (active) => {
        game.devices.cloakActive = active;
        game.devices.cloakCooldown = 0;
        game.cloakVisual.set(game.player, active);
      },
      setTutorialFreeze: (frozen) => {
        game.autoPauseGraceUntil = performance.now() + 1500;
        if (game.state !== 'playing') game.input.exitPointerLock();
        else if (!game.headless) game.input.enterFlightMode();
        if (frozen) game.audio.silenceEngine();
      },
      setTutorialNavigation: (destination) => game.navigation.setTutorial(destination),
      releaseTutorialNavigation: () => game.navigation.releaseTutorial(),
      exitTutorial: () => game.showHangar(),
    });
  }

  abstract get jumpSuppressed(): boolean;
  abstract openLoadout(): void;
  abstract closeLoadout(): void;
  abstract openTrade(): void;
  abstract closeTrade(): void;
  abstract enterPlanet(index: number): void;
  abstract exitPlanet(): void;
  protected abstract createPlayer(shipId: string): void;
  protected abstract breakCloakOnFire(): void;
  protected abstract findAimedPlanet(): number | null;
  protected abstract nearestNeutral(): NeutralShip | null;
  protected abstract threatScale(): number;
  protected abstract rebuildSector(): void;
  protected abstract deploySectorEntities(): void;
  protected abstract placePlayerSafely(): void;
  protected abstract cancelJump(message: string | null): void;
  protected abstract completeQuest(quest: Quest): void;
  protected abstract storyComms(key: string): void;
  protected abstract clearEntities(): void;
  protected abstract removeQuestBeacon(id: number): void;
  protected abstract tick(dt: number, elapsed: number, wallDt?: number): void;
  abstract showHangar(): void;
  abstract spawnEnemy(spec: HunterSpawnSpec): void;
}
