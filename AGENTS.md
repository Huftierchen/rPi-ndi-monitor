# Project Brief

Build a complete, production-oriented Raspberry Pi NDI receiver appliance.

## Goal

A Raspberry Pi running Raspberry Pi OS Lite without a desktop should act as a standalone NDI receiver. The device should render one selectable NDI stream fullscreen on the HDMI-attached display. Configuration and remote control should happen through a local Node.js web interface. NDI receive and rendering must not happen in Node.js; they must be handled by a native component.

## Core Architecture Decision

Node.js / TypeScript is responsible only for:

- Web UI
- REST API
- configuration
- status
- process supervision
- reconnect / restart logic
- log viewing

The native receiver is responsible for:

- NDI source discovery
- connecting to a source
- receiving video
- optional HDMI audio output
- fullscreen HDMI rendering
- no X11, no Wayland, no desktop
- direct Linux DRM/KMS output, preferably through SDL2 KMSDRM or an equivalent robust approach

## Constraints

- target platform: Raspberry Pi 5
- OS: Raspberry Pi OS Lite / Bookworm
- architecture: ARM64
- deployment: `systemd`
- boot behavior:
  - boot into multi-user mode
  - web UI and receiver manager start automatically
  - device must recover automatically after power loss
- output:
  - fullscreen on HDMI
  - no mouse cursor
  - no visible desktop
  - appliance-like behavior
- operation:
  - remote browser access over the network
  - simple remote configuration
  - list NDI sources
  - select a source
  - start / stop / reconnect
  - inspect status
  - inspect logs
- robustness:
  - automatic retry when a source disappears
  - automatic restart when the native receiver crashes
  - clean error handling
  - `systemd` restart policies
- security:
  - UI is LAN-only by default
  - structure the code so authentication can be added later
- audio:
  - optional on/off
  - HDMI output when enabled
- performance:
  - target stable 1080p first
  - single-stream only
- UX:
  - headless appliance
  - simple config file plus Web UI
  - minimal moving parts

## Preferred Project Layout

### `apps/web`

- Node.js + TypeScript
- lightweight backend such as Fastify or Express
- server-rendered pages or a very small frontend layer
- no heavy frontend framework unless clearly needed
- REST API for all control actions
- WebSocket or SSE for live status/logs if useful

### `apps/receiver`

- native app in C++ preferred, Rust acceptable
- direct NDI SDK integration
- output through SDL2 KMSDRM or technically equivalent path
- CLI interface so Node can manage it cleanly
- structured logs
- JSON status file or stdout status events

## Preferred Implementation Choices

- C++17 or newer for the receiver
- CMake for the native build
- Node.js 22+
- TypeScript strict mode
- pnpm
- clean separation between build-time and runtime config
- no Docker requirement on the target
- build directly on the Pi, with cross-compile friendliness where possible

## Expected Repository Structure

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT_PI5.md`
- `docs/OPERATIONS.md`
- `apps/web/...`
- `apps/receiver/...`
- `scripts/...`
- `config/...`
- `systemd/...`

## Required Feature Set

### A) Web UI / Node Backend

The web application should provide:

1. Dashboard
- current device status
- receiver running / not running
- currently connected source
- video status
- audio status
- recent errors
- uptime
- current resolution / FPS when available

2. NDI Source Discovery
- button: `Search sources`
- list of discovered NDI sources
- source selection
- repeatable refresh
- optional auto-refresh

3. Control
- start receiver
- stop receiver
- restart receiver
- reconnect current source
- switch source

4. Settings
- desired NDI source
- audio on/off
- HDMI / display options
- retry intervals
- logging level
- auto-start
- optional preferred device name
- optional fullscreen / letterbox / scale mode

5. Logs
- recent native receiver log lines
- recent web backend log lines
- log file download

6. API
- clean REST endpoints
- JSON responses
- healthcheck
- status endpoint
- discovery endpoint
- settings endpoint
- control endpoint

7. Process Supervision
- Node starts/stops the native receiver process
- Node understands exit codes
- Node can restart the receiver automatically
- Node persists configuration to disk

### B) Native Receiver

The native receiver should:

1. Initialize NDI
- integrate the NDI runtime / SDK
- support discovery
- connect to a source by name or identifier

2. Receive Video
- read frames
- detect disconnects
- handle errors robustly
- use sensible timeouts

3. Render
- direct fullscreen HDMI output
- no desktop required
- SDL2 KMSDRM preferred
- clean render loop
- low CPU overhead
- scaling modes:
  - contain / letterbox
  - cover / crop
  - stretch

4. Audio
- optional HDMI output
- video must still work when audio is disabled
- audio errors must not crash the whole app

5. CLI

Example shape:

```bash
receiver \
  --source "My NDI Sender" \
  --audio enabled \
  --log-level info \
  --scale-mode contain \
  --status-file /var/lib/ndi-receiver/status.json
```

6. Logging
- structured stdout/stderr logs
- useful categories such as startup, ndi, video, audio, render, reconnect, error
- optional JSON logs via flag

7. Status
- either periodic JSON status snapshots
- or stdout status events
- Node must reliably detect:
  - receiver starting
  - source found / not found
  - connected
  - disconnected
  - reconnecting
  - fatal error

### C) Configuration

Use a simple, robust configuration model.

Example shape:

```yaml
server:
  host:
  port:
