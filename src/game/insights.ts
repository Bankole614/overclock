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
      maxClockSpeedGHz: 1.0,
      totalHits: 0,
      playerHits: 0,
      robotHits: 0,
      parriesCount: 0,
      curveGoalsCount: 0,
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
      if (s.parriesCount >= 2) {
        return `Electric reflexes: You executed ${s.parriesCount} Perfect Parries, reversing kinetic momentum into hyper-velocity counters.`;
      }
      if (s.maxClockSpeedGHz >= 4.5) {
        return `Redline conqueror: You survived a blistering ${s.maxClockSpeedGHz} GHz overclocked rally to break the machine.`;
      }
      if (s.overcommitGoals >= 2) {
        return `Tactical punish: You exploited the robot's lunge recovery windows for ${s.overcommitGoals} clean goals.`;
      }
      if (s.reboundGoals >= 2) {
        return `Geometric supremacy: You confused the machine's prediction line with ${s.reboundGoals} bank-shot goals.`;
      }
      return 'Flawless execution: You kept the machine constantly on its back foot and forced a core overheat.';
    } else {
      const diff = s.robotScore - s.playerScore;
      if (s.parriesCount === 0) {
        return 'Tip: Right-Click or Spacebar right before impact triggers a PERFECT PARRY, absorbing supersonic shots with a speed boost!';
      }
      if (s.crossTableGoals >= 2) {
        return `Vulnerability detected: The machine punished wide angles with ${s.crossTableGoals} cross-table railgun strikes.`;
      }
      if (s.maxClockSpeedGHz >= 4.0) {
        return `Overclock burnout: Rallies exceeded ${s.maxClockSpeedGHz} GHz where single-frame reaction errors proved fatal.`;
      }
      if (diff <= 2) {
        return `Inches away: You pushed the machine to the wire (${s.playerScore}-${s.robotScore}). Charge Overdrive to tip the scales!`;
      }
      return 'The robot calculates direct shots. Slicing across the puck adds curve spin to bend past its defense line.';
    }
  }
}
