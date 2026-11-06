// Web Audio API procedural sound engine with Overclocked Arcade audio synthesis
import { GameSettings } from '../types';
import { RobotVoice } from './speech';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  public voice = new RobotVoice();

  public settings: GameSettings = {
    soundEnabled: true,
    musicEnabled: true,
    masterVolume: 0.8,
    sfxVolume: 0.9,
    musicVolume: 0.5,
    reduceMotion: false,
    vibration: true,
    showPredictionLine: true,
    curveShots: true,
    multiPuckOverload: false,
    batterySaver: false,
    difficulty: 'NORMAL',
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
    } catch (e) {
      console.warn('Web Audio not supported or blocked:', e);
    }
  }

  public resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public suspend() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
  }

  public updateSettings(settings: Partial<GameSettings>) {
    this.settings = { ...this.settings, ...settings };
    if (!this.masterGain || !this.sfxGain || !this.musicGain) return;

    this.masterGain.gain.value = this.settings.soundEnabled ? this.settings.masterVolume : 0;
    this.sfxGain.gain.value = this.settings.sfxVolume;
    this.musicGain.gain.value = this.settings.musicEnabled ? this.settings.musicVolume : 0;
  }

  // Lightweight continuous sound stubs (continuous audio loops removed to guarantee 0% background CPU and eliminate lag on mobile)
  public updatePuckHum(_puckSpeed: number, _clockSpeedGHz = 1.0) {}
  public updateRobotServo(_robotSpeed: number, _isRedline = false) {}
  public setTensionLevel(_level: number, _clockSpeedGHz = 1.0) {}
  public startMusic() {}
  public stopMusic() {}
  public updateMusicClock(_clockSpeedGHz: number) {}
  public silenceContinuousSounds() {}
  public speak(_text: string, _priority = false) {}

  // --- Fast Event-Driven Sound Effects ---

  public playPaddleHit(speed: number, isHyper = false) {
    if (!this.ctx || !this.sfxGain || !this.settings.soundEnabled) return;
    this.triggerHaptic(15);
    const t = this.ctx.currentTime;
    const norm = Math.min(1, Math.max(0.1, speed / 2200));

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = isHyper ? 'sawtooth' : 'sine';
    const startFreq = isHyper ? 400 + norm * 400 : 160 + norm * 260;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.14);

    gain.gain.setValueAtTime((0.25 + norm * 0.45) * (isHyper ? 1.3 : 1.0), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.15);

    // Mechanical snap
    const snapOsc = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snapOsc.type = 'square';
    snapOsc.frequency.setValueAtTime(600 + norm * 600, t);
    snapGain.gain.setValueAtTime(0.1 + norm * 0.15, t);
    snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    snapOsc.connect(snapGain);
    snapGain.connect(this.sfxGain);

    snapOsc.start(t);
    snapOsc.stop(t + 0.06);
  }

  // PERFECT PARRY SOUND: Sub bass drop + resonant crystal harmonic chime
  public playParry() {
    if (!this.ctx || !this.sfxGain || !this.settings.soundEnabled) return;
    this.triggerHaptic([30, 50, 40]);
    const t = this.ctx.currentTime;

    // Sub-bass impact drop
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(140, t);
    subOsc.frequency.exponentialRampToValueAtTime(30, t + 0.28);
    subGain.gain.setValueAtTime(0.6, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    subOsc.connect(subGain);
    subGain.connect(this.sfxGain);
    subOsc.start(t);
    subOsc.stop(t + 0.29);

    // Resonant counter chime
    [880, 1320, 1760].forEach((freq) => {
      const chimeOsc = this.ctx!.createOscillator();
      const chimeGain = this.ctx!.createGain();
      chimeOsc.type = 'triangle';
      chimeOsc.frequency.setValueAtTime(freq, t);
      chimeGain.gain.setValueAtTime(0.2, t);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      chimeOsc.connect(chimeGain);
      chimeGain.connect(this.sfxGain!);
      chimeOsc.start(t);
      chimeOsc.stop(t + 0.36);
    });
  }

  // ARENA BUMPER HIT: Pinball electro-pop
  public playBumper() {
    if (!this.ctx || !this.sfxGain || !this.settings.soundEnabled) return;
    this.triggerHaptic(25);
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, t); // D5
    osc.frequency.exponentialRampToValueAtTime(293.66, t + 0.15);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.16);
  }

  // RAILGUN SMASH: High-tech laser charging crackle & blast
  public playRailgun() {
    if (!this.ctx || !this.sfxGain || !this.settings.soundEnabled) return;
    this.triggerHaptic([50, 30, 80]);
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.4);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.42);
  }

  // ROBOT CHATTER VOCODER CHIRP: Procedural robotic syllables
  public playRobotSpeech() {
    if (!this.ctx || !this.sfxGain || !this.settings.soundEnabled) return;
    const t = this.ctx.currentTime;
    const syllables = 3;
    for (let i = 0; i < syllables; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      const f = 280 + Math.random() * 320;
      osc.frequency.setValueAtTime(f, t + i * 0.05);

      gain.gain.setValueAtTime(0.08, t + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.04);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t + i * 0.05);
      osc.stop(t + i * 0.05 + 0.045);
    }
  }

  public playWallTick(speed: number) {
    if (!this.ctx || !this.sfxGain || !this.settings.soundEnabled) return;
    this.triggerHaptic(8);
    const t = this.ctx.currentTime;
    const norm = Math.min(1, Math.max(0.1, speed / 2200));

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450 + norm * 400, t);
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

        gain.gain.setValueAtTime(0.14, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain!);

        osc.start(t);
        osc.stop(t + 0.95);
      });
    } else {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.linearRampToValueAtTime(75, t + 0.8);

      gain.gain.setValueAtTime(0.35, t);
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
    const freq = num === 0 ? 880 : 440;
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

    gain.gain.setValueAtTime(0.2, t);
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
