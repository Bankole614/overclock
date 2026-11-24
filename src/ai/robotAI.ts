// Robot air hockey AI - predictive boss opponent with Redline phases & cyber dialogue
import { Puck, Paddle, TableConfig, Vec2, BossPhase, BossId, DifficultyLevel } from '../types';

export interface AIConfig {
  reactionMs: number;     // how stale the robot's view of the puck is (55-150ms)
  maxSpeed: number;       // paddle speed cap, px/s (900-1750)
  baseError: number;      // aim error in px at low speed (16-3)
  errorPerSpeed: number;  // extra px of error per px/s of puck speed
  aggression: number;     // 0..1 chance/eagerness to strike loose puck
}

export interface BossTuning {
  id: BossId;
  speed: number;
  reactionMs: number;
}

export type RobotState = 'IDLE' | 'TRACKING' | 'STRIKING' | 'OVERCOMMITTED' | 'GLITCHING' | 'STUNNED';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function skillToConfig(skill: number, phase: BossPhase = 'ANALYTICAL'): AIConfig {
  const s = clamp(skill, 0, 1);
  const phaseSpeedBonus = phase === 'REDLINE' ? 220 : phase === 'OVERCLOCKED' ? 110 : 0;
  const phaseReactionReduction = phase === 'REDLINE' ? 18 : phase === 'OVERCLOCKED' ? 10 : 0;
  const phaseAggression = phase === 'REDLINE' ? 0.30 : phase === 'OVERCLOCKED' ? 0.15 : 0;

  return {
    reactionMs: Math.max(50, lerp(140, 65, s) - phaseReactionReduction),
    maxSpeed: lerp(1000, 1550, s) + phaseSpeedBonus,
    baseError: lerp(16, 3, s),
    errorPerSpeed: lerp(0.015, 0.004, s),
    aggression: Math.min(0.95, lerp(0.45, 0.85, s) + phaseAggression),
  };
}

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
  decoyIntercept?: Vec2;
  confidence: number;
}

export class RobotAI {
  config: AIConfig;
  private baseSkill: number;
  private bossTuning: BossTuning | null = null;
  private difficulty: DifficultyLevel = 'NORMAL';
  private history: Snapshot[] = [];
  public homeY = 90;
  private lastVelSign = { x: 0, y: 0 };
  private errorOffset = 0;
  private strikeAimOffset = 0;
  private committedUntil = 0;
  private glitchUntil = 0;
  private stunUntil = 0;

  public state: RobotState = 'IDLE';
  public phase: BossPhase = 'ANALYTICAL';
  public currentSpeed = 0;
  public prediction: PredictionPath | null = null;
  public currentDialogue: string | null = null;
  public dialogueTimer = 0;

  constructor(private table: TableConfig, skill = 0.45) {
    this.baseSkill = clamp(skill, 0, 1);
    this.config = skillToConfig(this.baseSkill, this.phase);
  }

  private recomputeConfig() {
    const base = skillToConfig(this.baseSkill, this.phase);
    if (!this.bossTuning) {
      this.config = base;
      return;
    }

    const diff = this.difficulty;
    const speedMult = diff === 'CASUAL' ? 0.72 : diff === 'OVERCLOCKED' ? 1.08 : 0.94;
    const reactionAdd = diff === 'CASUAL' ? 110 : diff === 'OVERCLOCKED' ? 0 : 20;
    const errorMult = diff === 'CASUAL' ? 1.35 : diff === 'OVERCLOCKED' ? 0.65 : 0.85;
    const phaseSpeedBonus = this.phase === 'REDLINE' ? 220 : this.phase === 'OVERCLOCKED' ? 110 : 0;
    const phaseReactionReduction = this.phase === 'REDLINE' ? 18 : this.phase === 'OVERCLOCKED' ? 10 : 0;

    // Preserve each boss's distinct speed/reaction while letting DifficultyDirector adapt smoothly around it
    const skillSpeedOffset = (this.baseSkill - 0.5) * 260;
    const skillReactionOffset = (0.5 - this.baseSkill) * 35;

    this.config = {
      reactionMs: Math.max(
        45,
        Math.round(this.bossTuning.reactionMs + reactionAdd + skillReactionOffset - phaseReactionReduction)
      ),
      maxSpeed: Math.max(
        700,
        Math.round(this.bossTuning.speed * speedMult + skillSpeedOffset + phaseSpeedBonus)
      ),
      baseError: base.baseError * errorMult,
      errorPerSpeed: base.errorPerSpeed * errorMult,
      aggression: base.aggression,
    };
  }

  setBossTuning(boss: BossTuning, difficulty: DifficultyLevel) {
    this.bossTuning = { ...boss };
    this.difficulty = difficulty;
    this.recomputeConfig();
  }

  setSkill(skill: number) {
    this.baseSkill = clamp(skill, 0, 1);
    this.recomputeConfig();
  }

