import { TableConfig, Puck, Paddle, GameSettings, BossPhase } from '../types';
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
  private timeSec = 0;
  public arenaSkin = 'arena_default';
  public arenaColor = '#00f0ff';
  private goalCamScale = 1.0;

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
    const isMobile =
      typeof navigator !== 'undefined' &&
      (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 640);
    const maxDpr = this.settings.batterySaver ? 1.0 : isMobile ? 1.5 : 2.0;
    this.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.canvas.width = Math.round(rect.width * this.dpr);
      this.canvas.height = Math.round(rect.height * this.dpr);
    }
  }

  public setGlow(color: string, blur: number) {
    if (this.settings.batterySaver) {
      this.ctx.shadowBlur = 0;
      return;
    }
    const isMobile =
      typeof navigator !== 'undefined' &&
      (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 640);
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = isMobile ? Math.min(blur * 0.35, 6) : blur;
  }

  public triggerShake(intensity: number, durationSec = 0.2) {
    if (this.settings.reduceMotion) return;
    this.shakeAmount = Math.max(this.shakeAmount, intensity);
    this.shakeDuration = durationSec;
  }

  public triggerGoalCam() {
    if (this.settings.reduceMotion) return;
    this.goalCamScale = 1.045; // Subtle punch zoom
  }

  public update(dt: number) {
    this.timeSec += dt;
    if (this.shakeDuration > 0) {
      this.shakeDuration -= dt;
      if (this.shakeDuration <= 0) {
        this.shakeAmount = 0;
      } else {
        this.shakeAmount *= Math.max(0, 1 - 8 * dt);
      }
    }
    // Easing goal cam back to normal 1.0
    if (this.goalCamScale > 1.0) {
      this.goalCamScale += (1.0 - this.goalCamScale) * Math.min(1, 8 * dt);
      if (this.goalCamScale < 1.002) this.goalCamScale = 1.0;
    }
  }

  public render(
    curr: RenderState,
    prev: RenderState,
    interpAlpha: number,
    puckObj: Puck,
    puck2Obj: Puck | null,
    playerPaddleObj: Paddle,
    robotPaddleObj: Paddle,
    robotState: RobotState,
    robotPhase: BossPhase,
    robotDialogue: string | null,
    prediction: PredictionPath | null,
    clockSpeedGHz: number,
    score: { player: number; robot: number },
    countdownText: string | null,
    goalScoredBanner: string | null
  ) {
    const { width, height } = this.table;
    const ctx = this.ctx;

    // Reset transform & clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const baseScale = Math.min(
      this.canvas.width / width,
      this.canvas.height / height
    );
    const scale = baseScale * this.goalCamScale;
    const offsetX = (this.canvas.width - width * scale) / 2;
    const offsetY = (this.canvas.height - height * scale) / 2;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Screen Shake
    if (this.shakeAmount > 0) {
      const sx = (Math.random() - 0.5) * this.shakeAmount * 18;
      const sy = (Math.random() - 0.5) * this.shakeAmount * 18;
      ctx.translate(sx, sy);
    }

    // 1. Draw Arena Floor, Grid & Clock Speed Visuals
    this.drawArena(score, clockSpeedGHz, robotPhase);

    // 2. Draw Robot Prediction Laser Line
    if (this.settings.showPredictionLine && prediction && robotState === 'TRACKING') {
      this.drawPrediction(prediction, robotPhase);
    }

    // 4. Interpolate Entity Positions
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

    // 5. Draw Puck Trails
    this.drawPuckTrail(puckObj, clockSpeedGHz);
    if (puck2Obj) {
      this.drawPuckTrail(puck2Obj, clockSpeedGHz);
    }

    // 6. Draw Paddles
    this.drawRobotPaddle(robotX, robotY, robotPaddleObj.radius, robotState, robotPhase, robotPaddleObj.color);
    this.drawPlayerPaddle(playerX, playerY, playerPaddleObj);

    // 7. Draw Puck with Spin/Hyper/Golden Aura
    const puckSpeed = Math.hypot(curr.puck.vel.x, curr.puck.vel.y);
    this.drawPuck(puckX, puckY, puckObj, puckSpeed, clockSpeedGHz);
    if (puck2Obj) {
      const spd2 = Math.hypot(puck2Obj.vel.x, puck2Obj.vel.y);
      this.drawPuck(puck2Obj.pos.x, puck2Obj.pos.y, puck2Obj, spd2, clockSpeedGHz);
    }

    // 8. Particles & Shockwaves
    this.particles.render(ctx);

    // 9. Overclock Clock Speed & Overdrive HUD
    this.drawOverclockHUD(clockSpeedGHz, playerPaddleObj.overdriveCharge);

    // 10. Robot Visor Status & Live Cyber Dialogue
    this.drawRobotTerminal(robotState, robotPhase, robotDialogue);

    // 11. Countdown / Goal Banner Overlay
    if (countdownText) {
      this.drawCountdown(countdownText);
    }
    if (goalScoredBanner) {
      this.drawGoalBanner(goalScoredBanner);
    }

    ctx.restore();
  }

  private drawArena(score: { player: number; robot: number }, clockSpeedGHz: number, phase: BossPhase) {
    const { width, height, goalWidth, postRadius } = this.table;
    const ctx = this.ctx;

    // Floor gradient themed by equipped arena skin
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    if (phase === 'REDLINE') {
      bgGrad.addColorStop(0, '#1c0812');
      bgGrad.addColorStop(0.5, '#0b0409');
      bgGrad.addColorStop(1, '#0e0b1c');
    } else if (this.arenaSkin === 'arena_synthwave') {
      bgGrad.addColorStop(0, '#1d0726');
      bgGrad.addColorStop(0.5, '#0c0418');
      bgGrad.addColorStop(1, '#1b062b');
    } else if (this.arenaSkin === 'arena_matrix') {
      bgGrad.addColorStop(0, '#02180b');
      bgGrad.addColorStop(0.5, '#010e06');
      bgGrad.addColorStop(1, '#031c0d');
    } else if (this.arenaSkin === 'arena_redline') {
      bgGrad.addColorStop(0, '#1a0404');
      bgGrad.addColorStop(0.5, '#0d0101');
      bgGrad.addColorStop(1, '#1e0505');
    } else {
      bgGrad.addColorStop(0, '#0c0f18');
      bgGrad.addColorStop(0.5, '#080a10');
      bgGrad.addColorStop(1, '#0a101d');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Glowing grid lines
    let gridColor = 'rgba(0, 240, 255, 0.04)';
    if (phase === 'REDLINE') {
      gridColor = 'rgba(255, 42, 109, 0.08)';
    } else if (this.arenaSkin === 'arena_synthwave') {
      gridColor = 'rgba(255, 0, 128, 0.09)';
    } else if (this.arenaSkin === 'arena_matrix') {
      gridColor = 'rgba(0, 255, 102, 0.08)';
    } else if (this.arenaSkin === 'arena_redline') {
      gridColor = 'rgba(255, 51, 51, 0.08)';
    }

    ctx.strokeStyle = gridColor;
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

    // Outer rails glow with clock speed and arena skin
    let baseRail = '#00e5ff';
    if (this.arenaSkin === 'arena_synthwave') baseRail = '#ff007f';
    if (this.arenaSkin === 'arena_matrix') baseRail = '#00ff66';
    if (this.arenaSkin === 'arena_redline') baseRail = '#ff3333';

    const railColor = clockSpeedGHz >= 4.0 ? '#ffb703' : phase === 'REDLINE' ? '#ff2a6d' : baseRail;
    ctx.strokeStyle = railColor;
    this.setGlow(railColor, 12 + (clockSpeedGHz - 1.0) * 3);
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.lineTo(2, height);
    ctx.moveTo(width - 2, 0);
    ctx.lineTo(width - 2, height);
    ctx.stroke();

    const goalLeft = (width - goalWidth) / 2;
    const goalRight = (width + goalWidth) / 2;

    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(goalLeft, 2);
    ctx.moveTo(goalRight, 2);
    ctx.lineTo(width, 2);
    ctx.moveTo(0, height - 2);
    ctx.lineTo(goalLeft, height - 2);
    ctx.moveTo(goalRight, height - 2);
    ctx.lineTo(width, height - 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Center divider
    const dividerColor = this.arenaSkin === 'arena_matrix' ? 'rgba(0, 255, 102, 0.35)' : 'rgba(255, 42, 109, 0.35)';
    ctx.strokeStyle = dividerColor;
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center Circle
    const circleColor = this.arenaSkin === 'arena_synthwave'
      ? 'rgba(255, 0, 150, 0.3)'
      : this.arenaSkin === 'arena_matrix'
      ? 'rgba(0, 255, 102, 0.25)'
      : this.arenaSkin === 'arena_redline'
      ? 'rgba(255, 51, 51, 0.3)'
      : 'rgba(0, 240, 255, 0.2)';
    ctx.strokeStyle = circleColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 85, 0, Math.PI * 2);
    ctx.stroke();

    // Goal Pockets
    ctx.fillStyle = 'rgba(255, 0, 85, 0.15)';
    ctx.fillRect(goalLeft, 0, goalWidth, 24);
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 3;
    ctx.strokeRect(goalLeft, 0, goalWidth, 24);

    ctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
    ctx.fillRect(goalLeft, height - 24, goalWidth, 24);
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 3;
    ctx.strokeRect(goalLeft, height - 24, goalWidth, 24);

    // Goal Posts
    this.drawPost(goalLeft, 0, postRadius, '#ff0055');
    this.drawPost(goalRight, 0, postRadius, '#ff0055');
    this.drawPost(goalLeft, height, postRadius, '#00f0ff');
    this.drawPost(goalRight, height, postRadius, '#00f0ff');

    // Huge background numerals
    ctx.font = '900 130px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = phase === 'REDLINE' ? 'rgba(255, 42, 109, 0.15)' : 'rgba(255, 42, 109, 0.08)';
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
    this.setGlow(color, 8);
    ctx.fill();
    ctx.restore();
  }

  private drawPrediction(prediction: PredictionPath, phase: BossPhase) {
    const ctx = this.ctx;
    ctx.save();
    const color = phase === 'REDLINE' ? '#ff2a6d' : '#ffd166';
    ctx.strokeStyle = color;
    this.setGlow(color, 6);
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    prediction.points.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    const { x, y } = prediction.targetIntercept;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - 16, y);
    ctx.lineTo(x + 16, y);
    ctx.moveTo(x, y - 16);
    ctx.lineTo(x, y + 16);
    ctx.stroke();

    ctx.restore();
  }

  private drawPuckTrail(puck: Puck, clockSpeedGHz: number) {
    const ctx = this.ctx;
    const trail = puck.trail;
    if (trail.length < 2) return;

    ctx.save();
    const isOverclocked = clockSpeedGHz >= 3.0;

    for (let i = 1; i < trail.length; i++) {
      const p1 = trail[i - 1];
      const p2 = trail[i];
      const spdNorm = Math.min(1, p2.speed / 2000);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);

      let strokeColor = `rgba(0, 240, 255, ${p2.alpha * (0.3 + spdNorm * 0.7)})`;
      if (puck.isHyperShot) {
        strokeColor = `rgba(255, 215, 0, ${p2.alpha})`;
      } else if (isOverclocked) {
        strokeColor = `rgba(255, 80, 0, ${p2.alpha * (0.4 + spdNorm * 0.6)})`;
      } else if (puck.lastHitter === 'robot') {
        strokeColor = `rgba(255, 42, 109, ${p2.alpha * (0.3 + spdNorm * 0.7)})`;
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = puck.radius * (0.4 + spdNorm * 0.8) * p2.alpha * (puck.isHyperShot ? 1.5 : 1);
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPlayerPaddle(x: number, y: number, paddle: Paddle) {
    const ctx = this.ctx;
    ctx.save();
    const r = paddle.radius;

    // PERFECT PARRY SHIELD AURA
    if (paddle.parryActive) {
      ctx.beginPath();
      ctx.arc(x, y, r * 1.55, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 4;
      this.setGlow('#ffd166', 20);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 209, 102, 0.25)';
      ctx.fill();
    }

    // Outer body
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#051923';
    ctx.fill();

    const skinColor = paddle.color || '#00f0ff';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = skinColor;
    this.setGlow(skinColor, 12);
    ctx.stroke();

    // Inner bevel
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.65, 0, Math.PI * 2);
    ctx.strokeStyle = skinColor;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // Center handle cap
    ctx.beginPath();
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = skinColor;
    this.setGlow(skinColor, 8);
    ctx.fill();

    ctx.restore();
  }

  private drawRobotPaddle(
    x: number,
    y: number,
    r: number,
    state: RobotState,
    phase: BossPhase,
    bossColor = '#ff2a6d'
  ) {
    const ctx = this.ctx;
    ctx.save();

    let mainColor = bossColor;
    if (phase === 'REDLINE') mainColor = '#ff0033';
    else if (phase === 'OVERCLOCKED') mainColor = '#ffb703';

    if (state === 'OVERCOMMITTED') mainColor = '#ffd166';
    if (state === 'GLITCHING' || state === 'STUNNED') mainColor = '#9d4edd';

    // Redline vibrating blur
    if (phase === 'REDLINE') {
      ctx.beginPath();
      ctx.arc(x + (Math.random() - 0.5) * 5, y + (Math.random() - 0.5) * 5, r * 1.25, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 0, 51, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Outer body
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1a0812';
    ctx.fill();

    ctx.lineWidth = 3.5;
    ctx.strokeStyle = mainColor;
    this.setGlow(mainColor, phase === 'REDLINE' ? 18 : 12);
    ctx.stroke();

    // Inner mechanical ring
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.65, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 42, 109, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Robotic Core
    ctx.beginPath();
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = mainColor;
    this.setGlow(mainColor, 8);
    ctx.fill();

    ctx.restore();
  }

  private drawPuck(x: number, y: number, puck: Puck, speed: number, clockSpeedGHz: number) {
    const ctx = this.ctx;
    ctx.save();
    const r = puck.radius;
    const speedNorm = Math.min(1, speed / 2000);

    // Dynamic lightning / fire aura on high clock speed or hypershot
    if (puck.isGolden) {
      ctx.beginPath();
      ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 215, 0, 0.4)';
      this.setGlow('#ffd700', 20);
      ctx.fill();
    } else if (puck.isHyperShot || clockSpeedGHz >= 3.0) {
      ctx.beginPath();
      ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = puck.isHyperShot ? 'rgba(255, 215, 0, 0.3)' : 'rgba(255, 69, 0, 0.25)';
      this.setGlow(puck.isHyperShot ? '#ffd166' : '#ff4500', 16);
      ctx.fill();
    }

    // Puck disc
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = puck.isGolden ? '#ffd700' : puck.isHyperShot ? '#fff8e7' : '#ffffff';
    const puckGlowColor = puck.isGolden ? '#ffd700' : puck.isHyperShot ? '#ffd166' : speedNorm > 0.5 ? '#ff2a6d' : '#00f0ff';
    this.setGlow(puckGlowColor, puck.isGolden ? 20 : 8 + speedNorm * 12);
    ctx.fill();

    // Spin indicator dot (shows puck curving rotation)
    if (Math.abs(puck.spin) > 2) {
      const angle = this.timeSec * puck.spin * 5;
      const dotX = x + Math.cos(angle) * (r * 0.5);
      const dotY = y + Math.sin(angle) * (r * 0.5);
      ctx.beginPath();
      ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ff2a6d';
      ctx.fill();
    }

    ctx.restore();
  }

  private drawOverclockHUD(clockSpeedGHz: number, overdriveCharge: number) {
    const { width, height } = this.table;
    const ctx = this.ctx;
    ctx.save();

    // Clock Speed Gauge (Center Line)
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    let clockColor = '#00f0ff';
    if (clockSpeedGHz >= 4.0) clockColor = '#ff2a6d';
    else if (clockSpeedGHz >= 2.5) clockColor = '#ffb703';

    ctx.fillStyle = clockColor;
    const clockText = clockSpeedGHz >= 5.0
      ? `CLOCK: ${clockSpeedGHz.toFixed(1)} GHz [CRITICAL OVERCLOCK]`
      : `CLOCK SPEED: ${clockSpeedGHz.toFixed(1)} GHz`;
    ctx.fillText(clockText, width / 2, height / 2 - 12);

    // Player Overdrive Charge Bar (Bottom HUD)
    const barWidth = 220;
    const barHeight = 8;
    const barX = (width - barWidth) / 2;
    const barY = height - 12;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    const chargeNorm = Math.min(1, Math.max(0, overdriveCharge / 100));
    const fillWidth = barWidth * chargeNorm;

    const barColor = chargeNorm >= 1.0 ? '#ffd166' : '#00f0ff';
    ctx.fillStyle = barColor;
    this.setGlow(barColor, chargeNorm >= 1.0 ? 10 : 3);
    ctx.fillRect(barX, barY, fillWidth, barHeight);

    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = chargeNorm >= 1.0 ? '#ffd166' : 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(
      chargeNorm >= 1.0 ? 'OVERDRIVE READY [PRESS E / F / TAP]' : `OVERDRIVE: ${Math.round(overdriveCharge)}%`,
      width / 2,
      barY - 5
    );

    ctx.restore();
  }

  private drawRobotTerminal(state: RobotState, phase: BossPhase, dialogue: string | null) {
    const { width } = this.table;
    const ctx = this.ctx;
    ctx.save();

    // Robot status line
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    let statusText = `PHASE: ${phase}`;
    let color = 'rgba(0, 240, 255, 0.7)';

    if (phase === 'REDLINE') {
      statusText = 'ROBOT: REDLINE OVERHEAT [5.5 GHz]';
      color = '#ff0033';
    } else if (state === 'TRACKING') {
      statusText = 'TARGET LOCKED [PREDICTING]';
      color = '#ff2a6d';
    } else if (state === 'OVERCOMMITTED') {
      statusText = 'PUNISH WINDOW [OVERCOMMIT]';
      color = '#ffd166';
    } else if (state === 'STUNNED') {
      statusText = 'SYSTEM STUNNED [EMP ERROR]';
      color = '#9d4edd';
    }

    ctx.fillStyle = color;
    ctx.fillText(statusText, width / 2, 42);

    // Live Cyber Terminal Dialogue Banner
    if (dialogue) {
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      this.setGlow('#ff2a6d', 8);
      ctx.fillText(`[AI] "${dialogue}"`, width / 2, 60);
    }

    ctx.restore();
  }

  private drawCountdown(text: string) {
    const { width, height } = this.table;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = text.length > 2 ? '900 64px monospace' : '900 96px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    this.setGlow('#00f0ff', 16);
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
    const isPlayer = text.includes('PLAYER') || text.includes('YOU') || text.includes('GOAL');
    ctx.fillStyle = isPlayer ? '#00f0ff' : '#ff2a6d';
    this.setGlow(ctx.fillStyle, 20);
    ctx.fillText(text, width / 2, height / 2);
    ctx.restore();
  }
}
