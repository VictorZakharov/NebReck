import { holdingIconSvg } from './ResourceIcons';

export interface HudTargetState {
  visible: boolean;
  x: number;
  y: number;
  distance: number;
  leadVisible: boolean;
  leadX: number;
  leadY: number;
  relationship: 'hostile' | 'friendly' | 'neutral' | null;
}

export type HostileClass = 'ship' | 'turret' | 'neutral' | 'merchant' | 'objective';

export interface HudOffscreenMarker {
  /** Radians, 0 = up, clockwise. */
  angle: number;
  distance: number;
  kind: HostileClass;
  /** Within the current weapon's reach — out-of-range markers render grey. */
  inRange: boolean;
}

/** A hostile that IS on screen but not the soft-locked target. */
export interface HudContactMarker {
  x: number;
  y: number;
  distance: number;
  kind: HostileClass;
  inRange: boolean;
}

export interface HudFrameState {
  hull: number;
  hullMax: number;
  shield: number;
  shieldMax: number;
  energy: number;
  energyMax: number;
  boost: number;
  boostMax: number;
  speed: number;
  boosting: boolean;
  weaponIndex: number;
  /** The selected hull's hardpoint fit — slots render from this. */
  weaponNames: string[];
  missileReadyFrac: number; // 1 = ready
  /** Seeker ammo remaining; null = this hull carries no launcher. */
  missiles: number | null;
  score: number;
  alert: number;
  sector: number;
  jump: { label: string; frac: number };
  devices: {
    cloak: { label: string; frac: number; active: boolean };
    emp: { label: string; frac: number; active: boolean };
    nano: number;
  };
  /** Interaction hint shown center-low ("R · Hail hauler"), or null. */
  prompt: string | null;
  /** Optional screen-space attachment point for a world object such as ore. */
  promptAnchor: { x: number; y: number } | null;
  questLog: { title: string; progress: string }[];
  /** Contract under review (R accept / X decline), or null. */
  offer: { title: string; description: string; reward: string } | null;
  merchantPresent: boolean;
  onPlanet: boolean;
  /** Wireframe target readout (top-left), or null when nothing is locked. */
  targetPreview: {
    name: string;
    detail: string;
    relationship: 'hostile' | 'friendly' | 'neutral';
    hullFrac: number;
  } | null;
  fps: number;
  target: HudTargetState;
  /** Visible hostiles that are not the locked target — every one gets a bracket. */
  contacts: HudContactMarker[];
  offscreen: HudOffscreenMarker[];
  resources: { scrap: number; crystal: number; flux: number };
}

