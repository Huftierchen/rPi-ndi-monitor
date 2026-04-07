# NDI Monitor for Raspberry Pi

`ndi-monitor` is a monorepo for a headless NDI appliance on Raspberry Pi. The device boots into `multi-user.target`, shows an HDMI standby screen with the Web UI URL, hostname, IP address, and QR code while idle, and renders one selected NDI source fullscreen over KMS/DRM once playback starts.

The Web UI is the control plane only. Actual NDI receive, reconnect handling, and HDMI rendering happen in a native C++ component.

## Status

The current project state is production-oriented and verified on the target device:

- Web UI, REST API, and SSE run under `ndi-web.service`
- Discovery, source switching, start, stop, restart, and reconnect work
- The receiver runs as a child process of the web service
- The HDMI standby screen replaces the normal `tty1` login prompt
- Real NDI playback was verified locally against live network senders
- Logs are persisted, while live receiver status now flows over process events

Repository status:

- `main` is the active branch
- GitHub remote: `https://github.com/Huftierchen/rPi5-ndi-monitor.git`

## Project Structure

- `apps/web`: Fastify + TypeScript for SSR UI, REST API, SSE, config, status, and supervision
- `apps/receiver`: C++17 + CMake for NDI discovery, receive, reconnect, and HDMI rendering
- `config/`: default runtime configuration
- `docs/`: architecture, deployment, and operations documentation
- `scripts/`: install, update, uninstall, and standby screen scripts
- `systemd/`: `ndi-web.service`, `ndi-standby.service`, and tmpfiles configuration

## Architecture Summary

- Node.js does not render video frames
- `ndi-web.service` is the single control-plane service
- The web service manages the native receiver as a child process
- Discovery runs as a short native CLI invocation
- Live status is sourced from native process events; the status JSON file is only a persisted snapshot
- `ndi-standby.service` draws the appliance standby screen on `tty1` at boot
- The web supervisor redraws the same standby screen after `stop` or clean receiver exit

More detail: [ARCHITECTURE.md](/home/pi/ndi-monitor/docs/ARCHITECTURE.md)

## Current Feature Set

- Dashboard with receiver, connection, video, audio, and error status
- NDI source discovery from the Web UI
- Source selection with optional immediate start
- Persistent YAML configuration in `/etc/ndi-receiver/config.yaml`
- Auto-start and reconnect backoff
- Live status over SSE with browser fallback polling
- Downloadable web and receiver logs
- Headless HDMI operation without X11 or Wayland

## Main UI Pages

- `/`: dashboard and immediate controls
- `/sources`: discovery, source selection, and apply/start actions
- `/settings`: persistent runtime configuration
- `/logs`: web and receiver logs
- `/about`: appliance overview and runtime paths

## Important Runtime Paths

- Config: `/etc/ndi-receiver/config.yaml`
- Status snapshot: `/var/lib/ndi-receiver/receiver-status.json`
- Web log: `/var/log/ndi-receiver/web.log`
- Receiver log: `/var/log/ndi-receiver/receiver.log`
- Install root: `/opt/ndi-monitor`

## Quick Start on the Pi

Full step-by-step deployment: [DEPLOYMENT_PI5.md](/home/pi/ndi-monitor/docs/DEPLOYMENT_PI5.md)

Short version:

```bash
sudo apt-get update
sudo apt-get install -y \
  git rsync curl ca-certificates build-essential cmake pkg-config \
  libsdl2-dev libasound2-dev ripgrep avahi-daemon qrencode

git clone https://github.com/Huftierchen/rPi5-ndi-monitor.git /home/pi/ndi-monitor
cd /home/pi/ndi-monitor

export NDI_SDK_DIR=/opt/ndi_sdk
sudo ./scripts/install.sh
sudo reboot
```

After reboot:

- HDMI should show the standby screen with URL, hostname, IP, and QR code
- The Web UI should be reachable at `http://<pi-ip>:8080/`
- Open `/sources`, discover senders, and select the desired source
- Enable `autoStart` in `/settings` if the box should reconnect automatically after boot

## NDI SDK

The NDI SDK is intentionally not committed to the repository.

Expected local SDK path:

- `/opt/ndi_sdk`

Official Linux SDK tarball:

- `https://downloads.ndi.tv/SDK/NDI_SDK_Linux/Install_NDI_SDK_v6_Linux.tar.gz`

The install/build path expects:

- headers under `include/Processing.NDI.Lib.h`
- ARM64 runtime libraries under `lib/aarch64-rpi4-linux-gnueabi`

Deployment copies the required `libndi.so*` files to `/opt/ndi-monitor/lib`.

## Local Build

### Prerequisites

- Node.js 22+
- Corepack
- CMake 3.16+
- `g++`
- `libsdl2-dev`
- `libasound2-dev`
- optional NDI SDK for real builds

### Web App

```bash
corepack prepare pnpm@10.7.1 --activate
corepack pnpm install
corepack pnpm --filter @ndi-monitor/web typecheck
corepack pnpm --filter @ndi-monitor/web build
corepack pnpm --filter @ndi-monitor/web test
```

### Receiver with the Real SDK

```bash
cmake -S apps/receiver -B apps/receiver/build \
  -DNDI_SDK_DIR=/opt/ndi_sdk \
  -DRECEIVER_ALLOW_STUB_BACKEND=OFF
cmake --build apps/receiver/build -j"$(nproc)"
ctest --test-dir apps/receiver/build --output-on-failure
```

