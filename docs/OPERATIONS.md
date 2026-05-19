# Operations

## Important Files

- config: `/etc/ndi-receiver/config.yaml`
- status snapshot: `/var/lib/ndi-receiver/receiver-status.json`
- web log: `/var/log/ndi-receiver/web.log`
- receiver log: `/var/log/ndi-receiver/receiver.log`

## Important Services

```bash
sudo systemctl status ndi-web.service
sudo systemctl status ndi-standby.service
sudo systemctl status getty@tty1.service
```

What they do:

- `ndi-web.service`: Web control plane, API, UI, and supervisor for the native receiver
- `ndi-standby.service`: draws the idle/standby screen on `tty1` during boot
- `getty@tty1.service`: should remain disabled in appliance mode

## Typical Runtime Flow

1. the Pi boots into `multi-user.target`
2. `ndi-standby.service` draws the standby screen on HDMI
3. `ndi-web.service` starts the control plane
4. configuration is loaded and validated
5. discovery and UI become available
6. with `autoStart` enabled or after a manual start, the receiver child process is launched
7. the receiver emits live status events and structured logs
8. reconnect and restart logic handles disconnects or crashes

The standby screen shows:

- Web UI URL
- QR code for the Web UI
- hostname and Bonjour name
- current IP address
- configured source

After `Stop` or receiver exit, the web supervisor redraws the same standby screen.

## Start and Stop the Receiver

From the Web UI:

- dashboard: `Start output`, `Stop output`, `Restart receiver`, `Reconnect source`
- sources page: `Use and start now`

Through the API:

```bash
curl -X POST http://127.0.0.1:8080/api/control/start
curl -X POST http://127.0.0.1:8080/api/control/stop
curl -X POST http://127.0.0.1:8080/api/control/restart
curl -X POST http://127.0.0.1:8080/api/control/reconnect
```

## Discovery

Discovery runs as a short-lived native process. Active playback is not interrupted.

Web UI:

- `/sources` starts discovery automatically when opened
- manual refresh is always available

CLI:

```bash
/opt/ndi-monitor/apps/receiver/build/ndi-receiver discover --json --timeout-ms 4000
```

## Observe Status

```bash
curl http://127.0.0.1:8080/api/status
cat /var/lib/ndi-receiver/receiver-status.json
```

The API is the authoritative live view. The JSON file is only the latest persisted snapshot and can therefore be older than the API state.

Important status fields:

- `lifecycle`
- `connectionState`
- `sourceName`
- `videoActive`
- `audioActive`
- `resolution`
- `fps`
- `lastError`
- `restartCount`
- `desiredRunning`
- `droppedVideoFrames`
- `videoQueueDepth`

## Logs

### File Logs

```bash
tail -f /var/log/ndi-receiver/web.log
tail -f /var/log/ndi-receiver/receiver.log
```

### Journal

```bash
sudo journalctl -u ndi-web.service -f
sudo journalctl -u ndi-web.service -b
sudo journalctl -u ndi-standby.service -b
```

### Web UI

- `/logs`
- download buttons for both log scopes

## Change Configuration

Persistent config file:

- `/etc/ndi-receiver/config.yaml`

Changes can be made:

- through `/settings`
- through `/sources`
- via API
- directly over SSH if necessary

After saving through the Web UI:

- configuration is validated
- if the receiver is active, a controlled restart is triggered

## Typical Settings

### Sensible Production Defaults

- `receiver.sourceName`: fixed sender name
- `receiver.autoStart: true`
- `receiver.reconnect.enabled: true`
- `receiver.scaleMode: contain` or `cover`
- `receiver.colorFormat: fastest`
- `receiver.lowLatencyMode: true`
- `logging.level: info`
- `display.fullscreen: true`

### If Audio Causes Problems

- `receiver.audioEnabled: false`

### If Full HD Is Too Heavy on a Pi 4

- `receiver.colorFormat: fastest` or `uyvy`
- `receiver.lowLatencyMode: true`
- `receiver.outputFpsCap: 30`
- reduce the sender to `30 fps` if possible

### If a Source Comes Back Slowly

- increase `receiver.reconnect.initialDelayMs`
- increase `receiver.reconnect.maxDelayMs`

## Reboot After First Install

A reboot is recommended after first install because:

- `/boot/cmdline.txt` is changed
- `console=tty1` is removed
- the HDMI boot console should become quiet and appliance-like

## If the Receiver Runs but No Video Is Visible

Check:

```bash
curl http://127.0.0.1:8080/api/status
cat /var/lib/ndi-receiver/receiver-status.json
tail -f /var/log/ndi-receiver/receiver.log
sudo ls -l /proc/$(pgrep -f ndi-receiver | head -n1)/fd
```

Things to verify:

- `connectionState` should be `connected`
- `videoActive` should be `true`
- `resolution` and `fps` should be populated
- DRM handles should be open on `/dev/dri/card*` and `/dev/dri/renderD128`

## If the Login Prompt Reappears on HDMI

Check:

```bash
sudo systemctl status getty@tty1.service ndi-standby.service
cat /boot/cmdline.txt
```

Expected:

- `getty@tty1.service`: `inactive`
- `ndi-standby.service`: `active (exited)`
- `/boot/cmdline.txt` without `console=tty1`

## Graceful Shutdown

On `SIGTERM`:

- the web service writes a shutdown log entry
- the child process receives `SIGTERM`
- after timeout, `SIGKILL` follows
- `systemd` sees a clean service exit if shutdown completes in time

## Update

```bash
cd /home/pi/ndi-monitor
export NDI_SDK_DIR=/opt/ndi_sdk
sudo ./update.sh
```

`update.sh` pulls latest changes itself (as the repo owner). Pass `SKIP_GIT_PULL=1` to update from already-checked-out code.

## Remaining Operational Risks

- HDMI audio should still be validated on the final target system with a real signal path
- SDL2/KMSDRM behavior can still vary by display, cable, adapter, and firmware combination
- larger deployments would benefit from explicit monitoring and more formal log rotation policy
