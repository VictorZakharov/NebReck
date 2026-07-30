# Architecture

Last updated: 2026-07-30.

High-level map of how Nebula Reckoning is put together and why. Companion docs:
[GOTCHAS.md](GOTCHAS.md) (things that will bite you), [EXTENDING.md](EXTENDING.md)
(recipes for common additions), [SYSTEMS.md](SYSTEMS.md) (gameplay rules + the
actual numbers), [TESTING.md](TESTING.md) (harness methodology + staging rules).

## Ground rules

1. **Single-responsibility files.** One system per file; systems never reach into each
   other. `game/Game.ts` is the only module allowed to know about everything — all
   cross-system wiring (events → FX/audio/UI, hits → damage, drops → inventory) lives there.
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
    Input.ts              keyboard/mouse/pointer-lock; per-frame consumed deltas
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
                          — Game instantiates the plan each mission + safe-spawns the player
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
    NpcShipMeshes.ts      raider, brute, turret, hauler and capital geometry
    ShipMeshFactory.ts    hull dispatch + shared finishing pass
    ShipMeshAudit.ts      geometry-level connected-component QA
    CockpitMesh.ts        first-person interior built around the eye point
    Ship.ts               base: transform, velocity, hull/shield/regen, engine glow, exterior group
    PlayerShip.ts         arcade flight model driven by Input + PlayerShipDef stats
    EnemyShip.ts          steering/firing shell around an EnemyBrain (patrol waypoints opt.)
    Turret.ts             stationary emplacement (caves + capital batteries)
    NeutralShip.ts        cargo hauler flying trade routes; quest giver via hail (R)
    CapitalShip.ts        station-keeping Vigil capital; firepower = mounted Turrets;
                          projects the jump-suppression field
    PickupSystem.ts       pooled resource drops with magnet-to-player + visit snapshots
  ai/
    EnemyBrain.ts         approach / attack / break state machine per enemy
  combat/
    WeaponDefs.ts         data: player weapons, missile, enemy bolt color
    WeaponSystem.ts       player firing, energy, switching, damageMult (upgrades)
    ProjectileSystem.ts   pooled bolts+missiles, swept segment-vs-sphere collision
    Targeting.ts          soft lock in a boresight cone + lead point computation
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
    LoadoutScreen.ts      in-run crafting (Tab); pure view over Inventory
    TradeScreen.ts        merchant Buy/Sell view over structured Trade holdings
    ResourceIcons.ts      original inline SVG set for all resources/consumables
    PauseMenu.ts, GameOverScreen.ts
    styles.css            ordered import manifest
    styles/               foundation, screens, HUD clusters, hangar, loadout, manual
  audio/
    AudioEngine.ts        procedural WebAudio: SFX one-shots, engine hum, ambient pad
  game/
    Game.ts               ★ orchestrator: state machine + cross-system wiring
    GamePreferences.ts    validated one-year ship/difficulty cookies
    InteractionTargeting.ts boresight loot/body + nearest-neutral queries
    HudProjection.ts      world→screen contacts/radar + dt-smoothed prompt anchors
    WorldCollision.ts     shared sphere/AABB body tests
    CloakVisual.ts        hull ghosting + iridescent rim resource lifecycle
    Config.ts             base tuning (camera, bloom, world densities, weapon energy)
    Ships.ts              PLAYER_SHIPS roster (stats per hull)
    Difficulty.ts         DIFFICULTIES multipliers
    Inventory.ts          resource wallet + RECIPES + craft bookkeeping
    EncounterDirector.ts  exploration threat pacing: alert heat from Vigil kills →
                          hunter wings jump in from deep space; ambient scout pairs
                          (gated off in the peaceful first sector)
    Quests.ts             procedural contracts from hailed haulers (R): bounty /
                          collect / beacon delivery / cross-sector courier
    Devices.ts            cloak + EMP cooldown timers (effects applied in Game)
    MetaProgress.ts       credits + permanent Legacy upgrades (localStorage;
                          disabled in headless mode for determinism)
    Trade.ts              merchant stock list + trade validation/execution
    Story.ts              title, intro, exploration comms beats (fired once on
                          first-contact / first-cave / capital-sighted / …), death lines
    TestScenes.ts         deterministic staging for the visual harness
