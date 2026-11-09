import {
  DEFAULT_TABLE,
  GameState,
  GameMode,
  Puck,
  Paddle,
  Score,
  TableConfig,
  BossId,
  DifficultyLevel,
} from '../types';
import { PhysicsEngine } from '../physics';
import { RobotAI } from '../ai/robotAI';
import { DifficultyDirector } from '../ai/difficulty';
import { BossManager } from '../ai/bosses';
import { ShopManager } from '../shop/shop';
import { MultiplayerManager } from '../net/multiplayer';
import { ParticleSystem } from '../graphics/particles';
import { GameRenderer, RenderState } from '../graphics/renderer';
import { SoundEngine } from '../audio/audio';
import { InputManager } from '../input/input';
import { MatchTracker } from './insights';
import { StorageManager } from '../storage/storage';

export class Game {
  public state: GameState = 'TITLE';
  public mode: GameMode = 'SOLO_BOSS';
  public table: TableConfig = DEFAULT_TABLE;

  // Entities
  public puck: Puck;
  public puck2: Puck | null = null;
  public playerPaddle: Paddle;
  public robotPaddle: Paddle;

  // Previous state for interpolation
  private prevState: RenderState;
  private currState: RenderState;

  // Subsystems
  public physics: PhysicsEngine;
  public robot: RobotAI;
  public director: DifficultyDirector;
  public bossManager: BossManager;
  public shopManager: ShopManager;
  public net: MultiplayerManager;
  public particles: ParticleSystem;
  public renderer: GameRenderer;
  public sound: SoundEngine;
  public input: InputManager;
  public tracker: MatchTracker;

  // Overclock Kinetic Mechanics
  public clockSpeedGHz = 1.0;
  public rallyHits = 0;

  // Series & Competition Format
  public series: {
    playerGames: number;
    robotGames: number;
    targetGamesToWin: number;
    format: 'BO1' | 'BO3' | 'BO5' | 'FIRST_TO_3';
  } = {
    playerGames: 0,
    robotGames: 0,
    targetGamesToWin: 1,
    format: 'BO1',
  };

  // Game flow & timing
  public score: Score = { player: 0, robot: 0 };
  public winningScore = 7;
  public matchStartTime = 0;
  public countdownTimer = 0;
  public countdownText: string | null = null;
  public goalScoredBanner: string | null = null;
  public pointPauseTimer = 0;
  public lastConceded: 'player' | 'robot' = Math.random() > 0.5 ? 'player' : 'robot';
  private prePauseState: GameState = 'PLAYING';

  // Fixed timestep loop
  private readonly fixedDt = 1 / 120;
  private accumulator = 0;
  private lastTime = 0;
  private isRunning = false;
  private netSyncTimer = 0;
  private audioThrottleTimer = 0;
  private lastClientInputTime = 0;
  private lastStateSeq = 0;
  private netPacketSeq = 0;

  // Callbacks for UI
  public onStateChange: ((state: GameState) => void) | null = null;
  public onScoreChange: ((score: Score) => void) | null = null;
  public onMatchEnd: ((insight: string, stats: MatchTracker['stats']) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.physics = new PhysicsEngine(this.table);

    const savedSkill = StorageManager.loadDirectorSkill();
    const settings = StorageManager.loadSettings();
    const initialDifficulty = settings.difficulty || 'NORMAL';
    this.director = new DifficultyDirector(savedSkill, initialDifficulty);
    this.robot = new RobotAI(this.table, this.director.skill);
    this.bossManager = new BossManager(initialDifficulty);
    this.shopManager = new ShopManager();
    this.net = new MultiplayerManager();

    this.particles = new ParticleSystem();
    this.sound = new SoundEngine(settings);
    this.renderer = new GameRenderer(canvas, this.table, this.particles, settings);
    this.input = new InputManager(canvas, this.table);
    this.tracker = new MatchTracker();

    const equipped = this.shopManager.getEquippedColors();

    // Primary Puck
    this.puck = {
      id: 'puck_main',
      pos: { x: this.table.width / 2, y: this.table.height / 2 },
      vel: { x: 0, y: 0 },
      radius: this.table.puckRadius,
      spin: 0,
      isHyperShot: false,
      isRailgun: false,
      isGolden: false,
      trail: [],
      lastHitter: null,
      hitCount: 0,
    };

    // Player Paddle
    const isMobile =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(pointer: coarse)').matches);
    const initialPaddleRadius = isMobile ? 48 : this.table.paddleRadius;

    this.playerPaddle = {
      pos: { x: this.table.width / 2, y: this.table.height - 120 },
      vel: { x: 0, y: 0 },
      prevPos: { x: this.table.width / 2, y: this.table.height - 120 },
      radius: initialPaddleRadius,
      color: equipped.paddleColor,
      glowColor: equipped.paddleColor,
      skinId: this.shopManager.state.equippedPaddle,
      parryActive: false,
      parryTimer: 0,
      parryCooldown: 0,
      overdriveCharge: 35,
      isStunned: false,
      stunTimer: 0,
    };

    // Robot / Guest Paddle (Top)
    const boss = this.bossManager.getCurrentBoss();
    this.robotPaddle = {
      pos: { x: this.table.width / 2, y: 90 },
      vel: { x: 0, y: 0 },
      prevPos: { x: this.table.width / 2, y: 90 },
      radius: boss.paddleRadius,
      color: boss.color,
      glowColor: boss.glowColor,
      skinId: 'boss',
      parryActive: false,
      parryTimer: 0,
      parryCooldown: 0,
      overdriveCharge: 0,
      isStunned: false,
      stunTimer: 0,
    };

    this.applyBossTuning(boss.id);

    this.prevState = this.captureRenderState();
    this.currState = this.captureRenderState();

    this.setupInputs();
    this.setupMultiplayer();
  }

