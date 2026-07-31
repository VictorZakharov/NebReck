import { Color, Vector3 } from 'three';
import { buildShipMesh } from '../entities/ShipMesh';
import { Game } from './Game';

declare global {
  interface Window {
    __RENDER_DONE__?: boolean;
  }
}

const STEP = 1 / 60;

/** Instant jump into sector 2 (sector 1 is peaceful — no hostiles to stage). */
function jumpToSector2(game: Game): void {
  game.inventory.add('flux', 2);
  game.startJump(true); // auto: skips the hold-J requirement
  game.jumpSpool = 0.0001;
  steps(game, 2);
  game.settleWarpFx(); // no lingering streaks in the staged capture
}

/**
 * Deterministic scenes for the visual regression harness. Each scene stages
 * a fixed state (same seed → same world), advances simulation by an exact
 * number of fixed steps via GameLoop.stepManual, then raises the
 * __RENDER_DONE__ flag the Playwright capture script waits on.
 *
 * DOM animations are frozen (paused at t=1s) so CSS-driven UI is also
 * pixel-stable.
 */
export function runTestScene(game: Game, name: string): void {
  freezeCssAnimations();

  switch (name) {
    case 'nebula':
      stageNebula(game);
      break;
    case 'ship':
      stageShip(game);
      break;
    case 'asteroids':
      stageAsteroids(game);
      break;
    case 'combat':
      stageCombat(game);
      break;
    case 'hud':
      stageHud(game);
      break;
    case 'menu':
      stageMenu(game);
      break;
    case 'cockpit':
      stageCockpit(game);
      break;
    case 'hangar':
      stageHangar(game);
      break;
    case 'loadout':
      stageLoadout(game);
      break;
    case 'boost':
      stageBoost(game);
      break;
    case 'targeting':
      stageTargeting(game);
      break;
    case 'friendly-targeting':
      stageFriendlyTargeting(game);
      break;
    case 'fx':
      stageFx(game);
      break;
    case 'cave':
      stageCave(game);
      break;
    case 'split':
      stageSplit(game);
      break;
    case 'level':
      stageLevel(game);
      break;
    case 'wreck':
      stageWreck(game);
      break;
    case 'planet':
      stagePlanet(game);
      break;
    case 'base':
      stageBase(game);
      break;
    case 'trade':
      stageTrade(game);
      break;
    case 'fleet':
      stageFleet(game);
      break;
    case 'cloak':
      stageCloak(game);
      break;
    case 'controls':
      stageControls(game);
      break;
    default:
      throw new Error(`Unknown test scene: ${name}`);
  }

  window.__RENDER_DONE__ = true;
}

function steps(game: Game, n: number): void {
  for (let i = 0; i < n; i++) game.loop.stepManual(STEP);
}

/** Skybox + starfield + a half-clipped sun: guards extended-emitter fragments. */
function stageNebula(game: Game): void {
  game.state = 'test';
  game.player.object.visible = false;
  // Keep this a solar-corona test rather than letting seeded foreground
  // scenery accidentally cover the whole star.
  for (const mesh of game.sector.asteroids.meshes) mesh.visible = false;
  for (const group of game.sector.planetGroups) group.visible = false;
  for (const cave of game.sector.caves) cave.group.visible = false;
  for (const wreck of game.sector.wrecks) wreck.group.visible = false;

  const cam = game.chaseCam.camera;
  cam.position.set(0, 0, 0);
  const sunDir = game.sector.sun.group.position.clone().normalize();
  const upHint = Math.abs(sunDir.y) > 0.9
    ? new Vector3(0, 0, 1)
    : new Vector3(0, 1, 0);
  const right = new Vector3().crossVectors(sunDir, upHint).normalize();
  const halfVerticalFov = (cam.fov * Math.PI) / 360;
  const edgeYaw = Math.atan(1.03 * Math.tan(halfVerticalFov) * cam.aspect);
  const viewDir = sunDir
    .clone()
    .multiplyScalar(Math.cos(edgeYaw))
    .addScaledVector(right, -Math.sin(edgeYaw));
  cam.lookAt(viewDir);
  steps(game, 3);
}