/**
 * The in-flight HUD. Pure DOM/CSS driven by one `update(state)` call per
 * frame — no game logic in here. Clusters sit on angular panel plates with
 * accent spines; off-screen hostiles get edge chevrons with range readouts.
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly els: Record<string, HTMLElement> = {};
  private readonly markerPool: { root: HTMLElement; label: HTMLElement }[] = [];
  private readonly contactPool: { root: HTMLElement; label: HTMLElement }[] = [];
  private commsCount = 0;
  /** Pickups mid-flight to the counters: displayed count lags by this much
   *  per type until each glyph lands (inventory itself updates instantly). */
  private readonly pendingFly = { scrap: 0, crystal: 0, flux: 0 };
  private readonly flyEls = new Set<HTMLElement>();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div class="crosshair"><i class="crosshair-ring"></i></div>
      <svg class="center-arcs" viewBox="0 0 120 120">
        <g data-el="arcShieldG">
          <path class="arc-track" d="M 20.2 83 A 46 46 0 0 0 99.8 83"/>
          <path class="arc-fill arc-shield" data-el="arcShield" d="M 20.2 83 A 46 46 0 0 0 99.8 83"/>
        </g>
        <g data-el="arcHullG">
          <path class="arc-track" d="M 26.2 79.5 A 39 39 0 0 0 93.8 79.5"/>
          <path class="arc-fill arc-hull" data-el="arcHull" d="M 26.2 79.5 A 39 39 0 0 0 93.8 79.5"/>
        </g>
        <g data-el="arcBoostG">
          <path class="arc-fill arc-boost" data-el="arcBoost" d="M 20.2 37 A 46 46 0 0 1 99.8 37"/>
        </g>
      </svg>
      <div class="center-seeker" data-el="centerSeeker"><i data-el="centerSeekerFill"></i><span data-el="centerSeekerText"></span></div>
      <div class="hitmarker" data-el="hitmarker"></div>
      <div class="target-box" data-el="targetBox" style="opacity:0"></div>
      <div class="target-dist" data-el="targetDist" style="opacity:0"></div>
      <div class="lead-pip" data-el="leadPip" style="opacity:0"></div>
      <div class="hud-cluster hud-vitals">
        <div class="bar-label"><span>Shield</span><span data-el="shieldText"></span></div>
        <div class="bar shield"><i data-el="shieldBar"></i></div>
        <div class="bar-label"><span>Hull</span><span data-el="hullText"></span></div>
        <div class="bar hull" data-el="hullBarWrap"><i data-el="hullBar"></i></div>
      </div>
      <div class="hud-cluster hud-drive">
        <div class="bar-label"><span>Boost</span><span data-el="speedValue">0 m/s</span></div>
        <div class="bar boost"><i data-el="boostBar"></i></div>
        <div class="bar-label"><span>Jump drive</span><span data-el="jumpText"></span></div>
        <div class="bar jump"><i data-el="jumpBar"></i></div>
      </div>
      <div class="hud-cluster hud-kit hud-panel">
        <div class="device-row">
          <span class="device" data-el="devCloak"></span>
          <span class="device" data-el="devEmp"></span>
          <span class="device" data-el="devNano"></span>
        </div>
      </div>
      <div class="hud-resources">
        <div class="resource-line">
          <span class="res-scrap"><i>${holdingIconSvg('scrap')}</i><b data-el="resScrap">0</b></span>
          <span class="res-crystal"><i>${holdingIconSvg('crystal')}</i><b data-el="resCrystal">0</b></span>
          <span class="res-flux"><i>${holdingIconSvg('flux')}</i><b data-el="resFlux">0</b></span>
        </div>
      </div>
      <div class="hud-hint">Tab loadout · V view · F cloak · G emp · H repair · J jump</div>
      <div class="hud-corner hud-weapons hud-panel">
        <div class="panel-title">Armament</div>
        <div class="weapon-name" data-el="weaponName"></div>
        <div class="weapon-row">
          <div class="bar energy weapon-energy"><i data-el="energyBar"></i></div>
          <div class="weapon-slots" data-el="weaponSlots"></div>
        </div>
        <div class="missile-status" data-el="missileStatus"><i class="missile-fill" data-el="missileFill"></i><span data-el="missileText">Seekers ready</span></div>
      </div>
      <div class="hud-corner hud-score hud-panel">
        <div class="score-line">Score <b data-el="scoreValue">0</b></div>
        <div class="score-line">Sector <b data-el="sectorValue">1</b><span data-el="planetTag" class="planet-tag"> · Surface</span> · Alert <b data-el="alertValue">0</b><span data-el="merchantNote" class="merchant-note"> · ⚖ Merchant</span></div>
        <div class="quest-tracker" data-el="questTracker"></div>
      </div>
      <div class="target-preview hud-panel" data-el="targetPreview">
        <div class="panel-title" data-el="previewTitle">Target</div>
        <div class="preview-wrap" data-el="previewWrap"></div>
        <div class="preview-name" data-el="previewName"></div>
        <div class="preview-detail" data-el="previewDetail"></div>
        <div class="bar preview-hullbar"><i data-el="previewHullBar"></i></div>
      </div>
      <div class="interact-prompt" data-el="interactPrompt"></div>
      <div class="offer-panel" data-el="offerPanel">
        <div class="offer-head">Contract offer</div>
        <div class="offer-title" data-el="offerTitle"></div>
        <div class="offer-desc" data-el="offerDesc"></div>
        <div class="offer-reward" data-el="offerReward"></div>
        <div class="offer-keys"><b>R</b> accept &nbsp;·&nbsp; <b>X</b> decline</div>
      </div>
      <div class="hud-fps" data-el="fps"></div>
      <div class="radar-wrap" data-el="radarWrap"></div>
      <div class="comms-feed" data-el="comms"></div>
      <div class="wave-banner" data-el="banner"></div>
      <div class="vignette-damage" data-el="damageVignette"></div>
      <div class="vignette-lowhull" data-el="lowHull"></div>
      <div class="vignette-jump" data-el="jumpFlash"></div>
    `;
    parent.appendChild(this.root);
    this.root.querySelectorAll<HTMLElement>('[data-el]').forEach((el) => {
      this.els[el.dataset.el!] = el;
    });

  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('visible', visible);
  }

  /** Mounts the 3D radar's canvas into its HUD slot. */
  attachRadar(canvas: HTMLCanvasElement): void {
    this.els.radarWrap.appendChild(canvas);
  }

  /** Mounts the wireframe target-preview canvas into its HUD slot. */
  attachTargetPreview(canvas: HTMLCanvasElement): void {
    this.els.previewWrap.appendChild(canvas);
  }

  update(s: HudFrameState): void {
    const e = this.els;
    e.shieldBar.style.width = `${(s.shield / s.shieldMax) * 100}%`;
    e.shieldText.textContent = `${Math.ceil(s.shield)}`;
    e.hullBar.style.width = `${(s.hull / s.hullMax) * 100}%`;
    e.hullText.textContent = `${Math.ceil(s.hull)}`;
    e.hullBarWrap.classList.toggle('low', s.hull / s.hullMax < 0.3);
    e.lowHull.classList.toggle('on', s.hull / s.hullMax < 0.3);
    e.energyBar.style.width = `${(s.energy / s.energyMax) * 100}%`;
    e.boostBar.style.width = `${(s.boost / s.boostMax) * 100}%`;

    e.speedValue.textContent = `${Math.round(s.speed)} m/s`;

    // Center arcs: 120° shield/hull arcs below the reticle, boost above.
    // Each arc only shows while its value is BELOW full — a clean reticle
    // means all systems are topped up. 120° arc length: r46 ≈ 96.3, r39 ≈ 81.7.
    const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
    const shieldFrac = clamp01(s.shield / s.shieldMax);
    const hullFrac = clamp01(s.hull / s.hullMax);
    const boostFrac = clamp01(s.boost / s.boostMax);
    e.arcShieldG.style.opacity = shieldFrac >= 0.999 ? '0' : '1';
    e.arcHullG.style.opacity = hullFrac >= 0.999 ? '0' : '1';
    e.arcBoostG.style.opacity = boostFrac >= 0.999 ? '0' : '1';
    e.arcShield.style.strokeDashoffset = String(96.3 * (1 - shieldFrac));
    e.arcHull.style.strokeDashoffset = String(81.7 * (1 - hullFrac));
    e.arcBoost.style.strokeDashoffset = String(96.3 * (1 - boostFrac));

    // Seeker reload chip under the arcs — ammo count over a reload fill.
    if (s.missiles === null) {
      e.centerSeeker.style.display = 'none';
    } else {
      e.centerSeeker.style.display = 'flex';
      e.centerSeekerText.textContent = s.missiles <= 0 ? 'EMPTY' : `➤ ×${s.missiles}`;
      e.centerSeekerFill.style.width = `${clamp01(s.missileReadyFrac) * 100}%`;
    }

    e.weaponName.textContent = s.weaponNames[s.weaponIndex] ?? '';
    // Slots track the hull's hardpoint count (ships fit 2 or 3 weapons).
    if (e.weaponSlots.children.length !== s.weaponNames.length) {
      e.weaponSlots.innerHTML = '';
      s.weaponNames.forEach((_, i) => {
        const slot = document.createElement('div');
        slot.className = 'weapon-slot';
        slot.textContent = String(i + 1);
        e.weaponSlots.appendChild(slot);
      });
    }
    const slots = e.weaponSlots.children;
    for (let i = 0; i < slots.length; i++) {
      (slots[i] as HTMLElement).classList.toggle('active', i === s.weaponIndex);
    }
    // Reload renders as a BACKGROUND fill sweeping behind the ammo label.
    if (s.missiles === null) {
      e.missileText.textContent = 'No seeker rack';
      e.missileFill.style.width = '0%';
      e.missileStatus.classList.add('cooling');
    } else if (s.missiles <= 0) {
      e.missileText.textContent = 'Seekers empty';
      e.missileFill.style.width = '0%';
      e.missileStatus.classList.add('cooling');
    } else {
      const ready = s.missileReadyFrac >= 1;
      e.missileText.textContent = `Seekers ×${s.missiles}`;
      e.missileFill.style.width = `${Math.min(1, s.missileReadyFrac) * 100}%`;
      e.missileStatus.classList.toggle('cooling', !ready);
    }

    e.resScrap.textContent = String(Math.max(0, s.resources.scrap - this.pendingFly.scrap));
    e.resCrystal.textContent = String(Math.max(0, s.resources.crystal - this.pendingFly.crystal));
    e.resFlux.textContent = String(Math.max(0, s.resources.flux - this.pendingFly.flux));

    e.scoreValue.textContent = String(s.score);
    e.sectorValue.textContent = String(s.sector);
    e.alertValue.textContent = String(s.alert);
    e.merchantNote.style.display = s.merchantPresent ? 'inline' : 'none';
    e.planetTag.style.display = s.onPlanet ? 'inline' : 'none';

    e.targetPreview.classList.toggle('show', s.targetPreview !== null);
    if (s.targetPreview) {
      e.targetPreview.classList.toggle('friendly', s.targetPreview.relationship === 'friendly');
      e.targetPreview.classList.toggle('neutral', s.targetPreview.relationship === 'neutral');
      e.previewTitle.textContent = s.targetPreview.relationship === 'hostile' ? 'Target' : 'Contact';
      e.previewName.textContent = s.targetPreview.name;
      e.previewDetail.textContent = s.targetPreview.detail;
      const f = Math.max(0, Math.min(1, s.targetPreview.hullFrac));
      e.previewHullBar.style.width = `${f * 100}%`;
      e.previewHullBar.style.background = s.targetPreview.relationship === 'friendly'
        ? '#8aff9f'
        : s.targetPreview.relationship === 'neutral'
          ? '#9fdcff'
          : `hsl(${f * 120}, 90%, 52%)`;
    }
    e.fps.textContent = `${Math.round(s.fps)} FPS`;

    e.jumpText.textContent = s.jump.label;
    e.jumpBar.style.width = `${s.jump.frac * 100}%`;

    const d = s.devices;
    e.devCloak.textContent = `Cloak ${d.cloak.label}`;
    e.devCloak.classList.toggle('on', d.cloak.active);
    e.devCloak.classList.toggle('cooling', !d.cloak.active && d.cloak.frac < 1);
    e.devEmp.textContent = `EMP ${d.emp.label}`;
    e.devEmp.classList.toggle('cooling', d.emp.frac < 1);
    e.devNano.textContent = `Nano ×${d.nano}`;
    e.devNano.classList.toggle('cooling', d.nano === 0);

    // Interaction prompt + contract tracker.
    e.interactPrompt.textContent = s.prompt ?? '';
    e.interactPrompt.style.opacity = s.prompt ? '1' : '0';
    e.interactPrompt.classList.toggle('world-anchored', s.promptAnchor !== null);
    if (s.promptAnchor) {
      e.interactPrompt.style.left = `${s.promptAnchor.x}px`;
      e.interactPrompt.style.top = `${s.promptAnchor.y}px`;
    } else {
      e.interactPrompt.style.left = '';
      e.interactPrompt.style.top = '';
    }
    const questHtml = s.questLog
      .map((q) => `<div class="quest-line"><b>${q.title}</b><span>${q.progress}</span></div>`)
      .join('');
    if (e.questTracker.innerHTML !== questHtml) e.questTracker.innerHTML = questHtml;

    // Contract offer panel.
    e.offerPanel.classList.toggle('show', s.offer !== null);
    if (s.offer) {
      e.offerTitle.textContent = s.offer.title;
      e.offerDesc.textContent = s.offer.description;
      e.offerReward.textContent = s.offer.reward;
    }

    // Target box + lead pip + range readout.
    const t = s.target;
    e.targetBox.classList.toggle('friendly', t.relationship === 'friendly');
    e.targetBox.classList.toggle('neutral', t.relationship === 'neutral');
    e.targetDist.classList.toggle('friendly', t.relationship === 'friendly');
    e.targetDist.classList.toggle('neutral', t.relationship === 'neutral');
    e.targetBox.style.opacity = t.visible ? '1' : '0';
    e.targetDist.style.opacity = t.visible ? '1' : '0';
    if (t.visible) {
      e.targetBox.style.left = `${t.x}px`;
      e.targetBox.style.top = `${t.y}px`;
      // Range chip sits below the box — separate element because the box's
      // corner-bracket clip-path would clip any child rendered outside it.
      e.targetDist.style.left = `${t.x}px`;
      e.targetDist.style.top = `${t.y + 34}px`;
      e.targetDist.textContent = `${Math.round(t.distance)} m`;
    }
    e.leadPip.style.opacity = t.leadVisible ? '1' : '0';
    if (t.leadVisible) {
      e.leadPip.style.left = `${t.leadX}px`;
      e.leadPip.style.top = `${t.leadY}px`;
    }

    // On-screen contact brackets: every visible hostile gets marked — the
    // soft-locked target has the big box, everyone else gets one of these.
    while (this.contactPool.length < s.contacts.length) {
      const root = document.createElement('div');
      root.className = 'contact-marker';
      const label = document.createElement('div');
      label.className = 'contact-dist';
      root.appendChild(label);
      this.root.appendChild(root);
      this.contactPool.push({ root, label });
    }
    this.contactPool.forEach((marker, i) => {
      const c = s.contacts[i];
      if (!c) {
        marker.root.style.display = 'none';
        return;
      }
      marker.root.style.display = 'block';
      marker.root.style.left = `${c.x}px`;
      marker.root.style.top = `${c.y}px`;
      marker.root.classList.toggle('turret', c.kind === 'turret');
      marker.root.classList.toggle('neutral', c.kind === 'neutral');
      marker.root.classList.toggle('merchant', c.kind === 'merchant');
      marker.root.classList.toggle('objective', c.kind === 'objective');
      marker.root.classList.toggle(
        'far',
        c.kind === 'ship' || c.kind === 'turret' ? !c.inRange : false,
      );
      marker.label.textContent = `${Math.round(c.distance)}m`;
    });

    // Off-screen chevrons with range.
    while (this.markerPool.length < s.offscreen.length) {
      const root = document.createElement('div');
      root.className = 'edge-marker';
      const tri = document.createElement('div');
      tri.className = 'edge-arrow';
      const label = document.createElement('div');
      label.className = 'edge-dist';
      root.append(tri, label);
      this.root.appendChild(root);
      this.markerPool.push({ root, label });
    }
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const rx = cx - 90;
    const ry = cy - 90;
    this.markerPool.forEach((marker, i) => {
      const m = s.offscreen[i];
      if (!m) {
        marker.root.style.display = 'none';
        return;
      }
      marker.root.style.display = 'block';
      marker.root.classList.toggle('turret', m.kind === 'turret');
      marker.root.classList.toggle('merchant', m.kind === 'merchant');
      marker.root.classList.toggle('objective', m.kind === 'objective');
      marker.root.classList.toggle(
        'far',
        m.kind === 'ship' || m.kind === 'turret' ? !m.inRange : false,
      );
      const x = cx + Math.sin(m.angle) * rx;
      const y = cy - Math.cos(m.angle) * ry;
      marker.root.style.transform = `translate(${x}px, ${y}px) rotate(${m.angle}rad)`;
      marker.label.textContent = `${Math.round(m.distance)}m`;
      // Counter-rotate so the range text stays upright.
      marker.label.style.transform = `translate(-50%, 0) rotate(${-m.angle}rad)`;
    });
  }

  flashHitmarker(kill: boolean): void {
    const m = this.els.hitmarker;
    m.classList.remove('show');
    m.classList.toggle('kill', kill);
    void m.offsetWidth; // restart the CSS animation
    m.classList.add('show');
  }

  /** White warp flash on sector transition. */
  flashJump(): void {
    const v = this.els.jumpFlash;
    v.style.opacity = '1';
    setTimeout(() => { v.style.opacity = '0'; }, 220);
  }

  flashDamage(intensity: number): void {
    const v = this.els.damageVignette;
    v.style.opacity = String(Math.min(1, intensity));
    setTimeout(() => { v.style.opacity = '0'; }, 130);
  }

  showBanner(text: string): void {
    const b = this.els.banner;
    b.textContent = text;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  /** A collected pickup flies from (x, y) into its HUD counter; the shown
   *  count bumps when it lands. Inventory is already updated by the caller. */
  flyPickup(type: 'scrap' | 'crystal' | 'flux', x: number, y: number): void {
    const target =
      type === 'scrap' ? this.els.resScrap : type === 'crystal' ? this.els.resCrystal : this.els.resFlux;
    const rect = target.getBoundingClientRect();
    if (rect.width === 0) return; // HUD hidden — skip the theater
    const el = document.createElement('div');
    el.className = `pickup-fly fly-${type}`;
    el.textContent = type === 'scrap' ? '▲' : type === 'crystal' ? '◆' : '✦';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.root.appendChild(el);
    this.flyEls.add(el);
    this.pendingFly[type]++;
    void el.offsetWidth; // commit start position, then transition
    el.style.left = `${rect.left + rect.width / 2}px`;
    el.style.top = `${rect.top + rect.height / 2}px`;
    el.style.opacity = '0.2';
    el.style.transform = 'translate(-50%, -50%) scale(0.55)';
    window.setTimeout(() => {
      if (!this.flyEls.delete(el)) return;
      el.remove();
      this.pendingFly[type] = Math.max(0, this.pendingFly[type] - 1);
    }, 620);
  }

  /** Menu/overlay toggles: kill in-flight pickups, counters sync instantly. */
  cancelPickupFlights(): void {
    for (const el of this.flyEls) el.remove();
    this.flyEls.clear();
    this.pendingFly.scrap = 0;
    this.pendingFly.crystal = 0;
    this.pendingFly.flux = 0;
  }

  /** Test-harness hook: staged captures don't want transient comms overlays. */
  clearComms(): void {
    this.els.comms.innerHTML = '';
    this.commsCount = 0;
  }

  addComms(speaker: string, text: string): void {
    const feed = this.els.comms;
    const line = document.createElement('div');
    line.className = 'comms-line';
    const who = document.createElement('b');
    who.textContent = speaker;
    line.appendChild(who);
    line.appendChild(document.createTextNode(text));
    feed.appendChild(line);
    this.commsCount++;
    if (this.commsCount > 4) feed.firstElementChild?.remove();
    setTimeout(() => {
      line.classList.add('fading');
      setTimeout(() => line.remove(), 1100);
    }, 6500);
  }

  destroy(): void {
    this.root.remove();
  }
}
