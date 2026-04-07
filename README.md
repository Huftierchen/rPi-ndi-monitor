# NDI Monitor fuer Raspberry Pi 5

`ndi-monitor` ist ein Monorepo fuer eine headless NDI-Appliance auf Raspberry Pi 5. Der Pi bootet ohne Desktop in `multi-user.target`, zeigt im Idle-Zustand einen HDMI-Standby-Screen mit Web-UI-URL, Hostname, IP und QR-Code und gibt nach Start genau einen ausgewaehlten NDI-Stream fullscreen ueber KMS/DRM aus.

Die Steuerung laeuft ueber eine lokale Web-Oberflaeche. Node.js ist nur die Control Plane. Der eigentliche NDI-Empfang und das Rendering passieren in einer nativen C++-Komponente.

## Status

Der aktuelle Stand ist produktionsnah und auf dem Zielgeraet verifiziert:

- Web-UI, REST-API und SSE laufen unter `ndi-web.service`
- Discovery, Source-Switch, Start, Stop, Restart und Reconnect funktionieren
- der Receiver laeuft als Child-Prozess des Web-Dienstes
- HDMI-Standby-Screen mit QR-Code ersetzt auf `tty1` den normalen Login-Prompt
- echte NDI-Wiedergabe wurde auf diesem Pi gegen einen TouchDesigner-Stream verifiziert
- Logs werden persistent geschrieben, der Receiver-Status laeuft live ueber Prozess-Events

Aktuell verifiziertes Git-Setup in diesem Repo:

- `main` ist sauber
- GitHub-Remote: `https://github.com/Huftierchen/rPi5-ndi-monitor.git`

## Projektstruktur

- `apps/web`: Fastify + TypeScript fuer SSR-UI, REST-API, SSE, Config, Status und Prozessaufsicht
- `apps/receiver`: C++17 + CMake fuer NDI Discovery, NDI-Empfang, Reconnect und HDMI-Rendering
- `config/`: Default-Konfiguration
- `docs/`: Architektur-, Deployment- und Betriebsdokumentation
- `scripts/`: Install-, Update-, Uninstall- und Standby-Skripte
- `systemd/`: `ndi-web.service`, `ndi-standby.service`, `tmpfiles`

## Architektur in Kurzform

- Node.js rendert keine Video-Frames
- `ndi-web.service` ist der einzige Hauptdienst
- der Web-Dienst verwaltet den nativen Receiver als Child-Prozess
- Discovery laeuft als separater nativer CLI-Aufruf
- Status kommt primaer aus nativen Live-Ereignissen; die Statusdatei bleibt als letzter persistierter Snapshot
- `ndi-standby.service` schreibt beim Boot den Appliance-Screen auf `tty1`
- der Web-Supervisor zeichnet denselben Standby-Screen nach `Stop` oder Receiver-Exit erneut

Mehr Details: [ARCHITECTURE.md](/home/pi/ndi-monitor/docs/ARCHITECTURE.md)

## Was die Appliance heute kann

- Dashboard mit Receiver-, Verbindungs-, Video-, Audio- und Fehlerstatus
- NDI-Source-Discovery aus der Web-UI
- Quelle auswaehlen und optional direkt starten
- YAML-Konfiguration persistent in `/etc/ndi-receiver/config.yaml`
- Auto-Start und Reconnect-Backoff
- Live-Status ueber SSE plus periodisches Browser-Fallback
- Downloadbare Web- und Receiver-Logs
- headless HDMI-Betrieb ohne X11 oder Wayland

## Wichtige Seiten

- `/`: Dashboard und Sofort-Steuerung
- `/sources`: Discovery, Source-Auswahl, "Use selected source", "Use and start"
- `/settings`: alle persistenten Laufzeitoptionen
- `/logs`: Web- und Receiver-Logs
- `/about`: Kurzbeschreibung der Appliance

## Wichtige Laufzeitpfade

