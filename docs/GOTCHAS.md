# Gotchas

Last updated: 2026-08-01.

Real issues hit while building this game, kept here so they only get paid for once.

## three.js

- **`IcosahedronGeometry` (all PolyhedronGeometries) is NON-indexed** — every face has
  its own copies of the corner vertices. Displacing vertices with independent random
  values tears the mesh into overlapping shards (this happened; see the asteroid bug).
  Displacement must be a **pure function of vertex position** (e.g. layered
  `sin(pos·k + seed)`) so duplicated corners move identically. `AsteroidField.displace`
  is the reference implementation.
- **`object.matrix` is stale between renders.** It's recomposed from
  position/quaternion during render. Reading `camera.matrix`, mutating position, then
  `matrix.decompose(...)` writes *last frame's* transform back and silently cancels
  your movement — this was the "camera doesn't follow" bug. Work in
  position/quaternion space directly; never round-trip through `.matrix` mid-frame.
- **Ships face -Z** (three.js forward). `Ship.forward()` returns
  `(0,0,-1)` rotated by the quaternion. Gunpoints/enginePoints are local-space and
  must go through `object.localToWorld()`.
- **`Matrix4.lookAt` degenerates when the aim direction is parallel to the up
  hint.** With the player flying directly OVERHEAD (the normal case on planets),
  `lookAt(zero, toPlayer, (0,1,0))` collapses and turret barrels pointed into the
  ground beneath them while the base appeared to track (this happened). Every
  aim/steer site now swaps to a side up-hint when `|dir.y| > 0.85` (Turret,
  EnemyShip, NeutralShip, `Ship.faceToward`). The smoke test parks the player
  straight above a turret and asserts barrel alignment.
- **`Object3D.lookAt` points +Z at the target for non-camera objects** (three.js
  swaps eye/target internally for meshes). For -Z-nosed ships this is exactly
  backwards — it made every enemy and turret steer AWAY from the player and never
  pass their aim-alignment gate, so nothing ever attacked (this happened, and it
  shipped through several rounds because no test asserted engagement). Use
  `Ship.faceToward()` / `Matrix4.lookAt(eye, target, up)` and never raw `lookAt`
  on a ship. The smoke test now asserts enemies CLOSE distance on the player.
- **Hiding an InstancedMesh instance**: there is no per-instance visibility — set its
  matrix to zero scale (`new Matrix4().makeScale(0,0,0)`) and flag
  `instanceMatrix.needsUpdate` (see `AsteroidField.depleteOre`).
- **`Object3D.lookAt` uses world +Y as up** and can't roll. For a camera that banks
  with the ship, build the orientation via `Matrix4.lookAt(eye, target, shipUp)` →
  `Quaternion.setFromRotationMatrix` (see `ChaseCamera.goalQuaternion`).

## postprocessing (pmndrs)

- Renderer must be created with `antialias: false` (SMAA is a pass) and the composer
  with `frameBufferType: HalfFloatType` for HDR bloom.
- Tone mapping is done by `ToneMappingEffect(ACES_FILMIC)` **in the pass chain**, not
  `renderer.toneMapping` — setting the latter would tonemap per-material *before*
  bloom and kill HDR highlights.
- Pass order matters: bloom (HDR) → aberration/vignette/tonemap → SMAA + subtle
  grain (SMAA operates on LDR output, keep it last).
- Anything meant to bloom: `toneMapped: false` material with color components > 1,
  or emissiveIntensity > 1.
- **A point-sampled god-ray source cannot represent a partially visible star.**
  Testing only the sun centre makes illumination jump between all and nothing as
  an asteroid or viewport edge crosses that point. The sun uses a depth-tested
  extended corona instead: every visible fragment contributes to bloom while
  occluded fragments fail depth normally.
- **Browser F11 can invalidate composer targets without producing an obvious
  WebGL error.** Recreate the postprocessing composer after the fullscreen
  transition, then resize its targets; resizing the renderer alone left the
  hangar's WebGL background black until F11 was toggled back.
- **CSS resolution is not framebuffer resolution.** A 4K viewport is 4× the
  pixels of 1080p, and a 1920×1080 Retina/DPR-2 canvas is also a 4K framebuffer;
  every half-float bloom/post pass pays that cost. `AdaptiveResolution` budgets
  actual framebuffer pixels, not CSS width, and the DOM HUD stays native.