  setPhase(newPhase: BossPhase) {
    if (this.phase !== newPhase) {
      this.phase = newPhase;
      this.recomputeConfig();
      if (newPhase === 'REDLINE') {
        this.say('CRITICAL REDLINE: SYSTEM OVERHEAT 98°C', 2.5);
      } else if (newPhase === 'OVERCLOCKED') {
        this.say('TACTICAL ACCELERATION ENGAGED', 2.0);
      }
    }
  }

  say(text: string, durationSec = 2.0) {
    this.currentDialogue = text;
    this.dialogueTimer = durationSec;
  }

  triggerGlitch(durationMs = 600) {
    this.glitchUntil = performance.now() + durationMs;
    this.state = 'GLITCHING';
    this.say('FATAL TRAJECTORY ANOMALY: ERROR', 1.5);
  }

  triggerEMPStun(durationMs = 2000) {
    this.stunUntil = performance.now() + durationMs;
    this.state = 'STUNNED';
    this.say('EMP DETECTED: CIRCUITS COMPROMISED!', 2.0);
  }

  reset() {
    this.history = [];
    this.committedUntil = 0;
    this.glitchUntil = 0;
    this.stunUntil = 0;
    this.state = 'IDLE';
    this.prediction = null;
    this.lastVelSign = { x: 0, y: 0 };
    this.errorOffset = 0;
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
    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dtSec;
      if (this.dialogueTimer <= 0) {
        this.currentDialogue = null;
      }
    }

    this.history.push({ t: nowMs, pos: { ...puck.pos }, vel: { ...puck.vel } });
    const seen = this.perceive(nowMs);
    if (!seen) return;

    // Stunned by EMP
    if (nowMs < this.stunUntil) {
      this.state = 'STUNNED';
      this.prediction = null;
      // Stumble slowly with jitter
      paddle.pos.x += (Math.random() - 0.5) * 80 * dtSec;
      paddle.pos.y += (Math.random() - 0.5) * 80 * dtSec;
      return;
    }

    if (nowMs < this.glitchUntil) {
      this.state = 'GLITCHING';
      this.prediction = null;
      paddle.pos.x += (Math.random() - 0.5) * 6;
      paddle.pos.y += (Math.random() - 0.5) * 6;
      return;
    }

    const { width, height, goalWidth } = this.table;
    const minX = puck.radius;
    const maxX = width - puck.radius;
    const speed = Math.hypot(seen.vel.x, seen.vel.y);
    const incoming = seen.vel.y < -20;
    const bossId = this.bossTuning?.id;
    const isViper = bossId === 'VIPER';
    const isPhantom = bossId === 'PHANTOM';
    const isApex = bossId === 'APEX';

    // Tick robot parry timers in Solo Boss mode
    if (paddle.parryTimer > 0) {
      paddle.parryTimer -= dtSec;
      if (paddle.parryTimer <= 0) {
        paddle.parryActive = false;
      }
    }
    if (paddle.parryCooldown > 0) {
      paddle.parryCooldown -= dtSec;
    }

    let target: Vec2 = { x: width / 2, y: this.homeY };
    let dashMultiplier = 1.0;

