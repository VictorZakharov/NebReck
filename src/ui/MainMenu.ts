import { GAME_SUBTITLE, GAME_TITLE, INTRO_LINES } from '../game/Story';

export interface MenuCallbacks {
  onLaunch: () => void;
  onLegacy: () => void;
  onHover: () => void;
  onClick: () => void;
}

/**
 * Title screen rendered over the live idling 3D sector: title + buttons,
 * field manual, controls. The FIRST Launch of a session shows the story
 * briefing before handing off to the hangar (no standalone menu entry).
 */
export class MainMenu {
  private readonly root: HTMLElement;
  private briefingSeen = false;

  constructor(parent: HTMLElement, private readonly callbacks: MenuCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'screen';
    parent.appendChild(this.root);
    this.renderMain();
  }

  private button(label: string, onClick: () => void, extraClass = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `ns-btn ${extraClass}`.trim();
    b.textContent = label;
    b.addEventListener('mouseenter', () => this.callbacks.onHover());
    b.addEventListener('click', () => {
      this.callbacks.onClick();
      onClick();
    });
    return b;
  }

  private renderMain(): void {
    this.root.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = GAME_TITLE;
    const subtitle = document.createElement('div');
    subtitle.className = 'subtitle';
    subtitle.textContent = GAME_SUBTITLE;
    this.root.append(title, subtitle);

    this.root.append(
      this.button('Launch', () => {
        if (this.briefingSeen) this.callbacks.onLaunch();
        else this.renderBriefing();
      }),
      this.button('Legacy', () => this.callbacks.onLegacy()),
      this.button('Field Manual', () => this.renderManual()),
      this.button('Controls', () => this.renderControls()),
    );

    const footer = document.createElement('div');
    footer.className = 'menu-footer';
    footer.textContent = 'KV-7 Kestrel flight systems · Halcyon Drift sector net';
    this.root.appendChild(footer);
  }

  /** Test-harness hook: jump straight to the controls pane. */
  showControls(): void {
    this.renderControls();
  }

  /** Story intro shown once per session on the way from Launch to the hangar. */
  private renderBriefing(): void {
    this.briefingSeen = true;
    this.root.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'ns-panel briefing';
    const h = document.createElement('h2');
    h.textContent = 'Briefing';
    panel.appendChild(h);
    for (const line of INTRO_LINES) {
      const p = document.createElement('p');
      p.textContent = line;
      panel.appendChild(p);
    }
    this.root.appendChild(panel);
    this.root.appendChild(this.button('Hangar', () => this.callbacks.onLaunch()));
  }

