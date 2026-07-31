import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { Ship } from '../entities/Ship';
import { ParticleSystem } from '../fx/ParticleSystem';
import { AsteroidBody } from '../world/AsteroidField';
import { ENEMY_ROCKETS, EnemyRocketMode, MISSILE } from './WeaponDefs';

export type Faction = 'player' | 'enemy';

export interface BoltSpawn {
  position: Vector3;
  direction: Vector3;
  speed: number;
  damage: number;
  faction: Faction;
  color: Color;
  boltLength: number;
  boltWidth: number;
  life: number;
}

export interface ProjectileHit {
  ship: Ship | null;             // null → hit an asteroid
  asteroid: AsteroidBody | null; // set when a rock was struck (mining!)
  point: Vector3;
  damage: number;
  faction: Faction;
  wasMissile: boolean;
}

export interface MissileThreat {
  locked: boolean;
  imminent: boolean;
  /** Estimated seconds to impact for the nearest tracking missile. */
  timeToImpact: number;
  /** Active in-flight homing missiles whose live target is the player. */
  count: number;
}

export interface ProjectileSnapshot {
  faction: Faction;
  kind: 'bolt' | 'missile';
  homing: boolean;
  hasTarget: boolean;
  speed: number;
}

interface Projectile {
  active: boolean;
  mesh: Mesh;
  material: MeshBasicMaterial;
  velocity: Vector3;
  damage: number;
  faction: Faction;
  life: number;
  kind: 'bolt' | 'missile';
  homing: boolean;
  target: Ship | null;
  accel: number;
  maxSpeed: number;
  turnRate: number;
  trailColor: Color;
  trailTimer: number;
  /** Monotonic HUD countdown once this seeker enters the imminent window. */
  warningEta: number;
}

const newPos = new Vector3();
const seg = new Vector3();
const toCenter = new Vector3();
const closest = new Vector3();
const bestPoint = new Vector3();
const lookPoint = new Vector3();
const steer = new Vector3();
const trailVel = new Vector3();
const threatToPlayer = new Vector3();

/**
 * Pooled projectiles (bolts + homing missiles) with swept segment-vs-sphere
 * collision so nothing tunnels through targets at high speed or low frame
 * rate. Hits are reported to a callback; damage application stays in the
 * combat director.
 */
export class ProjectileSystem {
  readonly group = new Group();
  private readonly pool: Projectile[] = [];
  private readonly unitBox = new BoxGeometry(1, 1, 1);
  private readonly threat: MissileThreat = {
    locked: false,
    imminent: false,
    timeToImpact: Infinity,
    count: 0,
  };

