import { Button } from "../components/primitives.tsx";
import type { DiscoverySource } from "../api/types.ts";

export interface SourceCardProps {
  src: DiscoverySource;
  state?: "current" | undefined;
  busy?: boolean;
  onUseAndStart?: () => void;
  onStop?: () => void;
  onRestart?: () => void;
  onReconnect?: () => void;
}

export function SourceCard({
  src,
  state,
  busy,
  onUseAndStart,
  onStop,
  onRestart,
  onReconnect
}: SourceCardProps) {
  const isCurrent = state === "current";
  return (
    <div className={"source-card" + (isCurrent ? " current" : "")}>
      <div className="sc-head">
        <div style={{ display: "flex", gap: 12, flex: 1, minWidth: 0 }}>
          <div className="radio-dot">
            <span className="inner"></span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sc-name">{src.name}</div>
            <div className="sc-meta">
              {src.address && <span className="ip">{src.address}</span>}
            </div>
          </div>
        </div>
        {isCurrent ? (
          <span className="sc-badge current">● LIVE</span>
        ) : (
          <span className="sc-badge lan">LAN</span>
        )}
      </div>
      <div className="sc-meta" style={{ paddingLeft: 30 }}>
        {src.resolution && (
          <>
            <span>{src.resolution}</span>
            <span>·</span>
          </>
        )}
        {src.fps != null && (
          <>
            <span>{src.fps.toFixed(2)} FPS</span>
            <span>·</span>
          </>
        )}
        <span>{src.connectionCount ?? 0} CONN</span>
      </div>
      {isCurrent ? (
        <div className="sc-actions">
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={onStop}
            style={{ flex: 0.6 }}
          >
            ■ STOP
          </Button>
          <Button size="sm" disabled={busy} onClick={onRestart} style={{ flex: 1 }}>
            ↻ RESTART
          </Button>
          <Button size="sm" disabled={busy} onClick={onReconnect} style={{ flex: 1 }}>
            ⇄ RECONN
          </Button>
        </div>
      ) : (
        <div className="sc-actions">
          <Button
            variant="primary"
            size="sm"
            full
            disabled={busy}
            onClick={onUseAndStart}
          >
            USE &amp; START
          </Button>
        </div>
      )}
    </div>
  );
}
