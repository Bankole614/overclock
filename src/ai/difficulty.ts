import { DifficultyLevel } from '../types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class DifficultyDirector {
  public skill: number;
  public gamesPlayed = 0;
  public difficulty: DifficultyLevel = 'NORMAL';

  constructor(startSkill = 0.35, difficulty: DifficultyLevel = 'NORMAL') {
    this.difficulty = difficulty;
    this.skill = difficulty === 'CASUAL' ? 0.22 : difficulty === 'OVERCLOCKED' ? 0.55 : startSkill;
  }

  setDifficulty(level: DifficultyLevel) {
    this.difficulty = level;
    if (level === 'CASUAL') {
      this.skill = Math.min(this.skill, 0.35);
    } else if (level === 'OVERCLOCKED') {
      this.skill = Math.max(this.skill, 0.50);
    }
  }

  // Call after every point scored
  onPoint(playerScored: boolean, playerScore: number, robotScore: number) {
    const lead = robotScore - playerScore;
    const minSkill = this.difficulty === 'CASUAL' ? 0.10 : this.difficulty === 'OVERCLOCKED' ? 0.40 : 0.18;
    const maxSkill = this.difficulty === 'CASUAL' ? 0.45 : this.difficulty === 'OVERCLOCKED' ? 0.95 : 0.65;

    if (playerScored) {
      this.skill += this.difficulty === 'CASUAL' ? 0.02 : 0.04;
    } else {
      if (this.difficulty === 'CASUAL') {
        if (lead >= 2) this.skill -= 0.10;
        else if (lead >= 1) this.skill -= 0.06;
      } else {
        if (lead >= 3) {
          this.skill -= 0.08;
        } else if (lead >= 2) {
          this.skill -= 0.05;
        } else if (lead <= 0) {
          this.skill += 0.015;
        }
        if (robotScore >= 5 && lead >= 2) {
          this.skill -= 0.06;
        }
      }
    }
    this.skill = clamp(this.skill, minSkill, maxSkill);
  }

  // Call after each game finishes
  onGameEnd(playerWon: boolean) {
    this.gamesPlayed++;
    const minSkill = this.difficulty === 'CASUAL' ? 0.10 : this.difficulty === 'OVERCLOCKED' ? 0.40 : 0.18;
    const maxSkill = this.difficulty === 'CASUAL' ? 0.45 : this.difficulty === 'OVERCLOCKED' ? 0.95 : 0.65;

    if (this.gamesPlayed <= 2) {
      this.skill = Math.min(this.skill, this.difficulty === 'CASUAL' ? 0.30 : 0.45);
    } else {
      this.skill += playerWon ? 0.04 : -0.035;
    }
    this.skill = clamp(this.skill, minSkill, maxSkill);
  }

  getRobotModelName(): string {
    if (this.skill < 0.3) return 'MK-I PROTO';
    if (this.skill < 0.5) return 'MK-II VECTOR';
    if (this.skill < 0.7) return 'MK-III SENTINEL';
    if (this.skill < 0.85) return 'MK-IV OVERCLOCK';
    return 'MK-V APEX';
  }
}
