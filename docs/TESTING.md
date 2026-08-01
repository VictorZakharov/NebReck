# Testing

All local and CI commands use Node.js 24.

Last updated: 2026-08-01.

The project rule (set by the owner, non-negotiable): **every reported visual issue
gets its own harness scene, and renders are iterated on — by actually viewing the
PNGs — until they look right, BEFORE handing work back.** Screenshots prove
framing/layout/semantics; the smoke test proves behavior. Ship nothing that isn't
covered by one of the two.

## Commands

```bash
npm run test:architecture     # controller + smoke-module line-size budgets
npm run typecheck            # strict TS
npm run test:performance     # production renderer report at 1080p and two 4K profiles
npm run test:visual          # 43 scenes vs local baselines (builds first)
npm run test:visual:update   # re-capture local baselines (--scene=<name> for one)
npm run test:smoke           # full gameplay loop in live headless Chromium
```

Pass `-- --port=<number>` to either visual command when the default review port
8123 is already occupied (for example, `npm run test:visual -- --port=8128`).

## Renderer benchmark (`test/performance.mjs`)

The benchmark loads the production build, stages the real hostile second sector,
stops rAF, and advances identical manual frames at 1920×1080 DPR 1, 3840×2160 DPR 1,
and 1920×1080 DPR 2. It reports CSS size, actual framebuffer size/pixel ratio,
megapixels, draw calls, triangles, GPU-synchronized total frame time, and
render-only time. SwiftShader timings are useful for repeatable local comparisons,
not as an absolute hardware FPS promise, so there is no timing threshold. The
seeded scene does enforce a machine-independent ceiling of 330 draw calls; its
current 300-call result guards static hull/cave batching and instanced fog.

`test/smoke/performance.mjs` supplies the portable assertions: both 4K forms must
start at no more than the 1080p pixel budget, sustained overload must reduce the
ratio without crossing the 720p floor, and sustained headroom must recover it.
It also verifies that a live player hull compresses its authored source parts to
less than half as many render meshes.
Manual visual-test stepping supplies no wall-clock delta, keeping screenshots
deterministic and native at the harness's 1280×720 viewport.

For normal PR iteration, run only each affected scene with
`-- --scene=<name>` and inspect its PNG. The full 37-scene SwiftShader sweep is
serial by design and reserved for broad renderer changes or release checks; it
takes roughly three minutes on the reference Windows machine. It is not part of
CI: generated baselines are deliberately local, while the deterministic smoke
suite supplies the pull-request behavior gate.

## Visual harness (`test/visual/run.mjs` + `src/game/TestScenes.ts` + `test-scenes/`)

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
| combat / fx / split | staged battle FX; clean laser vs missile vs mature ship smoke; rock calving |
| fx-volume | oblique view of instanced 3D fireball lobes and spherical shock fronts |
| smoke-volume | camera embedded inside a large, navigable post-explosion soot cloud |
| shield-impact | side-on proof that the hit ripple occupies only the struck hemisphere |
| damage-shake | deterministic heavy-hull-hit framing: positional/rotational kick + HUD flash |
| asteroid-impact | live projectile entry point and surface-protruding asteroid impact FX |
| ship-breakup | unobscured post-blast plate of cloned components from the actual destroyed Kestrel hull |
| hud | full HUD: panels, jump spool + warp streaks, contract OFFER panel, quest tracker, merchant note |
| targeting | hostile marker semantics: lock box + lead/range, red/amber/grey contacts, edge chevrons, radar, live fire |
| distant-targeting | no-pursuit angular scan beyond 1.5 km: centred 1,847 m hostile selected over a nearer off-axis contact |
| turret-targeting | dormant independent turret selected by peaceful crosshair scan; green health edges inside a red perimeter-only glow |
| capital-targeting | far whole-carrier lock and a readable nose-on fitted wireframe rather than an empty transparent preview |
| friendly-targeting | merchant fallback lock: green box/wireframe, relationship+role copy, no lead pip |
| menu / hangar / loadout / cockpit | each screen; cockpit = live-data MFDs + frame |
| boost | camera framing at full boost (ship large, visible) |
| cave / wreck / level / planet | POIs: cave asteroid, derelict+blackbox, capital+hauler; planet stages the outside approach looking through the broad natural arch |
| base | Vigil ground base close-up (apron, windows, pipes, walls, rover, sign, landing pad) + rooftop turrets firing at a near-level player ~150 m out — the "turrets shoot their own roof" geometry |
| trade | merchant trade screen: Buy/Sell tabs, painterly offer art, shared SVG holding/cost marks, ✕ close button |
| fleet | all three playable hulls, CLOSE low rear-quarter above the field plane, HUD off — the range+angle where floating-part "ship slop" shows |
| cloak | predator cloak engaged: glass hull + iridescent rim shell, dimmed engines |
| controls | keyboard/mouse control reference and device bindings |
| mobile-controls / mobile-hangar | 844×390 landscape touch deck hit layout and native tappable hangar |
| mobile-controls-portrait / mobile-hangar-portrait | 390×844 uncluttered portrait deck and vertically scrollable threat selection |
| mobile-loadout / mobile-trade | 844×390 scrollable Engineering and merchant overlays with direct close control |
| enemy-variety | raider/warden/bomber silhouettes, cannon and rocket batteries, both rocket families |
| missile-warning | red imminent-impact warning, countdown and in-flight seeker |
| capital-superweapon | mixed top/bottom carrier batteries and the 75%-charged annihilator telegraph |
| capital-charge-guide | close oblique proof that the harmless charge telegraph is finite, broken energy rather than a solid kilometre-long bar |

