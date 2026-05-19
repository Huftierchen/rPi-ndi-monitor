import type {
  AppConfig,
  DiscoverySnapshot,
  LogEntry,
  ReceiverRuntimeStatus
} from "./types.ts";

const base = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(base + path, {
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: unknown; error?: string };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error ?? `Request failed: ${res.status}`);
  }
  return (json.data ?? json) as T;
}

export const api = {
  getStatus: () => request<ReceiverRuntimeStatus>("/api/status"),
  getConfig: () => request<AppConfig>("/api/settings"),
  putConfig: (patch: unknown) =>
    request<AppConfig>("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),
  getDiscovery: () => request<DiscoverySnapshot | null>("/api/discovery"),
  triggerDiscovery: () => request<DiscoverySnapshot>("/api/discovery", { method: "POST" }),
  start: () => request<ReceiverRuntimeStatus>("/api/control/start", { method: "POST" }),
  stop: () => request<ReceiverRuntimeStatus>("/api/control/stop", { method: "POST" }),
  restart: () => request<ReceiverRuntimeStatus>("/api/control/restart", { method: "POST" }),
  reconnect: () => request<ReceiverRuntimeStatus>("/api/control/reconnect", { method: "POST" }),
  switchSource: (sourceName: string) =>
    request<AppConfig>("/api/control/switch-source", {
      method: "POST",
      body: JSON.stringify({ sourceName })
    }),
  getLogs: (scope: "web" | "receiver", limit = 120) =>
    request<LogEntry[]>(`/api/logs?scope=${scope}&limit=${limit}`),
  getVersion: () => request<{ version: string }>("/api/version")
};
