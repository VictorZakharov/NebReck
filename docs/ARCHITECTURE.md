# Architecture

Last updated: 2026-08-01.

High-level map of how Nebula Reckoning is put together and why. Companion docs:
[GOTCHAS.md](GOTCHAS.md) (things that will bite you), [EXTENDING.md](EXTENDING.md)
(recipes for common additions), [SYSTEMS.md](SYSTEMS.md) (gameplay rules + the
actual numbers), [TESTING.md](TESTING.md) (harness methodology + staging rules).

## Ground rules

1. **Single-responsibility files.** One system per file. `game/Game.ts` is a
   sub-30-line public facade over four focused controller layers:
   `GameFoundation` (state + subsystem construction), `GameScreens`
   (menus/sorties), `GameInteractions` (travel/trade/contracts/devices), and
   `GameRuntime` (input/frame/render). Combat resolution, HUD projection, and
   world swapping remain composed through explicit host interfaces. Cross-system
   wiring stays visible in `GameFoundation`, not hidden in global imports.
2. **Everything procedural.** Zero binary assets. Meshes are built from three.js
   primitives, textures are generated on canvases, audio is synthesized in WebAudio,
   the skybox is a shader. This keeps the repo tiny and everything tweakable in code.
3. **Determinism.** All gameplay/world randomness flows through `core/Rng.ts`
   (mulberry32) — never `Math.random()`. Time-varying shaders take simulated elapsed
   time, never wall clock. This is what makes the visual test harness byte-stable.
4. **Frame-rate independence.** The loop runs at display refresh (144 Hz capable);
   every rate is per-second and dt-scaled. Smoothing uses the
   `1 - Math.exp(-k * dt)` form so lag feels identical at any FPS.

## Module map

