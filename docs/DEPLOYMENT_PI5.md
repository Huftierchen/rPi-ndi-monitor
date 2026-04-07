# Deployment auf Raspberry Pi 5

## Zielsystem

- Raspberry Pi 5
- Raspberry Pi OS Lite oder Debian/Pi-OS kompatibles ARM64-System
- HDMI-Display direkt angeschlossen
- kein Desktop, kein X11, kein Wayland
- Netzwerkzugriff im LAN

## Was der Installationspfad heute macht

`scripts/install.sh` baut und installiert den kompletten Stack:

- aktiviert `pnpm` per Corepack
- baut Web-App und nativen Receiver
- kopiert das Repo nach `/opt/ndi-monitor`
- kopiert NDI-Laufzeitbibliotheken nach `/opt/ndi-monitor/lib`
- legt `/etc/ndi-receiver`, `/var/lib/ndi-receiver`, `/var/log/ndi-receiver` und `/run/ndi-monitor` an
- installiert `ndi-web.service` und `ndi-standby.service`
- deaktiviert `getty@tty1.service`
- entfernt `console=tty1` aus `/boot/cmdline.txt`
- schreibt einen HDMI-Standby-Screen auf `tty1`

Wichtig:

- nach der ersten Installation ist ein Reboot sinnvoll und fuer die Boot-Console-Umstellung empfohlen

## Benötigte Pakete

```bash
sudo apt-get update
sudo apt-get install -y \
  git rsync curl ca-certificates build-essential cmake pkg-config \
  libsdl2-dev libasound2-dev ripgrep avahi-daemon
```

Optional, aber auf dem Pi nuetzlich:

```bash
sudo apt-get install -y gh git-lfs
```

Node.js 22+ wird benoetigt. Die Projekt-Skripte aktivieren `pnpm` ueber Corepack.

## NDI SDK vorbereiten

Das Projekt commitet das NDI SDK absichtlich nicht ins Repo. Fuer den echten Produktionsbuild muss das SDK lokal vorliegen, typischerweise unter:

- `/opt/ndi_sdk`

Offizieller Linux-SDK-Tarball:

- `https://downloads.ndi.tv/SDK/NDI_SDK_Linux/Install_NDI_SDK_v6_Linux.tar.gz`

Auf ARM64 wird aktuell erwartet:

- Header: `/opt/ndi_sdk/include/Processing.NDI.Lib.h`
- Laufzeitbibliotheken: `/opt/ndi_sdk/lib/aarch64-rpi4-linux-gnueabi`

## Frische Installation

```bash
git clone https://github.com/Huftierchen/rPi5-ndi-monitor.git /home/pi/ndi-monitor
cd /home/pi/ndi-monitor

export NDI_SDK_DIR=/opt/ndi_sdk
sudo ./scripts/install.sh
sudo reboot
```

## Nach dem Reboot

Erwartetes Verhalten:

- auf HDMI erscheint ein Standby-Screen mit der Web-UI-Adresse
- `ndi-web.service` ist aktiv
- `getty@tty1.service` ist deaktiviert
- die Web-UI ist unter `http://<pi-ip>:8080/` erreichbar

Pruefen:

```bash
sudo systemctl status ndi-web.service ndi-standby.service getty@tty1.service
curl http://127.0.0.1:8080/healthz
```

## Erstkonfiguration

1. Web-UI oeffnen
2. `/sources` aufrufen
3. Discovery ausfuehren
4. gewuenschte Quelle waehlen
5. optional `Use and start`
6. in `/settings` `autoStart` aktivieren, wenn der Pi nach jedem Boot automatisch verbinden soll

## Produktionspfade

- Installation: `/opt/ndi-monitor`
- Konfiguration: `/etc/ndi-receiver/config.yaml`
- Status-Snapshot: `/var/lib/ndi-receiver/receiver-status.json`
- Logs: `/var/log/ndi-receiver/`

## Service-Umgebung

`ndi-web.service` setzt aktuell:

- `NDI_MONITOR_CONFIG_PATH=/etc/ndi-receiver/config.yaml`
- `NDI_MONITOR_RUNTIME_ROOT=/var/lib/ndi-receiver`
- `NDI_MONITOR_LOG_DIR=/var/log/ndi-receiver`
- `NDI_MONITOR_RECEIVER_BINARY=/opt/ndi-monitor/apps/receiver/build/ndi-receiver`
- `XDG_RUNTIME_DIR=/run/ndi-monitor`
- `SDL_VIDEODRIVER=kmsdrm`
- `SDL_AUDIODRIVER=alsa`
- `LD_LIBRARY_PATH=/opt/ndi-monitor/lib`

## HDMI / DRM / Rechte

Der Receiver nutzt SDL2 mit KMSDRM und braucht Zugriff auf:

- `/dev/dri/*`
- ALSA-/HDMI-Audio

Der Systembenutzer `ndi-monitor` wird mit diesen Gruppen angelegt:

- `video`
- `audio`
- `render`

## Stub-/Demo-Build ohne SDK

Fuer reine Entwicklung ohne echtes NDI SDK:

```bash
export ALLOW_STUB_BACKEND=1
export NDI_RECEIVER_STUB_SOURCE="Demo Source"
sudo ./scripts/install.sh
```

Das ist nur fuer Entwicklung gedacht, nicht fuer Produktion.

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

Mit kompletter Bereinigung:

```bash
sudo PURGE=1 ./scripts/uninstall.sh
```

`uninstall.sh` stellt ausserdem `getty@tty1.service` wieder her und restauriert, falls vorhanden, die gesicherte `/boot/cmdline.txt`.

## Wenn beim Boot noch kein Bild erscheint

1. `sudo systemctl status ndi-standby.service ndi-web.service`
2. `sudo journalctl -u ndi-web.service -b`
3. `curl http://127.0.0.1:8080/api/status`
4. `/boot/cmdline.txt` pruefen
5. `ls /dev/dri`

In problematischen HDMI-Umgebungen koennen deployment-spezifische KMS-Einstellungen noetig sein, zum Beispiel in `/boot/config.txt`:

- `hdmi_force_hotplug=1`
- fester HDMI-Modus

Diese Parameter bleiben bewusst ausserhalb des Anwendungscodes.

## Lizenzhinweis

Die aktuelle NDI-SDK-Lizenz fuer Linux schliesst fixed-purpose Appliances und Embedded-/Linux-Geraete in der Standardlizenz explizit aus. Fuer ein produktisiertes Raspberry-Pi-Appliance-Modell kann deshalb ein separater kommerzieller Vertrag mit NDI erforderlich sein.
