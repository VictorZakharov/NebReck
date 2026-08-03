import { PLAYER_WEAPONS } from '../combat/WeaponDefs';
import { DIFFICULTIES } from '../game/Difficulty';
import { getShipDef, PLAYER_SHIPS, PlayerShipDef } from '../game/Ships';
import { getShipThumbnails } from './ShipThumbnails';
import { getThreatIcon } from './ThreatIcons';
import { getWeaponIcon } from './WeaponIcons';

export interface HangarCallbacks {
  /** Fired on card click so the 3D backdrop can swap the parked ship. */
  onShipSelected: (shipId: string) => void;
  onDifficultySelected: (difficultyId: string) => void;
  onEngage: (shipId: string, difficultyId: string) => void;
  onTutorial: () => void;
  onBack: () => void;
  onHover: () => void;
  onClick: () => void;
  /** Fired after every (re)render — the visor re-mounts the fresh panels. */
  onRendered?: () => void;
}

/** Normalization caps for the stat bars (top value across the roster). */
const STAT_CAPS = { speed: 100, agility: 3.1, hull: 160, shield: 120, energy: 1.35 };

/**
 * Pre-launch hangar. Layout keeps the center of the screen clear so the live
 * 3D showcase ship (orbited by the menu camera) stays visible: hull cards
 * with rendered portraits on the left, briefing + threat level on the right.
 */
export class HangarScreen {
  private readonly root: HTMLElement;
  private shipId: string;
  private difficultyId: string;
  private readonly thumbnails: Record<string, string>;

  constructor(
    parent: HTMLElement,
    initialShipId: string,
    initialDifficultyId: string,
    private readonly callbacks: HangarCallbacks,
  ) {
    this.shipId = initialShipId;
    this.difficultyId = initialDifficultyId;
    this.thumbnails = getShipThumbnails();
    this.root = document.createElement('div');
    this.root.className = 'screen hangar';
    parent.appendChild(this.root);
    this.render();
  }