receiver:
  sourceName:
  audioEnabled:
  scaleMode:
  reconnect:
    enabled:
    initialDelayMs:
    maxDelayMs:
    backoffMultiplier:
logging:
  level:
  maxFiles:
  maxSizeMb:
display:
  fullscreen:
  hdmiOutputHint:
device:
  name:
```

Requirements:

- ship defaults
- persist Web UI changes
- validate config
- invalid config must never be accepted silently

### D) `systemd` / Linux Integration

Create:

1. `ndi-web.service`
- starts the Node web app
- starts after `network-online.target`
- restarts on failure

2. Receiver service model
- either a separate `systemd` receiver service
- or receiver as a child process of the web service

Preferred choice:

- web service as the main service
- receiver managed as a child process by the web backend

Also provide:

- tmpfiles.d or an equivalent runtime directory setup
- example paths:
  - `/etc/ndi-receiver/`
  - `/var/lib/ndi-receiver/`
  - `/var/log/ndi-receiver/`

Deployment scripts:

- `install.sh`
- `update.sh`
- `uninstall.sh`

These scripts should:

- validate dependencies
- copy files
- run `systemctl daemon-reload`
- enable and start services
- set sensible permissions

### E) Build / Dependencies

Document clearly:

- required apt packages
- required Node version
- required native build tools
- how the NDI SDK is integrated
- licensing / redistribution considerations

The NDI SDK must not be committed blindly into the repository.

Instead:

- define a clear expected SDK path
- for example `third_party/ndi_sdk` or `NDI_SDK_DIR`
- emit clear build errors when the SDK is missing

If SDL2 KMSDRM requires extra Linux permissions or device access, document that explicitly.

### F) Operating Model

The Web UI should stay simple and functional.

Focus:

- usable from a phone on the LAN
- comfortable on desktop
- clear status
- clear errors
- minimal design

Important pages:

- `/`
- `/sources`
- `/settings`
- `/logs`
- `/about`

### G) Quality Requirements

Implement:

- TypeScript strict mode
- input validation
- useful error messages
- no silent catch-all blocks
- documented exit codes
- complete README
- architecture documentation
- Raspberry Pi deployment documentation
- example config
- example `systemd` units
- screenshot placeholders if real screenshots are not available yet
- unit tests for Node config/validation/service layers
- at least some native tests or testability hooks

### H) Decisions to Make Explicitly

Choose and document:

- Fastify vs Express
- SSE vs WebSocket
- YAML vs JSON config
- child-process management strategy
- logging library
- how discovery is triggered from Node

Preferred:

- discovery as a native CLI subcommand or a short separate native run
- Node parses the JSON result

Document each major decision briefly in `docs/ARCHITECTURE.md`.

### I) Implementation Style

Deliver a real, runnable skeleton, not pseudocode.

Expected:

- real code
- real project structure
- real `systemd` files
- real config files
- real build files
- real README
- `TODO` only where real NDI SDK integration cannot be fully verified locally

Where NDI integration cannot be fully tested without the local SDK:

- still implement the real structure
- mark the exact unverified areas clearly
- avoid hand-wavy placeholder architecture

### J) Final Deliverables

Provide:

1. full project structure
2. all files with real content
3. root README with build and deployment instructions
4. step-by-step Raspberry Pi instructions
5. explanation of local testing
6. list of open points / risks
7. clear build and start commands
8. example `systemd` setup
9. example configuration
10. API documentation

### K) Technical Notes

- target OS is Raspberry Pi OS Bookworm Lite without a desktop
- direct display output must work without X11/Wayland
- KMS/DRM is the preferred Linux path
- the solution must not depend on a desktop window manager
- the project should behave like an appliance
- Node.js must not render video frames
- receiver and Web UI should stay clearly separated
- the native component must handle disconnects robustly
- logging and operability matter more than cosmetic extras

### L) Recommended Work Order

1. define and document the architecture
2. create the project structure
3. implement the Node web app
4. implement the native receiver skeleton
5. define discovery and control interfaces
6. implement config, logging, and status handling
7. add `systemd` and deployment files
8. complete README and docs
9. mark open NDI SDK integration points precisely
10. finish with a realistic operational risk section

## Pragmatic Rules

- build a robust one-stream solution first
- no microservice split
- no Kubernetes
- no Docker requirement on the Pi
- do not use a heavy frontend framework without a strong reason
- prefer stability and maintainability over cleverness
- prefer local files plus `systemd` over runtime magic
- when choosing between “pretty” and “robust”, choose “robust”
- when a feature cannot be fully verified without the real NDI SDK, implement the real structure anyway and document the exact remaining test points

## Default Technology Choices

Unless there is a strong reason otherwise:

- backend: Fastify
- frontend: server-rendered templates or a tiny static frontend layer
- live updates: SSE
- config: YAML
- Node logging: pino
- native receiver: C++17 + CMake
- rendering: SDL2 KMSDRM
- process model: web service manages the native receiver as a child process
- discovery: native receiver supports a `discover` CLI subcommand with JSON output
- status: native receiver additionally writes a JSON status file

## Operational Details That Must Not Be Forgotten

- `systemd` restart policy
- stdout/stderr into journal
- optional persistent log files
- graceful shutdown on `SIGTERM`
- clean receiver-process termination
- locking against multiple starts
- API must clearly indicate whether the receiver is already running
- discovery must never disturb an active receiver unintentionally
- if HDMI is not detected cleanly during boot, document the behavior and fallback handling