  private setupInputs() {
    this.input.onPauseToggle = () => this.togglePause();
    this.input.onParryTrigger = () => this.triggerPlayerParry();
    this.input.onOverdriveTrigger = () => this.triggerPlayerOverdrive();
    this.input.onMobileDetected = () => {
      this.playerPaddle.radius = 48;
      this.input.playerPaddleRadius = 48;
    };
  }

  private setupMultiplayer() {
    // When guest sends input to host
    this.net.onClientInput = (input) => {
      if (this.mode === 'MULTIPLAYER_HOST') {
        if (input.timestamp && input.timestamp < this.lastClientInputTime) return;
        this.lastClientInputTime = input.timestamp || 0;

        // Mirrored coordinates for host
        const targetX = this.table.width - input.pos.x;
        const targetY = this.table.height - input.pos.y;
        this.robotPaddle.prevPos = { ...this.robotPaddle.pos };
        this.robotPaddle.pos.x = targetX;
        this.robotPaddle.pos.y = Math.min(
          this.table.height / 2 - this.robotPaddle.radius - 5,
          Math.max(this.robotPaddle.radius, targetY)
        );
        this.robotPaddle.vel.x = -input.vel.x;
        this.robotPaddle.vel.y = -input.vel.y;

        // Standardize 1v1 multiplayer mallet size (42px) for identical, balanced competitive play
        this.robotPaddle.radius = 42;
        this.playerPaddle.radius = 42;
        this.input.playerPaddleRadius = 42;

        if (input.parry && this.robotPaddle.parryCooldown <= 0) {
          this.robotPaddle.parryActive = true;
          this.robotPaddle.parryTimer = 0.16;
          this.robotPaddle.parryCooldown = 0.65;
          this.particles.emitShockwave(this.robotPaddle.pos, 55, '#ffd166', 300);
        }

        if (input.overdrive) {
          this.puck.isRailgun = true;
          this.puck.isHyperShot = true;
          this.particles.emitEMPWave(this.robotPaddle.pos);
          this.sound.playRailgun();
          this.renderer.triggerShake(1.5, 0.4);
        }
      }
    };

    // When guest receives authoritative state packet from host
    this.net.onStatePacket = (packet) => {
      if (this.mode === 'MULTIPLAYER_GUEST') {
        if (packet.seq !== undefined && packet.seq < this.lastStateSeq) return;
        if (packet.seq !== undefined) this.lastStateSeq = packet.seq;

        // Mirrored coordinates: Guest sees their paddle at the bottom!
        const puckX = this.table.width - packet.puck.pos.x;
        const puckY = this.table.height - packet.puck.pos.y;
        const puckVelX = -packet.puck.vel.x;
        const puckVelY = -packet.puck.vel.y;

        const errX = puckX - this.puck.pos.x;
        const errY = puckY - this.puck.pos.y;
        const errDist = Math.hypot(errX, errY);

        if (errDist > 45 || this.state !== 'PLAYING') {
          this.puck.pos.x = puckX;
          this.puck.pos.y = puckY;
        } else {
          this.puck.pos.x += errX * 0.45;
          this.puck.pos.y += errY * 0.45;
        }

        this.puck.vel.x = puckVelX;
        this.puck.vel.y = puckVelY;
        this.puck.spin = -packet.puck.spin;
        this.puck.isHyperShot = packet.puck.isHyper;
        this.puck.isGolden = packet.puck.isGolden;

        // Opponent (Host) is at top - enforce matching 42px competitive radius
        this.robotPaddle.prevPos = { ...this.robotPaddle.pos };
        this.robotPaddle.pos.x = this.table.width - packet.hostPaddle.pos.x;
        this.robotPaddle.pos.y = this.table.height - packet.hostPaddle.pos.y;
        this.robotPaddle.vel.x = -packet.hostPaddle.vel.x;
        this.robotPaddle.vel.y = -packet.hostPaddle.vel.y;
        this.playerPaddle.radius = 42;
        this.robotPaddle.radius = 42;
        this.input.playerPaddleRadius = 42;
        this.robotPaddle.parryActive = packet.hostPaddle.parry;

        // Scores (mirrored)
        this.score.player = packet.score.robot;
        this.score.robot = packet.score.player;
        if (this.onScoreChange) this.onScoreChange(this.score);

        this.clockSpeedGHz = packet.clockSpeed;
        this.goalScoredBanner = packet.goalBanner;
        this.countdownText = packet.countdownText;
        if (packet.state && this.state !== packet.state) {
          this.state = packet.state as GameState;
          if (this.onStateChange) this.onStateChange(this.state);
        }
      }
    };
  }

