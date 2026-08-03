import { Scene, Vector3 } from 'three';
import { Rng } from '../core/Rng';
import { EnemyShip } from '../entities/EnemyShip';
import { PlayerShip } from '../entities/PlayerShip';
import { Turret } from '../entities/Turret';
import { AsteroidBody } from '../world/AsteroidField';
import { PlanetSurface } from '../world/PlanetSurface';

export interface TutorialSurfaceTargets {
  base: Vector3;
  turret: Turret;
  stash: AsteroidBody;
}

export const TUTORIAL_BASE_RADIUS = 72;

interface SurfaceTrainingHost {
  scene: Scene;
  rng: Rng;
  player: PlayerShip;
  surface: PlanetSurface | null;
  enemies: EnemyShip[];
  turrets: Turret[];
}

/** Keep one real base battery and cache; safely remove every other surface threat. */
export function prepareTutorialSurfaceMission(
  host: SurfaceTrainingHost,
): TutorialSurfaceTargets | null {
  const surface = host.surface;
  if (!surface) return null;
  const stashes = surface.interactionBodies.filter((body) => body.stash && !body.destroyed);
  let selection: { base: Vector3; battery: Vector3; stash: AsteroidBody } | null = null;
  let travelDistance = -1;
  for (const landmark of surface.baseLandmarks) {
    const stash = nearest(landmark.center, stashes, (value) => value.position);
    if (!landmark.trainingBattery || !stash) continue;
    if (landmark.trainingBattery.distanceTo(landmark.center) > TUTORIAL_BASE_RADIUS ||
        stash.position.distanceTo(landmark.center) > TUTORIAL_BASE_RADIUS) continue;
    const distance = landmark.center.distanceToSquared(host.player.position);
    if (distance > travelDistance) {
      selection = { base: landmark.center, battery: landmark.trainingBattery, stash };
      travelDistance = distance;
    }
  }
  if (!selection) return null;
  const turret = new Turret(host.rng.fork(), 'bolt');
  turret.position.copy(selection.battery);
  const { stash } = selection;
  const mission: TutorialSurfaceTargets = { base: selection.base, turret, stash };

  for (const enemy of host.enemies) {
    host.scene.remove(enemy.object);
    enemy.dispose();
  }
  host.enemies = [];
  for (const other of host.turrets) {
    if (other === turret) continue;
    host.scene.remove(other.object);
    other.dispose();
  }
  turret.faceToward(host.player.position);
  host.scene.add(turret.object);
  host.turrets = [turret];
  turret.training = true;
  turret.hull = Math.min(turret.hull, 28);
  turret.shield = 0;
  stash.hp = Math.min(stash.hp, 24);
  return mission;
}

function nearest<T>(
  point: Vector3,
  values: readonly T[],
  position: (value: T) => Vector3,
): T | null {
  let result: T | null = null;
  let distance = Infinity;
  for (const value of values) {
    const candidate = position(value).distanceToSquared(point);
    if (candidate < distance) {
      result = value;
      distance = candidate;
    }
  }
  return result;
}