```
src/
  main.ts                 entry: URL params (testScene, seed) → Game → menu or test scene
  core/
    GameLoop.ts           rAF loop + dt clamp + stepManual() for deterministic tests
    Input.ts              merged keyboard/mouse + virtual touch axes/actions
    DesktopFlightCapture.ts pointer-lock-first fullscreen/Keyboard Lock orchestration;
                          consumed canvas-click recapture for rejected desktop locks
    EventBus.ts           typed pub/sub (GameEvents interface = the event catalog)
    Rng.ts                seeded mulberry32; fork() derives child streams
  rendering/
    createRenderer.ts     WebGLRenderer config (no MSAA — SMAA is a post pass)
    PostFx.ts             EffectComposer: bloom | chromAb + vignette + ACES | SMAA + grain;
                          recreates targets after browser-fullscreen transitions
    ChaseCamera.ts        third-person follow + first-person cockpit eye, blended; trauma shake
  world/
    Sector.ts             assembles a sector from a seed; owns THEMES (palettes/sun) and
                          the population `plan` (patrol loops, hauler routes, capital post)
                          — GameWorldFlow instantiates the plan + safe-spawns the player
    NebulaSkybox.ts       domain-warped fbm shader on an inverted far sphere
    Starfield.ts          point-sprite stars, twinkle via uTime
    Sun.ts                HDR core + depth-tested extended corona + key light;
                          visible fragments bloom independently when partly occluded
    Planet.ts             procedural surface shader, terminator, atmosphere rim, rings
    AsteroidField.ts      4 displaced geometry variants × InstancedMesh; ore veins; hp;
                          colliders; reserved slots for split-off child rocks
    AsteroidDebris.ts     pooled tumbling fragments when a rock shatters
    CaveAsteroid.ts       hollow hero asteroids: boulder shell + crystals + stash + turret posts
    FogBanks.ts           noise-blob sprites drifting through the sector (volumetric stand-in)
    WreckSite.ts          derelict hulks with lootable blackboxes (unmarked POIs)
    PlanetSurface.ts      landable terrain/collision core + revisit-stable landmarks
    PlanetSurfaceBase.ts independent Vigil base-template builder
    PlanetSurfaceCave.ts open-bottomed cave arch + profile-matched shell/clear route
    PlanetSurfaceStructures.ts shared host contract, route/guard landmarks, rock shaping
    SpaceDust.ts          camera-following wrap-around motes (speed sensation)
    noiseGlsl.ts          shared simplex/fbm GLSL chunk
  entities/
    ShipMesh.ts           compatibility facade for mesh factory, colors and QA audit
    ShipMeshTypes.ts      hull/style/anchor data contracts
    ShipMeshBuilder.ts    shared materials, airfoils, nav lights and engine glow
    PlayerShipMeshes.ts   Kestrel, Vanta and Aegis geometry
    NpcShipMeshes.ts      raider, brute, bomber, gun/rotary/rocket turret, hauler/capital geometry
    ShipMeshFactory.ts    hull dispatch + shared finishing pass
    ShipMeshAudit.ts      geometry-level connected-component QA
    CockpitMesh.ts        first-person interior built around the eye point
    Ship.ts               base state + swept sphere/compound-box hull intersection;
                          per-instance geometry/material disposal on final detach
    PlayerShip.ts         arcade flight model driven by Input + PlayerShipDef stats
    EnemyShip.ts          steering/firing + cannon/rotary/rocket packages around EnemyBrain
    Turret.ts             cannon/rotary/rocket emplacements + carrier traverse hemispheres
    NeutralShip.ts        cargo hauler flying trade routes; quest giver via hail (R)
    CapitalShip.ts        carrier mount plan + committed, arc-clamped annihilator state/FX;
                          also projects the jump-suppression field
    PickupSystem.ts       pooled resource drops with magnet-to-player + visit snapshots
  ai/
    EnemyBrain.ts         approach / attack / break state machine per enemy
  combat/
    WeaponDefs.ts         player weapons/seeker + enemy rotary/homing/fast packages
    WeaponSystem.ts       player firing, energy, switching, damageMult (upgrades)
    ProjectileSystem.ts   pooled ordnance, path-range clamp, homing/threat query, swept collision
    CapitalBeam.ts        thick-ray trace: first asteroid absorbs, ships before it are hit
    Targeting.ts          cover-independent aim assist + camera-origin target-sized scan
  fx/
    ParticleSystem.ts     one pooled additive point-sprite system for everything
    ExplosionSystem.ts    flash + shockwave ring + sparks/embers + pooled point lights
    ShieldFx.ts           fresnel shell flash with impact-direction highlight
    textures.ts           shared canvas-generated glow/ring sprites
  ui/                     all DOM/CSS over the canvas; zero game logic
    Hud.ts                per-frame update(state) + imperative flashes/banners/comms
    MainMenu.ts           title / briefing / field manual / controls views
    HangarScreen.ts       ship + difficulty selection (pre-launch)
    HangarVisor.ts        overlay renderer + orbit/drag/zoom + curved hit forwarding
    VisorPanels.ts        direct canvas raster + one shared convex helmet surface
    ShipThumbnails.ts     offscreen renderer → data-URL hull portraits for the cards
    Radar3D.ts            sphere radar on its own tiny WebGL canvas (ship-frame blips + stems)
    TargetPreview.ts      centered/fitted health wireframe + GPU silhouette perimeter glow
    TouchControls.ts      dual-stick coarse-pointer deck mapped into Input actions/axes
    LoadoutScreen.ts      in-run crafting (Tab); pure view over Inventory
    TradeScreen.ts        merchant Buy/Sell view over structured Trade holdings
    ResourceIcons.ts      original inline SVG set for all resources/consumables
    PauseMenu.ts, GameOverScreen.ts
    styles.css            ordered import manifest
    styles/               foundation, screens, HUD clusters, hangar, loadout, manual,
                          responsive touch flight/screen layouts
  audio/
    AudioEngine.ts        procedural WebAudio: capped/cleaned SFX graph, engine hum,
                          ambient pad
  game/
    Game.ts               public facade: constructs and initializes the controller stack
    GameFoundation.ts     shared state + subsystem construction/host wiring
    GameScreens.ts        menu/hangar/overlay transitions + sortie lifecycle/crafting
    GameInteractions.ts   travel, trade, contracts, devices, story and enemy spawning
    GameRuntime.ts        input, simulation, carrier mount LOS, missile-warning transitions
    GameCombat.ts         hits, hostile ordnance/LOS, carrier-beam effects and collisions
    GameHudPresenter.ts   HUD frame assembly, projections, radar and pickup flyouts
    GameWorldFlow.ts      jump spool, contact-facing arrivals and persistent planet swaps
    SpawnSafety.ts        quiet sector-entry solver with guaranteed outer-shell fallback
    GameConstants.ts      travel/system-safety constants + target relationship/role copy
    HangarPreferences.ts  read-once, explicit-selection ship/difficulty cookies
    InteractionTargeting.ts boresight loot/body + nearest-neutral queries
    HudProjection.ts      world→screen contacts/radar + dt-smoothed prompt anchors
    WorldCollision.ts     shared sphere/AABB body tests
    CloakVisual.ts        hull ghosting + iridescent rim resource lifecycle
    Config.ts             base tuning (camera, bloom, world densities, weapon energy)
    Ships.ts              PLAYER_SHIPS roster (stats, weapons and seeker fabrication)
    Difficulty.ts         DIFFICULTIES multipliers
    Inventory.ts          resource wallet + recipes + frame-rate-independent seeker fabrication
    EncounterDirector.ts  exploration threat pacing: alert heat from Vigil kills →
                          hunter wings jump in from deep space; ambient scout pairs;
                          12-live-hunter ceiling (gated off in peaceful sector 1)
    Quests.ts             procedural contracts from hailed haulers (R): bounty /
                          collect / beacon delivery / cross-sector courier
    Devices.ts            cloak + EMP cooldown timers (effects applied by controller layers)
    MetaProgress.ts       credits + permanent Legacy upgrades (localStorage;
                          disabled in headless mode for determinism)
    Trade.ts              merchant stock list + trade validation/execution
    Story.ts              title, intro, exploration comms beats (fired once on
                          first-contact / first-cave / capital-sighted / …), death lines
    TestScenes.ts         small deterministic scene-name dispatcher
    test-scenes/          shared stepping + focused UI, combat, targeting and world staging modules
```

