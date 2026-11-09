import { BossId, BossProfile, DifficultyLevel } from '../types';

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

export const BOSS_LADDER: BossId[] = ['VECTOR', 'VIPER', 'TITAN', 'PHANTOM', 'APEX'];

const BOSS_SAVE_KEY_V3 = 'overclock_boss_progress_v3';
const BOSS_SAVE_KEY_V2 = 'overclock_boss_progress_v2';

export type BossDifficultyProgress = Record<BossId, { unlocked: boolean; defeated: boolean }>;
export type AllBossProgress = Record<DifficultyLevel, BossDifficultyProgress>;

export const createDefaultDifficultyProgress = (): BossDifficultyProgress => ({
  VECTOR: { unlocked: true, defeated: false },
  VIPER: { unlocked: false, defeated: false },
  TITAN: { unlocked: false, defeated: false },
  PHANTOM: { unlocked: false, defeated: false },
  APEX: { unlocked: false, defeated: false },
});

export const createDefaultAllProgress = (): AllBossProgress => ({
  CASUAL: createDefaultDifficultyProgress(),
  NORMAL: createDefaultDifficultyProgress(),
  OVERCLOCKED: createDefaultDifficultyProgress(),
});

export class BossManager {
  public currentDifficulty: DifficultyLevel = 'NORMAL';
  public currentBossId: BossId = 'VECTOR';
  private progress: AllBossProgress;

  constructor(difficulty: DifficultyLevel = 'NORMAL') {
    this.currentDifficulty = difficulty;
    this.progress = createDefaultAllProgress();
    this.loadProgress();
    this.validateCurrentBoss();
  }

  public setDifficulty(difficulty: DifficultyLevel) {
    this.currentDifficulty = difficulty;
    this.validateCurrentBoss();
  }

  public validateCurrentBoss() {
    if (!this.bosses[this.currentBossId]?.unlocked) {
      this.currentBossId = 'VECTOR';
    }
  }

  public get bosses(): Record<BossId, BossProfile> {
    return this.getBossesForDifficulty(this.currentDifficulty);
  }

  public getBossesForDifficulty(difficulty: DifficultyLevel): Record<BossId, BossProfile> {
    const diffProgress = this.progress[difficulty] || this.progress.NORMAL || createDefaultDifficultyProgress();
    const result: Record<BossId, BossProfile> = {} as any;
    for (const id of BOSS_LADDER) {
      const p = diffProgress[id];
      result[id] = {
        ...BOSS_ROSTER[id],
        unlocked: id === 'VECTOR' ? true : (p?.unlocked ?? false),
        defeated: p?.defeated ?? false,
      };
    }
    return result;
  }

  public getProgress(): AllBossProgress {
    return JSON.parse(JSON.stringify(this.progress));
  }

  public loadProgress() {
    try {
      const rawV3 = localStorage.getItem(BOSS_SAVE_KEY_V3);
      if (rawV3) {
        const parsed = JSON.parse(rawV3) as Partial<AllBossProgress>;
        const difficulties: DifficultyLevel[] = ['CASUAL', 'NORMAL', 'OVERCLOCKED'];
        for (const diff of difficulties) {
          if (parsed[diff]) {
            for (const id of BOSS_LADDER) {
              if (parsed[diff]![id]) {
                this.progress[diff][id] = {
                  unlocked: id === 'VECTOR' ? true : Boolean(parsed[diff]![id].unlocked),
                  defeated: Boolean(parsed[diff]![id].defeated),
                };
              }
            }
          }
          this.progress[diff].VECTOR.unlocked = true;
        }
        return;
      }

      // Backward compatibility migration from V2 (migrates only to NORMAL difficulty)
      const rawV2 = localStorage.getItem(BOSS_SAVE_KEY_V2);
      if (rawV2) {
        const saved = JSON.parse(rawV2) as { id: BossId; unlocked: boolean; defeated: boolean }[];
        if (Array.isArray(saved)) {
          saved.forEach((s) => {
            if (this.progress.NORMAL[s.id]) {
              this.progress.NORMAL[s.id].unlocked = s.id === 'VECTOR' ? true : Boolean(s.unlocked);
              this.progress.NORMAL[s.id].defeated = Boolean(s.defeated);
            }
          });
          this.saveProgress();
        }
      }
    } catch {
      // Default initial state
    }

    this.progress.CASUAL.VECTOR.unlocked = true;
    this.progress.NORMAL.VECTOR.unlocked = true;
    this.progress.OVERCLOCKED.VECTOR.unlocked = true;
  }

  public saveProgress() {
    try {
      localStorage.setItem(BOSS_SAVE_KEY_V3, JSON.stringify(this.progress));
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
    const idx = BOSS_LADDER.indexOf(currentId);
    if (idx >= 0 && idx < BOSS_LADDER.length - 1) {
      return BOSS_LADDER[idx + 1];
    }
    return null;
  }

  public recordDefeat(id: BossId, difficulty?: DifficultyLevel) {
    const diff = difficulty || this.currentDifficulty;
    const diffProgress = this.progress[diff];
    if (!diffProgress || !diffProgress[id]) return;

    diffProgress[id].defeated = true;
    const nextId = this.getNextBossId(id);
    if (nextId && diffProgress[nextId]) {
      diffProgress[nextId].unlocked = true;
    }
    this.saveProgress();
  }

  public isBossUnlocked(id: BossId, difficulty?: DifficultyLevel): boolean {
    const diff = difficulty || this.currentDifficulty;
    if (id === 'VECTOR') return true;
    return Boolean(this.progress[diff]?.[id]?.unlocked);
  }

  public isBossDefeated(id: BossId, difficulty?: DifficultyLevel): boolean {
    const diff = difficulty || this.currentDifficulty;
    return Boolean(this.progress[diff]?.[id]?.defeated);
  }
}
