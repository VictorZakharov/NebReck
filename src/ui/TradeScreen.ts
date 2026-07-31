import { RESOURCE_INFO, ResourceType } from '../entities/PickupSystem';
import { Inventory } from '../game/Inventory';
import { canTrade, TRADE_OFFERS } from '../game/Trade';
import { holdingIconSvg } from './ResourceIcons';
import { getTradeIcon } from './TradeIcons';

export interface TradeCallbacks {
  /** Execute a trade by id; returns true if it went through. */
  onTrade: (id: string) => boolean;
  /** Ship-fit restrictions beyond wallet affordability. */
  isAvailable: (id: string) => boolean;
  onClose: () => void;
  onHover: () => void;
  onClick: () => void;
}

/** The merchant's stall: BUY and SELL pages toggle. R/Esc to undock. */
export class TradeScreen {
  private readonly root: HTMLElement;
  private page: 'buy' | 'sell' = 'buy';

  constructor(
    parent: HTMLElement,
    private readonly inventory: Inventory,
    private readonly callbacks: TradeCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'screen loadout';
    parent.appendChild(this.root);
    this.render();
  }

  private render(): void {
    this.root.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'ns-panel loadout-panel trade-panel';

    const closeX = document.createElement('button');
    closeX.className = 'close-x';
    closeX.textContent = '✕';
    closeX.addEventListener('mouseenter', this.callbacks.onHover);
    closeX.addEventListener('click', () => this.callbacks.onClose());
    panel.appendChild(closeX);

    const left = document.createElement('div');
    left.className = 'loadout-left';
    const resources = (Object.keys(RESOURCE_INFO) as ResourceType[])
      .map((t) => {
        const info = RESOURCE_INFO[t];
        return `<div class="res-line res-${t}" data-res="${t}"><i class="res-glyph">${holdingIconSvg(t)}</i><span class="res-label">${info.name}</span><b class="res-count">${this.inventory.counts[t]}</b></div>`;
      })
      .join('');
    left.innerHTML = `
      <h2>Trade</h2>
      <div class="loadout-ship">Independent merchant</div>
      <div class="loadout-subhead">Your hold</div>
      ${resources}
      <div class="res-line res-nano" data-res="nano" style="color:#35e88a"><i class="res-glyph">${holdingIconSvg('nano')}</i><span class="res-label">Nanobot Kits</span><b class="res-count">${this.inventory.nanobots}</b></div>
      <div class="res-line res-missile" data-res="missile" style="color:#ffb347"><i class="res-glyph">${holdingIconSvg('missile')}</i><span class="res-label">Seeker Missiles</span><b class="res-count">${this.inventory.missiles}</b></div>
    `;

    const right = document.createElement('div');
    right.className = 'loadout-right';

    const tabs = document.createElement('div');
    tabs.className = 'trade-tabs';
    for (const side of ['buy', 'sell'] as const) {
      const tab = document.createElement('button');
      tab.className = 'trade-tab' + (this.page === side ? ' active' : '');
      tab.textContent = side === 'buy' ? 'Buy' : 'Sell';
      tab.addEventListener('mouseenter', this.callbacks.onHover);
      tab.addEventListener('click', () => {
        if (this.page === side) return;
        this.callbacks.onClick();
        this.page = side;
        this.render();
      });
      tabs.appendChild(tab);
    }
    right.appendChild(tabs);

    for (const offer of TRADE_OFFERS.filter((o) => o.side === this.page)) {
      const row = document.createElement('div');
      row.className = 'recipe-row';
      row.innerHTML = `
        <img class="trade-icon" src="${getTradeIcon(offer.id)}" alt="" />
        <div class="recipe-info">
          <div class="recipe-name">${offer.label}</div>
          <div class="recipe-desc">${offer.description}</div>
          <div class="recipe-cost">
            <span class="res-chip res-${offer.cost.kind}">${holdingIconSvg(offer.cost.kind, 'chip-holding-icon')}<span>${offer.cost.amount}</span></span>
            <span class="trade-arrow">→</span>
            <span class="res-chip res-${offer.gain.kind} trade-gain">${holdingIconSvg(offer.gain.kind, 'chip-holding-icon')}<span>${offer.gain.amount}</span></span>
          </div>
        </div>
      `;
      // Hovering an offer highlights the currency it SPENDS in "Your hold".
      const costRes = costResourceOf(offer.id);
      row.addEventListener('mouseenter', () => {
        left.querySelector(`[data-res="${costRes}"]`)?.classList.add('linked');
        row.classList.add('linked');
      });
      row.addEventListener('mouseleave', () => {
        left.querySelector(`[data-res="${costRes}"]`)?.classList.remove('linked');
        row.classList.remove('linked');
      });
      const btn = document.createElement('button');
      btn.className = 'craft-btn';
      const available = this.callbacks.isAvailable(offer.id);
      btn.textContent = !available && offer.id === 'buy-missiles'
        ? 'No rack'
        : this.page === 'buy'
          ? 'Buy'
          : 'Sell';
      btn.disabled = !available || !canTrade(offer.id, this.inventory);
      btn.addEventListener('mouseenter', this.callbacks.onHover);
      btn.addEventListener('click', () => {
        if (this.callbacks.onTrade(offer.id)) {
          this.callbacks.onClick();
          this.render();
        }
      });
      row.appendChild(btn);
      right.appendChild(row);
    }

    panel.append(left, right);
    this.root.appendChild(panel);
    const hint = document.createElement('div');
    hint.className = 'loadout-hint';
    hint.textContent = 'R or ESC to undock';
    this.root.appendChild(hint);
  }

  destroy(): void {
    this.root.remove();
  }
}

/** Which hold currency an offer SPENDS (the cost side). */
function costResourceOf(offerId: string): string {
  if (offerId.startsWith('buy-')) return 'scrap';
  if (offerId === 'sell-crystal') return 'crystal';
  if (offerId === 'sell-flux') return 'flux';
  if (offerId === 'sell-nano') return 'nano';
  return 'scrap';
}
