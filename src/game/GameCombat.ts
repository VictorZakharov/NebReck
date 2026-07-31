import { Scene, Vector3 } from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { ProjectileHit, ProjectileSystem } from '../combat/ProjectileSystem';
import { traceCapitalBeam } from '../combat/CapitalBeam';
import { ENEMY_AUTOGUN, ENEMY_BOLT_COLOR } from '../combat/WeaponDefs';
import { EventBus } from '../core/EventBus';
import { Rng } from '../core/Rng';
import { CapitalBeamShot, CapitalShip } from '../entities/CapitalShip';
import { EnemyShip } from '../entities/EnemyShip';
import { NeutralShip } from '../entities/NeutralShip';
import { PickupSystem, ResourceType } from '../entities/PickupSystem';
import { PlayerShip } from '../entities/PlayerShip';
import { Ship } from '../entities/Ship';
import { Turret } from '../entities/Turret';
import { AsteroidDebris } from '../world/AsteroidDebris';
import { AsteroidBody } from '../world/AsteroidField';
import { PlanetSurface } from '../world/PlanetSurface';
import { ExplosionSystem } from '../fx/ExplosionSystem';
import { ShieldFx } from '../fx/ShieldFx';
import { ChaseCamera } from '../rendering/ChaseCamera';
import { Hud } from '../ui/Hud';
import { DifficultyDef } from './Difficulty';
import { EncounterDirector } from './EncounterDirector';
import { Inventory } from './Inventory';
import { Quest, QuestSystem } from './Quests';
import { pointInsideBody, rayHitsBodyBox } from './WorldCollision';

const pushDir = new Vector3();
const boxClosest = new Vector3();
const childOffset = new Vector3();
const losDir = new Vector3();
const losOff = new Vector3();
const enemyRel = new Vector3();
const fireDirection = new Vector3();
const fireMuzzle = new Vector3();
const capitalHullHit = new Vector3();

export interface CombatWorld {
  bodies: AsteroidBody[];
  destroyRock(body: AsteroidBody): void;
  depleteOre(body: AsteroidBody): void;
  spawnChild(
    position: Vector3,
    radius: number,
    rng: Rng,
    palette?: number,
  ): AsteroidBody | null;
}

/**
 * Mutable bridge owned by Game. Accessors keep Game's internal state private
 * while making every combat dependency explicit and independently testable.
 */
export interface GameCombatHost {
  readonly scene: Scene;
  readonly rng: Rng;
  readonly audio: AudioEngine;
  readonly projectiles: ProjectileSystem;
  readonly explosions: ExplosionSystem;
  readonly pickups: PickupSystem;
  readonly debris: AsteroidDebris;
  readonly chaseCam: ChaseCamera;
  readonly hud: Hud;
  readonly events: EventBus;
  readonly inventory: Inventory;
  readonly player: PlayerShip;
  readonly playerShield: ShieldFx;
  readonly world: CombatWorld;
  readonly surface: PlanetSurface | null;
  readonly difficulty: DifficultyDef;
  readonly encounters: EncounterDirector | null;
  readonly quests: QuestSystem;
  enemies: EnemyShip[];
  turrets: Turret[];
  capitalTurrets: Turret[];
  neutrals: NeutralShip[];
  capital: CapitalShip | null;
  score: number;
  readonly jumpSpool: number;
  threatScale(): number;
  cancelJump(message: string | null): void;
  completeQuest(quest: Quest): void;
  storyComms(key: string): void;
  flyPickup(type: ResourceType): void;
}

/**
 * Owns combat consequences and physical contact resolution. The main Game
 * class decides when these operations run; this controller decides what a hit,
 * kill, line-of-sight query, or collision means.
 */
export class GameCombat {
  constructor(private readonly host: GameCombatHost) {}

  collect(type: ResourceType): void {
    this.host.inventory.add(type);
    this.host.flyPickup(type);
    this.host.audio.pickup();
    this.host.storyComms('first-ore');
    this.host.events.emit('pickup-collected', { kind: type });
  }

