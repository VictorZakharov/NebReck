import { readFileSync } from 'node:fs';

const limits = new Map([
  ['src/game/Game.ts', 400],
  ['src/game/GameFoundation.ts', 700],
  ['src/game/GameScreens.ts', 500],
  ['src/game/GameInteractions.ts', 500],
  ['src/game/GameRuntime.ts', 600],
  ['src/game/GameCombat.ts', 600],
  ['src/game/GameWorldFlow.ts', 700],
  ['src/game/TestScenes.ts', 120],
  ['src/game/test-scenes/TestSceneShared.ts', 60],
  ['src/game/test-scenes/UiTestScenes.ts', 120],
  ['src/game/test-scenes/CombatTestScenes.ts', 240],
  ['src/game/test-scenes/TargetingTestScenes.ts', 160],
  ['src/game/test-scenes/WorldTestScenes.ts', 280],
  ['test/smoke.mjs', 100],
  ['test/smoke/helpers.mjs', 120],
  ['test/smoke/hangar.mjs', 400],
  ['test/smoke/preferences.mjs', 120],
  ['test/smoke/world.mjs', 560],
  ['test/smoke/targeting.mjs', 460],
  ['test/smoke/capital.mjs', 360],
  ['test/smoke/runtime.mjs', 300],
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
