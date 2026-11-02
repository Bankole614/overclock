export interface Vec2 {
  x: number;
  y: number;
}

export interface Puck {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  spin: number; // Angular velocity (rad/s) for Magnus effect curve shots
  isHyperShot: boolean; // True on perfect parry or railgun smash
  isRailgun: boolean;
  trail: { x: number; y: number; speed: number; alpha: number; color?: string }[];
  lastHitter: 'player' | 'robot' | null;
  hitCount: number;
}

export interface Paddle {
  pos: Vec2;
  vel: Vec2;
  prevPos: Vec2;
  radius: number;
  color: string;
  glowColor: string;
  parryActive: boolean;
  parryTimer: number; // Duration of active parry window
  parryCooldown: number;
  overdriveCharge: number; // 0 to 100%
  isStunned: boolean;
  stunTimer: number;
}

export interface ArenaBumper {
  id: string;
  pos: Vec2;
  radius: number;
  active: boolean;
  pulseTimer: number;
  color: string;
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
  | 'COUNTDOWN'
  | 'PLAYING'
  | 'POINT_SCORED'
  | 'MATCH_END'
  | 'PAUSED';

export type BossPhase = 'ANALYTICAL' | 'OVERCLOCKED' | 'REDLINE';

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
  arenaBumpers: boolean;
  curveShots: boolean;
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
  winner: 'player' | 'robot' | null;
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
}