  private renderManual(): void {
    this.root.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'ns-panel manual-panel';
    const h = document.createElement('h2');
    h.textContent = 'Field Manual';
    panel.appendChild(h);
    const cols = document.createElement('div');
    cols.className = 'manual-cols';
    cols.innerHTML = `
      <div class="manual-col">
        <h3>Flight</h3>
        <p>Full-freedom mouse flight with banked turns, strafing on both axes and a
           <b>boost</b> drive gated by boost energy. The camera toggles between a chase view
           and the <b>cockpit</b> (V) — pick whichever you aim better in.</p>
        <h3>Combat</h3>
        <p>Three primary weapons share one energy pool: <b>Pulse Cannons</b> (fast bolts),
           <b>Fragment Storm</b> (close-range shotgun) and the <b>Ion Lance</b> (heavy slug).
           Cycle with 1·2·3 or the wheel.</p>
         <p>The reticle soft-locks the hostile nearest your crosshair and projects a
            <b>lead pip</b> — put your shots on the pip, not the ship. <b>Seeker missiles</b>
            (RMB) chase whatever you have locked. Enemy seekers raise a lock warning;
            inside two seconds it turns red. Sensors can retain contacts through cover,
            but weapons still strike the intervening terrain. A safely activated cloak
            breaks enemy missile lock.</p>
        <p>The <b>sphere radar</b> at the bottom of the HUD shows every contact in
           your ship's frame: up on the sphere is above you, the stem shows height
           over your wing plane, the bright tick marks dead ahead.</p>
        <p>Marker colors everywhere — reticles, edge chevrons, radar blips:
           <b>red</b> is a hostile ship in weapon reach, <b>amber</b> is a turret,
           <b>grey</b> means beyond your <b>current weapon's</b> range — switch
           weapons and watch the colors change.</p>
        <p>Shields recharge after a few quiet seconds; hull does not — repair it in
           Engineering. Ramming hurts. Asteroids hurt more.</p>
        <h3>Devices</h3>
        <p><b>Cloak</b> (F): sensor invisibility that feeds on your <b>weapon
           energy</b> — sitting still sips it, cruising drinks it, boosting gulps
           it. When the bank hits zero you decloak, and <b>firing any weapon
           drops the cloak instantly</b>. It won't engage with a hostile too
           close — break away first. F again drops it early (cooldown starts
           when the cloak ends). <b>EMP burst</b> (G): dead-sticks every hostile
           within 250 m for four seconds, on a cooldown. <b>Nanobot kits</b> (H)
           are crafted consumables that weld 35 hull back on, mid-fight.</p>
        <h3>Ships & threat</h3>
         <p>Three hulls in the hangar: the balanced <b>Kestrel</b>, the fast-but-fragile
            <b>Vanta</b>, the armored <b>Aegis</b> with a deep energy pool. Threat level
            scales enemy damage, toughness, wave size and score. Vigil wings mix dart
            raiders, heavy wardens and broad missile bombers carrying guided or fast rockets.</p>
      </div>
      <div class="manual-col">
        <h3>Mining</h3>
        <p>Rocks with <b>glowing veins</b> carry ore: teal crystals hold <b>Ion Crystals</b>,
           amber veins hold <b>Scrap Alloy</b>. Shoot the vein until it cracks and tractor
           in the drops. Destroyed Vigil ships leave salvage; heavies sometimes drop rare
           <b>Flux Cores</b>.</p>
        <p>Every asteroid is <b>destructible</b> — big rocks calve into smaller flying
           rocks, small ones shatter into fragments. Buried ore comes out with the
           wreckage.</p>
        <h3>Exploration</h3>
        <p>A few asteroids in each sector are <b>hollow giants</b> — fly in through the
           cave mouths. Inside: rich crystal veins, <b>secret stashes</b> that burst with
           mixed salvage, and Vigil <b>turret emplacements</b> that would prefer you left.</p>
        <h3>Crafting</h3>
        <p>Press <b>Tab</b> in flight to open Engineering: spend salvage on hull patches,
           shield cells, or permanent upgrades — <b>Weapon Amplifiers</b>, <b>Engine
           Tuning</b> and <b>Shield Matrices</b>, three ranks each. Upgrades last until
           you die; salvage does not follow you into the next life.</p>
        <h3>The sector</h3>
        <p>The Drift is inhabited: Vigil <b>patrol wings</b> fly their routes and only
           engage if you stray close (or shoot first), <b>neutral haulers</b> run cargo
           lanes — blue markers, no threat, ECHO judges piracy — and somewhere out
            there a Vigil <b>capital ship</b> holds station behind twelve individually
            destructible top/bottom batteries. Its prow annihilator telegraphs for two
            seconds before firing down a narrow frontal arc; break sideways or put an
            asteroid between you and the beam. Worth 2500 points, if you can crack 1600 hull.
            Asteroid fields cluster by
           mineral: iron, pale ice, copper, dark basalt. You always launch clear of
           hostiles — how long that lasts is up to you.</p>
        <h3>Wrecks & Legacy</h3>
        <p>Derelict hulks drift unmarked through every sector — find one by eye and
           crack the blinking <b>blackbox</b> for a salvage burst. When you die, your
           score banks as <b>credits</b> that survive death: spend them in the
           <b>Legacy</b> menu on permanent hull, damage, boost and stock upgrades.</p>
        <h3>The run</h3>
        <p>No waves, no arena — the Drift is a place, and <b>your first sector is
           peaceful</b>: no Vigil, full jump fuel. Learn the ship, mine, meet the
           haulers — the war starts one jump deeper. From sector 2 on, every Vigil
           kill raises your <b>alert</b> signature (0–5); run hot and <b>hunter
           wings</b> start jumping in to collect you.</p>
        <h3>Contracts</h3>
        <p>Fly within hailing range of a hauler and press <b>R</b>: they present a
           procedurally generated offer — <b>bounties</b>, <b>procurement</b>, beacon
           <b>deliveries</b> (gold markers), <b>courier runs across sectors</b> —
           with the pay listed up front. <b>R</b> accepts, <b>X</b> declines. Two
           contracts at a time; the tracker lives under your score, the full log in
           Engineering (Tab). Jumping away with delivery cargo voids the deal.</p>
        <h3>Sector travel</h3>
        <p><b>Hold J</b> to spool the jump drive — release and the jump aborts, take
           a hit and it aborts. It burns <b>2 Flux Cores</b>, needs a clear corridor
           ahead, and the Vigil capital's <b>suppression field</b> blocks it outright.
           Each new sector is meaner and worth more; how deep you go is the run.</p>
        <h3>Planetfall</h3>
        <p>Spool a jump with a <b>planet in your crosshair</b> and you dive instead —
           free of charge. Below: terrain, Vigil <b>ground bases</b> with rooftop
           batteries, low patrols, caches worth cracking. You drop behind
           <b>terrain cover</b>, out of their fire lines. To leave, point the nose at
           the sky and <b>hold J</b>.</p>
        <h3>Merchants</h3>
        <p>The gold-hulled ship with the <b>green beacon</b> is a merchant — marked in
           trade-green at any range, noted next to your sector readout. Dock with
           <b>R</b> to buy flux, nanobots and crystals, or sell salvage.</p>
        <h3>Performance</h3>
        <p>The engine renders at your display's refresh rate — 144 Hz displays get
           144 FPS if the GPU keeps up. Simulation is frame-rate independent.</p>
      </div>
    `;
    panel.appendChild(cols);
    this.root.appendChild(panel);
    this.root.appendChild(this.button('Back', () => this.renderMain()));
  }

