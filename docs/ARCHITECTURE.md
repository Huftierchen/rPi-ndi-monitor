# Architecture

## Target Shape

The system is designed as a headless NDI appliance for Raspberry Pi running Raspberry Pi OS Lite. There is exactly one control plane:

- `apps/web`: Fastify-based Node.js service for UI, REST API, SSE, configuration, logging, and process supervision
- `apps/receiver`: native C++17 application for discovery, NDI receive, reconnect handling, HDMI rendering, and optional audio output

The Pi boots into `multi-user.target` without a desktop. The web control plane runs as `ndi-web.service`. The actual receiver is not a separate `systemd` unit; it is a child process of the web service. That keeps the full appliance state under one service boundary.

## Runtime Topology

### Services

- `ndi-web.service`: main service for HTTP, UI, API, SSE, config, logs, and receiver supervision
- `ndi-standby.service`: draws the appliance standby screen with the Web UI QR code on `tty1`
- `getty@tty1.service`: disabled in appliance mode so HDMI does not show a login prompt

### Production Paths

- install root: `/opt/ndi-monitor`
- config: `/etc/ndi-receiver/config.yaml`
- status snapshot: `/var/lib/ndi-receiver/receiver-status.json`
- logs: `/var/log/ndi-receiver/web.log`, `/var/log/ndi-receiver/receiver.log`
- volatile runtime: `/run/ndi-monitor`

### Service Environment

`ndi-web.service` sets these production-time variables among others:

- `NDI_MONITOR_CONFIG_PATH=/etc/ndi-receiver/config.yaml`
- `NDI_MONITOR_RUNTIME_ROOT=/var/lib/ndi-receiver`
- `NDI_MONITOR_LOG_DIR=/var/log/ndi-receiver`
- `NDI_MONITOR_RECEIVER_BINARY=/opt/ndi-monitor/apps/receiver/build/ndi-receiver`
- `XDG_RUNTIME_DIR=/run/ndi-monitor`
- `SDL_VIDEODRIVER=kmsdrm`
- `SDL_AUDIODRIVER=alsa`
- `LD_LIBRARY_PATH=/opt/ndi-monitor/lib`

That gives the native receiver a desktop-free KMS/DRM path plus HDMI audio output.

## Major Architecture Decisions

### Fastify Instead of Express

Fastify was chosen because it stays lightweight on the Pi, has solid TypeScript support, and handles SSR, REST, and streaming without requiring a heavy frontend framework.

### SSE Instead of WebSocket

The data flow is mostly server-to-client: status, logs, and discovery results are pushed to the browser. SSE is simpler than WebSockets for this use case and keeps the implementation smaller.

### YAML Instead of JSON for Runtime Config

The appliance is expected to be operated over SSH or directly on the device. YAML is easier for operators to inspect and edit. The application still validates strictly and rejects invalid values instead of silently accepting them.

### Receiver as a Child Process of the Web Service

This follows the single-control-plane model on purpose:

- start, stop, restart, reconnect, and source switch all run through one process
- API and UI can always describe both desired and actual state
- exit codes, logs, and runtime state can be correlated directly
- discovery can run independently without disrupting active playback

`systemd` supervises only `ndi-web.service`. The web service supervises the native receiver.

### Discovery as a Native CLI Subcommand

Discovery is executed as a short-lived native process with `ndi-receiver discover --json`. Node.js therefore does not need to link against the NDI SDK, and active playback stays untouched.

### Live Status over Process Events

The receiver emits status and lifecycle events on `stdout` and structured log lines on `stdout` and `stderr`. The web control plane keeps the current receiver state in memory and republishes it to the UI, API, and SSE clients.

The JSON status file still exists, but only as an infrequent persisted snapshot during important transitions such as startup, disconnect, fatal error, or clean stop. That reduces SD-card I/O while preserving a last-known state for diagnosis.

## Data and Control Flow

### Web UI

The Web UI is intentionally server-rendered and lightweight:

- dashboard for immediate controls and live runtime state
- sources page for discovery, selection, and direct start
- settings page for persistent configuration
- logs page for web and receiver logs
- about page for appliance overview and runtime paths

