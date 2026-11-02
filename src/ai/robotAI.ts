// Robot air hockey AI - predictive defender with learnable human-like weaknesses.
import { Puck, Paddle, TableConfig, Vec2 } from '../types';

export interface AIConfig {
  reactionMs: number;     // how stale the robot's view of the puck is (80-150ms)
  maxSpeed: number;       // paddle speed cap, px/s (900-1400)
  baseError: number;      // aim error in px at low speed (24-6)
  errorPerSpeed: number;  // extra px of error per px/s of puck speed
  aggression: number;     // 0..1 chance to lunge for loose puck
}

export type RobotState = 'IDLE' | 'TRACKING' | 'STRIKING' | 'OVERCOMMITTED' | 'GLITCHING';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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

// Unfold straight-line x into table with wall bounces
function foldX(x: number, min: number, max: number): number {
  const span = max - min;
  if (span <= 0) return min;
  let m = (x - min) % (2 * span);
  if (m < 0) m += 2 * span;
  return min + (m <= span ? m : 2 * span - m);
}

function gaussian(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface Snapshot {
  t: number;
  pos: Vec2;
  vel: Vec2;
}

export interface PredictionPath {
  points: Vec2[];
  targetIntercept: Vec2;
  confidence: number;
}

export class RobotAI {
  config: AIConfig;
  private history: Snapshot[] = [];
  public homeY = 90;
  private lastVelSign = { x: 0, y: 0 };
  private errorOffset = 0;
  private committedUntil = 0;
  private glitchUntil = 0;

  public state: RobotState = 'IDLE';
  public currentSpeed = 0;
  public prediction: PredictionPath | null = null;

  constructor(private table: TableConfig, skill = 0.35) {
    this.config = skillToConfig(skill);
  }

  setSkill(skill: number) {
    this.config = skillToConfig(skill);
  }

  reset() {
    this.history = [];
    this.committedUntil = 0;
    this.glitchUntil = 0;
    this.state = 'IDLE';
    this.prediction = null;
    this.lastVelSign = { x: 0, y: 0 };
    this.errorOffset = 0;
  }

  triggerGlitch(durationMs = 600) {
    this.glitchUntil = performance.now() + durationMs;
    this.state = 'GLITCHING';
  }

  private perceive(now: number): Snapshot | null {
    const cutoff = now - this.config.reactionMs;
    let seen: Snapshot | null = null;
    for (const s of this.history) {
      if (s.t <= cutoff) seen = s;
      else break;
    }
    while (this.history.length > 2 && this.history[1].t <= cutoff) {
      this.history.shift();
    }
    return seen;
  }

  update(dtSec: number, nowMs: number, puck: Puck, paddle: Paddle) {
    this.history.push({ t: nowMs, pos: { ...puck.pos }, vel: { ...puck.vel } });
    const seen = this.perceive(nowMs);
    if (!seen) return;

    if (nowMs < this.glitchUntil) {
      this.state = 'GLITCHING';
      this.prediction = null;
      // Stutter in place
      paddle.pos.x += (Math.random() - 0.5) * 4;
      paddle.pos.y += (Math.random() - 0.5) * 4;
      return;
    }

    const { width, height } = this.table;
    const minX = puck.radius;
    const maxX = width - puck.radius;
    const speed = Math.hypot(seen.vel.x, seen.vel.y);
    const incoming = seen.vel.y < -20;

    let target: Vec2 = { x: width / 2, y: this.homeY };

    if (incoming) {
      this.state = 'TRACKING';
      const signX = Math.sign(seen.vel.x);
      const signY = Math.sign(seen.vel.y);
      if (signX !== this.lastVelSign.x || signY !== this.lastVelSign.y) {
        const sigma = this.config.baseError + this.config.errorPerSpeed * speed;
        this.errorOffset = gaussian() * sigma;
        this.lastVelSign = { x: signX, y: signY };
      }

      // The puck hits the robot paddle when puck.y reaches homeY + paddle.radius + puck.radius
      const interceptY = this.homeY + paddle.radius + puck.radius;
      const t = (interceptY - seen.pos.y) / seen.vel.y;
      if (t > 0) {
        const predictedX = foldX(seen.pos.x + seen.vel.x * t, minX, maxX);
        target = {
          x: clamp(predictedX + this.errorOffset, minX, maxX),
          y: this.homeY,
        };

        // Construct predictive path points for visual targeting line
        const pathPoints: Vec2[] = [{ ...seen.pos }];
        let currX = seen.pos.x;
        let currY = seen.pos.y;
        let velX = seen.vel.x;
        let remT = t;

        // Step through reflections
        while (remT > 0 && pathPoints.length < 5) {
          const dtWall = velX > 0 ? (maxX - currX) / velX : (minX - currX) / velX;
          if (dtWall > 0 && dtWall < remT) {
            currX += velX * dtWall;
            currY += seen.vel.y * dtWall;
            velX = -velX;
            remT -= dtWall;
            pathPoints.push({ x: currX, y: currY });
          } else {
            currX += velX * remT;
            currY += seen.vel.y * remT;
            remT = 0;
            pathPoints.push({ x: currX, y: currY });
          }
        }

        this.prediction = {
          points: pathPoints,
          targetIntercept: target,
          confidence: clamp(1 - (speed / 2000) * 0.4, 0.4, 0.95),
        };
      } else {
        this.prediction = null;
      }
    } else {
      this.prediction = null;
      const inRobotHalf = seen.pos.y < height / 2;
      const slowish = speed < 500;

      if (nowMs < this.committedUntil) {
        this.state = 'OVERCOMMITTED';
        target = {
          x: seen.pos.x,
          y: Math.max(seen.pos.y - paddle.radius, paddle.radius + 10),
        };
      } else if (
        inRobotHalf &&
        slowish &&
        Math.random() < this.config.aggression * dtSec * 4
      ) {
        this.state = 'STRIKING';
        this.committedUntil = nowMs + 450;
        target = {
          x: seen.pos.x,
          y: Math.max(seen.pos.y - paddle.radius, paddle.radius + 10),
        };
      } else {
        this.state = 'IDLE';
        target = { x: lerp(width / 2, seen.pos.x, 0.5), y: this.homeY };
      }
    }

    // Move toward target capped at maxSpeed
    const dx = target.x - paddle.pos.x;
    const dy = target.y - paddle.pos.y;
    const dist = Math.hypot(dx, dy);
    const maxStep = this.config.maxSpeed * dtSec;

    const oldX = paddle.pos.x;
    const oldY = paddle.pos.y;

    if (dist > 0) {
      const k = Math.min(1, maxStep / dist);
      paddle.pos.x += dx * k;
      paddle.pos.y += dy * k;
    }

    // Keep robot in top half
    paddle.pos.y = clamp(
      paddle.pos.y,
      paddle.radius,
      height / 2 - paddle.radius - 5
    );
    paddle.pos.x = clamp(paddle.pos.x, paddle.radius, width - paddle.radius);

    // Calculate current velocity
    if (dtSec > 0) {
      paddle.vel.x = (paddle.pos.x - oldX) / dtSec;
      paddle.vel.y = (paddle.pos.y - oldY) / dtSec;
      this.currentSpeed = Math.hypot(paddle.vel.x, paddle.vel.y);
    }
  }

  isOvercommitted(): boolean {
    return this.state === 'OVERCOMMITTED';
  }
}
