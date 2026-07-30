export interface DeviceState {
  label: string;
  frac: number; // 1 = ready; during cooldown/active shows progress
  active: boolean;
}

const CLOAK_COOLDOWN = 30;
const EMP_COOLDOWN = 25;
export const EMP_RADIUS = 250;
export const EMP_STUN = 4;
export const NANO_HEAL = 35;

/**
 * Ship devices, Everspace-style: active abilities on cooldowns.
 *  - CLOAK (F): 6 s of sensor invisibility — nothing can target or fire on you
 *  - EMP (G):  stuns every hostile within 250 u for 4 s
 * Consumable NANOBOTS (H) are crafted in Engineering and repair hull in flight.
 * Pure timers here — activation effects (stuns, FX, healing) live in Game.
 */
export class DeviceSystem {
  /** Cloak has NO fixed duration — it holds until energy runs dry, the
   *  player fires, or F toggles it off. Cooldown starts at DEcloak. */
  cloakActive = false;
  cloakCooldown = 0;
  empCooldown = 0;

  get cloaked(): boolean {
    return this.cloakActive;
  }

  update(dt: number): void {
    this.cloakCooldown = Math.max(0, this.cloakCooldown - dt);
    this.empCooldown = Math.max(0, this.empCooldown - dt);
  }

  tryCloak(): boolean {
    if (this.cloakCooldown > 0 || this.cloakActive) return false;
    this.cloakActive = true;
    return true;
  }

  /** Decloak: energy ran dry, the player opened fire, or F toggled it off. */
  breakCloak(): void {
    if (!this.cloakActive) return;
    this.cloakActive = false;
    this.cloakCooldown = CLOAK_COOLDOWN;
  }

  tryEmp(): boolean {
    if (this.empCooldown > 0) return false;
    this.empCooldown = EMP_COOLDOWN;
    return true;
  }

  cloakState(): DeviceState {
    if (this.cloaked) {
      return { label: 'Engaged', frac: 1, active: true };
    }
    if (this.cloakCooldown > 0) {
      return {
        label: `${Math.ceil(this.cloakCooldown)}s`,
        frac: 1 - this.cloakCooldown / CLOAK_COOLDOWN,
        active: false,
      };
    }
    return { label: 'F', frac: 1, active: false };
  }

  empState(): DeviceState {
    if (this.empCooldown > 0) {
      return {
        label: `${Math.ceil(this.empCooldown)}s`,
        frac: 1 - this.empCooldown / EMP_COOLDOWN,
        active: false,
      };
    }
    return { label: 'G', frac: 1, active: false };
  }
}
