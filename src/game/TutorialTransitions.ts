import { Input, InputControlGate } from '../core/Input';
import { TutorialStepId } from './TutorialCards';
import { tutorialControlGate } from './TutorialControlGates';

export type TutorialAdvanceKind =
  | 'boost' | 'look' | 'primary' | 'seeker' | 'repair' | 'cloak'
  | 'close' | 'use' | 'jump' | 'move' | 'skyward' | 'craft' | 'trade';

export interface TutorialAdvance {
  kind: TutorialAdvanceKind;
  objective: string;
  controls: string[];
  gate: InputControlGate;
}

/** The next real game action that releases a completed lesson's simulation hold. */
export function tutorialReviewAdvance(id: TutorialStepId, touch: boolean): TutorialAdvance | null {
  const key = (desktop: string, mobile: string): string => touch ? mobile : desktop;
  switch (id) {
    case 'flight': return action('boost', 'When ready, accelerate and engage Boost.', [key('W + Shift', 'Move + Boost')], 'boost');
    case 'target': return action('primary', 'When ready, fire the primary weapon at the selected contact.', [key('Left mouse', 'Fire')], 'guns');
    case 'guns': return action('seeker', 'When ready, launch a seeker at the selected contact.', [key('Right mouse', 'Seek')], 'seekers');
    case 'repair': return action('move', 'When ready, strafe to begin the seeker-evasion drill.', [key('A or D', 'Move stick')], 'missile-dodge');
    case 'missile-dodge': return action('look', 'Turn toward the marked sentry to begin cloak infiltration.', [key('Mouse', 'Aim stick')], 'cloak');
    case 'cloak': return { kind: 'primary', objective: 'When ready, fire once to break cloak.',
      controls: [key('F · Left mouse', 'Cloak · Fire')], gate: { ...tutorialControlGate('cloak'), buttons: [0] } };
    case 'emp': return {
      kind: 'primary',
      objective: 'Try EMP again, or fire when ready to begin salvage.',
      controls: [key('G · Left mouse', 'EMP · Fire')],
      gate: { keys: ['KeyG'], buttons: [0] },
    };
    case 'mine': return action('close', 'When ready, open Engineering.', [key('Tab', 'Load')], 'loadout-open');
    case 'loadout-open': return action('craft', 'Inspect the recipes, then craft any available item.', [key('Click a recipe', 'Tap a recipe')], 'craft');
    case 'craft': return action('close', 'When ready, close Engineering and return to flight.', [key('Tab or Esc', 'Close')], 'loadout-close');
    case 'loadout-close': return action('use', 'When ready, dock with the marked merchant.', [key('R', 'Use')], 'trade-open');
    case 'trade-open': return action('trade', 'Inspect the offers, then complete any available trade.', [key('Click buy or sell', 'Tap buy or sell')], 'trade');
    case 'trade': return action('close', 'When ready, undock and return to flight.', [key('R or Esc', 'Close')], 'trade-close');
    case 'trade-close': return action('jump', 'When ready, hold the jump control while aiming at the marked planet.', [key('Hold J', 'Hold Jump')], 'planet');
    case 'planet': return action('move', 'When ready, use the flight controls to begin the surface survey.', [key('Flight controls', 'Move stick')], 'surface-flight');
    case 'surface-flight': return action('jump', 'When ready, hold the jump control to lift off.', [key('Hold J', 'Hold Jump')], 'lift');
    case 'surface-stash': return {
      kind: 'skyward',
      objective: 'Collect the released salvage, then point the ship clearly skyward.',
      controls: [key('Aim skyward', 'Aim stick up')],
      gate: {
        move: true, look: true,
        keys: ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ControlLeft', 'ShiftLeft'],
      },
    };
    case 'lift': return action('jump', 'When ready, hold the jump control along the clear jump vector.', [key('Hold J', 'Hold Jump')], 'jump');
    default: return null;
  }
}

/** Natural input that advances an instructional card whose staged effect is already frozen. */
export function tutorialHeldAdvance(id: TutorialStepId, touch: boolean): TutorialAdvance | null {
  if (id !== 'hull') return null;
  return action(
    'repair',
    'When ready, activate the issued Nanobot Kit to repair the hull.',
    [touch ? 'Repair' : 'H'],
    'repair',
  );
}

export function tutorialAdvanceTriggered(advance: TutorialAdvance, input: Input, forwardY = 0): boolean {
  switch (advance.kind) {
    case 'boost':
      return input.isDown('ShiftLeft') &&
        (input.isDown('KeyW') || input.flightAxis('thrust') > 0.15);
    case 'look': return input.hasLookIntent();
    case 'primary': return input.isButtonDown(0);
    case 'seeker': return input.isButtonDown(2);
    case 'repair': return input.isDown('KeyH');
    case 'cloak': return input.isDown('KeyF');
    case 'close':
      return input.isDown('Tab') || input.isDown('KeyR') || input.isDown('Escape');
    case 'use': return input.isDown('KeyR');
    case 'jump': return input.isDown('KeyJ');
    case 'move':
      return ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ControlLeft']
        .some((code) => input.isDown(code)) ||
        ['thrust', 'strafeX', 'strafeY'].some((axis) =>
          Math.abs(input.flightAxis(axis as 'thrust' | 'strafeX' | 'strafeY')) > 0.15,
        );
    case 'skyward': return forwardY > 0.52;
    case 'craft': case 'trade': return false;
  }
}

function action(
  kind: TutorialAdvanceKind,
  objective: string,
  controls: string[],
  next: TutorialStepId,
): TutorialAdvance {
  return { kind, objective, controls, gate: tutorialControlGate(next) };
}
