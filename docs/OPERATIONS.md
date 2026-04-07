# Betrieb

## Wichtige Dateien

- Konfiguration: `/etc/ndi-receiver/config.yaml`
- Status-Snapshot: `/var/lib/ndi-receiver/receiver-status.json`
- Web-Logs: `/var/log/ndi-receiver/web.log`
- Receiver-Logs: `/var/log/ndi-receiver/receiver.log`

## Wichtige Services

```bash
sudo systemctl status ndi-web.service
sudo systemctl status ndi-standby.service
sudo systemctl status getty@tty1.service
```

Was sie tun:

- `ndi-web.service`: Web-Control-Plane, API, UI, Supervisor fuer den nativen Receiver
- `ndi-standby.service`: schreibt den Idle-/Standby-Text auf `tty1`
- `getty@tty1.service`: sollte im Appliance-Betrieb deaktiviert sein

## Typischer Betriebsablauf

1. Pi bootet in `multi-user.target`
2. `ndi-standby.service` schreibt den Standby-Screen auf HDMI
3. `ndi-web.service` startet die Web-Control-Plane
4. Konfiguration wird geladen und validiert
5. Discovery und UI stehen bereit
6. bei `autoStart` oder manuellem Start wird der Receiver als Child-Prozess gestartet
7. der Receiver sendet Live-Status-Events und schreibt strukturierte Logs
8. bei Disconnect oder Crash greifen Reconnect und Restart

## Receiver starten und stoppen

Ueber die Web-UI:

- Dashboard: `Start receiver`, `Stop`, `Restart`, `Reconnect`
- Sources: `Use and start`

Ueber die API:

```bash
curl -X POST http://127.0.0.1:8080/api/control/start
curl -X POST http://127.0.0.1:8080/api/control/stop
curl -X POST http://127.0.0.1:8080/api/control/restart
curl -X POST http://127.0.0.1:8080/api/control/reconnect
```

## Discovery

Discovery laeuft als separater kurzer nativer Prozess. Eine laufende Wiedergabe wird dadurch nicht unterbrochen.

Web-UI:

- `/sources` startet Discovery beim Oeffnen automatisch
- manueller Refresh ist jederzeit moeglich

CLI:

```bash
/opt/ndi-monitor/apps/receiver/build/ndi-receiver discover --json --timeout-ms 4000
```

## Status beobachten

```bash
curl http://127.0.0.1:8080/api/status
cat /var/lib/ndi-receiver/receiver-status.json
```

Die API ist die massgebliche Live-Sicht. Die JSON-Datei ist nur noch der letzte persistierte Snapshot und kann deshalb aelter sein als der API-Status.

Wichtige Statusfelder:

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

## Logs

### Datei-Logs

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

### Web-UI

- `/logs`
- Download der Logdateien ueber die entsprechenden Buttons

## Konfiguration aendern

Persistente Konfigurationsdatei:

- `/etc/ndi-receiver/config.yaml`

Aenderungen koennen erfolgen:

- ueber `/settings`
- ueber `/sources`
- per API
- im Notfall direkt per SSH

Nach Speichern ueber die Web-UI wird:

- die Konfiguration validiert
- bei laufendem Receiver ein kontrollierter Neustart ausgeloest

## Typische Einstellungen

### Sinnvoll fuer Produktion

- `receiver.sourceName`: fester NDI-Sender
- `receiver.autoStart: true`
- `receiver.reconnect.enabled: true`
- `receiver.scaleMode: contain` oder `cover`
- `logging.level: info`
- `display.fullscreen: true`

### Wenn Audio Probleme macht

- `receiver.audioEnabled: false`

### Wenn eine Quelle langsam wieder auftaucht

- `receiver.reconnect.initialDelayMs` und `maxDelayMs` erhoehen

## Reboot nach Erstinstallation

Ein Reboot ist nach der ersten Installation empfohlen, weil:

- `/boot/cmdline.txt` angepasst wird
- `console=tty1` entfernt wird
- die HDMI-Boot-Konsole ruhig werden soll

## Wenn der Receiver laeuft, aber kein Bild sichtbar ist

Pruefen:

```bash
curl http://127.0.0.1:8080/api/status
cat /var/lib/ndi-receiver/receiver-status.json
tail -f /var/log/ndi-receiver/receiver.log
sudo ls -l /proc/$(pgrep -f ndi-receiver | head -n1)/fd
```

Worauf achten:

- `connectionState` sollte `connected` sein
- `videoActive` sollte `true` sein
- `resolution` und `fps` sollten sinnvoll gesetzt sein
- offene Handles auf `/dev/dri/card*` und `/dev/dri/renderD128`

## Wenn auf HDMI der Login-Prompt wieder auftaucht

Pruefen:

```bash
sudo systemctl status getty@tty1.service ndi-standby.service
cat /boot/cmdline.txt
```

Erwartung:

- `getty@tty1.service`: `inactive`
- `ndi-standby.service`: `active (exited)`
- `/boot/cmdline.txt` ohne `console=tty1`

## Graceful Shutdown

Bei `SIGTERM`:

- Web-Dienst schreibt Shutdown-Log
- Child-Prozess bekommt `SIGTERM`
- nach Timeout folgt `SIGKILL`
- `systemd` sieht einen sauberen Dienst-Exit

## Update

```bash
cd /home/pi/ndi-monitor
git pull
export NDI_SDK_DIR=/opt/ndi_sdk
sudo ./scripts/update.sh
```

## Offene Betriebsrisiken

- HDMI-Audio sollte auf dem finalen Zielsystem mit echtem Audio-Signal separat validiert werden
- SDL2/KMSDRM kann je nach Display, Kabel, Adapter und Firmware variieren
- fuer groessere Installationen waeren Logrotation und explizites Monitoring noch sinnvoll
