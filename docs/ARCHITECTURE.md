# Architektur

## Zielbild

Das System ist als headless NDI-Appliance fuer Raspberry Pi 5 auf Raspberry Pi OS Lite ausgelegt. Es gibt genau eine Control Plane:

- `apps/web`: Fastify-basierter Node.js-Dienst fuer UI, REST-API, SSE, Konfiguration, Logging und Prozessaufsicht
- `apps/receiver`: native C++17-Anwendung fuer Discovery, NDI-Empfang, Reconnect, HDMI-Rendering und optionale Audioausgabe

Der Pi bootet ohne Desktop in `multi-user.target`. Die Web-Control-Plane laeuft als `ndi-web.service`. Der eigentliche Receiver ist kein eigener `systemd`-Dienst, sondern ein Child-Prozess des Web-Dienstes. So bleibt die komplette Bedienung an genau einer Stelle.

## Reale Laufzeit-Topologie

### Dienste

- `ndi-web.service`: Hauptdienst fuer HTTP, UI, API, SSE, Config, Logs und Receiver-Supervision
- `ndi-standby.service`: schreibt im Idle-Zustand den Appliance-Screen mit Web-UI-QR-Code auf `tty1`
- `getty@tty1.service`: wird im Appliance-Betrieb deaktiviert, damit kein Login-Prompt auf HDMI erscheint

### Produktionspfade

- Installation: `/opt/ndi-monitor`
- Konfiguration: `/etc/ndi-receiver/config.yaml`
- Status-Snapshot: `/var/lib/ndi-receiver/receiver-status.json`
- Logdateien: `/var/log/ndi-receiver/web.log`, `/var/log/ndi-receiver/receiver.log`
- fluechtige Runtime: `/run/ndi-monitor`

### Service-Umgebung

`ndi-web.service` setzt fuer den Produktionsbetrieb unter anderem:

- `NDI_MONITOR_CONFIG_PATH=/etc/ndi-receiver/config.yaml`
- `NDI_MONITOR_RUNTIME_ROOT=/var/lib/ndi-receiver`
- `NDI_MONITOR_LOG_DIR=/var/log/ndi-receiver`
- `NDI_MONITOR_RECEIVER_BINARY=/opt/ndi-monitor/apps/receiver/build/ndi-receiver`
- `XDG_RUNTIME_DIR=/run/ndi-monitor`
- `SDL_VIDEODRIVER=kmsdrm`
- `SDL_AUDIODRIVER=alsa`
- `LD_LIBRARY_PATH=/opt/ndi-monitor/lib`

Damit bekommt der native Receiver einen sauberen, desktopfreien KMS/DRM- und HDMI-Audio-Pfad.

## Architekturentscheidungen

### Fastify statt Express

Fastify wurde gewaehlt, weil es auf dem Pi leichtgewichtig bleibt, gute TypeScript-Typisierung bietet und SSR, REST und Streaming ohne schweres Frontend-Framework traegt.

### SSE statt WebSocket

Die Datenrichtung ist fast ausschliesslich serverseitig: Status, Logs und Discovery-Ergebnisse werden zum Browser geschoben. Dafuer reicht SSE aus und reduziert die Komplexitaet gegenueber WebSockets.

### YAML statt JSON fuer Runtime-Konfiguration

Die Appliance wird oft per SSH oder direkt auf dem Geraet administriert. YAML ist fuer Operatoren lesbarer. Gleichzeitig bleibt die Anwendung strikt: ungueltige Werte werden validiert und nicht still uebernommen.

### Receiver als Child-Prozess des Web-Dienstes

Diese Entscheidung folgt bewusst der "single control plane":

- Start, Stop, Restart, Reconnect und Source-Switch laufen ueber genau einen Prozess
- API und UI kennen immer den gewuenschten und den aktuellen Zustand
- Exit-Codes, Logs und Status koennen direkt korreliert werden
- Discovery kann separat ausgefuehrt werden, ohne den laufenden Wiedergabepfad zu stoeren

`systemd` ueberwacht nur `ndi-web.service`. Der Web-Dienst ueberwacht den nativen Receiver.

### Discovery als nativer CLI-Unterbefehl

Discovery wird mit einem kurzen separaten nativen Prozess (`ndi-receiver discover --json`) ausgefuehrt. Node.js muss dadurch nicht gegen das NDI-SDK linken, und eine laufende Wiedergabe bleibt unberuehrt.

### Live-Status ueber Prozess-Events

Der Receiver emittiert Status- und Lifecycle-Ereignisse auf `stdout` und strukturierte Logzeilen auf `stdout` beziehungsweise `stderr`. Die Web-Control-Plane haelt den aktuellen Receiver-Status deshalb im RAM und verteilt ihn direkt an UI, API und SSE.

