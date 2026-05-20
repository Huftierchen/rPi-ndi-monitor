# UI V2 Console Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the server-rendered Fastify UI with a mobile-first React + Vite app under `apps/web-ui`, matching the V2 Console (cyberpunk) reference design exactly.

**Architecture:** Add a new pnpm workspace package `apps/web-ui` (Vite + React 18 + TypeScript). `apps/web` keeps the existing REST/SSE backend but stops rendering HTML; it serves `apps/web-ui/dist/` via `@fastify/static` with SPA fallback. Auto-discovery loop in the backend ticks while ≥1 SSE client is connected and pushes snapshots over the existing event bus.

**Tech Stack:** React 18, react-router-dom 6, Vite 5, TypeScript 5 (strict), `@fontsource/rajdhani` + `@fontsource/orbitron` + `@fontsource/jetbrains-mono`, Fastify 5, `@fastify/static`, pnpm workspaces.

**Reference design files (read-only inputs):**
- `.claude/ref-design/rpi-ndi-monitor-design/project/styles.css` — all tokens, panel/button/stat/source-card/log/toggle styles
- `.claude/ref-design/rpi-ndi-monitor-design/project/primitives.jsx` — TopBar, PinFoot, SectionLabel, Bracket4, StatusChip, Stat, HeroTarget, StatusBlock, QuickSwitch
- `.claude/ref-design/rpi-ndi-monitor-design/project/screens.jsx` — Dashboard, Sources, Settings, Logs, About screens; SourceCard, Field, ToggleRow, Accordion, LogLine, InfoRow, Bullet
- We are implementing **only Variant 2 (`v-console`)** — ignore the `op` branches; treat the variant prop as always `"console"`.

**Workflow rules:**
- Branch is already `feat/ui-v2-console`. Stay on it.
- One logical commit per task. Every commit ends with `🦄 Manifested by a glitching ai unicorn`.
- After every code change run `pnpm --filter @ndi-monitor/web test` (when backend touched) and `pnpm --filter @ndi-monitor/web-ui build` (when frontend touched) to verify.
- Auto-push enabled per repo memory: each commit gets pushed once a task block is verified.

---

## Task 1 — Bootstrap pnpm workspace + apps/web-ui scaffold

**Files:**
- Create: `pnpm-workspace.yaml` (if missing — check first)
- Create: `apps/web-ui/package.json`
- Create: `apps/web-ui/tsconfig.json`
- Create: `apps/web-ui/tsconfig.node.json`
- Create: `apps/web-ui/vite.config.ts`
- Create: `apps/web-ui/index.html`
- Create: `apps/web-ui/src/main.tsx`
- Create: `apps/web-ui/src/App.tsx` (stub returning `<div>NDI Monitor</div>`)
- Create: `apps/web-ui/.gitignore` (`dist/`, `node_modules/`)
- Modify: root `package.json` — add `build:ui` and `dev:ui` scripts

**Step 1: Check pnpm workspace state**

Run: `cat pnpm-workspace.yaml 2>/dev/null || echo MISSING`
If missing, create it with:

```yaml
packages:
  - "apps/*"
```

If present, ensure it includes `apps/*`.

**Step 2: Create `apps/web-ui/package.json`**

```json
{
  "name": "@ndi-monitor/web-ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@fontsource/jetbrains-mono": "^5.1.1",
    "@fontsource/orbitron": "^5.1.1",
    "@fontsource/rajdhani": "^5.1.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.27.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "typescript": "^5.8.2",
    "vite": "^5.4.10"
  }
}
```

**Step 3: Create `apps/web-ui/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 4: Create `apps/web-ui/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 5: Create `apps/web-ui/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: false,
        ws: false
      }
    }
  }
});
```

**Step 6: Create `apps/web-ui/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="dark" />
    <title>NDI Monitor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 7: Create `apps/web-ui/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

**Step 8: Create `apps/web-ui/src/App.tsx`** (stub)

```tsx
export default function App() {
  return <div style={{ color: "#5EF6FF", fontFamily: "monospace", padding: 24 }}>NDI Monitor · scaffold</div>;
}
```

**Step 9: Create `apps/web-ui/.gitignore`**

```
node_modules/
dist/
```

**Step 10: Add root scripts** (`package.json`)

Add to `scripts`:

```json
"build:ui": "pnpm --filter @ndi-monitor/web-ui build",
"dev:ui": "pnpm --filter @ndi-monitor/web-ui dev"
```

**Step 11: Install + verify build**

Run: `pnpm install`
Run: `pnpm --filter @ndi-monitor/web-ui build`
Expected: `apps/web-ui/dist/index.html` exists.

**Step 12: Commit**

```bash
git add pnpm-workspace.yaml package.json apps/web-ui
git commit -m "Scaffold apps/web-ui (Vite + React + TS workspace)

🦄 Manifested by a glitching ai unicorn"
git push -u origin feat/ui-v2-console
```

---

## Task 2 — Design tokens, fonts, global CSS

**Files:**
- Create: `apps/web-ui/src/styles/tokens.css`
- Create: `apps/web-ui/src/styles/global.css`
- Modify: `apps/web-ui/src/main.tsx` (add CSS imports + font imports)

**Step 1: Copy tokens**

