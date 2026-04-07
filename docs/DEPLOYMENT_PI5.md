# Deployment auf Raspberry Pi 5

## Zielsystem

- Raspberry Pi 5
- Raspberry Pi OS Lite / Bookworm oder neuer
- ARM64
- HDMI-Display direkt angeschlossen
- Multi-user target, kein Desktop

## Benötigte Pakete

```bash
sudo apt-get update
sudo apt-get install -y \
  git rsync curl ca-certificates build-essential cmake pkg-config \
  libsdl2-dev libasound2-dev ripgrep
```

Node.js 22+ wird benötigt. Die Projekt-Skripte aktivieren `pnpm` per Corepack.

## NDI SDK vorbereiten

Das Projekt commitet das NDI SDK absichtlich nicht ins Repo. Fuer einen Produktionsbuild muss das SDK lokal vorliegen, zum Beispiel unter:

- `/opt/ndi_sdk`
- `${HOME}/third_party/ndi_sdk`

Erwartung:

- Header unter `Include/Processing.NDI.Lib.h`
- ARM64-Bibliothek unter `Lib/aarch64-linux-gnu/` oder aehnlichem Unterpfad

Build mit SDK:

```bash
export NDI_SDK_DIR=/opt/ndi_sdk
sudo ./scripts/install.sh
```

Lokaler Demo-/Stub-Build ohne SDK:

```bash
export ALLOW_STUB_BACKEND=1
export NDI_RECEIVER_STUB_SOURCE="Demo Source"
sudo ./scripts/install.sh
```

## Installation

```bash
git clone <repo-url> /home/pi/ndi-monitor
cd /home/pi/ndi-monitor
export NDI_SDK_DIR=/opt/ndi_sdk
sudo ./scripts/install.sh
```

Danach:

- Service: `ndi-web.service`
- Web-UI: `http://<pi-ip>:8080`
- Konfiguration: `/etc/ndi-receiver/config.yaml`
- Statusdatei: `/var/lib/ndi-receiver/receiver-status.json`
- Logs: `/var/log/ndi-receiver/`

## HDMI / DRM / Rechte

Der Receiver nutzt SDL2 mit KMSDRM und laeuft ohne X11/Wayland. Dafuer braucht der Dienst Zugriff auf:

- `/dev/dri/*`
- Audio-Ausgabe ueber HDMI bzw. ALSA

Der Systembenutzer `ndi-monitor` wird durch das Install-Skript mit den Gruppen `video`, `audio` und `render` angelegt.

## Bootverhalten

- `systemd` startet `ndi-web.service` in `multi-user.target`
- der Web-Dienst startet den nativen Receiver als Child-Prozess
- `Restart=on-failure` stellt den Web-Dienst nach Absturz wieder her

## Wenn das Display beim Boot noch nicht sauber erkannt wird

KMS/DRM auf Headless-Systemen ist empfindlich gegen HDMI-Handshakes. Falls beim Boot kein Bild erscheint:

1. `sudo journalctl -u ndi-web.service -b`
2. `cat /var/lib/ndi-receiver/receiver-status.json`
3. `/boot/firmware/config.txt` auf erzwungene HDMI-Erkennung pruefen
4. sicherstellen, dass `vc4-kms-v3d` aktiv ist

In problematischen Installationen hilft haeufig:

- `hdmi_force_hotplug=1`
- ein fixer HDMI-Modus in `/boot/firmware/config.txt`

Diese Einstellungen sind deployment-spezifisch und bleiben deshalb bewusst ausserhalb des Anwendungscodes.
