# PRD: Overclock (working title)

**Type:** Browser game, single-player (vs. robot)
**Stack (proposed):** TypeScript, Vite, Canvas 2D, Web Audio API
**Status:** Draft v1
**Owner:** AY

---

## 1. Overview

Overclock is a fast, arcade-style air hockey game where the player faces a robot opponent that predicts the puck's path, defends precisely, and wins most matches. The game is built around one tension: **the robot feels unbeatable, but is secretly beatable.** Speed and spectacle make losses feel like "I got overwhelmed," while hidden, learnable weaknesses make wins feel earned.

### 1.1 One-line pitch
"Beat the machine that sees every shot coming."

### 1.2 Why this exists
- Air hockey is instantly understood, needs no tutorial, and is great for short sessions.
- Most air hockey games either have a dumb AI (boring) or an unfair one (frustrating). The goal is the narrow band in between: an opponent that looks superhuman and loses about one match in four.
- It's small enough to ship quickly and polish heavily, which is where the value is.

### 1.3 Honesty framing
The game is openly sold as "you're up against a machine built to beat you." The robot's dominance is part of the fiction, not a hidden trick. The difficulty director adjusts under the hood, but the player is never told they're winning "fairly" against a fixed opponent, and the robot's weaknesses are real, consistent, and discoverable.

---

## 2. Goals and Non-Goals

### 2.1 Goals
1. Player wins roughly **20-30%** of matches overall (steady state), with most losses within 1-2 points.
2. Median session length of **5+ minutes** (multiple rematches).
3. **Rematch rate of 60%+** after a loss.
4. A first-time player can start playing in **under 5 seconds** from page load.
5. Locked 60 FPS on mid-range phones and laptops; physics deterministic at fixed timestep.
6. Every loss should teach the player something (a visible reason they lost).

### 2.2 Non-Goals (v1)
- Online multiplayer or matchmaking (see Future).
- Accounts, backend, or cloud saves. Local storage only.
- Multiple tables, paddle skins with gameplay effects, or power-ups.
- Monetization.

---

## 3. Target Audience

- **Primary:** casual players on mobile and desktop browsers who want a 2-minute competitive hit.
- **Secondary:** players who enjoy "git gud" loops (fighting-game and arcade mindset) and will study the robot to beat it.
- **Platforms:** desktop browsers (mouse), mobile browsers (touch), landscape and portrait. Chrome, Safari, Firefox, Edge current versions.

---

## 4. Design Pillars

1. **Fast, not frantic.** High puck speed with clear readability. The player should always be able to see what happened.
2. **Unbeatable-feeling, never unfair.** Every robot advantage is something a human could in principle do; every robot weakness is learnable.
3. **Close losses.** Most defeats are 7-5 or 7-6, not 7-1. Close games create "one more try."
4. **The robot is a character.** It tracks, calculates, and gloats, which turns losing into a rivalry.
5. **Juice over features.** Screen shake, sound, hit-stop, and particles matter more than extra modes.

---

## 5. Core Gameplay

### 5.1 Match rules
- First to **7** points wins. Optional hard cap of 3 minutes: if time expires, higher score wins; a tie goes to sudden-death next point.
- Puck is served from center toward the player who just conceded (first serve is random).
- Goal is scored when the puck's center fully crosses the goal line within the goal mouth.
- Player defends the **bottom**, robot defends the **top**.
- Paddles cannot cross the center line.
- Puck stuck check: if the puck's speed is below a threshold in one half for more than 4 seconds, it is nudged toward the player who last did not touch it (prevents stalling, especially from the robot).

### 5.2 Table and physics (logical units, scaled to screen)
| Parameter | Value (starting point) |
|---|---|
| Table | 600 x 900 |
| Goal width | 220 |
| Puck radius | 18 |
| Paddle radius | 34 |
| Puck max speed | 1800 px/s |
| Wall restitution | 0.96 |
| Paddle-puck restitution | 1.0 plus transferred paddle velocity |
| Puck drag | ~0.12 per second (slight slowdown) |
| Physics step | Fixed 120 Hz, render interpolated |

Notes:
- Puck-paddle collision is circle-circle with an impulse that includes the paddle's velocity, so fast swipes create fast shots.
- Use swept collision (continuous detection) for the puck against paddles and walls to prevent tunneling at high speed.
- Goal mouth corners use small circle colliders so shots into the post bounce naturally.

### 5.3 Player controls
- **Desktop:** paddle follows the mouse pointer (pointer lock optional), clamped to the player half. Movement speed capped at a generous limit so the paddle doesn't teleport on fast mouse flicks (cap ~2200 px/s, higher than the robot's).
- **Mobile:** paddle follows the touch point with a small vertical offset so the finger doesn't cover it. Multi-touch ignored.
- **Keyboard (accessibility, optional):** arrow keys / WASD.
- Pause with Esc / on-screen button.

