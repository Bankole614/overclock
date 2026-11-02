import { Paddle, TableConfig, Vec2 } from '../types';

export class InputManager {
  private targetPos: Vec2;
  private canvasRect: DOMRect | null = null;
  private scaleX = 1;
  private scaleY = 1;

  // Keyboard state
  private keys: { [key: string]: boolean } = {};
  private keyboardPos: Vec2 | null = null;
  private isUsingKeyboard = false;

  public maxPlayerSpeed = 2200; // px/s speed cap to prevent teleportation
  public isTouchDevice = false;
  public onPauseToggle: (() => void) | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private table: TableConfig
  ) {
    this.targetPos = {
      x: table.width / 2,
      y: table.height - 120,
    };

    this.setupListeners();
    this.updateCanvasBounds();
  }

  public updateCanvasBounds() {
    this.canvasRect = this.canvas.getBoundingClientRect();
    if (this.canvasRect.width > 0 && this.canvasRect.height > 0) {
      this.scaleX = this.table.width / this.canvasRect.width;
      this.scaleY = this.table.height / this.canvasRect.height;
    }
  }

  private setupListeners() {
    window.addEventListener('resize', () => this.updateCanvasBounds());

    // Mouse movement
    window.addEventListener('mousemove', (e) => {
      this.isUsingKeyboard = false;
      if (!this.canvasRect) this.updateCanvasBounds();
      if (!this.canvasRect) return;

      const clientX = e.clientX - this.canvasRect.left;
      const clientY = e.clientY - this.canvasRect.top;

      this.targetPos.x = clientX * this.scaleX;
      this.targetPos.y = clientY * this.scaleY;
    });

    // Touch movement with vertical offset
    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      this.isTouchDevice = true;
      this.isUsingKeyboard = false;
      const touch = e.touches[0];
      if (!this.canvasRect) this.updateCanvasBounds();
      if (!this.canvasRect) return;

      const clientX = touch.clientX - this.canvasRect.left;
      const clientY = touch.clientY - this.canvasRect.top;

      // Small vertical offset (approx 55 logical units upward) so finger doesn't block the paddle
      const verticalOffset = 55;
      this.targetPos.x = clientX * this.scaleX;
      this.targetPos.y = clientY * this.scaleY - verticalOffset;
    };

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handleTouch(e);
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      handleTouch(e);
    }, { passive: false });

    // Keyboard handlers
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(e.key.toLowerCase())) {
        this.isUsingKeyboard = true;
      }
      if (e.key === 'Escape') {
        if (this.onPauseToggle) this.onPauseToggle();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });
  }

  public resetToHome(playerPaddle: Paddle) {
    playerPaddle.pos.x = this.table.width / 2;
    playerPaddle.pos.y = this.table.height - 120;
    playerPaddle.vel.x = 0;
    playerPaddle.vel.y = 0;
    playerPaddle.prevPos = { ...playerPaddle.pos };
    this.targetPos = { ...playerPaddle.pos };
    this.keyboardPos = { ...playerPaddle.pos };
  }

  public update(dt: number, paddle: Paddle) {
    const { width, height, paddleRadius } = this.table;
    const minY = height / 2 + paddleRadius + 5; // cannot cross center line
    const maxY = height - paddleRadius;
    const minX = paddleRadius;
    const maxX = width - paddleRadius;

    paddle.prevPos = { ...paddle.pos };

    if (this.isUsingKeyboard) {
      if (!this.keyboardPos) this.keyboardPos = { ...paddle.pos };
      const kbSpeed = 1200;
      let dx = 0;
      let dy = 0;

      if (this.keys['arrowleft'] || this.keys['a']) dx -= 1;
      if (this.keys['arrowright'] || this.keys['d']) dx += 1;
      if (this.keys['arrowup'] || this.keys['w']) dy -= 1;
      if (this.keys['arrowdown'] || this.keys['s']) dy += 1;

      if (dx !== 0 && dy !== 0) {
        dx *= 0.7071;
        dy *= 0.7071;
      }

      this.keyboardPos.x += dx * kbSpeed * dt;
      this.keyboardPos.y += dy * kbSpeed * dt;
      this.targetPos.x = this.keyboardPos.x;
      this.targetPos.y = this.keyboardPos.y;
    }

    // Clamp target within player half
    const clampedTargetX = Math.min(maxX, Math.max(minX, this.targetPos.x));
    const clampedTargetY = Math.min(maxY, Math.max(minY, this.targetPos.y));

    // Cap movement speed
    const dx = clampedTargetX - paddle.pos.x;
    const dy = clampedTargetY - paddle.pos.y;
    const dist = Math.hypot(dx, dy);
    const maxStep = this.maxPlayerSpeed * dt;

    if (dist <= maxStep) {
      paddle.pos.x = clampedTargetX;
      paddle.pos.y = clampedTargetY;
    } else {
      const k = maxStep / dist;
      paddle.pos.x += dx * k;
      paddle.pos.y += dy * k;
    }

    // Calculate actual paddle velocity
    if (dt > 0) {
      paddle.vel.x = (paddle.pos.x - paddle.prevPos.x) / dt;
      paddle.vel.y = (paddle.pos.y - paddle.prevPos.y) / dt;
    }
  }
}
