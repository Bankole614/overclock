import { TableConfig, Puck, Paddle, GameSettings } from '../types';
import { ParticleSystem } from './particles';
import { PredictionPath, RobotState } from '../ai/robotAI';

export interface RenderState {
  puck: { pos: { x: number; y: number }; vel: { x: number; y: number } };
  playerPaddle: { pos: { x: number; y: number } };
  robotPaddle: { pos: { x: number; y: number } };
}

export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private shakeAmount = 0;
  private shakeDuration = 0;
  private dpr = 1;

  constructor(
    private canvas: HTMLCanvasElement,
    public table: TableConfig,
    public particles: ParticleSystem,
    public settings: GameSettings
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D context');
    this.ctx = context;
    this.setupDPR();
  }

  public setupDPR() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.canvas.width = rect.width * this.dpr;
      this.canvas.height = rect.height * this.dpr;
    }
  }

  public triggerShake(intensity: number, durationSec = 0.2) {
    if (this.settings.reduceMotion) return;
    this.shakeAmount = Math.max(this.shakeAmount, intensity);
    this.shakeDuration = durationSec;
  }

  public update(dt: number) {
    if (this.shakeDuration > 0) {
      this.shakeDuration -= dt;
      if (this.shakeDuration <= 0) {
        this.shakeAmount = 0;
      } else {
        this.shakeAmount *= Math.max(0, 1 - 8 * dt);
      }
    }
  }

  public render(
    curr: RenderState,
    prev: RenderState,
    interpAlpha: number,
    puckObj: Puck,
    playerPaddleObj: Paddle,
    robotPaddleObj: Paddle,
    robotState: RobotState,
    prediction: PredictionPath | null,
    score: { player: number; robot: number },
    countdownText: string | null,
    goalScoredBanner: string | null
  ) {
    const { width, height } = this.table;
    const ctx = this.ctx;

    // Reset transform & clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply scale to fit logical table
    const scale = Math.min(
      this.canvas.width / width,
      this.canvas.height / height
    );
    const offsetX = (this.canvas.width - width * scale) / 2;
    const offsetY = (this.canvas.height - height * scale) / 2;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Screen Shake
    if (this.shakeAmount > 0) {
      const sx = (Math.random() - 0.5) * this.shakeAmount * 16;
      const sy = (Math.random() - 0.5) * this.shakeAmount * 16;
      ctx.translate(sx, sy);
    }

    // 1. Draw Arena Floor & Grid
    this.drawArena(score);

    // 2. Draw Robot Prediction Laser Line
    if (this.settings.showPredictionLine && prediction && robotState === 'TRACKING') {
      this.drawPrediction(prediction);
    }

    // 3. Interpolate Entity Positions
    const puckX = prev.puck.pos.x + (curr.puck.pos.x - prev.puck.pos.x) * interpAlpha;
    const puckY = prev.puck.pos.y + (curr.puck.pos.y - prev.puck.pos.y) * interpAlpha;

    const playerX =
      prev.playerPaddle.pos.x +
      (curr.playerPaddle.pos.x - prev.playerPaddle.pos.x) * interpAlpha;
    const playerY =
      prev.playerPaddle.pos.y +
      (curr.playerPaddle.pos.y - prev.playerPaddle.pos.y) * interpAlpha;

    const robotX =
      prev.robotPaddle.pos.x +
      (curr.robotPaddle.pos.x - prev.robotPaddle.pos.x) * interpAlpha;
    const robotY =
      prev.robotPaddle.pos.y +
      (curr.robotPaddle.pos.y - prev.robotPaddle.pos.y) * interpAlpha;

    // 4. Draw Puck Trail
    this.drawPuckTrail(puckObj);

    // 5. Draw Paddles
    this.drawRobotPaddle(robotX, robotY, robotPaddleObj.radius, robotState);
    this.drawPlayerPaddle(playerX, playerY, playerPaddleObj.radius);

    // 6. Draw Puck
    const puckSpeed = Math.hypot(curr.puck.vel.x, curr.puck.vel.y);
    this.drawPuck(puckX, puckY, puckObj.radius, puckSpeed);

    // 7. Particles and Shockwaves
    this.particles.render(ctx);

    // 8. Robot HUD Scanner at the top
    this.drawRobotHUD(robotState);

    // 9. Countdown / Goal Banner Overlay
    if (countdownText) {
      this.drawCountdown(countdownText);
    }
    if (goalScoredBanner) {
      this.drawGoalBanner(goalScoredBanner);
    }

    ctx.restore();
  }

  private drawArena(score: { player: number; robot: number }) {
    const { width, height, goalWidth, postRadius } = this.table;
    const ctx = this.ctx;

    // Table background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#0c0f18');
    bgGrad.addColorStop(0.5, '#080a10');
    bgGrad.addColorStop(1, '#0a101d');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtly glowing grid lines
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = gridSize; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = gridSize; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Outer border glowing rails
    ctx.strokeStyle = '#00e5ff';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 4;

    // Left and Right walls
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.lineTo(2, height);
    ctx.moveTo(width - 2, 0);
    ctx.lineTo(width - 2, height);
    ctx.stroke();

    // Top wall segments (outside goal)
    const goalLeft = (width - goalWidth) / 2;
    const goalRight = (width + goalWidth) / 2;

    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(goalLeft, 2);
    ctx.moveTo(goalRight, 2);
    ctx.lineTo(width, 2);
    // Bottom wall segments
    ctx.moveTo(0, height - 2);
    ctx.lineTo(goalLeft, height - 2);
    ctx.moveTo(goalRight, height - 2);
    ctx.lineTo(width, height - 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Center divider
    ctx.strokeStyle = 'rgba(255, 42, 109, 0.35)';
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center Circle
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 85, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#00f0ff';
    ctx.fill();

    // Robot Goal Pocket (Top)
    ctx.fillStyle = 'rgba(255, 0, 85, 0.15)';
    ctx.fillRect(goalLeft, 0, goalWidth, 24);
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 3;
    ctx.strokeRect(goalLeft, 0, goalWidth, 24);

    // Player Goal Pocket (Bottom)
    ctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
    ctx.fillRect(goalLeft, height - 24, goalWidth, 24);
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 3;
    ctx.strokeRect(goalLeft, height - 24, goalWidth, 24);

    // Rounded Goal Posts
    this.drawPost(goalLeft, 0, postRadius, '#ff0055');
    this.drawPost(goalRight, 0, postRadius, '#ff0055');
    this.drawPost(goalLeft, height, postRadius, '#00f0ff');
    this.drawPost(goalRight, height, postRadius, '#00f0ff');

    // Huge subtle background score numerals
    ctx.font = '900 130px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 42, 109, 0.08)';
    ctx.fillText(score.robot.toString(), width / 2, height / 4);

    ctx.fillStyle = 'rgba(0, 240, 255, 0.08)';
    ctx.fillText(score.player.toString(), width / 2, (height * 3) / 4);
  }

  private drawPost(x: number, y: number, r: number, color: string) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();
  }

  private drawPrediction(prediction: PredictionPath) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 42, 109, 0.65)';
    ctx.shadowColor = '#ff2a6d';
    ctx.shadowBlur = 6;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    prediction.points.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    // Draw reticle at calculated intercept
    const { x, y } = prediction.targetIntercept;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - 14, y);
    ctx.lineTo(x + 14, y);
    ctx.moveTo(x, y - 14);
    ctx.lineTo(x, y + 14);
    ctx.stroke();

    ctx.restore();
  }

  private drawPuckTrail(puck: Puck) {
    const ctx = this.ctx;
    const trail = puck.trail;
    if (trail.length < 2) return;

    ctx.save();
    for (let i = 1; i < trail.length; i++) {
      const p1 = trail[i - 1];
      const p2 = trail[i];
      const spdNorm = Math.min(1, p2.speed / 1600);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = puck.lastHitter === 'robot'
        ? `rgba(255, 42, 109, ${p2.alpha * (0.3 + spdNorm * 0.7)})`
        : `rgba(0, 240, 255, ${p2.alpha * (0.3 + spdNorm * 0.7)})`;
      ctx.lineWidth = puck.radius * (0.3 + spdNorm * 0.7) * p2.alpha;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPlayerPaddle(x: number, y: number, r: number) {
    const ctx = this.ctx;
    ctx.save();

    // Outer glow ring
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#051923';
    ctx.fill();

    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 14;
    ctx.stroke();

    // Inner bevel & grip
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.65, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Center handle cap
    ctx.beginPath();
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 8;
    ctx.fill();

    ctx.restore();
  }

  private drawRobotPaddle(x: number, y: number, r: number, state: RobotState) {
    const ctx = this.ctx;
    ctx.save();

    let mainColor = '#ff2a6d';
    if (state === 'OVERCOMMITTED') mainColor = '#ffb703';
    if (state === 'GLITCHING') mainColor = '#9d4edd';

    // Outer body
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1a0812';
    ctx.fill();

    ctx.lineWidth = 3.5;
    ctx.strokeStyle = mainColor;
    ctx.shadowColor = mainColor;
    ctx.shadowBlur = 14;
    ctx.stroke();

    // Inner mechanical ring
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.65, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 42, 109, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Robotic Eye/Core
    ctx.beginPath();
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = mainColor;
    ctx.shadowColor = mainColor;
    ctx.shadowBlur = 10;
    ctx.fill();

    ctx.restore();
  }

  private drawPuck(x: number, y: number, r: number, speed: number) {
    const ctx = this.ctx;
    ctx.save();

    const speedNorm = Math.min(1, speed / 1600);

    // Glowing aura on fast shots
    if (speedNorm > 0.3) {
      ctx.beginPath();
      ctx.arc(x, y, r * (1 + speedNorm * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${speedNorm * 0.25})`;
      ctx.fill();
    }

    // Puck disc
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = speedNorm > 0.5 ? '#ff2a6d' : '#00f0ff';
    ctx.shadowBlur = 10 + speedNorm * 18;
    ctx.fill();

    // Inner rim
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    ctx.strokeStyle = '#d6e2e9';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  private drawRobotHUD(state: RobotState) {
    const { width } = this.table;
    const ctx = this.ctx;
    ctx.save();

    // Top status pill
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    let text = 'ROBOT: MONITORING';
    let color = 'rgba(0, 240, 255, 0.7)';

    if (state === 'TRACKING') {
      text = 'TARGET ACQUIRED [PREDICTING]';
      color = '#ff2a6d';
    } else if (state === 'STRIKING') {
      text = 'INTERCEPT [AGGRESSIVE]';
      color = '#ffb703';
    } else if (state === 'OVERCOMMITTED') {
      text = 'VULNERABILITY [OVERCOMMIT]';
      color = '#ffd166';
    } else if (state === 'GLITCHING') {
      text = 'SYSTEM ANOMALY [ERROR]';
      color = '#b5179e';
    }

    ctx.fillStyle = color;
    ctx.fillText(text, width / 2, 48);

    ctx.restore();
  }

  private drawCountdown(text: string) {
    const { width, height } = this.table;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '900 96px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 24;
    ctx.fillText(text, width / 2, height / 2);
    ctx.restore();
  }

  private drawGoalBanner(text: string) {
    const { width, height } = this.table;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '900 64px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const isPlayer = text.includes('PLAYER') || text.includes('YOU');
    ctx.fillStyle = isPlayer ? '#00f0ff' : '#ff2a6d';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 30;
    ctx.fillText(text, width / 2, height / 2);
    ctx.restore();
  }
}