  public applyBossTuning(bossId: BossId) {
    const boss = this.bossManager.bosses[bossId];
    if (!boss) return;

    this.robotPaddle.radius = boss.paddleRadius;
    this.robotPaddle.color = boss.color;
    this.robotPaddle.glowColor = boss.glowColor;

    const diff = this.sound.settings.difficulty || this.director.difficulty || 'NORMAL';
    this.director.setDifficulty(diff);
    this.bossManager.setDifficulty(diff);

    // Dynamic pacing: Tune robot reaction, speed cap and table drag to difficulty
    const speedMult = diff === 'CASUAL' ? 0.68 : diff === 'OVERCLOCKED' ? 1.05 : 0.84;
    const reactionAdd = diff === 'CASUAL' ? 140 : diff === 'OVERCLOCKED' ? 0 : 45;
    const puckDrag = diff === 'CASUAL' ? 0.16 : diff === 'OVERCLOCKED' ? 0.07 : 0.10;
    const initialMaxSpeed = diff === 'CASUAL' ? 1350 : diff === 'OVERCLOCKED' ? 1850 : 1600;

    this.table.puckDrag = puckDrag;
    this.physics.config.puckDrag = puckDrag;
    this.physics.setMaxSpeedLimit(initialMaxSpeed);

    this.robot.config.maxSpeed = Math.round(boss.speed * speedMult);
    this.robot.config.reactionMs = boss.reactionMs + reactionAdd;
    this.robot.say(boss.introQuote, 2.5);
  }

  public setDifficulty(level: DifficultyLevel) {
    this.director.setDifficulty(level);
    this.bossManager.setDifficulty(level);
    if (this.mode === 'SOLO_BOSS') {
      this.applyBossTuning(this.bossManager.currentBossId);
    }
  }

  public selectBoss(bossId: BossId): boolean {
    if (this.bossManager.selectBoss(bossId)) {
      this.applyBossTuning(bossId);
      return true;
    }
    return false;
  }

  public setSeriesFormat(format: 'BO1' | 'BO3' | 'BO5' | 'FIRST_TO_3') {
    let target = 1;
    let points = 7;
    if (format === 'BO3') target = 2;
    if (format === 'BO5') target = 3;
    if (format === 'FIRST_TO_3') {
      target = 1;
      points = 3;
    }
    this.winningScore = points;
    this.series = {
      playerGames: 0,
      robotGames: 0,
      targetGamesToWin: target,
      format,
    };
  }

  public startSeries(format: 'BO1' | 'BO3' | 'BO5' | 'FIRST_TO_3' = 'BO1') {
    this.setSeriesFormat(format);
    this.startMatch();
  }

  public startNextBoss(): boolean {
    const nextId = this.bossManager.getNextBossId(this.bossManager.currentBossId);
    if (nextId && this.selectBoss(nextId)) {
      this.startSeries(this.series.format);
      return true;
    }
    return false;
  }