Behavioral automation follows the same ownership split:

```
test/
  smoke.mjs               thin Chromium lifecycle + ordered scenario runner
  smoke/
    helpers.mjs           static server, browser diagnostics, deterministic stepping
    preferences.mjs       real menu/hangar preference lifecycle + write-count probe
    hangar.mjs            hangar geometry, crafting and contact UI
    world.mjs             peace/trade/planet persistence/jump flow + turret clearance
    targeting.mjs         pursuit/contact policy, ordnance warnings/range and flight key chord
    capital.mjs           carrier battery, preview and annihilator probes
    runtime.mjs           hunters, camera, turrets, devices and stress cleanup
    mobile.mjs            coarse-pointer gestures, hit geometry + native touch hangar
    mobile-layout.mjs     touch-layout inspection + native Chromium swipe helpers
    assertions.mjs        grouped invariant aggregation and failure labels
```

Scenario modules intentionally execute in runner order against one page. They may
reuse staged world state, but own no browser/server lifecycle and must advance
gameplay through the deterministic helpers rather than wall time.

## Game state machine

`menu → hangar → playing ⇄ paused / loadout / trade → gameover → (retry|menu)`,
plus a `test` state used by the harness (renders + updates FX, no gameplay) and a
Legacy overlay reachable from the menu.

- `menu`/`hangar`: camera orbits a parked showcase ship; hangar swaps the hull live.
- `playing`: full simulation. Esc pause · Tab loadout · V camera · hold-J jump ·
  R hail/dock/accept · X decline · F/G/H devices; touch buttons feed the same actions.
- `paused`/`loadout`/`trade`: world frozen (dt withheld) but still rendered.
- Player death: 2.4 s cinematic delay → gameover (banks Legacy credits).

Orthogonal to the state machine is the **environment**: space (default) vs planet
(`Game.surface` non-null). `GameWorldFlow` owns the private `spaceStash` and
`planetStates` lifecycle. Planetfall DETACHES the space world (the sector group
leaves the scene un-disposed; entities and quest beacons are parked) and restores
it bit-identical on lift-off. A revisit reattaches the same `PlanetSurface`,
surviving enemy/turret objects and pickup snapshot, so harvested bodies and a
cleared garrison stay cleared until the sector/sortie is discarded. The
`Game.world` accessor still presents the active environment to combat.

`GameFoundation` reads `nebreck_hangar_ship` and
`nebreck_hangar_difficulty` once at startup, validates them against the current
catalogs, and otherwise keeps the Kestrel/Veteran defaults. Loading is read-only.
`GameScreens` writes one root-scoped, one-year `SameSite=Lax` cookie synchronously
only from the corresponding explicit ship-card or difficulty-card callback;
opening/rendering the hangar and pressing Engage do not write. `HangarVisor`
forwards a click only when its preceding press began on the already-active visor,
preventing the menu's Hangar transition click from becoming an accidental card
selection after it bubbles to `document`.

Planet caves expose a dense `CaveLandmark.route` from the outside ramp onto the
Catmull-Rom centreline plus known-clear interior/exterior guard anchors. The
rendered arch is open underneath and its collision bodies form an overlapping
two-dimensional lattice offset outward from the same profile. Cave controls are
a broad-turn random walk (no fake branch inserted into one spline), and shoulder
vertices seat into the rendered terrain. `PlanetSurface.heightAt` interpolates
the exact `PlaneGeometry` triangles generated from `analyticHeightAt`, so steep
cave carves cannot create invisible ground. Cave placement rejects base
exclusion zones and other cave mouths before terrain is built.

