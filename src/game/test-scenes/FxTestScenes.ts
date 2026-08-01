import { Vector3 } from 'three';
import { Game } from '../Game';
import { steps } from './TestSceneShared';

/** Laser, missile, and mature ship-destruction effects in one deterministic plate. */
export function stageFx(game: Game): void {
  prepareFxStage(game, false);
  const camera = game.chaseCam.camera;
  camera.position.set(0, 4, 16);
  camera.lookAt(0, 0, -52);

  const shipBlast = new Vector3(-20, 4, -66);
  game.player.object.position.copy(shipBlast);
  game.explosions.spawn(shipBlast, 1.75, 'ship');
  game.shipDebris.spawn(game.player.object, game.player.velocity, 13, game.rng);
  steps(game, 62);

  game.explosions.spawn(new Vector3(0, -1, -49), 1.15, 'missile');
  steps(game, 18);
  game.explosions.spawn(new Vector3(18, 4, -42), 0.5, 'impact');
  steps(game, 5);
}

/** Camera embedded in the navigable soot volume after the fireball has faded. */
export function stageSmokeVolume(game: Game): void {
  prepareFxStage(game, false);
  const camera = game.chaseCam.camera;
  camera.position.set(0, 1, 0);
  camera.lookAt(0, 0, -24);
  game.explosions.spawn(new Vector3(0, 0, -10), 1.8, 'ship');
  steps(game, 105);
}

/** Oblique view proving the hot core and shock fronts are true 3D geometry. */
export function stageFxVolume(game: Game): void {
  prepareFxStage(game, false);
  const origin = new Vector3(0, 0, -38);
  const camera = game.chaseCam.camera;
  camera.position.set(24, 11, 8);
  camera.lookAt(origin);
  game.player.object.position.copy(origin);
  game.explosions.spawn(origin, 1.7, 'ship');
  game.shipDebris.spawn(game.player.object, game.player.velocity, 10, game.rng);
  steps(game, 16);
}

/** The shield shell exists only on the hit hemisphere and carries an expanding ripple. */
export function stageShieldImpact(game: Game): void {
  prepareFxStage(game, false);
  const player = game.player;
  player.object.visible = true;
  player.object.position.set(0, 0, -4);
  player.object.rotation.set(0.04, 0, -0.05);
  player.throttle = 0.35;
  const camera = game.chaseCam.camera;
  camera.position.set(0, 2.7, 8.5);
  camera.lookAt(player.position);

  const impact = new Vector3(player.radius * 1.45, 0.45, 0);
  player.object.localToWorld(impact);
  game.playerShield.hit(impact);
  steps(game, 9);
}

/** A heavy hull hit freezes the deterministic positional and rotational camera kick. */
export function stageDamageShake(game: Game): void {
  prepareFxStage(game, true);
  const player = game.player;
  player.object.visible = true;
  player.object.position.set(0, 0, -6);
  player.object.rotation.set(0.08, 2.75, 0.08);
  player.throttle = 0.8;
  game.chaseCam.mode = 'third';
  game.chaseCam.snapTo(player.object);
  game.chaseCam.addDamageShake(72, false);
  game.chaseCam.update(1 / 60, player.object, 0.7, false);
  game.hud.flashDamage(0.78);
  game.explosions.spawn(new Vector3(-2.2, 0.6, -6), 0.1, 'impact');
  steps(game, 2);
}

function prepareFxStage(game: Game, showHud: boolean): void {
  game.state = 'test';
  game.hud.setVisible(showHud);
  game.player.object.visible = false;
  for (const mesh of game.sector.asteroids.meshes) mesh.visible = false;
  for (const group of game.sector.planetGroups) group.visible = false;
  for (const cave of game.sector.caves) cave.group.visible = false;
  for (const wreck of game.sector.wrecks) wreck.group.visible = false;
}
