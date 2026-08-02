import { advanceGameTime } from './helpers.mjs';

export async function setTutorialKey(page, code, down) {
  await page.evaluate(({ key, held }) => window.game.input.setVirtualKey(key, held), {
    key: code,
    held: down,
  });
}

export async function setTutorialButton(page, button, down) {
  await page.evaluate(({ id, held }) => window.game.input.setVirtualButton(id, held), {
    id: button,
    held: down,
  });
}

/** Hold Lyra's current line until player input explicitly cancels it. */
export async function holdTutorialNarration(page) {
  await page.evaluate(() => {
    const voice = window.game.voice;
    window.__tutorialNarrationHeld = true;
    window.__tutorialNarrationCancels = 0;
    window.__tutorialVoiceOriginals = {
      speakGuide: voice.speakGuide.bind(voice),
      cancel: voice.cancel.bind(voice),
    };
    voice.speakGuide = (text) => {
      window.__tutorialVoiceOriginals.speakGuide(text);
      window.__tutorialNarrationHeld = true;
    };
    voice.cancel = () => {
      window.__tutorialVoiceOriginals.cancel();
      window.__tutorialNarrationHeld = false;
      window.__tutorialNarrationCancels++;
    };
    Object.defineProperty(voice, 'guideSpeaking', {
      configurable: true,
      get: () => window.__tutorialNarrationHeld,
    });
  });
}

/** Restore the real voice implementation and report explicit interruptions. */
export async function releaseTutorialNarration(page) {
  return page.evaluate(() => {
    const voice = window.game.voice;
    const cancellations = window.__tutorialNarrationCancels ?? 0;
    const originals = window.__tutorialVoiceOriginals;
    window.__tutorialNarrationHeld = false;
    delete voice.guideSpeaking;
    if (originals) {
      voice.speakGuide = originals.speakGuide;
      voice.cancel = originals.cancel;
    }
    delete window.__tutorialVoiceOriginals;
    delete window.__tutorialNarrationCancels;
    delete window.__tutorialNarrationHeld;
    return cancellations;
  });
}

export async function touchGate(page, relevant, disabled) {
  return page.evaluate(({ active, blocked }) => {
    const on = document.querySelector(active);
    const off = document.querySelector(blocked);
    return on?.classList.contains('tutorial-relevant') === true &&
      off?.classList.contains('tutorial-disabled') === true;
  }, { active: relevant, blocked: disabled });
}

export async function tutorialRouteBlocked(page) {
  return page.evaluate(() => {
    const game = window.game;
    const route = game.navigation.current?.position.clone().sub(game.player.position);
    return !!route && game.world.bodies.some((body) => {
      if (body.destroyed) return false;
      const along = Math.max(0, Math.min(1,
        body.position.clone().sub(game.player.position).dot(route) / route.lengthSq()));
      return game.player.position.clone().addScaledVector(route, along)
        .distanceTo(body.position) < body.radius;
    });
  });
}

/** Selecting a contact is latched, but ordinary camera motion never cuts LYRA off. */
export async function selectTutorialTargetDuringNarration(page) {
  await holdTutorialNarration(page);
  await page.evaluate(() => {
    const game = window.game;
    const target = game.enemies.find((enemy) => enemy.training);
    if (target) {
      game.player.faceToward(target.position);
      game.chaseCam.snapTo(game.player.object);
    }
    game.input.setVirtualLook(0.25, 0);
  });
  await advanceGameTime(page, 0.2);
  const selected = await page.evaluate(() => {
    window.game.input.setVirtualLook(0, 0);
    const target = window.game.enemies.find((enemy) => enemy.training);
    return window.game.targeting.current?.ship === target;
  });
  const interruptions = await releaseTutorialNarration(page);
  const held = await page.evaluate(() =>
    window.game.tutorial.stepId === 'target' && !window.game.tutorial.awaitingAction);
  await advanceGameTime(page, 0.05);
  const review = await page.evaluate(() =>
    window.game.tutorial.stepId === 'target' && window.game.tutorial.awaitingAction);
  return { selected, held, review, interruptions };
}