Create `apps/web-ui/src/styles/tokens.css` by copying the `:root { ... }` block from `.claude/ref-design/rpi-ndi-monitor-design/project/styles.css` (lines 5–38). Replace the `@import url('https://fonts...')` line with a comment — fonts come via `@fontsource/*` in `main.tsx`.

**Step 2: Copy global styles**

Create `apps/web-ui/src/styles/global.css` by copying from `styles.css` everything **except** the `:root { ... }` block, the `.phone` artboard wrapper, and Variant-1 (`op`) overrides. Specifically:

- Keep: `* { box-sizing }`, `body`, scanline gradient (apply to `body` instead of `.phone.v-console`), topbar, tabs, content, section-label, panel, bracket-frame, bracket-4, hero, btn, btn-row, stat-grid, stat (with the `v-console`-style corner tick applied unconditionally), expand-toggle, quick-row/quick-item, discovery-status, source-card, seg, field, toggle-row, toggle, stepper, accordion, log-tabs, log-box, log-controls, info-row, deco-strip, diamond, pin-foot, radio-dot, noise-strip (always-visible variant), scrollbars, note.
- Replace `.phone { width: 390px; height: 844px; ... }` with `.app-shell { min-height: 100dvh; display: flex; flex-direction: column; max-width: 720px; margin: 0 auto; background: var(--bg-base); }`.
- Add responsive breakpoint at `@media (min-width: 768px)`: `.stat-grid { grid-template-columns: repeat(4, 1fr); }`.
- Add `body { background: #050509; scanline-gradient stays the same; }` — combine scanline overlay with `--bg-base`.

**Step 3: Update `main.tsx`** to import fonts + CSS:

```tsx
import "@fontsource/rajdhani/400.css";
import "@fontsource/rajdhani/500.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import "@fontsource/orbitron/400.css";
import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/600.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/800.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/tokens.css";
import "./styles/global.css";
// ... rest unchanged
```

**Step 4: Verify build**

Run: `pnpm --filter @ndi-monitor/web-ui build`
Expected: success, CSS bundled.

**Step 5: Commit + push**

```bash
git add apps/web-ui
git commit -m "Add V2 Console design tokens, fonts, global CSS

🦄 Manifested by a glitching ai unicorn"
git push
```

---

## Task 3 — Shared types module from backend

**Files:**
- Create: `apps/web-ui/src/api/types.ts`

We re-declare the API contracts client-side instead of importing from `apps/web` (avoids cross-workspace TS coupling).

**Step 1: Copy + adapt types**

Inspect `apps/web/src/types.ts` and `apps/web/src/receiver/status.ts` for the exact shapes, then mirror in `apps/web-ui/src/api/types.ts`:

```ts
export type ScaleMode = "contain" | "cover" | "stretch";
export type BandwidthMode = "highest" | "lowest";
export type ColorFormat = "fastest" | "uyvy" | "rgba";
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface AppConfig {
  server: { host: string; port: number };
  receiver: {
    sourceName: string;
    audioEnabled: boolean;
    scaleMode: ScaleMode;
    bandwidthMode: BandwidthMode;
    colorFormat: ColorFormat;
    outputFpsCap: number;
    lowLatencyMode: boolean;
    autoStart: boolean;
    reconnect: {
      enabled: boolean;
      initialDelayMs: number;
      maxDelayMs: number;
      backoffMultiplier: number;
    };
  };
  logging: { level: LogLevel; json: boolean; maxFiles: number; maxSizeMb: number };
  display: { fullscreen: boolean; hdmiOutputHint: string };
  device: { name: string };
}

export interface DiscoveredSource {
  name: string;
  address?: string | null;
  resolution?: string | null;
  fps?: number | null;
  connectionCount?: number | null;
  groups?: string[] | null;
  webControlUrl?: string | null;
}

export interface DiscoverySnapshot {
  timestamp: string;
  sources: DiscoveredSource[];
  error?: string | null;
}

export interface ReceiverRuntimeStatus {
  lifecycle: string;
  connectionState: string | null;
  sourceName: string | null;
  videoActive: boolean;
  audioActive: boolean;
  audioEnabled: boolean;
  resolution: string | null;
  fps: number | null;
  droppedVideoFrames: number | null;
  videoQueueDepth: number | null;
  audioQueueDepth: number | null;
  uptimeSeconds: number | null;
  lastError: string | null;
  restartCount: number;
  pid: number | null;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export type SseEvent =
  | { type: "status"; payload: ReceiverRuntimeStatus }
  | { type: "discovery"; payload: DiscoverySnapshot }
  | { type: "log"; payload: { scope: "web" | "receiver"; entry: LogEntry } }
  | { type: "config"; payload: AppConfig };
```

After writing, run `pnpm --filter @ndi-monitor/web-ui exec tsc --noEmit` to confirm.

**Step 2: Commit + push**

```bash
git add apps/web-ui/src/api/types.ts
git commit -m "Add client-side API type mirrors for web-ui

🦄 Manifested by a glitching ai unicorn"
git push
```

---

## Task 4 — REST API client + custom hooks

**Files:**
- Create: `apps/web-ui/src/api/client.ts`
- Create: `apps/web-ui/src/api/useSse.ts`
- Create: `apps/web-ui/src/api/useStatus.ts`
- Create: `apps/web-ui/src/api/useConfig.ts`
- Create: `apps/web-ui/src/api/useDiscovery.ts`
- Create: `apps/web-ui/src/api/useLogs.ts`
- Create: `apps/web-ui/src/api/useVersion.ts`