  private renderControls(): void {
    this.root.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'ns-panel controls-panel';
    const h = document.createElement('h2');
    h.textContent = 'Controls';
    panel.appendChild(h);

    // Two logical panes side by side: FLIGHT on the left, COMBAT & SYSTEMS
    // on the right — fits the screen height without scrolling.
    const groups: [string, [string, string][]][] = [
      ['Flight', [
        ['Mouse', 'Steer (pitch / yaw)'],
        ['W / S', 'Thrust forward / brake'],
        ['A / D', 'Strafe left / right'],
        ['Space / L-Ctrl', 'Strafe up / down'],
        ['Q / E', 'Roll'],
        ['Shift', 'Boost'],
        ['J (hold)', 'Jump / land on aimed planet / lift off'],
        ['V', 'Toggle cockpit / chase camera'],
      ]],
      ['Combat & Systems', [
        ['LMB', 'Fire primary weapon'],
        ['RMB', 'Launch seeker missile'],
        ['1 · 2 / Wheel', 'Switch weapon'],
        ['F / G / H', 'Cloak / EMP burst / use nanobots'],
        ['Tab', 'Engineering loadout (craft & repair)'],
        ['R', 'Hail hauler · dock merchant · accept offer'],
        ['X', 'Decline a contract offer'],
        ['Esc', 'Pause'],
      ]],
    ];
    // Keys render as real KEYCAPS; mouse inputs as a mouse glyph with the
    // relevant button/wheel highlighted.
    const mouseSvg = (part: 'left' | 'right' | 'wheel' | 'move'): string => {
      const hl = '#27e8ff';
      const stroke = part === 'move' ? hl : 'rgba(255,255,255,0.6)';
      const leftFill = part === 'left' ? hl : 'transparent';
      const rightFill = part === 'right' ? hl : 'transparent';
      const wheelFill = part === 'wheel' ? hl : 'rgba(255,255,255,0.45)';
      // One capsule shell; button highlights are quarter-panels that follow
      // the shell's top curve; thin divider lines; wheel pill in the notch.
      return `<svg class="mouse-glyph" viewBox="0 0 22 32" width="18" height="26" aria-hidden="true">
        <path d="M11 1.8 C16.4 1.8 20.2 5.6 20.2 11.4 L20.2 12.4 L11 12.4 Z" fill="${rightFill}"/>
        <path d="M11 1.8 C5.6 1.8 1.8 5.6 1.8 11.4 L1.8 12.4 L11 12.4 Z" fill="${leftFill}"/>
        <rect x="1.8" y="1.8" width="18.4" height="28.4" rx="9.2" fill="rgba(255,255,255,0.07)" stroke="${stroke}" stroke-width="1.5"/>
        <line x1="1.8" y1="12.4" x2="20.2" y2="12.4" stroke="${stroke}" stroke-width="1"/>
        <line x1="11" y1="1.8" x2="11" y2="12.4" stroke="${stroke}" stroke-width="1"/>
        <rect x="9.3" y="5.2" width="3.4" height="7" rx="1.7" fill="${wheelFill}" stroke="rgba(0,0,0,0.5)" stroke-width="0.6"/>
      </svg>`;
    };
    const tokenHtml = (t: string): string => {
      if (t === 'LMB') return mouseSvg('left');
      if (t === 'RMB') return mouseSvg('right');
      if (t === 'Wheel') return mouseSvg('wheel');
      if (t === 'Mouse') return mouseSvg('move');
      return `<kbd>${t}</kbd>`;
    };
    const keysHtml = (label: string): string =>
      label
        .split(' / ')
        .map((part) => {
          const hold = part.endsWith(' (hold)');
          const clean = hold ? part.slice(0, -7) : part;
          const cluster = clean
            .split(' · ')
            .map(tokenHtml)
            .join('<span class="key-sep">·</span>');
          return hold ? `${cluster}<i class="key-note">hold</i>` : cluster;
        })
        .join('<span class="key-sep">/</span>');

    const cols = document.createElement('div');
    cols.className = 'controls-cols';
    for (const [title, rows] of groups) {
      const col = document.createElement('div');
      col.className = 'controls-col';
      const sub = document.createElement('div');
      sub.className = 'loadout-subhead';
      sub.textContent = title;
      col.appendChild(sub);
      const table = document.createElement('table');
      table.className = 'controls-table';
      for (const [key, action] of rows) {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        td1.innerHTML = keysHtml(key);
        const td2 = document.createElement('td');
        td2.textContent = action;
        tr.append(td1, td2);
        table.appendChild(tr);
      }
      col.appendChild(table);
      cols.appendChild(col);
    }
    panel.appendChild(cols);
    this.root.appendChild(panel);
    this.root.appendChild(this.button('Back', () => this.renderMain()));
  }

  destroy(): void {
    this.root.remove();
  }
}