  constructor(
    private readonly particles: ParticleSystem,
    capacity = 320,
  ) {
    for (let i = 0; i < capacity; i++) {
      const material = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      const mesh = new Mesh(this.unitBox, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({
        active: false,
        mesh,
        material,
        velocity: new Vector3(),
        damage: 0,
        faction: 'player',
        life: 0,
        kind: 'bolt',
        homing: false,
        target: null,
        accel: 0,
        maxSpeed: 0,
        turnRate: 0,
        trailColor: new Color(),
        trailTimer: 0,
        warningEta: Infinity,
      });
    }
  }

  spawnBolt(s: BoltSpawn): void {
    const p = this.acquire();
    if (!p) return;
    p.active = true;
    p.kind = 'bolt';
    p.homing = false;
    p.target = null;
    p.damage = s.damage;
    p.faction = s.faction;
    p.life = s.life;
    p.velocity.copy(s.direction).normalize().multiplyScalar(s.speed);
    p.material.color.copy(s.color).multiplyScalar(3.2); // HDR — bloom picks it up
    p.mesh.visible = true;
    p.mesh.position.copy(s.position);
    p.mesh.scale.set(s.boltWidth, s.boltWidth, s.boltLength);
    p.mesh.lookAt(newPos.copy(s.position).add(s.direction));
  }

  spawnMissile(position: Vector3, direction: Vector3, target: Ship | null): void {
    this.spawnOrdnance(position, direction, target, 'player', {
      damage: MISSILE.damage,
      speed: MISSILE.speed,
      accel: MISSILE.accel,
      maxSpeed: MISSILE.maxSpeed,
      turnRate: MISSILE.turnRate,
      life: MISSILE.life,
      color: MISSILE.color,
      homing: true,
    });
  }

  spawnEnemyRocket(
    position: Vector3,
    direction: Vector3,
    target: Ship,
    mode: EnemyRocketMode,
    damageScale = 1,
  ): void {
    const def = ENEMY_ROCKETS[mode];
    this.spawnOrdnance(position, direction, mode === 'homing' ? target : null, 'enemy', {
      damage: def.damage * damageScale,
      speed: def.speed,
      accel: def.accel,
      maxSpeed: def.maxSpeed,
      turnRate: def.turnRate,
      life: def.life,
      color: def.color,
      homing: mode === 'homing',
    });
  }

  private spawnOrdnance(
    position: Vector3,
    direction: Vector3,
    target: Ship | null,
    faction: Faction,
    def: {
      damage: number;
      speed: number;
      accel: number;
      maxSpeed: number;
      turnRate: number;
      life: number;
      color: Color;
      homing: boolean;
    },
  ): void {
    const p = this.acquire();
    if (!p) return;
    p.active = true;
    p.kind = 'missile';
    p.homing = def.homing;
    p.target = target;
    p.damage = def.damage;
    p.faction = faction;
    p.life = def.life;
    p.accel = def.accel;
    p.maxSpeed = def.maxSpeed;
    p.turnRate = def.turnRate;
    p.trailTimer = 0;
    p.warningEta = Infinity;
    p.velocity.copy(direction).normalize().multiplyScalar(def.speed);
    p.material.color.copy(def.color).multiplyScalar(2.8);
    p.trailColor.copy(def.color);
    p.mesh.visible = true;
    p.mesh.position.copy(position);
    const width = faction === 'enemy' ? 0.42 : 0.3;
    p.mesh.scale.set(width, width, faction === 'enemy' ? 2.2 : 1.6);
    p.mesh.lookAt(newPos.copy(position).add(direction));
  }

  update(
    dt: number,
    enemies: readonly Ship[],
    player: Ship | null,
    asteroids: readonly AsteroidBody[],
    onHit: (hit: ProjectileHit) => void,
    terrainHit?: (from: Vector3, to: Vector3, out: Vector3) => boolean,
    canTrack?: (target: Ship) => boolean,
  ): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        this.release(p);
        continue;
      }

      if (p.homing && p.target) {
        if (!p.target.alive || (canTrack && !canTrack(p.target))) {
          p.target = null;
          p.warningEta = Infinity;
        } else {
          // Steer toward target, accelerate up to max speed.
          steer.copy(p.target.position).sub(p.mesh.position).normalize();
          const speed = Math.min(p.maxSpeed, p.velocity.length() + p.accel * dt);
          const dir = p.velocity.normalize();
          const angle = dir.angleTo(steer);
          const maxTurn = p.turnRate * dt;
          if (angle > 1e-4) {
            const t = Math.min(1, maxTurn / angle);
            dir.lerp(steer, t).normalize();
          }
          p.velocity.copy(dir).multiplyScalar(speed);
        }
      }

      if (p.kind === 'missile') {
        // Fixed-rate exhaust keeps missile cost stable across frame rates.
        p.trailTimer -= dt;
        if (p.trailTimer <= 0) {
          p.trailTimer += 0.035;
          trailVel.set(0, 0, 0);
          this.particles.spawn({
            position: p.mesh.position,
            velocity: trailVel,
            color: p.trailColor,
            size: 1.6,
            life: 0.45,
          });
        }
      }

      newPos.copy(p.mesh.position).addScaledVector(p.velocity, dt);