**Step 1: `client.ts`** — thin `fetch` wrapper

```ts
const base = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(base + path, {
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json.error ?? `Request failed: ${res.status}`);
  }
  return (json.data ?? json) as T;
}

import type { AppConfig, DiscoverySnapshot, LogEntry, ReceiverRuntimeStatus } from "./types.ts";

export const api = {
  getStatus: () => request<ReceiverRuntimeStatus>("/api/status"),
  getConfig: () => request<AppConfig>("/api/settings"),
  putConfig: (patch: unknown) =>
    request<AppConfig>("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),
  getDiscovery: () => request<DiscoverySnapshot | null>("/api/discovery"),
  triggerDiscovery: () => request<DiscoverySnapshot>("/api/discovery", { method: "POST" }),
  start: () => request<ReceiverRuntimeStatus>("/api/control/start", { method: "POST" }),
  stop: () => request<ReceiverRuntimeStatus>("/api/control/stop", { method: "POST" }),
  restart: () => request<ReceiverRuntimeStatus>("/api/control/restart", { method: "POST" }),
  reconnect: () => request<ReceiverRuntimeStatus>("/api/control/reconnect", { method: "POST" }),
  switchSource: (sourceName: string) =>
    request<AppConfig>("/api/control/switch-source", {
      method: "POST",
      body: JSON.stringify({ sourceName })
    }),
  getLogs: (scope: "web" | "receiver", limit = 120) =>
    request<LogEntry[]>(`/api/logs?scope=${scope}&limit=${limit}`),
  getVersion: () => request<{ version: string }>("/api/version")
};
```

**Step 2: `useSse.ts`** — single shared EventSource with auto-reconnect

```ts
import { useEffect, useRef, useState } from "react";
import type { SseEvent } from "./types.ts";

export type SseConnectionState = "connecting" | "live" | "reconnecting" | "offline";

export function useSse(handler: (event: SseEvent) => void): SseConnectionState {
  const [state, setState] = useState<SseConnectionState>("connecting");
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let cancelled = false;
    let backoff = 1000;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = (): void => {
      if (cancelled) return;
      setState((prev) => (prev === "live" ? "reconnecting" : prev));
      es = new EventSource("/api/events");
      es.onopen = () => {
        backoff = 1000;
        setState("live");
      };
      es.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data) as SseEvent;
          handlerRef.current(parsed);
        } catch {
          /* ignore malformed */
        }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (cancelled) return;
        setState("reconnecting");
        retryTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 10000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
      setState("offline");
    };
  }, []);

  return state;
}
```

**Step 3: `useStatus.ts`, `useConfig.ts`, `useDiscovery.ts`, `useLogs.ts`, `useVersion.ts`**

Each is a thin hook that loads initial state via REST and exposes setters used by an SSE event router defined in `App.tsx`. Example `useStatus.ts`:

```ts
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
```

Same shape for `useConfigState` (returns `[config, setConfig]`), `useDiscoveryState` (returns `[snapshot, setSnapshot]`), `useVersionState` (returns `string`).

`useLogs.ts`:

```ts
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
```

**Step 4: Verify typecheck**

Run: `pnpm --filter @ndi-monitor/web-ui exec tsc --noEmit`
Expected: 0 errors.

**Step 5: Commit + push**

```bash
git add apps/web-ui/src/api
git commit -m "Add REST client and SSE/state hooks for web-ui

🦄 Manifested by a glitching ai unicorn"
git push
```

---

## Task 5 — App-Shell: Router, Topbar, PinFoot, AppState

**Files:**
- Create: `apps/web-ui/src/components/Topbar.tsx`
- Create: `apps/web-ui/src/components/PinFoot.tsx`
- Create: `apps/web-ui/src/components/Flash.tsx`
- Create: `apps/web-ui/src/state/AppState.tsx`
- Modify: `apps/web-ui/src/App.tsx`
- Create: `apps/web-ui/src/screens/Dashboard.tsx` (stub)
- Create: `apps/web-ui/src/screens/Sources.tsx` (stub)
- Create: `apps/web-ui/src/screens/Settings.tsx` (stub)
- Create: `apps/web-ui/src/screens/Logs.tsx` (stub)
- Create: `apps/web-ui/src/screens/About.tsx` (stub)

**Step 1: `AppState.tsx`** — single context wiring everything

