# Architektur

## Zielbild

Das System ist als Headless-Appliance fuer Raspberry Pi 5 auf Raspberry Pi OS Lite ausgelegt. Es gibt genau eine Control Plane:

- `apps/web`: Fastify-basierter Node.js-Dienst fuer UI, REST-API, SSE, Konfiguration, Logging und Prozessaufsicht
- `apps/receiver`: native C++17-Anwendung fuer NDI Discovery, NDI-Empfang, HDMI-Rendering und optionale Audioausgabe

Der Web-Dienst startet als Hauptprozess per `systemd` und verwaltet den nativen Receiver als Child-Prozess. Dadurch bleibt die Bedienlogik an einer Stelle, Konflikte durch zwei konkurrierende Manager entfallen, und Status/Logs lassen sich zentral ueber die Web-Oberflaeche exponieren.

## Architekturentscheidungen

### Fastify statt Express

Fastify wurde gewaehlt, weil es auf einem Pi leichtgewichtig bleibt, gute Typisierung mit TypeScript bietet und ohne schweres Frontend-Framework eine kompakte SSR- und API-Schicht ermoeglicht.

### SSE statt WebSocket

Der Statusfluss ist serverseitig dominiert: Status, Logs, Discovery-Ergebnisse. Dafuer reicht Server-Sent Events aus, ist im Browser trivial und reduziert Komplexitaet gegenueber bidirektionalen WebSockets.

### YAML statt JSON fuer Runtime-Konfiguration

Die Zielumgebung ist appliance-artig und wird haeufig direkt auf dem Geraet oder per SSH angepasst. YAML ist fuer Betreiber lesbarer, solange Validierung strikt erzwungen wird. Die Anwendung uebernimmt niemals ungueltige Konfigurationswerte stillschweigend.

### Receiver als Child-Prozess des Web-Dienstes

Diese Entscheidung folgt der gewuenschten "single control plane". Vorteile:

- eine Stelle fuer Start/Stop/Reconnect
- keine Race Conditions zwischen separatem API- und Receiver-Service
- Exit-Codes und Logs koennen direkt verarbeitet werden
- automatische Restart-Strategie kann kontextabhaengig erfolgen

`systemd` ueberwacht nur den Web-Dienst. Der Web-Dienst ueberwacht den Receiver.

### Discovery als nativer CLI-Unterbefehl

Discovery wird mit einem kurzen separaten nativen Prozess (`receiver discover --json`) ausgefuehrt. Dadurch wird ein laufender Wiedergabeprozess nicht gestoert, Node.js muss das NDI-SDK nicht selbst linken, und die Schnittstelle bleibt robust und testbar.

### Statusmodell: Statusdatei plus strukturierte Prozesslogs

Der Receiver schreibt periodisch eine JSON-Statusdatei und emitttiert strukturierte Log-/Statusereignisse auf `stdout` bzw. `stderr`. Der Web-Dienst nutzt beides:

- Statusdatei fuer den aktuellsten Snapshot
- stdout/stderr fuer Live-Logstream, Fehler und Exit-Diagnose

## Laufzeitdaten

Produktionspfade:

- Konfiguration: `/etc/ndi-receiver/config.yaml`
- persistenter Zustand: `/var/lib/ndi-receiver/`
- Logs: `/var/log/ndi-receiver/`

Entwicklungsmodus faellt automatisch auf repo-lokale Laufzeitpfade unter `runtime/` zurueck.

## Receiver-Aufbau

Der native Receiver ist in klar getrennte Komponenten zerlegt:

- CLI-Parser fuer `run` und `discover`
- Logger mit Text- und optionalem JSON-Format
- StatusWriter fuer atomische JSON-Snapshots
- NDI-Backend-Schnittstelle fuer echte SDK-Integration oder Stub-Build
- Renderer-Schnittstelle fuer SDL2 KMSDRM oder Headless-Fallback im Stub-Modus
- ReceiverApp fuer Reconnect-Loop, Signal-Handling und Exit-Codes

## Fehler- und Restart-Verhalten

- Wenn eine Quelle verschwindet, bleibt der Receiver-Prozess aktiv und faehrt den Reconnect-Backoff
- Wenn der Receiver-Prozess unerwartet endet, entscheidet der Web-Supervisor anhand der Konfiguration ueber Neustart
- `systemd` startet den Web-Dienst bei Absturz erneut
- `SIGTERM` fuehrt zu geordnetem Shutdown von Web-Dienst und Child-Prozess

## Authentifizierung

Die erste Version ist auf LAN-Betrieb ausgelegt. Die HTTP-Schicht ist so aufgebaut, dass spaeter Auth-Middleware oder Reverse-Proxy-Authentifizierung davor gesetzt werden kann, ohne API und Supervisor umzugestalten.
