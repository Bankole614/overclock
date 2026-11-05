import { Puck, Paddle, TableConfig, Vec2 } from './types';

export interface CollisionEvent {
  type: 'wall' | 'paddle' | 'post';
  target?: 'player' | 'robot';
  pos: Vec2;
  speed: number;
  normal: Vec2;
  isParry?: boolean;
}

export class PhysicsEngine {
  private stuckTimer = 0;
  private lastStuckHalf: 'top' | 'bottom' | null = null;
  public maxSpeedLimit = 1800;

  constructor(public config: TableConfig) {}

  public setMaxSpeedLimit(limit: number) {
    this.maxSpeedLimit = limit;
  }

  /**
   * Swept circle-circle collision check between moving puck and moving paddle.
   */
  private checkPaddleCollision(
    puck: Puck,
    paddle: Paddle,
    dt: number
  ): CollisionEvent | null {
    const relVel: Vec2 = {
      x: puck.vel.x - paddle.vel.x,
      y: puck.vel.y - paddle.vel.y,
    };
    const combinedRadius = puck.radius + paddle.radius;
    const diff: Vec2 = {
      x: puck.pos.x - paddle.pos.x,
      y: puck.pos.y - paddle.pos.y,
    };

    const distSq = diff.x * diff.x + diff.y * diff.y;

    // Direct overlap check
    if (distSq < combinedRadius * combinedRadius) {
      let dist = Math.sqrt(distSq);
      if (dist === 0) {
        dist = 0.001;
        diff.x = 0;
        diff.y = 1;
      }
      const nx = diff.x / dist;
      const ny = diff.y / dist;

      // Push puck outside paddle
      puck.pos.x = paddle.pos.x + nx * combinedRadius;
      puck.pos.y = paddle.pos.y + ny * combinedRadius;

      // Check for Perfect Parry
      if (paddle.parryActive) {
        const incomingSpeed = Math.hypot(puck.vel.x, puck.vel.y);
        const parryBoostSpeed = Math.min(this.maxSpeedLimit, Math.max(1200, incomingSpeed * 1.5));
        puck.vel.x = nx * parryBoostSpeed;
        puck.vel.y = ny * parryBoostSpeed;
        puck.isHyperShot = true;
        puck.spin = (Math.random() - 0.5) * 30; // Wild spin on parry

        return {
          type: 'paddle',
          pos: { ...puck.pos },
          speed: parryBoostSpeed,
          normal: { x: nx, y: ny },
          isParry: true,
        };
      }

      // Normal rebound with momentum transfer & spin (tuned authentic air hockey elasticity)
      const vDotN = puck.vel.x * nx + puck.vel.y * ny;
      const pDotN = paddle.vel.x * nx + paddle.vel.y * ny;

      const impulse = -(1 + 0.46) * (vDotN - Math.max(0, pDotN));
      puck.vel.x += nx * impulse + paddle.vel.x * 0.32;
      puck.vel.y += ny * impulse + paddle.vel.y * 0.32;

      // Tangential velocity imparts Magnus spin
      const tangentVel = -ny * (puck.vel.x - paddle.vel.x) + nx * (puck.vel.y - paddle.vel.y);
      puck.spin = Math.max(-30, Math.min(30, tangentVel * 0.04));

      this.capSpeed(puck);

      return {
        type: 'paddle',
        pos: { ...puck.pos },
        speed: Math.hypot(puck.vel.x, puck.vel.y),
        normal: { x: nx, y: ny },
        isParry: false,
      };
    }

    // Continuous swept collision along dt
    const a = relVel.x * relVel.x + relVel.y * relVel.y;
    if (a < 0.0001) return null;

    const b = 2 * (diff.x * relVel.x + diff.y * relVel.y);
    const c = distSq - combinedRadius * combinedRadius;

    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const sqrtD = Math.sqrt(discriminant);
      const t = (-b - sqrtD) / (2 * a);
      if (t >= 0 && t <= dt) {
        puck.pos.x += puck.vel.x * t;
        puck.pos.y += puck.vel.y * t;
        const currentPaddlePos: Vec2 = {
          x: paddle.pos.x + paddle.vel.x * t,
          y: paddle.pos.y + paddle.vel.y * t,
        };
        const hitDiff: Vec2 = {
          x: puck.pos.x - currentPaddlePos.x,
          y: puck.pos.y - currentPaddlePos.y,
        };
        let hitDist = Math.hypot(hitDiff.x, hitDiff.y);
        if (hitDist === 0) hitDist = 0.001;
        const nx = hitDiff.x / hitDist;
        const ny = hitDiff.y / hitDist;

        puck.pos.x = currentPaddlePos.x + nx * (combinedRadius + 0.1);
        puck.pos.y = currentPaddlePos.y + ny * (combinedRadius + 0.1);

        if (paddle.parryActive) {
          const incomingSpeed = Math.hypot(puck.vel.x, puck.vel.y);
          const parryBoostSpeed = Math.min(this.maxSpeedLimit, Math.max(1200, incomingSpeed * 1.5));
          puck.vel.x = nx * parryBoostSpeed;
          puck.vel.y = ny * parryBoostSpeed;
          puck.isHyperShot = true;
          puck.spin = (Math.random() - 0.5) * 30;

          return {
            type: 'paddle',
            pos: { ...puck.pos },
            speed: parryBoostSpeed,
            normal: { x: nx, y: ny },
            isParry: true,
          };
        }

        const vDotN = puck.vel.x * nx + puck.vel.y * ny;
        const pDotN = paddle.vel.x * nx + paddle.vel.y * ny;
        const impulse = -(1 + 0.46) * (vDotN - Math.max(0, pDotN));

        puck.vel.x += nx * impulse + paddle.vel.x * 0.32;
        puck.vel.y += ny * impulse + paddle.vel.y * 0.32;

        const tangentVel = -ny * (puck.vel.x - paddle.vel.x) + nx * (puck.vel.y - paddle.vel.y);
        puck.spin = Math.max(-30, Math.min(30, tangentVel * 0.04));

        const remT = dt - t;
        puck.pos.x += puck.vel.x * remT;
        puck.pos.y += puck.vel.y * remT;

        this.capSpeed(puck);

        return {
          type: 'paddle',
          pos: { ...puck.pos },
          speed: Math.hypot(puck.vel.x, puck.vel.y),
          normal: { x: nx, y: ny },
          isParry: false,
        };
      }
    }

