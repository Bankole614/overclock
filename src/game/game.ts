import {
  DEFAULT_TABLE,
  GameState,
  Puck,
  Paddle,
  Score,
  TableConfig,
} from '../types';
import { PhysicsEngine } from '../physics';
import { RobotAI } from '../ai/robotAI';
import { DifficultyDirector } from '../ai/difficulty';
import { ParticleSystem } from '../graphics/particles';
import { GameRenderer, RenderState } from '../graphics/renderer';
import { SoundEngine } from '../audio/audio';
import { InputManager } from '../input/input';
import { MatchTracker } from './insights';
import { StorageManager } from '../storage/storage';

export class Game {
  public state: GameState = 'TITLE';
  public table: TableConfig = DEFAULT_TABLE;

  // Entities
  public puck: Puck;
  public playerPaddle: Paddle;
  public robotPaddle: Paddle;

  // Previous state for interpolation
  private prevState: RenderState;
  private currState: RenderState;

  // Subsystems
  public physics: PhysicsEngine;
  public robot: RobotAI;
  public director: DifficultyDirector;
  public particles: ParticleSystem;
  public renderer: GameRenderer;
  public sound: SoundEngine;
  public input: InputManager;
  public tracker: MatchTracker;

  // Game flow & timing
  public score: Score = { player: 0, robot: 0 };
  public winningScore = 7;
  public matchStartTime = 0;
  public countdownTimer = 0;
  public countdownText: string | null = null;
  public goalScoredBanner: string | null = null;
  public pointPauseTimer = 0;
  public lastConceded: 'player' | 'robot' = Math.random() > 0.5 ? 'player' : 'robot';

  // Fixed timestep loop
  private readonly fixedDt = 1 / 120; // 120 Hz fixed physics
  private accumulator = 0;
  private lastTime = 0;
  private hitStopFrames = 0;
  private isRunning = false;

  // Callbacks for UI updates
  public onStateChange: ((state: GameState) => void) | null = null;
  public onScoreChange: ((score: Score) => void) | null = null;
  public onMatchEnd: ((insight: string, stats: MatchTracker['stats']) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.physics = new PhysicsEngine(this.table);

    const savedSkill = StorageManager.loadDirectorSkill();
    this.director = new DifficultyDirector(savedSkill);
    this.robot = new RobotAI(this.table, this.director.skill);

    this.particles = new ParticleSystem();
    const settings = StorageManager.loadSettings();
    this.sound = new SoundEngine(settings);
    this.renderer = new GameRenderer(canvas, this.table, this.particles, settings);
    this.input = new InputManager(canvas, this.table);
    this.tracker = new MatchTracker();

    // Initialize puck & paddles
    this.puck = {
      pos: { x: this.table.width / 2, y: this.table.height / 2 },
      vel: { x: 0, y: 0 },
      radius: this.table.puckRadius,
      trail: [],
      lastHitter: null,
      hitCount: 0,
    };

    this.playerPaddle = {
      pos: { x: this.table.width / 2, y: this.table.height - 120 },
      vel: { x: 0, y: 0 },
      prevPos: { x: this.table.width / 2, y: this.table.height - 120 },
      radius: this.table.paddleRadius,
      color: '#00f0ff',
      glowColor: '#00f0ff',
    };

    this.robotPaddle = {
      pos: { x: this.table.width / 2, y: 90 },
      vel: { x: 0, y: 0 },
      prevPos: { x: this.table.width / 2, y: 90 },
      radius: this.table.paddleRadius,
      color: '#ff2a6d',
      glowColor: '#ff2a6d',
    };

    this.prevState = this.captureRenderState();
    this.currState = this.captureRenderState();

    this.input.onPauseToggle = () => this.togglePause();
  }

  private captureRenderState(): RenderState {
    return {
      puck: { pos: { ...this.puck.pos }, vel: { ...this.puck.vel } },
      playerPaddle: { pos: { ...this.playerPaddle.pos } },
      robotPaddle: { pos: { ...this.robotPaddle.pos } },
    };
  }

  public init() {
    this.sound.init();
    this.lastTime = performance.now();
    this.isRunning = true;
    requestAnimationFrame((t) => this.loop(t));
  }

  public startMatch() {
    this.sound.resume();
    this.score = { player: 0, robot: 0 };
    if (this.onScoreChange) this.onScoreChange(this.score);

    this.tracker.reset();
    this.particles.clear();
    this.matchStartTime = performance.now();

    this.resetPositions(this.lastConceded);
    this.startCountdown();
  }

  public restartMatch() {
    this.startMatch();
  }

  private startCountdown() {
    this.state = 'COUNTDOWN';
    this.countdownTimer = 3.2; // 3, 2, 1, GO
    this.countdownText = '3';
    this.goalScoredBanner = null;
    this.sound.playCountdown(3);
    if (this.onStateChange) this.onStateChange(this.state);
  }