/** Player ship beauty shot with engine glow. */
function stageShip(game: Game): void {
  game.state = 'test';
  game.player.object.position.set(0, 0, 0);
  game.player.object.rotation.set(0.1, 2.6, 0.06);
  game.player.throttle = 0.85;
  const cam = game.chaseCam.camera;
  cam.position.set(4.0, 1.9, 5.4);
  cam.lookAt(0, 0, 0);
  steps(game, 3);
}

/** Inside the asteroid belt looking across it. */
function stageAsteroids(game: Game): void {
  game.state = 'test';
  game.player.object.visible = false;
  const cam = game.chaseCam.camera;
  cam.position.set(140, 30, 140);
  cam.lookAt(500, -40, 300);
  steps(game, 3);
}

/** Staged battle frame: enemies, bolts in flight, an explosion mid-bloom, shield flare. */
function stageCombat(game: Game): void {
  game.state = 'test';
  const player = game.player;
  player.object.position.set(0, 0, 0);
  player.object.rotation.set(0, 0, 0);
  player.throttle = 0.6;

  const cam = game.chaseCam.camera;
  cam.position.set(0, 4.2, 13);
  cam.lookAt(0, 0, -30);

  game.spawnEnemy({ kind: 'raider', position: new Vector3(-14, 3, -55), aggression: 0 });
  game.spawnEnemy({ kind: 'raider', position: new Vector3(20, -4, -70), aggression: 0 });
  game.spawnEnemy({ kind: 'brute', position: new Vector3(4, 8, -95), aggression: 0 });
  for (const e of game.enemies) e.faceToward(player.position);

  // Bolts frozen mid-flight (projectile system doesn't tick in 'test' state).
  const cyan = new Color(0.25, 0.9, 1.0);
  for (let i = 0; i < 3; i++) {
    game.projectiles.spawnBolt({
      position: new Vector3(-1 + i * 1.2, -0.2, -12 - i * 9),
      direction: new Vector3(0.12, 0.04, -1).normalize(),
      speed: 0,
      damage: 0,
      faction: 'player',
      color: cyan,
      boltLength: 4.2,
      boltWidth: 0.16,
      life: 10,
    });
  }

  game.explosions.spawn(new Vector3(-16, 2, -48), 1.3);
  game.playerShield.hit(new Vector3(2, 1, -2));
  steps(game, 8); // explosion flash + ring mid-animation
}

/** Full HUD over a live mission frame, jump drive mid-spool. */
function stageHud(game: Game): void {
  game.startMission();
  game.inventory.add('flux', 2);
  game.startJump(true);
  game.jumpSpool = 2.5; // freeze the spool at 50% for the capture
  // Contract tracker content + a pending offer under review (both
  // deterministic from the quests rng stream).
  game.quests.accept(game.quests.generateOffer(1, game.player.position));
  game.pendingOffer = game.quests.generateOffer(1, game.player.position);
  game.hud.showBanner('Vigil hunters inbound');
  steps(game, 10);
}

/** Main menu over the idling sector backdrop. */
function stageMenu(game: Game): void {
  game.showMenu();
  steps(game, 3);
}

/** First-person view: cockpit with live console displays + HUD. */
function stageCockpit(game: Game): void {
  game.startMission();
  game.chaseCam.mode = 'first';
  game.chaseCam.snapTo(game.player.object);
  steps(game, 8);
}

/** Ship + difficulty selection screen. */
function stageHangar(game: Game): void {
  game.showMenu();
  game.showHangar();
  steps(game, 3);
}

/** Engineering screen with a non-trivial wallet so chips/buttons show states. */
function stageLoadout(game: Game): void {
  game.startMission();
  game.inventory.add('scrap', 9);
  game.inventory.add('crystal', 6);
  game.inventory.add('flux', 1);
  game.openLoadout();
  steps(game, 3);
}

