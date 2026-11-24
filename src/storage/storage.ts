import { DifficultyLevel, GameSettings, LifetimeStats } from '../types';

const SETTINGS_KEY = 'overclock_settings_v2';
const STATS_KEY = 'overclock_stats_v2';
const SKILL_KEY = 'overclock_ai_skill_v2';

export class StorageManager {
  static loadSettings(): GameSettings {
    const defaultSettings: GameSettings = {
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

    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        return { ...defaultSettings, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage:', e);
    }
    return defaultSettings;
  }

  static saveSettings(settings: GameSettings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  static loadStats(): LifetimeStats {
    const defaultStats: LifetimeStats = {
      matchesPlayed: 0,
      matchesWon: 0,
      bestStreak: 0,
      currentStreak: 0,
      fastestWinSeconds: null,
      totalPointsScored: 0,
      totalPointsConceded: 0,
      totalParries: 0,
      bossesDefeated: [],
    };

    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (raw) {
        return { ...defaultStats, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('Failed to load stats:', e);
    }
    return defaultStats;
  }

  static saveStats(stats: LifetimeStats) {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (e) {
      console.warn('Failed to save stats:', e);
    }
  }

  static recordMatch(
    playerWon: boolean,
    playerScore: number,
    robotScore: number,
    durationSec: number,
    parries = 0
  ): LifetimeStats {
    const stats = this.loadStats();
    stats.matchesPlayed++;
    stats.totalPointsScored += playerScore;
    stats.totalPointsConceded += robotScore;
    stats.totalParries += parries;

    if (playerWon) {
      stats.matchesWon++;
      stats.currentStreak++;
      if (stats.currentStreak > stats.bestStreak) {
        stats.bestStreak = stats.currentStreak;
      }
      if (
        stats.fastestWinSeconds === null ||
        durationSec < stats.fastestWinSeconds
      ) {
        stats.fastestWinSeconds = Math.round(durationSec);
      }
    } else {
      stats.currentStreak = 0;
    }

    this.saveStats(stats);
    return stats;
  }

  static loadDirectorSkill(difficulty: DifficultyLevel = 'NORMAL'): number {
    const defaultSkill = difficulty === 'CASUAL' ? 0.22 : difficulty === 'OVERCLOCKED' ? 0.65 : 0.48;
    try {
      const scoped = localStorage.getItem(`${SKILL_KEY}_${difficulty}`);
      if (scoped) {
        const val = parseFloat(scoped);
        if (!isNaN(val) && val >= 0.10 && val <= 0.98) return val;
      }
      if (difficulty === 'NORMAL') {
        const legacy = localStorage.getItem(SKILL_KEY);
        if (legacy) {
          const val = parseFloat(legacy);
          if (!isNaN(val) && val >= 0.15 && val <= 0.95) return val;
        }
      }
    } catch {
      // Ignored
    }
    return defaultSkill;
  }

  static saveDirectorSkill(skill: number, difficulty: DifficultyLevel = 'NORMAL') {
    try {
      localStorage.setItem(`${SKILL_KEY}_${difficulty}`, skill.toFixed(3));
    } catch {
      // Ignored
    }
  }
}