- Konfiguration: `/etc/ndi-receiver/config.yaml`
- Status-Snapshot: `/var/lib/ndi-receiver/receiver-status.json`
- Web-Log: `/var/log/ndi-receiver/web.log`
- Receiver-Log: `/var/log/ndi-receiver/receiver.log`
- Installation: `/opt/ndi-monitor`

## Schnellstart auf dem Pi

Vollstaendige Schrittfolge: [DEPLOYMENT_PI5.md](/home/pi/ndi-monitor/docs/DEPLOYMENT_PI5.md)

Kurzform:

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

Nach dem Reboot:

- HDMI zeigt den Standby-Screen mit Web-UI-URL, Hostname, IP und QR-Code
- Web-UI ist unter `http://<pi-ip>:8080/` erreichbar
- auf `/sources` die gewuenschte NDI-Quelle auswaehlen
- optional `autoStart` in `/settings` aktivieren

## NDI SDK

Das NDI SDK wird bewusst nicht ins Repo committed.

Erwarteter lokaler SDK-Pfad:

- `/opt/ndi_sdk`

Offizieller Linux-SDK-Tarball:

- `https://downloads.ndi.tv/SDK/NDI_SDK_Linux/Install_NDI_SDK_v6_Linux.tar.gz`

Die Install-Skripte erwarten:

- Header unter `include/Processing.NDI.Lib.h`
- ARM64-Laufzeitbibliotheken unter `lib/aarch64-rpi4-linux-gnueabi`

Der Deploy-Pfad kopiert die benoetigten `libndi.so*`-Dateien nach `/opt/ndi-monitor/lib`.

## Build lokal

### Voraussetzungen

- Node.js 22+
- Corepack
- CMake 3.16+
- `g++`
- `libsdl2-dev`
- `libasound2-dev`
- optional NDI SDK fuer den echten Build

### Web-App

```bash
corepack prepare pnpm@10.7.1 --activate
corepack pnpm install
corepack pnpm --filter @ndi-monitor/web typecheck
corepack pnpm --filter @ndi-monitor/web build
corepack pnpm --filter @ndi-monitor/web test
```

### Receiver mit echtem SDK

```bash
cmake -S apps/receiver -B apps/receiver/build \
  -DNDI_SDK_DIR=/opt/ndi_sdk \
  -DRECEIVER_ALLOW_STUB_BACKEND=OFF
cmake --build apps/receiver/build -j"$(nproc)"
ctest --test-dir apps/receiver/build --output-on-failure
```

### Stub-Build ohne SDK

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

## Web-UI Bedienung

### Dashboard

- zeigt den aktuellen Zustand des Receivers
- bietet Sofortaktionen fuer Start, Stop, Restart und Reconnect
- zeigt die aktuell konfigurierte Quelle und Video-Parameter

### Sources

- startet Discovery automatisch beim Oeffnen
- kann Discovery manuell oder per Auto-Refresh ausfuehren
- speichert die gewaehlte Quelle persistent
- kann "Use selected source" oder "Use and start"

### Settings

Einstellbar sind aktuell:

- `server.host`
- `server.port`
- `receiver.sourceName`
- `receiver.audioEnabled`
- `receiver.scaleMode`
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

- zeigt Web-Logs
- zeigt Receiver-Logs
- bietet Download der Logdateien

## REST-API

### Endpunkte

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

### Beispiel: Source setzen

```bash
curl -X POST http://pi-host:8080/api/control/switch-source \
  -H 'content-type: application/json' \
  -d '{"sourceName":"DESKTOP-DS7KLEC (TouchDesigner)"}'
```

### Beispiel: Auto-Start aktivieren

