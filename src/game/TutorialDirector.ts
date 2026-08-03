import { Camera, Vector3 } from 'three';
import { Voice } from '../audio/Voice';
import { InputControlGate } from '../core/Input';
import { TutorialCard, TutorialOverlay } from '../ui/TutorialOverlay';
import { tutorialCards, TutorialStepId } from './TutorialCards';
import { tutorialControlGate, tutorialReviewControlGate } from './TutorialControlGates';
import { TutorialHost } from './TutorialHost';
import { tutorialInstructionActionTriggered } from './TutorialInputTransitions';
import { TutorialScenario, TutorialScenarioEvent } from './TutorialScenario';
import {
  tutorialAdvanceTriggered,
  tutorialHeldAdvance,
  tutorialReviewAdvance,
} from './TutorialTransitions';

export type { TutorialStepId } from './TutorialCards';

const continuousSteps = new Set<TutorialStepId>([
  'flight', 'trade-close', 'planet', 'surface-flight', 'surface-turret', 'lift',
]);
const forward = new Vector3();

/** Narrated course orchestration; TutorialScenario owns all staged world state. */
export class TutorialDirector {
  private readonly overlay: TutorialOverlay;
  private readonly scenario: TutorialScenario;
  private cards: TutorialCard[] = [];
  private index = -1;
  private running = false;
  private reviewing = false;
  private maneuverHeld = false;
  private completionPending = false;
  private pendingEvent: TutorialScenarioEvent | null = null;
  private pendingUiAction: 'craft' | 'trade' | null = null;

  constructor(
    parent: HTMLElement,
    private readonly voice: Voice,
    private readonly host: TutorialHost,
  ) {
    this.scenario = new TutorialScenario(host);
    this.overlay = new TutorialOverlay(
      parent,
      () => this.continue(),
      (delta) => this.browse(delta),
      () => host.exitTutorial(),
    );
  }

  start(): void {
    this.stop();
    this.cards = tutorialCards(this.host.touchControlsEnabled);
    this.running = true;
    this.index = -1;
    this.advance();
  }

  stop(): void {
    const wasFrozen = this.frozen;
    this.scenario.reset();
    this.running = false;
    this.reviewing = false;
    this.maneuverHeld = false;
    this.completionPending = false;
    this.pendingEvent = null;
    this.pendingUiAction = null;
    this.index = -1;
    this.overlay.hide();
    this.voice.cancel();
    this.host.setTutorialControls(null);
    this.host.releaseTutorialNavigation();
    if (wasFrozen) this.host.setTutorialFreeze(false);
  }

  continue(): void {
    if (!this.running || !this.canExplicitlyContinue) return;
    this.voice.cancel();
    if (this.stepId === 'complete') {
      this.host.exitTutorial();
      return;
    }
    this.advance();
  }

  browse(delta: number): void {
    if (!this.running || delta === 0) return;
    const index = Math.max(0, Math.min(this.cards.length - 1, this.index + Math.sign(delta)));
    if (index !== this.index) this.goTo(index, false, true);
  }

  update(dt: number, _camera: Camera): void {
    if (!this.running) return;
    if (this.host.input.wasPressed('ArrowLeft')) {
      this.browse(-1);
      return;
    }
    if (this.host.input.wasPressed('ArrowRight')) {
      this.browse(1);
      return;
    }
    const step = this.stepId!;
    if (
      this.canExplicitlyContinue &&
      (this.host.input.wasPressed('Enter') || this.host.input.wasPressed('NumpadEnter'))
    ) {
      this.continue();
      return;
    }
    if (
      !this.reviewing && this.voice.guideSpeaking &&
      tutorialInstructionActionTriggered(step, this.host.input)
    ) this.voice.cancel();
    this.overlay.setSpeaking(this.voice.guideSpeaking);
    const narrationReady = !this.voice.guideSpeaking;
    const scenario = this.scenario.update(step, dt, !this.reviewing, narrationReady);
    if (scenario.event) this.pendingEvent = scenario.event;
    if (this.pendingUiAction && narrationReady) {
      const action = this.pendingUiAction;
      this.pendingUiAction = null;
      this.advance();
      if (action === 'craft') this.scenario.setCraftDone();
      else this.scenario.setTradeDone();
      this.voice.cancel();
      return;
    }
    if (this.pendingEvent && narrationReady) {
      const event = this.pendingEvent;
      this.pendingEvent = null;
      this.handleScenarioEvent(event);
      return;
    }
    if (this.reviewing) {
      const advance = this.reviewAdvance;
      if (advance && tutorialAdvanceTriggered(
        advance, this.host.input, this.host.player.forward(forward).y,
      )) {
        this.voice.cancel();
        // R already docks/undocks in this frame; carrying its edge would toggle back next frame.
        this.advance(step !== 'loadout-close' && step !== 'trade');
      }
      return;
    }
    if (scenario.complete) this.completionPending = true;
    if (!this.completionPending || !narrationReady) return;
    this.completionPending = false;
    if (continuousSteps.has(step)) this.advance();
    else this.enterReview();
  }

  protectPlayer(): void {
    if (this.running) this.scenario.protectPlayer();
  }

  notifyCraft(): void {
    if (this.stepId === 'loadout-open') {
      this.voice.cancel();
      this.pendingUiAction = 'craft';
    } else if (this.stepId === 'craft') {
      this.voice.cancel();
      this.scenario.setCraftDone();
    }
  }

