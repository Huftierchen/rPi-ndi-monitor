# Deployment on Raspberry Pi

## Target System

- Raspberry Pi 5 as the intended production target
- Raspberry Pi OS Lite or another Debian/Pi-OS compatible ARM64 system
- HDMI display connected directly
- no desktop, no X11, no Wayland
- LAN network access

Note: the current verified runtime box in this repository is a Raspberry Pi 4, but the deployment shape stays the same.

## What the Install Path Does

`scripts/install.sh` builds and installs the full stack:

- enables `pnpm` via Corepack
- builds the web app and native receiver
- copies the repo to `/opt/ndi-monitor`
- copies NDI runtime libraries to `/opt/ndi-monitor/lib` for real SDK builds
- creates `/etc/ndi-receiver`, `/var/lib/ndi-receiver`, `/var/log/ndi-receiver`, and `/run/ndi-monitor`
- installs `ndi-web.service` and `ndi-standby.service`
- disables `getty@tty1.service`
- removes `console=tty1` from `/boot/cmdline.txt`
- writes the HDMI standby screen to `tty1`

Important:

- after first installation, a reboot is strongly recommended so the console and HDMI appliance changes fully take effect

## Required Packages

```bash
sudo apt-get update
sudo apt-get install -y \
  git rsync curl ca-certificates build-essential cmake pkg-config \
  libsdl2-dev libasound2-dev ripgrep avahi-daemon qrencode
```

Optional but useful on the Pi:

```bash
sudo apt-get install -y gh git-lfs
```

Node.js 22+ is required. The project scripts activate `pnpm` through Corepack.

## Prepare the NDI SDK

The repository deliberately does not commit the NDI SDK. For a real production build, the SDK must exist locally, typically under:

- `/opt/ndi_sdk`

Official Linux SDK tarball:

- `https://downloads.ndi.tv/SDK/NDI_SDK_Linux/Install_NDI_SDK_v6_Linux.tar.gz`

Expected on ARM64:

- headers: `/opt/ndi_sdk/include/Processing.NDI.Lib.h`
- runtime libraries: `/opt/ndi_sdk/lib/aarch64-rpi4-linux-gnueabi`

## Fresh Install

```bash
git clone https://github.com/Huftierchen/rPi5-ndi-monitor.git /home/pi/ndi-monitor
cd /home/pi/ndi-monitor

export NDI_SDK_DIR=/opt/ndi_sdk
sudo ./scripts/install.sh
sudo reboot
```

## After Reboot

Expected behavior:

- HDMI shows a standby screen with the Web UI URL, hostname, IP address, and QR code
- `ndi-web.service` is active
- `getty@tty1.service` is disabled
- the Web UI is reachable at `http://<pi-ip>:8080/`

Check:

```bash
sudo systemctl status ndi-web.service ndi-standby.service getty@tty1.service
curl http://127.0.0.1:8080/healthz
```

## First-Time Configuration

1. open the Web UI
2. go to `/sources`
3. run discovery
4. choose the desired source
5. optionally click `Use and start`
6. enable `autoStart` in `/settings` if the Pi should reconnect automatically after boot

## Production Paths

- install root: `/opt/ndi-monitor`
- config: `/etc/ndi-receiver/config.yaml`
- status snapshot: `/var/lib/ndi-receiver/receiver-status.json`
- logs: `/var/log/ndi-receiver/`

## Service Environment

`ndi-web.service` currently sets:

- `NDI_MONITOR_CONFIG_PATH=/etc/ndi-receiver/config.yaml`
- `NDI_MONITOR_RUNTIME_ROOT=/var/lib/ndi-receiver`
- `NDI_MONITOR_LOG_DIR=/var/log/ndi-receiver`
- `NDI_MONITOR_RECEIVER_BINARY=/opt/ndi-monitor/apps/receiver/build/ndi-receiver`
- `XDG_RUNTIME_DIR=/run/ndi-monitor`
- `SDL_VIDEODRIVER=kmsdrm`
- `SDL_AUDIODRIVER=alsa`
- `LD_LIBRARY_PATH=/opt/ndi-monitor/lib`

## HDMI / DRM / Permissions

The receiver uses SDL2 with KMSDRM and therefore needs access to:

- `/dev/dri/*`
- ALSA/HDMI audio devices

The system user `ndi-monitor` is created with these groups:

- `video`
- `audio`
- `render`

## Stub / Demo Build without the SDK

For development without the real NDI SDK:

```bash
export ALLOW_STUB_BACKEND=1
export NDI_RECEIVER_STUB_SOURCE="Demo Source"
sudo ./scripts/install.sh
```

For stub builds, `install.sh` skips the NDI runtime copy when no SDK directory is present.

This is for development only, not for production.

## Update

```bash
cd /home/pi/ndi-monitor
git pull
export NDI_SDK_DIR=/opt/ndi_sdk
sudo ./scripts/update.sh
```

## Uninstall

```bash
sudo ./scripts/uninstall.sh
```

With full cleanup:

```bash
sudo PURGE=1 ./scripts/uninstall.sh
```

`uninstall.sh` also re-enables `getty@tty1.service` and restores the backed-up `/boot/cmdline.txt` if available.

## If There Is No Picture During Boot

1. `sudo systemctl status ndi-standby.service ndi-web.service`
2. `sudo journalctl -u ndi-web.service -b`
3. `curl http://127.0.0.1:8080/api/status`
4. inspect `/boot/cmdline.txt`
5. `ls /dev/dri`

In problematic HDMI environments you may still need deployment-specific KMS settings in `/boot/config.txt`, for example:

- `hdmi_force_hotplug=1`
- a fixed HDMI mode

Those settings intentionally remain outside the application itself.

## Licensing Note

The current Linux NDI SDK license explicitly excludes fixed-purpose appliances and embedded/Linux devices from the standard license. A production Raspberry Pi appliance may therefore require a separate commercial agreement with NDI.
