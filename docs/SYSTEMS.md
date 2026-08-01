# Systems & balance reference

Last updated: 2026-07-31.

The gameplay rulebook: what every system does, with the actual numbers and where
they live. When designing a feature, check here first — most mechanics interlock
(flux is fuel AND crafting feedstock AND merchant currency; alert links combat to
travel; contracts link neutrals to everything).

## The loop

Launch (hangar: ship + difficulty) → **peaceful sector 1** (no Vigil, full jump
fuel, merchant guaranteed) → explore/mine/trade/contract → **hold-J** jump into
ever-meaner sectors (or dive onto planets) → death banks score÷10 as **credits**
→ Legacy shop → next run. Per-run upgrades die with you; Legacy is permanent.

## Environments

| | Space sector | Planet surface |
|---|---|---|
| Built by | `Sector` (seeded from the `GameFoundation` RNG stream) | `PlanetSurface` |
| Bodies list | `sector.asteroids.bodies` | `surface.bodies` |
| Routed via | `Game.world` accessor (bodies/destroyRock/depleteOre/spawnChild) | same |
| Hostiles | patrols, cave turrets, capital + batteries, hunters | base turrets + patrols (scaled by sector threat) |
| Neutral traffic | haulers ×3, merchant (guaranteed s1, 70% after) | none |
| Persistence | **exact across planetfall** (`spaceStash` detach/restore) | **exact across revisits in the current sector/sortie** (`planetStates`: surface + surviving garrison + pickups) |
| Exit | hold-J jump (sector++) or planet dive (aim at planet) | hold-J aiming skyward (forward.y > 0.5) |

Death/quit while landed: `discardSurface()` drops surface + stash, restores sector.
Leaving the sector/sortie disposes its cached planet visits. A harvested node,
destroyed enemy, or moved pickup otherwise stays changed when returning to that
same planet.

## Travel (GameInteractions.startJump / GameWorldFlow.completeJump)

- HOLD J: 5 s spool (`JUMP_SPOOL_TIME`); release cancels; **any player hit cancels**.
- Sector jump: costs **2 Flux** (`JUMP_FLUX_COST`, charged at completion), requires
  clear 340 u forward corridor (`jumpPathBlocked`), blocked inside 600 u of a live
  capital (`JUMP_SUPPRESS_RANGE`). Arrival: fresh sector, +15%/sector threat
  (`threatScale`), glide-in at 55 u/s, alert −2 tiers of heat. Both sector arrival
  and planetary lift-off face the equal-weight mean bearing of live targetable
  contacts; mounted carrier batteries are excluded so the hull counts once.
- Planet dive: free, no suppression/corridor check; triggers when a planet is inside
  the crosshair cone (`findAimedPlanet`: angular radius + 0.04 rad).
- Warp FX: `WarpTunnel` (camera-parented) intensity = spool progress; aberration punch.
- A launch without an explicit `?seed=` rolls fresh entropy before the first sector,
  so a new game does not keep replaying the same level theme. Explicit seeds remain
  deterministic for tests and reproductions.

## Threat & encounters (EncounterDirector)

- **Alert 0–5** = floor(heat/3). Heat: fighter kill +1, turret +2, capital +6.
- Alert ≥1 → hunter wings (2 + alert/2, max 5) dispatched every 55–85 s (−5 s/alert),
  arriving 900–1200 u out on a shared vector. Ambient scout pair every 100–160 s.
- Gated OFF in sector 1 and on planets.
- Difficulty multipliers (`Difficulty.ts`): Rookie ×0.6 dmg /0.8 tough /0.75 aggr;
  Veteran ×1; Reckoning ×1.45/1.3/1.3, score ×1.6.
- Patrol wings detect the player at **380 u** (`PATROL_DETECT_RANGE`) or when shot.
- Safe sector entry: `SpawnSafety` searches progressively wider shells for at least
  **700 m** clearance from hostiles and every patrol waypoint, rejects asteroid
  overlap, and has a guaranteed clear outer-shell fallback. Planets use 40 candidates
  scored by distance + 500 when terrain blocks every hostile sightline (`pickSpawn`).