```tsx
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useSse, type SseConnectionState } from "../api/useSse.ts";
import { useStatusState } from "../api/useStatus.ts";
import { useConfigState } from "../api/useConfig.ts";
import { useDiscoveryState } from "../api/useDiscovery.ts";
import { useVersionState } from "../api/useVersion.ts";
import type { AppConfig, DiscoverySnapshot, LogEntry, ReceiverRuntimeStatus } from "../api/types.ts";

export interface FlashMessage { kind: "info" | "error"; message: string }

interface AppStateValue {
  status: ReceiverRuntimeStatus | null;
  config: AppConfig | null;
  discovery: DiscoverySnapshot | null;
  sse: SseConnectionState;
  version: string;
  flash: FlashMessage | null;
  showFlash(msg: FlashMessage): void;
  webLog: LogEntry[];
  receiverLog: LogEntry[];
  setConfig(next: AppConfig): void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useStatusState();
  const [config, setConfig] = useConfigState();
  const [discovery, setDiscovery] = useDiscoveryState();
  const version = useVersionState();
  const [webLog, setWebLog] = useState<LogEntry[]>([]);
  const [receiverLog, setReceiverLog] = useState<LogEntry[]>([]);
  const [flash, setFlash] = useState<FlashMessage | null>(null);

  const sse = useSse((event) => {
    switch (event.type) {
      case "status": setStatus(event.payload); break;
      case "discovery": setDiscovery(event.payload); break;
      case "config": setConfig(event.payload); break;
      case "log":
        if (event.payload.scope === "web") setWebLog((p) => [...p.slice(-499), event.payload.entry]);
        else setReceiverLog((p) => [...p.slice(-499), event.payload.entry]);
        break;
    }
  });

  const showFlash = (msg: FlashMessage): void => {
    setFlash(msg);
    setTimeout(() => setFlash((cur) => (cur === msg ? null : cur)), 4000);
  };

  const value = useMemo<AppStateValue>(
    () => ({ status, config, discovery, sse, version, flash, showFlash, webLog, receiverLog, setConfig }),
    [status, config, discovery, sse, version, flash, webLog, receiverLog]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState outside provider");
  return ctx;
}
```

For `useConfigState`/`useDiscoveryState`/`useVersionState`, mirror the pattern from `useStatusState` (loaded once via REST, mutated by SSE). `useVersionState` returns just the string (or `"dev"` on error).

**Step 2: `Topbar.tsx`**

Port `TopBar` from `primitives.jsx` to React+TS with `NavLink`. Five tabs, icons exactly as in the JSX (`◇ Dash`, `⌖ Src`, `⚙ Cfg`, `≡ Log`, `ⓘ Info`). Brand-dot color derived from `status` (green if running+connected, red if error, orange otherwise). Always render the V2 deco-strip. Right-side meta shows `${config.server.host}:${config.server.port}` or `host?:port?` while loading.

**Step 3: `PinFoot.tsx`**

Footer shows `device.name · SSE label · v{version}`. SSE label mapping:
- `connecting` → `SSE · …`
- `live` → `SSE · LIVE`
- `reconnecting` → `SSE · RECONNECT`
- `offline` → `SSE · OFFLINE`

**Step 4: `Flash.tsx`**

A small absolutely-positioned bar (cyan border for info, red for error) shown when `flash` is set.

**Step 5: `App.tsx`**

```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppStateProvider } from "./state/AppState.tsx";
import { Topbar } from "./components/Topbar.tsx";
import { PinFoot } from "./components/PinFoot.tsx";
import { Flash } from "./components/Flash.tsx";
import { Dashboard } from "./screens/Dashboard.tsx";
import { Sources } from "./screens/Sources.tsx";
import { Settings } from "./screens/Settings.tsx";
import { Logs } from "./screens/Logs.tsx";
import { About } from "./screens/About.tsx";

export default function App() {
  return (
    <BrowserRouter>
      <AppStateProvider>
        <div className="app-shell">
          <Topbar />
          <div className="content">
            <Flash />
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/sources" element={<Sources />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/about" element={<About />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          <PinFoot />
        </div>
      </AppStateProvider>
    </BrowserRouter>
  );
}
```

**Step 6: Screen stubs**

Each screen for now returns `<section className="panel"><h2>{name}</h2></section>`. We'll fill them in later tasks.

**Step 7: Verify**

Run: `pnpm --filter @ndi-monitor/web-ui build`
Expected: success. Inspect `apps/web-ui/dist/index.html` exists.

**Step 8: Commit + push**

```bash
git add apps/web-ui/src
git commit -m "Wire AppState, router, topbar, pin-foot, screen stubs

🦄 Manifested by a glitching ai unicorn"
git push
```

---

## Task 6 — Reusable primitives

**Files:**
- Create: `apps/web-ui/src/components/primitives.tsx`

Translate these primitives from `primitives.jsx`/`screens.jsx` into React+TS components, all under one file:

- `SectionLabel({ children, right })`
- `Bracket4({ color = "cyan", children })`
- `StatusChip({ state })` — state: `"live" | "idle" | "err"`
- `Stat({ label, value, mono?, color?, unit? })`
- `NoiseStrip({ tokens })`
- `Button({ variant?, size?, full?, ...rest })` — variants: `default | primary | ghost-cyan | danger | warn`
- `Toggle({ on, onChange, ariaLabel })`
- `Stepper({ value, min, max, step, onChange })`
- `Field({ label, hint, children })` — wraps `<div className="field">`
- `ToggleRow({ label, sub?, on, onChange })`
- `Accordion({ title, meta?, defaultOpen?, children })` — controlled-uncontrolled hybrid
- `LogLine({ ts, lv, msg })`
- `InfoRow({ label, value, lg? })`
- `Bullet({ num, title, desc })`
- `SegmentSwitch<T extends string>({ options, value, onChange })` — used by Settings (Quick/Advanced) and Logs (Web/Receiver) tabs

Keep markup and class names byte-identical to the JSX reference. Use proper TypeScript prop interfaces.

**Step: Verify**

Run: `pnpm --filter @ndi-monitor/web-ui exec tsc --noEmit`