      // Swept collision along this frame's travel segment.
      let hitSomething = false;
      let hitShip: Ship | null = null;
      let hitAsteroid: AsteroidBody | null = null;
      let hitDistanceSq = Infinity;
      if (terrainHit?.(p.mesh.position, newPos, closest)) {
        hitSomething = true;
        hitDistanceSq = closest.distanceToSquared(p.mesh.position);
        bestPoint.copy(closest);
      }
      const targets: readonly Ship[] =
        p.faction === 'player' ? enemies : player && player.alive ? [player] : [];
      for (const ship of targets) {
        if (!ship.alive) continue;
        if (ship.intersectSegment(p.mesh.position, newPos, closest)) {
          const distanceSq = closest.distanceToSquared(p.mesh.position);
          if (distanceSq < hitDistanceSq) {
            hitSomething = true;
            hitDistanceSq = distanceSq;
            hitShip = ship;
            hitAsteroid = null;
            bestPoint.copy(closest);
          }
        }
      }
      {
        for (const a of asteroids) {
          if (a.destroyed) continue;
          // Cheap broadphase: skip rocks far from the segment start.
          if (Math.abs(a.position.x - newPos.x) > a.radius + 40) continue;
          if (Math.abs(a.position.y - newPos.y) > a.radius + 40) continue;
          if (Math.abs(a.position.z - newPos.z) > a.radius + 40) continue;
          // A bolt that STARTS inside a body's bound is exiting its own
          // mount (rooftop turret, asteroid emplacement) — it can't hit that
          // body until it's outside, or it detonates at the muzzle.
          if (insideBody(p.mesh.position, a)) continue;
          const bodyHit = a.box
            ? segmentHitsAabb(p.mesh.position, newPos, a, closest)
            : segmentHitsSphere(p.mesh.position, newPos, a.position, a.radius, closest);
          if (bodyHit) {
            const distanceSq = closest.distanceToSquared(p.mesh.position);
            if (distanceSq < hitDistanceSq) {
              hitSomething = true;
              hitDistanceSq = distanceSq;
              hitShip = null;
              hitAsteroid = a;
              bestPoint.copy(closest);
            }
          }
        }
      }

      if (hitSomething) {
        onHit({
          ship: hitShip,
          asteroid: hitAsteroid,
          point: bestPoint.clone(),
          damage: p.damage,
          faction: p.faction,
          wasMissile: p.kind === 'missile',
        });
        this.release(p);
        continue;
      }

      p.mesh.position.copy(newPos);
      p.mesh.lookAt(lookPoint.copy(newPos).add(p.velocity));
    }
  }

  clear(): void {
    for (const p of this.pool) this.release(p);
  }

  /** Reused warning snapshot for the HUD; no per-frame allocations. */
  incomingThreat(player: Ship): Readonly<MissileThreat> {
    const threat = this.threat;
    threat.locked = false;
    threat.imminent = false;
    threat.timeToImpact = Infinity;
    threat.count = 0;
    for (const p of this.pool) {
      if (
        !p.active || p.faction !== 'enemy' || p.kind !== 'missile' ||
        !p.homing || p.target !== player
      ) continue;
      threat.locked = true;
      threat.count++;
      threatToPlayer.copy(player.position).sub(p.mesh.position);
      const distance = Math.max(0, threatToPlayer.length() - player.radius);
      if (distance <= 1e-5) {
        p.warningEta = 0;
        threat.timeToImpact = 0;
        threat.imminent = true;
        continue;
      }
      threatToPlayer.divideScalar(distance + player.radius);
      const missileSpeed = p.velocity.length();
      const playerRadialSpeed = player.velocity.dot(threatToPlayer);
      const radialClosingSpeed = p.velocity.dot(threatToPlayer) - playerRadialSpeed;
      // Once a seeker has passed the player its ETA would rise while it loops
      // around. Drop the imminent timer until it is genuinely inbound again.
      if (radialClosingSpeed <= 0) {
        p.warningEta = Infinity;
        continue;
      }
      const currentPursuitSpeed = Math.max(1, missileSpeed - playerRadialSpeed);
      const maximumPursuitSpeed = Math.max(
        currentPursuitSpeed,
        p.maxSpeed - playerRadialSpeed,
      );
      // Project the accelerating pursuit rather than dividing by the current
      // radial closing speed. The old estimate stayed infinite while a seeker
      // turned, then jumped straight to ~0.6 s as soon as its nose aligned.
      const travelTime = acceleratingTravelTime(
        distance,
        currentPursuitSpeed,
        p.accel,
        maximumPursuitSpeed,
      );
      const alignment = missileSpeed > 1e-5
        ? Math.max(-1, Math.min(1, p.velocity.dot(threatToPlayer) / missileSpeed))
        : 1;
      const turnPenalty = p.turnRate > 0
        ? (Math.acos(alignment) / p.turnRate) * 0.35
        : 0;
      const time = travelTime + turnPenalty;
      if (time <= 2) {
        p.warningEta = Math.min(p.warningEta, time);
        threat.timeToImpact = Math.min(threat.timeToImpact, p.warningEta);
        threat.imminent = true;
      } else {
        p.warningEta = Infinity;
      }
    }
    return threat;
  }

  /** Test-harness snapshot; intentionally allocates only when explicitly called. */
  debugSnapshot(): ProjectileSnapshot[] {
    return this.pool
      .filter((p) => p.active)
      .map((p) => ({
        faction: p.faction,
        kind: p.kind,
        homing: p.homing,
        hasTarget: p.target !== null,
        speed: p.velocity.length(),
      }));
  }

  private acquire(): Projectile | null {
    for (const p of this.pool) {
      if (!p.active) return p;
    }
    return null;
  }

  private release(p: Projectile): void {
    p.active = false;
    p.mesh.visible = false;
    p.target = null;
    p.warningEta = Infinity;
  }
}