  public refreshEquippedCosmetics() {
    const equipped = this.shopManager.getEquippedColors();
    this.playerPaddle.color = equipped.paddleColor;
    this.playerPaddle.glowColor = equipped.paddleColor;
    this.renderer.arenaSkin = equipped.arenaSkin;
    this.renderer.arenaColor = equipped.arenaColor;
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

  public goToTitle() {
    this.state = 'TITLE';
    this.sound.silenceContinuousSounds();
    if (this.onStateChange) this.onStateChange('TITLE');
  }

  public startMatch() {
    this.sound.resume();
    this.sound.startMusic();
    this.sound.speak('Match engaged. Systems overclocked.');
    this.score = { player: 0, robot: 0 };
    if (this.onScoreChange) this.onScoreChange(this.score);

    this.refreshEquippedCosmetics();
    this.tracker.reset();
    this.particles.clear();
    this.matchStartTime = performance.now();
    this.clockSpeedGHz = 1.0;
    this.rallyHits = 0;
    this.playerPaddle.overdriveCharge = 35;
    this.puck2 = null;

    if (this.mode !== 'SOLO_BOSS') {
      this.robotPaddle.color = '#ff2a6d';
      this.robotPaddle.glowColor = '#ff2a6d';
      this.playerPaddle.radius = 42;
      this.robotPaddle.radius = 42;
      this.input.playerPaddleRadius = 42;
    }

    this.resetPositions(this.lastConceded);
    this.startCountdown();
  }

  public restartMatch() {
    this.startSeries(this.series.format);
  }

  public triggerPlayerParry() {
    if (this.state !== 'PLAYING') return;
    if (this.playerPaddle.parryCooldown <= 0) {
      this.playerPaddle.parryActive = true;
      this.playerPaddle.parryTimer = 0.16;
      this.playerPaddle.parryCooldown = 0.65;
      this.particles.emitShockwave(this.playerPaddle.pos, 55, '#ffd166', 300);
      this.sound.playWallTick(400);
      this.sound.triggerHaptic(28);

      if (this.mode === 'MULTIPLAYER_GUEST') {
        this.net.sendInput({
          pos: this.playerPaddle.pos,
          vel: this.playerPaddle.vel,
          radius: this.playerPaddle.radius,
          parry: true,
          overdrive: false,
          timestamp: performance.now(),
        });
      }
    }
  }

  public triggerPlayerOverdrive() {
    if (this.state !== 'PLAYING') return;
    if (this.playerPaddle.overdriveCharge >= 100) {
      this.playerPaddle.overdriveCharge = 0;

      this.particles.emitEMPWave(this.playerPaddle.pos);
      this.sound.playRailgun();
      this.sound.speak('Overdrive EMP engaged.', true);
      this.sound.triggerHaptic([40, 30, 40, 30, 80]);
      this.renderer.triggerShake(1.5, 0.4);

      if (this.mode === 'SOLO_BOSS') {
        this.robot.triggerEMPStun(2200);
      }

      this.puck.isRailgun = true;
      this.puck.isHyperShot = true;

      if (this.mode === 'MULTIPLAYER_GUEST') {
        this.net.sendInput({
          pos: this.playerPaddle.pos,
          vel: this.playerPaddle.vel,
          radius: this.playerPaddle.radius,
          parry: false,
          overdrive: true,
          timestamp: performance.now(),
        });
      }
    }
  }

  public startCountdown(full = true) {
    this.state = 'COUNTDOWN';
    this.goalScoredBanner = null;
    this.clockSpeedGHz = 1.0;
    this.rallyHits = 0;
    this.puck.isGolden = false;

    const diff = this.sound.settings.difficulty || 'NORMAL';
    const baseSpeed = diff === 'CASUAL' ? 1350 : diff === 'OVERCLOCKED' ? 1850 : 1600;
    this.physics.setMaxSpeedLimit(baseSpeed);

    if (full) {
      this.countdownTimer = 3.2;
      this.countdownText = '3';
      this.sound.playCountdown(3);
    } else {
      // Snappy quick serve between points
      this.countdownTimer = 0.55;
      this.countdownText = 'SERVE';
      this.sound.playCountdown(0);
    }
    if (this.onStateChange) this.onStateChange(this.state);
  }

  public togglePause() {
    if (this.mode !== 'SOLO_BOSS') return; // Cannot pause live multiplayer
    if (this.state === 'PLAYING' || this.state === 'COUNTDOWN' || this.state === 'POINT_SCORED') {
      this.prePauseState = this.state;
      this.state = 'PAUSED';
      this.sound.silenceContinuousSounds();
      if (this.onStateChange) this.onStateChange(this.state);
    } else if (this.state === 'PAUSED') {
      this.state = this.prePauseState;
      this.sound.resume();
      this.sound.startMusic();
      this.lastTime = performance.now();
      if (this.onStateChange) this.onStateChange(this.state);
    }
  }

  private resetPositions(serveTo: 'player' | 'robot') {
    this.puck.pos.x = this.table.width / 2;
    this.puck.pos.y = this.table.height / 2;
    this.puck.vel.x = 0;
    this.puck.vel.y = 0;
    this.puck.spin = 0;
    this.puck.isHyperShot = false;
    this.puck.isRailgun = false;
    this.puck.isGolden = false;
    this.puck.trail = [];
    this.puck.lastHitter = null;
    this.puck2 = null;

    this.robot.reset();
    this.input.resetToHome(this.playerPaddle);

    this.robotPaddle.pos.x = this.table.width / 2;
    this.robotPaddle.pos.y = 90;
    this.robotPaddle.vel.x = 0;
    this.robotPaddle.vel.y = 0;

    this.lastConceded = serveTo;
    this.updateBossPhase();

    // Sync render states to home positions
    this.currState.puck.pos.x = this.puck.pos.x;
    this.currState.puck.pos.y = this.puck.pos.y;
    this.currState.puck.vel.x = 0;
    this.currState.puck.vel.y = 0;
    this.currState.playerPaddle.pos.x = this.playerPaddle.pos.x;
    this.currState.playerPaddle.pos.y = this.playerPaddle.pos.y;
    this.currState.robotPaddle.pos.x = this.robotPaddle.pos.x;
    this.currState.robotPaddle.pos.y = this.robotPaddle.pos.y;

    this.prevState.puck.pos.x = this.puck.pos.x;
    this.prevState.puck.pos.y = this.puck.pos.y;
    this.prevState.puck.vel.x = 0;
    this.prevState.puck.vel.y = 0;
    this.prevState.playerPaddle.pos.x = this.playerPaddle.pos.x;
    this.prevState.playerPaddle.pos.y = this.playerPaddle.pos.y;
    this.prevState.robotPaddle.pos.x = this.robotPaddle.pos.x;
    this.prevState.robotPaddle.pos.y = this.robotPaddle.pos.y;

    // Check Multi-Puck Overload at 6-6 Match Point
    if (this.score.player === 6 && this.score.robot === 6 && this.sound.settings.multiPuckOverload) {
      this.spawnSecondPuck();
    }
  }

  private spawnSecondPuck() {
    this.puck2 = {
      id: 'puck_overload',
      pos: { x: this.table.width / 2, y: this.table.height / 2 },
      vel: { x: (Math.random() - 0.5) * 500, y: Math.random() > 0.5 ? 400 : -400 },
      radius: this.table.puckRadius,
      spin: 0,
      isHyperShot: true,
      isRailgun: false,
      isGolden: false,
      trail: [],
      lastHitter: null,
      hitCount: 0,
    };
    this.particles.emitEMPWave({ x: this.table.width / 2, y: this.table.height / 2 });
    this.sound.playGlitchSound();
  }

  private updateBossPhase() {
    if (this.mode !== 'SOLO_BOSS') return;
    const currentBoss = this.bossManager.getCurrentBoss();
    if (currentBoss.id === 'APEX') {
      this.robot.setPhase('REDLINE');
      return;
    }

    if (this.score.player >= this.winningScore - 1 || this.score.robot >= this.winningScore - 1) {
      this.robot.setPhase('REDLINE');
    } else if (this.score.player >= 3 || this.score.robot >= 3) {
      this.robot.setPhase('OVERCLOCKED');
    } else {
      this.robot.setPhase('ANALYTICAL');
    }
  }

  private launchServe(serveTo: 'player' | 'robot') {
    const angleOffset = (Math.random() - 0.5) * 0.5;
    const speed = 420;
    if (serveTo === 'player') {
      this.puck.vel.x = Math.sin(angleOffset) * speed;
      this.puck.vel.y = Math.cos(angleOffset) * speed;
    } else {
      this.puck.vel.x = Math.sin(angleOffset) * speed;
      this.puck.vel.y = -Math.cos(angleOffset) * speed;
    }
  }

  private handleGoal(scorer: 'player' | 'robot') {
    // Strictly prevent duplicate goal triggering across multiple fixed steps
    if (this.state !== 'PLAYING') return;

    this.state = 'POINT_SCORED';
    this.pointPauseTimer = 0.95;
    this.accumulator = 0; // Clear physics accumulator

    // Freeze pucks and displace beyond trigger zone
    this.puck.vel.x = 0;
    this.puck.vel.y = 0;
    this.puck.pos.y = scorer === 'player' ? -this.table.puckRadius - 40 : this.table.height + this.table.puckRadius + 40;
    if (this.puck2) {
      this.puck2.vel.x = 0;
      this.puck2.vel.y = 0;
      this.puck2.pos.y = scorer === 'player' ? -this.table.puckRadius - 40 : this.table.height + this.table.puckRadius + 40;
    }

    // Strict authentic air hockey rule: 1 goal = exactly 1 point
    const pointsAwarded = 1;
    const robotWasOvercommitted = this.robot.isOvercommitted();
    const crossTableAngle = Math.abs(this.puck.vel.x) > 650;

    this.tracker.onGoalScored(scorer, robotWasOvercommitted, crossTableAngle);
    this.renderer.triggerGoalCam();
    this.sound.triggerHaptic([60, 40, 100]);

    if (scorer === 'player') {
      this.score.player += pointsAwarded;
      this.goalScoredBanner = 'GOAL!';
      this.sound.playGoalHorn(true);
      this.renderer.triggerShake(1.4, 0.4);
      this.particles.emitGoalExplosion({ x: this.table.width / 2, y: 15 }, '#00f0ff');
      this.robot.triggerGlitch(900);
      this.sound.playGlitchSound();
      this.playerPaddle.overdriveCharge = Math.min(100, this.playerPaddle.overdriveCharge + 25);
      this.shopManager.addChips(25);

      if (this.score.player === this.winningScore - 1) {
        this.sound.speak('Match point.', true);
      }
    } else {
      this.score.robot += pointsAwarded;
      this.goalScoredBanner = 'MACHINE SCORES';
      this.sound.playGoalHorn(false);
      this.renderer.triggerShake(1.4, 0.4);
      this.particles.emitGoalExplosion({ x: this.table.width / 2, y: this.table.height - 15 }, '#ff2a6d');

      if (this.mode === 'SOLO_BOSS') {
        const currentBoss = this.bossManager.getCurrentBoss();
        this.robot.say(currentBoss.victoryQuote, 2.0);
        this.sound.playRobotSpeech();

        if (this.score.robot === this.winningScore - 1) {
          this.sound.speak('Match point. Terminal error imminent.', true);
        } else if (this.score.robot - this.score.player >= 2) {
          const taunts = [
            'Your defeat is mathematically certain.',
            'Human reaction time is insufficient.',
            'Trajectory predicted.',
            'Overclock systems nominal.',
            'Machine supremacy demonstrated.'
          ];
          this.sound.speak(taunts[Math.floor(Math.random() * taunts.length)]);
        } else {
          this.sound.speak(currentBoss.victoryQuote);
        }
      } else {
        if (this.score.robot === this.winningScore - 1) {
          this.sound.speak('Match point.', true);
        } else {
          this.sound.speak('Point conceded.');
        }
      }
    }

    if (this.onScoreChange) this.onScoreChange(this.score);

    this.director.onPoint(scorer === 'player', this.score.player, this.score.robot);
    this.robot.setSkill(this.director.skill);
    this.updateBossPhase();

    this.clockSpeedGHz = 1.0;
    this.rallyHits = 0;
    this.physics.setMaxSpeedLimit(1800);
    this.puck2 = null;

    if (this.score.player >= this.winningScore || this.score.robot >= this.winningScore) {
      const gameWinner = this.score.player >= this.winningScore ? 'player' : 'robot';
      if (gameWinner === 'player') {
        this.series.playerGames++;
      } else {
        this.series.robotGames++;
      }

      const seriesOver =
        this.series.playerGames >= this.series.targetGamesToWin ||
        this.series.robotGames >= this.series.targetGamesToWin;

      if (seriesOver) {
        const playerWonSeries = this.series.playerGames >= this.series.targetGamesToWin;
        this.endMatch(playerWonSeries);
      } else {
        // Intermission between games in a series
        this.state = 'POINT_SCORED';
        this.pointPauseTimer = 2.2;
        const gameNum = this.series.playerGames + this.series.robotGames;
        this.goalScoredBanner = `GAME ${gameNum} TO ${gameWinner.toUpperCase()}! [${this.series.playerGames} - ${this.series.robotGames}]`;
        this.sound.playGoalHorn(gameWinner === 'player');
        this.renderer.triggerShake(1.5, 0.4);

        // Reset points for next game in series
        this.score = { player: 0, robot: 0 };
        if (this.onScoreChange) this.onScoreChange(this.score);
        if (this.onStateChange) this.onStateChange(this.state);
      }
    } else {
      if (this.onStateChange) this.onStateChange(this.state);
    }
  }

  private endMatch(playerWon: boolean) {
    this.state = 'MATCH_END';
    this.sound.silenceContinuousSounds();

    if (playerWon) {
      this.sound.speak('Victory confirmed.', true);
    } else {
      this.sound.speak('System compromised. Defeat.', true);
    }

    const durationSec = (performance.now() - this.matchStartTime) / 1000;
    this.tracker.stats.durationSeconds = Math.round(durationSec);
    this.tracker.stats.winner = playerWon ? 'player' : 'robot';
    this.tracker.stats.maxClockSpeedGHz = Number(this.clockSpeedGHz.toFixed(1));
    this.tracker.stats.seriesFormat = this.series.format;
    this.tracker.stats.seriesGames = `${this.series.playerGames} - ${this.series.robotGames}`;

    const chipsEarned = playerWon ? 80 + this.tracker.stats.parriesCount * 15 : 25;
    this.tracker.stats.chipsEarned = chipsEarned;
    this.shopManager.addChips(chipsEarned);

    if (this.mode === 'SOLO_BOSS') {
      const currentBoss = this.bossManager.getCurrentBoss();
      if (playerWon) {
        const diff = this.sound.settings.difficulty || this.director.difficulty || 'NORMAL';
        this.bossManager.recordDefeat(currentBoss.id, diff);
        this.robot.say(currentBoss.defeatQuote, 3.0);
      }

      this.director.onGameEnd(playerWon);
      StorageManager.saveDirectorSkill(this.director.skill);
      this.robot.setSkill(this.director.skill);

      StorageManager.recordMatch(
        playerWon,
        this.score.player,
        this.score.robot,
        durationSec,
        this.tracker.stats.parriesCount
      );
    }

    const insight = this.tracker.generateInsight(playerWon);

    if (this.onMatchEnd) {
      this.onMatchEnd(insight, this.tracker.stats);
    }
    if (this.onStateChange) this.onStateChange(this.state);
  }

  private fixedStep() {
    if (this.state !== 'PLAYING') return;
    const now = performance.now();

    // 1. Update Player Input
    this.input.update(this.fixedDt, this.playerPaddle);

    if (this.mode === 'MULTIPLAYER_GUEST') {
      this.net.sendInput({
        pos: this.playerPaddle.pos,
        vel: this.playerPaddle.vel,
        radius: this.playerPaddle.radius,
        parry: this.playerPaddle.parryActive,
        overdrive: false,
        timestamp: performance.now(),
      });

      // Client-side prediction for puck between 60Hz host updates
      if (this.state === 'PLAYING') {
        this.puck.pos.x += this.puck.vel.x * this.fixedDt;
        this.puck.pos.y += this.puck.vel.y * this.fixedDt;

        // Side wall bounce
        if (this.puck.pos.x - this.puck.radius < 0) {
          this.puck.pos.x = this.puck.radius;
          this.puck.vel.x = Math.abs(this.puck.vel.x) * this.table.wallRestitution;
        } else if (this.puck.pos.x + this.puck.radius > this.table.width) {
          this.puck.pos.x = this.table.width - this.puck.radius;
          this.puck.vel.x = -Math.abs(this.puck.vel.x) * this.table.wallRestitution;
        }

        // Local collision check between guest's own mallet and puck so hits are instant
        const dx = this.puck.pos.x - this.playerPaddle.pos.x;
        const dy = this.puck.pos.y - this.playerPaddle.pos.y;
        const dist = Math.hypot(dx, dy);
        const minDist = this.puck.radius + this.playerPaddle.radius;

        if (dist < minDist && dist > 0.001) {
          const nx = dx / dist;
          const ny = dy / dist;
          const relVelX = this.puck.vel.x - this.playerPaddle.vel.x;
          const relVelY = this.puck.vel.y - this.playerPaddle.vel.y;
          const normalVel = relVelX * nx + relVelY * ny;

          if (normalVel < 0) {
            const impulse = -1.46 * normalVel;
            this.puck.vel.x += nx * impulse + this.playerPaddle.vel.x * 0.32;
            this.puck.vel.y += ny * impulse + this.playerPaddle.vel.y * 0.32;
            this.puck.pos.x = this.playerPaddle.pos.x + nx * (minDist + 1);
            this.puck.pos.y = this.playerPaddle.pos.y + ny * (minDist + 1);

            this.sound.playPaddleHit(Math.hypot(this.puck.vel.x, this.puck.vel.y), this.puck.isHyperShot);
            this.particles.emitSparks(this.puck.pos, 16, this.playerPaddle.color, 1.2, { x: nx, y: ny });
          }
        }
      }
      return; // Guest runs local prediction between authoritative host packets
    }

    if (this.mode === 'MULTIPLAYER_HOST') {
      // Tick parry timer down for guest paddle on host
      if (this.robotPaddle.parryTimer > 0) {
        this.robotPaddle.parryTimer -= this.fixedDt;
        if (this.robotPaddle.parryTimer <= 0) {
          this.robotPaddle.parryActive = false;
        }
      }
      if (this.robotPaddle.parryCooldown > 0) {
        this.robotPaddle.parryCooldown -= this.fixedDt;
      }
    }

    // 2. Update Robot AI (Solo Boss Mode)
    if (this.mode === 'SOLO_BOSS') {
      this.robot.update(this.fixedDt, now, this.puck, this.robotPaddle);

      // VIPER boss signature: auto-curve on hit
      if (this.bossManager.currentBossId === 'VIPER' && this.puck.lastHitter === 'robot') {
        this.puck.spin = 28;
      }
    }

    // 3. Step Physics for primary puck
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
        this.rallyHits++;

        const diff = this.sound.settings.difficulty || 'NORMAL';
        const clockRamp = diff === 'CASUAL' ? 0.08 : diff === 'OVERCLOCKED' ? 0.28 : 0.16;
        const maxGHz = diff === 'CASUAL' ? 2.5 : diff === 'OVERCLOCKED' ? 5.5 : 3.8;
        const baseSpeed = diff === 'CASUAL' ? 1350 : diff === 'OVERCLOCKED' ? 1850 : 1600;
        const speedScale = diff === 'CASUAL' ? 100 : diff === 'OVERCLOCKED' ? 180 : 130;

        this.clockSpeedGHz = Math.min(maxGHz, 1.0 + this.rallyHits * clockRamp);
        this.physics.setMaxSpeedLimit(baseSpeed + (this.clockSpeedGHz - 1.0) * speedScale);

        if (c.isParry) {
          this.tracker.stats.parriesCount++;
          this.sound.playParry();
          this.particles.emitParryBlast(c.pos);
          this.renderer.triggerShake(1.2, 0.25);

          this.playerPaddle.overdriveCharge = Math.min(100, this.playerPaddle.overdriveCharge + 35);
          this.robot.say('PARRY DETECTED: REFLECTED TRAJECTORY!', 1.8);
          this.sound.playRobotSpeech();
        } else {
          this.sound.playPaddleHit(c.speed, this.puck.isHyperShot);
          const hitColor = hitter === 'player' ? this.playerPaddle.color : this.robotPaddle.color;
          this.particles.emitSparks(c.pos, 10, hitColor, 1.1, c.normal);
          this.particles.emitShockwave(c.pos, 40, hitColor, 320);

          if (hitter === 'player') {
            this.playerPaddle.overdriveCharge = Math.min(100, this.playerPaddle.overdriveCharge + 8);
          }

          if (c.speed > 1300) {
            this.renderer.triggerShake(0.6, 0.12);
          }
        }
      } else if (c.type === 'wall') {
        this.tracker.onWallBounce();
        this.sound.playWallTick(c.speed);
        this.particles.emitSparks(c.pos, 5, '#ffffff', 0.8, c.normal);
      } else if (c.type === 'post') {
        this.sound.playPostBounce();
        this.particles.emitSparks(c.pos, 12, '#ffcc00', 1.3, c.normal);
      }
    }

