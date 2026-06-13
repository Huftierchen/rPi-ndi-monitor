# Design: HDMI-Ausgabeauflösung über das Web-UI steuerbar

**Datum:** 2026-06-13
**Status:** Genehmigt, bereit für Implementierungsplan

## Problem

Der Pi erkennt aktuell automatisch die native Auflösung des angeschlossenen
Displays (z. B. 4K) und rendert darauf. Eine 1080p-NDI-Frame wird dann auf 4K
hochskaliert — der Pi treibt real 4K, obwohl der Stream nur Full HD ist. Das
kostet GPU-Last und Wärme ohne Bildgewinn.

Es soll möglich sein, die HDMI-Ausgabeauflösung (inkl. Refresh-Rate) gezielt
über das Web-UI zu wählen, statt immer die native Mode zu nutzen.

## Ursache des aktuellen Verhaltens

Der Renderer initialisiert das Fenster mit `SDL_WINDOW_FULLSCREEN_DESKTOP`
(`apps/receiver/src/render/renderer.cpp`). Dieser Flag fasst den HDMI-Output
nicht an und übernimmt die aktuelle (native) Display-Mode. Die NDI-Frame wird
per `SDL_RenderCopy` in den nativen Framebuffer skaliert.

## Kernidee

Der Renderer wechselt von `FULLSCREEN_DESKTOP` auf einen echten DRM-Modeset,
sobald ein konkreter Modus konfiguriert ist:

- `outputMode = auto` → `SDL_WINDOW_FULLSCREEN_DESKTOP` (bestehendes Verhalten).
- `outputMode = <W>x<H>@<Hz>` → `SDL_WINDOW_FULLSCREEN` +
  `SDL_SetWindowDisplayMode(matchender Mode)`. SDL2 macht über KMSDRM einen
  echten DRM-Modeset. Kein `cmdline.txt`-Eingriff, kein Reboot.

Eine Auflösungsänderung entspricht einem Receiver-Restart, den der Supervisor
bei jeder Settings-Änderung bereits durchführt.

## Wichtige Designentscheidung: Modi kommen vom laufenden Receiver

Die wählbaren Auflösungen + Hz sind eine Eigenschaft des angeschlossenen
Displays (aus dessen EDID). Sie ändern sich nur, wenn ein anderer Monitor
angeschlossen wird. Es ist daher unnötig, sie wiederholt zu ermitteln.