  enemyFire(enemy: EnemyShip): void {
    const host = this.host;
    if (!this.hasLineOfSight(enemy.position, host.player.position)) return;
    enemy.forward(fireDirection);
    for (const gunpoint of enemy.gunpoints) {
      fireMuzzle.copy(gunpoint).applyQuaternion(enemy.object.quaternion).add(enemy.position);
      if (enemy.rocketMode) {
        host.projectiles.spawnEnemyRocket(
          fireMuzzle,
          fireDirection,
          host.player,
          enemy.rocketMode,
          host.difficulty.enemyDamage,
        );
        continue;
      }
      host.projectiles.spawnBolt({
        position: fireMuzzle,
        direction: fireDirection,
        speed: enemy.autoGun ? ENEMY_AUTOGUN.projectileSpeed : enemy.stats.projectileSpeed,
        damage: (enemy.autoGun ? ENEMY_AUTOGUN.damage : enemy.stats.damage) *
          host.difficulty.enemyDamage,
        faction: 'enemy',
        color: enemy.autoGun ? ENEMY_AUTOGUN.color : ENEMY_BOLT_COLOR,
        boltLength: enemy.autoGun ? ENEMY_AUTOGUN.boltLength : 3.4,
        boltWidth: enemy.autoGun ? ENEMY_AUTOGUN.boltWidth : 0.18,
        life: enemy.autoGun ? ENEMY_AUTOGUN.life : 2.2,
      });
    }
    if (enemy.rocketMode) host.audio.enemyMissileLaunch();
    if (enemy.position.distanceTo(host.player.position) < 400) {
      if (enemy.autoGun) host.audio.enemyAutogun();
      else if (!enemy.rocketMode) host.audio.laser(0.6);
    }
  }

  resolveHit(hit: ProjectileHit): void {
    const host = this.host;
    if (!hit.ship) {
      host.explosions.spawn(hit.point, hit.wasMissile ? 1.2 : 0.35);
      const rock = hit.asteroid;
      if (!rock || rock.destroyed || hit.faction !== 'player') return;

      if (rock.ore) {
        rock.oreHp -= hit.damage;
        if (rock.oreHp <= 0) {
          const type: ResourceType = rock.ore;
          host.world.depleteOre(rock);
          const count = type === 'crystal' ? host.rng.int(2, 4) : host.rng.int(3, 5);
          host.pickups.spawn(hit.point, type, count, host.rng);
          host.explosions.spawn(hit.point, 0.9);
          host.audio.explosion(false);
        }
      }

      rock.hp -= hit.damage;
      if (rock.hp <= 0) {
        const buriedOre: ResourceType | null = rock.ore;
        host.world.destroyRock(rock);
        host.debris.spawn(rock.position, rock.radius, host.rng);
        host.explosions.spawn(rock.position, Math.min(2.4, 0.7 + rock.radius * 0.06));
        host.audio.explosion(rock.radius > 14);
        if (buriedOre) {
          host.pickups.spawn(rock.position, buriedOre, host.rng.int(2, 4), host.rng);
        }
        if (rock.stash) {
          host.pickups.spawn(rock.position, 'scrap', 3, host.rng);
          host.pickups.spawn(rock.position, 'crystal', 3, host.rng);
          host.pickups.spawn(rock.position, 'flux', 2, host.rng);
          host.audio.pickup();
          host.storyComms('first-stash');
        } else if (rock.radius >= 9) {
          const children = host.rng.int(2, 3);
          for (let i = 0; i < children; i++) {
            const [dx, dy, dz] = host.rng.unitSphere();
            childOffset.set(dx, dy, dz).multiplyScalar(rock.radius * 0.55);
            host.world.spawnChild(
              childOffset.add(rock.position),
              rock.radius * host.rng.range(0.32, 0.48),
              host.rng,
              rock.palette,
            );
          }
        }
      }
      return;
    }

    const result = hit.ship.takeDamage(hit.damage);
    if (hit.ship === host.player) {
      if (host.jumpSpool >= 0) host.cancelJump('Jump disrupted — taking fire!');
      host.playerShield.hit(hit.point);
      host.hud.flashDamage(result.shieldAbsorbed ? 0.35 : 0.7);
      host.chaseCam.addTrauma(result.shieldAbsorbed ? 0.25 : 0.45);
      if (result.shieldAbsorbed) host.audio.hitShield();
      else host.audio.hitHull();
      host.events.emit('player-hit', {
        amount: hit.damage,
        shieldAbsorbed: result.shieldAbsorbed,
      });
    } else if (hit.ship instanceof EnemyShip) {
      const enemy = hit.ship;
      enemy.notifyDamaged();
      host.hud.flashHitmarker(result.died);
      host.explosions.spawn(hit.point, hit.wasMissile ? 1.1 : 0.28);
      if (result.died) this.killEnemy(enemy);
      else host.audio.hitShield();
    } else if (hit.ship instanceof Turret) {
      host.hud.flashHitmarker(result.died);
      host.explosions.spawn(hit.point, hit.wasMissile ? 1.1 : 0.28);
      if (result.died) this.killTurret(hit.ship);
      else host.audio.hitShield();
    } else if (hit.ship instanceof CapitalShip) {
      host.hud.flashHitmarker(result.died);
      host.explosions.spawn(hit.point, hit.wasMissile ? 1.3 : 0.4);
      if (result.died) this.killCapital(hit.ship);
    } else if (hit.ship instanceof NeutralShip) {
      host.hud.flashHitmarker(result.died);
      host.explosions.spawn(hit.point, 0.4);
      if (result.died) this.killNeutral(hit.ship);
    }
  }

