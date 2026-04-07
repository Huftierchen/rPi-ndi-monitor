# NDI Monitor fuer Raspberry Pi 5

`ndi-monitor` ist ein produktionsnahes Monorepo fuer einen headless NDI-Empfaenger auf Raspberry Pi 5. Der Pi bootet in `multi-user.target`, zeigt genau einen auswaehlbaren NDI-Stream fullscreen per HDMI an und wird ueber eine lokale Web-Oberflaeche gesteuert.

## Projektstruktur

- `apps/web`: Fastify + TypeScript fuer UI, REST-API, SSE, Config, Status und Prozessaufsicht
- `apps/receiver`: C++17 + CMake fuer Discovery, NDI-Empfang und HDMI-Rendering
- `config/`: Default-Konfiguration
- `docs/`: Architektur-, Deployment- und Betriebsdokumentation
- `scripts/`: Install-, Update- und Uninstall-Skripte
- `systemd/`: Beispiel-Units und tmpfiles

## Architektur in Kurzform

- Node.js rendert keine Video-Frames
- `ndi-web.service` ist der einzige `systemd`-Hauptdienst
- der Web-Dienst verwaltet den nativen Receiver als Child-Prozess
- Discovery laeuft als separater nativer Unterbefehl
- Status kommt ueber Statusdatei plus Live-Events aus dem Receiver

Die Entscheidung fuer den Receiver als Child-Prozess ist bewusst: nur eine Control Plane, keine konkurrierenden Restart-Mechanismen, klare Ownership fuer Logs und Status.

Mehr Details: [ARCHITECTURE.md](/home/pi/ndi-monitor/docs/ARCHITECTURE.md)

## Features

- Dashboard mit Receiver-/Video-/Audio-/Fehlerstatus
- NDI-Discovery ueber nativen CLI-Aufruf
- Start, Stop, Restart, Reconnect, Source Switch
- YAML-Konfiguration mit strikter Validierung
- SSE fuer Live-Status und Live-Logs
- Receiver-Statusdatei fuer robuste Snapshot-Auswertung
- `systemd`-Deployment fuer Raspberry Pi OS Lite
- Install-/Update-/Uninstall-Skripte
- Unit-Tests fuer Web-Config/Status und Basis-Test fuer den nativen StatusWriter

## Web-UI Seiten

- `/`
- `/sources`
- `/settings`
- `/logs`
- `/about`

## REST-API

### Allgemein

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
- `GET /api/events` (SSE)

### Beispiel: Settings aktualisieren

```bash
curl -X PUT http://pi-host:8080/api/settings \
  -H 'content-type: application/json' \
  -d '{
    "receiver": {
      "sourceName": "Studio Sender",
      "audioEnabled": true,
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

## Konfiguration

Default: [default.yaml](/home/pi/ndi-monitor/config/default.yaml)

Wichtige Runtime-Pfade:

- `/etc/ndi-receiver/config.yaml`
- `/var/lib/ndi-receiver/receiver-status.json`
- `/var/log/ndi-receiver/web.log`
- `/var/log/ndi-receiver/receiver.log`

## Build lokal

### Voraussetzungen

- Node.js 22+
- Corepack / pnpm
- CMake 3.16+
- `g++`
- optional `libsdl2-dev`
- optional NDI SDK fuer den echten Produktionsbuild

### Web-App

```bash
corepack prepare pnpm@10.7.1 --activate
pnpm install
pnpm --filter @ndi-monitor/web build
pnpm --filter @ndi-monitor/web test
```

### Receiver

Produktionsbuild mit NDI SDK:

```bash
cmake -S apps/receiver -B apps/receiver/build -DNDI_SDK_DIR=/opt/ndi_sdk -DRECEIVER_ALLOW_STUB_BACKEND=OFF
cmake --build apps/receiver/build -j"$(nproc)"
ctest --test-dir apps/receiver/build --output-on-failure
```

Stub-/Demo-Build ohne SDK:

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

## Deployment auf dem Pi

Schritt-fuer-Schritt: [DEPLOYMENT_PI5.md](/home/pi/ndi-monitor/docs/DEPLOYMENT_PI5.md)

Kurzer Weg:

```bash
export NDI_SDK_DIR=/opt/ndi_sdk
sudo ./scripts/install.sh
```

## Screenshots

Der aktuelle Stand liefert eine funktionale SSR-Oberflaeche fuer:

- Dashboard mit Statuskarten und Steuerknopfen
- Sources-Seite mit Discovery-Liste und Source-Auswahl
- Settings-Formular
- Live-Logansicht

Fuer README-Zwecke muessen echte Screenshots noch auf dem Zielgeraet erzeugt werden.

## Exit-Codes des nativen Receivers

- `0`: sauber beendet
- `2`: ungueltige CLI-Argumente
- `3`: Initialisierungsfehler
- `4`: Quelle nicht verfuegbar / Disconnect ohne erfolgreiche Wiederherstellung
- `5`: NDI SDK in Produktionspfad nicht verfuegbar
- `6`: Renderer-Initialisierung fehlgeschlagen
- `7`: fataler Empfangsfehler

## Offene Punkte und Risiken

- Die echte NDI-SDK-Integration ist strukturell vorbereitet, aber ohne lokales SDK hier nicht verifiziert
- Audio ueber HDMI ist als Architekturpfad vorgesehen, muss auf dem Zielgeraet mit realen Audio-Frames validiert werden
- SDL2/KMSDRM auf Raspberry Pi 5 kann firmware- und displayabhaengige Besonderheiten zeigen
- Fuer einen harten Produktionsbetrieb sollten Rotation/Pruning fuer NDJSON-Logdateien noch konsequent nachgezogen werden
- `pnpm-lock.yaml` fehlt noch, weil die Abhaengigkeiten in diesem leeren Workspace erst lokal installiert und eingefroren werden muessen

## Lokales Testen

1. Web-Abhaengigkeiten installieren und Web-App bauen
2. Receiver im Stub-Modus bauen
3. `NDI_RECEIVER_STUB_SOURCE` setzen
4. Web-Dienst starten:

```bash
export NDI_RECEIVER_STUB_SOURCE="Demo Source"
export NDI_MONITOR_RECEIVER_BINARY="$PWD/apps/receiver/build/ndi-receiver"
pnpm --filter @ndi-monitor/web dev
```

5. Im Browser `http://<pi-ip>:8080` oeffnen
6. Auf `/sources` Discovery ausfuehren und Quelle waehlen
7. Receiver starten

## Naechste praktische Schritte

1. `pnpm install` und TypeScript-Build laufen lassen
2. Receiver lokal im Stub-Modus bauen
3. Web- und Receiver-Ende-zu-Ende auf dem Pi pruefen
4. Danach mit echtem NDI SDK verifizieren