/** Time to cover a distance while accelerating to a capped pursuit speed. */
function acceleratingTravelTime(
  distance: number,
  initialSpeed: number,
  acceleration: number,
  maximumSpeed: number,
): number {
  if (distance <= 0) return 0;
  const start = Math.max(1, Math.min(initialSpeed, maximumSpeed));
  if (acceleration <= 1e-5 || maximumSpeed <= start + 1e-5) {
    return distance / start;
  }
  const accelerationTime = (maximumSpeed - start) / acceleration;
  const accelerationDistance =
    start * accelerationTime + 0.5 * acceleration * accelerationTime ** 2;
  if (distance <= accelerationDistance) {
    return (Math.sqrt(start * start + 2 * acceleration * distance) - start) / acceleration;
  }
  return accelerationTime + (distance - accelerationDistance) / maximumSpeed;
}

function insideBody(point: Vector3, body: AsteroidBody): boolean {
  if (body.box) {
    return (
      Math.abs(point.x - body.position.x) < body.box.hx &&
      Math.abs(point.y - body.position.y) < body.box.hy &&
      Math.abs(point.z - body.position.z) < body.box.hz
    );
  }
  return point.distanceToSquared(body.position) < body.radius * body.radius;
}

/** Slab-method segment vs axis-aligned box; writes entry point to `out`. */
function segmentHitsAabb(a: Vector3, b: Vector3, body: AsteroidBody, out: Vector3): boolean {
  const box = body.box!;
  let tMin = 0;
  let tMax = 1;
  const axes: ['x' | 'y' | 'z', number][] = [['x', box.hx], ['y', box.hy], ['z', box.hz]];
  for (const [axis, half] of axes) {
    const start = a[axis] - body.position[axis];
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-8) {
      if (Math.abs(start) > half) return false;
      continue;
    }
    let t1 = (-half - start) / delta;
    let t2 = (half - start) / delta;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  out.copy(a).lerp(b, tMin);
  return true;
}

/** Closest-approach test of segment AB vs sphere; writes hit point to `out`. */
function segmentHitsSphere(
  a: Vector3,
  b: Vector3,
  center: Vector3,
  radius: number,
  out: Vector3,
): boolean {
  seg.copy(b).sub(a);
  toCenter.copy(center).sub(a);
  const segLenSq = seg.lengthSq();
  const t = segLenSq > 1e-8 ? Math.max(0, Math.min(1, toCenter.dot(seg) / segLenSq)) : 0;
  out.copy(a).addScaledVector(seg, t);
  return out.distanceToSquared(center) <= radius * radius;
}
