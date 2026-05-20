import { useEffect, useState } from "react";
import { api } from "./client.ts";
import type { DiscoverySnapshot } from "./types.ts";

export function useDiscoveryState() {
  const [snapshot, setSnapshot] = useState<DiscoverySnapshot | null>(null);
  useEffect(() => {
    api.getDiscovery().then(setSnapshot).catch(() => setSnapshot(null));
  }, []);
  return [snapshot, setSnapshot] as const;
}
