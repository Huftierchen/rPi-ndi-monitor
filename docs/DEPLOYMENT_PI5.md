# Deployment on Raspberry Pi

## Target System

- Raspberry Pi 5 as the intended production target
- Raspberry Pi OS Lite (Bookworm or Trixie) or another Debian/Pi-OS compatible ARM64 system
- HDMI display connected directly
- no desktop, no X11, no Wayland
- LAN network access

Note: the current verified runtime box in this repository is a Raspberry Pi 4, but the deployment shape stays the same.

## What the Install Path Does

`install.sh` (at the repo root) builds and installs the full stack:

- enables `pnpm` via Corepack
- installs the NDI HX runtime codecs (`ffmpeg`, `libavcodec-extra`) via `apt-get`
- builds the web app and native receiver
- copies the repo to `/opt/ndi-monitor`
- copies NDI runtime libraries to `/opt/ndi-monitor/lib` for real SDK builds
- creates `/etc/ndi-receiver`, `/var/lib/ndi-receiver`, `/var/log/ndi-receiver`, and `/run/ndi-monitor`
- installs `ndi-web.service` and `ndi-standby.service`
- disables `getty@tty1.service`
- removes `console=tty1` from the kernel cmdline (auto-detected: `/boot/firmware/cmdline.txt` on Bookworm/Trixie, legacy `/boot/cmdline.txt` as fallback; override with `BOOT_CMDLINE=...`)
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

Raspberry Pi OS Trixie may already ship Node 22 in apt — check with `apt-cache policy nodejs`. If the candidate is older than 22 (Debian 13 base ships Node 20), install it from NodeSource, which supports Trixie and bundles Corepack:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo corepack enable
node --version   # expect v22.x
```

## NDI HX Codecs

NDI HX sources are H.264/H.265 with AAC audio (unlike full NDI/SpeedHQ). The NDI
runtime decodes them through the system `libavcodec` at runtime. Debian/Pi OS only
ships the H.264/H.265/AAC decoders in the `libavcodec-extra` package, so without it
HX sources fail on screen with `NDI Video decoder not found` while full NDI sources
still work.

`install.sh` therefore installs the runtime codecs automatically:

```bash
sudo apt-get install -y ffmpeg libavcodec-extra
```

If you manage these packages yourself, skip the automatic step with:

```bash
sudo INSTALL_RUNTIME_CODECS=0 ./install.sh
```

This was verified against the NDI v6 Linux SDK on Raspberry Pi OS Bookworm. See
`docs/OPERATIONS.md` for the fallback if a different NDI/FFmpeg combination still
reports a missing decoder.

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
git clone https://github.com/Huftierchen/rPi-ndi-monitor.git /home/pi/ndi-monitor
cd /home/pi/ndi-monitor

# Pass NDI_SDK_DIR through sudo explicitly — sudo resets the environment by
# default, so a plain `export` before `sudo ./install.sh` would be dropped and
# you would silently get a stub build without real NDI receive.
sudo env NDI_SDK_DIR=/opt/ndi_sdk ./install.sh
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

### Output resolution

- `display.outputMode`: `auto` (use native display mode) or `<W>x<H>@<Hz>` such as
  `1920x1080@60`. A concrete value performs a real DRM modeset via SDL2 KMSDRM; an
  unavailable value falls back to the native mode. Available modes are reported by the
  running receiver and shown in the web UI after the first start.

## Stub / Demo Build without the SDK

For development without the real NDI SDK:

```bash
export ALLOW_STUB_BACKEND=1
export NDI_RECEIVER_STUB_SOURCE="Demo Source"
sudo ./install.sh
```

For stub builds, `install.sh` skips the NDI runtime copy when no SDK directory is present.

This is for development only, not for production.

## Update

```bash
cd /home/pi/ndi-monitor
export NDI_SDK_DIR=/opt/ndi_sdk
sudo ./update.sh
```

`update.sh` runs `git pull --ff-only` itself (as the repo owner, not as root). If you want to update from already-checked-out code without pulling, set `SKIP_GIT_PULL=1`:

```bash
sudo SKIP_GIT_PULL=1 ./update.sh
```

The standby screen tries to load a larger Terminus console font and silently falls back to the default if none is available. For the larger font, install the console font packages once:

```bash
sudo apt-get install -y console-setup xfonts-terminus
```

## Uninstall

```bash
sudo ./uninstall.sh
```

With full cleanup:

```bash
sudo PURGE=1 ./uninstall.sh
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
