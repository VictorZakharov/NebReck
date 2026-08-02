import { Vector3 } from 'three';

export type NavigationKind =
  | 'contact'
  | 'planet'
  | 'vein'
  | 'stash'
  | 'base'
  | 'objective'
  | 'position';

export interface NavigationDestination {
  /** Stable identity used by N to toggle the same destination off. */
  readonly key: object;
  readonly label: string;
  readonly kind: NavigationKind;
  /** A live vector reference, so moving contacts stay tracked. */
  readonly position: Vector3;
  readonly valid?: () => boolean;
}

export type NavigationAssignment = 'assigned' | 'cleared' | 'locked';

/**
 * One shared destination for manual navigation and guided objectives.
 * Tutorials lock manual reassignment, but feed the same HUD/radar pipeline.
 */
export class NavigationSystem {
  private destination: NavigationDestination | null = null;
  private tutorialLock = false;

  get current(): NavigationDestination | null {
    if (this.destination?.valid && !this.destination.valid()) this.destination = null;
    return this.destination;
  }

  get locked(): boolean {
    return this.tutorialLock;
  }

  toggleManual(destination: NavigationDestination | null): NavigationAssignment {
    if (this.tutorialLock) return 'locked';
    if (!destination || this.destination?.key === destination.key) {
      this.destination = null;
      return 'cleared';
    }
    this.destination = destination;
    return 'assigned';
  }

  setTutorial(destination: NavigationDestination | null): void {
    this.tutorialLock = true;
    this.destination = destination;
  }

  lockForTutorial(): void {
    this.tutorialLock = true;
  }

  releaseTutorial(): void {
    this.tutorialLock = false;
    this.destination = null;
  }

  /** A world swap invalidates either kind of destination but retains its lock. */
  clearForWorldSwap(): void {
    this.destination = null;
  }
}