### 5.4 Game flow
1. **Title screen:** logo, "Play" button, settings (sound, vibration, reduced motion). One tap to start.
2. **Pre-match:** 3-2-1 countdown with the robot's tracking UI "booting."
3. **Match:** gameplay with HUD.
4. **Point scored:** brief slow-motion and robot/player reaction; serve resumes after ~1.2 s.
5. **Match end:** result screen with score, a short "why you lost / how you won" insight, and a big **Rematch** button.
6. Rematch starts instantly. Menu and settings are secondary.

---

## 6. Robot AI Specification

Reference implementation: `robotAI.ts` (companion file).

### 6.1 Behavior summary
The robot is a prediction-driven defender with limited reaction time and a speed cap, plus occasional aggressive overcommits.

### 6.2 Capabilities (what makes it feel superhuman)
- **Trajectory prediction:** computes the time the puck reaches its defense line and unfolds the path through wall bounces to find the intercept x. It moves before the puck arrives.
- **Positional discipline:** returns to a home line near its goal and loosely shadows the puck's x when no threat is incoming.
- **Consistent execution:** doesn't get tired, tilted, or distracted.

### 6.3 Limitations (what makes it beatable)
| Limitation | Effect | Player counterplay |
|---|---|---|
| Reaction delay (80-150 ms) | It acts on stale puck data | Sudden direction changes: fast wall rebounds, redirected shots |
| Paddle speed cap (900-1400 px/s) | Can't cover the full width instantly | Cross-table shots; alternating left-right |
| Aim error scaling with puck speed | Misses grow on hard shots | Hit the puck harder |
| Overcommit (approx. 450 ms) | Leaves a gap behind when it lunges at loose pucks | Counter-shot immediately after it commits |
| Error rolled once per hit | Predictable "personality," not random jitter | Learn its tendencies |

### 6.4 Difficulty parameters
Single `skill` value (0 to 1) maps to: reaction delay, max speed, base error, error per speed, aggression. Default start skill: **0.35**. See `skillToConfig()`.

### 6.5 Difficulty Director (hidden rubber-banding)
- Skill adjusts after each point and each match.
- First **two matches** are capped at skill 0.4 so new players can scrape a win.
- Robot eases off when leading by 3+ points to keep losses close; tightens when the player is on a streak.
- Skill clamped to 0.15-0.95 so it never becomes trivial or truly impossible.
- Target: long-run player win rate ~25%.
- All director values are data-driven (a single JSON/TS config) for fast tuning.

### 6.6 Robot character and feedback
- **Tracking indicator:** a thin predicted-path line or reticle that appears briefly when the robot "locks on." This sells the sense of machine calculation, and doubles as a readable tell for players.
- **Reactions:** small animation or screen glow when it scores; a brief "glitch" or stutter when it concedes.
- **Optional text lines** (rare, short, non-repeating): e.g. "Calculated." on a save, "Error." when it concedes. No taunting that crosses into annoying.
- Voice/sfx: mechanical servo whine that rises with paddle speed.

---

## 7. UI / UX

### 7.1 HUD
- Score for both sides, large and high-contrast, at the table edges.
- Optional match timer.
- Minimal. No clutter during play.

### 7.2 Result screen
- Final score and a one-line insight, generated from simple match stats, for example:
  - "You lost 4 of 7 points to cross-table shots."
  - "You scored 3 times right after the robot overcommitted."
- Big **Rematch** button, small **Menu**.

### 7.3 Visual style
- Neon-industrial: dark table, glowing rails, a bright puck with a light trail.
- Puck trail length scales with speed so speed is *felt*.
- Robot paddle has a distinct color and glow; player's is a contrasting hue.
- Colorblind-safe palette check (player vs. robot must be distinguishable by shape/brightness, not just hue).

### 7.4 Juice
- Hit-stop (2-3 frames) on hard hits.
- Screen shake scaled to impact speed, with a reduce-motion setting that disables it.
- Particle burst on paddle hits and goals.
- Slow-motion replay of the last 1.5 s on a goal (optional, v1.1).
- Haptics on mobile via the Vibration API where supported.

### 7.5 Audio
- Puck-on-table hum (pitch ties to speed), paddle clack, wall tick, goal horn, countdown beeps.
- Adaptive music layer that intensifies as the score gets close (match point).
- Master, music, and sfx volume settings; mute persists.

---

## 8. Technical Architecture