Statt eines separaten `discover-modes`-Subcommands (das einen zweiten Zugriff
auf das DRM-Device bräuchte und mit dem DRM-Master des laufenden Receivers
kollidieren könnte — vgl. CLAUDE.md: *"discovery must never disturb an active
receiver"*) gilt:

- Der **laufende Receiver** hält das DRM-Device beim Start ohnehin offen. Er
  enumeriert die verfügbaren Modi **einmal beim Start** und schreibt sie in die
  Status-Datei. Kein zusätzlicher DRM-Zugriff, kein Konflikt.
- Das Web-UI liest die Modi über den bestehenden Status-/SSE-Stream.
- Ein „Rescan" entspricht einem Receiver-Neustart — das passiert bei jeder
  Settings-Änderung automatisch. Ein Monitor-Wechsel im Betrieb ist ein
  physischer Eingriff, nach dem die Box ohnehin neu gestartet wird.

**Kaltstart:** Bevor der Receiver das erste Mal lief, kennt das UI noch keine
Modi und zeigt nur `Auto (native)`. Sobald der Receiver einmal (mit Auto) lief,
erscheinen alle Modi und die Auflösung kann verfeinert werden. Das deckt den
realen Setup-Flow (erst Quelle wählen, dann starten) ab. Kein Extra-Code für
einen separaten Cold-Start-Scan.

## Komponenten

### 1. Konfiguration

`config/default.yaml`, `display`-Block:

```yaml
display:
  fullscreen: true
  hdmiOutputHint: auto
  outputMode: auto          # "auto" | "<W>x<H>@<Hz>"  z. B. "1920x1080@60"
```

zod-Schema (`apps/web/src/config/schema.ts`, `displayConfigSchema`):

- Neues Feld `outputMode`, validiert per Regex:
  `^(auto|\d{3,5}x\d{3,5}@\d{1,3})$`.
- Ungültiger Wert → Config wird abgelehnt (kein silent accept).
- Default `auto` → kein Verhaltensbruch für Bestandsgeräte.

Anpassen: `displayConfigSchema`, `AppConfig.display` in
`apps/web/src/types.ts` und das gespiegelte `AppConfig` in
`apps/web-ui/src/api/types.ts`, sowie `mergeConfig`-Pfad (deckt `display` schon
ab, nur neues Feld kommt mit).

### 2. Nativer Receiver

**CLI** (`apps/receiver/src/cli.h` / `cli.cpp`):

- `RunOptions` bekommt `std::string output_mode = "auto";`.
- Neues `run`-Flag `--output-mode <auto|WxH@Hz>` mit Validierung
  (gültig/`auto`/ungültig → `std::invalid_argument`).
- In `render_help()` ergänzen.

**Reine Auswahl-Logik** (neu, unit-testbar ohne SDL/HDMI):

```cpp
struct DisplayMode { int width; int height; int refresh_rate; };
struct ModeSelection { bool use_native; DisplayMode chosen; bool is_fallback; };

ModeSelection SelectDisplayMode(const std::vector<DisplayMode>& available,
                                const std::string& requested);
```

- `requested == "auto"` → `{use_native=true, is_fallback=false}`.
- konkret + Match vorhanden → `{use_native=false, chosen=match, is_fallback=false}`.
- konkret + kein Match → `{use_native=true, is_fallback=true}` (Fallback auf
  native Mode).

**Renderer** (`apps/receiver/src/render/renderer.cpp` / `.h`):

- `IRenderer` bekommt Methoden, damit `receiver_app` die ermittelten Modi und
  den angewendeten Modus auslesen kann, z. B.:
  - `std::vector<DisplayMode> AvailableModes() const`
  - `std::string AppliedMode() const`        // "WxH@Hz" oder "auto"/native
  - `bool ModeFallback() const`
- `Initialize`:
  - SDL-Video init wie bisher.
  - Modi via `SDL_GetNumDisplayModes` / `SDL_GetDisplayMode` enumerieren und
    speichern (für Status-Report).
  - `SelectDisplayMode(enumerierte Modi, options.output_mode)` aufrufen.
  - `use_native` → `FULLSCREEN_DESKTOP` (wie heute).
  - sonst → `FULLSCREEN` + passenden `SDL_DisplayMode` setzen
    (`SDL_SetWindowDisplayMode`), Fenster auf die Mode-Größe.
  - `is_fallback` → Warnung loggen (`render`-Kategorie):
    `"requested <X> unavailable, using native <Y>"`.
- Headless-Renderer (Build ohne SDL2): leere Modus-Liste, `AppliedMode()` =
  `"auto"`, `ModeFallback()` = `false`.

**Status-Writer** (`apps/receiver/src/status_writer.*` + `receiver_app.cpp`):

- Status-JSON um `outputMode`, `outputModeFallback`, `availableModes`
  erweitern (Werte aus dem Renderer nach `Initialize`).

### 3. Status-Schema (Node)

`apps/web/src/types.ts` und `apps/web-ui/src/api/types.ts`:

- `ReceiverStatusFile` und `ReceiverRuntimeStatus` erhalten:
  - `outputMode: string | null` — real angewendeter HDMI-Modus
  - `outputModeFallback: boolean` — Wunschmodus war nicht verfügbar
  - `availableModes: DisplayMode[]` mit
    `{ id: string; width: number; height: number; refreshRate: number; isNative: boolean; isCurrent: boolean }`
- `resolution` bleibt unverändert die NDI-Frame-Auflösung (klar getrennt vom
  Output-Mode).
- Status-Parsing (`apps/web/src/receiver/status.ts`) trägt die neuen Felder
  durch; fehlende Felder → Defaults (`null` / `false` / `[]`), damit ältere
  Status-Dateien nicht brechen.

### 4. Node-Backend

`apps/web/src/receiver/receiver-supervisor.ts`:

- `buildRunArguments` ergänzt `--output-mode <config.display.outputMode>`.
- Keine neuen Endpoints, kein discover-modes-Spawn, kein Scan-Guard.
- Die neuen Status-Felder fließen über den bestehenden SSE-Status-Stream ans
  UI.

### 5. Web-UI

`apps/web-ui/src/screens/Settings.tsx`, Accordion „DEVICE & DISPLAY":

- Neues `<select>` **„HDMI OUTPUT RESOLUTION"**:
  - Option `Auto (native)` (Wert `auto`).
  - Plus eine Option je Eintrag aus `status.availableModes`
    (Wert = `id` z. B. `1920x1080@60`, Label z. B. `1920×1080 · 60 Hz`,
    native Mode markiert).
  - Schreibt `draft.display.outputMode`, triggert bestehenden
    `SAVED · RECEIVER RESTART`-Flow.
- Wenn `availableModes` leer (Kaltstart): nur `Auto`, Hint
  „start receiver once to detect modes".
- Warn-Chip / Hinweis, wenn `status.outputModeFallback` true ist
  (z. B. „requested mode unavailable — using native").

### 6. Tests

**Node:**

- zod-Regex für `outputMode`: gültige (`auto`, `1920x1080@60`) und ungültige
  (`1080p`, `foo`, `1920x1080`) Eingaben.
- `mergeConfig` mit `display.outputMode`.
- Status-Parsing: `availableModes` / `outputMode` / `outputModeFallback`
  inkl. Defaults bei fehlenden Feldern.

**Native:**

- `SelectDisplayMode`: auto-Pfad, Match-Pfad, Fallback-Pfad.
- CLI-Parsing `--output-mode`: gültig / `auto` / ungültig.

## Offene Risiken / ohne echte Hardware unverifiziert

- Ob SDL/KMSDRM auf dem Pi 5 alle vom Display annoncierten EDID/CEA-Modi sauber
  enumeriert (i. d. R. ja, über die DRM-Connector-Modes). **Im Code als
  „auf Pi verifizieren"-TODO markieren.**
- HDMI-Audio wird beim Modeset neu initialisiert (Audio öffnet mit dem neuen
  Mode neu). Sollte unkritisch sein — wird notiert.
- Kaltstart zeigt nur `Auto`, bis der Receiver einmal lief (dokumentiert).
- Manche Displays annoncieren Modi, die der Pi nicht mit vollem Pixeltakt
  treiben kann (selten) — der Fallback fängt das ab.

## Doku

`docs/DEPLOYMENT_PI5.md` und `docs/OPERATIONS.md` bekommen einen kurzen
Abschnitt: Auflösung über das Web-UI wählen, Auto-Verhalten, Fallback bei nicht
verfügbarem Modus, Hinweis dass die Modus-Liste nach dem ersten Receiver-Start
erscheint.
