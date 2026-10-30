"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { api, wsUrl } from "@/lib/api";
import { chatReducer, initialChatState } from "@/lib/chatTurns";
import type { GatewayWsEvent } from "@/lib/types";
import { ChatTranscript } from "@/components/ChatTranscript";
import { EmptyState } from "@/components/EmptyState";

const RECONNECT_DELAY_MS = 2000;

export default function ChatPage() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<string | null>(null);
  sessionRef.current = state.sessionId;

  // Dedicated chat socket: streaming turns continue over this connection even
  // while an approval decision is made elsewhere (broker keeps the waiter).
  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const url = wsUrl();
      if (!url || closed) return;
      const socket = new WebSocket(url);
      socketRef.current = socket;
      socket.onopen = () => setConnected(true);
      socket.onmessage = (msg) => {
        let event: GatewayWsEvent;
        try {
          event = JSON.parse(String(msg.data)) as GatewayWsEvent;
        } catch {
          return;
        }
        dispatch({ type: "event", event });
      };
      socket.onclose = () => {
        setConnected(false);
        if (!closed) {
          dispatch({ type: "disconnected" });
          timer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      socketRef.current?.close();
    };
  }, []);

  // Pin the transcript to the bottom as content streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.turns]);

  const send = useCallback(() => {
    const text = input.trim();
    const socket = socketRef.current;
    if (!text || state.busy || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify({
        type: "chat",
        message: text,
        sessionId: sessionRef.current ?? undefined,
      }),
    );
    dispatch({ type: "send", text });
    setInput("");
  }, [input, state.busy]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const decide = useCallback(async (approvalId: string, approve: boolean) => {
    try {
      await api.post(`/approvals/${approvalId}`, { approve });
      dispatch({ type: "decided", approvalId, approved: approve });
    } catch {
      // The broadcast (or a retry) will reconcile; leave the card actionable.
    }
  }, []);

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col">
      <header className="fade-up mb-6 flex items-end justify-between">
        <div>
          <h1 className="page-title">Chat</h1>
          <p className="mt-1 font-mono text-[12px] text-ink-60">
            {state.sessionId ? `session ${state.sessionId.slice(0, 8)}` : "new session"}
            {connected ? "" : " — reconnecting…"}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => dispatch({ type: "reset" })}
          disabled={state.busy}
        >
          New session
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-6 pr-1">
        {state.turns.length === 0 ? (
          <EmptyState
            glyph=">_"
            message="Direct line to the agent. Tool calls, risks, and approvals appear inline."
          />
        ) : (
          <ChatTranscript turns={state.turns} busy={state.busy} onDecide={decide} />
        )}
      </div>

      <div className="border-t border-line pt-4">
        <textarea
          className="field resize-none font-sans text-[14px]"
          rows={2}
          placeholder={state.busy ? "Turn in progress…" : "Message Jarvis (Enter to send)"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={state.busy || !connected}
          aria-label="Chat message"
        />
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[11px] text-ink-60">Enter to send · Shift+Enter for a newline</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={send}
            disabled={state.busy || !connected || !input.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
