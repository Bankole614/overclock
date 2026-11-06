import { Paddle, TableConfig, Vec2 } from '../types';

export class InputManager {
  private targetPos: Vec2;
  private canvasRect: DOMRect | null = null;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  // Touch tracking
  private activeTouchId: number | null = null;
  private touchAnchor: {
    clientX: number;
    clientY: number;
    startPaddleX: number;
    startPaddleY: number;
  } | null = null;
  private isTouching = false;

  // Keyboard state
  private keys: { [key: string]: boolean } = {};
  private keyboardPos: Vec2 | null = null;
  private isUsingKeyboard = false;

  public maxPlayerSpeed = 3500; // Generous mouse speed cap
  public maxTouchSpeed = 25000; // Instant 1:1 follow for touch swipes
  public isTouchDevice = false;
  public playerPaddleRadius = 34;
  public onMobileDetected: (() => void) | null = null;
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

    const isMobile =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(pointer: coarse)').matches);
    if (isMobile) {
      this.isTouchDevice = true;
      this.playerPaddleRadius = 48;
    }

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

  private isInteractiveTarget(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Element)) return false;
    return !!target.closest(
      'button, input, select, textarea, .action-btn, .hud-btn, .modal-card, .overlay-screen:not(.hidden)'
    );
  }

  private setupListeners() {
    window.addEventListener('resize', () => this.updateCanvasBounds());
    window.addEventListener('orientationchange', () => this.updateCanvasBounds());

    // Mouse movement (desktop)
    window.addEventListener('mousemove', (e) => {
      if (this.isTouching) return; // Prevent synthetic mouse events on touch devices from interrupting
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
        if (this.onParryTrigger) this.onParryTrigger();
      }
    });

    // Touch handlers for mobile
    const onTouchStart = (e: TouchEvent) => {
      if (!this.isTouchDevice) {
        this.isTouchDevice = true;
        this.playerPaddleRadius = 48;
        if (this.onMobileDetected) this.onMobileDetected();
      }
      this.isUsingKeyboard = false;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const target = touch.target as HTMLElement | null;

        // If touch began on a modal, button, or input, do not capture it for paddle movement
        if (this.isInteractiveTarget(target)) {
          continue;
        }

        // Capture this touch for paddle control if we don't already have one
        if (this.activeTouchId === null) {
          this.activeTouchId = touch.identifier;
          this.isTouching = true;
          e.preventDefault();

          if (!this.canvasRect || this.canvasRect.width === 0) {
            this.updateCanvasBounds();
          }
          if (!this.canvasRect) return;

          const paddleRadius = this.playerPaddleRadius;
          const { height, width } = this.table;
          const minY = height / 2 + paddleRadius + 5;
          const maxY = height - paddleRadius;
          const minX = paddleRadius;
          const maxX = width - paddleRadius;

          const clientX = touch.clientX - this.canvasRect.left;
          const clientY = touch.clientY - this.canvasRect.top;

          const rawX = (clientX - this.offsetX) / this.scale;
          const rawY = (clientY - this.offsetY) / this.scale;

          const verticalOffset = this.isTouchDevice ? paddleRadius + 18 : 45;
          const startX = Math.min(maxX, Math.max(minX, rawX));
          let startY: number;

          // Check if touch is within player's rink zone
          if (rawY <= maxY + 60 && rawY >= minY) {
            startY = Math.min(maxY, Math.max(minY, rawY - verticalOffset));
          } else if (rawY > maxY + 60) {
            // Finger touched at the bottom of screen (e.g. phone letterbox / bezel area)
            // Anchor directly to current target Y to eliminate deadzone
            startY = this.targetPos.y;
          } else {
            startY = minY;
          }

          this.targetPos.x = startX;
          this.targetPos.y = startY;

          this.touchAnchor = {
            clientX: touch.clientX,
            clientY: touch.clientY,
            startPaddleX: startX,
            startPaddleY: startY,
          };
          break;
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (this.activeTouchId === null || !this.touchAnchor) return;

      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        if (touch.identifier === this.activeTouchId) {
          e.preventDefault();
          this.isTouchDevice = true;
          this.isUsingKeyboard = false;

          if (!this.canvasRect) this.updateCanvasBounds();
          if (!this.canvasRect) return;

          const paddleRadius = this.playerPaddleRadius;
          const { height, width } = this.table;
          const minY = height / 2 + paddleRadius + 5;
          const maxY = height - paddleRadius;
          const minX = paddleRadius;
          const maxX = width - paddleRadius;

          const deltaX = (touch.clientX - this.touchAnchor.clientX) / this.scale;
          const deltaY = (touch.clientY - this.touchAnchor.clientY) / this.scale;

          let newX = this.touchAnchor.startPaddleX + deltaX;
          let newY = this.touchAnchor.startPaddleY + deltaY;

          // Dynamically slide the anchor when reaching table bounds so reversal reacts immediately
          if (newX < minX) {
            this.touchAnchor.startPaddleX += minX - newX;
            newX = minX;
          } else if (newX > maxX) {
            this.touchAnchor.startPaddleX += maxX - newX;
            newX = maxX;
          }

          if (newY < minY) {
            this.touchAnchor.startPaddleY += minY - newY;
            newY = minY;
          } else if (newY > maxY) {
            this.touchAnchor.startPaddleY += maxY - newY;
            newY = maxY;
          }

          this.targetPos.x = newX;
          this.targetPos.y = newY;
          break;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (this.activeTouchId === null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.activeTouchId) {
          this.activeTouchId = null;
          this.touchAnchor = null;
          this.isTouching = false;
          break;
        }
      }

      // If another non-interactive finger is still touching the playfield, adopt it
      if (this.activeTouchId === null && e.touches.length > 0) {
        for (let i = 0; i < e.touches.length; i++) {
          const remainingTouch = e.touches[i];
          if (!this.isInteractiveTarget(remainingTouch.target)) {
            this.activeTouchId = remainingTouch.identifier;
            this.isTouching = true;
            this.touchAnchor = {
              clientX: remainingTouch.clientX,
              clientY: remainingTouch.clientY,
              startPaddleX: this.targetPos.x,
              startPaddleY: this.targetPos.y,
            };
            break;
          }
        }
      }
    };

    // Attach to window so swipes can extend freely across the screen without losing focus
    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: false });
    window.addEventListener('touchcancel', onTouchEnd, { passive: false });

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
    this.activeTouchId = null;
    this.touchAnchor = null;
    this.isTouching = false;
  }

  public update(dt: number, paddle: Paddle) {
    const { width, height } = this.table;
    const paddleRadius = paddle.radius;
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

    // Cap movement speed: fast and direct for touch so swipes follow hand movement 1:1
    const currentMaxSpeed = this.isTouchDevice ? this.maxTouchSpeed : this.maxPlayerSpeed;
    const dx = clampedTargetX - paddle.pos.x;
    const dy = clampedTargetY - paddle.pos.y;
    const dist = Math.hypot(dx, dy);
    const maxStep = currentMaxSpeed * dt;

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
