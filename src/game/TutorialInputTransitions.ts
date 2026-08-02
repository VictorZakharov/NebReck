import { Input } from '../core/Input';
import { TutorialStepId } from './TutorialCards';

/** Intentional input may interrupt the current briefing without letting scripts do so. */
export function tutorialInstructionActionTriggered(id: TutorialStepId, input: Input): boolean {
  switch (id) {
    case 'welcome':
      return input.wasPressed('Enter') || input.wasPressed('NumpadEnter');
    case 'flight': case 'surface-flight':
      return movementTriggered(input);
    case 'boost':
      return input.isDown('ShiftLeft') &&
        (input.isDown('KeyW') || input.flightAxis('thrust') > 0.15);
    case 'guns': case 'cloak-break': case 'mine':
    case 'surface-turret': case 'surface-stash':
      return input.wasButtonPressed(0);
    case 'seekers':
      return input.wasButtonPressed(2);
    case 'missile-dodge':
      return movementTriggered(input);
    case 'repair':
      return input.wasPressed('KeyH');
    case 'cloak':
      return input.wasPressed('KeyF');
    case 'emp':
      return input.wasPressed('KeyG');
    case 'loadout-open':
      return input.wasPressed('Tab');
    case 'loadout-close':
      return input.wasPressed('Tab') || input.wasPressed('Escape');
    case 'trade-open':
      return input.wasPressed('KeyR');
    case 'trade-close':
      return input.wasPressed('KeyR') || input.wasPressed('Escape');
    case 'planet': case 'lift': case 'jump':
      return input.wasPressed('KeyJ');
    default:
      return false;
  }
}

function movementTriggered(input: Input): boolean {
  return ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ControlLeft']
    .some((code) => input.isDown(code)) ||
    ['thrust', 'strafeX', 'strafeY', 'roll'].some((axis) =>
      Math.abs(input.flightAxis(axis as 'thrust' | 'strafeX' | 'strafeY' | 'roll')) > 0.15,
    );
}
