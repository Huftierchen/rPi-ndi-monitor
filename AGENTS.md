Du sollst ein vollständiges, produktionsnahes Projekt für einen Raspberry Pi 5 bauen.

Ziel:
Ein Raspberry Pi 5 mit Raspberry Pi OS Lite (console-only, kein Desktop) soll als eigenständiger NDI-Empfänger dienen. Das Gerät soll einen auswählbaren NDI-Stream fullscreen auf dem per HDMI angeschlossenen Display ausgeben. Die Konfiguration und Fernbedienung soll über eine lokale Node.js-Weboberfläche erfolgen. Das eigentliche NDI-Empfangen und Rendern soll NICHT in Node.js passieren, sondern in einer nativen Komponente.

Wichtige Architekturentscheidung:
- Node.js/TypeScript ist nur für:
  - Web-UI
  - REST-API
  - Konfiguration
  - Status
  - Prozessverwaltung / Supervision
  - Reconnect-/Restart-Logik
  - Log-Anzeige
- Native Receiver-App ist für:
  - NDI Source Discovery
  - Verbinden mit einer Quelle
  - Empfang von Video
  - optional Audio-Ausgabe über HDMI
  - fullscreen Rendering direkt auf HDMI
  - kein X11, kein Wayland, kein Desktop
  - direkte Ausgabe über Linux DRM/KMS, bevorzugt via SDL2 mit KMSDRM-Backend oder gleichwertigem robusten Ansatz

Rahmenbedingungen:
- Zielplattform: Raspberry Pi 5
- OS: Raspberry Pi OS Lite / Bookworm
- Architektur: ARM64
- Deployment: systemd Services
- Bootverhalten:
  - Gerät bootet in Multi-User-Mode
  - Web-UI und Receiver-Manager starten automatisch
  - nach Stromverlust soll das System automatisch wieder hochkommen
- Ausgabe:
  - fullscreen auf HDMI
  - kein Mauszeiger
  - kein sichtbarer Desktop
  - möglichst appliance-artiges Verhalten
- Bedienung:
  - vom Netzwerk aus per Browser
  - einfache Fernkonfiguration
  - NDI-Quellen anzeigen
  - Quelle auswählen
  - Start/Stop/Reconnect
  - Status sehen
  - Logs sehen
- Robustheit:
  - wenn Quelle verschwindet: automatische Retry-Strategie
  - wenn nativer Receiver abstürzt: Node-Supervisor startet ihn neu
  - saubere Fehlerbehandlung
  - systemd-Units mit Restart
- Sicherheit:
  - UI standardmäßig nur im LAN gedacht
  - aber bereits so strukturieren, dass optional Auth später ergänzt werden kann
- Audio:
  - optional aktivierbar/deaktivierbar
  - wenn aktiviert: Audio über HDMI ausgeben
- Performance:
  - Ziel primär 1080p stabil
  - nicht auf Multi-Stream auslegen
  - zunächst ein Stream gleichzeitig
- UX:
  - Headless-Appliance
  - einfache Konfigurationsdatei + Web-UI
  - möglichst wenig bewegliche Teile

Technische Präferenz:
Bitte baue das Projekt als Monorepo mit zwei Hauptteilen:

1. apps/web
   - Node.js + TypeScript
   - leichtgewichtiges Backend, z. B. Fastify oder Express
   - einfache serverseitig gerenderte Seiten oder sehr schlanke Frontend-Lösung
   - keine unnötig schwere Frontend-Maschinerie
   - REST-API für alle Steuerfunktionen
   - WebSocket oder SSE für Live-Status/Logs falls sinnvoll

2. apps/receiver
   - native App in C++ (bevorzugt) oder Rust
   - direkte NDI-SDK-Integration
   - Ausgabe über SDL2 KMSDRM oder technisch gleichwertig
   - CLI-Interface, damit Node sie gut steuern kann
   - Ausgabe strukturierter Logs
   - JSON-Statusdatei oder stdout-Statusereignisse

Bevorzugte Implementierungsdetails:
- C++17 oder neuer für den Receiver
- CMake für den nativen Build
- Node.js 22+ für die Web-Komponente
- TypeScript strikt typisiert
- pnpm als Paketmanager
- klare Trennung von Runtime-Config und Build-Config
- keine Docker-Pflicht im Zielsystem
- natives Bauen direkt auf dem Pi oder Cross-Compile vorbereitbar

