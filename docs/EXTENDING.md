# Extending the game

Last updated: 2026-08-01.

Cookbook for the most likely additions. Read [GOTCHAS.md](GOTCHAS.md) first —
especially the determinism and lookAt sections — and check
[SYSTEMS.md](SYSTEMS.md) for the numbers a new feature must interlock with.
Every visual addition needs a harness scene ([TESTING.md](TESTING.md)).

Route controller changes by ownership: subsystem construction/host adapters go
in `GameFoundation`, screens and sortie transitions in `GameScreens`,
player-triggered travel/trade/contract/device commands in `GameInteractions`,
and continuous input/simulation/render work in `GameRuntime`. Keep `Game.ts` as
the public facade and run `npm run test:architecture` before opening a PR.

## Add a primary weapon
1. Append a `WeaponDef` to `PLAYER_WEAPONS` (`combat/WeaponDefs.ts`). HUD slots,
   number keys, wheel cycling, and the grey out-of-reach markers all derive from it
   (reach = speed × life — a short-range gun greys most contacts; intended).
2. Firing sound: `onPrimaryShot` switch in Game's WeaponSystem callbacks + a synth
   method in `AudioEngine`.

## Add an enemy type
1. Extend `ShipKind`/`STYLES` in `entities/ShipMeshTypes.ts`, add the hull branch
   to `entities/NpcShipMeshes.ts`, then dispatch it from `ShipMeshFactory.ts`;
   nose points along -Z. Keep `ShipMesh.ts` as the public compatibility facade.
2. Stats in `ENEMY_STATS` (`entities/EnemyShip.ts`), widen its `kind` union.
3. Spawn it: sector plans (`GameWorldFlow.populateLevel`), hunters
   (`EncounterDirector`), or planet garrisons
   (`GameWorldFlow.populateSurface`). Drops/score live in
   `GameCombat.killEnemy`.
4. Steering: parameterize `EnemyBrain` rather than forking it. NEVER `object.lookAt`
   — use `Ship.faceToward`.
5. Give weapon variants a data package in `WeaponDefs.ts` (`ENEMY_ROCKETS` or a
   bolt profile such as `ENEMY_AUTOGUN`), then route both `EnemyShip`/`Turret` and
   `GameCombat` through it. Homing rockets retain a `Ship` target; fast rockets
   must pass `null`. A long-range package must also pass its attack range into
   `EnemyBrain`, or a pursuing bomber will hold fire until ordinary gun distance.
6. Add its beauty/behavior staging to `game/test-scenes/CombatTestScenes.ts`,
   register the name in the small `TestScenes.ts` dispatcher and visual runner,
   and extend the deterministic smoke assertions (advance simulation time directly).

## Add a playable ship
Extend `ShipKind`/`STYLES` in `ShipMeshTypes.ts`, add geometry to
`PlayerShipMeshes.ts`, dispatch it from `ShipMeshFactory.ts`, and add the roster
entry in `game/Ships.ts`. Shared nav-light/engine helpers live in
`ShipMeshBuilder.ts`; do not move hull-specific detail back into the facade.
Stat bars normalize against `STAT_CAPS` in `ui/HangarScreen.ts`. Meta upgrades
copy the stat block in `PlayerShip`'s constructor — keep it that way. Set both
`startingMissiles` and `missileRegenSeconds` explicitly: use `null` for hulls
without an onboard fabricator, and cover timed regeneration with artificial
game-time stepping rather than wall-clock waits.

## Add a quest/contract type
1. New kind in `game/Quests.ts`: extend `QuestKind`, add a branch in
   `generateOffer` (title/description/progress/reward — description is also the
   TTS script, write it speakable).
2. Completion hook: kills → `onVigilKill`, position → `onPositionUpdate`, jumps →
   `onJump`, turn-ins → `tryTurnIn`. New trigger types get a method + a call from
   the matching controller site; rewards flow through
   `GameInteractions.completeQuest`.
3. If it has a world anchor, spawn/remove a beacon (`spawnQuestBeacon`) and decide
   its fate on jump AND on planetfall (sector persists through the latter).

## Add a device or consumable
Timers in `game/Devices.ts` (state + `tryX` + `xState` for the HUD row); effects in
a `GameInteractions.activateX` method bound to a key in
`GameRuntime.updatePlaying`; HUD chip in the
`device-row`; smoke assertion in the devices block. Consumables: count on
`Inventory`, craft via a recipe case, optionally merchant stock.
Add its touch binding in `ui/TouchControls.ts`; both physical and virtual paths
must converge on the same `Input` action rather than calling gameplay directly.

## Add a merchant trade

Add a row in `TRADE_OFFERS` with structured
`cost/gain: { kind, amount }`, then cases in `canTrade`/`applyTrade`
(`game/Trade.ts`). `TradeScreen` derives both exchange chips and their SVGs from
those holdings; do not embed display glyph strings in the offer.

## Add a material or held consumable

Extend the relevant inventory/resource union and add one original
`currentColor` SVG definition to `ui/ResourceIcons.ts`. Reuse
`holdingIconSvg()` in hold rows and cost/gain chips; text-only/canvas paths may
keep a compact fallback symbol. Preserve the three-column hold grid
(icon/label/right-aligned count) and its symmetric linked-row padding.

