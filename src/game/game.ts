import {
  DEFAULT_TABLE,
  GameState,
  GameMode,
  Puck,
  Paddle,
  Score,
  TableConfig,
  BossId,
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

  // Fixed timestep loop
  private readonly fixedDt = 1 / 120;
  private accumulator = 0;
  private lastTime = 0;
  private hitStopFrames = 0;
  private isRunning = false;
  private netSyncTimer = 0;

  // Callbacks for UI
  public onStateChange: ((state: GameState) => void) | null = null;
  public onScoreChange: ((score: Score) => void) | null = null;
  public onMatchEnd: ((insight: string, stats: MatchTracker['stats']) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.physics = new PhysicsEngine(this.table);

    const savedSkill = StorageManager.loadDirectorSkill();
    this.director = new DifficultyDirector(savedSkill);
    this.robot = new RobotAI(this.table, this.director.skill);
    this.bossManager = new BossManager();
    this.shopManager = new ShopManager();
    this.net = new MultiplayerManager();

    this.particles = new ParticleSystem();
    const settings = StorageManager.loadSettings();
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
    this.playerPaddle = {
      pos: { x: this.table.width / 2, y: this.table.height - 120 },
      vel: { x: 0, y: 0 },
      prevPos: { x: this.table.width / 2, y: this.table.height - 120 },
      radius: this.table.paddleRadius,
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
  }

  private setupMultiplayer() {
    // When guest sends input to host
    this.net.onClientInput = (input) => {
      if (this.mode === 'MULTIPLAYER_HOST') {
        // Mirrored coordinates for host
        const targetX = this.table.width - input.pos.x;
        const targetY = this.table.height - input.pos.y;
        this.robotPaddle.pos.x = targetX;
        this.robotPaddle.pos.y = Math.min(this.table.height / 2 - this.robotPaddle.radius - 5, Math.max(this.robotPaddle.radius, targetY));

        if (input.parry && this.robotPaddle.parryCooldown <= 0) {
          this.robotPaddle.parryActive = true;
          this.robotPaddle.parryTimer = 0.16;
          this.robotPaddle.parryCooldown = 0.65;
          this.particles.emitShockwave(this.robotPaddle.pos, 55, '#ffd166', 300);
        }
      }
    };

    // When guest receives authoritative state packet from host
    this.net.onStatePacket = (packet) => {
      if (this.mode === 'MULTIPLAYER_GUEST') {
        // Mirrored coordinates: Guest sees their paddle at the bottom!
        this.puck.pos.x = this.table.width - packet.puck.pos.x;
        this.puck.pos.y = this.table.height - packet.puck.pos.y;
        this.puck.vel.x = -packet.puck.vel.x;
        this.puck.vel.y = -packet.puck.vel.y;
        this.puck.spin = -packet.puck.spin;
        this.puck.isHyperShot = packet.puck.isHyper;
        this.puck.isGolden = packet.puck.isGolden;

        // Opponent (Host) is at top
        this.robotPaddle.pos.x = this.table.width - packet.hostPaddle.pos.x;
        this.robotPaddle.pos.y = this.table.height - packet.hostPaddle.pos.y;

        // Scores (mirrored)
        this.score.player = packet.score.robot;
        this.score.robot = packet.score.player;
        if (this.onScoreChange) this.onScoreChange(this.score);

        this.clockSpeedGHz = packet.clockSpeed;
        this.goalScoredBanner = packet.goalBanner;
      }
    };
  }

  public applyBossTuning(bossId: BossId) {
    const boss = this.bossManager.bosses[bossId];
    if (!boss) return;

    this.robotPaddle.radius = boss.paddleRadius;
    this.robotPaddle.color = boss.color;
    this.robotPaddle.glowColor = boss.glowColor;

    this.robot.config.maxSpeed = boss.speed;
    this.robot.config.reactionMs = boss.reactionMs;
    this.robot.say(boss.introQuote, 2.5);
  }

  public selectBoss(bossId: BossId) {
    if (this.bossManager.selectBoss(bossId)) {
      this.applyBossTuning(bossId);
    }
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
    if (nextId) {
      this.selectBoss(nextId);
      this.startSeries(this.series.format);
      return true;
    }
    return false;
  }

  public refreshEquippedCosmetics() {
    const equipped = this.shopManager.getEquippedColors();
    this.playerPaddle.color = equipped.paddleColor;
    this.playerPaddle.glowColor = equipped.paddleColor;
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

    this.refreshEquippedCosmetics();
    this.tracker.reset();
    this.particles.clear();
    this.matchStartTime = performance.now();
    this.clockSpeedGHz = 1.0;
    this.rallyHits = 0;
    this.playerPaddle.overdriveCharge = 35;
    this.puck2 = null;

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

      if (this.mode === 'MULTIPLAYER_GUEST') {
        this.net.sendInput({
          pos: this.playerPaddle.pos,
          parry: true,
          overdrive: false,
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
      this.renderer.triggerShake(1.5, 0.4);

      if (this.mode === 'SOLO_BOSS') {
        this.robot.triggerEMPStun(2200);
      }

      this.puck.isRailgun = true;
      this.puck.isHyperShot = true;

      if (this.mode === 'MULTIPLAYER_GUEST') {
        this.net.sendInput({
          pos: this.playerPaddle.pos,
          parry: false,
          overdrive: true,
        });
      }
    }
  }

  private startCountdown() {
    this.state = 'COUNTDOWN';
    this.countdownTimer = 3.2;
    this.countdownText = '3';
    this.goalScoredBanner = null;
    this.clockSpeedGHz = 1.0;
    this.rallyHits = 0;
    this.puck.isGolden = false;
    this.sound.playCountdown(3);
    if (this.onStateChange) this.onStateChange(this.state);
  }

  public togglePause() {
    if (this.mode !== 'SOLO_BOSS') return; // Cannot pause live multiplayer
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

  private handleGoal(scorer: 'player' | 'robot', isGolden = false) {
    this.state = 'POINT_SCORED';
    this.pointPauseTimer = 1.35;

    const pointsAwarded = isGolden ? 2 : 1;
    const robotWasOvercommitted = this.robot.isOvercommitted();
    const crossTableAngle = Math.abs(this.puck.vel.x) > 650;

    this.tracker.onGoalScored(scorer, robotWasOvercommitted, crossTableAngle);

    if (scorer === 'player') {
      this.score.player += pointsAwarded;
      this.goalScoredBanner = isGolden ? 'GOLDEN GOAL! (+2)' : 'GOAL!';
      this.sound.playGoalHorn(true);
      this.renderer.triggerShake(1.4, 0.4);
      this.particles.emitGoalExplosion({ x: this.table.width / 2, y: 15 }, '#00f0ff');
      this.robot.triggerGlitch(900);
      this.sound.playGlitchSound();
      this.playerPaddle.overdriveCharge = Math.min(100, this.playerPaddle.overdriveCharge + 25);
      this.shopManager.addChips(20 * pointsAwarded);
    } else {
      this.score.robot += pointsAwarded;
      this.goalScoredBanner = isGolden ? 'MACHINE GOLDEN GOAL!' : 'MACHINE SCORES';
      this.sound.playGoalHorn(false);
      this.renderer.triggerShake(1.4, 0.4);
      this.particles.emitGoalExplosion({ x: this.table.width / 2, y: this.table.height - 15 }, '#ff2a6d');

      const currentBoss = this.bossManager.getCurrentBoss();
      this.robot.say(currentBoss.victoryQuote, 2.0);
      this.sound.playRobotSpeech();
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
    this.sound.setTensionLevel(0);

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
        this.bossManager.recordDefeat(currentBoss.id);
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
    const now = performance.now();

    // 1. Update Player Input
    this.input.update(this.fixedDt, this.playerPaddle);

    if (this.mode === 'MULTIPLAYER_GUEST') {
      this.net.sendInput({
        pos: this.playerPaddle.pos,
        parry: this.playerPaddle.parryActive,
        overdrive: false,
      });
      return; // Guest runs on authoritative host packets
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

        this.clockSpeedGHz = Math.min(5.5, 1.0 + this.rallyHits * 0.32);
        this.physics.setMaxSpeedLimit(1800 + (this.clockSpeedGHz - 1.0) * 180);

        // 20% chance of Golden Puck on high-frequency rally
        if (this.rallyHits >= 5 && !this.puck.isGolden && Math.random() < 0.2) {
          this.puck.isGolden = true;
          this.particles.emitParryBlast(this.puck.pos);
          this.sound.playWallTick(800);
        }

        if (c.isParry) {
          this.tracker.stats.parriesCount++;
          this.sound.playParry();
          this.particles.emitParryBlast(c.pos);
          this.renderer.triggerShake(1.6, 0.35);
          this.hitStopFrames = 9;

          this.playerPaddle.overdriveCharge = Math.min(100, this.playerPaddle.overdriveCharge + 35);
          this.robot.say('PARRY DETECTED: REFLECTED TRAJECTORY!', 1.8);
          this.sound.playRobotSpeech();
        } else {
          this.sound.playPaddleHit(c.speed, this.puck.isHyperShot);
          const hitColor = hitter === 'player' ? this.playerPaddle.color : this.robotPaddle.color;
          this.particles.emitSparks(c.pos, 16, hitColor, 1.2, c.normal);
          this.particles.emitShockwave(c.pos, 45, hitColor, 320);

          if (hitter === 'player') {
            this.playerPaddle.overdriveCharge = Math.min(100, this.playerPaddle.overdriveCharge + 8);
          }

          if (c.speed > 1300) {
            this.renderer.triggerShake(c.speed / 1800, 0.18);
            this.hitStopFrames = 3;
          } else if (c.speed > 900) {
            this.renderer.triggerShake(0.3, 0.1);
          }
        }
      } else if (c.type === 'wall') {
        this.tracker.onWallBounce();
        this.sound.playWallTick(c.speed);
        this.particles.emitSparks(c.pos, 8, '#ffffff', 0.8, c.normal);
      } else if (c.type === 'post') {
        this.sound.playPostBounce();
        this.particles.emitSparks(c.pos, 20, '#ffcc00', 1.5, c.normal);
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
        this.handleGoal(res2.goal, false);
      }
    }

    // 4. Update Puck Trails
    const puckSpeed = Math.hypot(this.puck.vel.x, this.puck.vel.y);
    this.tracker.onPuckSpeed(puckSpeed);

    this.puck.trail.push({
      x: this.puck.pos.x,
      y: this.puck.pos.y,
      speed: puckSpeed,
      alpha: 1.0,
    });
    if (this.puck.trail.length > (this.clockSpeedGHz >= 3.0 ? 35 : 25)) {
      this.puck.trail.shift();
    }
    for (const pt of this.puck.trail) {
      pt.alpha *= 0.91;
    }

    // 5. Update Audio
    this.sound.updatePuckHum(puckSpeed, this.clockSpeedGHz);
    this.sound.updateRobotServo(this.robot.currentSpeed, this.robot.phase === 'REDLINE');

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
            isGolden: this.puck.isGolden,
          },
          hostPaddle: { pos: this.playerPaddle.pos, parry: this.playerPaddle.parryActive },
          guestPaddle: { pos: this.robotPaddle.pos, parry: this.robotPaddle.parryActive },
          score: this.score,
          clockSpeed: this.clockSpeedGHz,
          goalBanner: this.goalScoredBanner,
          state: this.state,
        });
      }
    }

    // 7. Check Goal
    if (goal) {
      this.handleGoal(goal, this.puck.isGolden);
    }
  }

  private loop(timestamp: number) {
    if (!this.isRunning) return;

    const frameTime = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

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

    if (this.state === 'POINT_SCORED') {
      this.pointPauseTimer -= frameTime;
      if (this.pointPauseTimer <= 0) {
        const nextServeTo = this.goalScoredBanner?.includes('PLAYER') || this.goalScoredBanner?.includes('GOAL') ? 'robot' : 'player';
        this.resetPositions(nextServeTo);
        this.startCountdown();
      }
    }

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