### Stub Build without the SDK

```bash
cmake -S apps/receiver -B apps/receiver/build -DRECEIVER_ALLOW_STUB_BACKEND=ON
cmake --build apps/receiver/build -j"$(nproc)"

export NDI_RECEIVER_STUB_SOURCE="Demo Source"
./apps/receiver/build/ndi-receiver discover --json
./apps/receiver/build/ndi-receiver run \
  --source "Demo Source" \
  --status-file ./runtime/receiver-status.json \
  --audio disabled \
  --scale-mode contain
```

## Web UI

### Dashboard

- shows the current receiver state
- exposes start, stop, restart, and reconnect actions
- shows the configured source and current runtime video state

### Sources

- starts discovery automatically on page load
- supports manual refresh and auto-refresh
- persists the selected source
- supports both `Use selected source` and `Use and start now`

### Settings

Current persistent settings include:

- `server.host`
- `server.port`
- `receiver.sourceName`
- `receiver.audioEnabled`
- `receiver.scaleMode`
- `receiver.bandwidthMode`
- `receiver.colorFormat`
- `receiver.outputFpsCap`
- `receiver.lowLatencyMode`
- `receiver.autoStart`
- `receiver.reconnect.enabled`
- `receiver.reconnect.initialDelayMs`
- `receiver.reconnect.maxDelayMs`
- `receiver.reconnect.backoffMultiplier`
- `logging.level`
- `logging.maxFiles`
- `logging.maxSizeMb`
- `logging.json`
- `display.fullscreen`
- `display.hdmiOutputHint`
- `device.name`

### Logs

- shows web logs
- shows native receiver logs
- supports log download

## Performance Notes

For Raspberry Pi 4, the most useful combinations right now are:

- `receiver.colorFormat: fastest` or `uyvy`
- `receiver.lowLatencyMode: true`
- `receiver.audioEnabled: false` if audio is not needed
- sender-side `1080p30` instead of `1080p60` whenever possible

Measured locally on the Pi 4 with a `1920x1080 @ 60` sender:

- `rgba + lowLatency=false`: about `168% CPU`, `droppedVideoFrames: 226`, `videoQueueDepth: 10`
- `fastest + lowLatency=true`: about `121% CPU`, `droppedVideoFrames: 2`, `videoQueueDepth: 4`

Those numbers are workload-specific, but the direction is clear: the faster NDI pixel path plus queue draining materially reduces CPU pressure and visible lag.

## REST API

### Endpoints

- `GET /healthz`
- `GET /api/status`
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/discovery`
- `POST /api/discovery`
- `POST /api/control/start`
- `POST /api/control/stop`
- `POST /api/control/restart`
- `POST /api/control/reconnect`
- `POST /api/control/switch-source`
- `GET /api/logs?scope=web|receiver&limit=100`
- `GET /api/logs/download?scope=web|receiver`
- `GET /api/events`

### Example: Switch Source

```bash
curl -X POST http://pi-host:8080/api/control/switch-source \
  -H 'content-type: application/json' \
  -d '{"sourceName":"DESKTOP-DS7KLEC (TouchDesigner)"}'
```

### Example: Enable Auto-Start

```bash
curl -X PUT http://pi-host:8080/api/settings \
  -H 'content-type: application/json' \
  -d '{
    "receiver": {
      "sourceName": "DESKTOP-DS7KLEC (TouchDesigner)",
      "audioEnabled": false,
      "scaleMode": "contain",
      "bandwidthMode": "highest",
      "colorFormat": "fastest",
      "outputFpsCap": 30,
      "lowLatencyMode": true,
      "autoStart": true,
      "reconnect": {
        "enabled": true,
        "initialDelayMs": 1000,
        "maxDelayMs": 15000,
        "backoffMultiplier": 1.8
      }
    }
  }'
```

## Deployment Model

- `ndi-web.service`: Fastify UI, REST API, SSE, config, logs, and receiver supervision
- `ndi-standby.service`: draws the HDMI standby screen on `tty1`
- `getty@tty1.service`: disabled in appliance mode so the Linux login prompt does not appear on HDMI

The native receiver is intentionally not a separate `systemd` service. The web service is the single control plane and owns the receiver child process.

## Troubleshooting

### No NDI Sources Appear

- check network connectivity
- check `avahi-daemon`
- verify that the sender is visible on the same LAN

### The Receiver Runs but HDMI Shows No Video

```bash
curl http://127.0.0.1:8080/api/status
cat /var/lib/ndi-receiver/receiver-status.json
tail -f /var/log/ndi-receiver/receiver.log
```

Check for:

- `connectionState: connected`
- `videoActive: true`
- valid `resolution` and `fps`
- working DRM device handles under `/dev/dri/*`

### The Login Prompt Reappears on HDMI

```bash
sudo systemctl status getty@tty1.service ndi-standby.service
cat /boot/cmdline.txt
```

Expected:

- `getty@tty1.service`: inactive
- `ndi-standby.service`: active (exited)
- `/boot/cmdline.txt` without `console=tty1`

## Open Risks

- HDMI audio still needs final target-side validation with real signal and display hardware
- SDL2/KMSDRM behavior can vary by display, cable, adapter, and firmware combination
- Large-scale deployments would still benefit from stronger monitoring and explicit log rotation policy