**Step: Commit + push**

```bash
git add apps/web-ui/src/components/primitives.tsx
git commit -m "Add V2 Console primitive components

🦄 Manifested by a glitching ai unicorn"
git push
```

---

## Task 7 — Dashboard screen

**Files:**
- Modify: `apps/web-ui/src/screens/Dashboard.tsx`
- Create: `apps/web-ui/src/screens/HeroTarget.tsx`
- Create: `apps/web-ui/src/screens/StatusBlock.tsx`
- Create: `apps/web-ui/src/screens/QuickSwitch.tsx`

**Behaviour:**
- `HeroTarget`: wrapped in `<Bracket4 color={live ? "green" : "cyan"}>`. Tag-row shows `◇ TARGET // CONFIGURED` + `StatusChip` derived from `status.lifecycle`/`connectionState`. H1 shows configured source name (split at last ` (` to apply `.accent` to the parenthesised part — fall back to whole name if no parens). Sub-row shows resolution · FPS · `HDMI · KMS`. Noise-strip with `UP {uptime}`, `DRP {dropped}`, `Q{vq}/Q{aq}`.
- Controls row:
  - When `status.pid && status.lifecycle === "running"`: 3 buttons `■ STOP` (danger), `↻ RESTART`, `⇄ RECONN`.
  - Else: full-width `▶ START OUTPUT` (primary).
  - Wire to `api.start/stop/restart/reconnect`. On error, `showFlash({ kind: "error", message: err.message })`.
- `StatusBlock`: 4 primary stats (FPS, Resolution, Dropped, Uptime — derive uptime via `formatUptime(uptimeSeconds)` helper in `apps/web-ui/src/utils/format.ts`). Expand toggle reveals 8 more (Receiver, Connection, Video, Audio, Queue·video, Queue·audio, Restarts, Last error).
- `QuickSwitch`: list of up to 3 sources. Build the list as: `[configuredSource (always first if known), ...discovery.sources.filter(s => s.name !== configured).slice(0, 2)]`. Tap on non-current item opens `confirm("Switch source to <name> and start receiver?")` and on accept calls `api.switchSource(name)` then (if not running) `api.start()`; flash on success/error.
- Trailing V2 deco-strip with `END · 0×04AF`, `FRM <dropped> <restarts>`, `NDI v5.6`.

**Helper:** `formatUptime(sec)` → `"1h 20m 27s"` (or `"—"` if null).

**Step: Verify build**

`pnpm --filter @ndi-monitor/web-ui build`

**Step: Commit + push**

```bash
git add apps/web-ui/src
git commit -m "Implement Dashboard screen with hero, status, quick switch

🦄 Manifested by a glitching ai unicorn"
git push
```

---

## Task 8 — Sources screen

**Files:**
- Modify: `apps/web-ui/src/screens/Sources.tsx`
- Create: `apps/web-ui/src/screens/SourceCard.tsx`

**Behaviour:**
- Discovery-panel at top: shows pulsing `.scan-pulse` (cyan if `isScanning`, idle otherwise), label `DISCOVERY · {SCANNING LAN | IDLE}`. Right side `{count} FOUND · {since|"—"}`. Two controls in a row: `↻ RESCAN` (calls `api.triggerDiscovery()`), `AUTO 5s` toggle persisted in `localStorage` (default `true` while UI open is server-side; this toggle simply lets the user stop client-triggered manual rescans being needed — the server-side auto-loop runs regardless when SSE is connected).
- "CURRENT TARGET" section (grüne SectionLabel-Right `◉ ACTIVE`) renders the configured source via `<SourceCard variant="current" />` showing `STOP / RESTART / RECONN` actions.
- "AVAILABLE SOURCES" section: every other discovered source as `<SourceCard variant="available" />` with single `USE & START` button.
- `SourceCard` clicks on the body do nothing; only buttons are interactive (avoids accidental switches).
- `USE & START` calls `api.switchSource(name)` and (if not running) `api.start()`. Flash on success.
- Empty / error states: `No sources found`, `Discovery error: ${error}`, `Discovery has not run yet`.

**Step: Verify + commit + push**

```bash
pnpm --filter @ndi-monitor/web-ui build
git add apps/web-ui/src
git commit -m "Implement Sources screen with discovery loop UI

🦄 Manifested by a glitching ai unicorn"
git push
```

---

## Task 9 — Settings screen (Quick/Advanced)

**Files:**
- Modify: `apps/web-ui/src/screens/Settings.tsx`
- Create: `apps/web-ui/src/screens/settingsForm.ts` (helper to build initial form state from `AppConfig`)

**Behaviour:**
- `SegmentSwitch` toggles between `quick` and `advanced` mode.
- Local form state initialized from `config`. Edits go into a draft. Submit calls `api.putConfig(draft)`, flashes success and shows hint "Receiver will restart" if `status.pid` was set.
- **Quick mode (5 fields):** Source (text), Scale mode (select), Receiver color format (select), Low latency mode (toggle), Start on boot (toggle).
  - Below Quick: 3 disabled accordion previews showing `RECONNECT STRATEGY · 4 fields`, `WEB UI & LOGGING · 6 fields`, `DEVICE & DISPLAY · 3 fields`. Clicking any switches the segment to `advanced` and opens that accordion.