    if (incoming) {
      this.state = 'TRACKING';
      const signX = Math.sign(seen.vel.x);
      const signY = Math.sign(seen.vel.y);
      if (signX !== this.lastVelSign.x || signY !== this.lastVelSign.y) {
        const sigma = this.config.baseError + this.config.errorPerSpeed * speed;
        const maxErr = Math.min(sigma * 1.8, paddle.radius * 1.15);
        this.errorOffset = clamp(gaussian() * sigma, -maxErr, maxErr);
        // Intentional corner/bank angle offset on counter-strikes
        const aimDir = Math.random() > 0.5 ? 1 : -1;
        this.strikeAimOffset = aimDir * paddle.radius * (isViper ? 0.45 : 0.28);
        this.lastVelSign = { x: signX, y: signY };
      }

      // Defense intercept line calculation
      const interceptY = this.homeY + paddle.radius + puck.radius;
      const t = (interceptY - seen.pos.y) / seen.vel.y;

      if (t > 0) {
        // Linear prediction (NOTE: If puck has high spin, the curve fools this linear calculation!)
        const predictedX = foldX(seen.pos.x + seen.vel.x * t, minX, maxX);
        const desiredX = clamp(predictedX + this.errorOffset, minX, maxX);
        target = {
          x: desiredX,
          y: this.homeY,
        };

        // PHANTOM signature: hyper-velocity dash burst when closing big lateral gaps
        if (isPhantom && Math.abs(paddle.pos.x - desiredX) > 95 && t < 0.42) {
          dashMultiplier = 1.32;
        }

        // APEX signature: Counter-Parry reflexes on fast incoming shots
        if (
          isApex &&
          paddle.parryCooldown <= 0 &&
          speed > 950 &&
          t < 0.12 &&
          Math.abs(paddle.pos.x - desiredX) < paddle.radius * 1.35
        ) {
          const parryChance =
            this.difficulty === 'CASUAL' ? 0.25 : this.difficulty === 'OVERCLOCKED' ? 0.85 : 0.55;
          if (Math.random() < parryChance) {
            paddle.parryActive = true;
            paddle.parryTimer = 0.16;
            paddle.parryCooldown = this.difficulty === 'OVERCLOCKED' ? 1.8 : 2.8;
          }
        }

        // Active counter-strike: when aligned and puck is close in robot's half, drive forward into it
        if (
          seen.pos.y < height * 0.56 &&
          t < 0.22 &&
          Math.abs(paddle.pos.x - desiredX) < paddle.radius * 1.5
        ) {
          this.state = 'STRIKING';
          if (isPhantom) dashMultiplier = 1.25;
          target = {
            x: clamp(desiredX + this.strikeAimOffset, minX, maxX),
            y: clamp(
              seen.pos.y + puck.radius * 0.5,
              this.homeY,
              height / 2 - paddle.radius - 8
            ),
          };
        }

        // Construct predictive path points for visual reticle
        const pathPoints: Vec2[] = [{ ...seen.pos }];
        let currX = seen.pos.x;
        let currY = seen.pos.y;
        let velX = seen.vel.x;
        let remT = t;

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

        const decoyIntercept = isPhantom
          ? {
              x: clamp(width - target.x, minX, maxX),
              y: this.homeY,
            }
          : undefined;

        this.prediction = {
          points: pathPoints,
          targetIntercept: target,
          decoyIntercept,
          confidence: clamp(1 - (speed / 2400) * 0.45, 0.4, 0.95),
        };
      } else {
        // Puck is already behind/at the intercept line: guard the goal mouth tightly
        this.prediction = null;
        const guardHalf = goalWidth * 0.5;
        target = {
          x: clamp(seen.pos.x, width / 2 - guardHalf, width / 2 + guardHalf),
          y: Math.max(paddle.radius + 8, Math.min(this.homeY, seen.pos.y - puck.radius)),
        };
      }
    } else {
      this.prediction = null;
      const inRobotHalf = seen.pos.y < height / 2 - 6;
      const puckBehindRobot = seen.pos.y < paddle.pos.y + 6;
      const slowish = speed < 750;

      if (inRobotHalf && puckBehindRobot) {
        // Own-goal safety: never shove a puck that is behind the paddle toward own goal
        this.state = 'TRACKING';
        const clearOffset = paddle.radius + puck.radius + 8;
        const clearX = seen.pos.x < width / 2 ? seen.pos.x + clearOffset : seen.pos.x - clearOffset;
        target = {
          x: clamp(clearX, minX, maxX),
          y: paddle.radius + 8,
        };
      } else if (nowMs < this.committedUntil && inRobotHalf) {
        this.state = 'OVERCOMMITTED';
        if (isPhantom) dashMultiplier = 1.25;
        target = {
          x: clamp(seen.pos.x + this.strikeAimOffset, minX, maxX),
          y: clamp(seen.pos.y + puck.radius + 14, paddle.radius + 15, height / 2 - paddle.radius - 6),
        };
      } else if (inRobotHalf && slowish) {
        this.state = 'STRIKING';
        this.committedUntil = nowMs + 240;
        if (isPhantom) dashMultiplier = 1.25;
        const aimDir = seen.pos.x < width / 2 ? 1 : -1;
        this.strikeAimOffset = aimDir * paddle.radius * (isViper ? 0.48 : 0.25);
        target = {
          x: clamp(seen.pos.x + this.strikeAimOffset, minX, maxX),
          y: clamp(seen.pos.y + puck.radius + 14, paddle.radius + 15, height / 2 - paddle.radius - 6),
        };
      } else {
        this.state = 'IDLE';
        const guardHalf = goalWidth * 0.48;
        const guardX = clamp(
          lerp(width / 2, seen.pos.x, 0.55),
          width / 2 - guardHalf,
          width / 2 + guardHalf
        );
        target = { x: guardX, y: this.homeY };
      }
    }

    // Move toward target capped at maxSpeed (with PHANTOM dash burst when active)
    const dx = target.x - paddle.pos.x;
    const dy = target.y - paddle.pos.y;
    const dist = Math.hypot(dx, dy);
    const maxStep = this.config.maxSpeed * dashMultiplier * dtSec;

    const oldX = paddle.pos.x;
    const oldY = paddle.pos.y;

    if (dist > 0) {
      const k = Math.min(1, maxStep / dist);
      paddle.pos.x += dx * k;
      paddle.pos.y += dy * k;
    }

    paddle.pos.y = clamp(
      paddle.pos.y,
      paddle.radius,
      height / 2 - paddle.radius - 5
    );
    paddle.pos.x = clamp(paddle.pos.x, paddle.radius, width - paddle.radius);

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
