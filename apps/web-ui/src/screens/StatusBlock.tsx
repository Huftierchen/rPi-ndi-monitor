import { useState } from "react";
import { useAppState } from "../state/AppState.tsx";
import { SectionLabel, Stat } from "../components/primitives.tsx";
import { formatFps, formatUptime } from "../utils/format.ts";

export function StatusBlock() {
  const { status } = useAppState();
  const [expanded, setExpanded] = useState<boolean>(false);

  const dropped = status?.droppedVideoFrames ?? 0;

  const audioValue = !status?.audioEnabled
    ? "disabled"
    : status?.audioActive
      ? "active"
      : "enabled";
  const audioColor = status?.audioEnabled
    ? status.audioActive
      ? "green"
      : "cyan"
    : "dim";

  return (
    <div>
      <SectionLabel right="SSE · 0×04 HZ">STATUS</SectionLabel>
      <div style={{ marginTop: 10 }}>
        <div className="stat-grid">
          <Stat label="FPS" value={formatFps(status?.fps ?? null)} mono color="green" />
          <Stat label="Resolution" value={status?.resolution ?? "—"} mono />
          <Stat
            label="Dropped"
            value={dropped}
            color={dropped > 0 ? "orange" : "green"}
            unit="FRM"
          />
          <Stat
            label="Uptime"
            value={formatUptime(status?.uptimeSeconds ?? null)}
            mono
            color="cyan"
          />
        </div>
        {expanded && (
          <div className="stat-grid" style={{ marginTop: 8 }}>
            <Stat
              label="Receiver"
              value={status?.lifecycle ?? "—"}
              color={status?.lifecycle === "running" ? "green" : "dim"}
            />
            <Stat
              label="Connection"
              value={status?.connectionState ?? "—"}
              color={status?.connectionState === "connected" ? "green" : "dim"}
            />
            <Stat
              label="Video"
              value={status?.videoActive ? "active" : "idle"}
              color={status?.videoActive ? "green" : "dim"}
            />
            <Stat label="Audio" value={audioValue} color={audioColor} />
            <Stat label="Queue · video" value={status?.videoQueueDepth ?? 0} mono />
            <Stat label="Queue · audio" value={status?.audioQueueDepth ?? 0} mono />
            <Stat label="Restarts" value={status?.restartCount ?? 0} mono />
            <Stat label="Last error" value={status?.lastError ?? "—"} mono color="dim" />
          </div>
        )}
        <button
          className="expand-toggle"
          style={{ marginTop: 10 }}
          onClick={() => setExpanded((v) => !v)}
        >
          <span>{expanded ? "▴ HIDE DETAILS" : "▾ SHOW DETAILS · 8 MORE"}</span>
          <span className="chev" aria-hidden="true"></span>
        </button>
      </div>
    </div>
  );
}
