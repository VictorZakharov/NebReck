# Nebula Reckoning — agent guide

Last updated: 2026-08-01.

Everspace-inspired exploration space-dogfighter. three.js + TypeScript + webpack,
100% procedural (no binary assets). Read the docs before coding:

- `docs/SYSTEMS.md` — gameplay rules and the actual balance numbers (start here
  for any feature; most systems interlock through flux/alert/contracts).
- `docs/ARCHITECTURE.md` — module map, state machine, frame flow, space↔planet
  environment duality (`Game.world` accessor, `GameWorldFlow` persistence).
- `docs/GOTCHAS.md` — real bugs that shipped and their root causes. The lookAt/+Z,
  light-count-recompile, and rng-fork-order entries WILL bite again if unread.
- `docs/EXTENDING.md` — per-feature recipes (weapon, quest kind, device, base
  template, marker kind, …).
- `docs/TESTING.md` — the harness contract and staging rules.

## Non-negotiable project rules

1. **Every reported visual issue gets its own harness scene**, and you iterate on
   the captured PNGs (Read them, judge them) until it looks right BEFORE handing
   back. Behavioral bugs get smoke-test assertions that would have caught them.
2. **Determinism**: all gameplay/world randomness via `core/Rng` streams; no
   `Math.random()` or wall-clock in anything render-affecting; new world-gen rng
   consumers are APPENDED after existing `fork()` calls.
3. Ships nose along **-Z**: use `Ship.faceToward`, never `Object3D.lookAt`.
4. Single-responsibility files; `game/Game.ts` is a deliberately tiny public
   facade. Controller ownership is layered through `GameFoundation` (state +
   subsystem construction), `GameScreens` (menus/sorties), `GameInteractions`
   (travel/trade/contracts/devices), and `GameRuntime` (input/frame/render).
   Combat, HUD presentation and environment swapping remain delegated to
   `GameCombat`, `GameHudPresenter` and `GameWorldFlow` through explicit host
   interfaces. Smaller helpers stay beside them (`CloakVisual`,
   `HudProjection`, `InteractionTargeting`, `WorldCollision`,
   `GamePreferences`). Reuse
   `ui/ResourceIcons.ts` for material/consumable symbols;
   do not introduce one-off Unicode glyphs in DOM inventory UI.
   Visual staging is likewise split by responsibility: `TestScenes.ts` is only
   the dispatcher; UI, combat, targeting and world scenes live under
   `game/test-scenes/`.
   Behavioral staging follows the same rule: `test/smoke.mjs` is a thin runner;
   feature probes live under `test/smoke/` and return results to the grouped
   assertion module. Do not grow the runner back into a scenario monolith.
5. Pooled + allocation-free per frame; pooled lights idle at intensity 0.

WebGL resolution is adaptive and independent of CSS/HUD resolution. Preserve the
1920×1080 initial pixel budget, 1280×720 floor, hysteresis, and current buffer-pixel
workload across resize/fullscreen. Manual test stepping intentionally supplies no
wall-clock sample, so visual baselines do not change with machine speed.
Static procedural meshes are material-batched for rendering. Authored source parts
remain on camera-disabled layer 31 for connectivity/debris; visual traversals skip
`renderBatchSource`, while destruction skips `excludeFromDebris`. Repeated fog
cards are instanced, not independent sprites. Preserve the 330-call benchmark cap.

Targeting mode follows pursuit state: with no engaged enemy, hostiles and civilians
share pure camera-crosshair ranking at every range with no sensor-distance cap;
active pursuit restores hostile priority plus range-weighted aim assist inside weapon
reach. Angular inspection uses the chase-camera position and a reticle-sized,
target-angular-radius cone; using the player origin or the old 18-degree scan can
select a visibly offset contact behind the reticle. Sensor acquisition deliberately
ignores world/terrain LOS; projectiles, AI fire, and the carrier beam still obey it.
Civilian and ore previews are informational only and must never enter
`aimTarget`; ore wireframes use their resource color. All object prompts use a stable
smoothed world anchor. Cloak and
crafting share the 180 m lockout.

Hostile preview relationship color is a silhouette-mask perimeter glow rendered
behind the health-colored edge wireframe. Never apply a red CSS filter to the whole
preview canvas: that tints every internal edge and destroys the health channel.
Preview source geometry is centered after normalization: translate by
`-sourceCenter * scale`, not the unscaled center. Capital previews use uniform
view-aware zoom so a nose-on carrier remains legible without changing orientation.

Planet cave geometry is an open-bottomed procedural arch whose sampled colliders
come from the same profile. Preserve the non-self-intersecting control path, dense
`CaveLandmark.route`, terrain-triangle `heightAt` sampler, overlapping wall lattice,
base/cave exclusion zones, open guard anchors, bounded rock aspect ratios, and
closing-speed collision damage whenever surface generation changes.

Space-cave batteries must sit beyond every asteroid collision body; derive their
mount surface from the displaced mesh and bridge any clearance offset with the pad.

Hangar selection clicks are persistence commits. Save ship/difficulty synchronously
inside the click callbacks; do not defer them to Engage or game entry.

Player seekers have a 1,050 m cumulative traveled-path budget, including curves;
clamp the final swept segment before collision so a large step cannot over-range
hit. Immersive flight locks physical `KeyW` where the browser supports Keyboard
Lock so `L-Ctrl + W` remains descend + thrust instead of a close-tab shortcut.
Per-hull seeker issuance/fabrication belongs in `PlayerShipDef`: Aegis starts at
16 and regenerates one every 10 seconds; Kestrel starts at 8 with no regeneration.
Sector and orbit arrivals face the equal-weight mean contact bearing; exclude
capital-mounted turrets so one carrier does not count as thirteen contacts.
Physical and touch input converge in `core/Input.ts`; gameplay systems must read
the shared actions/axes rather than DOM gestures. `TouchControls` owns pointer
capture and virtual bindings. Coarse-pointer hangars keep native DOM active instead
of mounting the rasterized visor, restore hit testing on the full hangar scroll
container, and keep mobile touch targets at least 44 CSS px.
Desktop browser capture lives in `core/DesktopFlightCapture.ts`. Pointer lock must
remain a synchronous activation-gated request from Engage/Resume so Safari can
grant it. Entering flight must never request or exit fullscreen: fullscreen is an
explicit title/pause-screen toggle (or browser F11). App fullscreen may add Keyboard
Lock for `KeyW`. The first unlocked canvas click retries capture and must never leak
through as a weapon press.

## Verify loop (run all five before claiming done)

```bash
npm run test:architecture   # Game/controller and smoke-module size budgets
npm run typecheck
npm run test:performance     # 1080p/native-4K/Retina-4K renderer diagnostics
npm run test:visual          # 36 scenes vs local baselines; 0.000% on this machine
npm run test:smoke           # full loop: peace→contract→merchant→planet→jump→combat→devices
```

Visual baselines are local generated artifacts and are intentionally Git-ignored.
On a fresh clone the first run creates them; rerun to perform the comparison.
After intentional visual changes: `npm run test:visual:update` (optionally
`-- --scene=<name>`), then view the changed PNGs. Never commit generated PNGs.
Dev server: `npm run dev` (port 8080 by default; pass
`-- --host 127.0.0.1 --port 8123` for the review URL). Static scenes use
`?testScene=<name>&seed=7`; the interactive rotating hangar uses
`?testScene=hangar-live&seed=7`; isolated automation uses `?seed=99&headless=1`
(no pointer lock, cookies, or meta persistence).
