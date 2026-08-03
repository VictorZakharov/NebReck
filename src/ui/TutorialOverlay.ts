import { Camera, Vector3 } from 'three';
import { TutorialPanelState } from './TutorialPanelState';
import { TutorialWaypoint } from './TutorialWaypoint';

export interface TutorialCard {
  id: string;
  chapter: string;
  title: string;
  narration: string;
  objective: string;
  controls: string[];
  focus?: string;
  frozen?: boolean;
  liveReview?: boolean;
  continueLabel?: string;
  review?: {
    narration: string;
    objective?: string;
    continueLabel?: string;
  };
}

/** Visual flight-instructor layer shared by desktop and touch layouts. */
export class TutorialOverlay {
  private readonly root: HTMLElement;
  private readonly chapter: HTMLElement;
  private readonly title: HTMLElement;
  private readonly narration: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly previous: HTMLButtonElement;
  private readonly forward: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly waypoint: TutorialWaypoint;
  private readonly panelState: TutorialPanelState;
  private focused: HTMLElement | null = null;

  constructor(
    parent: HTMLElement,
    onContinue: () => void,
    onBrowse: (delta: number) => void,
    onExit: () => void,
  ) {
    this.root = document.createElement('section');
    this.root.className = 'tutorial-overlay';
    this.root.setAttribute('aria-live', 'polite');
    this.root.innerHTML = `
      <div class="tutorial-vignette"></div>
      <div class="tutorial-waypoint" data-el="waypoint">
        <i></i><span data-el="waypointLabel"></span>
      </div>
      <div class="tutorial-panel hud-panel collapsed">
        <div class="tutorial-instructor" aria-hidden="true">
          <div class="tutorial-portrait"><i></i></div>
          <div class="tutorial-wave"><i></i><i></i><i></i><i></i><i></i></div>
        </div>
        <div class="tutorial-copy">
          <div class="tutorial-kicker"><span data-el="chapter"></span></div>
          <div class="tutorial-heading">
            <h2 data-el="title"></h2>
            <span class="tutorial-progress">
              <button type="button" data-el="previous" aria-label="Previous tutorial step">&#8249;</button>
              <b data-el="progress"></b>
              <button type="button" data-el="forward" aria-label="Next tutorial step">&#8250;</button>
            </span>
          </div>
          <div class="tutorial-details"><div>
            <p data-el="narration"></p>
            <div class="tutorial-objective"><i></i><span data-el="objective"></span></div>
          </div></div>
          <div class="tutorial-footer">
            <div class="tutorial-controls" data-el="controls"></div>
            <div class="tutorial-actions">
              <button class="tutorial-next" type="button" data-el="next">Continue</button>
            </div>
          </div>
        </div>
        <div class="tutorial-window-controls">
          <button class="tutorial-collapse" type="button" data-el="collapse"></button>
          <button class="tutorial-exit" type="button" aria-label="Exit tutorial" title="Exit tutorial">&times;</button>
        </div>
        <div class="tutorial-hold">Simulation hold</div>
      </div>
    `;
    parent.appendChild(this.root);
    const find = <T extends HTMLElement>(name: string): T =>
      this.root.querySelector<T>(`[data-el="${name}"]`)!;
    this.chapter = find('chapter');
    this.title = find('title');
    this.narration = find('narration');
    this.objective = find('objective');
    this.controls = find('controls');
    this.progress = find('progress');
    this.previous = find<HTMLButtonElement>('previous');
    this.forward = find<HTMLButtonElement>('forward');
    this.next = find<HTMLButtonElement>('next');
    this.waypoint = new TutorialWaypoint(find('waypoint'), find('waypointLabel'));
    this.panelState = new TutorialPanelState(
      this.root.querySelector<HTMLElement>('.tutorial-panel')!,
      find<HTMLButtonElement>('collapse'),
    );
    this.next.addEventListener('click', onContinue);
    this.previous.addEventListener('click', () => onBrowse(-1));
    this.forward.addEventListener('click', () => onBrowse(1));
    this.root.querySelector('.tutorial-exit')!.addEventListener('click', onExit);
  }

  show(card: TutorialCard, index: number, total: number, reviewing = false): void {
    this.root.classList.add('visible');
    this.root.classList.toggle('frozen', card.frozen === true);
    this.root.dataset.step = card.id;
    this.root.classList.toggle('reviewing', reviewing);
    this.chapter.textContent = `LYRA // ${card.chapter}`;
    this.progress.textContent = `${String(index + 1).padStart(2, '0')} / ${total}`;
    this.previous.disabled = index === 0;
    this.forward.disabled = index === total - 1;
    this.title.textContent = card.title;
    this.narration.textContent = card.narration;
    this.objective.textContent = card.objective;
    this.controls.innerHTML = '';
    for (const label of card.controls) {
      const key = document.createElement('kbd');
      key.textContent = label;
      this.controls.appendChild(key);
    }
    this.next.hidden = !card.continueLabel;
    this.next.textContent = card.continueLabel ?? 'Continue';
    this.setFocus(card.focus ?? null);
  }

  hide(): void {
    this.root.classList.remove('visible', 'frozen', 'reviewing');
    this.root.removeAttribute('data-step');
    this.setFocus(null);
    this.waypoint.set(null, null);
    this.panelState.reset();
  }
  setContinueEnabled(enabled: boolean): void { this.next.disabled = !enabled; }
  setSpeaking(speaking: boolean): void { this.panelState.setSpeaking(speaking); }
  setWaypoint(point: Vector3 | null, camera: Camera | null, label = 'Objective'): void {
    this.waypoint.set(point, camera, label);
  }

  get visible(): boolean {
    return this.root.classList.contains('visible');
  }

  private setFocus(selector: string | null): void {
    this.focused?.classList.remove('tutorial-focus');
    this.focused = selector ? document.querySelector<HTMLElement>(selector) : null;
    this.focused?.classList.add('tutorial-focus');
  }
}
