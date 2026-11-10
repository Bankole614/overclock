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

  // Smoothed velocity tracking across 120Hz physics substeps & 60Hz pointer events
  private smoothedVel: Vec2 = { x: 0, y: 0 };
  private lastMoveElapsed = 1;

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

          this.updateCanvasBounds();
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

          // Ergonomic thumb offset (~45px) so mallet is pushed up comfortably above the finger for users with big thumbs
          const verticalOffset = this.isTouchDevice ? 45 : 0;
          const startX = Math.min(maxX, Math.max(minX, rawX));
          let startY: number;

          // Check if touch is within player's rink zone
          if (rawY <= maxY + 60 && rawY >= minY) {
            startY = Math.min(maxY, Math.max(minY, rawY - verticalOffset));
          } else if (rawY > maxY + 60) {
            // Finger touched at the bottom of screen (e.g. phone bezel area)
            // Anchor directly to current target Y to eliminate deadzone jump
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
    this.smoothedVel = { x: 0, y: 0 };
    this.lastMoveElapsed = 1;

    if (this.isTouching && this.activeTouchId !== null) {
      // Player is still holding or moving the mallet on screen: keep tracking without teleporting!
      const { height, width } = this.table;
      const paddleRadius = playerPaddle.radius || this.playerPaddleRadius;
      const minY = height / 2 + paddleRadius + 5;
      const maxY = height - paddleRadius;
      const minX = paddleRadius;
      const maxX = width - paddleRadius;

      playerPaddle.pos.x = Math.min(maxX, Math.max(minX, playerPaddle.pos.x));
      playerPaddle.pos.y = Math.min(maxY, Math.max(minY, playerPaddle.pos.y));
      playerPaddle.vel.x = 0;
      playerPaddle.vel.y = 0;
      playerPaddle.prevPos = { ...playerPaddle.pos };
      this.targetPos = { ...playerPaddle.pos };
      return;
    }

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
      const stepDx = paddle.pos.x - paddle.prevPos.x;
      const stepDy = paddle.pos.y - paddle.prevPos.y;
      const movedDist = Math.hypot(stepDx, stepDy);

      if (movedDist > 0.05) {
        // Pointer/touch events arrive at ~60Hz while physics steps at 120Hz.
        // Use an effective dt floor (~1/75s) when a discrete pointer jump completes in one substep
        // so velocity reflects the true hand/mouse speed and stays consistent across substeps.
        const effectiveDt = dist <= maxStep && !this.isUsingKeyboard ? Math.max(dt, 1 / 75) : dt;
        const rawVx = stepDx / effectiveDt;
        const rawVy = stepDy / effectiveDt;
        this.smoothedVel.x = rawVx * 0.75 + this.smoothedVel.x * 0.25;
        this.smoothedVel.y = rawVy * 0.75 + this.smoothedVel.y * 0.25;
        this.lastMoveElapsed = 0;
      } else {
        this.lastMoveElapsed += dt;
        // Hold velocity across the ~16-24ms gap between 60Hz browser input events,
        // then decay rapidly once the hand/mouse actually stops moving.
        const decay = this.lastMoveElapsed <= 0.024 ? 0.88 : Math.exp(-dt * 45);
        this.smoothedVel.x *= decay;
        this.smoothedVel.y *= decay;
        if (Math.hypot(this.smoothedVel.x, this.smoothedVel.y) < 5) {
          this.smoothedVel.x = 0;
          this.smoothedVel.y = 0;
        }
      }

      paddle.vel.x = this.smoothedVel.x;
      paddle.vel.y = this.smoothedVel.y;
    }
  }
}
