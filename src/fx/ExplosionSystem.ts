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
import { ExplosionVolumes } from './ExplosionVolumes';
import { getGlowTexture } from './textures';
import { SmokeCloudKind, VolumetricSmoke } from './VolumetricSmoke';

export type ExplosionPreset = 'impact' | 'missile' | 'ship' | 'capital';

interface ExplosionStyle {
  duration: number;
  lobes: number;
  sparks: number;
  embers: number;
  flashRadius: number;
  ringRadius: number;
  ringOpacity: number;
  doubleRing: boolean;
  smoke: SmokeCloudKind | null;
  lightColor: number;
}

interface ExplosionInstance {
  index: number;
  active: boolean;
  age: number;
  duration: number;
  scale: number;
  preset: ExplosionPreset;
  flash: Sprite;
  flare: Sprite;
  light: PointLight | null;
}

export interface ExplosionDiagnostics {
  activeExplosions: number;
  activeSmokePuffs: number;
  smokeCapacity: number;
  smokeRadius: number;
  activeFireballVolumes: number;
  volumeDrawCalls: number;
}

const STYLES: Readonly<Record<ExplosionPreset, ExplosionStyle>> = {
  impact: {
    duration: 0.34,
    lobes: 0,
    sparks: 12,
    embers: 0,
    flashRadius: 2.6,
    ringRadius: 7.5,
    ringOpacity: 0.26,
    doubleRing: false,
    smoke: null,
    lightColor: 0x70dfff,
  },
  missile: {
    duration: 1.08,
    lobes: 3,
    sparks: 30,
    embers: 14,
    flashRadius: 12,
    ringRadius: 34,
    ringOpacity: 0.46,
    doubleRing: true,
    smoke: 'missile',
    lightColor: 0xff9b38,
  },
  ship: {
    duration: 1.48,
    lobes: 4,
    sparks: 42,
    embers: 24,
    flashRadius: 15,
    ringRadius: 42,
    ringOpacity: 0.52,
    doubleRing: true,
    smoke: 'ship',
    lightColor: 0xff7a28,
  },
  capital: {
    duration: 2.25,
    lobes: 5,
    sparks: 58,
    embers: 34,
    flashRadius: 20,
    ringRadius: 54,
    ringOpacity: 0.58,
    doubleRing: true,
    smoke: 'capital',
    lightColor: 0xff5f20,
  },
};

const spawnVelocity = new Vector3();
const HOT = new Color(1, 0.86, 0.42);
const MID = new Color(1, 0.38, 0.08);
const EMBER = new Color(0.9, 0.12, 0.025);

/**
 * Bounded cinematic explosion stack: HDR flash and anamorphic flare, layered
 * irregular fireball lobes, two expanding shock fronts, sparks/embers, nearby
 * illumination, and a one-draw-call cloud of dissipating volumetric smoke.
 * The default impact preset deliberately emits no smoke for energy/laser hits.
 */
export class ExplosionSystem {
  readonly group = new Group();
  private readonly instances: ExplosionInstance[] = [];
  private readonly smoke = new VolumetricSmoke();
  private readonly lastSmokeOrigin = new Vector3();
  private readonly volumes: ExplosionVolumes;

  constructor(
    private readonly particles: ParticleSystem,
    private readonly rng: Rng,
    poolSize = 12,
  ) {
    this.volumes = new ExplosionVolumes(poolSize);
    this.group.add(this.smoke.points, this.volumes.group);
    for (let index = 0; index < poolSize; index++) {
      const flash = makeSprite(getGlowTexture(), new Color(4.4, 2.15, 0.55));
      const flare = makeSprite(getGlowTexture(), new Color(3.1, 0.82, 0.12));
      this.group.add(flash, flare);

      // Light objects remain in the scene at zero intensity. Changing the light
      // count at runtime recompiles every lit material and hitches the first kill.
      let light: PointLight | null = null;
      if (index < 4) {
        light = new PointLight(0xff8a30, 0, 320, 1.7);
        this.group.add(light);
      }
      this.instances.push({
        index,
        active: false,
        age: 0,
        duration: 1,
        scale: 1,
        preset: 'impact',
        flash,
        flare,
        light,
      });
    }
  }

  /** scale ~1 for a fighter, ~2+ for large ships. Energy impacts default smoke-free. */
  spawn(position: Vector3, scale = 1, preset: ExplosionPreset = 'impact'): void {
    const instance = this.acquireInstance();
    const style = STYLES[preset];
    instance.active = true;
    instance.age = 0;
    instance.duration = style.duration * (0.92 + Math.min(3, scale) * 0.08);
    instance.scale = scale;
    instance.preset = preset;
    for (const sprite of [instance.flash, instance.flare]) {
      sprite.position.copy(position);
      sprite.visible = true;
      sprite.material.opacity = 0;
    }
    if (instance.light) {
      instance.light.position.copy(position);
      instance.light.color.setHex(style.lightColor);
      instance.light.intensity = 0;
    }

    this.volumes.spawn(instance.index, position, scale, instance.duration, style, this.rng);

    if (style.smoke) {
      this.lastSmokeOrigin.copy(position);
      this.smoke.spawnCloud(position, scale, style.smoke, this.rng);
    }
    this.spawnParticles(position, scale, style);
  }