    // Step Physics for secondary puck (Overload mode)
    if (this.puck2) {
      const res2 = this.physics.update(
        this.fixedDt,
        this.puck2,
        this.playerPaddle,
        this.robotPaddle
      );
      if (res2.goal) {
        this.handleGoal(res2.goal);
      }
    }

    // 4. Update Puck Trails (Zero-allocation ring reuse, capped at 14 segments for fast rendering)
    const puckSpeed = Math.hypot(this.puck.vel.x, this.puck.vel.y);
    this.tracker.onPuckSpeed(puckSpeed);

    const maxTrail = 14;
    if (this.puck.trail.length >= maxTrail) {
      const reused = this.puck.trail.shift()!;
      reused.x = this.puck.pos.x;
      reused.y = this.puck.pos.y;
      reused.speed = puckSpeed;
      reused.alpha = 1.0;
      this.puck.trail.push(reused);
    } else {
      this.puck.trail.push({
        x: this.puck.pos.x,
        y: this.puck.pos.y,
        speed: puckSpeed,
        alpha: 1.0,
      });
    }
    for (let i = 0; i < this.puck.trail.length; i++) {
      this.puck.trail[i].alpha *= 0.88;
    }

    // 5. Update Audio (Throttled to ~30Hz to prevent audio thread flooding)
    this.audioThrottleTimer += this.fixedDt;
    if (this.audioThrottleTimer >= 0.033) {
      this.audioThrottleTimer = 0;
      this.sound.updatePuckHum(puckSpeed, this.clockSpeedGHz);
      this.sound.updateRobotServo(this.robot.currentSpeed, this.robot.phase === 'REDLINE');
      this.sound.updateMusicClock(this.clockSpeedGHz);
    }

