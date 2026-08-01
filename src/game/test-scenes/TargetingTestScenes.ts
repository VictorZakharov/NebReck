import { Vector3 } from 'three';
import type { TargetInfo } from '../../combat/Targeting';
import { Game } from '../Game';
import { jumpToSector2, steps } from './TestSceneShared';

/** Locked hostile, contact brackets, edge markers, radar, and live enemy fire. */
export function stageTargeting(game: Game): void {
  game.startMission();
  jumpToSector2(game);
  const origin = game.player.position;
  const at = (x: number, y: number, z: number): Vector3 =>
    new Vector3(x, y, z).add(origin);
  game.spawnEnemy({ kind: 'raider', position: at(0, 0, -180), aggression: 0 });
  game.spawnEnemy({ kind: 'brute', position: at(-250, 40, 200), aggression: 0 });
  game.spawnEnemy({ kind: 'raider', position: at(0, 260, -60), aggression: 0 });
  game.spawnEnemy({ kind: 'raider', position: at(85, 22, -190), aggression: 1 });
  game.spawnEnemy({ kind: 'brute', position: at(-130, 60, -700), aggression: 0 });
  for (const enemy of game.enemies) if (enemy.hunter) enemy.faceToward(game.player.position);
  steps(game, 80);
}

/** Distant reticle ranking: 1,847 m centred beats 1,444 m off-axis. */
export function stageDistantTargeting(game: Game): void {
  game.startMission();
  game.hud.clearComms();
  const player = game.player;
  player.object.rotation.set(0, 0, 0);
  player.velocity.set(0, 0, 0);
  game.spawnEnemy({ kind: 'raider', position: player.position.clone(), aggression: 0 });
  game.spawnEnemy({ kind: 'brute', position: player.position.clone(), aggression: 0 });
  steps(game, 1); // Populate the HUD contact list with both staged ships.
  const [centred, offAxis] = game.enemies.slice(-2);
  game.chaseCam.snapTo(player.object);
  game.chaseCam.camera.updateMatrixWorld(true);
  const forward = new Vector3();
  game.chaseCam.camera.getWorldDirection(forward);
  const right = forward.clone().cross(new Vector3(0, 1, 0)).normalize();
  centred.position.copy(player.position).addScaledVector(forward, 1847);
  offAxis.position.copy(player.position)
    .addScaledVector(forward, 1435)
    .addScaledVector(right, 160);
  centred.faceToward(player.position);
  offAxis.faceToward(player.position);
  game.targeting.current = null;
  game.targeting.update(
    player,
    [centred, offAxis],
    [],
    game.weapons.weapon.projectileSpeed,
    game.weapons.weapon.projectileSpeed * game.weapons.weapon.life,
    forward,
    false,
  );
  game.state = 'test';
  game.renderHudOnce();
}

/** Peaceful crosshair inspection of a dormant independent turret. */
export function stageTurretTargeting(game: Game): void {
  game.startMission();
  jumpToSector2(game);
  game.hud.clearComms();
  const turret = game.turrets.find((candidate) =>
    candidate.mountNormal === null
  );
  if (!turret) throw new Error('turret-targeting scene expects an independent turret');
  const player = game.player;
  player.position.set(0, 2600, 0);
  player.object.rotation.set(0, 0, 0);
  player.velocity.set(0, 0, 0);
  for (const enemy of game.enemies) enemy.position.set(4000, 3000, 4000);
  game.chaseCam.snapTo(player.object);
  game.chaseCam.camera.updateMatrixWorld(true);
  const forward = new Vector3();
  game.chaseCam.camera.getWorldDirection(forward);
  turret.position.copy(player.position).addScaledVector(forward, 600);
  turret.faceToward(player.position);
  turret.stunTimer = 10;
  game.targeting.current = null;
  steps(game, 1);
  const selected = game.targeting.current as TargetInfo | null;
  if (selected?.ship !== turret) {
    throw new Error('peaceful crosshair scan did not select the staged turret');
  }
  game.state = 'test';
  game.renderHudOnce();
}

/** Nose-on carrier readout remains recognizable instead of collapsing to a dot. */
export function stageCapitalTargeting(game: Game): void {
  game.startMission();
  jumpToSector2(game);
  game.hud.clearComms();
  const capital = game.capital;
  if (!capital) throw new Error('capital-targeting scene expects a carrier');
  const forward = new Vector3();
  capital.forward(forward);
  game.player.position.copy(capital.position).addScaledVector(forward, 700);
  game.player.faceToward(capital.position);
  game.player.velocity.set(0, 0, 0);
  game.chaseCam.snapTo(game.player.object);
  game.targeting.current = {
    ship: capital, leadPoint: capital.position.clone(), distance: 700, aimAssist: true,
  };
  game.state = 'test';
  game.renderHudOnce();
}

/** Civilian fallback lock: friendly merchant wireframe, never aim assist. */
export function stageFriendlyTargeting(game: Game): void {
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
  );
  game.renderHudOnce();
  game.state = 'test';
  steps(game, 2);
}

/** Mineable formation under the crosshair: informational wireframe, never aim assist. */
export function stageResourceTargeting(game: Game): void {
  game.startMission();
  game.hud.clearComms();
  const body = game.sector.asteroids.bodies.find((candidate) => candidate.orePoints.length > 0);
  if (!body) throw new Error('resource-targeting scene expects an ore formation');
  const point = body.orePoints[0];
  const outward = point.clone().sub(body.position).normalize();
  game.player.position.copy(point).addScaledVector(outward, 120);
  game.player.velocity.set(0, 0, 0);
  game.player.throttle = 0;
  game.player.faceToward(point);
  game.chaseCam.snapTo(game.player.object);
  steps(game, 2);
  game.state = 'test';
}