- **Advanced mode:** four collapsible accordion sections:
  1. Receiver target — source, scale, bandwidth, color, audio toggle, output FPS cap (Stepper), low-latency toggle, auto-start toggle.
  2. Reconnect strategy — enabled toggle, initial delay (Stepper), max delay (Stepper), backoff multiplier (number input).
  3. Web UI & logging — host, port, log level (select), JSON logs toggle, max files (Stepper), max size MB (Stepper).
  4. Device & display — fullscreen toggle, HDMI hint (text), device name (text).
- Submit button `◇ SAVE SETTINGS` (primary, full-width).
- After save, `setConfig(updated)` and flash.

**Step: Verify + commit + push**

```bash
pnpm --filter @ndi-monitor/web-ui build
git add apps/web-ui/src
git commit -m "Implement Settings screen with Quick/Advanced split

🦄 Manifested by a glitching ai unicorn"
git push
```

---

## Task 10 — Logs screen

**Files:**
- Modify: `apps/web-ui/src/screens/Logs.tsx`

**Behaviour:**
- `SegmentSwitch` for Web/Receiver tabs.
- Color-coded `LogLine` renders each entry. Level mapping: `info → lv-INFO`, `warn → lv-WARN`, `error/fatal → lv-ERROR`, `ok → lv-OK`; everything else → no class (defaults to `--fg-dim`).
- LogBox auto-scrolls to bottom when new entries arrive — but only if the user is already near the bottom (within 40px). Otherwise pause auto-scroll and show a "↓ jump to latest" pill.
- Download button per scope: anchor `<a href="/api/logs/download?scope=web">⇩ DOWNLOAD</a>` styled as `.btn.sm.ghost-cyan`.
- Trailing note about SSE log streaming.

**Step: Verify + commit + push**

```bash
pnpm --filter @ndi-monitor/web-ui build
git add apps/web-ui/src
git commit -m "Implement Logs screen with web/receiver tabs

🦄 Manifested by a glitching ai unicorn"
git push
```

---

## Task 11 — About screen

**Files:**
- Modify: `apps/web-ui/src/screens/About.tsx`

**Behaviour:** Static page driven by `config` + `version`. Mirror `ScreenAbout` from reference 1:1:
- SYSTEM section with noise-strip + 4 InfoRows (device name, web UI bind, configured source, video path = `SDL2 KMSDRM · HDMI-0`).
- RUNTIME PATHS section: 5 InfoRows (paths are hard-coded; they match `apps/web/src/utils/paths.ts` install layout).
- ARCHITECTURE section: 4 Bullets.
- Trailing note.

**Step: Verify + commit + push**

```bash
pnpm --filter @ndi-monitor/web-ui build
git add apps/web-ui/src
git commit -m "Implement About screen

🦄 Manifested by a glitching ai unicorn"
git push
```

---

## Task 12 — Backend: `/api/version` endpoint (TDD)

**Files:**
- Modify: `apps/web/src/api/routes.ts`
- Create: `apps/web/test/version.test.ts`

**Step 1: Write the failing test**

```ts
// apps/web/test/version.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp } from "./helpers/build-test-app.js"; // create if not present

test("GET /api/version returns ok + version string", async () => {
  const { app } = await buildTestApp();
  const res = await app.inject({ method: "GET", url: "/api/version" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.data.version, "string");
  assert.ok(body.data.version.length > 0);
});
```

If `buildTestApp` helper doesn't exist, create `apps/web/test/helpers/build-test-app.ts` that constructs `buildApp` with tmpdir-based `RuntimePaths` (mirror `config-service.test.ts` setup).

**Step 2: Run test — expect failure**

Run: `pnpm --filter @ndi-monitor/web test`
Expected: fail with 404 on `/api/version`.

**Step 3: Implement endpoint**

In `apps/web/src/api/routes.ts`, before the `/api/events` handler:

```ts
app.get("/api/version", async () => ({
  ok: true,
  data: { version: process.env.NDI_MONITOR_VERSION ?? "dev" }
}));
```

Then in `apps/web/src/app.ts` read `apps/web/package.json` once at startup and set `process.env.NDI_MONITOR_VERSION` accordingly (or pass it through `RouteContext`). Prefer the context-injection approach: extend `RouteContext` with `version: string` and inject in `app.ts` using `JSON.parse(readFileSync(...))`.

**Step 4: Run test — expect pass**

Run: `pnpm --filter @ndi-monitor/web test`

**Step 5: Commit + push**

```bash
git add apps/web
git commit -m "Add /api/version endpoint backed by package.json

🦄 Manifested by a glitching ai unicorn"
git push
```

---

## Task 13 — Backend: SSE-client-tracked auto-discovery loop (TDD)

**Files:**
- Create: `apps/web/src/receiver/discovery-supervisor.ts`
- Modify: `apps/web/src/receiver/receiver-supervisor.ts` (expose a `discover()` lock check if needed)
- Modify: `apps/web/src/api/routes.ts` (increment/decrement client count around SSE connect/cleanup)
- Modify: `apps/web/src/app.ts` (instantiate `DiscoverySupervisor`, pass to route context)
- Create: `apps/web/test/discovery-supervisor.test.ts`

