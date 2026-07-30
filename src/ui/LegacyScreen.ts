import { META_UPGRADES, MetaProgress } from '../game/MetaProgress';

export interface LegacyCallbacks {
  onClose: () => void;
  onHover: () => void;
  onClick: () => void;
}

/**
 * The meta-progression shop: credits banked from past runs buy permanent
 * upgrades that apply to every future launch. Reached from the main menu.
 */
export class LegacyScreen {
  private readonly root: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly meta: MetaProgress,
    private readonly callbacks: LegacyCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'screen';
    parent.appendChild(this.root);
    this.render();
  }

  private render(): void {
    this.root.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'ns-panel legacy-panel';
    const h = document.createElement('h2');
    h.textContent = 'Legacy';
    panel.appendChild(h);
    const credits = document.createElement('div');
    credits.className = 'legacy-credits';
    credits.innerHTML = `Credits <b>${this.meta.credits}</b> · earned from banked scores, kept across deaths`;
    panel.appendChild(credits);

    for (const def of META_UPGRADES) {
      const level = this.meta.levelOf(def.id);
      const maxed = level >= def.maxLevel;
      const row = document.createElement('div');
      row.className = 'recipe-row';
      const pips = Array.from({ length: def.maxLevel }, (_, i) =>
        i < level ? '<i class="pip on"></i>' : '<i class="pip"></i>',
      ).join('');
      row.innerHTML = `
        <div class="recipe-info">
          <div class="recipe-name">${def.name} <span class="pips">${pips}</span></div>
          <div class="recipe-desc">${def.description}</div>
        </div>
      `;
      const btn = document.createElement('button');
      btn.className = 'craft-btn';
      btn.textContent = maxed ? 'Maxed' : `${def.cost(level)} cr`;
      btn.disabled = maxed || !this.meta.canBuy(def);
      btn.addEventListener('mouseenter', this.callbacks.onHover);
      btn.addEventListener('click', () => {
        if (this.meta.buy(def)) {
          this.callbacks.onClick();
          this.render();
        }
      });
      row.appendChild(btn);
      panel.appendChild(row);
    }

    this.root.appendChild(panel);
    const back = document.createElement('button');
    back.className = 'ns-btn';
    back.textContent = 'Back';
    back.addEventListener('mouseenter', this.callbacks.onHover);
    back.addEventListener('click', () => {
      this.callbacks.onClick();
      this.callbacks.onClose();
    });
    this.root.appendChild(back);
  }

  destroy(): void {
    this.root.remove();
  }
}
