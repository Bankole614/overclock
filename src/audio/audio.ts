// Web Audio API procedural sound engine with Overclocked Arcade audio synthesis
import { GameSettings } from '../types';
import { RobotVoice } from './speech';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  public voice = new RobotVoice();

  // Procedural Music Engine
  private musicTimer: number | null = null;
  private musicStep = 0;
  private currentClockSpeed = 1.0;
  private isMusicPlaying = false;

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
    curveShots: true,
    multiPuckOverload: true,
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

  public updatePuckHum(puckSpeed: number, clockSpeedGHz = 1.0) {
    if (!this.ctx || !this.humOsc || !this.humGain || !this.settings.soundEnabled) return;
    const norm = Math.min(1, Math.max(0, puckSpeed / 2400));
    const targetFreq = (70 + norm * 150) * (0.8 + clockSpeedGHz * 0.2);
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

  public updateRobotServo(robotSpeed: number, isRedline = false) {
    if (!this.ctx || !this.servoOsc || !this.servoGain || !this.settings.soundEnabled) return;
    const norm = Math.min(1, Math.max(0, robotSpeed / 1600));
    const mult = isRedline ? 1.5 : 1.0;
    const targetFreq = (300 + norm * 800) * mult;
    const targetGain = norm > 0.05 ? norm * (isRedline ? 0.07 : 0.04) : 0.0001;

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
      this.tensionOsc1.frequency.setValueAtTime(55, this.ctx.currentTime);

      this.tensionOsc2 = this.ctx.createOscillator();
      this.tensionOsc2.type = 'sawtooth';
      this.tensionOsc2.frequency.setValueAtTime(55.6, this.ctx.currentTime);

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

  public setTensionLevel(level: number, clockSpeedGHz = 1.0) {
    if (!this.ctx || !this.tensionGain || !this.tensionFilter) return;
    const t = this.ctx.currentTime;
    if (level <= 0 || !this.settings.musicEnabled) {
      this.tensionGain.gain.setTargetAtTime(0.0001, t, 0.2);
    } else {
      const clockMult = Math.min(2.0, 0.8 + clockSpeedGHz * 0.25);
      this.tensionGain.gain.setTargetAtTime(0.14 * level, t, 0.2);
      this.tensionFilter.frequency.setTargetAtTime((120 + level * 350) * clockMult, t, 0.25);
    }
  }

  // --- Procedural Cyberpunk Synth Music Engine ---
  public startMusic() {
    if (!this.settings.musicEnabled || this.isMusicPlaying) return;
    this.isMusicPlaying = true;
    this.musicStep = 0;
    this.scheduleNextMusicBeat();
  }

  public stopMusic() {
    this.isMusicPlaying = false;
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  public updateMusicClock(clockSpeedGHz: number) {
    this.currentClockSpeed = clockSpeedGHz;
  }

  private scheduleNextMusicBeat() {
    if (!this.isMusicPlaying || !this.ctx || !this.musicGain || !this.settings.musicEnabled) return;

    // Tempo scales from 124 BPM to 142 BPM with overclocking
    const bpm = 124 + Math.min(18, (this.currentClockSpeed - 1.0) * 6);
    const stepDuration = 60 / bpm / 4; // 16th note

    this.playMusicStep(this.musicStep, this.ctx.currentTime);
    this.musicStep = (this.musicStep + 1) % 16;

    this.musicTimer = window.setTimeout(() => {
      this.scheduleNextMusicBeat();
    }, stepDuration * 1000);
  }

  private playMusicStep(step: number, t: number) {
    if (!this.ctx || !this.musicGain || !this.settings.musicEnabled) return;

    // Bassline in D minor (D2: 73.4Hz, F2: 87.3Hz, G2: 98Hz, A2: 110Hz, C3: 130.8Hz)
    const bassNotes = [73.4, 73.4, 73.4, 87.3, 73.4, 73.4, 98.0, 110.0, 73.4, 73.4, 73.4, 87.3, 98.0, 110.0, 130.8, 110.0];
    const arpNotes = [293.7, 349.2, 440.0, 523.3, 587.3, 440.0, 349.2, 440.0, 293.7, 349.2, 440.0, 523.3, 659.3, 523.3, 440.0, 349.2];

    const cutoff = 450 + (this.currentClockSpeed - 1.0) * 400;

    // 1. Synth Bass
    if (step % 2 === 0) {
      const bOsc = this.ctx.createOscillator();
      const bGain = this.ctx.createGain();
      const bFilter = this.ctx.createBiquadFilter();

      bOsc.type = 'sawtooth';
      bOsc.frequency.setValueAtTime(bassNotes[step], t);

      bFilter.type = 'lowpass';
      bFilter.frequency.setValueAtTime(cutoff, t);
      bFilter.Q.setValueAtTime(4, t);

      bGain.gain.setValueAtTime(0.09, t);
      bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      bOsc.connect(bFilter);
      bFilter.connect(bGain);
      bGain.connect(this.musicGain);

      bOsc.start(t);
      bOsc.stop(t + 0.13);
    }

    // 2. High Cyber Arpeggio (8th note pattern)
    if (step % 2 === 1) {
      const aOsc = this.ctx.createOscillator();
      const aGain = this.ctx.createGain();
      const aFilter = this.ctx.createBiquadFilter();

      aOsc.type = 'square';
      aOsc.frequency.setValueAtTime(arpNotes[step], t);

      aFilter.type = 'bandpass';
      aFilter.frequency.setValueAtTime(cutoff * 1.5, t);
      aFilter.Q.setValueAtTime(2.5, t);

      aGain.gain.setValueAtTime(0.035, t);
      aGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

      aOsc.connect(aFilter);
      aFilter.connect(aGain);
      aGain.connect(this.musicGain);

      aOsc.start(t);
      aOsc.stop(t + 0.1);
    }

    // 3. Cyber Kick on beats 0, 4, 8, 12
    if (step % 4 === 0) {
      const kOsc = this.ctx.createOscillator();
      const kGain = this.ctx.createGain();
      kOsc.type = 'sine';
      kOsc.frequency.setValueAtTime(140, t);
      kOsc.frequency.exponentialRampToValueAtTime(40, t + 0.08);

      kGain.gain.setValueAtTime(0.12, t);
      kGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

      kOsc.connect(kGain);
      kGain.connect(this.musicGain);

      kOsc.start(t);
      kOsc.stop(t + 0.1);
    }
  }

  /**
   * Immediately silence in-game ambient sounds when returning to menus
   */
  public silenceContinuousSounds() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.humGain) this.humGain.gain.setValueAtTime(0.0001, t);
    if (this.servoGain) this.servoGain.gain.setValueAtTime(0.0001, t);
    if (this.tensionGain) this.tensionGain.gain.setValueAtTime(0.0001, t);
    this.stopMusic();
  }

  public speak(text: string, priority = false) {
    if (this.settings.soundEnabled) {
      this.voice.speak(text, priority);
    }
  }

  // --- Sound Effects ---

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
