// Hidden rubber-banding Difficulty Director.
// Aims for player to win roughly 20-30% of games with most losses within 1-2 points.

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class DifficultyDirector {
  public skill: number;
  public gamesPlayed = 0;

  constructor(startSkill = 0.35) {
    this.skill = startSkill;
  }

  // Call after every point scored
  onPoint(playerScored: boolean, playerScore: number, robotScore: number) {
    const lead = robotScore - playerScore;
    if (playerScored) {
      // Robot tightens up when player scores
      this.skill += 0.04;
    } else {
      // Ease off if the robot leads to keep losses close (pulling score to 7-5 or 7-6)
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
    this.skill = clamp(this.skill, 0.15, 0.95);
  }

  // Call after each game finishes
  onGameEnd(playerWon: boolean) {
    this.gamesPlayed++;
    // First 2 matches are capped at skill 0.4 so players can scrape early wins
    if (this.gamesPlayed <= 2) {
      this.skill = Math.min(this.skill, 0.4);
    } else {
      this.skill += playerWon ? 0.05 : -0.025;
    }
    this.skill = clamp(this.skill, 0.15, 0.95);
  }

  getRobotModelName(): string {
    if (this.skill < 0.3) return 'MK-I PROTO';
    if (this.skill < 0.5) return 'MK-II VECTOR';
    if (this.skill < 0.7) return 'MK-III SENTINEL';
    if (this.skill < 0.85) return 'MK-IV OVERCLOCK';
    return 'MK-V APEX';
  }
}
