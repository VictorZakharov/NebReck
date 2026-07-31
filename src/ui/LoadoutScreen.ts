import { RESOURCE_INFO, ResourceType } from '../entities/PickupSystem';
import { Inventory, RECIPES, Recipe } from '../game/Inventory';
import { getRecipeIcon } from './RecipeIcons';
import { holdingIconSvg } from './ResourceIcons';

export interface LoadoutCallbacks {
  /** Attempt a craft; returns true if it went through (screen refreshes). */
  onCraft: (recipeId: string) => boolean;
  /** False when a consumable would be wasted (e.g. hull patch at full hull). */
  isUseful: (recipeId: string) => boolean;
  onClose: () => void;
  onHover: () => void;
  onClick: () => void;
}

/**
 * Mid-mission engineering bay (Tab): shows the resource wallet and lets the
 * pilot spend it on repairs, refills and permanent upgrades. Pure view —
 * validation and effects live in Game.craft().
 */
export class LoadoutScreen {
  private readonly root: HTMLElement;
  private left: HTMLElement | null = null;

  constructor(
    parent: HTMLElement,
    private readonly shipName: string,
    private readonly inventory: Inventory,
    private readonly questLog: { title: string; progress: string }[],
    private readonly callbacks: LoadoutCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'screen loadout';
    parent.appendChild(this.root);
    this.render();
  }

  private render(): void {
    const previousScrollTop =
      this.root.querySelector<HTMLElement>('.loadout-right')?.scrollTop ?? 0;
    this.root.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'ns-panel loadout-panel';

    const left = document.createElement('div');
    left.className = 'loadout-left';
    const resources = (Object.keys(RESOURCE_INFO) as ResourceType[])
      .map((t) => {
        const info = RESOURCE_INFO[t];
        return `<div class="res-line res-${t}" data-res="${t}"><i class="res-glyph">${holdingIconSvg(t)}</i><span class="res-label">${info.name}</span><b class="res-count">${this.inventory.counts[t]}</b></div>`;
      })
      .join('');
    this.left = left;
    const upgrades = RECIPES.filter((r) => r.maxLevel !== null)
      .map((r) => {
        const lvl = this.inventory.levelOf(r);
        const pips = Array.from({ length: r.maxLevel! }, (_, i) =>
          i < lvl ? '<i class="pip on"></i>' : '<i class="pip"></i>',
        ).join('');
        return `<div class="upgrade-line"><span>${r.name}</span><span class="pips">${pips}</span></div>`;
      })
      .join('');
    left.innerHTML = `
      <h2>Engineering</h2>
      <div class="loadout-ship">${this.shipName}</div>
      <div class="loadout-subhead">Salvage hold</div>
      ${resources}
      <div class="res-line res-nano" style="color:#35e88a"><i class="res-glyph">${holdingIconSvg('nano')}</i><span class="res-label">Nanobot Kits</span><b class="res-count">${this.inventory.nanobots}</b></div>
      <div class="loadout-subhead">Installed upgrades</div>
      ${upgrades}
      <div class="loadout-subhead">Contracts</div>
      ${
        this.questLog.length === 0
          ? '<div class="upgrade-line"><span style="opacity:0.5">None — hail a hauler (R)</span></div>'
          : this.questLog
              .map((q) => `<div class="upgrade-line"><span>${q.title}</span><span>${q.progress}</span></div>`)
              .join('')
      }
    `;

    const right = document.createElement('div');
    right.className = 'loadout-right';
    for (const recipe of RECIPES) right.appendChild(this.recipeRow(recipe));

    panel.append(left, right);
    this.root.appendChild(panel);
    // Crafting refreshes prices, counts and disabled states, but it should not
    // teleport the pilot back to the first recipe they already scrolled past.
    right.scrollTop = previousScrollTop;

    const hint = document.createElement('div');
    hint.className = 'loadout-hint';
    hint.textContent = 'TAB or ESC to return to flight';
    this.root.appendChild(hint);
  }

  private recipeRow(recipe: Recipe): HTMLElement {
    const row = document.createElement('div');
    row.className = 'recipe-row';
    const maxed = recipe.maxLevel !== null && this.inventory.levelOf(recipe) >= recipe.maxLevel;
    const affordable = this.inventory.canAfford(recipe);

    const cost = (Object.entries(recipe.cost) as [ResourceType, number][])
      .map(([t, n]) => {
        const enough = this.inventory.counts[t] >= n;
        return `<span class="res-chip res-${t}${enough ? '' : ' short'}">${holdingIconSvg(t, 'chip-holding-icon')}<span>${n}</span></span>`;
      })
      .join('');

    row.innerHTML = `
      <img class="recipe-icon" src="${getRecipeIcon(recipe.id)}" alt="" />
      <div class="recipe-info">
        <div class="recipe-name">${recipe.name}</div>
        <div class="recipe-desc">${recipe.description}</div>
        <div class="recipe-cost">${cost}</div>
      </div>
    `;
    // Hovering a recipe pulse-links every hold currency it spends (same
    // affordance as the merchant screen).
    const costKeys = Object.keys(recipe.cost);
    row.addEventListener('mouseenter', () => {
      for (const t of costKeys) this.left?.querySelector(`[data-res="${t}"]`)?.classList.add('linked');
      row.classList.add('linked');
    });
    row.addEventListener('mouseleave', () => {
      for (const t of costKeys) this.left?.querySelector(`[data-res="${t}"]`)?.classList.remove('linked');
      row.classList.remove('linked');
    });
    const btn = document.createElement('button');
    btn.className = 'craft-btn';
    const useful = this.callbacks.isUseful(recipe.id);
    btn.textContent = maxed
      ? 'Maxed'
      : recipe.id === 'missile-rack' && !useful
        ? 'No rack'
        : 'Craft';
    btn.disabled = maxed || !affordable || !useful;
    btn.addEventListener('mouseenter', this.callbacks.onHover);
    btn.addEventListener('click', () => {
      if (this.callbacks.onCraft(recipe.id)) {
        this.callbacks.onClick();
        this.render();
      }
    });
    row.appendChild(btn);
    return row;
  }

  destroy(): void {
    this.root.remove();
  }
}
