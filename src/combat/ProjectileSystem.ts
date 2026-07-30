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
import { MISSILE } from './WeaponDefs';

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

interface Projectile {
  active: boolean;
  mesh: Mesh;
  material: MeshBasicMaterial;
  velocity: Vector3;
  damage: number;
  faction: Faction;
  life: number;
  homing: boolean;
  target: Ship | null;
  trailColor: Color;
}

const newPos = new Vector3();
const seg = new Vector3();
const toCenter = new Vector3();
const closest = new Vector3();
const bestPoint = new Vector3();
const lookPoint = new Vector3();
const steer = new Vector3();
const trailVel = new Vector3();

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
        homing: false,
        target: null,
        trailColor: new Color(),
      });
    }
  }

  spawnBolt(s: BoltSpawn): void {
    const p = this.acquire();
    if (!p) return;
    p.active = true;
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
    const p = this.acquire();
    if (!p) return;
    p.active = true;
    p.homing = true;
    p.target = target;
    p.damage = MISSILE.damage;
    p.faction = 'player';
    p.life = MISSILE.life;
    p.velocity.copy(direction).normalize().multiplyScalar(MISSILE.speed);
    p.material.color.copy(MISSILE.color).multiplyScalar(2.6);
    p.trailColor.copy(MISSILE.color);
    p.mesh.visible = true;
    p.mesh.position.copy(position);
    p.mesh.scale.set(0.3, 0.3, 1.6);
    p.mesh.lookAt(newPos.copy(position).add(direction));
  }

  update(
    dt: number,
    enemies: readonly Ship[],
    player: Ship | null,
    asteroids: readonly AsteroidBody[],
    onHit: (hit: ProjectileHit) => void,
    terrainHit?: (from: Vector3, to: Vector3, out: Vector3) => boolean,
  ): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        this.release(p);
        continue;
      }

      if (p.homing && p.target) {
        if (!p.target.alive) {
          p.target = null;
        } else {
          // Steer toward target, accelerate up to max speed.
          steer.copy(p.target.position).sub(p.mesh.position).normalize();
          const speed = Math.min(MISSILE.maxSpeed, p.velocity.length() + MISSILE.accel * dt);
          const dir = p.velocity.normalize();
          const angle = dir.angleTo(steer);
          const maxTurn = MISSILE.turnRate * dt;
          if (angle > 1e-4) {
            const t = Math.min(1, maxTurn / angle);
            dir.lerp(steer, t).normalize();
          }
          p.velocity.copy(dir).multiplyScalar(speed);
        }
        // Exhaust trail.
        trailVel.set(0, 0, 0);
        this.particles.spawn({
          position: p.mesh.position,
          velocity: trailVel,
          color: p.trailColor,
          size: 1.6,
          life: 0.45,
        });
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
        if (segmentHitsSphere(p.mesh.position, newPos, ship.position, ship.radius, closest)) {
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
          wasMissile: p.homing,
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
  }
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
