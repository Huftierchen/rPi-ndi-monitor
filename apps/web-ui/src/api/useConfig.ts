import { useEffect, useState } from "react";
import { api } from "./client.ts";
import type { AppConfig } from "./types.ts";

export function useConfigState() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => setConfig(null));
  }, []);
  return [config, setConfig] as const;
}
