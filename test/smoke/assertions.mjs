export function collectSmokeFailures(results) {
  const failures = [];
  const {
    errors,
    hangarPreferences,
    mobile,
    hangar,
    world,
    targeting,
    capitalSystems,
    runtime,
  } = results;
  const {
    hangarAlignment,
    disconnected,
    missileGate,
    civilianTargeting,
    craftingScroll,
    veinPrompt,
  } = hangar;
  const { peace, quest, trade, planet, planetB, jumpStart, postJump } = world;
  const {
    targetingPolicy,
    enemyWeaponVariety,
    missileSetup,
    missileImminent,
    missileCountdown,
    cloakMissileBreak,
    playerSeekerRange,
  } = targeting;
  const { closed, camDist, turretAim, dev, combatStability, aegisMissiles } = runtime;
  const { defaults, settled, clicked, reloaded } = hangarPreferences;

  if (!mobile.passed) failures.push('mobile controls and touch hangar');

  if (errors.length > 0) failures.push('browser errors');
  if (
    defaults.ship !== 'kestrel' ||
    defaults.playerShip !== 'kestrel' ||
    defaults.selectedCard !== 'KV-7 Kestrel' ||
    defaults.shipCookie !== null ||
    defaults.difficulty !== 'veteran' ||
    defaults.difficultyCookie !== null ||
    defaults.cookieWrites !== 0 ||
    settled.ship !== 'vanta' ||
    settled.playerShip !== 'vanta' ||
    settled.selectedCard !== 'SX-2 Vanta' ||
    settled.shipCookie !== 'vanta' ||
    settled.difficulty !== 'rookie' ||
    settled.difficultyCookie !== 'rookie' ||
    settled.cookieWrites !== 0 ||
    settled.shipWrites !== 0 ||
    clicked.ship !== 'kestrel' ||
    clicked.playerShip !== 'kestrel' ||
    clicked.selectedCard !== 'KV-7 Kestrel' ||
    clicked.shipCookie !== 'kestrel' ||
    clicked.cookieWrites !== 1 ||
    clicked.shipWrites !== 1 ||
    reloaded.ship !== 'kestrel' ||
    reloaded.playerShip !== 'kestrel' ||
    reloaded.selectedCard !== 'KV-7 Kestrel' ||
    reloaded.shipCookie !== 'kestrel' ||
    reloaded.cookieWrites !== 0 ||
    reloaded.shipWrites !== 0
  ) failures.push('hangar preference lifecycle');
  if (disconnected.length > 0) failures.push('ship connectivity');
  if (hangarAlignment.delta > 2) failures.push('hangar fullscreen alignment');
  if (
    missileGate.crafted ||
    missileGate.bought ||
    !missileGate.unchanged ||
    !missileGate.craftUi.disabled ||
    missileGate.craftUi.label !== 'No rack' ||
    !missileGate.tradeUi.disabled ||
    missileGate.tradeUi.label !== 'No rack'
  ) failures.push('missile rack gate');
  if (
    !civilianTargeting.staged ||
    !civilianTargeting.selectedMerchant ||
    !civilianTargeting.sensorThroughClutter ||
    !civilianTargeting.informational ||
    !civilianTargeting.friendlyStyle ||
    !civilianTargeting.wireframe ||
    !civilianTargeting.leadHidden ||
    civilianTargeting.centeredDistance <= civilianTargeting.nearbyDistance ||
    !civilianTargeting.clearedOnFocusLoss ||
    !civilianTargeting.reticleHidden ||
    !civilianTargeting.noFade ||
    !civilianTargeting.detail.includes('Friendly') ||
    !civilianTargeting.detail.includes('Merchant')
  ) failures.push('civilian targeting');
  if (
    !craftingScroll.crafted ||
    craftingScroll.before <= 0 ||
    Math.abs(craftingScroll.after - craftingScroll.before) > 1 ||
    craftingScroll.iconLayout.holdSvgs < 4 ||
    craftingScroll.iconLayout.costSvgs < 3 ||
    craftingScroll.iconLayout.labelSpread > 1 ||
    craftingScroll.iconLayout.countSpread > 1 ||
    craftingScroll.iconLayout.minRightInset < 10
  ) failures.push('crafting layout and scroll');
  if (
    !veinPrompt.found ||
    veinPrompt.aimed !== 'vein' ||
    !veinPrompt.anchored ||
    !veinPrompt.stableCentroid ||
    veinPrompt.delta > 1 ||
    !veinPrompt.eased ||
    !veinPrompt.didNotSnap ||
    !veinPrompt.previewVisible ||
    !veinPrompt.previewName.includes('Vein') ||
    !veinPrompt.resourceColorMatched ||
    !veinPrompt.resourcePaletteMatched ||
    !veinPrompt.informational ||
    !veinPrompt.closeEnemyPriority
  ) failures.push('vein prompt and preview');

  if (
    peace.enemies !== 0 ||
    peace.turrets !== 0 ||
    peace.capital ||
    peace.neutrals < 2 ||
    peace.flux < 2 ||
    !peace.planetsClear
  ) failures.push('peaceful opening sector');
  if (!quest.hailed || !quest.offered || !quest.accepted || quest.active !== 1) {
    failures.push('contract flow');
  }
  if (
    !trade.merchant ||
    !trade.docked ||
    !trade.traded ||
    trade.fluxGained !== 1 ||
    trade.engineSilenced !== 1 ||
    !trade.promptAnchored ||
    !trade.promptText.includes('trade') ||
    trade.iconLayout.holdSvgs < 5 ||
    trade.iconLayout.offerSvgs < 2 ||
    trade.iconLayout.fluxOrbits < 2 ||
    trade.iconLayout.labelSpread > 1 ||
    trade.iconLayout.countSpread > 1 ||
    trade.iconLayout.rightInset < 10 ||
    trade.iconLayout.headerDelta > 1
  ) failures.push('merchant flow and layout');
  if (
    !planet.onPlanet ||
    planet.garrison < 4 ||
    planet.stashes < 3 ||
    planet.caveTunnels < 2 ||
    !planet.caveCentersClear ||
    !planet.planetPrompt.anchored ||
    !planet.planetPrompt.text.includes('Land') ||
    !planet.cavePassagesClear ||
    !planet.caveGuardsClear ||
    planet.caveShellCount < 100 ||
    !planet.caveWallsClosed ||
    planet.terrainSurfaceError > 0.01 ||
    planet.rockLobes < 10 ||
    planet.malformedRockLobes > 0 ||
    planet.collisionProbe.idleDamage > 0.01 ||
    planet.collisionProbe.impactDamage < 5 ||
    planet.minHostile <= 200 ||
    !planet.onSurface ||
    !planet.level ||
    !planet.jumpLayout.singleLine ||
    !planet.jumpLayout.text.includes('Lift') ||
    !planet.surfaceTurretsClear
  ) failures.push('planet generation and collision');
  if (
    !planetB.turretDamaged ||
    !planetB.allSurfaceTurretsDamageable ||
    !planetB.lockedNear ||
    !planetB.backInSpace ||
    !planetB.orbitFacesMajority ||
    !planetB.persisted ||
    !planetB.revisit.sameSurface ||
    !planetB.revisit.harvested ||
    planetB.revisit.garrison !== 0
  ) failures.push('planet combat and revisit persistence');
  if (!jumpStart.started || !jumpStart.fluxHud) failures.push('jump start');
  if (
    postJump.sector !== 2 ||
    postJump.enemies === 0 ||
    !postJump.capital ||
    !postJump.entrySafe ||
    postJump.safeDist < 700 ||
    postJump.pursuers !== 0 ||
    postJump.missileWarning ||
    !postJump.facesMajority ||
    postJump.caveTurretCount < 2 ||
    !postJump.spaceTurretsClear
  ) failures.push('safe hostile-sector entry');

  if (
    !targetingPolicy.staged ||
    !targetingPolicy.farSelectedCentred ||
    !targetingPolicy.farGrey ||
    !targetingPolicy.unlimitedScanSelectedCentred ||
    !targetingPolicy.unpursuedSelectedCentred ||
    !targetingPolicy.unpursuedTurretSelected ||
    !targetingPolicy.pursuedSelectedCloser ||
    !targetingPolicy.nearRed ||
    !targetingPolicy.peaceSelectedCentredContact ||
    !targetingPolicy.combatPreservesHostilePriority
  ) failures.push('targeting policy');
  if (
    !enemyWeaponVariety.seekerAt1050m ||
    !enemyWeaponVariety.rotaryShip ||
    !enemyWeaponVariety.rotaryBattery
  ) failures.push('enemy weapon variety');
  if (
    !missileSetup.homing ||
    !missileSetup.fast ||
    missileSetup.enemySeekerDamage !== 56 ||
    missileSetup.playerSeekerDamage !== 68 ||
    !missileSetup.locked ||
    !missileSetup.tracksInFlightOnly ||
    !missileSetup.warning ||
    !missileImminent.imminent ||
    !missileImminent.warning ||
    !missileCountdown.nonIncreasing ||
    !missileCountdown.missedTimerRemoved ||
    !cloakMissileBreak.activated ||
    !cloakMissileBreak.unlocked ||
    !cloakMissileBreak.targetDropped
  ) failures.push('missile behavior and warning');
  if (
    !playerSeekerRange.staged ||
    playerSeekerRange.maxDistance !== 1050 ||
    !playerSeekerRange.beyondExpired ||
    !playerSeekerRange.withinHit
  ) failures.push('player seeker range');
  if (
    !capitalSystems.present ||
    capitalSystems.mounts < 8 ||
    capitalSystems.top < 4 ||
    capitalSystems.bottom < 4 ||
    !capitalSystems.weapons.includes('bolt') ||
    !capitalSystems.weapons.includes('autogun') ||
    !capitalSystems.weapons.includes('homing') ||
    !capitalSystems.weapons.includes('fast') ||
    !capitalSystems.farMountsHidden ||
    !capitalSystems.farHullAvailable ||
    !capitalSystems.farTargetsHull ||
    !capitalSystems.farPreviewHull ||
    !capitalSystems.farPreviewHostileOutline ||
    !capitalSystems.farPreviewHealthColor ||
    capitalSystems.farPreviewVisiblePixels < 100 ||
    capitalSystems.farPreviewPixelWidth < 24 ||
    capitalSystems.farPreviewPixelHeight < 24 ||
    capitalSystems.previewHullBreadthRatio < 0.15 ||
    !capitalSystems.nearMountsAvailable ||
    !capitalSystems.nearMountLock ||
    !capitalSystems.weightedMountDamage ||
    capitalSystems.batteryHullDamage <= 0 ||
    !capitalSystems.topLineOfSight ||
    !capitalSystems.bottomOccluded ||
    capitalSystems.topShots < 1 ||
    capitalSystems.bottomShots !== 0 ||
    !capitalSystems.rejectedFromSide ||
    !capitalSystems.rejectedBeyondActivation ||
    !capitalSystems.startedInFront ||
    !capitalSystems.committedWithinArc ||
    capitalSystems.beamFired !== 1 ||
    !capitalSystems.firstObstacleDestroyed ||
    !capitalSystems.secondObstacleSurvived ||
    !capitalSystems.playerProtected
  ) failures.push('capital systems');

  if (closed <= 20) failures.push('hunter engagement');
  if (camDist >= 60) failures.push('chase camera');
  if (turretAim.dot <= 0.85) failures.push('turret overhead aim');
  if (
    !dev.cloakRefused ||
    !dev.craftRefused ||
    !dev.craftUnchanged ||
    !dev.craftThreatUi.disabled ||
    dev.craftThreatUi.label !== 'Threat close' ||
    !dev.craftThreatUi.warning.includes('crafting locked') ||
    !dev.cloakOk ||
    !dev.cloaked ||
    dev.energyAfter >= dev.energyBefore - 1 ||
    dev.hullOpacity > 0.06 ||
    dev.shellOpacity < 0.1 ||
    !dev.empOk ||
    !dev.nanoHotkey ||
    !dev.nanoOk ||
    !dev.healed
  ) failures.push('devices and threat craft lock');
  if (
    combatStability.contextLost ||
    combatStability.peakHunters !== 12 ||
    combatStability.overflowSpawned !== 0 ||
    combatStability.peakProjectiles < 300 ||
    combatStability.peakProjectiles > 320 ||
    combatStability.peakAudio > combatStability.audioLimit ||
    combatStability.contactPool > 50 ||
    combatStability.final.sceneChildren !== combatStability.baseline.sceneChildren ||
    combatStability.final.geometries > combatStability.baseline.geometries + 2 ||
    combatStability.final.textures > combatStability.baseline.textures
  ) failures.push('dense combat stability');
  if (
    aegisMissiles.initial !== 16 ||
    !aegisMissiles.kestrelRegenDisabled ||
    aegisMissiles.beforeTenSeconds !== 0 ||
    aegisMissiles.afterTenSeconds !== 1 ||
    aegisMissiles.interval !== 10
  ) failures.push('Aegis seeker loadout and regeneration');

  return failures;
}
