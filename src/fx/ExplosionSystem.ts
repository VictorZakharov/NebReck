import {
  AdditiveBlending,
  Color,
  Group,
  PointLight,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { Rng } from '../core/Rng';
import { ParticleSystem } from './ParticleSystem';
import { getGlowTexture, getRingTexture } from './textures';

interface ExplosionInstance {
  active: boolean;
  age: number;
  duration: number;
  scale: number;
  flash: Sprite;
  ring: Sprite;
  light: PointLight | null;
}

const spawnVel = new Vector3();
const HOT = new Color(1.0, 0.85, 0.4);
const MID = new Color(1.0, 0.45, 0.12);
const EMBER = new Color(0.9, 0.2, 0.05);

/**
 * Pooled explosions: an HDR flash sprite, an expanding shockwave ring, a
 * burst of spark + ember particles, and (for the nearest few) a temporary
 * point light so blasts illuminate nearby hulls and asteroids.
 */
export class ExplosionSystem {
  readonly group = new Group();
  private readonly instances: ExplosionInstance[] = [];
  private readonly rng: Rng;

  constructor(private readonly particles: ParticleSystem, rng: Rng, poolSize = 10) {
    this.rng = rng;
    for (let i = 0; i < poolSize; i++) {
      const flash = new Sprite(
        new SpriteMaterial({
          map: getGlowTexture(),
          color: new Color(6, 4.2, 2.4), // HDR
          blending: AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      );
      flash.visible = false;
      const ring = new Sprite(
        new SpriteMaterial({
          map: getRingTexture(),
          color: new Color(2.2, 1.4, 0.7),
          blending: AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      );
      ring.visible = false;
      this.group.add(flash, ring);

      // Only the first few explosions get a real light — lights are expensive.
      // NOTE: lights stay VISIBLE at intensity 0 when idle. Toggling `visible`
      // changes the scene's light count and forces three.js to recompile every
      // lit material — a guaranteed frame hitch on the first close-range kill.
      let light: PointLight | null = null;
      if (i < 4) {
        light = new PointLight(0xffa040, 0, 260, 1.8);
        this.group.add(light);
      }
      this.instances.push({ active: false, age: 0, duration: 1, scale: 1, flash, ring, light });
    }
  }

  /** scale ~1 for a fighter, ~2+ for big ships / asteroids hits. */
  spawn(position: Vector3, scale = 1): void {
    const inst = this.instances.find((i) => !i.active) ?? this.instances[0];
    inst.active = true;
    inst.age = 0;
    inst.duration = 0.9 + scale * 0.15;
    inst.scale = scale;
    inst.flash.position.copy(position);
    inst.ring.position.copy(position);
    inst.flash.visible = true;
    inst.ring.visible = true;
    if (inst.light) {
      inst.light.position.copy(position);
    }

    // Sparks — fast, short-lived, bright.
    const sparkCount = Math.floor(26 * scale);
    for (let i = 0; i < sparkCount; i++) {
      const [x, y, z] = this.rng.unitSphere();
      spawnVel.set(x, y, z).multiplyScalar(this.rng.range(24, 70) * scale);
      this.particles.spawn({
        position,
        velocity: spawnVel,
        color: this.rng.chance(0.5) ? HOT : MID,
        size: this.rng.range(0.9, 1.8) * scale,
        life: this.rng.range(0.35, 0.8),
        drag: 0.2,
      });
    }
    // Embers — slower, linger and fade red.
    const emberCount = Math.floor(16 * scale);
    for (let i = 0; i < emberCount; i++) {
      const [x, y, z] = this.rng.unitSphere();
      spawnVel.set(x, y, z).multiplyScalar(this.rng.range(6, 22) * scale);
      this.particles.spawn({
        position,
        velocity: spawnVel,
        color: EMBER,
        size: this.rng.range(1.6, 3.0) * scale,
        life: this.rng.range(0.9, 1.6),
        drag: 0.4,
      });
    }
  }

  update(dt: number): void {
    for (const inst of this.instances) {
      if (!inst.active) continue;
      inst.age += dt;
      const t = inst.age / inst.duration;
      if (t >= 1) {
        inst.active = false;
        inst.flash.visible = false;
        inst.ring.visible = false;
        if (inst.light) inst.light.intensity = 0;
        continue;
      }
      // Flash: pops instantly, decays fast.
      const flashT = Math.min(1, t * 5);
      const flashFade = Math.max(0, 1 - t * 2.6);
      inst.flash.scale.setScalar((4 + flashT * 10) * inst.scale);
      inst.flash.material.opacity = flashFade;
      // Ring: expands linearly, fades out.
      inst.ring.scale.setScalar((2 + t * 34) * inst.scale);
      inst.ring.material.opacity = Math.max(0, 0.85 * (1 - t));
      if (inst.light) {
        inst.light.intensity = Math.max(0, 1 - t * 1.8) * 900 * inst.scale;
      }
    }
  }
}