## Frame flow (playing)

```
GameLoop.tick(dt)
  GameRuntime.updatePlaying
    input: Esc/Tab/V · GameWorldFlow jump spool (release/hit cancels) ·
           R hail|dock|accept · X decline · F cloak · G EMP · H nanobots
    quest bookkeeping: collect progress, delivery-beacon proximity
    devices.update → CloakVisual.sync; planet terrain clamp + scrape damage
    story triggers (one-shot, space-side): first-contact/cave/capital…
    hostiles[] targeting-resolution rebuild (distant carrier mounts collapse);
    shootables[] physical-hit rebuild (all mounts + capital + neutrals)
    PlayerShip.update          ← Input
    Targeting.update           → close aim assist or tight camera-origin angular inspection
    InteractionTargeting      → competing ore/stash boresight candidate (never aim assist)
    WeaponSystem.update        → spawns bolts/missiles from aimTarget only
    Inventory.regenerateMissiles → optional per-hull real-time seeker fabrication
    engine-trail particle emission (dt-accumulated)
    EnemyShip.update × N       ← EnemyBrain (patrol/approach/attack/break),
                                 stun + cloak-blind aware, fires via callback
    Turret.update × N          → traverse hemisphere + outward-offset LOS → turretFire
    NeutralShip.update × N; CapitalShip.update → committed charge/fire state
    ProjectileSystem.update    → homing (cloak can drop target) → resolveHit
    ProjectileSystem threat    → live-seeker lock / monotonic ≤2 s impact countdown
       resolveHit: jump-disrupt · damage ships/turrets/capital/neutrals |
       rock: ore crack → pickups · hp → shatter (+calving) · stash burst
    PickupSystem.update        → GameCombat.collect → Inventory (+first-ore beat)
    GameCombat.resolveShipCollisions (active bodies, capital wall, rams)
    EncounterDirector.update   (space, sector ≥2) → hunter dispatches
    ChaseCamera.update         → third/first blend, FOV, shake
    GameHudPresenter.update    → HudProjector (contacts, ore wireframe, lead marker,
                                 radar and smoothed merchant/loot/planet prompt) →
                                 HudFrameState (jump Flux/devices/offer/quest log) → Hud + Radar3D
  Sector.update | (planet: static) ; particles/explosions/shield/debris/pulses/warp
  PostFx.render
```

Runtime resource ownership follows the same state graph. Projectile, particle,
debris, pickup, explosion, and audio one-shot systems are bounded pools/graphs.
Actors parked for planetfall remain live and undisposed because lift-off restores
the exact objects; kills, sector/sortie teardown, discarded visit states, and
replaced hangar hulls detach and then dispose their unique geometry/materials.
Cached procedural surface/glow textures remain shared for the application's life.

## Rendering pipeline

HDR half-float buffers → RenderPass → Bloom →
EffectPass(ChromaticAberration, Vignette, ACES ToneMapping) →
EffectPass(SMAA, subtle grain). The sun no longer uses a centre-sampled god-ray
pass: its depth-tested corona is an extended emitter, so a clipped limb or gaps
between asteroids contribute only their visible fragments. Anything that should
bloom is either emissive with intensity > 1 or a `toneMapped: false` material with
color components > 1. Fullscreen resize recreates the composer before refilling
its targets, avoiding a persistent black background after F11.

## Events (EventBus)

The catalog is the `GameEvents` interface in `core/EventBus.ts`. Producers:
gameplay systems via Game. Consumers: HUD (comms, banners), audio, score.
Add new cross-system reactions by subscribing in
`GameInteractions.wireEvents()` — do not import UI from gameplay systems.

## Visual test harness

See `test/visual/run.mjs`, `src/game/TestScenes.ts`, and
`src/game/test-scenes/`. Deterministic because:
seeded Rng, `GameLoop.stepManual` (no wall clock), frozen CSS animations
(injected style pauses everything at t=1s), SwiftShader software GL in headless
Chromium. Same machine → 0.000% pixel diff. The current 36 scenes cover world art,
ships, combat/FX, hostile and civilian HUD targeting, every major screen,
caves/bases/wrecks, trade, fleet connectivity, cloak, controls, enemy ordnance,
missile warnings, the carrier superweapon, and 844×390 phone flight/hangar/overlay layouts.
