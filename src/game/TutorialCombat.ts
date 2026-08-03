import { Vector3 } from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { ProjectileSystem } from '../combat/ProjectileSystem';
import { ENEMY_BOLT_COLOR } from '../combat/WeaponDefs';
import { EnemyShip } from '../entities/EnemyShip';
import { PlayerShip } from '../entities/PlayerShip';

interface TutorialCombatHost {
  readonly audio: AudioEngine;
  readonly projectiles: ProjectileSystem;
  readonly player: PlayerShip;
}

const muzzle = new Vector3();
const direction = new Vector3();
const aim = new Vector3();
const offset = new Vector3();

export function fireTutorialBurst(host: TutorialCombatHost, enemy: EnemyShip): void {
  direction.copy(host.player.position).sub(enemy.position).normalize();
  offset.set(-direction.z, 0.12, direction.x).normalize().multiplyScalar(18);
  aim.copy(host.player.position).add(offset);
  for (const gunpoint of enemy.gunpoints) {
    muzzle.copy(gunpoint).applyQuaternion(enemy.object.quaternion).add(enemy.position);
    direction.copy(aim).sub(muzzle).normalize();
    host.projectiles.spawnBolt({
      position: muzzle, direction, speed: 190, damage: 0, faction: 'enemy',
      color: ENEMY_BOLT_COLOR, boltLength: 3.4, boltWidth: 0.18, life: 2.2,
    });
  }
  if (enemy.position.distanceTo(host.player.position) < 400) host.audio.laser(0.35);
}

export function fireTutorialHit(
  host: TutorialCombatHost,
  enemy: EnemyShip,
  damage: number,
): void {
  muzzle.copy(enemy.gunpoints[0]).applyQuaternion(enemy.object.quaternion).add(enemy.position);
  direction.copy(host.player.position).sub(muzzle).normalize();
  host.projectiles.spawnBolt({
    position: muzzle, direction, speed: 170, damage, faction: 'enemy',
    color: ENEMY_BOLT_COLOR, boltLength: 4.2, boltWidth: 0.24, life: 2.2,
  });
  host.audio.laser(0.65);
}

export function fireTutorialSeeker(host: TutorialCombatHost, enemy: EnemyShip): void {
  muzzle.copy(enemy.gunpoints[0]).applyQuaternion(enemy.object.quaternion).add(enemy.position);
  direction.copy(host.player.position).sub(muzzle).normalize();
  host.projectiles.spawnEnemyRocket(muzzle, direction, host.player, 'homing', 0);
  host.audio.enemyMissileLaunch();
}
