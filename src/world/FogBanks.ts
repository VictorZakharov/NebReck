import {
  AdditiveBlending,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Vector3,
} from 'three';
import { Rng } from '../core/Rng';
import { getNebulaBlobTexture } from '../fx/textures';

interface FogSprite {
  position: Vector3;
  color: Color;
  size: number;
  opacity: number;
  angle: number;
  spin: number;
}

interface FogBatch {
  angles: InstancedBufferAttribute;
  spins: Float32Array;
}

/**
 * Volumetric-style nebula banks rendered as three instanced billboard draws
 * (one per blob texture). The former Sprite-per-cloud path cost 26 draw calls
 * even though every bank is just a translucent quad.
 */
export class FogBanks {
  readonly group = new Group();
  private readonly batches: FogBatch[] = [];

  constructor(rng: Rng, primary: Color, secondary: Color, count = 26, radius = 850) {
    const buckets: FogSprite[][] = [[], [], []];
    for (let i = 0; i < count; i++) {
      const color = primary.clone().lerp(secondary, rng.next()).multiplyScalar(rng.range(0.9, 1.4));
      const textureIndex = rng.int(0, 2);
      const opacity = rng.range(0.35, 0.6);
      const angle = rng.range(0, Math.PI * 2);
      const [dx, dy, dz] = rng.unitSphere();
      const dist = Math.pow(rng.next(), 0.7) * radius;
      buckets[textureIndex].push({
        position: new Vector3(dx * dist, dy * dist * 0.4, dz * dist),
        color,
        size: rng.range(140, 420),
        opacity,
        angle,
        spin: rng.range(-0.02, 0.02),
      });
    }

    buckets.forEach((sprites, textureIndex) => {
      if (sprites.length === 0) return;
      const geometry = billboardGeometry(sprites);
      const angles = geometry.getAttribute('aAngle') as InstancedBufferAttribute;
      const material = new ShaderMaterial({
        uniforms: { uMap: { value: getNebulaBlobTexture(textureIndex) } },
        vertexShader: FOG_VERTEX,
        fragmentShader: FOG_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.batches.push({ angles, spins: Float32Array.from(sprites, (sprite) => sprite.spin) });
    });
  }

  update(dt: number): void {
    for (const { angles, spins } of this.batches) {
      const values = angles.array as Float32Array;
      for (let i = 0; i < values.length; i++) values[i] += spins[i] * dt;
      angles.needsUpdate = true;
    }
  }
}

function billboardGeometry(sprites: FogSprite[]): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute('position', new Float32BufferAttribute([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
  ], 3));
  geometry.setAttribute('uv', new Float32BufferAttribute([
    0, 0, 1, 0, 1, 1, 0, 1,
  ], 2));
  geometry.setAttribute('aOffset', new InstancedBufferAttribute(
    Float32Array.from(sprites.flatMap((sprite) => sprite.position.toArray())), 3,
  ));
  geometry.setAttribute('aColor', new InstancedBufferAttribute(
    Float32Array.from(sprites.flatMap((sprite) => sprite.color.toArray())), 3,
  ));
  geometry.setAttribute('aSize', new InstancedBufferAttribute(
    Float32Array.from(sprites, (sprite) => sprite.size), 1,
  ));
  geometry.setAttribute('aOpacity', new InstancedBufferAttribute(
    Float32Array.from(sprites, (sprite) => sprite.opacity), 1,
  ));
  geometry.setAttribute('aAngle', new InstancedBufferAttribute(
    Float32Array.from(sprites, (sprite) => sprite.angle), 1,
  ));
  geometry.instanceCount = sprites.length;
  return geometry;
}

const FOG_VERTEX = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aOpacity;
  attribute float aAngle;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vOpacity;
  void main() {
    vec4 viewCenter = modelViewMatrix * vec4(aOffset, 1.0);
    float c = cos(aAngle);
    float s = sin(aAngle);
    vec2 corner = mat2(c, -s, s, c) * position.xy * aSize;
    viewCenter.xy += corner;
    gl_Position = projectionMatrix * viewCenter;
    vUv = uv;
    vColor = aColor;
    vOpacity = aOpacity;
  }
`;

const FOG_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vOpacity;
  void main() {
    vec4 blob = texture2D(uMap, vUv);
    if (blob.a < 0.002) discard;
    gl_FragColor = vec4(blob.rgb * vColor, blob.a * vOpacity);
  }
`;
