// WebRTC Peer-to-Peer Cross-Device Multiplayer using PeerJS
import { Peer, DataConnection } from 'peerjs';
import { Vec2, Score } from '../types';

export interface NetworkStatePacket {
  puck: { pos: Vec2; vel: Vec2; spin: number; isHyper: boolean; isGolden: boolean };
  puck2?: { pos: Vec2; vel: Vec2; spin: number };
  hostPaddle: { pos: Vec2; vel: Vec2; radius: number; parry: boolean };
  guestPaddle: { pos: Vec2; vel: Vec2; radius: number; parry: boolean };
  score: Score;
  series?: {
    playerGames: number;
    robotGames: number;
    targetGamesToWin: number;
    format: 'BO1' | 'BO3' | 'BO5' | 'FIRST_TO_3';
  };
  clockSpeed: number;
  goalBanner: string | null;
  lastScorer?: 'player' | 'robot' | null;
  state: string;
  countdownText: string | null;
  seq?: number;
  ackHitSeq?: number;
}

export interface ClientInputPacket {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  parry: boolean;
  overdrive: boolean;
  timestamp: number;
  hitEvent?: {
    hitSeq: number;
    puckPos: Vec2;
    puckVel: Vec2;
    spin: number;
    isHyper: boolean;
    isParry: boolean;
  };
}

export type NetRole = 'HOST' | 'GUEST' | 'OFFLINE';

export interface ControlPacket {
  type: 'REMATCH_OFFER' | 'REMATCH_ACCEPT';
}

export class MultiplayerManager {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  public role: NetRole = 'OFFLINE';
  public roomId: string | null = null;
  public isConnected = false;
  public pingMs = 0;

  // Callbacks
  public onConnected: (() => void) | null = null;
  public onDisconnected: (() => void) | null = null;
  public onStatePacket: ((packet: NetworkStatePacket) => void) | null = null;
  public onClientInput: ((input: ClientInputPacket) => void) | null = null;
  public onRematchRequested: (() => void) | null = null;
  public onRematchAccepted: (() => void) | null = null;
  public onError: ((err: string) => void) | null = null;

  constructor() {}

  /**
   * Host an online room. Generates or reclaims a session room code.
   */
  public hostGame(onRoomReady: (code: string) => void) {
    this.role = 'HOST';
    // Reclaim room ID from sessionStorage if available so reloading doesn't break the invite
    let fullRoomId = sessionStorage.getItem('overclock_host_room_id');
    if (!fullRoomId) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
      fullRoomId = `oc-${randomSuffix}`;
      try {
        sessionStorage.setItem('overclock_host_room_id', fullRoomId);
      } catch {}
    }