- **A resize must not reset adaptive quality.** Recomputing from device DPR on
  every fullscreen transition jumps straight back to the expensive target.
  Preserve the current buffer-pixel workload across viewport changes and let
  sustained frame timing recover quality. Ignore >100 ms wall-clock hitches so
  background tabs and target reallocations do not trigger a downshift spiral.
- **A batched hull deliberately exists twice in the scene graph.** Layer-31
  source parts preserve exact geometry for audits and debris; layer-0 fused meshes
  are the only rendered copies. Manual traversals that build visuals (target
  previews, cloak shells) must skip `renderBatchSource`, while destruction must
  skip `excludeFromDebris`. Removing either side causes duplicate renders or fake
  monolithic wreckage.

## Determinism / visual tests

- **Never call `Math.random()` or read wall-clock in anything that affects a rendered
  frame.** Use the `Rng` streams; pass the loop's `elapsed` into shaders.
- **`rng.fork()` order is load-bearing.** Sector forks child streams in constructor
  order (skybox → starfield → sun → planets → asteroids → dust). Inserting a new
  consumer earlier shifts every later stream → all world baselines change. Append new
  consumers last, or expect to `npm run test:visual:update` and re-eyeball.
- DOM determinism comes from the injected freeze stylesheet in
  `test-scenes/TestSceneShared.ts`
  (animations paused at t=1s, transitions off). New CSS animations are automatically
  covered; `setTimeout`-driven UI (comms fade-outs) is **not** — don't let a test
  scene depend on timer-driven DOM state.
- Baselines are local generated artifacts and intentionally Git-ignored. A fresh
  clone's first visual run creates them; rerun to compare. They are stable
  per-machine (SwiftShader), but a different OS/Chromium major may shift a few
  pixels — the 1.5% diff budget absorbs small drift. Regenerate baselines on
  purpose, inspect them, and never commit the PNGs.

## Engine loop / gameplay

- **dt is clamped to 1/20 s** (`GameLoop.MAX_DT`). Below 20 FPS, simulated time runs
  slower than wall time — in the SwiftShader smoke test (~4 FPS) 8 wall-seconds ≈ 2
  sim-seconds. Don't "wait N seconds" in headless tests; use `advanceGameTime` or
  the isolated `advanceProjectileTime` helper, or fast-forward state directly
  (e.g. `waveDirector.countdown = 0.01`). Browser layout synchronization waits
  for fonts plus actual animation frames instead of arbitrary millisecond sleeps.
- Smoothing everywhere uses `1 - Math.exp(-k*dt)` — copy that form, never a bare
  `0.1` lerp factor (frame-rate dependent).
- Projectiles use swept segment-vs-sphere tests (`ProjectileSystem`) — a naive
  point-in-sphere check tunnels at 430 u/s bolt speeds. The asteroid broadphase
  assumes ≤ ~40 u of travel per frame; raise the margin if projectiles get faster.
- `as const` on CONFIG makes numeric fields literal types; a mutable class field
  initialized from one must be annotated (`energy: number = CONFIG...`) or TS pins it
  to the literal.
