import { useState } from "react";
import { useAppState } from "../state/AppState.tsx";
import { SectionLabel } from "../components/primitives.tsx";
import { api } from "../api/client.ts";
import type { DiscoverySource } from "../api/types.ts";
import { isReceiverRunning } from "../utils/status.ts";

interface QuickEntry {
  name: string;
  ip?: string | null;
  res?: string | null;
  fps?: number | null;
  current: boolean;
}

function toEntry(src: DiscoverySource, current: boolean): QuickEntry {
  return {
    name: src.name,
    ip: src.address ?? null,
    res: src.resolution ?? null,
    fps: src.fps ?? null,
    current
  };
}

export function QuickSwitch() {
  const { status, config, discovery, showFlash, setConfig } = useAppState();
  const [busy, setBusy] = useState(false);
  const configured = config?.receiver.sourceName ?? "";

  const entries: QuickEntry[] = [];
  if (configured) {
    const match = discovery?.sources.find((s) => s.name === configured);
    if (match) {
      entries.push(toEntry(match, true));
    } else {
      entries.push({ name: configured, current: true });
    }
  }
  const remaining = (discovery?.sources ?? []).filter((s) => s.name !== configured);
  for (const src of remaining) {
    if (entries.length >= 3) break;
    entries.push(toEntry(src, false));
  }

  if (entries.length === 0) return null;

  async function handleSwitch(name: string): Promise<void> {
    setBusy(true);
    try {
      const updated = await api.switchSource(name);
      setConfig(updated);
      if (!isReceiverRunning(status)) {
        await api.start();
      }
      showFlash({ kind: "info", message: `Switched to ${name}` });
    } catch (err) {
      showFlash({
        kind: "error",
        message: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SectionLabel right="RECENT · 3">QUICK SWITCH</SectionLabel>
      <div className="quick-row" style={{ marginTop: 10 }}>
        {entries.map((entry, i) => {
          const meta =
            entry.ip || entry.res || entry.fps != null
              ? [entry.ip, entry.res, entry.fps != null ? `${entry.fps} FPS` : null]
                  .filter(Boolean)
                  .join(" · ")
              : "—";
          return (
            <button
              key={entry.name}
              className={"quick-item" + (entry.current ? " current" : "")}
              onClick={entry.current ? undefined : () => handleSwitch(entry.name)}
              disabled={entry.current || busy}
            >
              <div className="qi-icon">
                {entry.current ? "✓" : (i + 1).toString().padStart(2, "0")}
              </div>
              <div className="qi-body">
                <div className="qi-name">{entry.name}</div>
                <div className="qi-meta">{meta}</div>
              </div>
              <div className="qi-tail">{entry.current ? "ACTIVE" : "TAP·SWITCH"}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
