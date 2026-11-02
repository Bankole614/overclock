// Web Audio API procedural sound engine - zero external sound assets needed.
import { GameSettings } from '../types';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  // Continuous sound nodes
  private humOsc: OscillatorNode | null = null;
  private humGain: GainNode | null = null;

  private servoOsc: OscillatorNode | null = null;
  private servoGain: GainNode | null = null;

  // Music tension drone
  private tensionOsc1: OscillatorNode | null = null;
  private tensionOsc2: OscillatorNode | null = null;
  private tensionFilter: BiquadFilterNode | null = null;
  private tensionGain: GainNode | null = null;

  public settings: GameSettings = {
    soundEnabled: true,
    musicEnabled: true,
    masterVolume: 0.8,
    sfxVolume: 0.9,
    musicVolume: 0.5,
    reduceMotion: false,
    vibration: true,
    showPredictionLine: true,
  };

  constructor(settings?: Partial<GameSettings>) {
    if (settings) {
      this.settings = { ...this.settings, ...settings };
    }
  }

  public init() {
    if (this.ctx) return;
    try {
      const AudioCtxClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      // Master bus
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.settings.soundEnabled ? this.settings.masterVolume : 0;
      this.masterGain.connect(this.ctx.destination);

      // SFX bus
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.settings.sfxVolume;
      this.sfxGain.connect(this.masterGain);

      // Music bus
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.settings.musicEnabled ? this.settings.musicVolume : 0;
      this.musicGain.connect(this.masterGain);

      this.initContinuousHum();
      this.initServoWhine();
      this.initTensionDrone();
    } catch (e) {
      console.warn('Web Audio not supported or blocked:', e);
    }
  }

  public resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public updateSettings(settings: Partial<GameSettings>) {
    this.settings = { ...this.settings, ...settings };
    if (!this.masterGain || !this.sfxGain || !this.musicGain) return;

    this.masterGain.gain.value = this.settings.soundEnabled ? this.settings.masterVolume : 0;
    this.sfxGain.gain.value = this.settings.sfxVolume;
    this.musicGain.gain.value = this.settings.musicEnabled ? this.settings.musicVolume : 0;
  }

  // --- Puck Air Cushion Hum ---
  private initContinuousHum() {
    if (!this.ctx || !this.sfxGain) return;
    try {
      this.humOsc = this.ctx.createOscillator();
      this.humOsc.type = 'triangle';
      this.humOsc.frequency.setValueAtTime(80, this.ctx.currentTime);

      this.humGain = this.ctx.createGain();
      this.humGain.gain.setValueAtTime(0.001, this.ctx.currentTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(250, this.ctx.currentTime);

      this.humOsc.connect(filter);
      filter.connect(this.humGain);
      this.humGain.connect(this.sfxGain);

      this.humOsc.start();
    } catch {
      // Ignored
    }
  }

  public updatePuckHum(puckSpeed: number) {
    if (!this.ctx || !this.humOsc || !this.humGain || !this.settings.soundEnabled) return;
    const norm = Math.min(1, Math.max(0, puckSpeed / 1800));
    const targetFreq = 70 + norm * 140;
    const targetGain = 0.02 + norm * 0.08;

    const t = this.ctx.currentTime;
    this.humOsc.frequency.setTargetAtTime(targetFreq, t, 0.05);
    this.humGain.gain.setTargetAtTime(targetGain, t, 0.05);
  }

  // --- Robot Servo Whine ---
  private initServoWhine() {
    if (!this.ctx || !this.sfxGain) return;
    try {
      this.servoOsc = this.ctx.createOscillator();
      this.servoOsc.type = 'sawtooth';
      this.servoOsc.frequency.setValueAtTime(300, this.ctx.currentTime);

      this.servoGain = this.ctx.createGain();
      this.servoGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, this.ctx.currentTime);
      filter.Q.setValueAtTime(3, this.ctx.currentTime);

      this.servoOsc.connect(filter);
      filter.connect(this.servoGain);
      this.servoGain.connect(this.sfxGain);

      this.servoOsc.start();
    } catch {
      // Ignored
    }
  }

  public updateRobotServo(robotSpeed: number) {
    if (!this.ctx || !this.servoOsc || !this.servoGain || !this.settings.soundEnabled) return;
    const norm = Math.min(1, Math.max(0, robotSpeed / 1400));
    const targetFreq = 300 + norm * 700;
    const targetGain = norm > 0.05 ? norm * 0.04 : 0.0001;

    const t = this.ctx.currentTime;
    this.servoOsc.frequency.setTargetAtTime(targetFreq, t, 0.04);
    this.servoGain.gain.setTargetAtTime(targetGain, t, 0.04);
  }

  // --- Tension Drone ---
  private initTensionDrone() {
    if (!this.ctx || !this.musicGain) return;
    try {
      this.tensionGain = this.ctx.createGain();
      this.tensionGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

      this.tensionFilter = this.ctx.createBiquadFilter();
      this.tensionFilter.type = 'lowpass';
      this.tensionFilter.frequency.setValueAtTime(150, this.ctx.currentTime);

      this.tensionOsc1 = this.ctx.createOscillator();
      this.tensionOsc1.type = 'sawtooth';
      this.tensionOsc1.frequency.setValueAtTime(55, this.ctx.currentTime); // A1

      this.tensionOsc2 = this.ctx.createOscillator();
      this.tensionOsc2.type = 'sawtooth';
      this.tensionOsc2.frequency.setValueAtTime(55.6, this.ctx.currentTime); // detuned

      this.tensionOsc1.connect(this.tensionFilter);
      this.tensionOsc2.connect(this.tensionFilter);
      this.tensionFilter.connect(this.tensionGain);
      this.tensionGain.connect(this.musicGain);

      this.tensionOsc1.start();
      this.tensionOsc2.start();
    } catch {
      // Ignored
    }
  }

  public setTensionLevel(level: number) {
    // level: 0 (calm) to 1 (match point max tension)
    if (!this.ctx || !this.tensionGain || !this.tensionFilter) return;
    const t = this.ctx.currentTime;
    if (level <= 0 || !this.settings.musicEnabled) {
      this.tensionGain.gain.setTargetAtTime(0.0001, t, 0.2);
    } else {
      this.tensionGain.gain.setTargetAtTime(0.12 * level, t, 0.2);
      this.tensionFilter.frequency.setTargetAtTime(120 + level * 350, t, 0.3);
    }
  }

  // --- Sound Effects ---

  public playPaddleHit(speed: number) {
    if (!this.ctx || !this.sfxGain || !this.settings.soundEnabled) return;
    this.triggerHaptic(15);
    const t = this.ctx.currentTime;
    const norm = Math.min(1, Math.max(0.1, speed / 1800));

    // Punchy transient thud
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const startFreq = 160 + norm * 240;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);

    gain.gain.setValueAtTime(0.2 + norm * 0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.13);

    // Mechanical snap/click layer
    const snapOsc = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snapOsc.type = 'square';
    snapOsc.frequency.setValueAtTime(600 + norm * 500, t);
    snapGain.gain.setValueAtTime(0.08 + norm * 0.15, t);
    snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    snapOsc.connect(snapGain);
    snapGain.connect(this.sfxGain);

    snapOsc.start(t);
    snapOsc.stop(t + 0.05);
  }

  public playWallTick(speed: number) {
    if (!this.ctx || !this.sfxGain || !this.settings.soundEnabled) return;
    this.triggerHaptic(8);
    const t = this.ctx.currentTime;
    const norm = Math.min(1, Math.max(0.1, speed / 1800));

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450 + norm * 350, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.06);

    gain.gain.setValueAtTime(0.1 + norm * 0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.07);
  }

  public playPostBounce() {
    if (!this.ctx || !this.sfxGain || !this.settings.soundEnabled) return;
    this.triggerHaptic(20);
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(750, t);
    osc.frequency.exponentialRampToValueAtTime(250, t + 0.18);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.19);
  }

  public playGoalHorn(isPlayerScored: boolean) {
    if (!this.ctx || !this.sfxGain || !this.settings.soundEnabled) return;
    this.triggerHaptic([40, 60, 40, 80]);
    const t = this.ctx.currentTime;

    if (isPlayerScored) {
      // Triumphant cyber horn (major triad)
      const freqs = [220, 277.18, 329.63, 440];
      freqs.forEach((f) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, t);

        const filter = this.ctx!.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, t);
        filter.frequency.linearRampToValueAtTime(2400, t + 0.3);

        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain!);

        osc.start(t);
        osc.stop(t + 0.95);
      });
    } else {
      // Low sinister siren / defeat sub blast
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.linearRampToValueAtTime(75, t + 0.8);

      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.9);
    }
  }

  public playCountdown(num: number) {
    if (!this.ctx || !this.sfxGain || !this.settings.soundEnabled) return;
    this.triggerHaptic(10);
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const freq = num === 0 ? 880 : 440; // High beep on GO
    const duration = num === 0 ? 0.3 : 0.12;

    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + duration + 0.01);
  }

  public playGlitchSound() {
    if (!this.ctx || !this.sfxGain || !this.settings.soundEnabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(980, t);
    osc.frequency.setValueAtTime(220, t + 0.04);
    osc.frequency.setValueAtTime(740, t + 0.08);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.17);
  }

  public triggerHaptic(pattern: number | number[]) {
    if (this.settings.vibration && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignored
      }
    }
  }
}