    try {
      if (this.peer && !this.peer.destroyed) {
        this.peer.destroy();
      }

      this.peer = new Peer(fullRoomId);

      this.peer.on('open', (id) => {
        this.roomId = id.toUpperCase();
        onRoomReady(this.roomId);
      });

      this.peer.on('connection', (connection) => {
        this.conn = connection;
        this.setupConnection();
      });

      this.peer.on('error', (err: any) => {
        console.warn('PeerJS host error:', err);
        // If the ID was still taken (e.g. quick refresh before server cleared it), generate fresh one
        if (err.type === 'unavailable-id') {
          try {
            sessionStorage.removeItem('overclock_host_room_id');
          } catch {}
          const newSuffix = Math.floor(1000 + Math.random() * 9000).toString();
          const fallbackId = `oc-${newSuffix}`;
          try {
            sessionStorage.setItem('overclock_host_room_id', fallbackId);
          } catch {}
          this.peer = new Peer(fallbackId);
          this.peer.on('open', (id) => {
            this.roomId = id.toUpperCase();
            onRoomReady(this.roomId);
          });
          this.peer.on('connection', (conn) => {
            this.conn = conn;
            this.setupConnection();
          });
          return;
        }
        if (this.onError) this.onError(err.message || 'Connection error');
      });
    } catch (e) {
      console.error(e);
      if (this.onError) this.onError('Failed to initialize WebRTC peer');
    }
  }

  /**
   * Join an existing room using the room code.
   */
  public joinGame(roomCode: string) {
    this.role = 'GUEST';
    let targetId = roomCode.trim().toLowerCase();
    if (!targetId.startsWith('oc-')) {
      targetId = `oc-${targetId}`;
    }

    try {
      if (this.peer && !this.peer.destroyed) {
        this.peer.destroy();
      }

      let connectionTimeout: any = null;
      let hasConnected = false;

      this.peer = new Peer();

      this.peer.on('open', () => {
        this.conn = this.peer!.connect(targetId, { reliable: true });
        this.setupConnection();

        // 10 second timeout for inactive/expired room
        connectionTimeout = setTimeout(() => {
          if (!hasConnected && !this.isConnected) {
            if (this.conn) {
              try { this.conn.close(); } catch {}
            }
            if (this.onError) {
              this.onError('Room host is offline or the invite has expired. Please check the code or ask the host for a new invite.');
            }
          }
        }, 10000);
      });

      const originalOnConnected = this.onConnected;
      this.onConnected = () => {
        hasConnected = true;
        if (connectionTimeout) clearTimeout(connectionTimeout);
        if (originalOnConnected) originalOnConnected();
      };

      this.peer.on('error', (err: any) => {
        console.warn('PeerJS join error:', err);
        if (connectionTimeout) clearTimeout(connectionTimeout);
        if (err.type === 'peer-unavailable') {
          if (this.onError) this.onError('Room not found. The host may have left, closed the game, or the code expired.');
        } else {
          if (this.onError) this.onError(err.message || 'Could not connect to room');
        }
      });
    } catch (e) {
      console.error(e);
      if (this.onError) this.onError('Failed to connect to room');
    }
  }

  private setupConnection() {
    if (!this.conn) return;

    this.conn.on('open', () => {
      this.isConnected = true;
      if (this.onConnected) this.onConnected();
    });

    this.conn.on('data', (data: unknown) => {
      const msg = data as { type?: string };
      if (msg && msg.type === 'REMATCH_OFFER') {
        if (this.onRematchRequested) this.onRematchRequested();
        return;
      }
      if (msg && msg.type === 'REMATCH_ACCEPT') {
        if (this.onRematchAccepted) this.onRematchAccepted();
        return;
      }

      if (this.role === 'HOST' && this.onClientInput) {
        this.onClientInput(data as ClientInputPacket);
      } else if (this.role === 'GUEST' && this.onStatePacket) {
        this.onStatePacket(data as NetworkStatePacket);
      }
    });

    this.conn.on('close', () => {
      this.isConnected = false;
      if (this.onDisconnected) this.onDisconnected();
    });

    this.conn.on('error', (err) => {
      if (this.onError) this.onError(err.message || 'Connection dropped');
    });
  }

  /**
   * Host sends authoritative physics packet to guest.
   */
  public sendState(packet: NetworkStatePacket) {
    if (this.isConnected && this.conn && this.conn.open) {
      this.conn.send(packet);
    }
  }

  /**
   * Guest sends paddle target input to host.
   */
  public sendInput(input: ClientInputPacket) {
    if (this.isConnected && this.conn && this.conn.open) {
      this.conn.send(input);
    }
  }

  public sendRematchOffer() {
    if (this.isConnected && this.conn && this.conn.open) {
      this.conn.send({ type: 'REMATCH_OFFER' });
    }
  }

  public sendRematchAccept() {
    if (this.isConnected && this.conn && this.conn.open) {
      this.conn.send({ type: 'REMATCH_ACCEPT' });
    }
  }

  public disconnect() {
    this.isConnected = false;
    this.role = 'OFFLINE';
    try {
      sessionStorage.removeItem('overclock_host_room_id');
    } catch {}
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
}