/** Camera framing at full boost: the ship must stay LARGE and close. */
function stageBoost(game: Game): void {
  game.startMission();
  game.state = 'test';
  game.player.throttle = 1;
  // Let the chase camera settle into its boost distance/FOV.
  for (let i = 0; i < 90; i++) {
    game.chaseCam.update(STEP, game.player.object, 1, true);
  }
  game.renderHudOnce();
  steps(game, 2);
}

/** Reticle range chip, on-screen contact brackets, edge markers, radar,
 *  and LIVE ENEMY FIRE. Enemy A dead ahead (locked), B behind-left (edge),
 *  C above (edge), D on-screen right + aggressive (bracket + shooting). */
function stageTargeting(game: Game): void {
  game.startMission();
  jumpToSector2(game); // hostile sector: turrets/patrols/capital all live
  // Player-relative placement — the safe-spawn solver moves the start point.
  const P = game.player.position;
  const at = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z).add(P);
  game.spawnEnemy({ kind: 'raider', position: at(0, 0, -180), aggression: 0 });
  game.spawnEnemy({ kind: 'brute', position: at(-250, 40, 200), aggression: 0 });
  game.spawnEnemy({ kind: 'raider', position: at(0, 260, -60), aggression: 0 });
  game.spawnEnemy({ kind: 'raider', position: at(85, 22, -190), aggression: 1 });
  // E: on screen but beyond pulse-cannon reach → must render as a GREY contact.
  game.spawnEnemy({ kind: 'brute', position: at(-130, 60, -700), aggression: 0 });
  for (const e of game.enemies) if (e.hunter) e.faceToward(game.player.position);
  // Long enough for D to align and open fire — bolts must be visible.
  steps(game, 80);
}

/** Civilian fallback lock: green merchant wireframe/contact box, no lead pip. */
function stageFriendlyTargeting(game: Game): void {
  game.startMission();
  game.hud.clearComms();
  const merchant = game.neutrals.find((neutral) => neutral.isMerchant);
  if (!merchant) throw new Error('friendly-targeting scene expects a merchant');
  const origin = game.player.position.clone();
  game.player.object.rotation.set(0, 0, 0);
  game.player.velocity.set(0, 0, 0);
  merchant.object.position.copy(origin).add(new Vector3(0, 0, -145));
  merchant.velocity.set(0, 0, 0);
  merchant.faceToward(origin.clone().add(new Vector3(120, 0, -300)));
  for (const neutral of game.neutrals) {
    if (neutral !== merchant) neutral.object.position.copy(origin).add(new Vector3(320, 30, -400));
  }
  game.chaseCam.snapTo(game.player.object);
  game.chaseCam.camera.updateMatrixWorld(true);
  game.targeting.update(
    game.player,
    [],
    [merchant],
    game.weapons.weapon.projectileSpeed,
    () => true,
  );
  game.renderHudOnce();
  game.state = 'test';
  steps(game, 2);
}

/** FX quality plate: explosions at two life stages, exhaust trail, debris. */
function stageFx(game: Game): void {
  game.state = 'test';
  game.player.object.visible = false;
  const cam = game.chaseCam.camera;
  cam.position.set(0, 3, 12);
  cam.lookAt(0, 0, -60);

  game.explosions.spawn(new Vector3(-24, 6, -80), 1.8);
  game.debris.spawn(new Vector3(-24, 6, -80), 14, game.rng);
  steps(game, 16);
  game.explosions.spawn(new Vector3(4, -1, -42), 1.1);
  // Fake a missile exhaust arc.
  const p = new Vector3();
  const v = new Vector3(0, 0, 0);
  for (let i = 0; i < 26; i++) {
    p.set(-18 + i * 1.3, 4 - Math.sin(i * 0.24) * 3.5, -55 + i * 0.6);
    game.particles.spawn({
      position: p,
      velocity: v,
      color: new Color(1.0, 0.85, 0.3),
      size: 1.5,
      life: 2,
    });
  }
  steps(game, 9);
}