  update(dt: number): void {
    this.smoke.update(dt);
    this.volumes.update(dt);
    for (const instance of this.instances) {
      if (!instance.active) continue;
      instance.age += dt;
      const t = instance.age / instance.duration;
      if (t >= 1) {
        this.deactivate(instance);
        continue;
      }
      const style = STYLES[instance.preset];
      const fast = Math.min(1, t * 5);
      // The camera-facing flash is only the ignition frame. Let the actual 3D
      // volume carry missile and ship blasts after that instant.
      const flashRate = instance.preset === 'impact' ? 4.4 : 9.5;
      const flashFade = Math.max(0, 1 - t * flashRate) ** 2;
      instance.flash.scale.setScalar(style.flashRadius * instance.scale * (0.45 + fast * 0.75));
      instance.flash.material.opacity = flashFade;
      instance.flare.scale.set(
        style.flashRadius * instance.scale * (2.4 + fast * 1.5),
        style.flashRadius * instance.scale * (0.18 + fast * 0.1),
        1,
      );
      const flareRate = instance.preset === 'impact' ? 6 : 10.5;
      instance.flare.material.opacity = Math.max(0, 1 - t * flareRate) * 0.8;

      if (instance.light) {
        const envelope = Math.max(0, 1 - t * 2.1) ** 2;
        const flicker = 0.88 + Math.sin(instance.age * 47 + instance.scale) * 0.12;
        instance.light.intensity = envelope * flicker * 720 * instance.scale;
        instance.light.distance = 240 + instance.scale * 90;
      }
    }
  }

  diagnostics(): ExplosionDiagnostics {
    let activeExplosions = 0;
    for (const instance of this.instances) activeExplosions += Number(instance.active);
    const volumeDiagnostics = this.volumes.diagnostics();
    return {
      activeExplosions,
      activeSmokePuffs: this.smoke.activeCount,
      smokeCapacity: this.smoke.capacity,
      smokeRadius: this.smoke.maxExtentFrom(this.lastSmokeOrigin),
      activeFireballVolumes: volumeDiagnostics.activeFireballs,
      volumeDrawCalls: volumeDiagnostics.drawCalls,
    };
  }

  private acquireInstance(): ExplosionInstance {
    const available = this.instances.find((instance) => !instance.active);
    if (available) return available;
    let oldest = this.instances[0];
    for (const instance of this.instances) {
      if (instance.age / instance.duration > oldest.age / oldest.duration) oldest = instance;
    }
    this.deactivate(oldest);
    return oldest;
  }

  private deactivate(instance: ExplosionInstance): void {
    instance.active = false;
    instance.flash.visible = false;
    instance.flare.visible = false;
    this.volumes.deactivate(instance.index);
    if (instance.light) instance.light.intensity = 0;
  }

  private spawnParticles(position: Vector3, scale: number, style: ExplosionStyle): void {
    const sparkCount = Math.min(160, Math.floor(style.sparks * Math.sqrt(scale)));
    for (let index = 0; index < sparkCount; index++) {
      const [x, y, z] = this.rng.unitSphere();
      spawnVelocity.set(x, y, z).multiplyScalar(this.rng.range(28, 82) * Math.sqrt(scale));
      this.particles.spawn({
        position,
        velocity: spawnVelocity,
        color: this.rng.chance(0.52) ? HOT : MID,
        size: this.rng.range(0.85, 1.75) * Math.sqrt(scale),
        life: this.rng.range(0.28, 0.85),
        drag: 0.17,
      });
    }
    const emberCount = Math.min(96, Math.floor(style.embers * Math.sqrt(scale)));
    for (let index = 0; index < emberCount; index++) {
      const [x, y, z] = this.rng.unitSphere();
      spawnVelocity.set(x, y, z).multiplyScalar(this.rng.range(7, 26) * Math.sqrt(scale));
      this.particles.spawn({
        position,
        velocity: spawnVelocity,
        color: EMBER,
        size: this.rng.range(1.3, 2.8) * Math.sqrt(scale),
        life: this.rng.range(0.8, 1.75),
        drag: 0.34,
      });
    }
  }
}

function makeSprite(map: ReturnType<typeof getGlowTexture>, color: Color): Sprite {
  const sprite = new Sprite(new SpriteMaterial({
    map,
    color,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  }));
  sprite.visible = false;
  sprite.renderOrder = 5;
  return sprite;
}
