import type { ReceiverRuntimeStatus } from "../api/types.ts";

export function isReceiverRunning(status: ReceiverRuntimeStatus | null | undefined): boolean {
  return Boolean(status && status.lifecycle === "running" && status.pid !== null);
}
