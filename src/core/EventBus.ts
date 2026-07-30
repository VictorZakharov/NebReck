/** Minimal typed pub/sub used to decouple gameplay, FX, UI and audio. */
export interface GameEvents {
  'enemy-killed': { position: [number, number, number]; score: number; enemyKind: string };
  'player-hit': { amount: number; shieldAbsorbed: boolean };
  'player-died': undefined;
  'alert-changed': { alert: number };
  'hunters-inbound': { count: number };
  'comms': { speaker: string; text: string };
  'score-changed': { score: number };
  'pickup-collected': { kind: string };
  'weapon-switched': { name: string };
  'target-destroyed-assist': undefined;
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of set) (h as Handler<GameEvents[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
