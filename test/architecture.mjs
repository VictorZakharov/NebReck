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
  ['src/game/test-scenes/WorldTestScenes.ts', 280],
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
    '\nController size budget exceeded. Extract a focused responsibility instead of growing the orchestrator.',
  );
  process.exitCode = 1;
}