Interactive actions go through REST endpoints. Live updates are delivered primarily over SSE, with browser fallback polling.

### Control Flow

1. the browser sends a REST request to `apps/web`
2. the config service validates and persists YAML changes
3. the receiver supervisor starts, stops, or restarts the native process
4. the receiver emits live status and logs
5. the web service mirrors that state back into UI, API, and SSE

### Discovery Flow

1. UI or API requests discovery
2. the web service starts a short-lived native `discover` process
3. the JSON result is parsed and returned to UI/API
4. any running `run` process remains untouched

## Native Receiver Structure

The receiver is split into clear building blocks:

- CLI parser for `run` and `discover`
- logger with text and optional JSON output
- `StatusWriter` for atomic JSON snapshots
- NDI backend interface for either the real SDK or the stub build
- renderer interface for SDL2/KMSDRM or a headless stub
- `ReceiverApp` for signal handling, reconnect looping, status emission, and exit codes

For Pi runtime performance, the current receiver also includes:

- configurable NDI color formats (`rgba`, `uyvy`, `fastest`)
- renderer textures chosen to match the actual incoming pixel layout
- an optional low-latency mode that drains queued video frames down to the newest frame

That structure allows real implementation without distorting the interface just to support local non-SDK testing.

### HDMI output resolution

The `--output-mode` option (`auto` or `<W>x<H>@<Hz>`) controls the HDMI output mode:

- `auto` keeps the display's native mode via `SDL_WINDOW_FULLSCREEN_DESKTOP` (the NDI frame is scaled to fit).
- a concrete mode triggers a real DRM modeset via `SDL_WINDOW_FULLSCREEN` + `SDL_SetWindowDisplayMode`.
- a pure `SelectDisplayMode()` function resolves the requested spec against the enumerated modes; an unavailable mode falls back to native and is flagged so the operator sees it.

**Decision — modes are reported by the running receiver, not discovered separately.** Available modes are an EDID property of the connected display, so the receiver enumerates them once at startup (while it already holds the DRM device) and writes them to the status snapshot (`availableModes`), alongside the applied mode (`outputMode`) and `outputModeFallback`. This avoids a second `discover-modes` subcommand that would need its own DRM access and could conflict with the active receiver's DRM master. The Web UI offers the reported modes; a "rescan" is simply a receiver restart (which any settings change already performs).

## HDMI Appliance Behavior

The Pi should feel like a device, not like a Linux login host. The install path therefore also:

- disables `getty@tty1.service`
- removes `console=tty1` from `/boot/cmdline.txt`
- adds `quiet loglevel=3 vt.global_cursor_default=0`
- enables `ndi-standby.service`

Result:

- while the receiver is not running, HDMI shows the standby screen with URL, QR code, hostname, and IP
- once the receiver starts, the KMS/DRM renderer takes over the display
- no visible desktop, no mouse cursor, no login prompt

## Failure and Restart Behavior

- if the source disappears, the receiver process stays alive and runs its reconnect backoff loop
- if the receiver exits unexpectedly, the web supervisor decides whether to restart it based on config
- if the web service crashes, `systemd` restarts it
- on `SIGTERM`, both the web service and child process are shut down in order
- discovery does not interfere with the active output path

## Permissions and Device Access

The production user `ndi-monitor` runs with these extra groups:

- `video`
- `audio`
- `render`

That allows DRM/KMS and HDMI audio access without running the service as `root`.

## Development and Test Mode

Without the real NDI SDK, the receiver can be built in stub mode while preserving the same structure:

- same CLI
- same status snapshot contract
- same supervisor integration
- same Web API

Development mode automatically falls back to repo-local runtime paths under `runtime/`.

## Extensibility

The first version is intentionally built for LAN usage without mandatory authentication. The web layer is still structured so later additions remain straightforward:

- Fastify auth middleware
- reverse-proxy protection
- additional diagnostic endpoints
- more display or audio options

The control plane, process model, and native rendering path do not need to be redesigned for those additions.
