import { MatchStats } from '../types';

export class MatchTracker {
  public stats: MatchStats;
  private currentRallyHits = 0;
  private lastHitWasRebound = false;

  constructor() {
    this.stats = this.createEmptyStats();
  }

  private createEmptyStats(): MatchStats {
    return {
      durationSeconds: 0,
      playerScore: 0,
      robotScore: 0,
      maxPuckSpeed: 0,
      totalHits: 0,
      playerHits: 0,
      robotHits: 0,
      overcommitGoals: 0,
      reboundGoals: 0,
      crossTableGoals: 0,
      ralliesOver5Hits: 0,
      winner: null,
    };
  }

  public reset() {
    this.stats = this.createEmptyStats();
    this.currentRallyHits = 0;
    this.lastHitWasRebound = false;
  }

  public onPuckSpeed(speed: number) {
    if (speed > this.stats.maxPuckSpeed) {
      this.stats.maxPuckSpeed = Math.round(speed);
    }
  }

  public onHit(hitter: 'player' | 'robot') {
    this.stats.totalHits++;
    this.currentRallyHits++;
    if (hitter === 'player') {
      this.stats.playerHits++;
    } else {
      this.stats.robotHits++;
    }
    this.lastHitWasRebound = false;
  }

  public onWallBounce() {
    this.lastHitWasRebound = true;
  }

  public onGoalScored(
    scorer: 'player' | 'robot',
    robotWasOvercommitted: boolean,
    crossTableAngle: boolean
  ) {
    if (scorer === 'player') {
      this.stats.playerScore++;
      if (robotWasOvercommitted) {
        this.stats.overcommitGoals++;
      }
      if (this.lastHitWasRebound) {
        this.stats.reboundGoals++;
      }
      if (crossTableAngle) {
        this.stats.crossTableGoals++;
      }
    } else {
      this.stats.robotScore++;
      if (crossTableAngle) {
        this.stats.crossTableGoals++;
      }
      if (this.lastHitWasRebound) {
        this.stats.reboundGoals++;
      }
    }

    if (this.currentRallyHits >= 5) {
      this.stats.ralliesOver5Hits++;
    }
    this.currentRallyHits = 0;
  }

  public generateInsight(playerWon: boolean): string {
    const s = this.stats;

    if (playerWon) {
      if (s.overcommitGoals >= 2) {
        return `Tactical win: You exploited the robot's lunge recovery for ${s.overcommitGoals} clean goals.`;
      }
      if (s.reboundGoals >= 2) {
        return `Geometric mastery: You confused the machine's prediction line with ${s.reboundGoals} bank-shot goals.`;
      }
      if (s.maxPuckSpeed > 1500) {
        return `Overpower: Blistering ${s.maxPuckSpeed} px/s shots exceeded the robot's paddle speed cap.`;
      }
      if (s.ralliesOver5Hits >= 2) {
        return `Patience paid off: You outlasted the robot in ${s.ralliesOver5Hits} intense long rallies.`;
      }
      return 'Flawless execution: You kept the machine constantly on its back foot.';
    } else {
      // Player lost
      const diff = s.robotScore - s.playerScore;
      if (s.crossTableGoals >= 2) {
        return `Vulnerability detected: You gave up ${s.crossTableGoals} points to diagonal cross-table shots.`;
      }
      if (s.maxPuckSpeed < 1000) {
        return "Tip: Swiping through the puck with momentum generates faster shots that stress the robot's reaction time.";
      }
      if (s.reboundGoals >= 2) {
        return 'Defensive breakdown: The robot tricked your positioning with bank-shots off the side rails.';
      }
      if (diff <= 2) {
        return `Inches away: You pushed the machine to the wire (${s.playerScore}-${s.robotScore}). Its weaknesses are real.`;
      }
      return 'The robot calculates every direct shot. Use angled bank-shots to exploit its 100ms reaction delay.';
    }
  }
}