**Design:** `DiscoverySupervisor` holds a counter. `notifyClientConnected()` increments and starts a `setInterval(5000)` if counter == 1. `notifyClientDisconnected()` decrements and clears interval if counter == 0. The interval calls `supervisor.discover()`; results flow through the existing event bus (`receiver-supervisor` already publishes `discovery` events on completion). A lock prevents overlapping invocations.

**Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { DiscoverySupervisor } from "../src/receiver/discovery-supervisor.js";

test("starts and stops interval based on client count", async () => {
  let calls = 0;
  const fakeDiscover = async () => { calls += 1; return { timestamp: "", sources: [] }; };
  const supervisor = new DiscoverySupervisor({ intervalMs: 25, discover: fakeDiscover });

  supervisor.notifyClientConnected();
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(calls >= 2, `expected at least 2 calls, got ${calls}`);

  supervisor.notifyClientDisconnected();
  const snapshot = calls;
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(calls, snapshot, "should not run more discoveries after last client disconnects");
});

test("guards against overlapping discoveries", async () => {
  let inFlight = 0;
  let maxConcurrent = 0;
  const slowDiscover = async () => {
    inFlight += 1;
    maxConcurrent = Math.max(maxConcurrent, inFlight);
    await new Promise((r) => setTimeout(r, 40));
    inFlight -= 1;
    return { timestamp: "", sources: [] };
  };
  const supervisor = new DiscoverySupervisor({ intervalMs: 10, discover: slowDiscover });
  supervisor.notifyClientConnected();
  await new Promise((r) => setTimeout(r, 120));
  supervisor.notifyClientDisconnected();
  assert.equal(maxConcurrent, 1, "discoveries must not overlap");
});
```

**Step 2: Run — expect fail**

Run: `pnpm --filter @ndi-monitor/web test`
Expected: module not found.

**Step 3: Implement**

```ts
// apps/web/src/receiver/discovery-supervisor.ts
export interface DiscoverySupervisorDeps {
  discover: () => Promise<unknown>;
  intervalMs: number;
  onError?: (err: unknown) => void;
}

export class DiscoverySupervisor {
  private clientCount = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly deps: DiscoverySupervisorDeps) {}

  notifyClientConnected(): void {
    this.clientCount += 1;
    if (this.clientCount === 1 && !this.timer) {
      this.timer = setInterval(() => { void this.tick(); }, this.deps.intervalMs);
      void this.tick();
    }
  }

  notifyClientDisconnected(): void {
    this.clientCount = Math.max(0, this.clientCount - 1);
    if (this.clientCount === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.deps.discover();
    } catch (err) {
      this.deps.onError?.(err);
    } finally {
      this.running = false;
    }
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.clientCount = 0;
  }
}
```

**Step 4: Run — expect pass**

Run: `pnpm --filter @ndi-monitor/web test`

**Step 5: Wire into `app.ts` + `routes.ts`**

In `app.ts`, after `supervisor.init()`:

```ts
const discoverySupervisor = new DiscoverySupervisor({
  intervalMs: 5000,
  discover: () => supervisor.discover(),
  onError: (err) => void logger.warn("Auto-discovery failed", { error: String(err) })
});
```

Pass `discoverySupervisor` into `registerRoutes`, register on `app.close` to `discoverySupervisor.dispose()`.

In `routes.ts` SSE handler, after `reply.raw.flushHeaders()` call `discoverySupervisor.notifyClientConnected()`, and inside `cleanup()` add `discoverySupervisor.notifyClientDisconnected()` (guard with a flag so it only fires once per connection).

**Step 6: Run full suite**

Run: `pnpm --filter @ndi-monitor/web test`
Expected: green.

**Step 7: Commit + push**

```bash
git add apps/web
git commit -m "Auto-run NDI discovery while UI clients are connected

🦄 Manifested by a glitching ai unicorn"
git push
```

---

## Task 14 — Backend: serve apps/web-ui/dist + remove old UI

**Files:**
- Modify: `apps/web/src/app.ts`
- Modify: `apps/web/src/api/routes.ts`
- Delete: `apps/web/src/ui/pages.ts`
- Delete: `apps/web/src/ui/layout.ts`
- Delete: `apps/web/src/ui/assets/app.js`
- Delete: `apps/web/src/ui/assets/style.css`

**Step 1: Update `app.ts`**

Replace the existing `app.register(fastifyStatic, { ... })` (which mounts `apps/web/src/ui/assets`) with:

```ts
const uiDist = path.join(paths.repoRoot, "apps", "web-ui", "dist");
app.register(fastifyStatic, {
  root: uiDist,
  prefix: "/",
  decorateReply: false
});

app.setNotFoundHandler(async (request, reply) => {
  if (request.url.startsWith("/api/") || request.url === "/healthz") {
    reply.status(404).send({ ok: false, error: "Not found" });
    return;
  }
  reply.type("text/html").send(await readFile(path.join(uiDist, "index.html")));
});
```

Add `import { readFile } from "node:fs/promises";` at the top.

**Step 2: Remove HTML routes from `routes.ts`**

Delete the handlers for `/`, `/sources`, `/settings`, `/logs`, `/about` and the `renderXxxPage` imports.

**Step 3: Delete old UI files**

```bash
rm apps/web/src/ui/pages.ts
rm apps/web/src/ui/layout.ts
rm apps/web/src/ui/assets/app.js
rm apps/web/src/ui/assets/style.css
rmdir apps/web/src/ui/assets apps/web/src/ui 2>/dev/null || true
```

**Step 4: Build web-ui first, then run backend tests**

Run: `pnpm --filter @ndi-monitor/web-ui build`
Run: `pnpm --filter @ndi-monitor/web test`
Expected: both green. Backend tests should not rely on the old UI files.

**Step 5: Smoke test by hand**

Run: `pnpm --filter @ndi-monitor/web dev`
Open `http://localhost:8080/` — should serve the new UI. Open `/sources`, `/settings`, `/logs`, `/about` — SPA fallback should yield the same `index.html`.

