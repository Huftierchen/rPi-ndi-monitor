import { useCallback, useState } from "react";
import { useAppState } from "../state/AppState.tsx";

export function useControlAction() {
  const { showFlash } = useAppState();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (action: () => Promise<unknown>, okMessage: string): Promise<void> => {
      if (busy) return;
      try {
        setBusy(true);
        await action();
        showFlash({ kind: "info", message: okMessage });
      } catch (err) {
        showFlash({
          kind: "error",
          message: err instanceof Error ? err.message : String(err)
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, showFlash]
  );

  return { busy, run } as const;
}
