export interface Vec2 {
  x: number;
  y: number;
}

export interface Puck {
  id: string;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  spin: number;
  isHyperShot: boolean;
  isRailgun: boolean;
  isGolden: boolean; // 2x points
  trail: { x: number; y: number; speed: number; alpha: number; color?: string }[];
  lastHitter: 'player' | 'robot' | 'guest' | null;
  hitCount: number;
}

export interface Paddle {
  pos: Vec2;
  vel: Vec2;
  prevPos: Vec2;
  radius: number;
  color: string;
  glowColor: string;
  skinId: string;
  parryActive: boolean;
  parryTimer: number;
  parryCooldown: number;
  overdriveCharge: number;
  isStunned: boolean;
  stunTimer: number;
}

export interface TableConfig {
  width: number;
  height: number;
  goalWidth: number;
  goalDepth: number;
  puckRadius: number;
  paddleRadius: number;
  puckBaseMaxSpeed: number;
  wallRestitution: number;
  puckDrag: number;
  postRadius: number;
}

export const DEFAULT_TABLE: TableConfig = {
  width: 600,
  height: 900,
  goalWidth: 220,
  goalDepth: 30,
  puckRadius: 18,
  paddleRadius: 34,
  puckBaseMaxSpeed: 1800,
  wallRestitution: 0.96,
  puckDrag: 0.08,
  postRadius: 10,
};

export type GameState =
  | 'TITLE'
  | 'BOSS_SELECT'
  | 'MULTIPLAYER_LOBBY'
  | 'SHOP'
  | 'COUNTDOWN'
  | 'PLAYING'
  | 'POINT_SCORED'
  | 'MATCH_END'
  | 'PAUSED';

export type GameMode = 'SOLO_BOSS' | 'MULTIPLAYER_HOST' | 'MULTIPLAYER_GUEST';

export type SeriesFormat = 'BO1' | 'BO3' | 'BO5' | 'FIRST_TO_3';

export interface SeriesScore {
  playerGames: number;
  robotGames: number;
  targetGamesToWin: number;
  format: SeriesFormat;
}

export type BossId = 'VECTOR' | 'VIPER' | 'TITAN' | 'PHANTOM' | 'APEX';

export type BossPhase = 'ANALYTICAL' | 'OVERCLOCKED' | 'REDLINE';

export interface BossProfile {
  id: BossId;
  name: string;
  title: string;
  speed: number;
  reactionMs: number;
  paddleRadius: number;
  color: string;
  glowColor: string;
  signature: string;
  introQuote: string;
  victoryQuote: string;
  defeatQuote: string;
  unlocked: boolean;
  defeated: boolean;
}

export interface Score {
  player: number;
  robot: number;
}

export interface GameSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  reduceMotion: boolean;
  vibration: boolean;
  showPredictionLine: boolean;
  curveShots: boolean;
  multiPuckOverload: boolean;
  batterySaver: boolean;
}

export interface ShopItem {
  id: string;
  category: 'paddle' | 'trail' | 'goal' | 'arena';
  name: string;
  cost: number;
  color: string;
  icon: string;
  description: string;
}

export interface CosmeticState {
  chips: number;
  equippedPaddle: string;
  equippedTrail: string;
  equippedGoal: string;
  equippedArena: string;
  unlockedItems: string[];
}

export interface MatchStats {
  durationSeconds: number;
  playerScore: number;
  robotScore: number;
  maxPuckSpeed: number;
  maxClockSpeedGHz: number;
  totalHits: number;
  playerHits: number;
  robotHits: number;
  parriesCount: number;
  curveGoalsCount: number;
  overcommitGoals: number;
  reboundGoals: number;
  crossTableGoals: number;
  ralliesOver5Hits: number;
  chipsEarned: number;
  seriesFormat?: SeriesFormat;
  seriesGames?: string;
  winner: 'player' | 'robot' | 'guest' | null;
}

export interface LifetimeStats {
  matchesPlayed: number;
  matchesWon: number;
  bestStreak: number;
  currentStreak: number;
  fastestWinSeconds: number | null;
  totalPointsScored: number;
  totalPointsConceded: number;
  totalParries: number;
  bossesDefeated: BossId[];
}
