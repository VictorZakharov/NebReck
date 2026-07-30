import { AdditiveBlending, Color, Group, Sprite, SpriteMaterial, Vector3 } from 'three';
import { getRingTexture } from './textures';

interface Pulse {
  active: boolean;
  age: number;
  sprite: Sprite;
}

const DURATION = 0.7;

/** Pooled expanding energy rings (EMP burst, jump shockwave). */
export class PulseRing {
  readonly group = new Group();
  private readonly pool: Pulse[] = [];

  constructor(poolSize = 4) {
    for (let i = 0; i < poolSize; i++) {
      const sprite = new Sprite(
        new SpriteMaterial({
          map: getRingTexture(),
          color: new Color(0.4, 1.6, 1.5),
          blending: AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      );
      sprite.visible = false;
      this.group.add(sprite);
      this.pool.push({ active: false, age: 0, sprite });
    }
  }

  spawn(position: Vector3, maxRadius: number, color?: Color): void {
    const p = this.pool.find((x) => !x.active) ?? this.pool[0];
    p.active = true;
    p.age = 0;
    p.sprite.position.copy(position);
    p.sprite.visible = true;
    if (color) p.sprite.material.color.copy(color);
    p.sprite.userData.maxRadius = maxRadius;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dt;
      const t = p.age / DURATION;
      if (t >= 1) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      const max = (p.sprite.userData.maxRadius as number) ?? 100;
      p.sprite.scale.setScalar(Math.pow(t, 0.6) * max * 2);
      p.sprite.material.opacity = 0.9 * (1 - t);
    }
  }
}
