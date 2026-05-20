import { NavLink, useLocation } from "react-router-dom";
import { useAppState } from "../state/AppState.tsx";
import type { ReceiverRuntimeStatus } from "../api/types.ts";

type BrandColor = "green" | "red" | "orange";

function brandColor(status: ReceiverRuntimeStatus | null): BrandColor {
  if (!status) return "orange";
  if (status.lifecycle === "running" && status.connectionState === "connected") return "green";
  if (status.lifecycle === "error" || status.connectionState === "fatal") return "red";
  return "orange";
}

function colorVar(color: BrandColor): string {
  if (color === "green") return "var(--green)";
  if (color === "red") return "var(--red)";
  return "var(--orange)";
}

const TABS: { to: string; id: string; icon: string; label: string }[] = [
  { to: "/", id: "dashboard", icon: "◇", label: "Dash" },
  { to: "/sources", id: "sources", icon: "⌖", label: "Src" },
  { to: "/settings", id: "settings", icon: "⌬", label: "Cfg" },
  { to: "/logs", id: "logs", icon: "≡", label: "Log" },
  { to: "/about", id: "about", icon: "ⓘ", label: "Info" }
];

function pathToTabId(pathname: string): string {
  if (pathname.startsWith("/sources")) return "sources";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/logs")) return "logs";
  if (pathname.startsWith("/about")) return "about";
  return "dashboard";
}

export function Topbar() {
  const { status, config } = useAppState();
  const location = useLocation();
  const currentTabId = pathToTabId(location.pathname);
  const color = brandColor(status);
  const cssColor = colorVar(color);

  const host = config?.server.host ?? "…";
  const port = config ? String(config.server.port) : "…";

  const connHex = (0xa8c040 + currentTabId.length).toString(16).toUpperCase();

  return (
    <div className="topbar">
      <div className="topbar-row">
        <div className="topbar-brand">
          <span className="dot" style={{ background: cssColor }}></span>
          NDI · MONITOR
        </div>
        <div className="topbar-meta">
          <span>
            {host}:{port}
          </span>
          <span className="indicator" style={{ background: cssColor }}></span>
        </div>
      </div>
      <div className="deco-strip" style={{ marginTop: 6 }}>
        <span>
          CONN <span className="dot">·</span> 0×{connHex}
        </span>
        <span>SES 02·08·1F</span>
        <span>NDI v5.6</span>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <NavLink
            key={t.id}
            to={t.to}
            end={t.to === "/"}
            className={({ isActive }) => "tab" + (isActive ? " active" : "")}
          >
            <span className="tab-icon">{t.icon}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
