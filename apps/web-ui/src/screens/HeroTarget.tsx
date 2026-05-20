import { useAppState } from "../state/AppState.tsx";
import { Bracket4, StatusChip, type StatusChipState } from "../components/primitives.tsx";
import { formatFps, formatUptime } from "../utils/format.ts";

function splitSourceName(source: string): { head: string; tail: string | null } {
  const idx = source.lastIndexOf(" (");
  if (idx === -1) return { head: source, tail: null };
  return { head: source.slice(0, idx), tail: source.slice(idx + 1) };
}

export function HeroTarget() {
  const { status, config } = useAppState();
  const live = status?.lifecycle === "running";

  let chipState: StatusChipState = "idle";
  if (status?.lifecycle === "running" && status?.connectionState === "connected") {
    chipState = "live";
  } else if (status?.connectionState === "fatal" || status?.lifecycle === "error") {
    chipState = "err";
  }

  const sourceName = config?.receiver.sourceName ?? "";
  const { head, tail } = sourceName ? splitSourceName(sourceName) : { head: "", tail: null };

  const resolution = status?.resolution ?? "—";
  const fps = formatFps(status?.fps ?? null);
  const uptime = formatUptime(status?.uptimeSeconds ?? null);
  const dropped = (status?.droppedVideoFrames ?? 0).toString().padStart(3, "0");
  const vq = status?.videoQueueDepth ?? 0;
  const aq = status?.audioQueueDepth ?? 0;

  return (
    <Bracket4 color={live ? "green" : "cyan"}>
      <div className="hero">
        <div className="hero-tag">
          <span>◇ TARGET // CONFIGURED</span>
          <StatusChip state={chipState} />
        </div>
        {sourceName ? (
          <h1>
            {head}
            {tail && (
              <>
                <br />
                <span className="accent">{tail}</span>
              </>
            )}
          </h1>
        ) : (
          <h1>
            <span className="accent">NO SOURCE</span>
          </h1>
        )}
        {sourceName ? (
          <div className="hero-sub">
            <span>{resolution}</span>
            <span className="sep">·</span>
            <span>{fps} FPS</span>
            <span className="sep">·</span>
            <span>HDMI · KMS</span>
          </div>
        ) : null}
        <div className="noise-strip" style={{ display: "flex", marginTop: 12, marginBottom: 0 }}>
          <span>UP {uptime.toUpperCase()}</span>
          <span>·</span>
          <span>DRP {dropped}</span>
          <span>·</span>
          <span>Q{vq}/Q{aq}</span>
        </div>
      </div>
    </Bracket4>
  );
}
