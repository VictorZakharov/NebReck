import { AmbientLight, PointLight, Vector3 } from 'three';
import { Game } from '../Game';
import { steps } from './TestSceneShared';

/** Post-blast plate exposing recognisable cloned Kestrel hull components. */
export function stageShipBreakup(game: Game): void {
  game.state = 'test';
  game.hud.setVisible(false);
  for (const mesh of game.sector.asteroids.meshes) mesh.visible = false;
  for (const group of game.sector.planetGroups) group.visible = false;
  for (const cave of game.sector.caves) cave.group.visible = false;
  for (const wreck of game.sector.wrecks) wreck.group.visible = false;

  const origin = new Vector3(0, 1, -42);
  const player = game.player;
  player.object.position.copy(origin);
  player.object.rotation.set(0, 0, 0);
  player.object.updateWorldMatrix(true, true);
  game.shipDebris.spawn(player.object, new Vector3(1, 0.5, -2), player.radius, game.rng);
  player.object.visible = false;

  const reviewLight = new PointLight(0xffc58a, 240, 70, 1.7);
  reviewLight.position.set(-7, 8, -25);
  game.scene.add(reviewLight);
  game.scene.add(new AmbientLight(0x8adfff, 1.1));
  steps(game, 6);

  const center = new Vector3();
  for (const part of game.shipDebris.group.children) center.add(part.position);
  center.multiplyScalar(1 / Math.max(1, game.shipDebris.group.children.length));
  const camera = game.chaseCam.camera;
  camera.position.copy(center).add(new Vector3(0, 4, 9));
  camera.lookAt(center);
}