Erwartete Projektstruktur:
- README.md auf Root-Ebene
- docs/ARCHITECTURE.md
- docs/DEPLOYMENT_PI5.md
- docs/OPERATIONS.md
- apps/web/...
- apps/receiver/...
- scripts/...
- config/...
- systemd/...

Das Projekt soll mindestens diese Features enthalten:

======================================================================
A) WEB-UI / NODE BACKEND
======================================================================

Die Web-App soll diese Funktionen haben:

1. Dashboard
- aktueller Gerätestatus
- Receiver läuft / läuft nicht
- aktuell verbundene Quelle
- Video-Status
- Audio-Status
- letzte Fehler
- Uptime
- aktuelle Auflösung/FPS falls verfügbar

2. NDI Source Discovery
- Button: “Quellen suchen”
- Liste gefundener NDI-Quellen
- Quelle auswählbar
- Liste regelmäßig aktualisierbar
- optional Auto-Refresh

3. Steuerung
- Start Receiver
- Stop Receiver
- Restart Receiver
- Reconnect zur gleichen Quelle
- Quelle wechseln

4. Einstellungen
- gewünschte NDI-Quelle
- Audio an/aus
- HDMI-/Display-Optionen
- Retry-Intervalle
- Logging-Level
- Auto-Start aktiv/inaktiv
- optional bevorzugter Anzeigename des Geräts
- optional Vollbild-/Letterbox-/Scale-Modus

5. Logs
- letzte Logzeilen des nativen Receivers
- letzte Logzeilen des Web-Backends
- Download einer Logdatei

6. API
- saubere REST-Endpoints
- JSON-Antworten
- Healthcheck-Endpoint
- Status-Endpoint
- Discovery-Endpoint
- Settings-Endpoint
- Control-Endpoint

7. Prozessaufsicht
- Node startet/stoppt den nativen Receiver-Prozess
- Node erkennt Exit-Codes
- Node kann Receiver automatisch neu starten
- Node persistiert Konfiguration in Datei

======================================================================
B) NATIVER RECEIVER
======================================================================

Der native Receiver soll:

1. NDI initialisieren
- NDI Runtime / SDK einbinden
- Discovery unterstützen
- Verbinden zu bestimmter Quelle anhand Namen oder Identifier

2. Video empfangen
- Frames lesen
- Verbindungsausfälle erkennen
- robustes Fehlerhandling
- sinnvolle Timeouts

3. Rendern
- direkte HDMI-Ausgabe fullscreen
- kein Desktop erforderlich
- bevorzugt SDL2 mit KMSDRM-Backend
- sauberer Renderloop
- möglichst wenig CPU-Overhead
- optionale Skalierungsmodi:
  - contain / letterbox
  - cover / crop
  - stretch

4. Audio
- optional über HDMI
- bei deaktiviertem Audio trotzdem Video funktionsfähig
- Audio-Fehler sollen nicht die ganze App crashen

5. CLI / Steuerbarkeit
Der Receiver soll als eigenständiges CLI-Programm startbar sein, z. B.:
  receiver \
    --source "Mein NDI Sender" \
    --audio enabled \
    --log-level info \
    --scale-mode contain \
    --status-file /var/lib/ndi-receiver/status.json

6. Logging
- strukturierte Logs nach stdout/stderr
- sinnvolle Kategorien:
  - startup
  - ndi
  - video
  - audio
  - render
  - reconnect
  - error
- optional JSON-Logs per Flag

7. Status
- entweder periodische JSON-Statusdatei schreiben
- oder Status-Events auf stdout ausgeben
- Node muss zuverlässig erkennen können:
  - receiver startet
  - Quelle gefunden/nicht gefunden
  - verbunden
  - disconnected
  - reconnecting
  - fatal error

======================================================================
C) KONFIGURATION
======================================================================

Bitte ein einfaches, robustes Config-Modell bauen.

Beispielhafte config.yaml oder config.json:
- server:
    host
    port
- receiver:
    sourceName
    audioEnabled
    scaleMode
    reconnect:
      enabled
      initialDelayMs
      maxDelayMs
      backoffMultiplier
- logging:
    level
    maxFiles
    maxSizeMb
- display:
    fullscreen
    hdmiOutputHint
- device:
    name

Anforderungen:
- Default-Konfiguration mitliefern
- Änderungen aus der Web-UI persistieren
- Config-Validierung
- fehlerhafte Config darf nicht stillschweigend übernommen werden

======================================================================
D) SYSTEMD / LINUX-INTEGRATION
======================================================================

