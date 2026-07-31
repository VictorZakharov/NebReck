# Nebula Reckoning — agent guide

Last updated: 2026-07-31.

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
   the dispatcher; UI, combat and world scenes live under `game/test-scenes/`.
   Behavioral staging follows the same rule: `test/smoke.mjs` is a thin runner;
   feature probes live under `test/smoke/` and return results to the grouped
   assertion module. Do not grow the runner back into a scenario monolith.
5. Pooled + allocation-free per frame; pooled lights idle at intensity 0.

Targeting mode follows pursuit state: with no engaged enemy, hostiles and civilians
share pure camera-crosshair ranking at every range; active pursuit restores hostile
priority plus range-weighted aim assist inside weapon reach. Civilian and ore previews
are informational only and must never enter `aimTarget`; ore wireframes use their
resource color. All object prompts use a stable smoothed world anchor. Cloak and
crafting share the 180 m lockout.

Planet cave geometry is an open-bottomed procedural arch whose sampled colliders
come from the same profile. Preserve the non-self-intersecting control path, dense
`CaveLandmark.route`, terrain-triangle `heightAt` sampler, overlapping wall lattice,
base/cave exclusion zones, open guard anchors, bounded rock aspect ratios, and
closing-speed collision damage whenever surface generation changes.

Hangar selection clicks are persistence commits. Save ship/difficulty synchronously
inside the click callbacks; do not defer them to Engage or game entry.

Player seekers have a 1,050 m cumulative traveled-path budget, including curves;
clamp the final swept segment before collision so a large step cannot over-range
hit. Immersive flight locks physical `KeyW` where the browser supports Keyboard
Lock so `L-Ctrl + W` remains descend + thrust instead of a close-tab shortcut.

## Verify loop (run all four before claiming done)

```bash
npm run test:architecture   # Game/controller and smoke-module size budgets
npm run typecheck
npm run test:visual          # 26 scenes vs local baselines; 0.000% on this machine
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
