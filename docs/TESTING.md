# Testing

All local and CI commands use Node.js 24.

Last updated: 2026-07-30.

The project rule (set by the owner, non-negotiable): **every reported visual issue
gets its own harness scene, and renders are iterated on — by actually viewing the
PNGs — until they look right, BEFORE handing work back.** Screenshots prove
framing/layout/semantics; the smoke test proves behavior. Ship nothing that isn't
covered by one of the two.

## Commands

```bash
npm run test:architecture     # controller line-size budgets
npm run typecheck            # strict TS
npm run test:visual          # 23 scenes vs local baselines (builds first)
npm run test:visual:update   # re-capture local baselines (--scene=<name> for one)
npm run test:smoke           # full gameplay loop in live headless Chromium
```

## Visual harness (test/visual/run.mjs + src/game/TestScenes.ts)

Headless Chromium on SwiftShader (software GL → GPU-independent pixels), 1280×720,
`/?testScene=<name>&seed=7`. Deterministic because: seeded `Rng` streams, manual
fixed-step simulation (`GameLoop.stepManual`), CSS animations frozen at t=1s, no
wall-clock anywhere render-affecting. Same machine → **exactly 0.000% diff**; a
nonzero diff on unchanged code means somebody broke determinism — treat as a bug.
Budget (1.5%) only absorbs cross-machine drift.

Baselines, captures, and diffs are generated locally under `test/visual/` and
intentionally ignored by Git. On a fresh clone, the first run creates local
baselines and reports that no comparison was made; run the command again for the
actual regression check. Never commit generated PNGs.

### Scenes and what each guards

| Scene | Guards |
|---|---|
| nebula / asteroids / ship | environment art, half-clipped solar emitter, palette clusters, rounded/textured rocks, hull greeble |
| combat / fx / split | staged battle FX, explosion quality, rock calving |
| hud | full HUD: panels, jump spool + warp streaks, contract OFFER panel, quest tracker, merchant note |
| targeting | hostile marker semantics: lock box + lead/range, red/amber/grey contacts, edge chevrons, radar, live fire |
| friendly-targeting | merchant fallback lock: green box/wireframe, relationship+role copy, no lead pip |
| menu / hangar / loadout / cockpit | each screen; cockpit = live-data MFDs + frame |
| boost | camera framing at full boost (ship large, visible) |
| cave / wreck / level / planet | POIs: cave asteroid, derelict+blackbox, capital+hauler; planet stages the outside approach looking through the broad natural arch |
| base | Vigil ground base close-up (apron, windows, pipes, walls, rover, sign, landing pad) + rooftop turrets firing at a near-level player ~150 m out — the "turrets shoot their own roof" geometry |
| trade | merchant trade screen: Buy/Sell tabs, painterly offer art, shared SVG holding/cost marks, ✕ close button |
| fleet | all three playable hulls, CLOSE low rear-quarter above the field plane, HUD off — the range+angle where floating-part "ship slop" shows |
| cloak | predator cloak engaged: glass hull + iridescent rim shell, dimmed engines |
| controls | keyboard/mouse control reference and device bindings |

For interactive hangar review, use
`http://127.0.0.1:8123/?testScene=hangar-live&seed=7` after starting the dev
server on port 8123. Unlike the frozen `hangar` capture, `hangar-live` retains
orbit/zoom, curved-surface clicks, hover tooltips, cookies, and fullscreen
behavior. The normal webpack dev-server default remains port 8080.

### Staging rules (hard-won)

- Stage **relative to `game.player.position`** — the safe-spawn solver moves the
  start point; absolute coordinates silently break (happened to `targeting`).
- Sector 1 is peaceful: scenes needing hostiles call `jumpToSector2(game)`
  (auto-jump helper) — it also calls `game.settleWarpFx()`; without that the
  capture is full of warp streaks and aberration fringing (happened).