    // 6. Broadcast state if Multiplayer Host (60 Hz)
    if (this.mode === 'MULTIPLAYER_HOST') {
      this.netSyncTimer += this.fixedDt;
      if (this.netSyncTimer >= 1 / 60) {
        this.netSyncTimer = 0;
        this.net.sendState({
          puck: {
            pos: this.puck.pos,
            vel: this.puck.vel,
            spin: this.puck.spin,
            isHyper: this.puck.isHyperShot,
            isGolden: false,
          },
          hostPaddle: {
            pos: this.playerPaddle.pos,
            vel: this.playerPaddle.vel,
            radius: this.playerPaddle.radius,
            parry: this.playerPaddle.parryActive,
          },
          guestPaddle: {
            pos: this.robotPaddle.pos,
            vel: this.robotPaddle.vel,
            radius: this.robotPaddle.radius,
            parry: this.robotPaddle.parryActive,
          },
          score: this.score,
          clockSpeed: this.clockSpeedGHz,
          goalBanner: this.goalScoredBanner,
          state: this.state,
          countdownText: this.countdownText,
          seq: ++this.netPacketSeq,
        });
      }
    }

    // 7. Check Goal
    if (goal) {
      this.handleGoal(goal);
    }
  }

  private loop(timestamp: number) {
    if (!this.isRunning) return;

    // Idle throttle: When on TITLE or PAUSED, the canvas is covered by UI overlays.
    // Pause physics and canvas drawing to stop phone CPU/GPU from heating up.
    if (this.state === 'TITLE' || this.state === 'PAUSED') {
      this.lastTime = timestamp;
      requestAnimationFrame((t) => this.loop(t));
      return;
    }

    const frameTime = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    if (this.state === 'COUNTDOWN') {
      this.input.update(frameTime, this.playerPaddle);
      if (this.mode === 'MULTIPLAYER_GUEST') {
        this.net.sendInput({
          pos: this.playerPaddle.pos,
          vel: this.playerPaddle.vel,
          radius: this.playerPaddle.radius,
          parry: false,
          overdrive: false,
          timestamp: performance.now(),
        });
      }

      this.countdownTimer -= frameTime;
      if (this.countdownText === 'SERVE') {
        if (this.countdownTimer <= 0) {
          this.countdownText = null;
          this.state = 'PLAYING';
          this.launchServe(this.lastConceded);
          if (this.onStateChange) this.onStateChange(this.state);
        }
      } else {
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
    }

    if (this.state === 'POINT_SCORED') {
      this.input.update(frameTime, this.playerPaddle);
      this.pointPauseTimer -= frameTime;
      if (this.pointPauseTimer <= 0) {
        const nextServeTo =
          this.goalScoredBanner?.includes('PLAYER') || this.goalScoredBanner?.includes('GOAL')
            ? 'robot'
            : 'player';
        this.resetPositions(nextServeTo);
        this.lastConceded = nextServeTo;

        // If a new series game just started (scores reset to 0-0), do full 3-2-1 countdown;
        // Otherwise do a snappy instant serve between regular points!
        const isFreshGame = this.score.player === 0 && this.score.robot === 0;
        this.startCountdown(isFreshGame);
      }
    }

    if (this.state === 'PLAYING') {
      this.accumulator += frameTime;
      let steps = 0;
      while (this.accumulator >= this.fixedDt && this.state === 'PLAYING' && steps < 4) {
        this.prevState.puck.pos.x = this.currState.puck.pos.x;
        this.prevState.puck.pos.y = this.currState.puck.pos.y;
        this.prevState.puck.vel.x = this.currState.puck.vel.x;
        this.prevState.puck.vel.y = this.currState.puck.vel.y;
        this.prevState.playerPaddle.pos.x = this.currState.playerPaddle.pos.x;
        this.prevState.playerPaddle.pos.y = this.currState.playerPaddle.pos.y;
        this.prevState.robotPaddle.pos.x = this.currState.robotPaddle.pos.x;
        this.prevState.robotPaddle.pos.y = this.currState.robotPaddle.pos.y;

        this.fixedStep();

        this.currState.puck.pos.x = this.puck.pos.x;
        this.currState.puck.pos.y = this.puck.pos.y;
        this.currState.puck.vel.x = this.puck.vel.x;
        this.currState.puck.vel.y = this.puck.vel.y;
        this.currState.playerPaddle.pos.x = this.playerPaddle.pos.x;
        this.currState.playerPaddle.pos.y = this.playerPaddle.pos.y;
        this.currState.robotPaddle.pos.x = this.robotPaddle.pos.x;
        this.currState.robotPaddle.pos.y = this.robotPaddle.pos.y;

        this.accumulator -= this.fixedDt;
        steps++;
      }
      if (steps >= 4) {
        this.accumulator = 0;
      }
    }

    this.particles.update(frameTime);
    this.renderer.update(frameTime);

    const interpAlpha =
      this.state === 'PLAYING' && this.fixedDt > 0
        ? Math.min(1, Math.max(0, this.accumulator / this.fixedDt))
        : 1;

    this.renderer.render(
      this.currState,
      this.prevState,
      interpAlpha,
      this.puck,
      this.puck2,
      this.playerPaddle,
      this.robotPaddle,
      this.robot.state,
      this.robot.phase,
      this.robot.currentDialogue,
      this.robot.prediction,
      this.clockSpeedGHz,
      this.score,
      this.countdownText,
      this.goalScoredBanner
    );

    requestAnimationFrame((t) => this.loop(t));
  }
}
