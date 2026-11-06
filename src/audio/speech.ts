// Web Speech API client-side robotic voice synthesis (Disabled by default to prevent audio jank on mobile)
export class RobotVoice {
  private synth: SpeechSynthesis | null = null;
  public enabled = false;

  constructor() {
    // Disabled to eliminate audio lag and main-thread interruptions on mobile devices
  }

  public speak(_text: string, _priority = false) {
    // No-op to keep gameplay silky smooth with zero thread blocking
  }

  public cancel() {
    if (this.synth) {
      try { this.synth.cancel(); } catch {}
    }
  }
}