  private killCapital(capital: CapitalShip): void {
    const host = this.host;
    for (const turret of host.capitalTurrets) {
      if (!turret.alive) continue;
      turret.alive = false;
      host.explosions.spawn(turret.position, 1.1);
      host.debris.spawn(turret.position, 4, host.rng);
      host.scene.remove(turret.object);
      turret.dispose();
    }
    host.turrets = host.turrets.filter((turret) => !host.capitalTurrets.includes(turret));
    host.capitalTurrets = [];
    for (let i = 0; i < 5; i++) {
      const [dx, dy, dz] = host.rng.unitSphere();
      const point = capital.position.clone().add(new Vector3(dx * 12, dy * 5, dz * 20));
      host.explosions.spawn(point, 1.6 + host.rng.next());
    }
    host.explosions.spawn(capital.position, 3);
    host.audio.explosion(true);
    host.debris.spawn(capital.position, 20, host.rng);
    host.scene.remove(capital.object);
    capital.dispose();
    host.capital = null;
    host.score += Math.round(2500 * host.difficulty.scoreMult * host.threatScale());
    host.pickups.spawn(capital.position, 'scrap', 6, host.rng);
    host.pickups.spawn(capital.position, 'crystal', 4, host.rng);
    host.pickups.spawn(capital.position, 'flux', 3, host.rng);
    host.hud.showBanner('Capital ship destroyed — jump field clear');
    host.encounters?.onVigilKill('capital');
    host.storyComms('capital-destroyed');
    host.events.emit('score-changed', { score: host.score });
  }

  private killNeutral(neutral: NeutralShip): void {
    const host = this.host;
    host.explosions.spawn(neutral.position, 1.6);
    host.audio.explosion(true);
    host.debris.spawn(neutral.position, 8, host.rng);
    host.scene.remove(neutral.object);
    neutral.dispose();
    host.neutrals = host.neutrals.filter((candidate) => candidate !== neutral);
    host.pickups.spawn(neutral.position, 'scrap', host.rng.int(3, 5), host.rng);
    host.events.emit('comms', {
      speaker: 'ECHO',
      text: 'That hauler was no threat to us. Logged.',
    });
  }

  private killTurret(turret: Turret): void {
    const host = this.host;
    host.explosions.spawn(turret.position, 1.4);
    host.audio.explosion(true);
    host.debris.spawn(turret.position, 5, host.rng);
    host.scene.remove(turret.object);
    turret.dispose();
    host.turrets = host.turrets.filter((candidate) => candidate !== turret);
    host.capitalTurrets = host.capitalTurrets.filter((candidate) => candidate !== turret);
    host.score += Math.round(
      turret.stats.score * host.difficulty.scoreMult * host.threatScale(),
    );
    host.encounters?.onVigilKill('turret');
    host.pickups.spawn(turret.position, 'scrap', 2, host.rng);
    host.pickups.spawn(turret.position, 'flux', host.rng.int(1, 2), host.rng);
    host.events.emit('score-changed', { score: host.score });
  }

