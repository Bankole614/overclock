// Robot air hockey AI. Framework-agnostic: call robot.update() every frame.
// Coordinates: table is width x height, robot defends the TOP (y = 0), player the bottom.

export interface Vec2 { x: number; y: number }
export interface Puck { pos: Vec2; vel: Vec2; radius: number }
export interface Table { width: number; height: number }
export interface Paddle { pos: Vec2; radius: number }

export interface AIConfig {
  reactionMs: number;     // how stale the robot's view of the puck is
  maxSpeed: number;       // paddle speed cap, px/s (this is its real weakness)
  baseError: number;      // aim error in px at low puck speed
  errorPerSpeed: number;  // extra px of error per px/s of puck speed
  aggression: number;     // 0..1, chance to go for the puck when it's loose
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// skill 0..1 -> concrete tuning. Tune these numbers by playtesting.
export function skillToConfig(skill: number): AIConfig {
  const s = clamp(skill, 0, 1);
  return {
    reactionMs: lerp(150, 80, s),
    maxSpeed: lerp(900, 1400, s),
    baseError: lerp(24, 6, s),
    errorPerSpeed: lerp(0.03, 0.01, s),
    aggression: lerp(0.3, 0.7, s),
  };
}

// Unfold a straight-line x position into the table with wall bounces.
function foldX(x: number, min: number, max: number): number {
  const span = max - min;
  let m = (x - min) % (2 * span);
  if (m < 0) m += 2 * span;
  return min + (m <= span ? m : 2 * span - m);
}

function gaussian(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface Snapshot { t: number; pos: Vec2; vel: Vec2 }

export class RobotAI {
  config: AIConfig;
  private history: Snapshot[] = [];
  private homeY: number;
  private lastVelSign = { x: 0, y: 0 };
  private errorOffset = 0;
  private committedUntil = 0; // overcommit timer (ms)

  constructor(private table: Table, skill = 0.35) {
    this.config = skillToConfig(skill);
    this.homeY = 70;
  }

  setSkill(skill: number) {
    this.config = skillToConfig(skill);
  }

  // The robot only "sees" the puck as it was reactionMs ago.
  private perceive(now: number): Snapshot | null {
    const cutoff = now - this.config.reactionMs;
    let seen: Snapshot | null = null;
    for (const s of this.history) {
      if (s.t <= cutoff) seen = s;
      else break;
    }
    // drop anything older than what we still need
    while (this.history.length > 2 && this.history[1].t <= cutoff) this.history.shift();
    return seen;
  }

  update(dtSec: number, nowMs: number, puck: Puck, paddle: Paddle) {
    this.history.push({ t: nowMs, pos: { ...puck.pos }, vel: { ...puck.vel } });
    const seen = this.perceive(nowMs);
    if (!seen) return;

    const { width } = this.table;
    const minX = puck.radius;
    const maxX = width - puck.radius;
    const speed = Math.hypot(seen.vel.x, seen.vel.y);
    const incoming = seen.vel.y < -20; // moving toward the robot

    let target: Vec2 = { x: width / 2, y: this.homeY };

    if (incoming) {
      // Re-roll the aim error only when the puck's direction changes (a new hit),
      // so the paddle doesn't jitter every frame.
      const signX = Math.sign(seen.vel.x);
      const signY = Math.sign(seen.vel.y);
      if (signX !== this.lastVelSign.x || signY !== this.lastVelSign.y) {
        const sigma = this.config.baseError + this.config.errorPerSpeed * speed;
        this.errorOffset = gaussian() * sigma;
        this.lastVelSign = { x: signX, y: signY };
      }

      const t = (this.homeY - seen.pos.y) / seen.vel.y; // time to reach defense line
      if (t > 0) {
        const predictedX = foldX(seen.pos.x + seen.vel.x * t, minX, maxX);
        target = { x: clamp(predictedX + this.errorOffset, minX, maxX), y: this.homeY };
      }
    } else {
      // Puck is loose or going away. Sometimes overcommit and attack it.
      const inRobotHalf = seen.pos.y < this.table.height / 2;
      const slowish = speed < 500;
      if (nowMs < this.committedUntil) {
        target = { x: seen.pos.x, y: Math.max(seen.pos.y - paddle.radius, paddle.radius) };
      } else if (inRobotHalf && slowish && Math.random() < this.config.aggression * dtSec * 4) {
        // Commit for a beat. It stays advanced even after the strike = the gap players can exploit.
        this.committedUntil = nowMs + 450;
      } else {
        // drift to loosely shadow the puck's x while waiting
        target = { x: lerp(width / 2, seen.pos.x, 0.5), y: this.homeY };
      }
    }

    // Capped speed: positioned well, but it can't teleport.
    const dx = target.x - paddle.pos.x;
    const dy = target.y - paddle.pos.y;
    const dist = Math.hypot(dx, dy);
    const maxStep = this.config.maxSpeed * dtSec;
    if (dist > 0) {
      const k = Math.min(1, maxStep / dist);
      paddle.pos.x += dx * k;
      paddle.pos.y += dy * k;
    }
    // keep the robot on its own half
    paddle.pos.y = clamp(paddle.pos.y, paddle.radius, this.table.height / 2 - paddle.radius);
    paddle.pos.x = clamp(paddle.pos.x, paddle.radius, width - paddle.radius);
  }
}

// Hidden rubber-banding. Aims for the player to win ~25% of games, with close losses.
export class DifficultyDirector {
  skill: number;
  private gamesPlayed = 0;

  constructor(startSkill = 0.35) {
    this.skill = startSkill;
  }

  // Call after every point.
  onPoint(playerScored: boolean, playerScore: number, robotScore: number) {
    const lead = robotScore - playerScore;
    if (playerScored) {
      this.skill += 0.03;
    } else {
      // ease off if the robot is running away with it; keep losses close
      this.skill -= lead >= 3 ? 0.06 : 0.0;
      this.skill += lead <= 1 ? 0.01 : 0;
    }
    this.skill = clamp(this.skill, 0.15, 0.95);
  }

  // Call after every game. First couple of games are gentler so people scrape a win.
  onGameEnd(playerWon: boolean) {
    this.gamesPlayed++;
    if (this.gamesPlayed <= 2) this.skill = Math.min(this.skill, 0.4);
    else this.skill += playerWon ? 0.05 : -0.02;
    this.skill = clamp(this.skill, 0.15, 0.95);
  }
}

// Usage:
//   const robot = new RobotAI({ width: 600, height: 900 });
//   const director = new DifficultyDirector();
//   each frame:  robot.update(dt, performance.now(), puck, robotPaddle);
//   each point:  director.onPoint(...); robot.setSkill(director.skill);
