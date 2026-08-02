export interface PauseCallbacks {
  onResume: () => void;
  onRestart: () => void;
  onQuitToMenu: () => void;
  onExitTutorial?: () => void;
  onToggleFullscreen: () => void;
  onHover: () => void;
  onClick: () => void;
}

/** Simple in-mission pause overlay. */
export class PauseMenu {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement, callbacks: PauseCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'screen pause-screen';
    const h = document.createElement('h2');
    h.textContent = 'Paused';
    this.root.appendChild(h);

    const button = (label: string, fn: () => void, cls = ''): void => {
      const b = document.createElement('button');
      b.className = `ns-btn ${cls}`.trim();
      b.textContent = label;
      b.addEventListener('mouseenter', callbacks.onHover);
      b.addEventListener('click', () => {
        callbacks.onClick();
        fn();
      });
      this.root.appendChild(b);
    };
    button('Resume', callbacks.onResume);
    button('Toggle fullscreen', callbacks.onToggleFullscreen);
    if (callbacks.onExitTutorial) button('Exit tutorial', callbacks.onExitTutorial, 'danger');
    else {
      button('Restart mission', callbacks.onRestart);
      button('Abandon to menu', callbacks.onQuitToMenu, 'danger');
    }
    parent.appendChild(this.root);
  }

  destroy(): void {
    this.root.remove();
  }
}
