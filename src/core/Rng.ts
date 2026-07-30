/**
 * Seeded deterministic RNG (mulberry32). All gameplay/world randomness flows
 * through an Rng instance so test scenes reproduce pixel-identical renders
 * from the same seed.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, maxInclusive: number): number {
    return min + Math.floor(this.next() * (maxInclusive - min + 1));
  }

  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Random unit vector components (x, y, z). */
  unitSphere(): [number, number, number] {
    const z = this.range(-1, 1);
    const a = this.range(0, Math.PI * 2);
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    return [r * Math.cos(a), r * Math.sin(a), z];
  }

  /** Derive an independent child stream (e.g. one per subsystem). */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 0xffffffff));
  }
}