  notifyTrade(): void {
    if (this.stepId === 'trade-open') {
      this.voice.cancel();
      this.pendingUiAction = 'trade';
    } else if (this.stepId === 'trade') {
      this.voice.cancel();
      this.scenario.setTradeDone();
    }
  }

  /** Deterministic visual-harness hook. */
  stageForTest(id: TutorialStepId): void {
    if (!this.running) this.start();
    const index = this.cards.findIndex((card) => card.id === id);
    if (index < 0) throw new Error(`Unknown tutorial step: ${id}`);
    this.goTo(index, false, true);
  }

  get active(): boolean { return this.running; }
  get frozen(): boolean {
    return this.running && this.index >= 0 &&
      ((this.reviewing && !this.card.liveReview) || this.card.frozen === true);
  }
  get maneuverHold(): boolean { return this.running && this.maneuverHeld; }
  get awaitingAction(): boolean { return this.reviewing; }
  get stepId(): TutorialStepId | null {
    return this.index >= 0 ? this.cards[this.index].id as TutorialStepId : null;
  }

  private get card(): TutorialCard {
    return this.cards[Math.max(0, this.index)];
  }

  private get reviewAdvance() {
    const step = this.stepId!;
    return tutorialReviewAdvance(step, this.host.touchControlsEnabled) ??
      tutorialHeldAdvance(step, this.host.touchControlsEnabled);
  }

  private get canExplicitlyContinue(): boolean {
    return this.reviewing ? !this.reviewAdvance : !!this.card.continueLabel;
  }

  private advance(preserveHeld = false): void {
    this.goTo(Math.min(this.cards.length - 1, this.index + 1), preserveHeld);
  }

  private goTo(index: number, preserveHeld = false, restage = false): void {
    if (restage) this.scenario.reset();
    this.reviewing = false;
    this.maneuverHeld = false;
    this.completionPending = false;
    this.pendingEvent = null;
    this.pendingUiAction = null;
    this.index = index;
    const card = this.card;
    const step = card.id as TutorialStepId;
    this.scenario.prepare(step, restage);
    this.scenario.enter(step);
    this.host.setTutorialNavigation(this.scenario.navigation(step));
    this.overlay.show(card, index, this.cards.length);
    this.narrate(card.narration);
    this.stageControls(tutorialControlGate(step), preserveHeld);
    this.host.setTutorialFreeze(this.frozen);
  }

  private enterReview(preserveHeld = true): void {
    if (this.reviewing) return;
    const card = this.card;
    this.reviewing = true;
    const review = card.review;
    const advance = this.reviewAdvance;
    const held = !card.liveReview;
    const view: TutorialCard = {
      ...card,
      narration: review?.narration ?? `${card.title} complete.`,
      objective: review?.objective ?? advance?.objective ?? 'Continue when ready.',
      controls: advance?.controls ?? [this.host.touchControlsEnabled ? 'Tap button' : 'Enter'],
      frozen: held,
      continueLabel: advance ? undefined : review?.continueLabel ?? 'Continue',
    };
    this.overlay.show(view, this.index, this.cards.length, true);
    this.narrate(view.narration);
    this.stageControls(
      advance?.gate ?? (card.liveReview ? tutorialReviewControlGate(this.stepId!) : {}),
      preserveHeld,
    );
    this.host.setTutorialFreeze(held);
  }

  private handleScenarioEvent(event: TutorialScenarioEvent): void {
    const touch = this.host.touchControlsEnabled;
    if (event === 'dodge-assist') {
      this.maneuverHeld = true;
      const view: TutorialCard = {
        ...this.card,
        narration: 'Time held. The seeker is committed to this approach. Slide clear of its path before I release it.',
        objective: 'Strafe sideways or vertically until the evasion vector clears.',
        controls: [touch ? 'Move stick / Up / Down' : 'A / D / Space / Ctrl'],
        frozen: true,
      };
      this.overlay.show(view, this.index, this.cards.length);
      this.narrate(view.narration);
      this.stageControls(tutorialControlGate('missile-dodge'));
      return;
    }
    this.maneuverHeld = false;
    const clean = event === 'dodge-clean';
    const view: TutorialCard = {
      ...this.card,
      narration: clean
        ? 'Clean evade. The seeker is passing clear.'
        : 'Vector clear. Releasing time; the seeker will miss.',
      objective: 'Watch the seeker pass clear.',
      controls: [],
    };
    this.overlay.show(view, this.index, this.cards.length);
    this.narrate(view.narration);
    this.stageControls({});
  }

  private stageControls(gate: InputControlGate, preserveHeld = false): void {
    const controls = withSystemKeys(gate, this.canExplicitlyContinue);
    this.overlay.setContinueEnabled(this.canExplicitlyContinue);
    this.host.setTutorialControls(controls, preserveHeld);
  }

  private narrate(text: string): void {
    this.voice.speakGuide(text);
    this.overlay.setSpeaking(this.voice.guideSpeaking);
  }
}

function withSystemKeys(gate: InputControlGate, enter: boolean): InputControlGate {
  return {
    ...gate,
    keys: [...new Set([
      ...(gate.keys ?? []), 'Escape', 'ArrowLeft', 'ArrowRight',
      ...(enter ? ['Enter', 'NumpadEnter'] : []),
    ])],
  };
}