```

## Game state machine

`menu → hangar → playing ⇄ paused / loadout / trade → gameover → (retry|menu)`,
plus a `test` state used by the harness (renders + updates FX, no gameplay) and a
Legacy overlay reachable from the menu.

- `menu`/`hangar`: camera orbits a parked showcase ship; hangar swaps the hull live.
- `playing`: full simulation. Esc pause · Tab loadout · V camera · hold-J jump ·
  R hail/dock/accept · X decline · F/G/H devices.
- `paused`/`loadout`/`trade`: world frozen (dt withheld) but still rendered.
- Player death: 2.4 s cinematic delay → gameover (banks Legacy credits).

Orthogonal to the state machine is the **environment**: space (default) vs planet
(`Game.surface` non-null). Planetfall DETACHES the space world into `spaceStash`
(sector group leaves the scene un-disposed; entities and quest beacons stashed) and
restores it bit-identical on lift-off. Each visited planet is likewise detached into
`planetStates`: the same `PlanetSurface`, surviving enemy/turret objects and pickup
snapshot are reattached on a revisit. Harvested bodies and a cleared garrison
therefore stay cleared until the sector/sortie is discarded. The `Game.world`
accessor routes bodies/destroyRock/depleteOre/spawnChild to the active environment.

Hangar ship/difficulty changes write `cleverspace_ship` and
`cleverspace_difficulty` synchronously from the selection click (one-year,
`Expires` + `Max-Age`, `Path=/`, `SameSite=Lax`) and are validated against the
current catalogs at startup. The click contract is route-independent and does
not require Engage. Explicit `?headless=1` skips startup restore and the Engage
fallback; automation that actually clicks a hangar card still exercises the real
cookie write.

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
  Game.updatePlaying
    input: Esc/Tab/V · hold-J spool (release/hit cancels; warp progress) ·
           R hail|dock|accept · X decline · F cloak · G EMP · H nanobots
    quest bookkeeping: collect progress, delivery-beacon proximity
    devices.update → CloakVisual.sync; planet terrain clamp + scrape damage
    story triggers (one-shot, space-side): first-contact/cave/capital…
    PlayerShip.update          ← Input
    Targeting.update           → lock + lead point
    WeaponSystem.update        → spawns bolts/missiles
    engine-trail particle emission (dt-accumulated)
    EnemyShip.update × N       ← EnemyBrain (patrol/approach/attack/break),
                                 stun + cloak-blind aware, fires via callback
    Turret.update × N          → turretFire (gated by hasLineOfSight)
    NeutralShip.update × N; CapitalShip.update
    hostiles[] / shootables[] scratch rebuild (+ capital, + neutrals)
    ProjectileSystem.update    → onHit → Game.resolveHit
       resolveHit: jump-disrupt · damage ships/turrets/capital/neutrals |
       rock: ore crack → pickups · hp → shatter (+calving) · stash burst
    PickupSystem.update        → onCollect → Inventory (+first-ore beat)
    resolveShipCollisions      (bodies via world accessor, capital wall, rams)
    EncounterDirector.update   (space, sector ≥2) → hunter dispatches
    ChaseCamera.update         → third/first blend, FOV, shake
    updateHud                  → HudProjector (camera-space contacts, lead marker,
                                 radar and world-attached prompt) → HudFrameState
                                 (jump/devices/offer/quest log) → Hud + Radar3D
  Sector.update | (planet: static) ; particles/explosions/shield/debris/pulses/warp
  PostFx.render
```

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
Add new cross-system reactions by subscribing in `Game.wireEvents()` — do not
import UI from gameplay systems.

## Visual test harness

See `test/visual/run.mjs` + `src/game/TestScenes.ts`. Deterministic because:
seeded Rng, `GameLoop.stepManual` (no wall clock), frozen CSS animations
(injected style pauses everything at t=1s), SwiftShader software GL in headless
Chromium. Same machine → 0.000% pixel diff. The current 22 scenes cover world art,
ships, combat/FX, HUD/targeting, every major screen, caves/bases/wrecks, trade,
fleet connectivity, cloak and controls.
