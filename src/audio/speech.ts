// Web Speech API client-side robotic voice synthesis
export class RobotVoice {
  private synth: SpeechSynthesis | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private lastSpokenText = '';
  private lastSpokenTime = 0;
  public enabled = true;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      const pickVoice = () => {
        const voices = this.synth?.getVoices() || [];
        this.voice =
          voices.find((v) => v.name.toLowerCase().includes('google') && v.lang.startsWith('en')) ||
          voices.find((v) => v.name.toLowerCase().includes('daniel') || v.name.toLowerCase().includes('alex')) ||
          voices.find((v) => v.lang.startsWith('en')) ||
          voices[0] ||
          null;
      };
      pickVoice();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = pickVoice;
      }
    }
  }

  public speak(text: string, priority = false) {
    if (!this.enabled || !this.synth) return;

    // Prevent identical speech within 3 seconds
    const now = performance.now();
    if (text === this.lastSpokenText && now - this.lastSpokenTime < 3000) return;

    this.lastSpokenText = text;
    this.lastSpokenTime = now;

    try {
      if (priority) {
        this.synth.cancel();
      }
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.pitch = 0.42;  // Deep, authoritative robotic pitch
      u.rate = 1.05;   // Cold calculated cadence
      u.volume = 0.9;
      this.synth.speak(u);
    } catch {
      // Ignored
    }
  }

  public cancel() {
    if (this.synth) {
      this.synth.cancel();
    }
  }
}

