/**
 * Contract voice-over via the browser's built-in SpeechSynthesis — the hauler
 * captain reads the offer out loud. Zero assets, works offline, degrades to
 * silence where unsupported (headless test runs).
 */
export class Voice {
  private available = typeof window !== 'undefined' && 'speechSynthesis' in window;
  /** Headless/e2e runs mute here — Chromium's --mute-audio does NOT silence
   *  SpeechSynthesis (Windows TTS speaks at the OS level, outside the tab). */
  muted = false;

  speak(text: string): void {
    if (!this.available || this.muted) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 0.85; // gravelly freighter-captain register
      utterance.volume = 0.9;
      window.speechSynthesis.speak(utterance);
    } catch { /* no voices installed — stay silent */ }
  }

  cancel(): void {
    if (!this.available) return;
    try {
      window.speechSynthesis.cancel();
    } catch { /* ignore */ }
  }
}