## Combat

- Player weapons share one energy pool (regen × ship's `energyMult`); weapon reach =
  `projectileSpeed × life` (pulse ≈ 544, scatter ≈ 243, lance ≈ 774) — drives the
  grey out-of-range markers. Missiles: 68-damage soft-lock seekers, 1.35 s cooldown,
  hard 1,050 m traveled-path range with its final collision sweep clamped to range.
- Enemy bombers and rocket batteries use two deterministic payload families:
  **Seeker** (56 dmg, 92→205 u/s, 1.55 rad/s turn, 8 s life) or **Lance Rocket**
  (24 dmg, unguided 285 u/s, 4.6 s life). Only a live seeker target raises the
  amber missile-lock warning; the count is active in-flight homing rockets, not
  enemies carrying launchers. Acceleration-aware pursuit ETA (with turn penalty)
  ≤2 s raises the red imminent warning and counts down from approximately two
  seconds instead of appearing late near 0.6 s. A cloak activated outside the
  hostile exclusion radius drops every seeker target immediately; the missile
  continues ballistically and no longer contributes to the warning. Seeker bombers
  may launch while pursuing anywhere inside 1,200 m. Once imminent, each missile's
  displayed ETA only decreases; an outbound/missed missile drops the timer.
- Rotary interceptors and batteries fire amber 2.6-damage bolts at autogun cadence
  (fighter 0.055 s, battery 0.11 s), 390 m/s, with audio chatter globally rate-limited.
- Alert hunter wings are capped at 12 live reinforcements. A dispatch fills only
  the available slots and emits its actual arrival count; if the cap is full the
  cadence timers continue normally without allocating another wing. Sector patrols
  and fixed batteries are separate from this reinforcement budget.
- Targeting soft-lock: 18° acquire / ~28° keep only for in-range close-combat
  aim assist. Out-of-range and peaceful inspection instead use the chase-camera
  origin with a ~2.6° reticle margin plus the target's apparent angular radius,
  with no sensor-distance cap, over ALL
  hostiles (fighters + independent turrets + capital). Acquisition ignores
  world/terrain LOS so cover cannot redirect the lock to a visible neighbor;
  projectiles and enemy firing still collide with that cover. The carrier's twelve mounted batteries collapse into its
  whole-hull contact beyond 260 m; inside 260 m they become individual lock and
  HUD/radar contacts. Projectile collision still tests every mount at every range.
  During active pursuit, inside weapon reach score `(1-dot)*400 + dist*0.5` with a
  −60 keep-bonus lets a much closer turret beat a distant fighter. With no pursuing
  enemy, hostiles and civilians at **every distance** compete in one camera-crosshair
  ranking; during pursuit, hostiles retain priority and distant hostiles still use
  tight angular ranking. Weapon reach controls combat weighting and marker color, never
  whether a contact can be inspected. Civilians are sensor contacts (asteroid clutter
  does not suppress identification), use range only as an exact-angle tie-break, and get no keep-lock
  hysteresis. `Targeting.aimTarget` stays null for a winning civilian, so primary
  convergence, missile homing and the lead pip remain disabled. Losing the contact
  hides its capture bracket immediately without a fade.
- Target preview (top-left, `TargetPreview.ts`): edge-wireframe in the contact's
  REAL view-space orientation (nose-on when charging, tail-on when fleeing).
  Hostile wireframes keep their green→amber→red hull-condition color inside a
  separate GPU-derived red silhouette-perimeter glow. The glow is composited from
  a solid alpha mask before the wireframe, so no internal health edge turns red.
  Geometry is centered in normalized coordinates (`-center * scale`), and a
  carrier receives uniform view-aware zoom so a nose-on hull stays readable.
  Merchants are friendly green and haulers
  neutral blue, with role/action text below the name. Aimed formations match the
  extracted resource (Ion teal, Scrap amber) but never become combat targets.
- Batteries: cannon 60 hull / 340 m / 0.9 s; rotary 58 hull / 468 m / 0.11 s;
  homing rocket 76 hull / 520 m /
  3.4 s; fast rocket 70 hull / 470 u / 2.35 s. All fire only with world/terrain
  LOS. Carrier mounts additionally require the player inside their outward
  traverse hemisphere, so top/bottom batteries never shoot through the deck.
  Cave-asteroid mounts sample the actual displaced rock surface, then push the
  complete turret hit sphere clear of every body and extend the visible pedestal
  across that offset. Dormant independent batteries remain eligible for peaceful
  crosshair inspection.
- Carrier: 1600 hull plus 12 independently targetable batteries (6 top, 6 bottom;
  3 cannon / 3 rotary / 3 homing / 3 fast). Batteries are individually lockable within
  260 m; farther out the preview identifies the carrier as one high-level threat.
  Its annihilator starts only 70–500 m ahead
  within a 12.9° half-angle and clear LOS, then charges for exactly 2 s. Once
  committed it always fires: the aim follows the latest visible player position,
  freezes on LOS loss, and clamps to the firing arc. The thick ray destroys ships
  before its first asteroid; that one rock absorbs the ray and is the only rock
  destroyed. Cooldown after firing is 11 s.
- EMP stun: hostiles dead-stick (velocity decay, no fire). Cloak: brains go blind —
  patrollers keep patrolling, engaged ships drift on their personal offset vector.
- Ramming, asteroid scrapes, terrain impacts: speed-scaled hull damage.

## Marker color language (HUD + edge chevrons + radar, always consistent)

| Color | Meaning |
|---|---|
| red | hostile ship within current-weapon reach |
| amber | turret (edge chevrons only ≤800 u; radar always) |
| grey | hostile beyond current-weapon reach |
| blue dashed | neutral hauler (no edge chevrons) |
| **green double** | **merchant — marked at ANY range** + "⚖ Merchant" by sector readout |
| gold | delivery-contract beacon |

Locked hostiles keep the same range/type color (red in range, grey beyond reach,
amber batteries) plus lead pip and range chip—locking never turns them orange.
Informational civilians use a green/blue box and range chip with no lead pip. Every visible contact gets a
bracket; off-screen hostiles get chevrons with range.

## Contracts (Quests.ts) — hail a hauler with R

Offer shown in a review panel (title/description/pay) and **read aloud via
SpeechSynthesis**; R accepts, X declines; max 2 active; tracker under the score
panel, full log in Engineering (Tab).

| Kind | Weight | Completes | Reward |
|---|---|---|---|
| bounty (N fighters) | 35% | kill count anywhere | 250·N pts + ●1 |
| collect (X resource) | 30% | hail any hauler holding X (consumed) | 120·X pts + ●2 |
| delivery (gold beacon 700–1300 u) | 20% | fly within 70 u | 900 pts + ◆3 ●1 |
| courier (cross-sector) | 15% | complete a sector JUMP | 800 pts + ●3 |

Jumping voids in-sector deliveries; planetfall does NOT (sector persists).

## Economy

- **Scrap**: amber ore veins, kills, wrecks, stashes. Sinks: nanobots, upgrades, trade.
- **Ion Crystal**: teal veins, crystal formations (planets), stashes. Sinks: shield
  cells/upgrades, weapon amps.
- **Flux Core**: rare — brutes/turrets/capital kills, stashes, contract pay,
  merchant (8 Scrap → 1 Flux). Sinks: **jumps (2)**, engine tune, shield matrix.
  The jump-drive row reserves one non-wrapping line and displays compact
  required/held fuel (`J · Flux 2/10`) before spool.
- Scrap, crystal, flux, nanobots and seekers share original inline SVG marks in
  HUD/hold/cost UI (`ResourceIcons.ts`); canvas/text-only feedback keeps compact
  fallback symbols.
- Ore mechanics: veins crack at `oreHp` (26 + scale·0.8); rock death releases buried
  ore. Rocks ≥9 radius calve into 2–3 palette-matched children (reserved instance
  slots); smaller rocks pop. No calving on planets. The “Mine the vein” prompt
  attaches to the owning vein's centroid and is exponentially damped in screen
  space, so aim moving between crystals does not jerk the label. Mining, stash,
  merchant and planet actions all project beside their world object.
- Stashes (`stash: true` bodies): mixed burst 3▲ 3◆ 2●. Found at bases, in caves,
  cave asteroids, wreck blackboxes.
- Merchant stock (`Trade.ts`): buy Flux 1 = Scrap 8 · nano = Scrap 5 ·
  crystals 3 = Scrap 6 · seekers 4 = Scrap 5; sell crystals 3 = Scrap 6 ·
  Flux 1 = Scrap 10. Seeker purchases are unavailable on a hull with no rack.
  Trade screen rows carry painterly offer art (`TradeIcons.ts`), structured
  SVG cost/gain holdings, and a ✕ close button. Purchases play SFX but no
  merchant voiceover; docking fades the engine loop fully silent; Esc/R
  undocks back to flight (auto-pause grace, no menu trip).

## Devices & consumables (Devices.ts)

| | Key | Effect | Numbers |
|---|---|---|---|
| Cloak | F | untargetable, brains blind; predator glass visual (hull 0.045 opacity + iridescent rim shell, engine glow ×0.12) | ≤12 s / 30 s cd; DRAINS weapon energy 2.5/s idle · 7/s moving · 16/s boosting — dry bank or FIRING breaks it |
| EMP | G | stuns hostiles in radius | 250 u, 4 s stun / 25 s cd |
| Nanobots | H | hull heal (crafted consumable) | +35 hull, stock via crafting/merchant |
| Seekers | RMB | homing missiles, AMMO-gated | Vanta: 0/no rack; Kestrel: start ×8/no regen; Aegis: start ×16, +1 every 10 s, fires at 2× rate; restock: merchant ▲5→×4, craft ▲3→×2 |

## Crafting (Inventory.ts RECIPES → GameScreens.craft)

nanobot-kit 6▲ (repeatable) · seekers ×2 3▲ (repeatable, refused without a rack) ·
shield-cell 5◆ (instant +40, refused at full) ·
weapon-amp 8◆4▲ (+15% dmg ×3) · engine-tune 8▲1● (+8% spd ×3) · shield-matrix
8◆1● (+25 max shield ×3). Per-run only. A successful craft rerenders the recipe
  state without changing the right-hand list's scroll position. Any live hostile
  within 180 m disables every recipe and the model transaction itself.

## Meta progression (MetaProgress.ts, localStorage, headless-disabled)

Credits = floor(score/10) banked at death. Legacy upgrades: hull +10%×3 (400·n cr),
damage +5%×3 (500·n), boost +10%×3 (350·n), starting scrap +4×2 (300·n). Applied in
`createPlayer` (stat-block copy — never mutate the `PLAYER_SHIPS` catalog).

## Ships (Ships.ts)

Roster order: smallest first. Per-ship weapon LOADOUTS (WeaponSystem.setLoadout
drives HUD slots, digit keys and wheel), energy banks and missile racks:
- **Vanta** (scout, mesh ×0.78 — genuinely smaller & harder to hit): pulse +
  lance, energy bank 55, NO seeker rack, energyMult 0.9.
- **Kestrel** (balanced): pulse + lance, bank 100, standard rack, mult 1.0.
- **Aegis** (gunship): ROTARY AUTOGUN (0.055 s cd, 2.6 dmg) + Fragment Storm
  (Aegis-exclusive), bank 140, DOUBLE-rate rack, 16 starting seekers and an
  onboard 10-second seeker fabricator, mult 1.35.
Ion Lance: 0.28 s cd, 16 energy/shot — burst weapon, gated hard by the bank.
Hangar shows hardpoint chips + a top-left numeric spec panel on one shared,
outward-convex interactive visor; drag any mouse button on empty space to orbit
the showcase. Startup reads and validates the root-scoped
`nebreck_hangar_ship` / `nebreck_hangar_difficulty` cookies without rewriting
them, falling back to Kestrel/Veteran when absent or invalid. An explicit ship or
difficulty card click writes its one-year cookie immediately, before Engage;
opening the hangar, repainting the visor, and pressing Engage do not write.
Enemy roster: raider (34 hull / 16 shield / 100 pts),
  brute (110 / 50 / 250), and broad-wing bomber (78 / 34 / 325) carrying either
  seeker or fast rockets; selected raiders carry a visible rotary cluster. The
  capital is worth 2500 pts, projects jump suppression,
  exposes its 12 batteries as separate lock/damage targets, and destroys surviving
  mounts when its own hull dies. The complete battery bank represents 35% of the
  carrier's maximum hull; each destroyed mount transfers its durability-weighted
  share of that pool to the carrier, so tougher turret classes inflict more hull damage.

## Planet surface content (`PlanetSurface*.ts`)

Analytic terrain = sines + 2–4 gaussian mountains + 3–5 rimmed craters + fine
high-frequency detail sampled into a smooth-shaded SEG 180 grid. Runtime
`heightAt` interpolates the exact rendered triangles rather than independently
re-evaluating the analytic function, eliminating invisible ground at steep
carves. Base sites are
picked BEFORE terrain build and register **flattened foundation pads** (r 95,
smoothstep blend) in `analyticHeightAt`, so installations sit level; boulders/
crystals are displaced off pads (`onPad`). Vertex color: height gradient +
strata bands + mineral patches + slope darkening. Content: 90 destructible
boulders, 6–10 bounded multi-lobe rock formations, 4–6 lootable crystal
formations, and 2–3
**continuous cave routes** (`PlanetSurfaceCave.ts`): a Catmull-Rom path drives
a broad, rough, open-bottomed rock arch from a broken mouth to an end chamber
with stash/crystals, bounded rock lobes, light, and an interior guard. Control
points form one broad-turn ordered walk and cannot fold a pseudo-branch back
through the tunnel. Overlapping spheres sampled from and offset outside the same
arch profile make visual rock equal collision rock. A dense approach route
follows the first bend;
terrain ramps, base/cave exclusion zones, side-only mouth rubble, and
clearance-selected guard anchors keep entrances and enemies accessible. Turret
hit spheres cover the armored center rather than the long barrels; the finished
surface rejects any mount whose full hit sphere still intersects terrain or a
registered body, preventing one-way batteries hidden inside geometry. Body
impact damage is linear in inward closing speed after a 4 m/s dead zone, so a
parked overlap causes none. Every other visible obstacle registers with the
shared body list and therefore blocks ships, fire, and line of sight. There are
also 2–3 bases from templates (`PlanetSurfaceBase.ts`) — each on an angular hub
with radial service decks and a connected landing pad, perimeter warning pylons,
lit slit windows, floodlight poles, cargo containers, service pipes, plus its
silhouette: compound (3 AABB
blocks/3 rooftop guns, antenna, roof vents) · comm (lattice relay mast +
gimballed dish + shed/2) · depot (4 domed silos + manifold + pump house + hazard
bunds/1, double loot) · fortress (buttressed keep, parapets, lit gate, 4 capped
towers/4). `baseLandmarks` exposes {center, kind} for staging. Player spawns on
the surface with **level attitude** (yaw only). Each installation gets a low
patrol wing (2–3). Revisit persistence detaches and reattaches the exact
surface/garrison state instead of rebuilding it from the seed.
