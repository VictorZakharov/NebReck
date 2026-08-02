import {
  AdditiveBlending,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/Rng';

export interface ExplosionVolumeStyle {
  lobes: number;
  ringRadius: number;
  ringOpacity: number;
  doubleRing: boolean;
}

interface VolumeLobe {
  offset: Vector3;
  axis: Vector3;
  stretch: Vector3;
  delay: number;
  growth: number;
  spin: number;
  angle: number;
}

interface VolumeSlot {
  active: boolean;
  age: number;
  duration: number;
  scale: number;
  origin: Vector3;
  ringRadius: number;
  ringOpacity: number;
  doubleRing: boolean;
  lobeCount: number;
  lobes: VolumeLobe[];
}

export interface ExplosionVolumeDiagnostics {
  activeFireballs: number;
  drawCalls: number;
}

const MAX_LOBES = 5;
const SHOCKS_PER_SLOT = 2;
const TAU = Math.PI * 2;

/**
 * Two-draw-call pool of true 3D explosion geometry. Distorted emissive
 * icospheres form the hot fireball; expanding Fresnel spheres form shock
 * fronts. Every instance remains correct under camera orbit without creating
 * meshes, materials, lights, or garbage during combat.
 */
export class ExplosionVolumes {
  readonly group = new Group();

  private readonly slots: VolumeSlot[];
  private readonly fireballs: InstancedMesh;
  private readonly shocks: InstancedMesh;
  private readonly fireProgress: InstancedBufferAttribute;
  private readonly fireOpacity: InstancedBufferAttribute;
  private readonly fireSeed: InstancedBufferAttribute;
  private readonly shockOpacity: InstancedBufferAttribute;
  private readonly shockSeed: InstancedBufferAttribute;
  private readonly fireMaterial: ShaderMaterial;
  private readonly shockMaterial: ShaderMaterial;
  private readonly matrix = new Matrix4();
  private readonly rotation = new Quaternion();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private activeFireballs = 0;

  constructor(private readonly poolSize: number) {
    const fireCapacity = poolSize * MAX_LOBES;
    const fireGeometry = new IcosahedronGeometry(1, 2);
    this.fireProgress = new InstancedBufferAttribute(new Float32Array(fireCapacity), 1);
    this.fireOpacity = new InstancedBufferAttribute(new Float32Array(fireCapacity), 1);
    this.fireSeed = new InstancedBufferAttribute(new Float32Array(fireCapacity), 1);
    fireGeometry.setAttribute('aProgress', this.fireProgress);
    fireGeometry.setAttribute('aOpacity', this.fireOpacity);
    fireGeometry.setAttribute('aSeed', this.fireSeed);
    this.fireMaterial = makeFireMaterial();
    this.fireballs = new InstancedMesh(fireGeometry, this.fireMaterial, fireCapacity);

    const shockCapacity = poolSize * SHOCKS_PER_SLOT;
    const shockGeometry = new SphereGeometry(1, 24, 16);
    this.shockOpacity = new InstancedBufferAttribute(new Float32Array(shockCapacity), 1);
    this.shockSeed = new InstancedBufferAttribute(new Float32Array(shockCapacity), 1);
    shockGeometry.setAttribute('aOpacity', this.shockOpacity);
    shockGeometry.setAttribute('aSeed', this.shockSeed);
    this.shockMaterial = makeShockMaterial();
    this.shocks = new InstancedMesh(shockGeometry, this.shockMaterial, shockCapacity);

    for (const mesh of [this.fireballs, this.shocks]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      this.group.add(mesh);
    }

    this.slots = Array.from({ length: poolSize }, () => ({
      active: false,
      age: 0,
      duration: 1,
      scale: 1,
      origin: new Vector3(),
      ringRadius: 1,
      ringOpacity: 0,
      doubleRing: false,
      lobeCount: 0,
      lobes: Array.from({ length: MAX_LOBES }, () => ({
        offset: new Vector3(),
        axis: new Vector3(0, 1, 0),
        stretch: new Vector3(1, 1, 1),
        delay: 0,
        growth: 1,
        spin: 0,
        angle: 0,
      })),
    }));
    for (let index = 0; index < fireCapacity; index++) this.hideFireball(index);
    for (let index = 0; index < shockCapacity; index++) this.hideShock(index);
    this.markDirty();
  }

  spawn(
    slotIndex: number,
    origin: Vector3,
    scale: number,
    duration: number,
    style: ExplosionVolumeStyle,
    rng: Rng,
  ): void {
    const slot = this.slots[slotIndex];
    slot.active = true;
    slot.age = 0;
    slot.duration = duration;
    slot.scale = scale;
    slot.origin.copy(origin);
    slot.ringRadius = style.ringRadius;
    slot.ringOpacity = style.ringOpacity;
    slot.doubleRing = style.doubleRing;
    slot.lobeCount = Math.min(MAX_LOBES, style.lobes);

    for (let index = 0; index < MAX_LOBES; index++) {
      const instance = slotIndex * MAX_LOBES + index;
      if (index >= slot.lobeCount) {
        this.hideFireball(instance);
        continue;
      }
      const lobe = slot.lobes[index];
      const [x, y, z] = rng.unitSphere();
      lobe.offset
        .set(x, y, z)
        .multiplyScalar(index === 0 ? 0 : rng.range(0.8, 4.2) * scale);
      const [ax, ay, az] = rng.unitSphere();
      lobe.axis.set(ax, ay, az);
      lobe.stretch.set(rng.range(0.82, 1.25), rng.range(0.82, 1.25), rng.range(0.82, 1.25));
      lobe.delay = index === 0 ? 0 : rng.range(0.035, 0.22);
      lobe.growth = index === 0 ? rng.range(5.4, 7.2) : rng.range(3.2, 5.8);
      lobe.spin = rng.range(-1.8, 1.8);
      lobe.angle = rng.range(0, TAU);
      this.fireSeed.setX(instance, rng.range(0, 100));
    }
    this.shockSeed.setX(slotIndex * 2, rng.range(0, 100));
    this.shockSeed.setX(slotIndex * 2 + 1, rng.range(0, 100));
    this.markDirty();
  }

  update(dt: number): void {
    this.fireMaterial.uniforms.uTime.value += dt;
    this.shockMaterial.uniforms.uTime.value += dt;
    this.activeFireballs = 0;
    for (let slotIndex = 0; slotIndex < this.poolSize; slotIndex++) {
      const slot = this.slots[slotIndex];
      if (!slot.active) continue;
      slot.age += dt;
      if (slot.age >= slot.duration) {
        this.deactivate(slotIndex);
        continue;
      }
      this.updateFireballs(slotIndex, slot);
      this.updateShocks(slotIndex, slot);
    }
    this.markDirty();
  }

  deactivate(slotIndex: number): void {
    const slot = this.slots[slotIndex];
    slot.active = false;
    for (let index = 0; index < MAX_LOBES; index++) {
      this.hideFireball(slotIndex * MAX_LOBES + index);
    }
    this.hideShock(slotIndex * 2);
    this.hideShock(slotIndex * 2 + 1);
  }

  diagnostics(): ExplosionVolumeDiagnostics {
    return { activeFireballs: this.activeFireballs, drawCalls: 2 };
  }

  private updateFireballs(slotIndex: number, slot: VolumeSlot): void {
    for (let index = 0; index < MAX_LOBES; index++) {
      const instance = slotIndex * MAX_LOBES + index;
      if (index >= slot.lobeCount) continue;
      const lobe = slot.lobes[index];
      const localAge = slot.age - lobe.delay;
      const life = slot.duration * 0.78;
      if (localAge < 0 || localAge >= life) {
        this.hideFireball(instance);
        continue;
      }
      const progress = localAge / life;
      const expansion = 1 - (1 - progress) ** 3;
      const fadeIn = Math.min(1, progress / 0.045);
      const fadeOut = 1 - smoothstep(0.42, 1, progress);
      const radius = (0.9 + lobe.growth * 0.52 * expansion) * slot.scale;
      this.position.copy(slot.origin).addScaledVector(lobe.offset, expansion);
      this.rotation.setFromAxisAngle(lobe.axis, lobe.angle + lobe.spin * localAge);
      this.scale.copy(lobe.stretch).multiplyScalar(radius);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.fireballs.setMatrixAt(instance, this.matrix);
      this.fireProgress.setX(instance, progress);
      this.fireOpacity.setX(instance, fadeIn * fadeOut * 0.78);
      this.activeFireballs++;
    }
  }

  private updateShocks(slotIndex: number, slot: VolumeSlot): void {
    this.updateShock(slotIndex * 2, slot, slot.age / (slot.duration * 0.72), 1, 1);
    const secondProgress = (slot.age - 0.09) / (slot.duration * 0.88);
    if (slot.doubleRing) {
      this.updateShock(slotIndex * 2 + 1, slot, secondProgress, 0.72, 0.46);
    } else {
      this.hideShock(slotIndex * 2 + 1);
    }
  }

  private updateShock(
    instance: number,
    slot: VolumeSlot,
    progress: number,
    radiusScale: number,
    opacityScale: number,
  ): void {
    if (progress < 0 || progress >= 1) {
      this.hideShock(instance);
      return;
    }
    const eased = 1 - (1 - progress) ** 2;
    const radius = (1 + eased * slot.ringRadius * 0.5 * radiusScale) * slot.scale;
    this.scale.setScalar(radius);
    this.matrix.compose(slot.origin, this.rotation.identity(), this.scale);
    this.shocks.setMatrixAt(instance, this.matrix);
    this.shockOpacity.setX(
      instance,
      slot.ringOpacity * opacityScale * (1 - progress) ** 1.45,
    );
  }

  private hideFireball(index: number): void {
    this.scale.setScalar(0);
    this.matrix.compose(this.position.set(0, 0, 0), this.rotation.identity(), this.scale);
    this.fireballs.setMatrixAt(index, this.matrix);
    this.fireOpacity.setX(index, 0);
  }

  private hideShock(index: number): void {
    this.scale.setScalar(0);
    this.matrix.compose(this.position.set(0, 0, 0), this.rotation.identity(), this.scale);
    this.shocks.setMatrixAt(index, this.matrix);
    this.shockOpacity.setX(index, 0);
  }

  private markDirty(): void {
    this.fireballs.instanceMatrix.needsUpdate = true;
    this.shocks.instanceMatrix.needsUpdate = true;
    this.fireProgress.needsUpdate = true;
    this.fireOpacity.needsUpdate = true;
    this.fireSeed.needsUpdate = true;
    this.shockOpacity.needsUpdate = true;
    this.shockSeed.needsUpdate = true;
  }
}

function makeFireMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute float aProgress;
      attribute float aOpacity;
      attribute float aSeed;
      varying vec3 vLocal;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying float vProgress;
      varying float vOpacity;
      varying float vSeed;
      void main() {
        vec3 unitPosition = normalize(position);
        float coarse = sin(unitPosition.x * 5.3 + aSeed) *
          sin(unitPosition.y * 6.7 - aSeed * 0.7) *
          sin(unitPosition.z * 4.9 + uTime * 2.6);
        float detail = sin(dot(unitPosition, vec3(13.1, 17.7, 11.3)) + aSeed * 2.1 - uTime * 4.2);
        vec3 displaced = position * (1.0 + coarse * 0.19 + detail * 0.07 * (1.0 - aProgress));
        mat4 instanceWorld = modelMatrix * instanceMatrix;
        vec4 worldPosition = instanceWorld * vec4(displaced, 1.0);
        vLocal = unitPosition;
        vWorldNormal = normalize(mat3(instanceWorld) * unitPosition);
        vWorldPosition = worldPosition.xyz;
        vProgress = aProgress;
        vOpacity = aOpacity;
        vSeed = aSeed;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vLocal;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying float vProgress;
      varying float vOpacity;
      varying float vSeed;
      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float rim = pow(1.0 - abs(dot(normalize(vWorldNormal), viewDirection)), 1.6);
        float coarse = 0.5 + 0.5 * sin(dot(vLocal, vec3(7.1, 9.7, 12.3)) + vSeed + uTime * 2.1);
        float detail = 0.5 + 0.5 * sin(dot(vLocal, vec3(19.7, -14.1, 16.9)) - vSeed * 1.7 - uTime * 3.4);
        float turbulence = coarse * 0.62 + detail * 0.38;
        float heat = max(0.0, 1.0 - vProgress * 1.32);
        vec3 ember = vec3(0.42, 0.015, 0.002);
        vec3 orange = vec3(2.2, 0.24, 0.018);
        vec3 whiteHot = vec3(5.1, 2.0, 0.38);
        vec3 color = mix(ember, orange, heat);
        color = mix(color, whiteHot, heat * heat * (0.4 + turbulence * 0.6));
        color *= 0.62 + turbulence * 0.72 + rim * 0.16;
        float breakup = smoothstep(0.18, 0.72, turbulence + heat * 0.34);
        float alpha = vOpacity * (0.38 + turbulence * 0.48) * breakup * (0.9 + rim * 0.1);
        if (alpha <= 0.003) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

function makeShockMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
    vertexShader: /* glsl */ `
      attribute float aOpacity;
      attribute float aSeed;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying float vOpacity;
      varying float vSeed;
      void main() {
        mat4 instanceWorld = modelMatrix * instanceMatrix;
        vec4 worldPosition = instanceWorld * vec4(position, 1.0);
        vWorldNormal = normalize(mat3(instanceWorld) * normal);
        vWorldPosition = worldPosition.xyz;
        vOpacity = aOpacity;
        vSeed = aSeed;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying float vOpacity;
      varying float vSeed;
      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float edge = 1.0 - abs(dot(normalize(vWorldNormal), viewDirection));
        float fresnel = smoothstep(0.58, 0.96, edge);
        fresnel *= fresnel;
        float breakup = 0.72 + 0.28 * sin(
          dot(normalize(vWorldNormal), vec3(17.0, 23.0, 13.0)) + vSeed + uTime * 2.0
        );
        float alpha = vOpacity * fresnel * breakup * 0.78;
        if (alpha <= 0.003) discard;
        gl_FragColor = vec4(vec3(2.6, 0.72, 0.12), alpha);
      }
    `,
  });
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