### 8.1 Modules
- `Game` (loop, state machine: Title, Countdown, Playing, PointScored, MatchEnd, Paused)
- `Physics` (puck, paddles, walls, swept collisions, fixed timestep)
- `Input` (mouse, touch, keyboard abstraction producing a target position)
- `RobotAI` and `DifficultyDirector` (per `robotAI.ts`)
- `Renderer` (Canvas 2D, interpolation, particles, trail)
- `Audio` (Web Audio, sound pool)
- `Storage` (localStorage: settings, stats, current skill)
- `Telemetry` (optional, privacy-light, see 10)

### 8.2 Loop
Fixed-timestep accumulator at 120 Hz for physics and AI; render each animation frame with interpolation between the last two physics states. AI runs inside the fixed step so it's deterministic and frame-rate independent.

### 8.3 Responsiveness
Logical table is a fixed 600x900 coordinate space, scaled to fit the viewport with letterboxing; handles landscape by rotating the table or showing it vertically centered. DPR-aware canvas for sharp rendering.

### 8.4 Performance budget
- 60 FPS on mid-range mobile (target: iPhone 11 / Pixel 6 class).
- Under 150 KB gzipped JS, no runtime dependencies beyond the bundler.
- No allocations in the hot loop (reuse vectors, particle pool).

### 8.5 Testing
- Unit tests for: wall-fold prediction, swept collision, goal detection, director clamps.
- Headless AI simulation (robot vs. a scripted "average player" bot) to verify the target win-rate band before manual playtesting.
- Manual device matrix: iOS Safari, Android Chrome, desktop Chrome/Firefox.

---

## 9. Progression and Retention (lightweight)

- Local stats: matches played, win rate, best streak, fastest win.
- Optional **"Robot Mark" levels** (cosmetic labels like Mk I, Mk II) tied to the player's win count, giving a sense of climbing against the same machine. Does not change real difficulty beyond the director.
- Daily "challenge" variants are out of scope for v1.

---

## 10. Analytics (optional, privacy-light)

If included, anonymous and aggregate only, no personal data:
- Match result, score, duration
- Skill value at start/end of match
- Rematch taken (yes/no)
- Device class and input type

Primary use: validate the win-rate band and rematch rate. Provide an opt-out toggle.

---

## 11. Milestones

| Milestone | Scope | Exit criteria |
|---|---|---|
| M1: Core feel | Table, puck, paddle, physics, mouse/touch input | Hitting the puck feels good and fast, no tunneling |
| M2: Robot | Prediction, delay, error, speed cap | Robot looks smart; can be beaten with cross-table and rebound shots |
| M3: Director | Skill adjustment, first-match easing | Headless sim lands in 20-30% player win rate |
| M4: Game loop | State machine, HUD, rematch flow, result insights | Full match from title to rematch with no dead ends |
| M5: Juice and audio | Trails, shake, hit-stop, sfx, music | Playtesters describe the game as "fast" and "smooth" |
| M6: Polish and ship | Mobile tuning, accessibility, perf pass, deploy | Meets all acceptance criteria below |

---

## 12. Acceptance Criteria (v1)

- [ ] A match can be started within 2 interactions from page load.
- [ ] No puck tunneling at max speed in automated stress tests.
- [ ] Headless simulation: average-bot player win rate between 20% and 30% over 1,000 matches.
- [ ] At least 60% of losses in simulation end within a 2-point margin.
- [ ] Locked 60 FPS on target mobile device during play with particles active.
- [ ] Touch, mouse, and keyboard all fully functional.
- [ ] Reduce-motion, mute, and vibration toggles work and persist.
- [ ] Result screen shows an insight line and a one-tap rematch.

---

## 13. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Players feel the game is rigged | Medium | Honest framing, visible tracking line, consistent learnable weaknesses, close losses |
| "AI wins most" turns off casual players | Medium | Gentle first two matches, quick rematch, early small wins (scoring points) |
| Rubber-banding becomes noticeable | Medium | Small per-point adjustments, clamp skill, never alter physics, only AI parameters |
| Mobile touch latency makes player feel handicapped | Medium | Offset paddle above finger, high-priority input handling, test on real devices |
| Physics feels floaty or janky | Medium | Fixed timestep, swept collision, tuning pass in M1 before any AI work |
| Robot stalls or plays too passively | Low | Stuck-puck rule, aggression parameter, forced serve timer |

---

## 14. Future (post-v1)

- Online 1v1 with the same physics core (deterministic, rollback-friendly).
- Multiple robot "personalities" (defensive, aggressive, tricky) with distinct weaknesses.
- Tournament ladder against a series of robots.
- Power-ups mode as an optional variant.
- Replay sharing (short GIF/video clip of the best goal).

---

## 15. Open Questions

1. Final name and visual identity (Overclock is a placeholder).
2. Vertical-only table, or support a landscape-native layout?
3. Should the tracking line be on by default, or earned/unlocked?
4. Is a 3-minute match cap worth it, or is first-to-7 enough?
5. Include analytics at all in v1, or ship clean and add later?
