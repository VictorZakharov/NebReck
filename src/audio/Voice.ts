/**
 * Browser-native voice-over. It works offline and degrades to silence where
 * speech synthesis is unavailable.
 */
export class Voice {
  private available = typeof window !== 'undefined' && 'speechSynthesis' in window;
  private guideToken = 0;
  private guideActive = false;
  private guideWatchdog: number | null = null;
  /** Headless runs mute here because OS speech is outside the browser tab. */
  muted = false;

  speak(text: string): void {
    this.play(text, 1.05, 0.85);
  }

  /** Calm flight-instructor narration, preferring an installed female voice. */
  speakGuide(text: string): void {
    this.play(text, 0.98, 1.08, true);
  }

  /** True until the current instructor utterance ends or is cancelled. */
  get guideSpeaking(): boolean { return this.guideActive; }

  private play(text: string, rate: number, pitch: number, guide = false): void {
    const token = guide ? ++this.guideToken : this.guideToken;
    if (guide) {
      this.guideActive = false;
      this.clearGuideWatchdog();
    }
    else if (this.guideActive) {
      this.guideToken++;
      this.guideActive = false;
      this.clearGuideWatchdog();
    }
    if (!this.available || this.muted) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = 0.9;
      if (guide) {
        utterance.voice = preferredGuideVoice(window.speechSynthesis.getVoices());
        this.guideActive = true;
        const finish = (): void => {
          if (token !== this.guideToken) return;
          this.guideActive = false;
          this.clearGuideWatchdog();
        };
        utterance.onend = finish;
        utterance.onerror = finish;
        const words = text.trim().split(/\s+/).filter(Boolean).length;
        this.guideWatchdog = window.setTimeout(finish, Math.max(10_000, words * 650));
      }
      window.speechSynthesis.speak(utterance);
    } catch {
      if (guide && token === this.guideToken) {
        this.guideActive = false;
        this.clearGuideWatchdog();
      }
    }
  }

  cancel(): void {
    this.guideToken++;
    this.guideActive = false;
    this.clearGuideWatchdog();
    if (!this.available) return;
    try {
      window.speechSynthesis.cancel();
    } catch { /* ignore */ }
  }

  private clearGuideWatchdog(): void {
    if (this.guideWatchdog === null) return;
    window.clearTimeout(this.guideWatchdog);
    this.guideWatchdog = null;
  }
}

function preferredGuideVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const preferred = /aria|ava|fiona|jenny|karen|libby|moira|samantha|sonia|susan|tessa|victoria|zira|female/i;
  return voices.find((voice) => preferred.test(voice.name)) ??
    voices.find((voice) => /^en([-_]|$)/i.test(voice.lang)) ??
    voices[0] ?? null;
}
