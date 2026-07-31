import { Vector3 } from 'three';
import { Input } from '../core/Input';
import { PlayerShip } from '../entities/PlayerShip';
import { ParticleSystem } from '../fx/ParticleSystem';
import { CONFIG } from '../game/Config';
import { Inventory } from '../game/Inventory';
import { ProjectileSystem } from './ProjectileSystem';
import { Targeting } from './Targeting';
import { MISSILE, PLAYER_WEAPONS, WeaponDef } from './WeaponDefs';

const muzzleWorld = new Vector3();
const aimDir = new Vector3();
const spreadDir = new Vector3();
const flashVel = new Vector3();

export interface ShotCallbacks {
  onPrimaryShot: (weapon: WeaponDef) => void;
  onMissileShot: () => void;
  onWeaponSwitched: (weapon: WeaponDef) => void;
}

/**
 * Player weapon control: primary bolts (hold LMB, energy-gated, alternating
 * muzzles), seeker missiles (RMB, uses current soft-lock), weapon cycling
 * via 1/2/3 or mouse wheel. Aim converges on the targeting lead point when
 * a lock exists, otherwise fires down the boresight.
 */
export class WeaponSystem {
  weaponIndex = 0;
  /** Ship-specific weapon energy bank (the scout runs a much smaller one). */
  energyMax: number = CONFIG.weapons.energyMax;
  energy: number = CONFIG.weapons.energyMax;
  missileCooldown = 0;
  /** Raised by crafted Weapon Amplifiers; reset each mission. */
  damageMult = 1;

  private cooldown = 0;
  private muzzleToggle = 0;
  /** The selected hull's hardpoint fit — set at mission start. */
  private loadout: WeaponDef[] = [...PLAYER_WEAPONS];
  /** Seeker rack rate: 0 = no launcher, 1 = standard, 2 = double rate. */
  missileRate = 1;

  /** Equip a ship-specific weapon fit (ids from PLAYER_WEAPONS). */
  setLoadout(ids: readonly string[], missileRate = 1, energyMax: number = CONFIG.weapons.energyMax): void {
    const defs = ids
      .map((id) => PLAYER_WEAPONS.find((w) => w.id === id))
      .filter((w): w is WeaponDef => w !== undefined);
    this.loadout = defs.length > 0 ? defs : [...PLAYER_WEAPONS];
    this.weaponIndex = 0;
    this.missileRate = missileRate;
    this.energyMax = energyMax;
    this.energy = energyMax;
  }

  get weaponNames(): string[] {
    return this.loadout.map((w) => w.name);
  }

  constructor(
    private readonly projectiles: ProjectileSystem,
    private readonly particles: ParticleSystem,
    private readonly callbacks: ShotCallbacks,
  ) {}

  get weapon(): WeaponDef {
    return this.loadout[this.weaponIndex];
  }

  update(
    dt: number,
    input: Input,
    player: PlayerShip,
    targeting: Targeting,
    rngNext: () => number,
    inventory: Inventory,
    regenerateEnergy = true,
  ): void {
    if (this.weaponIndex >= this.loadout.length) this.weaponIndex = 0;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.missileCooldown = Math.max(0, this.missileCooldown - dt);
    if (regenerateEnergy) {
      this.energy = Math.min(
        this.energyMax,
        this.energy + CONFIG.weapons.energyRegen * player.stats.energyMult * dt,
      );
    }

    // Weapon switching.
    let switched = false;
    for (let d = 0; d < this.loadout.length; d++) {
      if (input.wasPressed(`Digit${d + 1}`) && this.weaponIndex !== d) {
        this.weaponIndex = d;
        switched = true;
      }
    }
    const wheel = input.consumeWheel();
    if (wheel !== 0) {
      const n = this.loadout.length;
      // True modulo: JS % returns NEGATIVE for big backward wheel deltas,
      // which indexed past the loadout and crashed the switch callback.
      this.weaponIndex = (((this.weaponIndex + wheel) % n) + n) % n;
      switched = true;
    }
    if (switched) this.callbacks.onWeaponSwitched(this.weapon);

    if (!player.alive) return;

    // Primary fire.
    const w = this.weapon;
    if (input.isButtonDown(0) && this.cooldown <= 0 && this.energy >= w.energyCost) {
      this.energy -= w.energyCost;
      this.cooldown = w.cooldown;
      this.firePrimary(player, targeting, rngNext);
      this.callbacks.onPrimaryShot(w);
    }

    // Missiles: rack-gated (Vanta has none), ammo-gated, ship-rate cooldown.
    if (
      input.isButtonDown(2) &&
      this.missileRate > 0 &&
      this.missileCooldown <= 0 &&
      inventory.missiles > 0
    ) {
      inventory.missiles--;
      this.missileCooldown = MISSILE.cooldown / this.missileRate;
      this.fireMissile(player, targeting);
      this.callbacks.onMissileShot();
    }
  }

  private firePrimary(player: PlayerShip, targeting: Targeting, rngNext: () => number): void {
    const w = this.weapon;
    this.muzzleToggle = (this.muzzleToggle + 1) % player.gunpoints.length;
    muzzleWorld.copy(player.gunpoints[this.muzzleToggle]);
    player.object.localToWorld(muzzleWorld);

    const target = targeting.aimTarget;
    if (target) {
      aimDir.copy(target.leadPoint).sub(muzzleWorld).normalize();
    } else {
      player.forward(aimDir);
    }

    for (let i = 0; i < w.pellets; i++) {
      spreadDir.copy(aimDir);
      if (w.spread > 0) {
        spreadDir.x += (rngNext() - 0.5) * 2 * w.spread;
        spreadDir.y += (rngNext() - 0.5) * 2 * w.spread;
        spreadDir.z += (rngNext() - 0.5) * 2 * w.spread;
        spreadDir.normalize();
      }
      this.projectiles.spawnBolt({
        position: muzzleWorld,
        direction: spreadDir,
        speed: w.projectileSpeed,
        damage: w.damage * this.damageMult,
        faction: 'player',
        color: w.color,
        boltLength: w.boltLength,
        boltWidth: w.boltWidth,
        life: w.life,
      });
    }

    // Muzzle flash particles inherit some ship velocity.
    for (let i = 0; i < 3; i++) {
      flashVel
        .copy(player.velocity)
        .addScaledVector(aimDir, 6 + rngNext() * 8);
      this.particles.spawn({
        position: muzzleWorld,
        velocity: flashVel,
        color: w.color,
        size: 1.4,
        life: 0.12 + rngNext() * 0.08,
      });
    }
  }

  private fireMissile(player: PlayerShip, targeting: Targeting): void {
    muzzleWorld.set(0, -0.5, 0);
    player.object.localToWorld(muzzleWorld);
    player.forward(aimDir);
    this.projectiles.spawnMissile(muzzleWorld, aimDir, targeting.aimTarget?.ship ?? null);
  }
}
