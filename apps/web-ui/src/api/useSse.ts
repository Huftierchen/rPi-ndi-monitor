import { useEffect, useRef, useState } from "react";
import type { SseEvent } from "./types.ts";

export type SseConnectionState = "connecting" | "live" | "reconnecting" | "offline";

export function useSse(handler: (event: SseEvent) => void): SseConnectionState {
  const [state, setState] = useState<SseConnectionState>("connecting");
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let cancelled = false;
    let backoff = 1000;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = (): void => {
      if (cancelled) return;
      setState((prev) => (prev === "live" ? "reconnecting" : prev));
      es = new EventSource("/api/events");
      es.onopen = () => {
        backoff = 1000;
        setState("live");
      };
      es.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data) as SseEvent;
          handlerRef.current(parsed);
        } catch {
          /* ignore malformed */
        }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (cancelled) return;
        setState("reconnecting");
        retryTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 10000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
      setState("offline");
    };
  }, []);

  return state;
}
