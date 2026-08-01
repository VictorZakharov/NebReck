import { Matrix4, Vector3 } from 'three';
import { showProjectileImpact } from '../DamageFeedback';
import { Game } from '../Game';
import { steps } from './TestSceneShared';

/** Live bolt collision against a large visible rock, viewed along the entry ray. */
export function stageAsteroidImpact(game: Game): void {
  game.state = 'test';
  game.hud.setVisible(false);
  for (const group of game.sector.planetGroups) group.visible = false;
  for (const cave of game.sector.caves) cave.group.visible = false;
  for (const wreck of game.sector.wrecks) wreck.group.visible = false;

  const rock = game.sector.asteroids.bodies
    .filter((body) => !body.destroyed && !body.ore && body.mesh && body.index >= 0)
    .sort((a, b) => b.radius - a.radius)[0];
  if (!rock) return;

  const hidden = new Matrix4().makeScale(0, 0, 0);
  for (const mesh of game.sector.asteroids.meshes) {
    if (mesh !== rock.mesh) {
      mesh.visible = false;
      continue;
    }
    for (let index = 0; index < mesh.count; index++) {
      if (index !== rock.index) mesh.setMatrixAt(index, hidden);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  const outward = new Vector3(0.18, 0.06, 1).normalize();
  const origin = rock.position.clone().addScaledVector(outward, rock.radius * 2 + 34);
  const direction = rock.position.clone().sub(origin).normalize();
  const camera = game.chaseCam.camera;
  camera.position.copy(origin).addScaledVector(outward, 16).add(new Vector3(0, 7, 0));
  camera.lookAt(rock.position);

  game.projectiles.spawnBolt({
    position: origin,
    direction,
    speed: 420,
    damage: 1,
    faction: 'player',
    color: game.weapons.weapon.color,
    boltLength: game.weapons.weapon.boltLength,
    boltWidth: game.weapons.weapon.boltWidth,
    life: 2,
  });
  game.projectiles.update(0.5, [], null, [rock], (hit) => {
    showProjectileImpact(
      game.explosions, hit.point, false, 1.2, 0.35, rock.position, hit.normal,
    );
  });
  steps(game, 4);
}
