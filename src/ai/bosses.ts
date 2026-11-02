import { BossId, BossProfile } from '../types';

export const BOSS_ROSTER: Record<BossId, BossProfile> = {
  VECTOR: {
    id: 'VECTOR',
    name: 'MK-I VECTOR',
    title: 'The Baseline Sentinel',
    speed: 1100,
    reactionMs: 120,
    paddleRadius: 34,
    color: '#00f0ff',
    glowColor: '#00f0ff',
    signature: 'Disciplined linear trajectory calculations',
    introQuote: 'INITIATING COMBAT CALIBRATION.',
    victoryQuote: 'OUTCOME WITHIN PREDICTED TOLERANCE.',
    defeatQuote: 'CALIBRATION ERROR DETECTED.',
    unlocked: true,
    defeated: false,
  },
  VIPER: {
    id: 'VIPER',
    name: 'MK-II VIPER',
    title: 'The Curve Trickster',
    speed: 1250,
    reactionMs: 100,
    paddleRadius: 32,
    color: '#00ff88',
    glowColor: '#00ff88',
    signature: 'Vicious Magnus spin & razor-sharp bank cuts',
    introQuote: 'TRY TO COMPUTE A CURVE, HUMAN.',
    victoryQuote: 'GEOMETRIC SUPREMACY CONFIRMED.',
    defeatQuote: 'TRAJECTORY ANOMALY: UNACCEPTABLE.',
    unlocked: false,
    defeated: false,
  },
  TITAN: {
    id: 'TITAN',
    name: 'MK-III TITAN',
    title: 'The Heavy Juggernaut',
    speed: 920,
    reactionMs: 140,
    paddleRadius: 44, // Huge paddle!
    color: '#ffaa00',
    glowColor: '#ffaa00',
    signature: 'Massive paddle armor & 2,200 px/s kinetic smashes',
    introQuote: 'CRUSHING IMPACT IMMINENT.',
    victoryQuote: 'PULVERIZED BY SUPERIOR FORCE.',
    defeatQuote: 'CORE IMPACT EXCEEDED DENSITY THRESHOLD.',
    unlocked: false,
    defeated: false,
  },
  PHANTOM: {
    id: 'PHANTOM',
    name: 'MK-IV PHANTOM',
    title: 'The Speed Demon',
    speed: 1550,
    reactionMs: 75,
    paddleRadius: 32,
    color: '#b5179e',
    glowColor: '#b5179e',
    signature: 'Decoy laser reticles & hyper-velocity dashes',
    introQuote: 'YOU ARE TRACKING A GHOST.',
    victoryQuote: 'TOO SLOW FOR THE SPEED OF LIGHT.',
    defeatQuote: 'FREQUENCY DESYNCHRONIZED.',
    unlocked: false,
    defeated: false,
  },
  APEX: {
    id: 'APEX',
    name: 'MK-V APEX PRIME',
    title: 'The Grandmaster Overclock',
    speed: 1650,
    reactionMs: 65,
    paddleRadius: 36,
    color: '#ff0033',
    glowColor: '#ffd166',
    signature: 'Permanent 5.5 GHz Redline & Counter-Parry Reflexes',
    introQuote: 'I AM THE PEAK OF MACHINE EVOLUTION.',
    victoryQuote: 'EXTINCTION IS A MATHEMATICAL CERTAINTY.',
    defeatQuote: 'IMPOSSIBLE... SYSTEM COLLAPSE.',
    unlocked: false,
    defeated: false,
  },
};

const BOSS_SAVE_KEY = 'overclock_boss_progress_v2';

export class BossManager {
  public bosses: Record<BossId, BossProfile>;
  public currentBossId: BossId = 'VECTOR';

  constructor() {
    this.bosses = JSON.parse(JSON.stringify(BOSS_ROSTER));
    this.loadProgress();
  }

  public loadProgress() {
    try {
      const raw = localStorage.getItem(BOSS_SAVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { id: BossId; unlocked: boolean; defeated: boolean }[];
        saved.forEach((s) => {
          if (this.bosses[s.id]) {
            this.bosses[s.id].unlocked = s.unlocked;
            this.bosses[s.id].defeated = s.defeated;
          }
        });
      }
    } catch {
      // Default initial state
    }
    // Always ensure VECTOR is unlocked
    this.bosses.VECTOR.unlocked = true;
  }

  public saveProgress() {
    try {
      const data = Object.values(this.bosses).map((b) => ({
        id: b.id,
        unlocked: b.unlocked,
        defeated: b.defeated,
      }));
      localStorage.setItem(BOSS_SAVE_KEY, JSON.stringify(data));
    } catch {
      // Ignored
    }
  }

  public getCurrentBoss(): BossProfile {
    return this.bosses[this.currentBossId] || this.bosses.VECTOR;
  }

  public selectBoss(id: BossId): boolean {
    if (this.bosses[id] && this.bosses[id].unlocked) {
      this.currentBossId = id;
      return true;
    }
    return false;
  }

  public getNextBossId(currentId: BossId): BossId | null {
    const ladder: BossId[] = ['VECTOR', 'VIPER', 'TITAN', 'PHANTOM', 'APEX'];
    const idx = ladder.indexOf(currentId);
    if (idx >= 0 && idx < ladder.length - 1) {
      return ladder[idx + 1];
    }
    return null;
  }

  public recordDefeat(id: BossId) {
    if (this.bosses[id]) {
      this.bosses[id].defeated = true;
      // Unlock next boss in ladder
      if (id === 'VECTOR') this.bosses.VIPER.unlocked = true;
      if (id === 'VIPER') this.bosses.TITAN.unlocked = true;
      if (id === 'TITAN') this.bosses.PHANTOM.unlocked = true;
      if (id === 'PHANTOM') this.bosses.APEX.unlocked = true;
      this.saveProgress();
    }
  }
}
