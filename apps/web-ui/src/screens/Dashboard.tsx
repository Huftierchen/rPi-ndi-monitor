import { useAppState } from "../state/AppState.tsx";
import { Button, SectionLabel } from "../components/primitives.tsx";
import { HeroTarget } from "./HeroTarget.tsx";
import { StatusBlock } from "./StatusBlock.tsx";
import { QuickSwitch } from "./QuickSwitch.tsx";
import { api } from "../api/client.ts";
import { isReceiverRunning } from "../utils/status.ts";
import { useControlAction } from "../utils/useControlAction.ts";

export function Dashboard() {
  const { status } = useAppState();
  const isRunning = isReceiverRunning(status);
  const { busy, run } = useControlAction();

  return (
    <>
      <HeroTarget />
      <div>
        <SectionLabel right="◇ CTRL · DIRECT">RECEIVER CONTROLS</SectionLabel>
        {isRunning ? (
          <div className="btn-row cols-3" style={{ marginTop: 10 }}>
            <Button variant="danger" disabled={busy} onClick={() => run(api.stop, "Receiver stopped")}>■ STOP</Button>
            <Button disabled={busy} onClick={() => run(api.restart, "Receiver restarting")}>↻ RESTART</Button>
            <Button disabled={busy} onClick={() => run(api.reconnect, "Reconnecting source")}>⇄ RECONN</Button>
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            <Button variant="primary" full disabled={busy} onClick={() => run(api.start, "Receiver starting")}>▶ START OUTPUT</Button>
          </div>
        )}
      </div>
      <StatusBlock />
      <QuickSwitch />
      <div className="deco-strip" style={{ marginTop: -6 }}>
        <span>END · 0×04AF</span>
        <span className="dot">◇</span>
        <span>FRM {status?.droppedVideoFrames ?? 0} {status?.restartCount ?? 0}</span>
        <span className="dot">◇</span>
        <span>NDI v5.6</span>
      </div>
    </>
  );
}
