import { Game } from './Game';
import {
  stageCapitalSuperweapon,
  stageCombat,
  stageEnemyVariety,
  stageMissileWarning,
} from './test-scenes/CombatTestScenes';
import { freezeCssAnimations } from './test-scenes/TestSceneShared';
import {
  stageMobileControls,
  stageMobileHangar,
  stageMobileLoadout,
  stageMobileTrade,
} from './test-scenes/MobileTestScenes';
import {
  stageCapitalTargeting,
  stageDistantTargeting,
  stageFriendlyTargeting,
  stageResourceTargeting,
  stageTargeting,
  stageTurretTargeting,
} from './test-scenes/TargetingTestScenes';
import {
  stageBoost,
  stageCloak,
  stageCockpit,
  stageControls,
  stageHangar,
  stageHud,
  stageLoadout,
  stageMenu,
  stageTrade,
} from './test-scenes/UiTestScenes';
import {
  stageAsteroids,
  stageBase,
  stageCave,
  stageFleet,
  stageFx,
  stageLevel,
  stageNebula,
  stagePlanet,
  stageShip,
  stageSplit,
  stageWreck,
} from './test-scenes/WorldTestScenes';

declare global {
  interface Window {
    __RENDER_DONE__?: boolean;
  }
}

const TEST_SCENES: Readonly<Record<string, (game: Game) => void>> = {
  nebula: stageNebula,
  ship: stageShip,
  asteroids: stageAsteroids,
  combat: stageCombat,
  hud: stageHud,
  menu: stageMenu,
  cockpit: stageCockpit,
  hangar: stageHangar,
  loadout: stageLoadout,
  boost: stageBoost,
  targeting: stageTargeting,
  'distant-targeting': stageDistantTargeting,
  'turret-targeting': stageTurretTargeting,
  'capital-targeting': stageCapitalTargeting,
  'friendly-targeting': stageFriendlyTargeting,
  'resource-targeting': stageResourceTargeting,
  fx: stageFx,
  cave: stageCave,
  split: stageSplit,
  level: stageLevel,
  wreck: stageWreck,
  planet: stagePlanet,
  base: stageBase,
  trade: stageTrade,
  fleet: stageFleet,
  cloak: stageCloak,
  controls: stageControls,
  'mobile-controls': stageMobileControls,
  'mobile-controls-portrait': stageMobileControls,
  'mobile-hangar': stageMobileHangar,
  'mobile-hangar-portrait': stageMobileHangar,
  'mobile-loadout': stageMobileLoadout,
  'mobile-trade': stageMobileTrade,
  'enemy-variety': stageEnemyVariety,
  'missile-warning': stageMissileWarning,
  'capital-superweapon': stageCapitalSuperweapon,
};

/**
 * Stage one deterministic visual-regression scene, advance only fixed manual
 * steps, and raise the completion flag consumed by the capture harness.
 */
export function runTestScene(game: Game, name: string): void {
  const stage = TEST_SCENES[name];
  if (!stage) throw new Error(`Unknown test scene: ${name}`);
  freezeCssAnimations();
  stage(game);
  window.__RENDER_DONE__ = true;
}