Bitte systemd-Units erstellen:

1. ndi-web.service
- startet die Node-Web-App
- startet nach network-online.target
- restart on failure

2. optional:
   entweder
   - den Receiver separat als systemd-Service
   oder
   - Receiver nur vom Node-Backend als Child-Prozess verwalten

Bitte eine begründete Entscheidung treffen und im README erklären.
Meine Tendenz:
- Web-Service als Hauptdienst
- Receiver als Child-Prozess vom Web-Service
damit die Web-App immer der “single control plane” bleibt.

Zusätzlich:
- tmpfiles.d oder sinnvolle Ordnerstruktur für Status/Logs
- Beispielpfade:
  - /etc/ndi-receiver/
  - /var/lib/ndi-receiver/
  - /var/log/ndi-receiver/

Bitte Deployment-Skripte liefern:
- install.sh
- uninstall.sh
- update.sh

Diese Skripte sollen:
- Abhängigkeiten prüfen
- Dateien kopieren
- systemd daemon-reload
- Dienste aktivieren/starten
- sinnvolle Rechte setzen

======================================================================
E) BUILD / DEPENDENCIES
======================================================================

Bitte sauber dokumentieren:
- welche apt-Pakete benötigt werden
- welche Node-Version benötigt wird
- welche nativen Build-Tools benötigt werden
- wie das NDI SDK eingebunden wird
- wie Lizenz-/Redistributionsfragen berücksichtigt werden müssen

Bitte das Projekt so vorbereiten, dass das NDI SDK NICHT blind ins Repo committed wird, falls das unpassend ist.
Stattdessen:
- klarer Mechanismus, wo das SDK erwartet wird
- z. B. third_party/ndi_sdk als lokaler Pfad
- oder Umgebungsvariable NDI_SDK_DIR
- Build soll verständliche Fehler werfen, wenn SDK fehlt

Falls für SDL2 unter KMSDRM zusätzliche Linux-Rechte oder Gerätezugriffe wichtig sind, diese sauber dokumentieren.

======================================================================
F) BEDIENKONZEPT
======================================================================

Bitte die Web-UI simpel und funktional halten.
Kein übertriebenes Design.
Fokus:
- auf einem Handy im LAN bedienbar
- auf Desktop gut nutzbar
- klare Statusanzeigen
- klare Fehlermeldungen
- minimalistisch

Wichtige Seiten:
- /
- /sources
- /settings
- /logs
- /about

======================================================================
G) QUALITÄTSANFORDERUNGEN
======================================================================

Bitte implementieren:
- TypeScript strict mode
- Input-Validierung
- brauchbare Fehlertexte
- keine stillen catch-all-Blöcke
- Exit-Codes dokumentieren
- README vollständig
- Architektur-Doku
- Deploy-Doku für Raspberry Pi 5
- Beispiel-Konfiguration
- Beispiel-systemd-Units
- Beispiel-Screenshots notfalls als Platzhalter-Beschreibung im README
- Unit-Tests für Node-Konfig/Validierung/Service-Layer
- wenigstens ein paar grundlegende Tests oder Testbarkeit für die native Komponente

======================================================================
H) WICHTIGE ENTSCHEIDUNGEN, DIE DU SELBST TREFFEN SOLLST
======================================================================

Treffe eigenständig fundierte Entscheidungen für:
- Fastify vs Express
- SSE vs WebSocket
- JSON vs YAML Config
- Child-Prozess-Management
- Logging-Library
- wie Discovery aus Node ausgelöst wird:
  - entweder direkt im nativen Tool als CLI-Unterbefehl
  - oder über den laufenden Receiver
Ich bevorzuge:
- Discovery als nativer CLI-Unterbefehl oder separater kurzer nativer Run
- Node parst die Ergebnisse

Bitte dokumentiere jede größere Architekturentscheidung kurz in docs/ARCHITECTURE.md.

======================================================================
I) WUNSCH FÜR DIE IMPLEMENTIERUNG
======================================================================

Bitte möglichst ein vollständiges startbares Gerüst liefern und nicht nur Pseudocode.
Ich möchte:
- echten Code
- echte Projektstruktur
- echte systemd-Dateien
- echte Config-Dateien
- echte Build-Dateien
- echte README
- sinnvolle TODO-Kommentare nur dort, wo Integration ohne NDI SDK praktisch nicht vollständig demonstrierbar ist