/** Inside a hollow cave asteroid: boulders, crystals, stash, turret. */
function stageCave(game: Game): void {
  game.startMission();
  game.state = 'test';
  game.hud.clearComms();
  game.player.object.visible = false;
  const cave = game.sector.caves[0];
  const cam = game.chaseCam.camera;
  cam.position.copy(cave.center).add(new Vector3(6, 4, 30));
  cam.lookAt(cave.center);
  steps(game, 4);
}

/** A big rock mid-shatter: child rocks + debris + explosion. */
function stageSplit(game: Game): void {
  game.state = 'test';
  game.player.object.visible = false;
  const rock = game.sector.asteroids.bodies
    .filter((b) => !b.hero && !b.solo && b.radius >= 12)
    .sort((a, b) => b.radius - a.radius)[0];

  const cam = game.chaseCam.camera;
  cam.position.copy(rock.position).add(new Vector3(0, rock.radius * 0.8, rock.radius * 3.2));
  cam.lookAt(rock.position);

  // Mirror the gameplay shatter flow deterministically.
  game.sector.asteroids.destroyRock(rock);
  for (let i = 0; i < 3; i++) {
    const [dx, dy, dz] = game.rng.unitSphere();
    game.sector.asteroids.spawnChild(
      new Vector3(dx, dy, dz).multiplyScalar(rock.radius * 0.55).add(rock.position),
      rock.radius * game.rng.range(0.32, 0.48),
      game.rng,
      rock.palette,
    );
  }
  game.debris.spawn(rock.position, rock.radius, game.rng);
  game.explosions.spawn(rock.position, 1.8);
  steps(game, 10);
}

/** The populated level's set-piece: capital ship with turret batteries, and
 *  a neutral hauler staged into frame so both large hulls are documented. */
function stageLevel(game: Game): void {
  game.startMission();
  jumpToSector2(game); // the capital only exists in hostile sectors
  game.state = 'test';
  game.player.object.visible = false;
  const cap = game.capital;
  if (!cap) throw new Error('level scene expects a capital ship');
  const hauler = game.neutrals[0];
  hauler.object.position.copy(cap.position).add(new Vector3(-48, 12, 28));
  hauler.faceToward(cap.position.clone().add(new Vector3(250, 0, 350)));
  // Shoot from the sun side so the hull is lit — but pick the first camera
  // direction whose sightline to the capital no asteroid blocks.
  const toSun = game.sector.sun.group.position.clone().sub(cap.position).normalize();
  const up = new Vector3(0, 1, 0);
  const side = new Vector3().crossVectors(toSun, up).normalize();
  const candidates = [toSun, side, side.clone().negate(), toSun.clone().negate()];
  const clear = (dir: Vector3): boolean => {
    for (let d = 10; d <= 100; d += 15) {
      const p = cap.position.clone().addScaledVector(dir, d);
      for (const b of game.sector.asteroids.bodies) {
        if (!b.destroyed && b.radius > 8 && b.position.distanceTo(p) < b.radius + 12) return false;
      }
    }
    return true;
  };
  const viewDir = candidates.find(clear) ?? toSun;
  const cam = game.chaseCam.camera;
  cam.position.copy(cap.position).addScaledVector(viewDir, 95).add(new Vector3(0, 26, 0));
  cam.lookAt(cap.position);
  steps(game, 30); // long enough for arrival aberration to settle
}

/** A derelict wreck site: dead hulk + blinking blackbox. */
function stageWreck(game: Game): void {
  game.startMission();
  game.state = 'test';
  game.player.object.visible = false;
  const wreck = game.sector.wrecks[0];
  const toSun = game.sector.sun.group.position.clone().sub(wreck.center).normalize();
  const cam = game.chaseCam.camera;
  cam.position.copy(wreck.center).addScaledVector(toSun, 26).add(new Vector3(8, 7, 0));
  cam.lookAt(wreck.center);
  steps(game, 4);
}

