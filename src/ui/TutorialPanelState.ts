/** Auto-collapse behavior for Lyra's panel, with a persistent player override. */
export class TutorialPanelState {
  private manualExpanded: boolean | null = null;
  private speaking = false;

  constructor(
    private readonly panel: HTMLElement,
    private readonly toggle: HTMLButtonElement,
  ) {
    this.toggle.addEventListener('click', () => {
      this.manualExpanded = this.panel.classList.contains('collapsed');
      this.apply(this.manualExpanded);
    });
    this.apply(false);
  }

  setSpeaking(speaking: boolean): void {
    if (speaking === this.speaking) return;
    this.speaking = speaking;
    if (this.manualExpanded === null) this.apply(speaking);
  }

  reset(): void {
    this.manualExpanded = null;
    this.speaking = false;
    this.apply(false);
  }

  private apply(expanded: boolean): void {
    this.panel.classList.toggle('collapsed', !expanded);
    this.toggle.textContent = expanded ? '−' : '+';
    this.toggle.setAttribute('aria-expanded', String(expanded));
    this.toggle.setAttribute('aria-label', expanded ? 'Minimize instructor' : 'Expand instructor');
    this.toggle.title = expanded ? 'Minimize instructor' : 'Expand instructor';
  }
}
