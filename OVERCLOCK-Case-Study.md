# OVERCLOCK — Systems Architecture, Mathematical Physics & WebRTC Case Study
**A Deterministic 120Hz Physics Engine, Predictive Heuristic AI & Serverless WebRTC Multiplayer Cyber-Arcade**

---

### Executive Overview & Metadata

| Field | Specification |
| :--- | :--- |
| **Role** | Lead Systems & Gameplay Architect, Physics Engine, Predictive AI State Heuristics, WebRTC P2P DataChannels, GPU Canvas Optimization |
| **Platform** | Mobile-First Progressive Web App (iOS / Android) & High-Refresh Desktop Browsers |
| **Tech Stack** | TypeScript (Strict ESNext), HTML5 Canvas 2D Vector GPU Pipeline, WebRTC (PeerJS Mesh), Service Worker (Network-First PWA), Web Audio API |
| **Operating Cost** | **$0.00 / month** (100% serverless peer-to-peer data mesh) |
| **Bundle Size** | **< 35 KB gzipped** (Zero third-party game engine dependencies) |
| **Frame Budget** | **120 FPS flatline** (< 3.2 ms average frame compute time) |

---

## 1. Executive Summary
**OVERCLOCK** is a high-speed, client-authoritative kinetic cyber air hockey platform engineered to eliminate the high latency, frame stutter, and prohibitive server expenses that plague competitive real-time web gaming. Standard web action games suffer from bloat—relying on heavy multi-megabyte runtimes (Unity WebGL, Phaser) and costly dedicated WebSocket backend servers that falter on mobile connections.

OVERCLOCK solves these bottlenecks by unifying five purpose-built engines into a lightweight (<35KB) web-native package:
1. **Deterministic 120Hz Physics Engine:** Employs continuous swept sub-stepping and separating-axis velocity guards to prevent tunneling at 2,500 px/s.
2. **Predictive Heuristic AI Engine:** Calculates bank-shot geometry and human reaction jitter across 4 difficulty tiers.
3. **Serverless WebRTC P2P Multiplayer Mesh:** Achieves real-time 1v1 play with zero dedicated hosting costs via browser DataChannels.
4. **Zero-Allocation Canvas 2D Vector GPU Pipeline:** Delivers flatline 120 FPS without Garbage Collection pauses.
5. **Offline-First Progressive Web App (PWA):** Enables installable standalone play on iOS and Android.

---

## 2. Research & Systems Analysis: Problem vs. Solution Matrix

| Identified Market & Engineering Friction | OVERCLOCK Architectural & Engineering Solution |
| :--- | :--- |
| **Physics Tunneling at Extreme Velocities:** Supersonic pucks (>2,000 px/s) clip through mallets and arena rails due to discrete step sampling. | **Continuous Collision Detection (CCD):** Sub-step swept raycasting, strict bounding clamp restitution, and separating-axis relative velocity guards (`relNormVel >= 0`). |
| **Mobile GPU Throttling & Frame Stutter:** Software Gaussian blur passes (`shadowBlur`) and GC allocations cause dropped frames on mobile. | **Zero-Allocation Canvas Pipeline:** Batched 37 grid lines into a single draw call, eliminated gradient allocations, and forced `shadowBlur = 0` for 120 FPS hardware rasterization. |
| **Multiplayer Cloud Infrastructure Costs:** Dedicated authoritative game servers create high recurring monthly cloud bills. | **Host-Authoritative WebRTC P2P Mesh:** Direct browser-to-browser SCTP DataChannels with 30Hz delta compression and client dead-reckoning—operating at **$0/mo cloud cost**. |
| **Touch Input Tracking Lag:** Mallet interpolation between physics ticks introduces an artificial ~8.3ms visual lag behind the player's finger. | **Direct 1:1 Mallet Tracking:** Decoupled player mallet from tick interpolation, rendering live pointer positions directly while caching canvas rect bounds across touches. |