```bash
curl -X PUT http://pi-host:8080/api/settings \
  -H 'content-type: application/json' \
  -d '{
    "receiver": {
      "sourceName": "DESKTOP-DS7KLEC (TouchDesigner)",
      "audioEnabled": false,
      "scaleMode": "contain",
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

## Services und Skripte

### systemd

- `ndi-web.service`: Web-Control-Plane und Child-Supervisor
- `ndi-standby.service`: HDMI-Standby-Screen auf `tty1`

### Skripte

- `scripts/install.sh`: Build, Install, Runtime-Libs, Services, Console-Umschaltung
- `scripts/update.sh`: Neuinstallation ueber vorhandenen Checkout
- `scripts/uninstall.sh`: entfernt Dienste und optional Konfig/Logs
- `scripts/standby-screen.sh`: schreibt den Standby-Text auf `tty1`

## Appliance- / Bootverhalten

Beim Installieren wird:

- `getty@tty1.service` deaktiviert
- `console=tty1` aus `/boot/cmdline.txt` entfernt
- `quiet loglevel=3 vt.global_cursor_default=0` hinzugefuegt
- `ndi-standby.service` aktiviert

Das sorgt dafuer, dass der normale Linux-Login-Prompt nicht mehr ueber dem HDMI-Bild liegt.

Wichtig:

- fuer die Boot-Console-Aenderung ist nach der ersten Installation ein Reboot noetig
- waehrend der Receiver nicht laeuft, zeigt `tty1` den Standby-Screen mit Web-UI-Adresse

## Exit-Codes des nativen Receivers

- `0`: sauber beendet
- `2`: ungueltige CLI-Argumente
- `3`: Initialisierungsfehler
- `4`: Quelle nicht verfuegbar / Disconnect ohne erfolgreiche Wiederherstellung
- `5`: NDI SDK im Produktionspfad nicht verfuegbar
- `6`: Renderer-Initialisierung fehlgeschlagen
- `7`: fataler Empfangsfehler

## Troubleshooting

### Web-UI laedt, aber Buttons machen nichts

- Browser hart neu laden
- `Ctrl+Shift+R` oder mobilen Tab komplett neu oeffnen
- `GET /healthz` pruefen
- `tail -f /var/log/ndi-receiver/web.log`

### Discovery findet keine Quellen

- `/sources` oeffnen und Discovery manuell ausfuehren
- pruefen, ob der Sender wirklich NDI im LAN announced
- `avahi-daemon` und Netzverbindung pruefen
- `./apps/receiver/build/ndi-receiver discover --json --timeout-ms 4000`

### Receiver ist "running", aber HDMI bleibt leer

- `sudo systemctl status ndi-web.service`
- `cat /var/lib/ndi-receiver/receiver-status.json` fuer den letzten persistierten Snapshot
- `tail -f /var/log/ndi-receiver/receiver.log`
- `sudo journalctl -u ndi-web.service -b`
- pruefen, ob `/dev/dri/*` vorhanden ist
- nach Erstinstallation einmal rebooten

### Auf HDMI steht noch ein Login-Prompt

- `sudo systemctl status getty@tty1.service ndi-standby.service`
- pruefen, ob `/boot/cmdline.txt` noch `console=tty1` enthaelt
- nach dem ersten Installationslauf rebooten

## Betriebsdokumentation

- Deployment: [DEPLOYMENT_PI5.md](/home/pi/ndi-monitor/docs/DEPLOYMENT_PI5.md)
- Betrieb: [OPERATIONS.md](/home/pi/ndi-monitor/docs/OPERATIONS.md)
- Architektur: [ARCHITECTURE.md](/home/pi/ndi-monitor/docs/ARCHITECTURE.md)

## Offene Punkte und Risiken

- HDMI-Audio ist strukturell vorhanden, sollte aber auf dem Zielgeraet mit echtem Audio-Signal separat getestet werden
- SDL2/KMSDRM kann je nach Display-Handshake, Kabel und Firmware empfindlich reagieren
- fuer harte Produktion waeren Log-Rotation und eventuell ein dedizierter Health-/Watchdog-Mechanismus noch sinnvoll
- die aktuelle NDI-SDK-Lizenz schliesst fixed-purpose Appliances und Embedded-/Linux-Geraete in der Standardlizenz explizit aus; fuer ein kommerzielles Produkt kann ein separater Vertrag mit NDI erforderlich sein
