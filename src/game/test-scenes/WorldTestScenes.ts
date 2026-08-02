import { Vector3 } from 'three';
import { spawnAsteroidChildren } from '../../world/AsteroidBreakup';
import { buildShipMesh } from '../../entities/ShipMesh';
import { Game } from '../Game';
import { jumpToSector2, steps } from './TestSceneShared';

/** Skybox, starfield, and a half-clipped sun for extended-emitter coverage. */
export function stageNebula(game: Game): void {
  game.state = 'test';
  game.player.object.visible = false;
  for (const mesh of game.sector.asteroids.meshes) mesh.visible = false;
  for (const group of game.sector.planetGroups) group.visible = false;
  for (const cave of game.sector.caves) cave.group.visible = false;
  for (const wreck of game.sector.wrecks) wreck.group.visible = false;

  const camera = game.chaseCam.camera;
  camera.position.set(0, 0, 0);
  const sunDirection = game.sector.sun.group.position.clone().normalize();
  const upHint = Math.abs(sunDirection.y) > 0.9
    ? new Vector3(0, 0, 1)
    : new Vector3(0, 1, 0);
  const right = new Vector3().crossVectors(sunDirection, upHint).normalize();
  const halfVerticalFov = (camera.fov * Math.PI) / 360;
  const edgeYaw = Math.atan(1.03 * Math.tan(halfVerticalFov) * camera.aspect);
  const viewDirection = sunDirection
    .clone()
    .multiplyScalar(Math.cos(edgeYaw))
    .addScaledVector(right, -Math.sin(edgeYaw));
  camera.lookAt(viewDirection);
  steps(game, 3);
}

/** Player ship beauty shot with engine glow. */
export function stageShip(game: Game): void {
  game.state = 'test';
  game.player.object.position.set(0, 0, 0);
  game.player.object.rotation.set(0.1, 2.6, 0.06);
  game.player.throttle = 0.85;
  const camera = game.chaseCam.camera;
  camera.position.set(4, 1.9, 5.4);
  camera.lookAt(0, 0, 0);
  steps(game, 3);
}

/** Inside the asteroid belt looking across it. */
export function stageAsteroids(game: Game): void {
  game.state = 'test';
  game.player.object.visible = false;
  const camera = game.chaseCam.camera;
  camera.position.set(140, 30, 140);
  camera.lookAt(500, -40, 300);
  steps(game, 3);
}

/** Inside a hollow cave asteroid: boulders, crystals, stash, and turret. */
export function stageCave(game: Game): void {
  game.startMission();
  game.state = 'test';
  game.hud.clearComms();
  game.player.object.visible = false;
  const cave = game.sector.caves[0];
  const camera = game.chaseCam.camera;
  camera.position.copy(cave.center).add(new Vector3(6, 4, 30));
  camera.lookAt(cave.center);
  steps(game, 4);
}

/** A large asteroid mid-shatter with only persistent, destructible child rocks. */
export function stageSplit(game: Game): void {
  game.state = 'test';
  game.player.object.visible = false;
  const rock = game.sector.asteroids.bodies
    .filter((body) => !body.hero && !body.solo && body.radius >= 12)
    .sort((a, b) => b.radius - a.radius)[0];
  const camera = game.chaseCam.camera;
  camera.position.copy(rock.position).add(new Vector3(0, rock.radius * 0.8, rock.radius * 3.2));
  camera.lookAt(rock.position);

  game.sector.asteroids.destroyRock(rock);
  spawnAsteroidChildren(game.sector.asteroids, rock, game.rng, 3);
  game.explosions.spawn(rock.position, 1.8);
  steps(game, 10);
}

/** Capital ship with its battery and a neutral hauler in frame. */
export function stageLevel(game: Game): void {
  game.startMission();
  jumpToSector2(game);
  game.state = 'test';
  game.player.object.visible = false;
  const capital = game.capital;
  if (!capital) throw new Error('level scene expects a capital ship');
  const hauler = game.neutrals[0];
  hauler.object.position.copy(capital.position).add(new Vector3(-48, 12, 28));
  hauler.faceToward(capital.position.clone().add(new Vector3(250, 0, 350)));

  const towardSun = game.sector.sun.group.position.clone().sub(capital.position).normalize();
  const side = new Vector3().crossVectors(towardSun, new Vector3(0, 1, 0)).normalize();
  const candidates = [towardSun, side, side.clone().negate(), towardSun.clone().negate()];
  const clear = (direction: Vector3): boolean => {
    for (let distance = 10; distance <= 100; distance += 15) {
      const point = capital.position.clone().addScaledVector(direction, distance);
      for (const body of game.sector.asteroids.bodies) {
        if (!body.destroyed && body.radius > 8 && body.position.distanceTo(point) < body.radius + 12) {
          return false;
        }
      }
    }
    return true;
  };
  const viewDirection = candidates.find(clear) ?? towardSun;
  const camera = game.chaseCam.camera;
  camera.position.copy(capital.position).addScaledVector(viewDirection, 95).add(new Vector3(0, 26, 0));
  camera.lookAt(capital.position);
  steps(game, 30);
}

/** A derelict wreck site with its blinking black box. */
export function stageWreck(game: Game): void {
  game.startMission();
  game.state = 'test';
  game.player.object.visible = false;
  const wreck = game.sector.wrecks[0];
  const towardSun = game.sector.sun.group.position.clone().sub(wreck.center).normalize();
  const camera = game.chaseCam.camera;
  camera.position.copy(wreck.center).addScaledVector(towardSun, 26).add(new Vector3(8, 7, 0));
  camera.lookAt(wreck.center);
  steps(game, 4);
}

/** Planetary dungeon approach looking through a natural arch. */
export function stagePlanet(game: Game): void {
  game.startMission();
  game.enterPlanet(0);
  const cave = game.surface!.caveLandmarks[0];
  game.player.object.position.copy(cave.approach);
  game.player.faceToward(cave.route[1]);
  game.chaseCam.snapTo(game.player.object);
  game.hud.clearComms();
  steps(game, 12);
}

/** Ground base close-up with rooftop guns staged mid-track. */
export function stageBase(game: Game): void {
  game.startMission();
  game.enterPlanet(0);
  const landmarks = game.surface!.baseLandmarks;
  const base = landmarks.find((landmark) => landmark.kind === 'compound') ?? landmarks[0];
  const center = base.center;
  game.player.object.position.set(center.x + 110, center.y + 26, center.z + 95);
  game.player.faceToward(center);
  game.chaseCam.snapTo(game.player.object);
  steps(game, 100);
  game.state = 'test';
  game.hud.clearComms();
  const camera = game.chaseCam.camera;
  camera.position.set(center.x + 62, center.y + 34, center.z + 104);
  camera.lookAt(center.x, center.y + 8, center.z);
  steps(game, 2);
}

/** All playable hulls from the rear-quarter angle used by mesh audits. */
export function stageFleet(game: Game): void {
  game.startMission();
  game.state = 'test';
  game.hud.setVisible(false);
  game.player.object.visible = false;
  const kinds = ['kestrel', 'vanta', 'aegis'] as const;
  const altitude = 2600;
  kinds.forEach((kind, index) => {
    const mesh = buildShipMesh(kind);
    mesh.group.position.set((index - 1) * 8, altitude, -4);
    mesh.group.rotation.y = 0.65;
    game.scene.add(mesh.group);
  });
  const camera = game.chaseCam.camera;
  camera.position.set(-3.2, altitude - 2.4, 5.2);
  camera.lookAt(1.2, altitude + 0.1, -4.2);
  steps(game, 3);
}