For interactive hangar review, use
`http://127.0.0.1:8123/?testScene=hangar-live&seed=7` after starting the dev
server on port 8123. Unlike the frozen `hangar` capture, `hangar-live` retains
orbit/zoom, curved-surface clicks, hover tooltips, cookies, and fullscreen
behavior. The normal webpack dev-server default remains port 8080.

### Staging rules (hard-won)

- Stage **relative to `game.player.position`** — the 700 m safe-spawn solver moves the
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

## Smoke test (`test/smoke.mjs` + `test/smoke/`)

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

`test/smoke.mjs` is only the ordered runner. Feature probes are split into
`hangar`, `desktop-input`, `world`, `targeting`, `capital`, `asteroid-impact`,
`projectile-damage`, `debris`, `fx`, `runtime`, and `mobile` modules; shared server,
browser-diagnostic, and artificial-time utilities live in `helpers.mjs`, while
`assertions.mjs` converts their returned results into named failures. Keep probes
with the system they exercise, return serializable result objects, and preserve
the runner order when a later module intentionally consumes earlier staged state.
`test:architecture` enforces the runner and per-module budgets so this split
cannot silently collapse back into one oversized file.

`mobile.mjs` creates a real `hasTouch`/coarse-pointer Chromium context at 844×390,
dispatches pointer gestures through the rendered sticks/buttons, and advances game
time manually. It asserts analog movement/aim, fire, boost, weapon/view switching,
Engineering round-trip, 44 px hit minimums, viewport containment, zero hit-target
overlap, and direct native-DOM ship selection in the touch hangar.
The portrait hangar probe also sends a browser-native CDP touch swipe whose initial
contact lands on the hardpoint row; it must move the actual hangar scroll container.
This catches pointer-transparent informational panels that programmatic `scrollTop`
checks cannot detect.

`desktop-input.mjs` replaces the browser capture APIs with ordered spies and proves
that entering flight requests pointer lock without requesting fullscreen. It then
exercises the explicit fullscreen enter/exit toggle and Keyboard Lock separately.
The page-realm API stubs live in `browser-capture-mock.mjs` so the scenario remains
below its smoke-module size budget.
It also sends a canvas mousedown while unlocked and proves that the fresh-gesture
retry occurs without leaking the click into primary fire, while retaining the
Ctrl+W forward-plus-descend keyboard chord.

The FX probe advances pools directly: an energy impact must create zero smoke, a
missile cloud must be non-empty, ship destruction must be denser, every puff must
expire, and the active count must stay within 512. It then routes real player hits
through combat and asserts that a surviving shield flashes, a depleted shield does
not, and a hull strike produces a stronger damage kick.

The breakup probe destroys a live large asteroid and requires 2–3 newly registered,
collidable children with finite HP, then destroys one child to prove it is gameplay
geometry rather than expiring decoration. It advances the field and requires every
child to translate outward and rotate. Separately, it audits every live hull/turret
kind: every fragment must retain a source-part identity and stay below hull-relative
rod/oversize bounds even with excluded superweapon VFX forced visible. It then advances a
player breakup through four seconds of artificial gravity against a deterministic
terrain sampler to prove the parts fall and remain above the rendered ground.

The asteroid-impact probe fires both a bolt and missile through the live projectile
system into transformed instanced geometry. It requires a unit face normal and
measures 0.8/1.2 m of effect clearance along that normal, catching sloped surfaces
where a center-radial offset would still render inside the asteroid.

The projectile-damage probe fires through a rendered ore spike, requires the owning
body's `oreHp` and DOM preview bar to decrease together, then launches a real fast,
unguided enemy rocket and proves it intersects and damages the player without being
treated as a seeker lock.

**Ship connectivity audit** runs first (`window.auditShips()` →
`auditShipConnectivity` in `ShipMeshAudit.ts`, re-exported by `ShipMesh.ts`):
every hull is checked at GEOMETRY
level — parts sampled (vertices + bbox center/face/edge probes) and
union-found into components by nearest-surface distance (eps 0.045); the test
fails unless every kind is ONE connected body. This covers every viewing angle
at once and has caught real floating-part regressions (raider blade tips,
capital burner discs, kestrel wingtip cluster).

Asserted, in order:

