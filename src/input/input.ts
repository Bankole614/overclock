import { Paddle, TableConfig, Vec2 } from '../types';

export class InputManager {
  private targetPos: Vec2;
  private canvasRect: DOMRect | null = null;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  // Keyboard state
  private keys: { [key: string]: boolean } = {};
  private keyboardPos: Vec2 | null = null;
  private isUsingKeyboard = false;

  public maxPlayerSpeed = 2400; // Fast and responsive
  public isTouchDevice = false;
  public onPauseToggle: (() => void) | null = null;
  public onParryTrigger: (() => void) | null = null;
  public onOverdriveTrigger: (() => void) | null = null;

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
      const scale = Math.min(
        this.canvasRect.width / this.table.width,
        this.canvasRect.height / this.table.height
      );
      this.scale = scale;
      this.offsetX = (this.canvasRect.width - this.table.width * scale) / 2;
      this.offsetY = (this.canvasRect.height - this.table.height * scale) / 2;
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

      this.targetPos.x = (clientX - this.offsetX) / this.scale;
      this.targetPos.y = (clientY - this.offsetY) / this.scale;
    });

    // Right-click or mouse down on canvas for Parry
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.onParryTrigger) this.onParryTrigger();
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        // Right click
        if (this.onParryTrigger) this.onParryTrigger();
      }
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

      const verticalOffset = 55;
      this.targetPos.x = (clientX - this.offsetX) / this.scale;
      this.targetPos.y = (clientY - this.offsetY) / this.scale - verticalOffset;
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
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (this.onParryTrigger) this.onParryTrigger();
      }
      if (e.key.toLowerCase() === 'e' || e.key.toLowerCase() === 'f') {
        if (this.onOverdriveTrigger) this.onOverdriveTrigger();
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
    const minY = height / 2 + paddleRadius + 5;
    const maxY = height - paddleRadius;
    const minX = paddleRadius;
    const maxX = width - paddleRadius;

    paddle.prevPos = { ...paddle.pos };

    // Update Parry Timers
    if (paddle.parryTimer > 0) {
      paddle.parryTimer -= dt;
      if (paddle.parryTimer <= 0) {
        paddle.parryActive = false;
      }
    }
    if (paddle.parryCooldown > 0) {
      paddle.parryCooldown -= dt;
    }

    if (this.isUsingKeyboard) {
      if (!this.keyboardPos) this.keyboardPos = { ...paddle.pos };
      const kbSpeed = 1300;
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

    if (dt > 0) {
      paddle.vel.x = (paddle.pos.x - paddle.prevPos.x) / dt;
      paddle.vel.y = (paddle.pos.y - paddle.prevPos.y) / dt;
    }
  }
}