  private render(): void {
    this.root.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = 'Hangar';
    this.root.appendChild(h);

    const body = document.createElement('div');
    body.className = 'hangar-body';

    // Main column: the live 3D ship shows through the empty top half; all
    // three hull cards sit in ONE horizontal row beneath it — no scrolling.
    const main = document.createElement('div');
    main.className = 'hangar-main';
    const center = document.createElement('div');
    center.className = 'hangar-center';
    main.appendChild(center);
    const ships = document.createElement('div');
    ships.className = 'hangar-ships';
    for (const ship of PLAYER_SHIPS) ships.appendChild(this.shipCard(ship));
    main.appendChild(ships);
    body.appendChild(main);

    // Right: selected-ship briefing + threat + actions.
    const right = document.createElement('div');
    right.className = 'hangar-right';

    const selected = getShipDef(this.shipId);
    // Icon chips; the full description lives in the native hover tooltip.
    const missileChip =
      selected.missileRate > 0
        ? `<span class="hardpoint-chip icon missile" data-tip="Seeker Missiles — homing, ammo-limited${selected.missileRate > 1 ? ', DOUBLE fire rate' : ''}. RMB to launch."><b>R</b><img src="${getWeaponIcon('seeker')}" alt="Seekers" /></span>`
        : '<span class="hardpoint-chip none" data-tip="This hull carries no seeker rack.">No rack</span>';
    const hardpoints = selected.weapons
      .map((id, i) => {
        const w = PLAYER_WEAPONS.find((d) => d.id === id);
        if (!w) return '';
        const tip = `${w.name} — ${w.damage} dmg × ${w.pellets > 1 ? `${w.pellets} pellets` : 'bolt'}, ${(1 / w.cooldown).toFixed(1)}/s, ${w.energyCost} energy/shot`;
        return `<span class="hardpoint-chip icon" data-tip="${tip}"><b>${i + 1}</b><img src="${getWeaponIcon(id)}" alt="${w.name}" /></span>`;
      })
      .join('');
    const detail = document.createElement('div');
    detail.className = 'ship-detail';
    detail.innerHTML = `
      <div class="ship-card-name">${selected.name}</div>
      <div class="ship-card-role">${selected.role}</div>
      <div class="ship-detail-desc">${selected.description}</div>
      <div class="hangar-subhead">Hardpoints</div>
      <div class="hardpoint-row">${hardpoints}${missileChip}</div>
    `;
    right.appendChild(detail);

    // Top-left numeric readout — values plus a RELATIVE fill (100% = best in
    // the roster for that stat), so hulls compare at a glance.
    const s = selected.stats;
    const rosterMax = (pick: (st: typeof s) => number): number =>
      Math.max(...PLAYER_SHIPS.map((d) => pick(d.stats)));
    const rows: [string, string, number, number][] = [
      ['Hull', `${s.hullMax}`, s.hullMax, rosterMax((t) => t.hullMax)],
      ['Shield', `${s.shieldMax} · +${s.shieldRegenRate}/s`, s.shieldMax, rosterMax((t) => t.shieldMax)],
      ['Speed', `${s.maxSpeed} m/s`, s.maxSpeed, rosterMax((t) => t.maxSpeed)],
      ['Boost', `${s.boostSpeed} m/s`, s.boostSpeed, rosterMax((t) => t.boostSpeed)],
      ['Turn rate', `${s.turnRate.toFixed(1)} rad/s`, s.turnRate, rosterMax((t) => t.turnRate)],
      ['Energy bank', `${s.energyMax}`, s.energyMax, rosterMax((t) => t.energyMax)],
      ['Energy regen', `×${s.energyMult.toFixed(2)}`, s.energyMult, rosterMax((t) => t.energyMult)],
    ];
    const statPanel = document.createElement('div');
    statPanel.className = 'hangar-stats';
    statPanel.innerHTML = `
      <div class="panel-title">${selected.name} — Specifications</div>
      ${rows
        .map(
          ([k, v, val, max]) =>
            `<div class="spec-line"><i style="width:${Math.round((val / max) * 100)}%"></i><span>${k}</span><b>${v}</b></div>`,
        )
        .join('')}
    `;
    this.root.appendChild(statPanel);

    const diffLabel = document.createElement('div');
    diffLabel.className = 'hangar-subhead';
    diffLabel.textContent = 'Threat level';
    right.appendChild(diffLabel);

    for (const d of DIFFICULTIES) {
      const btn = document.createElement('button');
      btn.className = 'diff-btn' + (d.id === this.difficultyId ? ' selected' : '');
      btn.innerHTML = `<img class="diff-icon" src="${getThreatIcon(d.id)}" alt="" /><span class="diff-text"><b>${d.name}</b><span>${d.description}</span></span>`;
      btn.addEventListener('mouseenter', this.callbacks.onHover);
      btn.addEventListener('click', () => {
        this.callbacks.onClick();
        this.difficultyId = d.id;
        this.callbacks.onDifficultySelected(d.id);
        this.render();
      });
      right.appendChild(btn);
    }

    const actions = document.createElement('div');
    actions.className = 'hangar-actions';
    const engage = document.createElement('button');
    engage.className = 'ns-btn';
    engage.textContent = 'Engage';
    engage.addEventListener('mouseenter', this.callbacks.onHover);
    engage.addEventListener('click', () => {
      this.callbacks.onClick();
      this.callbacks.onEngage(this.shipId, this.difficultyId);
    });
    const tutorial = document.createElement('button');
    tutorial.className = 'ns-btn tutorial';
    tutorial.textContent = 'Tutorial';
    tutorial.addEventListener('mouseenter', this.callbacks.onHover);
    tutorial.addEventListener('click', () => {
      this.callbacks.onClick();
      this.callbacks.onTutorial();
    });
    const back = document.createElement('button');
    back.className = 'ns-btn danger';
    back.textContent = 'Back';
    back.addEventListener('mouseenter', this.callbacks.onHover);
    back.addEventListener('click', () => {
      this.callbacks.onClick();
      this.callbacks.onBack();
    });
    actions.append(engage, tutorial, back);

    // Keep actions independent from the top-anchored briefing stack. The
    // curved visor mounts this row against the same bottom baseline as the
    // ship cards, including after an F11 viewport-height change.
    body.append(right, actions);
    this.root.appendChild(body);
    this.callbacks.onRendered?.();
  }

  private shipCard(ship: PlayerShipDef): HTMLElement {
    const card = document.createElement('div');
    card.className = 'ship-card' + (ship.id === this.shipId ? ' selected' : '');
    const s = ship.stats;
    const stats: [string, number][] = [
      ['Speed', s.maxSpeed / STAT_CAPS.speed],
      ['Agility', s.turnRate / STAT_CAPS.agility],
      ['Hull', s.hullMax / STAT_CAPS.hull],
      ['Shield', s.shieldMax / STAT_CAPS.shield],
      ['Energy', s.energyMult / STAT_CAPS.energy],
    ];
    const statRows = stats
      .map(
        ([label, frac]) => `
        <div class="stat-row">
          <span>${label}</span>
          <div class="stat-track"><i style="width:${Math.round(frac * 100)}%"></i></div>
        </div>`,
      )
      .join('');
    card.innerHTML = `
      <img class="ship-thumb" src="${this.thumbnails[ship.id]}" alt="${ship.name}" />
      <div class="ship-card-name">${ship.name}</div>
      <div class="ship-card-role">${ship.role}</div>
      ${statRows}
    `;
    card.addEventListener('mouseenter', this.callbacks.onHover);
    card.addEventListener('click', () => {
      this.callbacks.onClick();
      this.shipId = ship.id;
      this.callbacks.onShipSelected(ship.id);
      this.render();
    });
    return card;
  }

  destroy(): void {
    this.root.remove();
  }
}