  hasLineOfSight(
    from: Vector3,
    to: Vector3,
    ignoredBody: AsteroidBody | null = null,
    targetShip: Ship | null = null,
  ): boolean {
    const host = this.host;
    if (host.surface?.isCovered(from, to)) return false;
    losDir.copy(to).sub(from);
    const distance = losDir.length();
    if (distance < 1e-5) return true;
    losDir.divideScalar(distance);
    for (const body of host.world.bodies) {
      if (body === ignoredBody || body.destroyed || body.radius < 0.8) continue;
      losOff.copy(body.position).sub(from);
      const along = losOff.dot(losDir);
      if (along < 0 || along > distance) continue;
      const perpendicularSq = losOff.lengthSq() - along * along;
      if (perpendicularSq > body.radius * body.radius) continue;
      if (body.box && !rayHitsBodyBox(from, losDir, distance, body)) continue;
      if (pointInsideBody(from, body, 4)) continue;
      return false;
    }
    const capital = host.capital;
    if (
      capital?.alive && capital !== targetShip &&
      capital.intersectSegment(from, to, capitalHullHit) &&
      capitalHullHit.distanceToSquared(from) > 2.5 * 2.5
    ) return false;
    return true;
  }

  turretFire(turret: Turret): void {
    const host = this.host;
    if (!this.hasLineOfSight(turret.position, host.player.position)) return;
    turret.forward(fireDirection);
    for (const gunpoint of turret.gunpoints) {
      fireMuzzle.copy(gunpoint).applyQuaternion(turret.object.quaternion).add(turret.position);
      if (turret.weapon === 'homing' || turret.weapon === 'fast') {
        host.projectiles.spawnEnemyRocket(
          fireMuzzle,
          fireDirection,
          host.player,
          turret.weapon,
          host.difficulty.enemyDamage,
        );
        continue;
      }
      host.projectiles.spawnBolt({
        position: fireMuzzle,
        direction: fireDirection,
        speed: turret.stats.projectileSpeed,
        damage: turret.stats.damage * host.difficulty.enemyDamage,
        faction: 'enemy',
        color: turret.weapon === 'autogun' ? ENEMY_AUTOGUN.color : ENEMY_BOLT_COLOR,
        boltLength: turret.weapon === 'autogun' ? ENEMY_AUTOGUN.boltLength : 3.0,
        boltWidth: turret.weapon === 'autogun' ? ENEMY_AUTOGUN.boltWidth : 0.18,
        life: turret.weapon === 'autogun' ? ENEMY_AUTOGUN.life : 2.0,
      });
    }
    if (turret.weapon === 'homing' || turret.weapon === 'fast') {
      host.audio.enemyMissileLaunch();
    } else if (turret.position.distanceTo(host.player.position) < 400) {
      if (turret.weapon === 'autogun') host.audio.enemyAutogun();
      else host.audio.laser(0.5);
    }
  }

  /** Resolve the committed carrier ray and return its visually reached range. */
  capitalBeamFire(shot: CapitalBeamShot): number {
    const host = this.host;
    const ships: Ship[] = [host.player];
    for (const enemy of host.enemies) ships.push(enemy);
    for (const turret of host.turrets) {
      if (!host.capitalTurrets.includes(turret)) ships.push(turret);
    }
    for (const neutral of host.neutrals) ships.push(neutral);

    const trace = traceCapitalBeam(
      shot.origin,
      shot.direction,
      shot.range,
      shot.radius,
      host.world.bodies,
      ships,
    );
    for (const hit of trace.ships) {
      this.resolveHit({
        ship: hit.ship,
        asteroid: null,
        point: hit.point,
        damage: 1_000_000,
        faction: 'enemy',
        wasMissile: false,
      });
    }
    if (trace.obstacle) {
      const rock = trace.obstacle;
      host.world.destroyRock(rock);
      host.debris.spawn(rock.position, Math.min(18, rock.radius), host.rng);
      host.explosions.spawn(rock.position, Math.min(3.2, 1.3 + rock.radius * 0.05));
    }
    host.audio.capitalBeam();
    host.chaseCam.addTrauma(1);
    return trace.stopDistance;
  }

