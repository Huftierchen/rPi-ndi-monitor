import { useEffect, useState } from "react";
import { api } from "./client.ts";

export function useVersionState(): string {
  const [version, setVersion] = useState<string>("dev");
  useEffect(() => {
    api.getVersion().then(({ version: v }) => setVersion(v)).catch(() => setVersion("dev"));
  }, []);
  return version;
}