**Step 6: Commit + push**

```bash
git add apps/web
git commit -m "Serve apps/web-ui/dist as the only UI; remove server-rendered pages

🦄 Manifested by a glitching ai unicorn"
git push
```

---

## Task 15 — Install/update scripts + root build wiring

**Files:**
- Modify: `install.sh`
- Modify: `update.sh`
- Modify: root `package.json`

**Step 1: Root `package.json`**

Add scripts:

```json
"build": "pnpm --filter @ndi-monitor/web-ui build && pnpm --filter @ndi-monitor/web build",
"dev": "pnpm --filter @ndi-monitor/web-ui dev",
"dev:server": "pnpm --filter @ndi-monitor/web dev"
```

**Step 2: Update `install.sh` and `update.sh`**

Locate the existing `pnpm install` + build step. Replace single-package builds with `pnpm install && pnpm build` so both apps are produced.

**Step 3: Verify**

Run: `pnpm install`
Run: `pnpm build`
Expected: `apps/web-ui/dist/index.html` and `apps/web/dist/index.js` both exist.

**Step 4: Commit + push**

```bash
git add install.sh update.sh package.json
git commit -m "Build apps/web-ui as part of install/update flow

🦄 Manifested by a glitching ai unicorn"
git push
```

---

## Task 16 — End-to-end smoke verification + PR

**Step 1: Manual smoke**

Run: `pnpm install && pnpm build`
Run: `pnpm dev:server` (and in another shell, just open `http://localhost:8080/` since UI is served from dist)

Verify on phone-width browser (DevTools → 390px):
- Dashboard hero renders with corner brackets, status chip shows correct state, control buttons toggle between START and STOP/RESTART/RECONN based on receiver state.
- Stat-grid shows 4 values; "▾ SHOW DETAILS" expands 8 more.
- Quick-Switch shows 1–3 sources, current is highlighted green.
- Sources screen: discovery panel pulses, RESCAN works, CURRENT TARGET card visible, USE & START on another source persists + restarts.
- Settings: Quick/Advanced segment switches. Save flashes success. Accordions expand correctly.
- Logs: Web/Receiver tabs switch. Color-coded levels. Live append on new SSE log events. Download produces NDJSON file.
- About: shows real device name, host:port, version from pin-foot.
- Pin-foot reflects SSE state (kill backend → "RECONNECT", restart → "LIVE").
- Resize ≥ 768px: content centred, stat-grid 4 columns.

**Step 2: Final verification**

Run: `pnpm --filter @ndi-monitor/web test`
Run: `pnpm --filter @ndi-monitor/web-ui exec tsc --noEmit`
Run: `pnpm --filter @ndi-monitor/web exec tsc --noEmit -p tsconfig.test.json`
Expected: all green.

**Step 3: Open PR**

```bash
gh pr create --title "Mobile-first V2 Console UI (React + Vite)" --body "$(cat <<'EOF'
## Summary
- Replaces the server-rendered Fastify UI with a mobile-first React + Vite app under `apps/web-ui` matching the V2 Console reference design exactly
- Backend now runs auto-discovery every 5s while ≥1 SSE client is connected; standalone discovery loop with overlap guard
- Adds `/api/version` for the pin-foot
- Removes `apps/web/src/ui/{pages,layout}.ts` and old static assets; Fastify serves `apps/web-ui/dist` with SPA fallback

## Screens
- Dashboard: hero target with corner brackets, smart control row, 4 + 8 stats, quick-switch
- Sources: auto-discovery panel, current-target card, available list with Use & Start
- Settings: Quick · 5 / Advanced · all segmented view, accordions, toggles, steppers
- Logs: web/receiver segment, color-coded levels, live SSE tail, download
- About: system, runtime paths, architecture bullets

## Test plan
- [x] `pnpm build` (both apps)
- [x] `pnpm --filter @ndi-monitor/web test`
- [x] Manual smoke on 390px viewport for all 5 screens
- [x] SSE reconnect (kill backend, observe PIN-FOOT state)
- [x] Auto-discovery stops when no client connected (logs)

🦄 Crafted in the neon-lit stables of Equestria
EOF
)"
```

---

## Notes for the executing agent

- **Auto-commit/push:** Per `feedback_auto_commit_push.md`, commit + push at every task boundary without asking.
- **Don't deviate from V2 Console.** No Variant-1 styles. No extra theme switcher.
- **Match class names exactly** so the reference CSS keeps working.
- **No backwards-compat shims** for the old UI — it's deleted in Task 14, not preserved.
- **Avoid extra abstractions.** The reference uses inline-styles in some places; copy those over verbatim rather than refactoring.
- **If `@fontsource/*` versions don't resolve cleanly,** bump to latest 5.x — they all share the same surface.