  private killEnemy(enemy: EnemyShip): void {
    const host = this.host;
    host.explosions.spawn(enemy.position, enemy.kind === 'brute' ? 1.9 : 1.2);
    host.audio.explosion(enemy.kind === 'brute');
    host.debris.spawn(enemy.position, enemy.kind === 'brute' ? 6 : 4, host.rng);
    host.scene.remove(enemy.object);
    enemy.dispose();
    host.enemies = host.enemies.filter((candidate) => candidate !== enemy);
    host.score += Math.round(
      enemy.stats.score * host.difficulty.scoreMult * host.threatScale(),
    );
    host.encounters?.onVigilKill('fighter');
    for (const completed of host.quests.onVigilKill()) host.completeQuest(completed);
    host.storyComms('first-kill');

    if (enemy.kind === 'brute') {
      host.pickups.spawn(enemy.position, 'scrap', host.rng.int(2, 3), host.rng);
      host.pickups.spawn(enemy.position, 'flux', host.rng.int(1, 2), host.rng);
    } else {
      host.pickups.spawn(enemy.position, 'scrap', host.rng.int(1, 2), host.rng);
      if (host.rng.chance(0.2)) host.pickups.spawn(enemy.position, 'flux', 1, host.rng);
    }

    host.events.emit('enemy-killed', {
      position: [enemy.position.x, enemy.position.y, enemy.position.z],
      score: enemy.stats.score,
      enemyKind: enemy.kind,
    });
    host.events.emit('score-changed', { score: host.score });
  }

  resolveEnemySurfaceCollision(enemy: EnemyShip): void {
    const surface = this.host.surface;
    if (!surface || !enemy.alive) return;

    const minY = surface.heightAt(enemy.position.x, enemy.position.z) + enemy.radius + 0.8;
    if (enemy.position.y < minY) {
      enemy.position.y = minY;
      enemy.velocity.y = Math.max(8, Math.abs(enemy.velocity.y) * 0.35);
    }

    for (const body of surface.bodies) {
      if (body.destroyed) continue;
      const broadRadius = body.radius + enemy.radius;
      if (body.position.distanceToSquared(enemy.position) > broadRadius * broadRadius) continue;

      let touching = false;
      if (body.box) {
        enemyRel.copy(enemy.position).sub(body.position);
        const px = body.box.hx + enemy.radius - Math.abs(enemyRel.x);
        const py = body.box.hy + enemy.radius - Math.abs(enemyRel.y);
        const pz = body.box.hz + enemy.radius - Math.abs(enemyRel.z);
        if (px > 0 && py > 0 && pz > 0) {
          touching = true;
          if (px <= py && px <= pz) {
            pushDir.set(enemyRel.x >= 0 ? 1 : -1, 0, 0);
            enemy.position.x = body.position.x + pushDir.x * (body.box.hx + enemy.radius + 0.3);
          } else if (py <= pz) {
            pushDir.set(0, enemyRel.y >= 0 ? 1 : -1, 0);
            enemy.position.y = body.position.y + pushDir.y * (body.box.hy + enemy.radius + 0.3);
          } else {
            pushDir.set(0, 0, enemyRel.z >= 0 ? 1 : -1);
            enemy.position.z = body.position.z + pushDir.z * (body.box.hz + enemy.radius + 0.3);
          }
        }
      } else {
        enemyRel.copy(enemy.position).sub(body.position);
        if (enemyRel.lengthSq() < broadRadius * broadRadius) {
          touching = true;
          if (enemyRel.lengthSq() < 1e-6) enemyRel.set(0, 1, 0);
          pushDir.copy(enemyRel).normalize();
          enemy.position.copy(body.position).addScaledVector(pushDir, broadRadius + 0.3);
        }
      }
      if (touching) {
        enemy.velocity.reflect(pushDir).multiplyScalar(0.35).addScaledVector(pushDir, 10);
        break;
      }
    }
  }

