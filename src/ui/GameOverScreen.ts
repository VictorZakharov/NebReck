import { DEATH_LINES } from '../game/Story';

export interface GameOverCallbacks {
  onRetry: () => void;
  onMenu: () => void;
  onHover: () => void;
  onClick: () => void;
}

/** Death screen: epitaph line, run stats, retry/menu. */
export class GameOverScreen {
  private readonly root: HTMLElement;

  constructor(
    parent: HTMLElement,
    score: number,
    survived: string,
    sector: number,
    creditsEarned: number,
    creditsTotal: number,
    epitaphIndex: number,
    callbacks: GameOverCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'screen';

    const title = document.createElement('div');
    title.className = 'gameover-title';
    title.textContent = 'SIGNAL LOST';

    const epitaph = document.createElement('div');
    epitaph.className = 'gameover-epitaph';
    epitaph.textContent = DEATH_LINES[epitaphIndex % DEATH_LINES.length];

    const stats = document.createElement('div');
    stats.className = 'gameover-stats';
    stats.innerHTML =
      `Score <b>${score}</b> &nbsp;·&nbsp; Sector <b>${sector}</b> &nbsp;·&nbsp; Survived <b>${survived}</b>`;

    const credits = document.createElement('div');
    credits.className = 'gameover-credits';
    credits.innerHTML = `Legacy credits <b>+${creditsEarned}</b> (total ${creditsTotal})`;

    this.root.append(title, epitaph, stats, credits);

    const button = (label: string, fn: () => void): void => {
      const b = document.createElement('button');
      b.className = 'ns-btn';
      b.textContent = label;
      b.addEventListener('mouseenter', callbacks.onHover);
      b.addEventListener('click', () => {
        callbacks.onClick();
        fn();
      });
      this.root.appendChild(b);
    };
    button('Fly again', callbacks.onRetry);
    button('Return to menu', callbacks.onMenu);
    parent.appendChild(this.root);
  }

  destroy(): void {
    this.root.remove();
  }
}
