import { Color, Vector3 } from 'three';
import { Rng } from '../../core/Rng';
import { EnemyShip } from '../../entities/EnemyShip';
import { Turret } from '../../entities/Turret';
import { Game } from '../Game';
import { jumpToSector2, steps, TEST_STEP } from './TestSceneShared';

/** Staged battle frame with fighters, frozen bolts, an explosion, and shield flare. */
export function stageCombat(game: Game): void {
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
  for (const enemy of game.enemies) enemy.faceToward(player.position);

  const cyan = new Color(0.25, 0.9, 1.0);
  for (let index = 0; index < 3; index++) {
    game.projectiles.spawnBolt({
      position: new Vector3(-1 + index * 1.2, -0.2, -12 - index * 9),
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
  steps(game, 8);
}

/** Distinct Vigil silhouettes, rotary guns, and both rocket families on one beauty plate. */
export function stageEnemyVariety(game: Game): void {
  game.state = 'test';
  game.hud.setVisible(false);
  game.player.object.visible = false;
  for (const group of game.sector.planetGroups) group.visible = false;
  const y = 2200;
  const rng = new Rng(7301);
  const ships = [
    new EnemyShip('raider', rng.fork(), 0),
    new EnemyShip('raider', rng.fork(), 0, 1, [], 'autogun'),
    new EnemyShip('brute', rng.fork(), 0),
    new EnemyShip('bomber', rng.fork(), 0, 1, [], 'homing'),
    new EnemyShip('bomber', rng.fork(), 0, 1, [], 'fast'),
  ];
  ships.forEach((ship, index) => {
    ship.position.set((index - 2) * 6.2, y + (index % 2) * 1.2, -24 - index * 0.8);
    ship.object.rotation.set(-0.08, 2.7, index % 2 ? -0.08 : 0.08);
    ship.throttle = 0.75;
    game.scene.add(ship.object);
  });
  const gun = new Turret(rng.fork(), 'bolt');
  const rotary = new Turret(rng.fork(), 'autogun');
  const rockets = new Turret(rng.fork(), 'homing');
  gun.position.set(-7.5, y - 5, -21);
  rotary.position.set(0, y - 5, -21);
  rockets.position.set(7.5, y - 5, -21);
  gun.object.rotation.y = 2.7;
  rotary.object.rotation.y = 2.7;
  rockets.object.rotation.y = 2.7;
  game.scene.add(gun.object, rotary.object, rockets.object);
  game.projectiles.spawnEnemyRocket(
    new Vector3(-7, y + 4.5, -25),
    new Vector3(0.15, 0.02, 1),
    game.player,
    'homing',
  );
  game.projectiles.spawnEnemyRocket(
    new Vector3(7, y + 4.5, -26),
    new Vector3(-0.1, 0.04, 1),
    game.player,
    'fast',
  );
  const cam = game.chaseCam.camera;
  cam.position.set(0, y + 1, -5);
  cam.lookAt(0, y - 0.5, -24);
  steps(game, 3);
}

/** Locked seeker close enough to exercise the imminent-impact treatment. */
export function stageMissileWarning(game: Game): void {
  game.startMission();
  game.state = 'test';
  game.hud.clearComms();
  game.player.position.set(0, 2200, 0);
  game.player.object.rotation.set(0, 0, 0);
  game.player.velocity.set(0, 0, 0);
  game.chaseCam.snapTo(game.player.object);
  const missilePos = game.player.position.clone().add(new Vector3(0, 1.5, -155));
  game.projectiles.spawnEnemyRocket(
    missilePos,
    game.player.position.clone().sub(missilePos),
    game.player,
    'homing',
  );
  game.renderHudOnce();
  steps(game, 2);
}

/** Carrier nose-on at 75% charge, including top/bottom mixed batteries. */
export function stageCapitalSuperweapon(game: Game): void {
  game.startMission();
  jumpToSector2(game);
  game.state = 'test';
  game.hud.setVisible(false);
  for (const group of game.sector.planetGroups) group.visible = false;
  const capital = game.capital;
  if (!capital) throw new Error('capital-superweapon scene expects a carrier');
  const forward = new Vector3();
  capital.forward(forward);
  game.player.position.copy(capital.position).addScaledVector(forward, 320);
  game.player.object.visible = false;
  const context = {
    player: game.player,
    playerVisible: true,
    canSeePlayer: () => true,
    onCharge: () => {},
    onFire: (shot: { range: number }) => shot.range,
  };
  (capital as unknown as { cooldown: number }).cooldown = 0;
  for (let frame = 0; frame < 92; frame++) capital.update(TEST_STEP, context);

  const cameraOffset = new Vector3(38, 7, -60).applyQuaternion(capital.object.quaternion);
  const lookOffset = new Vector3(0, 0.5, -13).applyQuaternion(capital.object.quaternion);
  const cam = game.chaseCam.camera;
  cam.position.copy(capital.position).add(cameraOffset);
  cam.lookAt(capital.position.clone().add(lookOffset));
  steps(game, 3);
}