    return null;
  }

  private checkPostCollision(
    puck: Puck,
    postX: number,
    postY: number
  ): CollisionEvent | null {
    const r = puck.radius + this.config.postRadius;
    const dx = puck.pos.x - postX;
    const dy = puck.pos.y - postY;
    const distSq = dx * dx + dy * dy;

    if (distSq < r * r) {
      let dist = Math.sqrt(distSq);
      if (dist === 0) dist = 0.001;
      const nx = dx / dist;
      const ny = dy / dist;

      puck.pos.x = postX + nx * (r + 0.5);
      puck.pos.y = postY + ny * (r + 0.5);

      const dot = puck.vel.x * nx + puck.vel.y * ny;
      if (dot < 0) {
        puck.vel.x -= (1 + this.config.wallRestitution) * dot * nx;
        puck.vel.y -= (1 + this.config.wallRestitution) * dot * ny;
      }
      return {
        type: 'post',
        pos: { x: postX, y: postY },
        speed: Math.hypot(puck.vel.x, puck.vel.y),
        normal: { x: nx, y: ny },
      };
    }
    return null;
  }

  private capSpeed(puck: Puck) {
    const spd = Math.hypot(puck.vel.x, puck.vel.y);
    if (spd > this.maxSpeedLimit) {
      const scale = this.maxSpeedLimit / spd;
      puck.vel.x *= scale;
      puck.vel.y *= scale;
    }
  }

  /**
   * Step physics at fixed dt.
   */
  update(
    dt: number,
    puck: Puck,
    playerPaddle: Paddle,
    robotPaddle: Paddle
  ): {
    collisions: CollisionEvent[];
    goal: 'player' | 'robot' | null;
  } {
    const collisions: CollisionEvent[] = [];
    const { width, height, goalWidth, wallRestitution, puckDrag } = this.config;

    // 1. Apply drag
    const dragMultiplier = Math.max(0, 1 - puckDrag * dt);
    puck.vel.x *= dragMultiplier;
    puck.vel.y *= dragMultiplier;

    // 2. Magnus Effect (Curve Shot flight physics)
    const currentSpeed = Math.hypot(puck.vel.x, puck.vel.y);
    if (Math.abs(puck.spin) > 0.05 && currentSpeed > 180) {
      // Lateral force perpendicular to velocity vector
      const latForce = puck.spin * 22.0;
      const nx = -puck.vel.y / currentSpeed;
      const ny = puck.vel.x / currentSpeed;

      puck.vel.x += nx * latForce * dt;
      puck.vel.y += ny * latForce * dt;

      // Spin decays in flight
      puck.spin *= Math.max(0, 1 - 0.45 * dt);
    }

    // 3. Move puck
    puck.pos.x += puck.vel.x * dt;
    puck.pos.y += puck.vel.y * dt;

    // 4. Check paddle collisions
    const playerHit = this.checkPaddleCollision(puck, playerPaddle, dt);
    if (playerHit) {
      playerHit.target = 'player';
      puck.lastHitter = 'player';
      puck.hitCount++;
      collisions.push(playerHit);
    }

    const robotHit = this.checkPaddleCollision(puck, robotPaddle, dt);
    if (robotHit) {
      robotHit.target = 'robot';
      puck.lastHitter = 'robot';
      puck.hitCount++;
      puck.isHyperShot = false; // Reset hyper shot when robot returns it
      collisions.push(robotHit);
    }

    // 5. Side wall collisions
    if (puck.pos.x - puck.radius < 0) {
      puck.pos.x = puck.radius;
      puck.vel.x = -puck.vel.x * wallRestitution;
      // Wall collision reverses spin slightly
      puck.spin = -puck.spin * 0.7;
      collisions.push({
        type: 'wall',
        pos: { x: 0, y: puck.pos.y },
        speed: Math.hypot(puck.vel.x, puck.vel.y),
        normal: { x: 1, y: 0 },
      });
    } else if (puck.pos.x + puck.radius > width) {
      puck.pos.x = width - puck.radius;
      puck.vel.x = -puck.vel.x * wallRestitution;
      puck.spin = -puck.spin * 0.7;
      collisions.push({
        type: 'wall',
        pos: { x: width, y: puck.pos.y },
        speed: Math.hypot(puck.vel.x, puck.vel.y),
        normal: { x: -1, y: 0 },
      });
    }

    // 7. Goal mouth bounds & posts
    const goalLeft = (width - goalWidth) / 2;
    const goalRight = (width + goalWidth) / 2;

    const topPostL = this.checkPostCollision(puck, goalLeft, 0);
    if (topPostL) collisions.push(topPostL);
    const topPostR = this.checkPostCollision(puck, goalRight, 0);
    if (topPostR) collisions.push(topPostR);
    const btmPostL = this.checkPostCollision(puck, goalLeft, height);
    if (btmPostL) collisions.push(btmPostL);
    const btmPostR = this.checkPostCollision(puck, goalRight, height);
    if (btmPostR) collisions.push(btmPostR);

    // End wall collisions outside goal mouth
    if (puck.pos.y - puck.radius < 0) {
      if (puck.pos.x < goalLeft || puck.pos.x > goalRight) {
        puck.pos.y = puck.radius;
        puck.vel.y = -puck.vel.y * wallRestitution;
        puck.spin = -puck.spin * 0.7;
        collisions.push({
          type: 'wall',
          pos: { x: puck.pos.x, y: 0 },
          speed: Math.hypot(puck.vel.x, puck.vel.y),
          normal: { x: 0, y: 1 },
        });
      }
    }

    if (puck.pos.y + puck.radius > height) {
      if (puck.pos.x < goalLeft || puck.pos.x > goalRight) {
        puck.pos.y = height - puck.radius;
        puck.vel.y = -puck.vel.y * wallRestitution;
        puck.spin = -puck.spin * 0.7;
        collisions.push({
          type: 'wall',
          pos: { x: puck.pos.x, y: height },
          speed: Math.hypot(puck.vel.x, puck.vel.y),
          normal: { x: 0, y: -1 },
        });
      }
    }

    // 8. Goal detection
    let goal: 'player' | 'robot' | null = null;
    if (puck.pos.y < -puck.radius / 2 && puck.pos.x >= goalLeft && puck.pos.x <= goalRight) {
      goal = 'player';
    } else if (
      puck.pos.y > height + puck.radius / 2 &&
      puck.pos.x >= goalLeft &&
      puck.pos.x <= goalRight
    ) {
      goal = 'robot';
    }

    // 9. Stuck puck check (PRD 5.1): speed below 60 px/s in one half for > 4s
    const spd = Math.hypot(puck.vel.x, puck.vel.y);
    const currentHalf = puck.pos.y < height / 2 ? 'top' : 'bottom';
    if (spd < 60) {
      if (this.lastStuckHalf === currentHalf) {
        this.stuckTimer += dt;
        if (this.stuckTimer > 4.0) {
          const nudgeDirY = currentHalf === 'top' ? 350 : -350;
          puck.vel.y = nudgeDirY;
          puck.vel.x = (Math.random() - 0.5) * 200;
          this.stuckTimer = 0;
        }
      } else {
        this.lastStuckHalf = currentHalf;
        this.stuckTimer = 0;
      }
    } else {
      this.stuckTimer = 0;
      this.lastStuckHalf = null;
    }

    return { collisions, goal };
  }
}
