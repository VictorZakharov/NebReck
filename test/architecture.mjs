import { readFileSync } from 'node:fs';

const limits = new Map([
  ['src/game/Game.ts', 400],
  ['src/game/GameFoundation.ts', 700],
  ['src/game/GameScreens.ts', 500],
  ['src/game/GameInteractions.ts', 500],
  ['src/game/GameRuntime.ts', 600],
  ['src/game/GameCombat.ts', 600],
  ['src/game/GameWorldFlow.ts', 700],
  ['src/game/TutorialDirector.ts', 550],
  ['src/game/TutorialScenario.ts', 460],
  ['src/game/TutorialFlightCourse.ts', 60],
  ['src/game/TutorialHost.ts', 80],
  ['src/game/TutorialSurfaceMission.ts', 100],
  ['src/game/TutorialCombat.ts', 100],
  ['src/game/TutorialStealthDrills.ts', 120],
  ['src/game/NavigationSystem.ts', 100],
  ['src/game/TutorialControlGates.ts', 60],
  ['src/game/TutorialInputTransitions.ts', 60],
  ['src/game/TutorialTransitions.ts', 100],
  ['src/game/DamageFeedback.ts', 110],
  ['src/rendering/ChaseCamera.ts', 190],
  ['src/fx/ExplosionSystem.ts', 420],
  ['src/fx/ExplosionVolumes.ts', 430],
  ['src/fx/VolumetricSmoke.ts', 300],
  ['src/fx/ShipDebris.ts', 190],
  ['src/fx/ShipDebrisSources.ts', 80],
  ['src/game/TestScenes.ts', 120],
  ['src/game/test-scenes/TestSceneShared.ts', 60],
  ['src/game/test-scenes/UiTestScenes.ts', 120],
  ['src/game/test-scenes/MobileTestScenes.ts', 100],
  ['src/core/Input.ts', 330],
  ['src/core/DesktopFlightCapture.ts', 140],
  ['src/rendering/AdaptiveResolution.ts', 180],
  ['src/rendering/StaticMeshBatching.ts', 100],
  ['src/world/FogBanks.ts', 160],
  ['src/ui/TouchControls.ts', 260],
  ['src/ui/TutorialOverlay.ts', 170],
  ['src/game/test-scenes/CombatTestScenes.ts', 240],
  ['src/game/test-scenes/TargetingTestScenes.ts', 160],
  ['src/game/test-scenes/FxTestScenes.ts', 100],
  ['src/game/test-scenes/AsteroidImpactTestScene.ts', 60],
  ['src/game/test-scenes/DebrisTestScenes.ts', 60],
  ['src/game/test-scenes/WorldTestScenes.ts', 280],
  ['test/smoke.mjs', 100],
  ['test/smoke/desktop-input.mjs', 100],
  ['test/smoke/browser-capture-mock.mjs', 80],
  ['test/performance.mjs', 100],
  ['test/smoke/helpers.mjs', 120],
  ['test/smoke/hangar.mjs', 400],
  ['test/smoke/tutorial.mjs', 260],
  ['test/smoke/tutorial-assertions.mjs', 80],
  ['test/smoke/tutorial-flight.mjs', 130],
  ['test/smoke/tutorial-systems.mjs', 130],
  ['test/smoke/tutorial-survival.mjs', 130],
  ['test/smoke/tutorial-world.mjs', 130],
  ['test/smoke/tutorial-surface.mjs', 150],
  ['test/smoke/tutorial-travel.mjs', 120],
  ['test/smoke/preferences.mjs', 120],
  ['test/smoke/performance.mjs', 80],
  ['test/smoke/world.mjs', 560],
  ['test/smoke/targeting.mjs', 460],
  ['test/smoke/capital.mjs', 360],
  ['test/smoke/runtime.mjs', 300],
  ['test/smoke/mobile.mjs', 260],
  ['test/smoke/mobile-layout.mjs', 140],
  ['test/smoke/fx.mjs', 120],
  ['test/smoke/asteroid-impact.mjs', 100],
  ['test/smoke/projectile-damage.mjs', 150],
  ['test/smoke/debris.mjs', 160],
  ['test/smoke/assertions.mjs', 320],
]);

let failed = false;
for (const [path, limit] of limits) {
  const source = readFileSync(path, 'utf8');
  const lines = source.endsWith('\n')
    ? source.slice(0, -1).split(/\r?\n/).length
    : source.split(/\r?\n/).length;
  const status = lines <= limit ? 'ok' : 'TOO LARGE';
  console.log(`${status.padEnd(9)} ${path}: ${lines}/${limit} lines`);
  if (lines > limit) failed = true;
}

if (failed) {
  console.error(
    '\nModule size budget exceeded. Extract a focused responsibility instead of growing an orchestrator or scenario monolith.',
  );
  process.exitCode = 1;
}
