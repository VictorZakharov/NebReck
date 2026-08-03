import { InputControlGate } from '../core/Input';
import { TutorialStepId } from './TutorialCards';

const freeFlightKeys = [
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ControlLeft', 'ShiftLeft',
];

export function tutorialControlGate(id: TutorialStepId): InputControlGate {
  switch (id) {
    case 'welcome': return { keys: ['Enter', 'NumpadEnter'] };
    case 'flight':
      return { move: true, keys: freeFlightKeys };
    case 'boost': return { move: true, keys: ['KeyW', 'ShiftLeft'] };
    case 'target': return { look: true };
    case 'guns': return { look: true, buttons: [0] };
    case 'seekers': return { look: true, buttons: [2] };
    case 'missile-dodge':
      return {
        move: true,
        keys: ['KeyA', 'KeyD', 'Space', 'ControlLeft', 'ShiftLeft'],
      };
    case 'repair': return { keys: ['KeyH'] };
    case 'cloak':
      return {
        move: true, look: true,
        keys: [...freeFlightKeys, 'KeyF'],
      };
    case 'cloak-break': return { move: true, look: true, buttons: [0] };
    case 'emp': return { keys: ['KeyG'] };
    case 'mine': return { look: true, buttons: [0] };
    case 'loadout-open': return { keys: ['Tab'] };
    case 'loadout-close': return { keys: ['Tab', 'Escape'] };
    case 'trade-open': return { keys: ['KeyR'] };
    case 'trade': return { move: true, look: true, keys: [...freeFlightKeys, 'KeyR'] };
    case 'trade-close': return { keys: ['KeyR', 'Escape'] };
    case 'planet': case 'lift': case 'jump': return { keys: ['KeyJ'] };
    case 'surface-flight':
      return { move: true, look: true, keys: freeFlightKeys };
    case 'surface-turret': case 'surface-stash':
      return {
        move: true,
        look: true,
        buttons: [0],
        keys: freeFlightKeys,
      };
    default: return {};
  }
}

/** Controls that stay available while the pilot inspects a live lesson result. */
export function tutorialReviewControlGate(id: TutorialStepId): InputControlGate {
  if (id === 'boost') {
    return { move: true, look: true, keys: freeFlightKeys };
  }
  return { look: true };
}
