"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, wsUrl } from "./api";
import type { ApprovalRow, GatewayWsEvent } from "./types";

type Listener = (event: GatewayWsEvent) => void;

interface WsContextValue {
  /** Live count of pending approvals for the nav badge. */
  pendingCount: number;
  refreshPending: () => void;
  /** Subscribe to every gateway broadcast; returns an unsubscribe fn. */
  subscribe: (listener: Listener) => () => void;
}

const WsContext = createContext<WsContextValue | null>(null);

const RECONNECT_DELAY_MS = 3000;

/**
 * One long-lived websocket for global broadcasts (approval-pending,
 * approval-decided, job-ran). Chat opens its own socket so a streaming turn
 * never competes with the broadcast listener. Mount only when paired.
 */
export function WsProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);
  const listenersRef = useRef<Set<Listener>>(new Set());

  const refreshPending = useCallback(() => {
    api
      .get<ApprovalRow[]>("/approvals?status=pending")
      .then((rows) => setPendingCount(rows.length))
      .catch(() => {
        /* gateway briefly unreachable — the LED tells that story */
      });
  }, []);

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    let closed = false;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const url = wsUrl();
      if (!url || closed) return;
      socket = new WebSocket(url);
      socket.onmessage = (msg) => {
        let event: GatewayWsEvent;
        try {
          event = JSON.parse(String(msg.data)) as GatewayWsEvent;
        } catch {
          return;
        }
        if (event.type === "approval-pending" || event.type === "approval-decided") {
          refreshPending();
        }
        for (const listener of listenersRef.current) listener(event);
      };
      socket.onclose = () => {
        if (!closed) timer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();
    refreshPending();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [refreshPending]);

  return (
    <WsContext.Provider value={{ pendingCount, refreshPending, subscribe }}>
      {children}
    </WsContext.Provider>
  );
}

export function useWs(): WsContextValue {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error("useWs must be used inside <WsProvider>");
  return ctx;
}
