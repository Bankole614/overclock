import { DifficultyLevel } from '../types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class DifficultyDirector {
  public skill: number;
  public gamesPlayed = 0;
  public difficulty: DifficultyLevel = 'NORMAL';

  constructor(startSkill = 0.48, difficulty: DifficultyLevel = 'NORMAL') {
    this.difficulty = difficulty;
    if (difficulty === 'CASUAL') {
      this.skill = Math.min(startSkill, 0.25);
    } else if (difficulty === 'OVERCLOCKED') {
      this.skill = Math.max(startSkill, 0.65);
    } else {
      this.skill = clamp(startSkill, 0.42, 0.80);
    }
  }

  setDifficulty(level: DifficultyLevel) {
    this.difficulty = level;
    if (level === 'CASUAL') {
      this.skill = clamp(this.skill, 0.12, 0.38);
    } else if (level === 'OVERCLOCKED') {
      this.skill = clamp(this.skill, 0.60, 0.98);
    } else {
      this.skill = clamp(this.skill, 0.40, 0.80);
    }
  }

  // Call after every point scored
  onPoint(playerScored: boolean, playerScore: number, robotScore: number) {
    const lead = robotScore - playerScore;
    const minSkill = this.difficulty === 'CASUAL' ? 0.12 : this.difficulty === 'OVERCLOCKED' ? 0.55 : 0.30;
    const maxSkill = this.difficulty === 'CASUAL' ? 0.45 : this.difficulty === 'OVERCLOCKED' ? 0.98 : 0.80;

    if (playerScored) {
      if (this.difficulty === 'CASUAL') {
        this.skill += 0.025;
      } else {
        const playerLead = playerScore - robotScore;
        this.skill += playerLead >= 2 ? 0.065 : 0.04;
      }
    } else {
      if (this.difficulty === 'CASUAL') {
        if (lead >= 2) this.skill -= 0.09;
        else if (lead >= 1) this.skill -= 0.05;
      } else {
        if (lead >= 3) {
          this.skill -= 0.07;
        } else if (lead >= 2) {
          this.skill -= 0.04;
        } else if (lead <= 0) {
          this.skill += 0.015;
        }
        if (robotScore >= 5 && lead >= 2) {
          this.skill -= 0.05;
        }
      }
    }
    this.skill = clamp(this.skill, minSkill, maxSkill);
  }

  // Call after each game finishes
  onGameEnd(playerWon: boolean) {
    this.gamesPlayed++;
    const minSkill = this.difficulty === 'CASUAL' ? 0.12 : this.difficulty === 'OVERCLOCKED' ? 0.55 : 0.30;
    const maxSkill = this.difficulty === 'CASUAL' ? 0.45 : this.difficulty === 'OVERCLOCKED' ? 0.98 : 0.80;

    if (this.difficulty === 'CASUAL' && this.gamesPlayed <= 2) {
      this.skill = Math.min(this.skill, 0.32);
    } else {
      this.skill += playerWon ? 0.05 : -0.035;
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
