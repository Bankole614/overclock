// WebRTC Peer-to-Peer Cross-Device Multiplayer using PeerJS
import { Peer, DataConnection } from 'peerjs';
import { Vec2, Score } from '../types';

export interface NetworkStatePacket {
  puck: { pos: Vec2; vel: Vec2; spin: number; isHyper: boolean; isGolden: boolean };
  puck2?: { pos: Vec2; vel: Vec2; spin: number };
  hostPaddle: { pos: Vec2; vel: Vec2; radius: number; parry: boolean };
  guestPaddle: { pos: Vec2; vel: Vec2; radius: number; parry: boolean };
  score: Score;
  clockSpeed: number;
  goalBanner: string | null;
  state: string;
  countdownText: string | null;
  seq?: number;
}

export interface ClientInputPacket {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  parry: boolean;
  overdrive: boolean;
  timestamp: number;
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
   * Host an online room. Generates a short 5-character room code.
   */
  public hostGame(onRoomReady: (code: string) => void) {
    this.role = 'HOST';
    const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
    const fullRoomId = `oc-${randomSuffix}`;

    try {
      this.peer = new Peer(fullRoomId);

      this.peer.on('open', (id) => {
        this.roomId = id.toUpperCase();
        onRoomReady(this.roomId);
      });

      this.peer.on('connection', (connection) => {
        this.conn = connection;
        this.setupConnection();
      });

      this.peer.on('error', (err) => {
        console.warn('PeerJS host error:', err);
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
    const targetId = roomCode.trim().toLowerCase();

    try {
      this.peer = new Peer();

      this.peer.on('open', () => {
        this.conn = this.peer!.connect(targetId, { reliable: true });
        this.setupConnection();
      });

      this.peer.on('error', (err) => {
        console.warn('PeerJS join error:', err);
        if (this.onError) this.onError(err.message || 'Room not found');
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

