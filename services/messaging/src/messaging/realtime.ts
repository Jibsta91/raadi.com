import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { Logger } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import type { JwtVerifier, Principal } from '@raadi/service-kit';
import { Redis } from 'iovalkey';
import { type WebSocket, WebSocketServer } from 'ws';
import type { Message, MessageRow } from './model.js';
import { toMessage } from './model.js';

export const WS_PATH = '/api/v1/messaging/ws';
const CHANNEL = 'messaging:events';
const MAX_SOCKETS_PER_USER = 5;
const HEARTBEAT_MS = 30_000;

/** What instances publish to each other through Valkey. */
export type RealtimeEvent =
  | { type: 'message'; participants: string[]; message: MessageRow }
  | { type: 'read'; participants: string[]; conversationId: string; readerId: string };

/** What a browser receives, already personalised for its user. */
export type ClientEvent =
  | { type: 'hello' }
  | { type: 'message'; message: Message }
  | { type: 'read'; conversationId: string; byMe: boolean };

const meter = metrics.getMeter('messaging');
const delivered = meter.createCounter('raadi.messaging.deliveries', {
  description: 'Realtime events pushed to open WebSockets',
});
const rejected = meter.createCounter('raadi.messaging.ws_rejected', {
  description: 'WebSocket upgrades refused, by reason',
});

export interface RealtimeOptions {
  verifier: JwtVerifier;
  /** Allowed browser Origin (cross-site WebSocket hijacking guard). */
  origin: string;
  valkey: { host: string; port: number; username: string; password: string };
  log?: Logger;
}

/**
 * Push-only WebSocket delivery. Clients send messages over REST; this hub
 * only pushes new messages and read receipts to the participants' open
 * sockets. Instances share events over Valkey pub/sub, so any instance can
 * serve any user.
 */
export class RealtimeHub {
  private readonly sockets = new Map<string, Set<WebSocket>>();
  private readonly alive = new WeakSet<WebSocket>();
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  private readonly pub: Redis;
  private readonly sub: Redis;
  private readonly log: Logger;
  private heartbeat?: NodeJS.Timeout;

  constructor(private readonly opts: RealtimeOptions) {
    this.log = opts.log ?? new Logger('RealtimeHub');
    const conn = {
      host: opts.valkey.host,
      port: opts.valkey.port,
      username: opts.valkey.username,
      password: opts.valkey.password,
      // The ACL user may only PING, PUBLISH and SUBSCRIBE (no INFO for the ready check).
      enableReadyCheck: false,
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    };
    this.pub = new Redis(conn);
    this.sub = new Redis(conn);
    meter
      .createObservableGauge('raadi.messaging.connections', {
        description: 'Open WebSocket connections on this instance',
      })
      .addCallback((r) => r.observe(this.connectionCount()));
  }

  async start(server: Server): Promise<void> {
    await Promise.all([this.pub.connect(), this.sub.connect()]);
    await this.sub.subscribe(CHANNEL);
    this.sub.on('message', (_channel: string, raw: string) => this.dispatch(raw));
    server.on('upgrade', (req, socket, head) => {
      void this.upgrade(req, socket, head);
    });
    this.heartbeat = setInterval(() => this.ping(), HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  async ping(): Promise<void> {
    for (const set of this.sockets.values()) {
      for (const ws of set) {
        if (!this.alive.has(ws)) {
          ws.terminate();
          continue;
        }
        this.alive.delete(ws);
        ws.ping();
      }
    }
  }

  /** Readiness: the publisher connection answers. */
  async check(): Promise<void> {
    await this.pub.ping();
  }

  async publish(event: RealtimeEvent): Promise<void> {
    await this.pub.publish(CHANNEL, JSON.stringify(event));
  }

  connectionCount(): number {
    let n = 0;
    for (const set of this.sockets.values()) n += set.size;
    return n;
  }

  async close(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const set of this.sockets.values())
      for (const ws of set) ws.close(1001, 'server shutdown');
    this.wss.close();
    // disconnect(), not QUIT: the ACL user may only PING, PUBLISH and SUBSCRIBE.
    this.sub.disconnect();
    this.pub.disconnect();
  }

  /** Delivers an event from Valkey to this instance's sockets of the participants. */
  private dispatch(raw: string): void {
    let event: RealtimeEvent;
    try {
      event = JSON.parse(raw) as RealtimeEvent;
    } catch {
      return;
    }
    for (const userId of event.participants) {
      const set = this.sockets.get(userId);
      if (!set?.size) continue;
      const payload = JSON.stringify(personalise(event, userId));
      for (const ws of set) {
        ws.send(payload);
        delivered.add(1, { type: event.type });
      }
    }
  }

  private async upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const path = (req.url ?? '').split('?')[0];
    if (path !== WS_PATH) return refuse(socket, 404, 'not_found');
    // Browsers always send Origin on a WebSocket handshake; refusing foreign
    // origins stops other sites from opening a socket with the user's cookie.
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== this.opts.origin) return refuse(socket, 403, 'origin');

    const header = req.headers.authorization;
    let principal: Principal;
    try {
      if (!header?.startsWith('Bearer ')) throw new Error('missing token');
      principal = await this.opts.verifier.verify(header.slice(7));
    } catch {
      return refuse(socket, 401, 'token');
    }
    if (!principal.roles.includes('user')) return refuse(socket, 403, 'role');
    if ((this.sockets.get(principal.sub)?.size ?? 0) >= MAX_SOCKETS_PER_USER) {
      return refuse(socket, 429, 'too_many');
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => this.register(ws, principal));
  }

  private register(ws: WebSocket, principal: Principal): void {
    const userId = principal.sub;
    const set = this.sockets.get(userId) ?? new Set<WebSocket>();
    set.add(ws);
    this.sockets.set(userId, set);
    this.alive.add(ws);

    // The socket lives no longer than the token that opened it; the client
    // reconnects and the gateway's token handler issues a fresh token.
    const exp = typeof principal.claims.exp === 'number' ? principal.claims.exp * 1000 : 0;
    const expiry = setTimeout(() => ws.close(4001, 'token expired'), Math.max(exp - Date.now(), 0));
    expiry.unref();

    ws.on('pong', () => this.alive.add(ws));
    // Push-only: anything the client sends is ignored (maxPayload bounds it).
    ws.on('message', () => undefined);
    ws.on('error', (err) => this.log.warn({ err }, 'websocket error'));
    ws.on('close', () => {
      clearTimeout(expiry);
      set.delete(ws);
      if (set.size === 0) this.sockets.delete(userId);
    });
    ws.send(JSON.stringify({ type: 'hello' } satisfies ClientEvent));
  }
}

export function personalise(event: RealtimeEvent, userId: string): ClientEvent {
  if (event.type === 'message') {
    const row = { ...event.message, created_at: new Date(event.message.created_at) };
    return { type: 'message', message: toMessage(row, userId) };
  }
  return { type: 'read', conversationId: event.conversationId, byMe: event.readerId === userId };
}

function refuse(socket: Duplex, status: number, reason: string): void {
  rejected.add(1, { reason });
  const text = {
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    429: 'Too Many Requests',
  }[status as 401 | 403 | 404 | 429];
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}
