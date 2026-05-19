import { useEffect, useState } from "react";
import { api } from "./client.ts";
import type { LogEntry } from "./types.ts";

export function useLogsState(scope: "web" | "receiver") {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  useEffect(() => {
    api.getLogs(scope, 200).then(setEntries).catch(() => setEntries([]));
  }, [scope]);
  const append = (entry: LogEntry): void => {
    setEntries((prev) => {
      const next = [...prev, entry];
      return next.length > 500 ? next.slice(-500) : next;
    });
  };
  return { entries, append, reset: () => setEntries([]) };
}
