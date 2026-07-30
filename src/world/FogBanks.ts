import {
  AdditiveBlending,
  Color,
  Group,
  Sprite,
  SpriteMaterial,
} from 'three';
import { Rng } from '../core/Rng';
import { getNebulaBlobTexture } from '../fx/textures';

/**
 * Volumetric-style nebula banks: large, very faint additive sprites drifting
 * through the play space. Flying through them gives depth, parallax and that
 * "the nebula is a place, not a backdrop" feel — the cheap-but-convincing
 * stand-in for real volumetrics. Each bank slowly rotates so the haze never
 * reads as a static card.
 */
export class FogBanks {
  readonly group = new Group();
  private readonly sprites: { sprite: Sprite; spin: number }[] = [];

  constructor(rng: Rng, primary: Color, secondary: Color, count = 26, radius = 850) {
    for (let i = 0; i < count; i++) {
      const color = primary.clone().lerp(secondary, rng.next()).multiplyScalar(rng.range(0.9, 1.4));
      const material = new SpriteMaterial({
        map: getNebulaBlobTexture(rng.int(0, 2)),
        color,
        transparent: true,
        opacity: rng.range(0.35, 0.6), // blob texture itself is very faint
        blending: AdditiveBlending,
        depthWrite: false,
        rotation: rng.range(0, Math.PI * 2),
      });
      const sprite = new Sprite(material);
      const [dx, dy, dz] = rng.unitSphere();
      const dist = Math.pow(rng.next(), 0.7) * radius;
      sprite.position.set(dx * dist, dy * dist * 0.4, dz * dist);
      sprite.scale.setScalar(rng.range(140, 420));
      this.group.add(sprite);
      this.sprites.push({ sprite, spin: rng.range(-0.02, 0.02) });
    }
  }

  update(dt: number): void {
    for (const s of this.sprites) {
      (s.sprite.material as SpriteMaterial).rotation += s.spin * dt;
    }
  }
}