---

## 3. User Personas

### Tyler (The Competitive Arcade Player)
* **Demographics:** Age 24, Esports enthusiast & fighting-game streamer.
* **Pain Points:** Frustrated by laggy web games with floaty physics, loose hitboxes, and sluggish response.
* **Goals:** Instant 1v1 challenges, microsecond parry deflection, and brutal AI boss tiers.
* **Overclock Solution:** 120Hz physics, sub-15ms touch latency, and MK-IV Singularity boss tier.

### Priya (The Commuter & Mobile Casual)
* **Demographics:** Age 29, Product designer & daily subway commuter.
* **Pain Points:** Refuses to install heavy 200MB app-store games with paywalls, forced ads, and login screens.
* **Goals:** Zero-install instant play, offline support during transit, fluid portrait gameplay.
* **Overclock Solution:** Zero-download PWA, full offline Service Worker cache, and local save persistence.

---

## 4. How the Platform Works: End-to-End User Journey

1. **Instant Boot & Service Worker:** User opens link or launches PWA icon. The Network-First Service Worker loads the bundle in <350ms and registers an offline cache.
2. **AI Difficulty Selection:** Player selects difficulty (Casual / Normal / Overclocked). The AI dynamically tunes its reaction window (80ms–240ms), error jitter, and max speed.
3. **Deterministic Physics Loop:** 120Hz fixed accumulator (`dt = 0.00833s`) advances simulation; swept vector math calculates momentum transfer with kinetic restitution.
4. **Kinetic Parry & Overdrive:** Timed parry within 150ms of incoming shot activates 1.55x velocity multiplier, emits radial shockwaves, and charges Overdrive meter for an EMP smash.
5. **Peer-to-Peer 1v1 Room:** Host generates a 4-character code. PeerJS negotiates a WebRTC DataChannel. Host runs authoritative simulation at 120Hz and broadcasts 30Hz delta snapshots; Guest predicts locally.
6. **Persistence & Record Tracking:** Match concludes; `StorageManager` persists player stats, win streaks, and unlocked mallet skins to `localStorage`.

---

## 5. Mathematical Physics & Collision Specifications

```typescript
// 1. Separating-Axis Relative Velocity Guard:
const relVelX = puck.vx - mallet.vx;
const relVelY = puck.vy - mallet.vy;
const relNormVel = relVelX * normalX + relVelY * normalY;

// Ignore collision if already separating (prevents double-bounce glueing)
if (relNormVel >= 0) return;

// 2. Positional De-penetration Restitution:
const overlap = (puck.radius + mallet.radius) - distance;
puck.x += normalX * overlap;
puck.y += normalY * overlap;

// 3. Dynamic Kinetic Momentum Transfer:
const impulse = -(1 + restitution) * relNormVel;
puck.vx += normalX * impulse + mallet.vx * malletTransferFactor;
puck.vy += normalY * impulse + mallet.vy * malletTransferFactor;
```

---

## 6. WebRTC Host-Authoritative Snapshot Protocol Schema

```typescript
interface MultiplayerStatePayload {
  seq: number;          // Monotonically increasing tick sequence
  t: number;            // High-resolution timestamp for jitter smoothing
  puck: { x: number; y: number; vx: number; vy: number };
  host: { x: number; y: number; score: number; energy: number };
  guest: { score: number; energy: number };
  events: Array<'GOAL' | 'PARRY' | 'OVERDRIVE' | 'MATCH_POINT'>;
}
```

---

## 7. Performance Benchmarks

* **Rendering Refresh:** 120 FPS stable across mobile (WebKit / Blink) and desktop.
* **Frame Compute Budget:** < 3.2 ms average frame execution.
* **Bundle Footprint:** < 35 KB gzipped with zero external game engine dependencies.
* **Cloud Infrastructure Cost:** **$0.00 / month** running on serverless P2P mesh architecture.

