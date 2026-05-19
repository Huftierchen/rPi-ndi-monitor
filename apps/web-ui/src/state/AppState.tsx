import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useSse, type SseConnectionState } from "../api/useSse.ts";
import { useStatusState } from "../api/useStatus.ts";
import { useConfigState } from "../api/useConfig.ts";
import { useDiscoveryState } from "../api/useDiscovery.ts";
import { useVersionState } from "../api/useVersion.ts";
import type {
  AppConfig,
  DiscoverySnapshot,
  LogEntry,
  ReceiverRuntimeStatus
} from "../api/types.ts";

export interface FlashMessage {
  kind: "info" | "error";
  message: string;
}

interface AppStateValue {
  status: ReceiverRuntimeStatus | null;
  config: AppConfig | null;
  discovery: DiscoverySnapshot | null;
  sse: SseConnectionState;
  version: string;
  flash: FlashMessage | null;
  showFlash(msg: FlashMessage): void;
  webLog: LogEntry[];
  receiverLog: LogEntry[];
  setConfig(next: AppConfig): void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

const LOG_BUFFER_LIMIT = 500;

function appendCapped(prev: LogEntry[], entry: LogEntry): LogEntry[] {
  const next = [...prev, entry];
  return next.length > LOG_BUFFER_LIMIT ? next.slice(-LOG_BUFFER_LIMIT) : next;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useStatusState();
  const [config, setConfig] = useConfigState();
  const [discovery, setDiscovery] = useDiscoveryState();
  const version = useVersionState();
  const [webLog, setWebLog] = useState<LogEntry[]>([]);
  const [receiverLog, setReceiverLog] = useState<LogEntry[]>([]);
  const [flash, setFlash] = useState<FlashMessage | null>(null);

  const sse = useSse((event) => {
    switch (event.type) {
      case "status":
        setStatus(event.payload);
        break;
      case "discovery":
        setDiscovery(event.payload);
        break;
      case "log":
        if (event.payload.scope === "web") {
          setWebLog((prev) => appendCapped(prev, event.payload));
        } else {
          setReceiverLog((prev) => appendCapped(prev, event.payload));
        }
        break;
    }
  });

  const showFlash = useCallback((msg: FlashMessage): void => {
    setFlash(msg);
    setTimeout(() => setFlash((cur) => (cur === msg ? null : cur)), 4000);
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({
      status,
      config,
      discovery,
      sse,
      version,
      flash,
      showFlash,
      webLog,
      receiverLog,
      setConfig
    }),
    [status, config, discovery, sse, version, flash, showFlash, webLog, receiverLog, setConfig]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState outside provider");
  return ctx;
}