  resolveShipCollisions(dt: number): void {
    const host = this.host;
    const player = host.player;
    if (player.alive) {
      for (const body of host.world.bodies) {
        if (body.destroyed) continue;
        const combinedRadius = body.radius + player.radius;
        if (Math.abs(body.position.x - player.position.x) > combinedRadius) continue;
        if (Math.abs(body.position.y - player.position.y) > combinedRadius) continue;
        if (Math.abs(body.position.z - player.position.z) > combinedRadius) continue;
        let touching: boolean;
        if (body.box) {
          boxClosest.set(
            Math.max(
              body.position.x - body.box.hx,
              Math.min(body.position.x + body.box.hx, player.position.x),
            ),
            Math.max(
              body.position.y - body.box.hy,
              Math.min(body.position.y + body.box.hy, player.position.y),
            ),
            Math.max(
              body.position.z - body.box.hz,
              Math.min(body.position.z + body.box.hz, player.position.z),
            ),
          );
          const distanceSq = boxClosest.distanceToSquared(player.position);
          touching = distanceSq < player.radius * player.radius;
          if (touching) {
            pushDir.copy(player.position).sub(boxClosest);
            if (pushDir.lengthSq() < 1e-6) pushDir.set(0, 1, 0);
            pushDir.normalize();
            player.position.copy(boxClosest).addScaledVector(pushDir, player.radius + 0.5);
          }
        } else {
          touching =
            body.position.distanceToSquared(player.position) <
            combinedRadius * combinedRadius;
          if (touching) {
            pushDir.copy(player.position).sub(body.position).normalize();
            player.position.copy(body.position).addScaledVector(pushDir, combinedRadius + 0.5);
          }
        }
        if (touching) {
          const normalSpeed = player.velocity.dot(pushDir);
          const impactSpeed = Math.max(0, -normalSpeed);
          if (normalSpeed < 0) {
            player.velocity.addScaledVector(pushDir, -normalSpeed * 1.3);
          }
          const damage = Math.max(0, (impactSpeed - 4) * 0.22);
          if (damage >= 0.2) {
            const result = player.takeDamage(damage);
            host.playerShield.hit(
              player.position.clone().addScaledVector(pushDir, -player.radius),
            );
            host.chaseCam.addTrauma(Math.min(0.65, 0.12 + damage * 0.04));
            host.hud.flashDamage(Math.min(0.8, 0.18 + damage * 0.04));
            host.audio.hitHull();
            host.events.emit('player-hit', {
              amount: damage,
              shieldAbsorbed: result.shieldAbsorbed,
            });
          }
          break;
        }
      }
    }

    if (player.alive && host.capital?.alive) {
      const combinedRadius = host.capital.radius + player.radius;
      if (host.capital.position.distanceToSquared(player.position) < combinedRadius ** 2) {
        const speed = player.velocity.length();
        pushDir.copy(player.position).sub(host.capital.position).normalize();
        player.position
          .copy(host.capital.position)
          .addScaledVector(pushDir, combinedRadius + 0.5);
        player.velocity.reflect(pushDir).multiplyScalar(0.3);
        const damage = Math.max(5, speed * 0.25);
        const result = player.takeDamage(damage);
        host.chaseCam.addTrauma(0.5);
        host.hud.flashDamage(0.6);
        host.audio.hitHull();
        host.events.emit('player-hit', {
          amount: damage,
          shieldAbsorbed: result.shieldAbsorbed,
        });
      }
    }

    if (player.alive) {
      for (const enemy of host.enemies) {
        const combinedRadius = enemy.radius + player.radius;
        if (enemy.position.distanceToSquared(player.position) < combinedRadius ** 2) {
          pushDir.copy(player.position).sub(enemy.position).normalize();
          player.position.addScaledVector(pushDir, combinedRadius * 0.4 * dt * 30);
          const result = player.takeDamage(10 * dt * 10);
          enemy.takeDamage(20 * dt * 10);
          if (!enemy.alive) this.killEnemy(enemy);
          host.chaseCam.addTrauma(0.3);
          if (!result.died) host.hud.flashDamage(0.4);
          break;
        }
      }
    }
  }
}
