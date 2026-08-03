# Nebula Reckoning

Last updated: 2026-08-02.

[MIT License](LICENSE) · [Contributing](CONTRIBUTING.md) ·
[Security](SECURITY.md) · [Play the latest production build](https://victorzakharov.github.io/NebReck/)

> **Development note:** This project was vibe-coded over just two real-time days
> using a combination of Fable 5 High and GPT-5.6 Sol Max.

A fast arcade space dogfighter in the spirit of Everspace, built from scratch with
**three.js + TypeScript + webpack**. Original fiction: you are Wren Callis, flying
prototype hulls against the Vigil — an ancient machine fleet "preserving" the Halcyon
Drift by emptying it.

Everything is procedural: ships, cockpit, nebula skyboxes, planets, asteroid fields,
particle FX, and even the audio (WebAudio synthesis — zero binary assets in the repo).

## Screenshots

<table width="100%">
  <tr>
    <td width="33.333%">
      <a href="screenshots/nebreck_1.jpg"><img src="screenshots/thumbnails/nebreck_1.jpg" alt="Deep-space exploration through a blue nebula and asteroid field" width="100%"></a>
    </td>
    <td width="33.333%">
      <a href="screenshots/nebreck_2.jpg"><img src="screenshots/thumbnails/nebreck_2.jpg" alt="Planet-surface combat with an incoming missile warning" width="100%"></a>
    </td>
    <td width="33.333%">
      <a href="screenshots/nebreck_3.jpg"><img src="screenshots/thumbnails/nebreck_3.jpg" alt="KV-7 Kestrel selected in the interactive hangar" width="100%"></a>
    </td>
  </tr>
</table>

## The loop

Launch into a **peaceful first sector** with full jump fuel — mine ore veins, crack
cave asteroids and wreck blackboxes, hail haulers (R) for **procedural contracts**
(bounties, procurement, beacon deliveries, cross-sector courier runs) — then spool
the jump drive (J, 2 Flux Cores) into ever-meaner sectors. Vigil kills raise your
**alert**; hunter wings come collecting. Death banks your score as **credits** for
permanent Legacy upgrades. The capital ship suppresses your jump drive, carries
twelve individually destructible batteries, and threatens the frontal approach
with a telegraphed annihilator beam — cripple it, destroy it, or outrun its field.

## Features

- **Three playable ships** (Kestrel interceptor / Vanta scout / Aegis gunship) chosen
  in an interactive convex-visor hangar, plus three difficulty tiers with real
  multipliers. Explicit card clicks commit ship and difficulty to one-year,
  root-scoped browser cookies, so choices survive reloads without requiring Engage
  or game entry; opening or rendering the hangar never rewrites them.
- **Interactive first-flight tutorial**: a dedicated Hangar action launches a
  consequence-free, 27-objective Kestrel course led by the visual and spoken LYRA
  instructor. It teaches real flight, combat, damage, devices, mining, crafting,
  trade, missile evasion, a guided surface-base raid, planetfall and sector travel
  using the actual systems, HUD highlights and shared world-space navigation. All
  LYRA copy stays in-universe instead of exposing collision, spawning, or procedural
  implementation language. The
  incoming-seeker lesson uses the production lock/impact warning: a clean unaided
  dodge passes immediately, while a close approach holds time until the player
  moves laterally clear, then releases the real missile. Every completed objective holds its visible result until
  the player performs the next prompted gameplay action; named transition buttons
  remain only where no natural action exists. Left/Right Arrow on desktop and progress
  chevrons on touch screens stage any lesson as
  a live, playable debug checkpoint without rerolling the expedition's original sector
  theme or layout. The movement lesson selects a dense real asteroid cluster and puts
  its navigation gate beyond the field instead of demonstrating against one lonely rock.
  LYRA's compact card expands while she speaks, minimizes when
  she finishes, and preserves a player's manual expand/minimize choice; lesson keys
  remain visible in the minimized strip. Escape pauses into a training menu, while
  its **Exit tutorial** action or the touch card's close control explicitly leaves the course.
  Only the currently taught controls accept input, with matching mobile highlights.
  Those relevant controls work immediately even while LYRA is speaking: experienced
  pilots may interrupt a briefing with deliberate actions, while ordinary camera motion
  during contact identification is latched without cutting LYRA off. Enter mirrors the visible next
  button only during optional review/free-roam states. Scripted events never cut off
  narration on their own. One-shot crafting and trading results are latched even when
  performed before their briefing finishes, so acting early cannot deadlock the course.
  Closing Trade before buying returns to the still-marked merchant, and R can dock
  again without restarting the lesson. Free-flight lessons keep Q/E roll available.
  Scripted impacts and the harmless EMP demonstration remain visible for as long as
  needed. Cloak training uses a live sentry that fires while the Kestrel is visible,
  loses it during a close cloaked approach, and reacquires it after weapons reveal
  the ship; energy is unlimited only for that drill, while LYRA explains the normal
  finite-energy limit. The surface route keeps its passive battery and salvage cache
  inside the same authored base. The first flight gate is placed beyond real debris,
  requiring an actual six-axis route rather than straight-line thrust. Contextual HUD
  prompts expose only the interaction taught by the current lesson. Looking skyward
  confirms lift-off without snapping the view, and holding J through orbit cannot
  silence the following sector-jump briefing. The player cannot
  die, and the course never overwrites the chosen hangar ship or threat level.
- **Phone and tablet controls**: an adaptive portrait/landscape flight deck supplies
  analog move/aim sticks plus 18 non-overlapping touch targets for maneuvering,
  weapons, devices, navigation, interactions, view, Engineering, and pause. Touch devices use
  a compact native-DOM hangar so every ship, threat, Engage, Tutorial, and Back choice remains
  directly tappable and vertical swipes may begin anywhere on the hangar UI,
  including the selected ship/hardpoint panel; desktop keeps the shared curved visor.
- **Combat**: four primary weapon profiles + lock-on seeker missiles, cover-independent
  soft-targeting with lead pip, enemy AI wings (raiders, rotary interceptors, wardens
  and missile bombers), mixed cannon / rotary / homing-rocket / fast-rocket batteries,
  escalating waves and story comms. Seeker bombers can launch while pursuing from
  1,200 m; player seekers expire after 1,050 m of actual traveled path. Live missiles
  raise lock and monotonic two-second impact warnings, while a safely activated cloak
  breaks their tracking. With no enemy pursuing, hostile and
  civilian contacts at every range share one uncapped, camera-origin crosshair ranking
  inside a tight target-sized sensor cone;
  active pursuit restores hostile priority and distance-weighted close-combat aim assist. Civilians
  remain sensor-only and never autoaim. Hostile previews retain green→red health
  wireframes inside a separate red silhouette-perimeter glow (internal edges are
  never relationship-tinted); civilians use relationship colors and
  mineable veins use their resource color.
  Sensor selection works through asteroids and terrain; physical fire and enemy
  attacks remain line-of-sight blocked.
- **Arrival awareness**: sector jumps and planetary lift-off face the ship toward
  the equal-weight majority bearing of visible contacts, without letting a carrier's
  twelve batteries outweigh the carrier itself. The Aegis launches with 16 seekers
  and fabricates one more every 10 seconds in flight; the Kestrel starts with 8 and
  does not regenerate them.
- **Mining & crafting**: shoot glowing ore veins on asteroids, tractor in salvage
  (Scrap / Ion Crystals / Flux Cores), spend it mid-run in the Tab Engineering screen
  on repairs, refills and three-rank per-run upgrades. A shared original SVG set
  identifies every material/consumable in the HUD, hold and cost chips. Vein hints
  and informational resource-colored vein wireframes follow a stable, smoothly projected centroid;
  merchant, stash and landing prompts follow their world objects too. Crafting keeps
  its scroll position, is safety-locked within 180 m of a hostile, and cannot produce
  or buy missiles for a hull without a rack. The jump HUD shows required/held Flux.
- **Planet dungeons**: broad, open-bottomed rock arches over carved cave routes,
  connected angular bases, patrols, turrets, stashes and crystals. Visible cave
  rock and its overlapping outward collision shell share one profile, while ground
  collision interpolates the exact rendered terrain triangles. Cave paths cannot
  fold through themselves, entrances stay clear, rock formations use bounded
  lobes instead of needle spires, impact damage scales with closing speed, and every
  surface turret mount is collider-cleared so the battery remains exposed to fire.
  Revisiting the same planet during an expedition restores the exact terrain, harvested
  loot, surviving enemies and cleared garrison state.
- **Two cameras**: banked chase cam and a first-person cockpit with glowing MFDs,
  blended smoothly (V), plus damage-scaled positional and rotational impact shake.
- **Visuals**: fragment-correct solar corona, HDR bloom, ACES tonemap, SMAA,
  chromatic aberration on boost, procedural nebula/planets/asteroids, one-sided
  shield-hit ripples, and pooled preset explosions with instanced 3D fireball
  volumes, spherical shock fronts, lights, and large fly-through smoke clouds for
  missiles and destroyed ships. Energy bolts remain smoke-free. Projectile FX begin
  on the actual transformed asteroid surface; shattered asteroids become persistent,
  destructible child rocks that coast and tumble outward, while ships and turrets
  throw bounded pieces of their own modeled parts rather than VFX rods.
  Those parts drift in space and fall, bounce, and settle against planetary terrain.
- **Adaptive high-refresh rendering**: the rAF-driven simulation stays frame-rate
  independent while a hysteresis-controlled framebuffer targets smooth play without
  changing the native-resolution DOM HUD. Native and Retina-style 4K both begin at
  a 1080p internal pixel budget, can descend toward 720p after sustained overload,
  and recover quality gradually when headroom returns. Static hull/cave primitives,
  planet structures, and volumetric fog billboards are GPU-batched. Planet collision,
  line-of-sight, and projectile sweeps use a spatial index over the exact authored
  bodies, while cave illumination reuses two camera-local lights instead of adding
  every cave light to every material shader. The deterministic benchmarks preserve
  scene detail while enforcing 330 hostile-space and 90 dense-planet draw-call caps.

## Run

Node.js 24 is the supported runtime (`.nvmrc` pins the project major).

```bash
npm install
npm run dev        # http://localhost:8080
npm run build      # production bundle → dist/
```

For the interactive hangar review route used during development:

```text
http://127.0.0.1:8123/?testScene=hangar-live&seed=7
```

## Deployments

Every merge to `main` publishes the production bundle to
[GitHub Pages](https://victorzakharov.github.io/NebReck/). Pull requests
opened from branches in this repository receive an isolated preview at
`/pr-preview/pr-<number>/`; the workflow posts that link on the PR and removes
the preview when the PR closes. Fork pull requests run read-only CI without
deployment credentials.

## Controls

| Input | Action |
|---|---|
| Mouse | Steer (pitch/yaw) |
| LMB / RMB | Primary fire / seeker missile |
| W / S | Thrust / brake |
| A / D, Space / L-Ctrl | Strafe; L-Ctrl + W descends while thrusting forward |
| Q / E | Roll |
| Shift | Boost |
| 1·2·3 / wheel | Switch weapon |
| V | Toggle cockpit / chase camera |
| N | Set/clear a navigation point on the selected contact or aimed planet |
| Tab | Engineering (craft & repair) |
| J (hold) | Spool jump / land / lift off |
| R | Hail, trade, deliver or accept |
| F / G / H | Cloak / EMP / nanobots |
| Esc | Pause (during Tutorial: Resume / Exit tutorial; closes Engineering or Trade when open) |
| F11 / Fullscreen button | Toggle fullscreen |
| Touch | Adaptive portrait/landscape dual move/aim sticks + dedicated flight, combat, system, interaction, view, loadout, and pause controls |

Engage and Tutorial capture the desktop pointer, enter app fullscreen, and use
Keyboard Lock where supported so modifier movement chords such as `L-Ctrl + W`
remain game input instead of browser shortcuts. Automatic app fullscreen is required:
Chrome owns `Ctrl+W` outside JavaScript fullscreen before page input can cancel it.
The title and pause controls can still toggle fullscreen manually. If a browser
rejects the first pointer-lock request, click the game canvas once to recapture
the mouse; that click is consumed and does not fire.
Coarse-pointer devices automatically use the touch flight deck and skip pointer lock.
The desktop Tutorial keeps capture through observation holds and renders its own
cursor for LYRA controls. If the OS takes focus, the tutorial remains the sole UI;
click the canvas or a lesson control to resume capture. Escape deliberately opens
the training pause menu without abandoning progress.

New pilots can choose **Tutorial** beside Engage in the Hangar for the guided,
hands-on course. The in-game **Field Manual** (main menu) remains the complete
reference for every implemented mechanic.

## Testing

```bash
npm run test:architecture     # enforce controller and harness line-size budgets
npm run typecheck            # strict TS, no emit
npm run test:performance     # repeatable 1080p / native-4K / Retina-4K renderer report
npm run test:visual          # full local/release sweep of 46 ignored baselines
npm run test:visual:update   # re-capture local baselines after intentional changes
npm run test:smoke           # end-to-end behavior + persistence regression suite
```

The smoke command keeps a thin runner in `test/smoke.mjs`; focused tutorial,
hangar, world, targeting, capital, runtime, and real coarse-pointer mobile probes live under
`test/smoke/`. DOM-only checks stop the live loop, while deterministic artificial
time skips unobserved post-processing frames. This preserves the full behavior
coverage without making CI pay software-rendering cost for invisible frames.

The performance command stages both a real hostile sector and a dense planetary
base in the production build. It reports framebuffer size, draw calls, triangles,
GPU-synchronized frame time, simulation-only time, and render-only time for three
display profiles. Timing is diagnostic rather than a machine-specific threshold;
deterministic 330-call space and 90-call planet budgets plus smoke tests guard
batching, local-light limits, collision indexing, and adaptive resolution. Pass
`-- --world=planet` or `-- --profile=1080p` for a focused iteration run.

The visual harness (`test/visual/run.mjs`) builds the app, serves `dist/`, drives
headless Chromium on SwiftShader (software GL → GPU-independent pixels), loads each
scene via `/?testScene=<name>&seed=7`, and diffs screenshots with pixelmatch.
Scenes are staged deterministically (seeded RNG, fixed-step simulation, frozen CSS
animations) — a same-machine re-render diffs at exactly 0.000%. Baselines are local
generated artifacts and are intentionally not committed: the first run creates
them, and subsequent runs compare against them. The 46 scenes cover world art,
every major screen, targeting, combat/FX, caves, bases, trade, fleet connectivity,
cloak, desktop controls, phone controls/hangar/overlays/tutorial, volumetric destruction,
enemy variants, missile warnings, the narrated tutorial, and the capital superweapon.
Failure diffs land in `test/visual/diff/`.
Use `-- --scene=<name>` during normal PR iteration; the full software-WebGL
sweep is intentionally local/release-only and is not duplicated in CI.

## Documentation

- [docs/SYSTEMS.md](docs/SYSTEMS.md) — the gameplay rulebook: every mechanic with
  its actual numbers (travel, alert, contracts, economy, devices, meta, planets).
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — module map, state machine, frame
  flow, space↔planet environment duality, rendering pipeline, event catalog.
- [docs/GOTCHAS.md](docs/GOTCHAS.md) — hard-won pitfalls with root causes
  (lookAt/+Z, light-count recompiles, rng fork order, clip-path label clipping,
  pointer-lock quirks, …). **Read before touching world gen, cameras, or AI.**
- [docs/EXTENDING.md](docs/EXTENDING.md) — per-feature recipes: weapon, enemy,
  ship, quest kind, device, trade, base template, marker kind, and tuning knobs.
- [docs/TESTING.md](docs/TESTING.md) — harness contract, per-scene coverage,
  staging rules, smoke assertions.
- [CLAUDE.md](CLAUDE.md) — condensed agent onboarding + non-negotiable rules.

## Contributing

Issues and pull requests are welcome. Start with
[CONTRIBUTING.md](CONTRIBUTING.md), which documents setup, required checks, and
the project's deterministic rendering rules. Please report security issues
privately as described in [SECURITY.md](SECURITY.md).

## License

Copyright © 2026 Victor Zakharov.

Nebula Reckoning is released under the [MIT License](LICENSE). Production
bundles include the license and the notices for incorporated dependencies in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
