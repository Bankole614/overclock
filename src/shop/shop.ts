import { ShopItem, CosmeticState } from '../types';

export const SHOP_CATALOG: ShopItem[] = [
  // Paddle Skins
  {
    id: 'skin_default',
    category: 'paddle',
    name: 'CYBER CYAN',
    cost: 0,
    color: '#00f0ff',
    icon: '💠',
    description: 'Standard issue neural-fiber kinetic striker.',
  },
  {
    id: 'skin_viper',
    category: 'paddle',
    name: 'TOXIC VIPER',
    cost: 300,
    color: '#00ff88',
    icon: '🐍',
    description: 'Corrosive emerald plating with enhanced friction rim.',
  },
  {
    id: 'skin_solar',
    category: 'paddle',
    name: 'SOLAR FLARE',
    cost: 500,
    color: '#ffaa00',
    icon: '☀️',
    description: 'Thermonuclear alloy emitting molten heat waves.',
  },
  {
    id: 'skin_phantom',
    category: 'paddle',
    name: 'VOID PHANTOM',
    cost: 800,
    color: '#b5179e',
    icon: '🔮',
    description: 'Dark matter chassis that flickers out of physical phase.',
  },
  {
    id: 'skin_apex',
    category: 'paddle',
    name: 'APEX OVERCLOCK',
    cost: 1500,
    color: '#ffd166',
    icon: '👑',
    description: 'Forged from the remnants of defeated Apex machines.',
  },

  // Puck Trails
  {
    id: 'trail_default',
    category: 'trail',
    name: 'NEON WAVE',
    cost: 0,
    color: '#00f0ff',
    icon: '〰️',
    description: 'Classic high-contrast luminescence trail.',
  },
  {
    id: 'trail_lightning',
    category: 'trail',
    name: 'LIGHTNING SPARK',
    cost: 400,
    color: '#ffd166',
    icon: '⚡',
    description: 'Continuous crackling 50,000V electrical arc discharge.',
  },
  {
    id: 'trail_fire',
    category: 'trail',
    name: 'PLASMA FIRE',
    cost: 600,
    color: '#ff3300',
    icon: '🔥',
    description: 'Blazing thermal wake that burns the table floor.',
  },
  {
    id: 'trail_matrix',
    category: 'trail',
    name: 'DIGITAL GLITCH',
    cost: 900,
    color: '#a000ff',
    icon: '👾',
    description: 'Deconstructed binary scanlines and matrix particles.',
  },

  // Goal Explosions
  {
    id: 'goal_default',
    category: 'goal',
    name: 'CYBER SHOCKWAVE',
    cost: 0,
    color: '#00f0ff',
    icon: '💥',
    description: 'Expanding radial kinetic wave and spark burst.',
  },
  {
    id: 'goal_nova',
    category: 'goal',
    name: 'SUPERNOVA FLASH',
    cost: 500,
    color: '#ffaa00',
    icon: '🌟',
    description: 'Blinding white-hot solar eruption that shakes the stadium.',
  },
  {
    id: 'goal_glitch',
    category: 'goal',
    name: 'MATRIX ANOMALY',
    cost: 800,
    color: '#9d4edd',
    icon: '⚡',
    description: 'Reality-bending glitch tear with inverted screen flashes.',
  },

  // Arena / Table Themes
  {
    id: 'arena_default',
    category: 'arena',
    name: 'CYBER OBSIDIAN',
    cost: 0,
    color: '#00f0ff',
    icon: '🏟️',
    description: 'Standard championship neon stadium floor.',
  },
  {
    id: 'arena_synthwave',
    category: 'arena',
    name: 'SYNTHWAVE 84',
    cost: 500,
    color: '#ff007f',
    icon: '🌴',
    description: 'Outrun sunset grid with hot magenta and violet lasers.',
  },
  {
    id: 'arena_matrix',
    category: 'arena',
    name: 'NEO MATRIX',
    cost: 750,
    color: '#00ff66',
    icon: '📟',
    description: 'Phosphor green terminal grid and cyberspace code lines.',
  },
  {
    id: 'arena_redline',
    category: 'arena',
    name: 'REDLINE INFERNO',
    cost: 1100,
    color: '#ff3333',
    icon: '🔥',
    description: 'Molten crimson floor forged in volcanic overclock chambers.',
  },
];

const SHOP_SAVE_KEY = 'overclock_shop_v2';

export class ShopManager {
  public state: CosmeticState;

  constructor() {
    this.state = this.loadState();
  }

  private loadState(): CosmeticState {
    const defaultState: CosmeticState = {
      chips: 100, // Starter bonus!
      equippedPaddle: 'skin_default',
      equippedTrail: 'trail_default',
      equippedGoal: 'goal_default',
      equippedArena: 'arena_default',
      unlockedItems: ['skin_default', 'trail_default', 'goal_default', 'arena_default'],
    };

    try {
      const raw = localStorage.getItem(SHOP_SAVE_KEY);
      if (raw) {
        return { ...defaultState, ...JSON.parse(raw) };
      }
    } catch {
      // Ignored
    }
    return defaultState;
  }

  public saveState() {
    try {
      localStorage.setItem(SHOP_SAVE_KEY, JSON.stringify(this.state));
    } catch {
      // Ignored
    }
  }

  public addChips(amount: number) {
    this.state.chips += amount;
    this.saveState();
  }

  public purchase(itemId: string): boolean {
    const item = SHOP_CATALOG.find((i) => i.id === itemId);
    if (!item) return false;
    if (this.state.unlockedItems.includes(itemId)) return true;

    if (this.state.chips >= item.cost) {
      this.state.chips -= item.cost;
      this.state.unlockedItems.push(itemId);
      this.equip(itemId);
      this.saveState();
      return true;
    }
    return false;
  }

  public equip(itemId: string): boolean {
    const item = SHOP_CATALOG.find((i) => i.id === itemId);
    if (!item || !this.state.unlockedItems.includes(itemId)) return false;

    if (item.category === 'paddle') this.state.equippedPaddle = itemId;
    if (item.category === 'trail') this.state.equippedTrail = itemId;
    if (item.category === 'goal') this.state.equippedGoal = itemId;
    if (item.category === 'arena') this.state.equippedArena = itemId;

    this.saveState();
    return true;
  }

  public getItem(id: string): ShopItem | undefined {
    return SHOP_CATALOG.find((i) => i.id === id);
  }

  public getEquippedColors() {
    const paddle = this.getItem(this.state.equippedPaddle);
    const trail = this.getItem(this.state.equippedTrail);
    const goal = this.getItem(this.state.equippedGoal);
    const arena = this.getItem(this.state.equippedArena || 'arena_default');

    return {
      paddleColor: paddle ? paddle.color : '#00f0ff',
      trailColor: trail ? trail.color : '#00f0ff',
      goalColor: goal ? goal.color : '#00f0ff',
      arenaColor: arena ? arena.color : '#00f0ff',
      arenaSkin: this.state.equippedArena || 'arena_default',
    };
  }
}

