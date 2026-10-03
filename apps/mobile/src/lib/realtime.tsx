// Live messaging events over the messaging service's WebSocket (ADR-0016). One connection per app,
// shared by every screen that subscribes. On the web the gateway turns the session cookie into a
// token; on native the handshake carries the bearer token.
import type { Message } from '@raadi/api-client';
import { createContext, use, useEffect, useRef, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './auth/context';
import { reconnectDelay } from './backoff';
import { config } from './config';
import { websocketUrl } from './urls';

export type RealtimeEvent =
  | { type: 'hello' }
  | { type: 'message'; message: Message }
  | { type: 'read'; conversationId: string; byMe: boolean };

type Listener = (event: RealtimeEvent) => void;

const WS_PATH = '/api/v1/messaging/ws';

type NativeWebSocket = new (
  url: string,
  protocols: string[] | undefined,
  options: { headers: Record<string, string> },
) => WebSocket;

const RealtimeContext = createContext<Set<Listener> | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status, socketHeaders } = useAuth();
  const listeners = useRef(new Set<Listener>());
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (!signedIn) return;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;

    const connect = async () => {
      const url = websocketUrl(config.apiBaseUrl || window.location.origin, WS_PATH);
      if (Platform.OS === 'web') {
        socket = new WebSocket(url);
      } else {
        // React Native's WebSocket accepts handshake headers as a third argument.
        const headers = (await socketHeaders()) ?? {};
        if (stopped) return;
        socket = new (WebSocket as unknown as NativeWebSocket)(url, undefined, { headers });
      }
      socket.onopen = () => {
        attempt = 0;
      };
      socket.onmessage = (msg) => {
        let event: RealtimeEvent;
        try {
          event = JSON.parse(String(msg.data)) as RealtimeEvent;
        } catch {
          return;
        }
        for (const listener of listeners.current) listener(event);
      };
      socket.onclose = (event) => {
        if (stopped) return;
        // 4001: the token that opened the socket expired; reconnect straight away with a fresh one.
        const delay = event.code === 4001 ? 0 : reconnectDelay(attempt++);
        timer = setTimeout(() => void connect(), delay);
      };
    };

    void connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [signedIn, socketHeaders]);

  return <RealtimeContext value={listeners.current}>{children}</RealtimeContext>;
}

/** Calls `onEvent` for every live event while the component is mounted. */
export function useRealtime(onEvent: Listener): void {
  const listeners = use(RealtimeContext);
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    if (!listeners) return;
    const listener: Listener = (event) => handler.current(event);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [listeners]);
}