Wo NDI-spezifische Details wegen lokalem SDK nicht vollständig kompilierbar sind:
- bitte den Code trotzdem so weit wie möglich real implementieren
- mit klar gekennzeichneten Stellen
- keine Handwedelei
- keine unnötigen Mock-Attrappen statt echter Struktur

======================================================================
J) DELIVERABLES
======================================================================

Liefere am Ende:
1. komplette Projektstruktur
2. alle Dateien mit Inhalt
3. README mit Build- und Deploy-Anleitung
4. Schritt-für-Schritt Anleitung für Raspberry Pi 5
5. Erklärung, wie man lokal testet
6. Liste offener Punkte / Risiken
7. klare Kommandos zum Build und Start
8. Beispiel-systemd-Setup
9. Beispielkonfiguration
10. API-Dokumentation

======================================================================
K) TECHNISCHE HINWEISE, DIE DU BEACHTEN SOLLST
======================================================================

- Zielsystem ist Raspberry Pi OS Bookworm Lite, also ohne Desktop.
- Die direkte Anzeige soll ohne X11/Wayland funktionieren.
- Für Linux ist KMS/DRM der bevorzugte Ansatz.
- Die Lösung soll nicht auf einen klassischen Desktop-Window-Manager angewiesen sein.
- Das Projekt soll so aufgebaut sein, dass es als Appliance betrieben werden kann.
- Node.js soll nicht selbst Videoframes rendern.
- Receiver und Web-UI sollen klar getrennt sein.
- Das native Teil muss robust mit Verbindungsabbrüchen umgehen.
- Logging und Betriebsfähigkeit sind wichtiger als hübsche Extras.

======================================================================
L) ARBEITSWEISE
======================================================================

Bitte arbeite in dieser Reihenfolge:
1. Architektur festlegen und kurz dokumentieren
2. Projektstruktur erzeugen
3. Node-Web-App implementieren
4. nativen Receiver-Rahmen implementieren
5. Discovery-/Control-Schnittstellen definieren
6. Config-/Logging-/Statusmodell implementieren
7. systemd-/Deploy-Dateien anlegen
8. README und Doku vervollständigen
9. offene NDI-SDK-Integrationsstellen markieren
10. abschließend ein realistisches Betriebs- und Risikokapitel schreiben

Bitte sei konkret, produktionsnah und pragmatisch.
Vermeide unnötige Komplexität.
Wichtige Pragmatik-Regeln:
- Baue zuerst eine robuste 1-Stream-Lösung, keine Generalisierung auf beliebig viele Streams.
- Keine Microservice-Spielereien.
- Kein Kubernetes, kein Docker-Zwang auf dem Pi.
- Kein schweres Frontend-Framework, wenn es nicht nötig ist.
- Bevorzuge Stabilität und Wartbarkeit.
- Lieber klare lokale Dateien und systemd als komplizierte Runtime-Magie.
- Wenn zwischen “schön” und “robust” entschieden werden muss, nimm “robust”.
- Wenn eine Funktion ohne echtes NDI SDK nicht vollständig verifiziert werden kann, implementiere die reale Struktur trotzdem und markiere präzise, was noch lokal getestet werden muss.
- Liefere keine bloße Skizze, sondern ein möglichst startbares Skelett.
Bitte verwende folgende Defaults, außer es gibt einen sehr guten Grund dagegen:
- Node backend: Fastify
- Frontend: server-rendered einfache Templates oder sehr leichtes statisches Frontend
- Live updates: SSE statt WebSocket
- Config: YAML
- Logging Node: pino
- Native receiver: C++17 + CMake
- Rendering: SDL2 KMSDRM
- Prozessmodell: Node-Webdienst verwaltet nativen Receiver als Child-Prozess
- Discovery: nativer Receiver unterstützt CLI-Unterbefehl "discover" und gibt JSON aus
- Status: nativer Receiver schreibt zusätzlich JSON-Statusdatei
Vergiss die Betriebsdetails nicht:
- systemd Restart-Policy
- stdout/stderr in journal
- persistente Logdateien optional zusätzlich
- graceful shutdown bei SIGTERM
- Receiver-Prozess sauber beenden
- Locking gegen mehrfachen Start
- API soll klar melden, ob Receiver bereits läuft
- Discovery darf einen laufenden Receiver nicht unbeabsichtigt stören
- wenn HDMI-Display beim Boot noch nicht sauber erkannt ist, soll das Verhalten dokumentiert und möglichst robust behandelt werden