- **Sphere colliders lie for buildings.** A `radius = maxDim * 0.7` sphere around a
  flat 26×10×26 block pokes ~8 u above the roof: rooftop turret bolts detonated at
  their own muzzles AND player bolts detonated on invisible air before reaching the
  turret ("turrets shoot the ground" / "turrets can't be destroyed", Image #15).
  Buildings carry a tight `box: {hx,hy,hz}` on `AsteroidBody`; `ProjectileSystem`
  does slab-method segment-vs-AABB, ship collision clamps to the box, and
  `hasLineOfSight` confirms sphere candidates against the box. Two extra guards:
  a bolt that STARTS inside a body's bound is exiting its own mount and skips that
  body; keep AABB'd blocks axis-aligned (no random yaw) so collider = visual.
- **A tight building collider is not enough if the turret's own hit sphere overlaps
  it.** Outgoing bolts skip the containing mount, which can disguise the overlap,
  while incoming bolts hit the mount first and make the turret seem invulnerable.
  The turret hit radius covers its armored center (not its long barrel tips), and
  `PlanetSurface` rejects every spawn whose complete hit sphere intersects terrain
  or any registered body after all bases/caves are built.
- **Targeting must scan the correct threat-resolution set** (`game.hostiles`),
  not only `enemies`—independent turrets were otherwise unlockable. Distant
  carrier mounts are intentionally omitted beyond 260 m so the hull reads as one
  capital-level contact; they re-enter up close. `shootables` still contains every
  mount at every range so this UI policy never changes physical hits. Inside the
  active weapon reach, score is `(1-dot)*400 + dist*0.5`, so a 10× closer turret
  beats a distant fighter at similar angles—but only while an `EnemyBrain` is
  engaged. With no pursuing enemy, hostiles and civilians compete in one pure
  camera-crosshair ranking (range breaks exact ties only), allowing immediate
  inspection target swaps to whichever contact is actually under the reticle.
  Do not add a fixed sensor-distance cap: the 1,500 m legacy cutoff silently
  discarded a centred 1,847 m contact and selected a 1,435 m off-axis contact.
  Compute that scan from the chase-camera position, not the player position, and
  use the reticle margin plus each target's apparent radius. The old shared 18°
  acquire cone could still select an offset visible contact when the centered one
  was occluded, even though the bracket plainly disagreed with the crosshair.
  More importantly, targeting is a sensor operation and must not call world/terrain
  LOS at all: cover blocks ordnance and hostile firing, not contact selection.
  Weapon range divides close combat from angular inspection; it does not bound
  the latter.
  The hostiles list is rebuilt BEFORE `targeting.update` each tick.
- **Relationship outline and hull condition need separate render passes.** A CSS
  `drop-shadow` on the wireframe canvas outlines every internal edge red. Render a
  solid target silhouette into a tiny alpha mask, dilate only outside that mask,
  composite the red perimeter glow, then draw the health-colored edges on top.
- **Normalize preview translation and scale in the same coordinate space.** After
  baking source-world mesh transforms, `position = -center` followed by a small
  parent scale does not center the object; it leaves an asymmetric capital hull
  outside the preview camera and produces an apparently empty canvas. Translate by
  `-center * scale`. Long ships also need a bounded, uniform projected-size zoom
  when nose-on; never distort axes or replace the true relative quaternion.
- **A nominal asteroid radius is not its displaced visual surface.** Cave batteries
  placed at a fixed fraction of the generator radius can land inside scaled rock.
  Project the actual transformed vertices along the mount normal, clear the full
  turret hit sphere against every body, and stretch the pedestal to the final root.
- **An informational contact is not an aim target.** During active pursuit,
  targeting tries hostiles first, then sensor-only civilians. During
  peace, both relationship sets share the angular comparison, but a winning
  civilian remains informational. Civilians are not erased by asteroid visual
  clutter and receive no wider keep-lock cone. HUD projection
  consumes `current`, but primary convergence and seeker homing must consume
  `aimTarget`; feeding `current` to weapons silently enables autoaim against
  merchants. The capture bracket has no opacity transition so loss is immediate.
- **Missile warnings count live projectiles, never launcher-equipped enemies.**
  `ProjectileSystem.incomingThreat` includes only active homing ordnance whose
  current target is the player; carried payloads, unguided rockets, released pool
  entries, and seekers that lost lock contribute zero. ETA must solve the missile's
  accelerating pursuit (plus a bounded turn penalty), not divide range by current
  radial speed—that delayed the red warning until roughly 0.6 seconds. Cache a
  per-projectile warning ETA with `min(previous,current)` so displayed time cannot
  rise; clear it immediately when radial closing speed becomes non-positive.
- **Missile range is traveled path, not launch-to-current displacement.** Player
  seekers have a 1,050 m budget. Clamp the final swept segment to the remaining
  budget before collision tests, then release it; checking after collision allows
  a last-frame hit beyond range, while displacement lets curved seekers overfly it.
- **Arrival bearing must weight contacts, not implementation objects.** Average
  normalized bearings so range does not dominate, and omit `capitalTurrets` when
  the capital hull is already included; otherwise one carrier's twelve mounts turn
  the intended majority direction into a carrier-only direction.
- **Chrome reserves Ctrl+W before ordinary page key handling.** Flight enters
  JavaScript fullscreen and locks physical `KeyW`, which forwards every modifier
  chord to `Input`; the handler must still `preventDefault()` while retaining both
  `ControlLeft` and `KeyW` so descend + forward works. Pointer lock alone is not enough.
- **Removing an Object3D does not free its GPU allocations.** Every ship mesh is
  procedurally instantiated, so kills, sector swaps, hangar hull changes, parked
  planet visits, and an abandoned space stash must call `Ship.dispose()` after
  detaching objects that will never return. Temporarily parked planet/space actors
  are detached without disposal and released only when their visit/sortie is
  discarded. Shared cached surface/glow textures are intentionally not disposed.
- **Combat population and WebAudio graphs need hard ceilings.** Hunter dispatches
  stop at 12 live reinforcements and pooled projectiles stop at 320. Synthesized
  one-shots reserve one of 48 source slots and explicitly disconnect their graph
  in `onended`; without those bounds, a long high-alert firefight could grow CPU,
  GPU, DOM-contact, or audio resources until Chromium killed the tab. Rotary fire
  additionally uses one globally rate-limited sound instead of a graph per bolt.

## HUD / secondary renderers

- **Off-screen indicator angles must come from CAMERA-SPACE direction**
  (`pos.applyMatrix4(camera.matrixWorld.invert())`, angle = `atan2(x, y)`), never
  from `Vector3.project()`. Projection divides by w, which goes negative behind the
  camera — the projected point mirrors and edge arrows flip/oscillate near 90° off
  boresight (this happened).
- Per-frame trauma/shake contributions must be dt-scaled (`addTrauma(k * dt)`), not
  fixed per-frame amounts — a fixed amount shakes 2.4× harder at 144 Hz than 60 Hz
  (this happened with boost shake).
- The radar and ship thumbnails use their own small `WebGLRenderer`s. That's fine
  (a handful of contexts), but dispose throwaway ones (`ShipThumbnails`) and never
  create one per frame. Thumbnails need `preserveDrawingBuffer: true` for
  `toDataURL`.
- **Do not serialize generated data-URL images inside another SVG data URL.**
  The visor's old `foreignObject` raster path failed panels containing ship or
  weapon icons while its text-only panel worked. `VisorPanels` now paints each
  panel directly to an origin-clean canvas, then uploads one `CanvasTexture`.
- **Visor curvature belongs to one viewport coordinate system.** Curving each
  card around its own local centre makes every widget look like a separate tiny
  helmet. `HangarVisor`/`VisorPanels` derive all vertices from the same
  screen-space dome, with the centre protruding toward the viewer.
- Curved visor interaction must raycast the rendered meshes and forward the hit
  into the source panel. A click should update DOM state and repaint affected
  textures; rebuilding/reloading the hangar costs seconds and loses hover state.
- DOM overlays that must scroll or receive the wheel need `pointer-events: auto` —
  `#ui-root` is `pointer-events: none`, and wheel events falling through to the
  canvas get `preventDefault`ed by Input (this broke Field Manual scrolling).
- An element with a `clip-path` clips its CHILDREN too — the target box's
  corner-bracket clip-path silently erased the range chip rendered below it.
  Position HUD satellites (labels, chips) as siblings, not children (this happened).
- `requestPointerLock()` REJECTS if called within ~1.3 s of the user Esc-exiting
  ("Pointer lock cannot be acquired immediately…"). Always `.catch` the returned
  promise and retry after the cooldown (`Input.requestPointerLock`).
- Closing an overlay (trade/loadout) re-enters `playing` while the pointer lock
  re-acquire is still pending/rejected — the `pointerlockchange` auto-pause then
  dumped the player into the pause menu ("Esc at trade screen throws to menu").
  `GameFoundation.autoPauseGraceUntil` suppresses auto-pause for 1.5 s after
  overlay close.
- **Metalness without an env map renders BLACK.** Base buildings at
  `metalness 0.6` were near-silhouettes on planet surfaces (no environment map
  there) — keep structure materials ≤ ~0.35 metalness, or feed an envMap.
- HUD stacking: `.hud-corner`/`.target-preview` get `z-index: 3` (above contact
  markers), overlay screens `.ns-panel` get `z-index: 10` (above the HUD). Adding
  a z-index to HUD panels without raising overlays buried the trade/loadout
  screens under the score panel (this happened).
- `planet-tag`/`merchant-note` chips default `display:none` in CSS — staged
  captures before the first `updateHud()` tick otherwise show stale "Surface ·
  Merchant" chips from the raw markup.
- **Never add `position` to `.hud-panel`.** The corner panels combine
  `.hud-corner` (absolute + coordinates) with `.hud-panel`; equal specificity
  means the LATER rule wins, and a `position: relative` on `.hud-panel`
  silently flattened every corner panel into document flow (the "broken WIP
  HUD" report). Positioning belongs on the placement classes only.
- **A broad carrier sphere makes hull-mounted batteries unshootable.** The carrier
  uses tight ship-local compound boxes for projectile and LOS intersection, while
  every live mount remains in `hostiles`/`shootables`. Destroying one battery must
  remove only that battery; destroying the carrier cleans up every survivor.
- JS `%` returns NEGATIVE for negative operands: a big backward mouse-wheel
  delta indexed `loadout[-1]` and crashed weapon switching. Use
  `((i % n) + n) % n`.
- `as const` CONFIG values as DEFAULT PARAMETERS infer literal types
  (`energyMax = CONFIG...` → type `100`) — annotate the parameter `: number`.
- Stretched asteroid instances (non-uniform scale) made near-origin rocks up
  to 2× longer — one loomed through the hangar bay aperture. The hangar hides
  `sector.asteroids.meshes` AND `sector.planetGroups` while open (planet RING
  discs are additive and enormous; one sliced a visible hard edge straight
  through the bay walls).
- **SphereGeometry's phi maps to `x = -r·cosφ` — X IS NEGATED.** A cut arc
  that must face world angle `a` (your `cos a, sin a` convention) lives at
  `φ = π − a`. The planet cave used `φ = a` directly, so the VISIBLE mouth and
  the FLYABLE collision gap were mirrored apart for months ("transparent wall
  I can't fly through").
- After TAPERING a wing (chord/thickness shrink + tip pulled aft), every
  attachment placed for the old slab silhouette floats: tip strips, winglets,
  nav lights, straight leading-edge accent bars. Recompute the true tip point
  and the true world leading-edge ANGLE (the taper flattens it relative to
  the wing yaw — for the Kestrel 0.42 yaw the LE is ~0.20, and the Aegis LE
  angle even flips sign). The connectivity audit can chain through bbox slack
  of rotated thin plates, so close-range captures (fleet/hangar) remain the
  guard for these.
- Two independently-placed planets can overlap on screen (ring clearance up
  to 2.2 × 900 radius) — placements are rejection-sampled against each other
  and the smoke test asserts `planetsClear`.
- Vertex-only sampling misses FACE-to-face contact in the connectivity audit
  (box corners can all be far from a part it rests on) — bbox center, face
  centers and edge midpoints are added as probes.
- A centered label that OVERFLOWS its button eats the right padding and reads
  as badly off-center (hangar Engage). Wide letter-spacing + big side padding
  on a flexed button is the trap — shrink tracking/padding until the text fits
  (measure the capture's pixel bounds, don't eyeball). `text-indent`
  "compensation" on `.ns-btn` was removed; trailing-tracking bias is ~2 px.
- **Tooltip geometry must not participate in the hardpoint row layout.** Give
  every slot—including “No rack”—the same fixed box, and position the single
  opaque tooltip beside hardpoint 1. Otherwise hover changes the row width,
  overlaps card copy, or pushes neighboring controls.
- Crafting repaints replace the right-hand recipe list. Save and restore
  `.loadout-right.scrollTop` across a successful purchase or every click jumps
  the player back to the first recipe.
- Ship-fit restrictions belong in both the screen callback and the mutation method.
  Disabling “Seeker Missiles” in Engineering/Trade is only presentation; `craft`
  and `executeTrade` must independently reject the transaction when missileRate=0.
- Crafting safety is the same two-layer invariant. `LoadoutScreen` explains and
  disables fabrication near a threat, while `GameScreens.craft` independently
  checks `SYSTEM_LOCKOUT_RANGE_METERS`. Reusing the cloak constant prevents two
  visually identical 180 m rules from drifting apart.

## Pointer lock / input

- **Pointer lock must be requested before fullscreen in the same user gesture.**
  Fullscreen consumes transient activation; awaiting it first left Safari with no
  permission to lock the mouse. This ordering is required by the current
  [Pointer Lock specification](https://www.w3.org/TR/pointerlock-2/), not a UA quirk.
  `DesktopFlightCapture.enter()` calls `requestPointerLock()` synchronously, then
  starts fullscreen. An unlocked canvas mousedown supplies a fresh retry and is
  consumed so acquiring the mouse never fires the primary weapon.
- Browser Esc force-exits pointer lock. The `pointerlockchange` listener auto-pauses
  — it checks `state === 'playing'`, so any transition that intentionally exits lock
  (loadout, pause) must **change state first, then** call `exitPointerLock()`.
- `requestPointerLock()` only works from a user-gesture call stack (button click) —
  fine for Launch/Resume; impossible in headless tests (hence `headless` option).
- Tab and Space are `preventDefault`ed in `Input` so they don't move browser focus.
- Touch controls must feed `Input`'s virtual actions/axes, never invoke game methods
  directly. That keeps pressed-this-frame semantics, cooldowns, and fixed-step tests
  identical to keyboard/mouse behavior.
- Every held pointer needs capture plus `pointerup`, `pointercancel`, and
  `lostpointercapture` cleanup. Reset all virtual state when controls hide or a blur
  can leave thrust/fire stuck on mobile.
- The curved hangar visor is a rasterized desktop interaction surface. Coarse-pointer
  devices must leave its source DOM visible and unmount the visor; otherwise taps hit
  hidden proxy panels and ship selection becomes unreliable.
- `#ui-root` is intentionally pointer-transparent during flight. A native mobile
  hangar must explicitly restore `pointer-events: auto` on its scroll container;
  restoring it only on buttons makes informational cards (notably hardpoints) pass
  swipes through to the canvas even though button-origin swipes appear to work.

- **Toggling a light's `visible` changes the scene's light COUNT** → three.js
  recompiles every lit material → a guaranteed frame hitch, typically on the first
  close-range explosion (this happened, reported as "lag when starting to shoot").
  Pooled lights must idle at `intensity = 0`, never `visible = false`. Same reason
  `renderer.compile()` runs at mission start to warm the shader cache.
- **Headless Chromium GRANTS pointer lock without a user gesture** — and then drops
  it, firing `pointerlockchange` → the auto-pause listener froze the smoke test
  mid-run (this happened). Automation must load with `?headless=1` so the game
  never requests the lock.
- **A transition click can outlive the screen it clicked.** The menu's Hangar
  button calls `showHangar()` before its click finishes bubbling. A document-level
  visor listener that checks only the *current* state can then raycast that same
  click into a newly mounted ship card and overwrite the restored preference
  (Aegis happened to sit under the button). Forward only when the preceding press
  began on the already-active visor.
- The hidden `.visor-src` DOM is a paint/input proxy, not a second interactive UI.
  Descendants must remain non-pointer targets and source-originated synthetic
  clicks must be ignored via `event.composedPath()`; otherwise one physical visor
  click can write twice after the source card rerenders and disconnects.
- Preference initialization is read-only. The lifecycle regression enters Hangar
  through the real menu, settles several frames, and requires zero cookie writes;
  it then physically clicks a different visor card and requires exactly one write,
  followed by another zero-write restore after reload.

- **Turrets must gate FIRE on line-of-sight, not just tracking** — otherwise they
  blast their own mounting rock/roof or a hillside all day (this happened on
  planets, asteroids, and buildings simultaneously).
  `GameCombat.hasLineOfSight` checks big bodies + planet terrain. Carrier mounts
  start that ray three units outward along their deck normal: starting inside the
  carrier collider and blindly skipping the first hit made the far-side hull
  transparent. Traverse separately rejects targets behind the mount hemisphere.
- **A homing missile's lock is its target reference, not merely its projectile
  kind.** Fast rockets are visually missiles but never raise a lock warning.
  `ProjectileSystem.incomingThreat` considers only active enemy homing ordnance
  still targeting the player; the runtime's cloak predicate clears that reference.
- Long-range weapons need long-range AI permission too. A 1,200 m seeker definition
  is inert if `EnemyBrain.approach` only sets `wantsFire` inside its legacy 320 m
  gun envelope. Pass the package attack range through `EnemyShip.update`.
- **Committed carrier fire is a state machine, not a delayed callback.** Charge
  begins only within 500 m, inside the forward cone, and with LOS. During the two-second charge the
  last visible position updates and is clamped to the physical arc; losing LOS or
  leaving the cone never cancels the shot. `traceCapitalBeam` stops at and destroys
  only the nearest asteroid, protecting the player and further rocks behind it.
- **Planetfall must DETACH the space world, never dispose it** — the sector has to
  be bit-identical on lift-off (destroyed rocks, live patrols, beacons). See
  `spaceStash` in `GameWorldFlow`; the smoke test scars a rock before landing to
  prove identity survives.
- **A revisited planet must also be detached, not regenerated.** `planetStates`
  caches the exact `PlanetSurface`, surviving enemies/turrets, and pickup
  snapshot for the current sector/sortie. Rebuilding from the seed alone revives
  harvested nodes and dead enemies even though the terrain looks identical.
- **A visible cave void and a flyable cave void must be the same volume.**
  Disconnected mounds or a closed `TubeGeometry` plus broad solid colliders create
  black gaps the camera can see through but the ship cannot enter. Planet caves
  use one open-bottomed asymmetric arch and place small collision spheres just
  outside that exact profile in an overlapping 2-D lattice. Arch shoulders use
  their actual world-space terrain heights. A dense route follows the curved
  entrance centreline—one straight chord can cut through the wall on a sharp
  first bend. Smoke tests probe every route segment and both wall sides with the
  player's radius.
- **A fake branch inside one spline is a self-intersection.** Inserting a point
  near an earlier waypoint before the final point made Catmull-Rom caves fold
  through themselves: some wall sections became apparent holes while other
  invisible samples blocked the ship. Caves now use a single broad-turn ordered
  walk; a real branch would need a second independently joined tunnel.
- **Analytic height is not rendered height between grid vertices.** Re-evaluating
  high-frequency noise for collision while the GPU displays linearly interpolated
  `PlaneGeometry` triangles creates invisible floors at steep carves. Retain the
  generated vertex heights and use the same triangle interpolation in `heightAt`.
- **Procedural POIs need exclusion zones.** A valid cave generated 44 m from a
  Vigil base made base buildings read as repeated cave “tree trunks” and could
  obstruct the mouth. Cave candidates now reject all base waypoints and other
  cave mouths before their terrain carves are committed.
- **Collision damage is closing-speed damage, not overlap damage.** Using total
  velocity plus a minimum hit inflicted four damage on a parked ship every
  depenetration frame. Body impacts now use
  `max(0, -velocity.dot(contactNormal))`; zero-speed overlap deals zero and only
  the inward component bounces.
- Every visible planet-surface obstacle must be registered with the shared body
  list. Enemy steering, projectile sweeps, and `hasLineOfSight` all consume that
  list; decorative-only rocks let enemies see, shoot, or fly through apparent
  cover.
- Avoid extreme primitive aspect ratios in procedural geology. Tall low-sided
  cones turn into black needles from edge-on views; surface and cave dressing use
  displaced, bounded icosahedral lobes instead.

## Audio

- The whole `AudioEngine` is lazily created on first user gesture (`init()` from a
  menu click). Every public method no-ops before init — never assume `ctx` exists.
- `setEngine(0, false)` intentionally retains an idle hum. Docking must call
  `silenceEngine()` and return from the current playing tick immediately, or the
  later per-frame engine update reintroduces the loop under the Trade screen.

## Resource UI

- Multi-crystal veins must not anchor their hint to whichever crystal wins the
  aim test this frame. `InteractionTargeting` returns the owning body; Game uses
  its ore-point centroid and `HudProjector` applies exponential screen-space
  damping keyed by that body.
- Ore preview and contact targeting must compete by the same camera-space angle.
  Unconditionally clearing a distant/civilian contact whenever any vein is inside
  the broad cone recreates the “merchant under crosshair, mining hint shown” bug.
  Close combat always wins; otherwise the more centred candidate wins. Ore remains
  informational: no `Targeting.current`, lead pip, convergence, or missile lock.
- DOM holdings use `ResourceIcons.ts` inline SVGs and a fixed icon/label/count
  grid. Keep counts right-aligned with explicit right padding; a flex row lets
  labels and hover highlights shift as values change.

## Misc

- The static file server in tests must derive MIME type from the **resolved file
  path**, not the URL path — `/` maps to `index.html` but `extname('/')` is `''` and
  Chromium downloads instead of navigating (this happened).
- `three` npm package has no bundled types; `@types/three` minor version should
  match `three`'s.
- Playwright resolves from the importing file's location — test scripts must live
  inside the project tree, not in a temp dir.