1. A cookie-free real Launch/Hangar flow settles on Kestrel/Veteran with no cookie
   creation. Then seed Vanta/Rookie root cookies, repeat the menu flow, settle four
   browser frames, and require the runtime, selected card, preview hull, and
   cookies to remain Vanta/Rookie with **zero** initialization writes. A physical
   click at the Kestrel visor card must switch the runtime/UI and perform
   **exactly one** cookie write. Reloading and repeating the real menu flow must
   restore Kestrel with another zero-write settle. This catches both
   transition-click autoselection and duplicate source/visor dispatch.
2. Hangar actions remain aligned with the ship-card baseline through fullscreen;
   hardpoints/no-rack slots do not shift.
3. Vanta-style `missileRate=0` rejects craft/buy calls without changing the wallet
   and both overlay buttons are disabled with “No rack”. A far camera-centered
   merchant plus nearer off-axis hostile/civilian contacts selects the merchant as
   an informational contact, renders the friendly wireframe/role, exposes no
   `aimTarget`, hides the lead pip, and hard-cuts the bracket on focus loss.
   Enemy-ordnance coverage separately proves launcher-equipped enemies count zero
   before launch, only the active homing projectile contributes to the lock, and
   acceleration-aware impact warning begins between 1.5 and 2.0 seconds, never
   increases, and disappears when the missile becomes outbound.
4. Sector-1 peace (0 hostiles, ≥2 neutrals, 2 flux) → hail → offer → accept
   (active=1) → merchant dock + engine silence + buy-flux. Trade verifies all
   five SVG hold icons, structured cost/gain icons, column alignment, symmetric
   padding, and the Trade/subtitle left guide.
5. Engineering crafting preserves `.loadout-right.scrollTop`; hold icons are
   SVGs in an aligned icon/label/count grid with ≥10 px right inset. The mining
   prompt uses the stable rotating vein centroid and advances toward motion
   without a one-frame screen-space snap. The same formation renders a wireframe
   matching its Ion-teal or Scrap-amber resource without becoming an aim target;
   merchant and planet prompts are also
   asserted as world-anchored. Sector entry also asserts the 700 m safety envelope,
   zero pursuing patrols, no inherited missile warning, and an equal-weight
   majority-contact arrival bearing. Lift-off asserts the same bearing rule.
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
9. A controlled hold-jump shows required/held Flux, then (straight up, high, clear corridor) reaches hostile
   sector 2. Every cave-asteroid battery root clears every rock body by its full
   hit radius; dispatched hunters close from >20 u, the camera follows a teleport,
   overhead turret aim dot→1, and cloak/EMP/nanobots all function.
10. Range-policy staging proves close hostiles are distance weighted, distant
    hostiles are camera-angle ranked, and an on-crosshair civilian beats an off-axis
    hostile only during peace; active pursuit restores hostile priority. The
    exact live regression is staged separately: a centred 1,847 m hostile
    must beat a 1,444 m off-axis hostile despite both lying beyond/near the old
    1,500 m sensor cutoff. The same centered target remains selected behind a
    staged asteroid instead of falling through to its visible offset neighbor.
    Weapon reach never caps inspection. Lock colors remain
    red/grey rather than changing to orange. Hostile previews independently assert
    a red silhouette-perimeter glow and green full-health internal wireframe;
    dormant independent turrets are also selected by the peaceful scan. Explicit
    package staging proves a pursuing seeker bomber
    fires at 1,050 m plus rapid rotary ship/battery cadence. Artificial projectile
    time proves homing versus fast-unguided rockets, a 900 m player-seeker hit and
    1,200 m expiry against the 1,050 m path budget, lock → ≤2 s imminent state,
    warning DOM classes and cloak target loss. Direct carrier stepping proves 12
    four-way mixed, independently destructible top/bottom mounts, outward
    traverse + self-hull LOS, whole-carrier preview with mounts hidden at 600 u,
    and a nonempty 2D pixel footprint for the nose-on wireframe,
    individual mount lock at 200 m, frontal-only charge initiation, committed arc
    clamping, and first-asteroid absorption with the player/second rock protected.
    A synthetic `L-Ctrl + W` chord proves both movement keys stay active while the
    browser shortcut default is consumed by immersive flight input.
11. Cloak and crafting are both refused within the shared 180 m threat perimeter;
    Engineering buttons expose the safety lock without spending resources.
12. Dense-combat stability initializes WebAudio, repeatedly fills the 12-hunter
    and 320-projectile ceilings across five rendered kill cycles, and asserts the
    one-shot graph never exceeds 48 sources. A browser crash or WebGL context loss
    fails immediately; direct scene children plus renderer geometry/texture counts
    must return to their exact pre-stress baseline after every temporary wing is
    disposed.
13. The Aegis begins a sortie with 16 seekers and crosses its first fabrication
    boundary at exactly 10 seconds; a Kestrel definition explicitly disables
    regeneration. The test seeds 9.98 seconds directly, then advances one runtime
    tick so CI never waits on wall time.

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
