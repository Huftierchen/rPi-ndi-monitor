# Betrieb

## Wichtige Dateien

- Konfiguration: `/etc/ndi-receiver/config.yaml`
- Status: `/var/lib/ndi-receiver/receiver-status.json`
- Web-Logs: `/var/log/ndi-receiver/web.log`
- Receiver-Logs: `/var/log/ndi-receiver/receiver.log`

## Services

```bash
sudo systemctl status ndi-web.service
sudo systemctl restart ndi-web.service
sudo journalctl -u ndi-web.service -f
```

## Typischer Betriebsablauf

1. Web-Dienst startet
2. Konfiguration wird validiert und geladen
3. API/UI stehen bereit
4. Bei `autoStart` oder manuellem Start startet der Receiver-Child-Prozess
5. Receiver schreibt Statusdatei und Logs
6. Bei Disconnect oder Crash greift die Restart-/Reconnect-Logik

## Discovery

Discovery laeuft als separater kurzer nativer Prozess ueber `receiver discover --json`. Dadurch bleibt eine laufende Wiedergabe unberuehrt.

## Graceful Shutdown

Bei `SIGTERM`:

- Web-Dienst stoppt geordnet
- Child-Prozess erhaelt `SIGTERM`
- nach Timeout folgt `SIGKILL`
- `systemd` bekommt einen sauberen Exit

## Logauswertung

- Journal fuer Service-Probleme
- NDJSON-Dateien fuer UI-Download und einfache lokale Analyse

Beispiele:

```bash
tail -f /var/log/ndi-receiver/web.log
tail -f /var/log/ndi-receiver/receiver.log
```

## Update

```bash
cd /home/pi/ndi-monitor
git pull
export NDI_SDK_DIR=/opt/ndi_sdk
sudo ./scripts/update.sh
```

## Offene Betriebsrisiken

- Audio-Frames ueber das echte NDI-SDK muessen auf dem Zielgeraet mit HDMI-Audio getestet werden
- SDL2/KMSDRM-Verhalten kann je nach Firmware- und Display-Kombination variieren
- Der Stub-Backend-Pfad ist nur fuer lokale Entwicklung gedacht, nicht fuer Produktion
