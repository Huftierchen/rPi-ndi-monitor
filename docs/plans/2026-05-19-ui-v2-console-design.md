# UI V2 Console — Design

Status: approved · Branch: `feat/ui-v2-console` · Date: 2026-05-19

## Goal

Ersetze das bestehende server-rendered Web-UI durch ein mobile-first, V2-Console-Design (Cyberpunk-Look) aus dem Referenz-Mockup unter `.claude/ref-design/rpi-ndi-monitor-design/`. Das neue UI muss auf einem Phone primär bedienbar sein und auf Desktop sinnvoll skalieren.

## Architektur

- Neues Paket **`apps/web-ui`** auf Basis von **Vite + React 18 + TypeScript (strict)**.
- Build-Output `apps/web-ui/dist/` wird von `apps/web` (Fastify) via `@fastify/static` mit SPA-Fallback ausgeliefert.
- API-/SSE-Endpunkte (`/api/*`, `/api/events`) bleiben unverändert.
- pnpm-Workspace, Root-Scripts `build` und `dev`.
- Fonts (Rajdhani, Orbitron, JetBrains Mono) via `@fontsource/*` lokal gebündelt — keine Google-Fonts-Requests aus der Appliance heraus.
- React Router 6 für 5 Routen.
- Globale Contexte: `StatusContext` (SSE), `ConfigContext` (REST), `DiscoveryContext` (Auto-Loop), `FlashContext` (Toasts).
- Kein TanStack Query — kleine Custom Hooks reichen für 5 Endpunkte.

Alte Dateien werden komplett entfernt: `apps/web/src/ui/pages.ts`, `apps/web/src/ui/layout.ts`, `apps/web/src/ui/assets/*`. Sauberer Schnitt, keine parallele Classic-UI.

## App-Shell

Sticky Topbar (Brand-Dot + Hostname + Indicator + V2-Deco-Strip + 5 Icon-Tabs). Scrollbarer Content. Sticky Pin-Foot (Device-Name · SSE-Status · App-Version).

SSE-Auto-Reconnect mit exponentiellem Backoff (1s/2s/5s/10s, cap 10s). Footer spiegelt Verbindungsstatus.

Responsive:

- `< 768px`: Phone-Layout 1:1 zum Mockup.
- `≥ 768px`: Content `max-width: 720px`, zentriert. Stat-Grid 4 statt 2 Spalten.
- `≥ 1024px`: Content `max-width: 960px`. Sidebar-Nav später wenn gewünscht.

## Screens

### Dashboard `/`

Hero-Target-Panel mit Corner-Brackets (grün wenn LIVE, sonst cyan). Tag-Zeile mit Status-Chip (LIVE/IDLE/ERROR). Source-Name groß. Sub-Zeile mit Auflösung · FPS · "HDMI · KMS". Noise-Strip mit Uptime/Dropped/Queue.

Wenn Receiver läuft: 3-Button-Reihe **STOP** (rot) / **RESTART** / **RECONN**. Wenn gestoppt: ein großer **START OUTPUT** (cyan primary).

Status-Block: 4 Top-Stats (FPS, Resolution, Dropped, Uptime). "▾ SHOW DETAILS · 8 MORE" zeigt Receiver, Connection, Video, Audio, Queue·video, Queue·audio, Restarts, Last error.

Quick-Switch: Top-3 aus Discovery-Snapshot. Configured Source wird, falls vorhanden, als `current` (grün) markiert. Tap auf andere Quelle → `Use & Start`-Flow mit Confirm-Dialog.

V2-Deco-Strip am Ende.

### Sources `/sources`

Discovery-Panel: pulsierender Scan-Indicator (cyan/grau), Count + Dauer ("5 FOUND · 03s"), `↻ RESCAN`, `AUTO 5s`-Toggle (default an, sobald UI offen).

"CURRENT TARGET"-Section mit grüner Border: konfigurierte Source als prominente Card mit STOP / RESTART / RECONN.