/** The planetary dungeon: outside approach looking through a natural arch. */
function stagePlanet(game: Game): void {
  game.startMission();
  game.enterPlanet(0);
  const cave = game.surface!.caveLandmarks[0];
  game.player.object.position.copy(cave.approach);
  game.player.faceToward(cave.route[1]);
  game.chaseCam.snapTo(game.player.object);
  game.hud.clearComms();
  steps(game, 12);
}

/** A Vigil ground base close-up: apron, windows, pipes, pad, rooftop guns.
 *  Guards the "bases don't look like real bases" and "rooftop turrets shoot
 *  their own building" reports — turrets are staged mid-track on the player. */
function stageBase(game: Game): void {
  game.startMission();
  game.enterPlanet(0);
  const marks = game.surface!.baseLandmarks;
  // Prefer the compound template — three rooftop turrets, the exact
  // geometry of the "turrets shoot their own roof" report.
  const base = marks.find((b) => b.kind === 'compound') ?? marks[0];
  const c = base.center;
  // Player hovers near-level with the rooftops ~120 m out (the Image #15
  // geometry) so the turrets swivel onto a shallow-elevation target.
  game.player.object.position.set(c.x + 110, c.y + 26, c.z + 95);
  game.player.faceToward(c);
  game.chaseCam.snapTo(game.player.object);
  steps(game, 100); // turrets acquire + open fire; bolts must clear the roofline
  // Freeze and reframe from the side: base + player + bolts all in shot.
  game.state = 'test';
  game.hud.clearComms();
  const cam = game.chaseCam.camera;
  cam.position.set(c.x + 62, c.y + 34, c.z + 104);
  cam.lookAt(c.x, c.y + 8, c.z);
  steps(game, 2);
}

/** All three playable hulls from the low rear-quarter angle — the angle
 *  where floating plates/fins ("ship slop") show. Pairs with the smoke
 *  test's geometric connectivity audit. */
function stageFleet(game: Game): void {
  game.startMission();
  game.state = 'test';
  game.hud.setVisible(false); // pure beauty plate — no HUD, no clutter
  game.player.object.visible = false;
  const kinds = ['kestrel', 'vanta', 'aegis'] as const;
  const Y = 2600; // high above the asteroid field plane
  kinds.forEach((k, i) => {
    const m = buildShipMesh(k);
    m.group.position.set((i - 1) * 8, Y, -4);
    m.group.rotation.y = 0.65;
    game.scene.add(m.group);
  });
  // CLOSE low rear-quarter: near enough that a detached plate or floating
  // tip accent is visible — the angle+range where slop reports came from.
  const cam = game.chaseCam.camera;
  cam.position.set(-3.2, Y - 2.4, 5.2);
  cam.lookAt(1.2, Y + 0.1, -4.2);
  steps(game, 3);
}

/** Controls screen: two panes, keycap chips, mouse glyphs. */
function stageControls(game: Game): void {
  game.showMenu();
  game.menu!.showControls();
  steps(game, 3);
}

/** Cloak engaged: hull shimmer ripple + refraction sparks, mid-phase. */
function stageCloak(game: Game): void {
  game.startMission();
  game.hud.clearComms();
  game.activateCloak();
  steps(game, 30);
}

/** Merchant trade screen: item icons, offer rows, close button. */
function stageTrade(game: Game): void {
  game.startMission();
  game.inventory.add('scrap', 14);
  game.inventory.add('crystal', 7);
  game.inventory.add('flux', 2);
  game.openTrade();
  steps(game, 3);
}

/** Pause all CSS animations at t=1s and kill transitions → pixel-stable DOM. */
function freezeCssAnimations(): void {
  const style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after {
      animation-delay: -1s !important;
      animation-play-state: paused !important;
      transition: none !important;
    }
  `;
  document.head.appendChild(style);
}