- After a jump, run enough steps (~30) for the aberration punch to decay.
- Beauty shots: place the camera on the **sun side** (`sector.sun.group.position`)
  and pick a direction with no occluding body (see `stageLevel`'s candidate loop).
- Use exposed landmarks for staging (`surface.caveLandmarks`,
  `surface.baseLandmarks`, `sector.wrecks`, `sector.caves`, `game.capital`) —
  add a landmark accessor rather than guessing coordinates.
- `game.hud.clearComms()` before capture when transient ECHO lines would sit on
  top of the staged subject.
- End state must be time-invariant; never depend on `setTimeout`-driven DOM.
- New rng consumers in world-gen go AFTER existing `fork()` calls, or every
  downstream baseline shifts (see GOTCHAS).
- After `--update`: **Read the PNG and judge it.** That review step has caught:
  bloom blowouts, floating geometry, buried screens, marker collisions, warp
  contamination, silhouetted ships.

## Smoke test (test/smoke.mjs)

Live build with explicit browser-frame settling for DOM/font checks and
deterministic stepping for gameplay time, `/?seed=99&headless=1` (headless=1
is mandatory — headless Chromium grants-then-drops pointer lock,
phantom-firing auto-pause). `advanceGameTime` drives the full loop;
`advanceProjectileTime` isolates swept collision without moving other actors.
Both harnesses launch Chromium with `--mute-audio` — the game's synth audio
otherwise plays through the user's speakers mid-test.
SwiftShader runs ~4 FPS and dt clamps at 1/20, so sim time ≪ wall time: never
"wait N seconds" for a state — fast-forward it (`jumpSpool = 0.01`, the two
advance helpers, direct dispatch calls, fixed-step hunter AI/camera updates).

**Ship connectivity audit** runs first (`window.auditShips()` →
`auditShipConnectivity` in `ShipMeshAudit.ts`, re-exported by `ShipMesh.ts`):
every hull is checked at GEOMETRY
level — parts sampled (vertices + bbox center/face/edge probes) and
union-found into components by nearest-surface distance (eps 0.045); the test
fails unless every kind is ONE connected body. This covers every viewing angle
at once and has caught real floating-part regressions (raider blade tips,
capital burner discs, kestrel wingtip cluster).

Asserted, in order:

1. On the exact `?testScene=hangar&seed=7` route, ship/difficulty clicks write
   cookies while state is still `hangar` (Engage is never pressed), survive
   reload, restore the selected card, and construct the matching preview hull.
2. Hangar actions remain aligned with the ship-card baseline through fullscreen;
   hardpoints/no-rack slots do not shift.
3. Vanta-style `missileRate=0` rejects craft/buy calls without changing the wallet
   and both overlay buttons are disabled with “No rack”. An occluded hostile plus
   visible merchant selects the merchant as an informational contact, renders the
   friendly wireframe/role, exposes no `aimTarget`, and hides the lead pip.
4. Sector-1 peace (0 hostiles, ≥2 neutrals, 2 flux) → hail → offer → accept
   (active=1) → merchant dock + engine silence + buy-flux. Trade verifies all
   five SVG hold icons, structured cost/gain icons, column alignment, symmetric
   padding, and the Trade/subtitle left guide.
5. Engineering crafting preserves `.loadout-right.scrollTop`; hold icons are
   SVGs in an aligned icon/label/count grid with ≥10 px right inset. The mining
   prompt uses the stable rotating vein centroid and advances toward motion
   without a one-frame screen-space snap.
6. Planetfall creates a garrison ≥4 and stashes ≥3; spawn is >200 from hostiles
   ON the surface with **level attitude** (no random pitch/roll). Every segment
   of both dense cave approach routes clears terrain and the profile-matched
   shell by the player's radius; interior/exterior guards are outside all
   bodies. Both lateral wall sweeps must hit the overlapping shell lattice,
   rendered-triangle versus `heightAt` error stays below 0.01 m, and all named
   geology lobes remain within the aspect-ratio guard. A zero-speed shell overlap
   deals zero damage while a controlled 55 m/s inward impact deals proportional
   damage.
7. **Every** generated surface turret has a hit sphere clear of terrain/bodies and
   takes damage from its intended open firing arc; soft-lock picks a visible near
   turret at ~120 m.
8. Lift/revisit reuses the exact `PlanetSurface`: harvested bodies stay gone,
   moved pickups persist, and a zero-garrison planet remains cleared. Lift-off
   also restores the space sector bit-identically (a pre-landing scarred rock is
   checked).
9. A controlled hold-jump (straight up, high, clear corridor) reaches hostile
   sector 2; dispatched hunters close from >20 u, the camera follows a teleport,
   overhead turret aim dot→1, and cloak/EMP/nanobots all function.

Exit code enforces every assertion.

Behavioral assertions exist because screenshots once hid a months-worth bug:
enemies steered away for four rounds (lookAt +Z inversion) while every static
capture looked perfect. When a failure ships through tests, add the assertion
that would have caught it.

## GitHub Actions

`.github/workflows/ci.yml` runs typecheck, a production build, and the smoke
suite for every pull request and every push to `main`. Production Pages
deployment is serialized with same-repository PR previews so concurrent runs
cannot overwrite each other's generated `gh-pages` snapshot. Preview builds
live under `/pr-preview/pr-<number>/` and are removed on PR close. Fork pull
requests run CI only and never receive write, Pages, or OIDC deployment access.
