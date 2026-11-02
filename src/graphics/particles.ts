import { Vec2 } from '../types';

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  isLightning?: boolean;
}

export interface Shockwave {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
  speed: number;
}

export class ParticleSystem {
  private pool: Particle[] = [];
  private shockwaves: Shockwave[] = [];
  private readonly maxParticles = 600;
  private readonly maxShockwaves = 25;

  constructor() {
    for (let i = 0; i < this.maxParticles; i++) {
      this.pool.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 2,
        color: '#00f0ff',
        alpha: 1,
        life: 0,
        maxLife: 1,
      });
    }

    for (let i = 0; i < this.maxShockwaves; i++) {
      this.shockwaves.push({
        active: false,
        x: 0,
        y: 0,
        radius: 0,
        maxRadius: 60,
        color: '#00f0ff',
        alpha: 1,
        speed: 120,
      });
    }
  }

  public emitSparks(
    pos: Vec2,
    count: number,
    color: string,
    speedMultiplier = 1,
    direction?: Vec2
  ) {
    let spawned = 0;
    for (let i = 0; i < this.maxParticles && spawned < count; i++) {
      const p = this.pool[i];
      if (!p.active) {
        p.active = true;
        p.x = pos.x;
        p.y = pos.y;
        p.isLightning = false;

        let angle: number;
        if (direction) {
          const baseAngle = Math.atan2(direction.y, direction.x);
          angle = baseAngle + (Math.random() - 0.5) * 1.6;
        } else {
          angle = Math.random() * Math.PI * 2;
        }

        const spd = (120 + Math.random() * 420) * speedMultiplier;
        p.vx = Math.cos(angle) * spd;
        p.vy = Math.sin(angle) * spd;
        p.size = 2 + Math.random() * 3.5;
        p.color = color;
        p.alpha = 1;
        p.maxLife = 0.25 + Math.random() * 0.4;
        p.life = p.maxLife;
        spawned++;
      }
    }
  }

  public emitLightningArcs(pos: Vec2, count: number, color = '#ffd166') {
    let spawned = 0;
    for (let i = 0; i < this.maxParticles && spawned < count; i++) {
      const p = this.pool[i];
      if (!p.active) {
        p.active = true;
        p.x = pos.x + (Math.random() - 0.5) * 20;
        p.y = pos.y + (Math.random() - 0.5) * 20;
        p.isLightning = true;
        const angle = Math.random() * Math.PI * 2;
        const spd = 80 + Math.random() * 250;
        p.vx = Math.cos(angle) * spd;
        p.vy = Math.sin(angle) * spd;
        p.size = 2.5 + Math.random() * 3;
        p.color = color;
        p.alpha = 1;
        p.maxLife = 0.15 + Math.random() * 0.2;
        p.life = p.maxLife;
        spawned++;
      }
    }
  }

  public emitShockwave(pos: Vec2, maxRadius: number, color: string, speed = 250) {
    for (let i = 0; i < this.maxShockwaves; i++) {
      const s = this.shockwaves[i];
      if (!s.active) {
        s.active = true;
        s.x = pos.x;
        s.y = pos.y;
        s.radius = 8;
        s.maxRadius = maxRadius;
        s.color = color;
        s.alpha = 1;
        s.speed = speed;
        break;
      }
    }
  }

  public emitParryBlast(pos: Vec2) {
    this.emitShockwave(pos, 180, '#ffd166', 550);
    this.emitShockwave(pos, 90, '#00f0ff', 350);
    this.emitLightningArcs(pos, 25, '#ffffff');
    this.emitSparks(pos, 35, '#ffd166', 1.8);
  }

  public emitEMPWave(pos: Vec2) {
    this.emitShockwave(pos, 320, '#00f0ff', 650);
    this.emitLightningArcs(pos, 40, '#00f0ff');
    this.emitSparks(pos, 50, '#9d4edd', 1.5);
  }

  public emitGoalExplosion(pos: Vec2, color: string) {
    this.emitShockwave(pos, 200, color, 450);
    this.emitSparks(pos, 100, color, 2.0);
    this.emitSparks(pos, 60, '#ffffff', 1.3);
    this.emitLightningArcs(pos, 30, color);
  }

  public update(dt: number) {
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.pool[i];
      if (p.active) {
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
        } else {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.isLightning) {
            p.x += (Math.random() - 0.5) * 8;
            p.y += (Math.random() - 0.5) * 8;
          }
          p.vx *= 0.93;
          p.vy *= 0.93;
          p.alpha = Math.max(0, p.life / p.maxLife);
        }
      }
    }

    for (let i = 0; i < this.maxShockwaves; i++) {
      const s = this.shockwaves[i];
      if (s.active) {
        s.radius += s.speed * dt;
        s.alpha = Math.max(0, 1 - s.radius / s.maxRadius);
        if (s.radius >= s.maxRadius) {
          s.active = false;
        }
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    // Render shockwaves
    for (let i = 0; i < this.maxShockwaves; i++) {
      const s = this.shockwaves[i];
      if (s.active && s.alpha > 0.01) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 3.5 * s.alpha;
        ctx.globalAlpha = s.alpha * 0.85;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.restore();
      }
    }

    // Render particles
    ctx.save();
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.pool[i];
      if (p.active && p.alpha > 0.01) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  public clear() {
    this.pool.forEach((p) => (p.active = false));
    this.shockwaves.forEach((s) => (s.active = false));
  }
}
