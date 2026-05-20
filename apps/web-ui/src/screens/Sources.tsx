import { useEffect, useMemo, useState } from "react";
import { useAppState } from "../state/AppState.tsx";
import { Button, SectionLabel, Toggle } from "../components/primitives.tsx";
import { SourceCard } from "./SourceCard.tsx";
import { api } from "../api/client.ts";
import { isReceiverRunning } from "../utils/status.ts";
import { useControlAction } from "../utils/useControlAction.ts";
import type { DiscoverySnapshot, DiscoverySource } from "../api/types.ts";

function computeElapsed(snapshot: DiscoverySnapshot | null): number | null {
  if (!snapshot || snapshot.error) return null;
  const started = Date.parse(snapshot.startedAt);
  const finished = Date.parse(snapshot.finishedAt);
  if (!Number.isFinite(started) || !Number.isFinite(finished)) return null;
  return Math.max(0, Math.round((finished - started) / 1000));
}

export function Sources() {
  const { status, config, discovery, showFlash } = useAppState();
  const { busy, run } = useControlAction();
  const [isScanning, setIsScanning] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(() => {
    return localStorage.getItem("ndi-monitor:auto-refresh") !== "false";
  });

  useEffect(() => {
    localStorage.setItem("ndi-monitor:auto-refresh", String(autoRefresh));
  }, [autoRefresh]);

  // Auto-refresh is driven by the backend DiscoverySupervisor: it runs every 5s
  // while any SSE client is connected and pushes fresh snapshots over the event
  // bus. The local toggle just lets the user mute/unmute that visual stream of
  // updates (the SSE itself keeps flowing). No client-side polling needed.

  const configuredName = config?.receiver.sourceName ?? "";
  const sources: DiscoverySource[] = discovery?.sources ?? [];
  const currentSource = useMemo(
    () => sources.find((s) => s.name === configuredName) ?? null,
    [sources, configuredName]
  );
  const availableSources = useMemo(
    () => (currentSource ? sources.filter((s) => s.id !== currentSource.id) : sources),
    [sources, currentSource]
  );

  async function handleRescan(): Promise<void> {
    if (busy || isScanning) return;
    try {
      setIsScanning(true);
      await api.triggerDiscovery();
    } catch (err) {
      showFlash({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsScanning(false);
    }
  }

  async function handleUseAndStart(src: DiscoverySource): Promise<void> {
    await run(async () => {
      await api.switchSource(src.name);
      if (!isReceiverRunning(status)) {
        await api.start();
      }
    }, `Switched to ${src.name}`);
  }

  const found = sources.length;
  const elapsed = computeElapsed(discovery);

  return (
    <>
      <div className="panel compact">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12
          }}
        >
          <div className="discovery-status">
            <span className={"scan-pulse" + (isScanning ? "" : " idle")} />
            DISCOVERY · {isScanning ? "SCANNING LAN" : "IDLE"}
          </div>
          <div
            style={{
              fontFamily: "var(--ff-mono)",
              fontSize: 9,
              letterSpacing: "0.15em",
              color: "var(--fg-mute)"
            }}
          >
            {found} FOUND{elapsed !== null ? ` · ${String(elapsed).padStart(2, "0")}s` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <Button
            variant="ghost-cyan"
            size="sm"
            full
            disabled={busy || isScanning}
            onClick={handleRescan}
          >
            ↻ RESCAN
          </Button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 10px",
              border: "1px solid var(--line-bold)",
              flex: 1,
              minHeight: 36
            }}
          >
            <Toggle on={autoRefresh} onChange={setAutoRefresh} ariaLabel="Auto refresh discovery" />
            <span
              style={{
                fontFamily: "var(--ff-mono)",
                fontSize: 10,
                letterSpacing: "0.18em",
                color: "var(--fg-dim)"
              }}
            >
              AUTO 5s
            </span>
          </div>
        </div>
        {discovery?.error && (
          <p className="note" style={{ marginTop: 10, color: "var(--red)" }}>
            Discovery error: {discovery.error}
          </p>
        )}
      </div>

      {currentSource && (
        <div>
          <SectionLabel right="◉ ACTIVE">CURRENT TARGET</SectionLabel>
          <div style={{ marginTop: 10 }}>
            <SourceCard
              src={currentSource}
              state="current"
              busy={busy}
              onStop={() => run(api.stop, "Receiver stopped")}
              onRestart={() => run(api.restart, "Receiver restarting")}
              onReconnect={() => run(api.reconnect, "Reconnecting source")}
            />
          </div>
        </div>
      )}

      <div>
        <SectionLabel
          right={availableSources.length === 1 ? "1 OTHER" : `${availableSources.length} OTHERS`}
        >
          AVAILABLE SOURCES
        </SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {availableSources.length === 0 ? (
            <div
              className="source-empty note"
              style={{
                padding: "12px 14px",
                border: "1px solid var(--line)",
                background: "var(--bg-panel-2)"
              }}
            >
              {discovery
                ? "No other NDI sources were found on the current network."
                : "Discovery has not run yet. Tap RESCAN to search."}
            </div>
          ) : (
            availableSources.map((src) => (
              <SourceCard
                key={src.id}
                src={src}
                busy={busy}
                onUseAndStart={() => handleUseAndStart(src)}
              />
            ))
          )}
        </div>
      </div>

      <div className="note" style={{ padding: "4px 2px" }}>
        Discovery runs automatically while the UI is open.{" "}
        <span style={{ color: "var(--cyan)" }}>USE &amp; START</span> persists the selection to YAML
        and restarts the receiver onto the chosen sender.
      </div>
    </>
  );
}
