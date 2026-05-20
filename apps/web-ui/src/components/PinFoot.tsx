import { useAppState } from "../state/AppState.tsx";
import type { SseConnectionState } from "../api/useSse.ts";

function sseLabel(state: SseConnectionState): string {
  switch (state) {
    case "connecting":
      return "…";
    case "live":
      return "LIVE";
    case "reconnecting":
      return "RECONNECT";
    case "offline":
      return "OFFLINE";
  }
}

export function PinFoot() {
  const { config, sse, version } = useAppState();
  const device = config?.device.name ?? "NDI-MONITOR";
  return (
    <div className="pin-foot">
      <span>{device}</span>
      <span>SSE · {sseLabel(sse)}</span>
      <span>v{version}</span>
    </div>
  );
}
