import { useAppState } from "../state/AppState.tsx";

export function Flash() {
  const { flash } = useAppState();
  if (!flash) return null;
  const isErr = flash.kind === "error";
  return (
    <div
      role="status"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        padding: "10px 14px",
        background: isErr ? "rgba(247,80,73,0.12)" : "rgba(94,246,255,0.08)",
        border: `1px solid ${isErr ? "var(--red)" : "var(--cyan)"}`,
        color: isErr ? "var(--red)" : "var(--cyan)",
        fontFamily: "var(--ff-mono)",
        fontSize: 11,
        letterSpacing: "0.18em",
        textTransform: "uppercase"
      }}
    >
      {flash.message}
    </div>
  );
}