  public togglePause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
      if (this.onStateChange) this.onStateChange(this.state);
    } else if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
      if (this.onStateChange) this.onStateChange(this.state);
    }
  }

  private resetPositions(serveTo: 'player' | 'robot') {
    this.puck.pos.x = this.table.width / 2;
    this.puck.pos.y = this.table.height / 2;
    this.puck.vel.x = 0;
    this.puck.vel.y = 0;
    this.puck.trail = [];
    this.puck.lastHitter = null;

    // Paddle starting positions
    this.robot.reset();
    this.input.resetToHome(this.playerPaddle);
    this.robotPaddle.pos.x = this.table.width / 2;
    this.robotPaddle.pos.y = 90;
    this.robotPaddle.vel.x = 0;
    this.robotPaddle.vel.y = 0;

    this.lastConceded = serveTo;
  }

  private launchServe(serveTo: 'player' | 'robot') {
    const angleOffset = (Math.random() - 0.5) * 0.5;
    const speed = 400;
    if (serveTo === 'player') {
      // Toward player (positive Y)
      this.puck.vel.x = Math.sin(angleOffset) * speed;
      this.puck.vel.y = Math.cos(angleOffset) * speed;
    } else {
      // Toward robot (negative Y)
      this.puck.vel.x = Math.sin(angleOffset) * speed;
      this.puck.vel.y = -Math.cos(angleOffset) * speed;
    }
  }

  private handleGoal(scorer: 'player' | 'robot') {
    this.state = 'POINT_SCORED';
    this.pointPauseTimer = 1.3; // 1.3s celebration before reset

    const robotWasOvercommitted = this.robot.isOvercommitted();
    const crossTableAngle = Math.abs(this.puck.vel.x) > 600;

    this.tracker.onGoalScored(scorer, robotWasOvercommitted, crossTableAngle);

    if (scorer === 'player') {
      this.score.player++;
      this.goalScoredBanner = 'GOAL!';
      this.sound.playGoalHorn(true);
      this.renderer.triggerShake(1.2, 0.4);
      this.particles.emitGoalExplosion(
        { x: this.table.width / 2, y: 15 },
        '#00f0ff'
      );
      this.robot.triggerGlitch(900);
      this.sound.playGlitchSound();
    } else {
      this.score.robot++;
      this.goalScoredBanner = 'MACHINE SCORES';
      this.sound.playGoalHorn(false);
      this.renderer.triggerShake(1.4, 0.4);
      this.particles.emitGoalExplosion(
        { x: this.table.width / 2, y: this.table.height - 15 },
        '#ff2a6d'
      );
    }

    if (this.onScoreChange) this.onScoreChange(this.score);

    // Update Difficulty Director per point
    this.director.onPoint(scorer === 'player', this.score.player, this.score.robot);
    this.robot.setSkill(this.director.skill);

    // Dynamic tension drone near match point
    if (this.score.player >= this.winningScore - 1 || this.score.robot >= this.winningScore - 1) {
      this.sound.setTensionLevel(1.0);
    } else if (this.score.player >= 4 || this.score.robot >= 4) {
      this.sound.setTensionLevel(0.5);
    } else {
      this.sound.setTensionLevel(0);
    }

    // Check Match Win condition (first to 7 points)
    if (this.score.player >= this.winningScore || this.score.robot >= this.winningScore) {
      this.endMatch(this.score.player >= this.winningScore);
    } else {
      if (this.onStateChange) this.onStateChange(this.state);
    }
  }

  private endMatch(playerWon: boolean) {
    this.state = 'MATCH_END';
    this.sound.setTensionLevel(0);

    const durationSec = (performance.now() - this.matchStartTime) / 1000;
    this.tracker.stats.durationSeconds = Math.round(durationSec);
    this.tracker.stats.winner = playerWon ? 'player' : 'robot';

    // Update Director after match
    this.director.onGameEnd(playerWon);
    StorageManager.saveDirectorSkill(this.director.skill);
    this.robot.setSkill(this.director.skill);

    // Save lifetime stats
    StorageManager.recordMatch(
      playerWon,
      this.score.player,
      this.score.robot,
      durationSec
    );

    const insight = this.tracker.generateInsight(playerWon);

    if (this.onMatchEnd) {
      this.onMatchEnd(insight, this.tracker.stats);
    }
    if (this.onStateChange) this.onStateChange(this.state);
  }

  private fixedStep() {
    const now = performance.now();

    // 1. Update Player Input
    this.input.update(this.fixedDt, this.playerPaddle);

    // 2. Update Robot AI
    this.robot.update(this.fixedDt, now, this.puck, this.robotPaddle);

    // 3. Step Physics
    const { collisions, goal } = this.physics.update(
      this.fixedDt,
      this.puck,
      this.playerPaddle,
      this.robotPaddle
    );

    // Process collisions
    for (const c of collisions) {
      if (c.type === 'paddle') {
        const hitter = c.target || 'player';
        this.tracker.onHit(hitter);
        this.sound.playPaddleHit(c.speed);

        // Sparks and shockwaves
        const hitColor = hitter === 'player' ? '#00f0ff' : '#ff2a6d';
        this.particles.emitSparks(c.pos, 16, hitColor, 1.2, c.normal);
        this.particles.emitShockwave(c.pos, 45, hitColor, 320);

        // Screen shake & hit stop on smash hits
        if (c.speed > 1300) {
          this.renderer.triggerShake(c.speed / 1800, 0.18);
          this.hitStopFrames = 3; // 3 frames freeze
        } else if (c.speed > 900) {
          this.renderer.triggerShake(0.3, 0.1);
        }
      } else if (c.type === 'wall') {
        this.tracker.onWallBounce();
        this.sound.playWallTick(c.speed);
        this.particles.emitSparks(c.pos, 8, '#ffffff', 0.8, c.normal);
        if (c.speed > 1100) {
          this.renderer.triggerShake(0.2, 0.1);
        }
      } else if (c.type === 'post') {
        this.sound.playPostBounce();
        this.particles.emitSparks(c.pos, 20, '#ffcc00', 1.5, c.normal);
        this.renderer.triggerShake(0.4, 0.15);
      }
    }

    // 4. Update Puck Trail
    const puckSpeed = Math.hypot(this.puck.vel.x, this.puck.vel.y);
    this.tracker.onPuckSpeed(puckSpeed);

    this.puck.trail.push({
      x: this.puck.pos.x,
      y: this.puck.pos.y,
      speed: puckSpeed,
      alpha: 1.0,
    });
    if (this.puck.trail.length > 25) {
      this.puck.trail.shift();
    }
    for (const pt of this.puck.trail) {
      pt.alpha *= 0.91;
    }

    // 5. Update Continuous Sounds
    this.sound.updatePuckHum(puckSpeed);
    this.sound.updateRobotServo(this.robot.currentSpeed);

    // 6. Check Goal
    if (goal) {
      this.handleGoal(goal);
    }
  }

  private loop(timestamp: number) {
    if (!this.isRunning) return;

    const frameTime = Math.min((timestamp - this.lastTime) / 1000, 0.1); // cap max delta
    this.lastTime = timestamp;

    // Handle Countdown
    if (this.state === 'COUNTDOWN') {
      this.countdownTimer -= frameTime;
      const count = Math.ceil(this.countdownTimer);
      if (count > 0) {
        if (this.countdownText !== count.toString()) {
          this.countdownText = count.toString();
          this.sound.playCountdown(count);
        }
      } else if (this.countdownTimer > -0.6) {
        if (this.countdownText !== 'GO!') {
          this.countdownText = 'GO!';
          this.sound.playCountdown(0);
          this.launchServe(this.lastConceded);
        }
      } else {
        this.countdownText = null;
        this.state = 'PLAYING';
        if (this.onStateChange) this.onStateChange(this.state);
      }
    }

    // Handle Point Scored Pause
    if (this.state === 'POINT_SCORED') {
      this.pointPauseTimer -= frameTime;
      if (this.pointPauseTimer <= 0) {
        const nextServeTo = this.goalScoredBanner?.includes('PLAYER') ? 'robot' : 'player';
        this.resetPositions(nextServeTo);
        this.startCountdown();
      }
    }

    // Hit-stop frames freeze physics
    if (this.hitStopFrames > 0) {
      this.hitStopFrames--;
    } else if (this.state === 'PLAYING') {
      this.accumulator += frameTime;
      while (this.accumulator >= this.fixedDt) {
        this.prevState = this.currState;
        this.fixedStep();
        this.currState = this.captureRenderState();
        this.accumulator -= this.fixedDt;
      }
    }

    // Update visuals & particles
    this.particles.update(frameTime);
    this.renderer.update(frameTime);

    // Interpolation alpha
    const interpAlpha =
      this.state === 'PLAYING' && this.fixedDt > 0
        ? Math.min(1, Math.max(0, this.accumulator / this.fixedDt))
        : 1;

    // Render frame
    this.renderer.render(
      this.currState,
      this.prevState,
      interpAlpha,
      this.puck,
      this.playerPaddle,
      this.robotPaddle,
      this.robot.state,
      this.robot.prediction,
      this.score,
      this.countdownText,
      this.goalScoredBanner
    );

    requestAnimationFrame((t) => this.loop(t));
  }
}