"AVAILABLE SOURCES"-Section: alle anderen aus Snapshot. Pro Card: Radio-Dot, Name, LAN-Badge, IP + Auflösung + FPS + Connections, ein **USE & START**-Button (cyan primary, full-width). Ein-Button-Flow.

Empty/Error-States explizit gerendert.

### Settings `/settings`

Segment-Switch `QUICK · 5` / `ADVANCED · ALL`.

**QUICK:** 5 Felder — Preferred Source, Scale mode, Receiver color format, Low latency mode (toggle), Start on boot (toggle). Darunter 3 disabled-Accordions als Preview, Klick wechselt automatisch in Advanced.

**ADVANCED:** Alle Sections als ausklappbare Accordions — Receiver target (8), Reconnect strategy (4), Web UI & logging (6), Device & display (3). Stepper-Komponente für Zahleneingaben.

Submit-Button `◇ SAVE SETTINGS` (cyan primary, full-width). Wenn Receiver-Restart nötig: Hinweis "Receiver will restart".

### Logs `/logs`

Tab-Pair Web / Receiver. Color-coded LogBox (INFO=cyan, WARN=orange, ERROR=red, OK=green, TS=grau). Auto-Scroll wenn am Boden, pausiert bei manuellem Hochscrollen. Download-Button pro Tab. Live über SSE.

### About `/about`

SYSTEM-Section mit Noise-Strip + InfoRows (Device name, Web UI bind, Configured source, Video path).
RUNTIME PATHS-Section: 5 InfoRows mit echten Pfaden.
ARCHITECTURE-Section: 4 Bullets (`ndi-web.service`, `apps/receiver C++`, discovery helper, `ndi-standby.service`).
Trusted-LAN-Hinweis.

## Backend-Änderungen

- `@fastify/static` mounted auf `/`, root = `apps/web-ui/dist/`, SPA-Fallback via `setNotFoundHandler`.
- Neuer `DiscoverySupervisor`: zählt aktive SSE-Clients, startet `setInterval(5s)`-Discovery solange `count > 0`. Snapshots werden über bestehenden Event-Bus als neuer Event-Typ `discovery` an SSE-Clients gepusht. Lock gegen parallelen On-Demand-Rescan.
- Neuer Endpunkt `GET /api/version` (liefert App-Version aus `package.json`) für den Pin-Foot.
- Alle anderen Endpunkte bleiben unverändert.

## Tooling

- `pnpm-workspace.yaml` erweitern um `apps/web-ui`.
- Root-`package.json`: `build` baut beide Apps. `dev` startet Vite + Fastify parallel mit Proxy auf `/api`.
- `install.sh` / `update.sh` führen `pnpm install` + `pnpm build` aus.
- Vite-Config: `base: "/"`, Dev-Proxy `/api` → `http://localhost:8080`.

## Tests

- Bestehende Backend-Tests bleiben grün.
- Neuer Test für `DiscoverySupervisor` (Start/Stop bei SSE-Client-Count, Lock).
- Keine Frontend-Component-Tests in V1.

## Verification before completion

- `pnpm build` läuft erfolgreich für beide Workspaces.
- Backend-Tests grün.
- Manueller Smoke-Test: alle 5 Screens rendern, Tab-Switching, Quick/Advanced-Toggle, SSE-Update propagiert auf Dashboard, Discovery-Loop startet/stoppt mit SSE-Verbindung.

## Open Points / Risks

- Keine persistente "Recent Sources"-Liste — Quick-Switch nutzt nur Discovery-Snapshot, nach Reboot leer bis erster Scan.
- Vite-Build-Zeit auf Pi 5: Erwartung 10–20s, optimierbar via `esbuild`-Defaults.
- Bundle-Größe durch `@fontsource/*`; Fallback wäre Subset oder System-Font.
- Auto-Discovery-Loop kann mit manuellem Rescan kollidieren — Lock im Supervisor.

## Branch / PR

- Branch: `feat/ui-v2-console`.
- Commits pro logischem Schritt (Setup, Tokens, Shell, Dashboard, Sources, Settings, Logs, About, Backend, Cleanup).
- PR gegen `main` am Ende mit Screenshot-Checkliste.