## Add a Legacy (meta) upgrade
Def in `META_UPGRADES` (`game/MetaProgress.ts`) + a multiplier helper + apply it at
run start (`createPlayer` / `startMission`). Never mutate shared catalogs.

## Add a planetary base template
Add the `BaseKind` in `world/PlanetSurfaceStructures.ts` and the builder branch
in `world/PlanetSurfaceBase.ts`: structures via `solid()` (hero bodies), guns
via `addTurretPost` (pad + spawn), loot via `addStash`. Ground every Y through
the supplied `SurfaceStructureHost.heightAt(x, z)`. The template automatically
gets a patrol wing.

## Add a planet-surface feature
Keep terrain/elevation and broad collision in `PlanetSurface.ts`; base templates
belong in `PlanetSurfaceBase.ts`, continuous cave geometry in
`PlanetSurfaceCave.ts`, and shared types/rock shaping in
`PlanetSurfaceStructures.ts`. Every visible solid needs a registered body so it
blocks ships, fire, and line of sight. Cave interiors are the inverse: use the
shared open-arch profile for both rendering and small outward-offset shell
colliders, never a solid chamber blocker. Preserve `CaveLandmark.route` for
curved entrance traversal, choose guard anchors by body clearance, and keep
cave candidates out of base/cave exclusion zones. Anything staged by tests gets
a landmark accessor. Terrain features belong in `analyticHeightAt`; the generated
vertex grid is then retained and public `heightAt` interpolates its exact
triangles. Never independently re-evaluate new high-frequency noise for runtime
collision. Keep cave control points as one broad-turn ordered walk—do not splice
a pseudo-branch back into a single Catmull-Rom curve. Decorative rock scales need
a bounded aspect ratio so procedural formations cannot collapse into needles.

## Add a marker/contact kind
Extend `HostileClass` (`ui/Hud.ts`), classify it in
`game/HudProjection.ts`, add `.contact-marker.X` / `.edge-marker.X` rules in
`ui/styles/hud-targets.css` or `hud-navigation.css`, add `COLOR_X` in
`ui/Radar3D.ts`, and document the color in SYSTEMS.md + the Field Manual.

Informational world objects (ore, stash, merchant, planet) do not belong in
`Targeting.aimTarget`. Resolve them in `InteractionTargeting`, compare their
crosshair angle against the selected distant contact, describe them in
`GameHudPresenter`, and add a lightweight source mesh to `TargetPreview` when a
wireframe is useful. The preview derives its hostile perimeter mask from that same
solid source automatically; do not recolor or CSS-filter the health wireframe.
World prompts must use `HudProjector.projectSmoothedAnchor`
with a stable owning object as the key; never pin object actions to a HUD corner.

## Add a sector-population element
Plan data in `Sector`'s `popRng` block (**append after existing rng consumers**),
instantiate in `GameWorldFlow.populateLevel`/`deploySectorEntities`, include in
`placePlayerSafely` scoring if hostile, and in the flow controller's
`spaceStash` if it must survive a landing.

## Add a sector theme / story beat / test scene
Theme: `THEMES` in `world/Sector.ts`. Beat: `EXPLORE_COMMS` key + a one-shot
`storyComms(key)` call at the trigger site. Scene: TESTING.md has the rules.

## Add a hangar control or persisted preference

`HangarScreen.ts` owns the DOM state, `HangarVisor.ts` owns the shared curved
surface/input projection, and `VisorPanels.ts` paints origin-clean panel canvases.
After a control changes, repaint the affected visor source instead of rebuilding
the Three.js scene. Add validated cookies through `game/HangarPreferences.ts`.
Startup reads must be side-effect free; write synchronously only in the explicit
selection callback, never while mounting, rendering, restoring state, or pressing
Engage. Keep the cookie root-scoped (`Path=/`) with a unique name. Extend the
preference lifecycle smoke test so opening Hangar and reloading produce zero
writes, while a physical visor-card click produces exactly one.

## Add or move UI styling

`ui/styles.css` is an ordered import manifest. Put rules in the narrowest module
under `ui/styles/` (`hangar.css`, `loadout.css`, a HUD cluster, and so on) and
preserve import order when selectors intentionally override earlier layers.
Touch-specific flight and responsive overlay rules live in
`ui/styles/mobile-controls.css`. Keep actionable touch targets at least 44 CSS px,
inside the viewport, and non-overlapping; extend `smoke/mobile.mjs` when adding one.

## Tuning knobs
`game/Config.ts` (camera follow/boost pull/FOV kick, bloom, world densities) ·
`game/Ships.ts` · `game/Difficulty.ts` · jump constants in
`game/GameConstants.ts` · threat scale in `GameWorldFlow.threatScale` · encounter
pacing in `EncounterDirector` · post stack in `rendering/PostFx.ts`.

System safety gates (currently cloak and field crafting) share
`SYSTEM_LOCKOUT_RANGE_METERS`. Enforce a gate in the model action as well as its
button state; disabling only the view leaves direct/hotkey calls exploitable.

## Performance rules
Pooled + allocation-free per frame (module-level scratch vectors); pooled lights
idle at `intensity 0`, never `visible false`; capped budgets: particles 4096,
projectiles 320, explosion lights 4, spin-updates ⅓ of instances; pixel ratio ≤2;
bloom and full-resolution visor repaints are the expensive presentation paths.
Repaint visor panels only on state/resize changes, never every animation frame.
