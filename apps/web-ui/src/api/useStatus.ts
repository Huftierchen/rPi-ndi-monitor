import { useEffect, useState } from "react";
import { api } from "./client.ts";
import type { ReceiverRuntimeStatus } from "./types.ts";

export function useStatusState() {
  const [status, setStatus] = useState<ReceiverRuntimeStatus | null>(null);
  useEffect(() => {
    api.getStatus().then(setStatus).catch(() => setStatus(null));
  }, []);
  return [status, setStatus] as const;
}