Die Statusdatei bleibt bewusst erhalten, aber nur noch als seltener persistierter Snapshot bei wichtigen Uebergaengen wie Start, Disconnect, Fatal Error oder sauberem Stop. Das reduziert SD-Karten-I/O deutlich, ohne den letzten bekannten Zustand fuer Diagnose komplett zu verlieren.

## Daten- und Steuerfluss

### Web-UI

Die Web-Oberflaeche ist serverseitig gerendert und bewusst schlank gehalten:

- Dashboard fuer Sofortaktionen und Betriebsstatus
- Sources-Seite fuer Discovery, Auswahl und direkten Start
- Settings-Seite fuer persistente Konfiguration
- Logs-Seite fuer Web- und Receiver-Logs
- About-Seite fuer Kurzbeschreibung und Betriebsinfos

Interaktive Aktionen gehen ueber REST-Endpunkte. Live-Updates kommen primaer ueber SSE, mit periodischem Polling als Browser-Fallback.

### Control Flow

1. Browser sendet REST-Request an `apps/web`
2. Config-Service validiert und persistiert Aenderungen in YAML
3. Receiver-Supervisor startet, stoppt oder restarted den nativen Prozess
4. Receiver emittiert Live-Status und Logs
5. Web-Dienst spiegelt Status und Logs wieder in UI, API und SSE

### Discovery Flow

1. UI oder API fordert Discovery an
2. Web-Dienst startet einen kurzen nativen `discover`-Prozess
3. JSON-Ergebnis wird geparst und an UI/API zurueckgegeben
4. Ein laufender `run`-Prozess bleibt dabei unberuehrt

## Aufbau der nativen Komponente

Der Receiver ist in klar getrennte Bausteine zerlegt:

- CLI-Parser fuer `run` und `discover`
- Logger mit Text- und optionalem JSON-Format
- StatusWriter fuer atomische JSON-Snapshots
- NDI-Backend-Schnittstelle fuer echtes SDK oder Stub-Build
- Renderer-Schnittstelle fuer SDL2/KMSDRM beziehungsweise Headless-Stub
- `ReceiverApp` fuer Signal-Handling, Reconnect-Loop und Exit-Codes

Diese Struktur erlaubt lokale Tests ohne echtes SDK, ohne die Produktionsschnittstelle zu verbiegen.

## Appliance-Verhalten auf HDMI

Der Pi soll sich wie ein Geraet und nicht wie ein Linux-Loginhost verhalten. Deshalb macht der Installationspfad zusaetzlich:

- `getty@tty1.service` deaktivieren
- `console=tty1` aus `/boot/cmdline.txt` entfernen
- `quiet loglevel=3 vt.global_cursor_default=0` setzen
- `ndi-standby.service` aktivieren

Ergebnis:

- waehrend der Receiver nicht laeuft, zeigt HDMI den Standby-Screen mit Web-UI-URL, QR-Code, Hostname und IP
- sobald der Receiver startet, uebernimmt der KMS/DRM-Renderer den Bildschirm
- kein sichtbarer Desktop, kein Mauszeiger, kein Login-Prompt

## Fehler- und Restart-Verhalten

- Wenn die Quelle verschwindet, bleibt der Receiver-Prozess aktiv und faehrt den Reconnect-Backoff
- Wenn der Receiver unerwartet endet, entscheidet der Web-Supervisor anhand der Konfiguration ueber Neustart
- Wenn der Web-Dienst abstuerzt, startet `systemd` ihn erneut
- Bei `SIGTERM` werden Web-Dienst und Child-Prozess geordnet beendet
- Discovery beeinflusst den laufenden Wiedergabepfad nicht

## Rechte und Geraetezugriff

Der Produktionsbenutzer `ndi-monitor` laeuft mit zusaetzlichen Gruppen:

- `video`
- `audio`
- `render`

Damit kann der Receiver auf DRM/KMS-Devices und HDMI-Audio zugreifen, ohne als `root` zu laufen.

## Entwicklungs- und Testmodus

Ohne echtes NDI-SDK kann der Receiver als Stub gebaut werden. Die Struktur bleibt gleich:

- gleiche CLI
- gleicher Status-Snapshot
- gleiche Supervisor-Integration
- gleiche Web-API

Entwicklungsmodus faellt fuer Laufzeitdaten automatisch auf repo-lokale Pfade unter `runtime/` zurueck.

## Erweiterbarkeit

Die erste Version ist bewusst fuer LAN-Betrieb ohne verpflichtende Authentifizierung ausgelegt. Die Web-Schicht ist aber so geschnitten, dass spaeter moeglich sind:

- Auth-Middleware in Fastify
- Reverse-Proxy-Absicherung
- weitere Diagnose-Endpunkte
- zusaetzliche Display- oder Audio-Optionen

Die Control Plane, das Prozessmodell und das native Rendering muessen dafuer nicht neu gedacht werden.
