# HDMI Output Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator choose the HDMI output resolution (incl. refresh rate) from the web UI instead of always using the display's native mode.

**Architecture:** A new `display.outputMode` config value (`auto` or `WxH@Hz`) is passed to the native receiver via a `--output-mode` CLI flag. The SDL renderer performs a real DRM modeset when a concrete mode is requested, falling back to the native mode (and flagging it) when the requested mode is unavailable. The running receiver enumerates the connected display's modes once at startup and reports them in its status file, so the web UI can offer the real available modes without a second DRM access.

**Tech Stack:** C++17 + CMake (receiver), SDL2 KMSDRM (rendering), Node.js 22 + TypeScript + Fastify + zod (web backend), React + Vite (web UI). Native tests via a hand-rolled `receiver-tests` executable; Node tests via `node:test`.

---

## File Structure

**Native (`apps/receiver/`)**
- Create `src/display_mode.h` / `src/display_mode.cpp` — pure, SDL-free value types and selection logic: `DisplayMode`, `ModeSelection`, `SelectDisplayMode`, `FormatDisplayMode`, `ParseDisplayModeId`, `IsValidOutputModeSpec`. Testable in isolation.
- Modify `src/cli.h` / `src/cli.cpp` — add `output_mode` to `RunOptions`, parse/validate `--output-mode`, document in help.
- Modify `src/status_writer.h` / `src/status_writer.cpp` — add `output_mode`, `output_mode_fallback`, `available_modes` to the snapshot and serialize them (incl. the JSON array).
- Modify `src/render/renderer.h` / `src/render/renderer.cpp` — expose enumerated modes / applied mode / fallback flag; perform the modeset.
- Modify `src/receiver_app.cpp` — copy the renderer's mode info into the status snapshot after init.
- Modify `CMakeLists.txt` — compile `display_mode.cpp` into both the main binary and `receiver-tests`.
- Modify `tests/status_writer_test.cpp` — add `display_mode` and `--output-mode` tests + status serialization assertions.

**Node backend (`apps/web/`)**
- Modify `src/types.ts` — `DisplayMode` interface, `display.outputMode`, status fields.
- Modify `src/config/schema.ts` — `outputMode` in `displayConfigSchema`.
- Modify `src/receiver/status.ts` — defaults + overlay for the new status fields.
- Modify `src/receiver/receiver-supervisor.ts` — pass `--output-mode`.
- Modify `test/config-schema.test.ts`, `test/status.test.ts` — coverage + base-config updates.

**Web UI (`apps/web-ui/`)**
- Modify `src/api/types.ts` — mirror config + status types.
- Modify `src/api/options.ts` — `formatDisplayModeLabel` helper.
- Modify `src/screens/Settings.tsx` — resolution `<select>` + fallback hint.

**Config / Docs**
- Modify `config/default.yaml` — `display.outputMode: auto`.
- Modify `docs/DEPLOYMENT_PI5.md`, `docs/OPERATIONS.md` — resolution control section.

**Test commands used throughout:**
- Native: `cmake -S apps/receiver -B apps/receiver/build -DRECEIVER_ALLOW_STUB_BACKEND=ON` then `cmake --build apps/receiver/build --target receiver-tests` then `ctest --test-dir apps/receiver/build --output-on-failure`
- Node backend: `pnpm --filter @ndi-monitor/web test` and `pnpm --filter @ndi-monitor/web typecheck`
- Web UI: `pnpm --filter @ndi-monitor/web-ui typecheck`

---

## Task 1: Native — `DisplayMode` value types + `SelectDisplayMode` logic

**Files:**
- Create: `apps/receiver/src/display_mode.h`
- Create: `apps/receiver/src/display_mode.cpp`
- Modify: `apps/receiver/CMakeLists.txt:59-67` (main sources) and `apps/receiver/CMakeLists.txt:89-94` (test sources)
- Test: `apps/receiver/tests/status_writer_test.cpp`

- [ ] **Step 1: Create the header**

Create `apps/receiver/src/display_mode.h`:

```cpp
#pragma once

#include <string>
#include <vector>

namespace ndi_receiver {

// A single HDMI output mode advertised by the connected display.
struct DisplayMode {
  int width = 0;
  int height = 0;
  int refresh_rate = 0;
  bool is_native = false;
  bool is_current = false;
};

// Result of resolving a requested output-mode spec against the available modes.
struct ModeSelection {
  bool use_native = true;   // true -> keep native mode (FULLSCREEN_DESKTOP)
  DisplayMode chosen;       // only meaningful when use_native == false
  bool is_fallback = false; // a concrete mode was requested but not available
};

// "1920x1080@60" for a concrete mode.
std::string FormatDisplayMode(const DisplayMode& mode);

// Returns true if `spec` is "auto" or matches "<W>x<H>@<Hz>".
bool IsValidOutputModeSpec(const std::string& spec);

// Parses "<W>x<H>@<Hz>" into a DisplayMode. Returns false for "auto" or malformed input.
bool ParseDisplayModeId(const std::string& spec, DisplayMode* out);

// Resolves a requested spec against the available modes.
//  - "auto"            -> {use_native=true, is_fallback=false}
//  - concrete + match  -> {use_native=false, chosen=match, is_fallback=false}
//  - concrete + nomatch-> {use_native=true,  is_fallback=true}
ModeSelection SelectDisplayMode(const std::vector<DisplayMode>& available,
                                const std::string& requested);

}  // namespace ndi_receiver
```

- [ ] **Step 2: Add the failing tests**

In `apps/receiver/tests/status_writer_test.cpp`, add `#include "../src/display_mode.h"` near the other includes (after line 10), then add this function before the `}  // namespace` at line 93:

```cpp
void test_display_mode() {
  using ndi_receiver::DisplayMode;
  using ndi_receiver::SelectDisplayMode;

  expect(ndi_receiver::IsValidOutputModeSpec("auto"), "auto is a valid spec");
  expect(ndi_receiver::IsValidOutputModeSpec("1920x1080@60"), "WxH@Hz is a valid spec");
  expect(!ndi_receiver::IsValidOutputModeSpec("1080p"), "1080p is not a valid spec");
  expect(!ndi_receiver::IsValidOutputModeSpec("1920x1080"), "missing @Hz is invalid");

  std::vector<DisplayMode> modes = {
      DisplayMode{3840, 2160, 60, true, true},
      DisplayMode{1920, 1080, 60, false, false},
      DisplayMode{1920, 1080, 50, false, false},
  };

  const auto auto_sel = SelectDisplayMode(modes, "auto");
  expect(auto_sel.use_native && !auto_sel.is_fallback, "auto keeps native mode");

  const auto match = SelectDisplayMode(modes, "1920x1080@50");
  expect(!match.use_native && !match.is_fallback, "exact mode is selected");
  expect(match.chosen.width == 1920 && match.chosen.refresh_rate == 50,
         "selected mode has the requested dimensions");

  const auto fallback = SelectDisplayMode(modes, "1280x720@60");
  expect(fallback.use_native && fallback.is_fallback,
         "unavailable mode falls back to native and flags it");

  expect(ndi_receiver::FormatDisplayMode(DisplayMode{1920, 1080, 60, false, false}) ==
             "1920x1080@60",
         "FormatDisplayMode renders WxH@Hz");
}
```

Then register it in `main()` (after `test_cli_validation();` at line 99): add `test_display_mode();`.

- [ ] **Step 3: Wire `display_mode.cpp` into the build**

In `apps/receiver/CMakeLists.txt`, add `src/display_mode.cpp` to `RECEIVER_SOURCES` (after `src/cli.cpp` on line 61):

```cmake
set(RECEIVER_SOURCES
  src/main.cpp
  src/cli.cpp
  src/display_mode.cpp
  src/logger.cpp
  src/status_writer.cpp
  src/receiver_app.cpp
  src/ndi/ndi_stub_backend.cpp
  src/render/renderer.cpp
)
```

And add it to the `receiver-tests` target (after `src/cli.cpp` on line 91):

```cmake
add_executable(receiver-tests
  tests/status_writer_test.cpp
  src/cli.cpp
  src/display_mode.cpp
  src/logger.cpp
  src/status_writer.cpp
)
```

- [ ] **Step 4: Run the test, verify it fails**

Run: `cmake -S apps/receiver -B apps/receiver/build -DRECEIVER_ALLOW_STUB_BACKEND=ON && cmake --build apps/receiver/build --target receiver-tests`
Expected: FAIL — link/compile error (`display_mode.cpp` does not exist yet / undefined references).

- [ ] **Step 5: Implement `display_mode.cpp`**

Create `apps/receiver/src/display_mode.cpp`:

```cpp
#include "display_mode.h"

#include <cstdio>

namespace ndi_receiver {

std::string FormatDisplayMode(const DisplayMode& mode) {
  return std::to_string(mode.width) + "x" + std::to_string(mode.height) + "@" +
         std::to_string(mode.refresh_rate);
}

bool ParseDisplayModeId(const std::string& spec, DisplayMode* out) {
  int width = 0;
  int height = 0;
  int refresh = 0;
  char tail = '\0';
  // %c catches trailing junk so "1920x1080@60x" is rejected.
  if (std::sscanf(spec.c_str(), "%dx%d@%d%c", &width, &height, &refresh, &tail) != 3) {
    return false;
  }
  if (width <= 0 || height <= 0 || refresh <= 0) {
    return false;
  }
  if (out != nullptr) {
    out->width = width;
    out->height = height;
    out->refresh_rate = refresh;
    out->is_native = false;
    out->is_current = false;
  }
  return true;
}

bool IsValidOutputModeSpec(const std::string& spec) {
  if (spec == "auto") {
    return true;
  }
  return ParseDisplayModeId(spec, nullptr);
}

ModeSelection SelectDisplayMode(const std::vector<DisplayMode>& available,
                                const std::string& requested) {
  ModeSelection selection;
  if (requested.empty() || requested == "auto") {
    selection.use_native = true;
    selection.is_fallback = false;
    return selection;
  }

  DisplayMode wanted;
  if (!ParseDisplayModeId(requested, &wanted)) {
    // Malformed spec is treated as a fallback to native (CLI already validates,
    // this is a defensive belt-and-braces path).
    selection.use_native = true;
    selection.is_fallback = true;
    return selection;
  }

  for (const auto& mode : available) {
    if (mode.width == wanted.width && mode.height == wanted.height &&
        mode.refresh_rate == wanted.refresh_rate) {
      selection.use_native = false;
      selection.chosen = mode;
      selection.is_fallback = false;
      return selection;
    }
  }

  selection.use_native = true;
  selection.is_fallback = true;
  return selection;
}

}  // namespace ndi_receiver
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `cmake --build apps/receiver/build --target receiver-tests && ctest --test-dir apps/receiver/build --output-on-failure`
Expected: PASS — `receiver-tests passed`.

- [ ] **Step 7: Commit**

```bash
git add apps/receiver/src/display_mode.h apps/receiver/src/display_mode.cpp apps/receiver/CMakeLists.txt apps/receiver/tests/status_writer_test.cpp
git commit -m "feat(receiver): add DisplayMode selection logic"
```

---

## Task 2: Native — `--output-mode` CLI flag

**Files:**
- Modify: `apps/receiver/src/cli.h:24-42` (RunOptions), `:177-201` (help)
- Modify: `apps/receiver/src/cli.cpp` (include + parse)
- Test: `apps/receiver/tests/status_writer_test.cpp`

- [ ] **Step 1: Add the failing test**

In `apps/receiver/tests/status_writer_test.cpp`, append these blocks inside `test_cli_validation()` (before its closing brace at line 91):

```cpp
  {
    const char* argv[] = {"ndi-receiver", "run", "--source", "Studio", "--status-file",
                          "/tmp/status.json", "--output-mode", "1920x1080@60"};
    const auto options = ndi_receiver::parse_cli(static_cast<int>(std::size(argv)),
                                                 const_cast<char**>(argv));
    expect(options.run.output_mode == "1920x1080@60", "cli should parse a valid output mode");
  }

  {
    const char* argv[] = {"ndi-receiver", "run", "--source", "Studio", "--status-file",
                          "/tmp/status.json", "--output-mode", "1080p"};
    bool threw = false;
    try {
      (void)ndi_receiver::parse_cli(static_cast<int>(std::size(argv)), const_cast<char**>(argv));
    } catch (const std::invalid_argument&) {
      threw = true;
    }
    expect(threw, "cli should reject a malformed output mode");
  }
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cmake --build apps/receiver/build --target receiver-tests`
Expected: FAIL — `options.run.output_mode` does not exist (compile error).

- [ ] **Step 3: Add the field to `RunOptions`**

In `apps/receiver/src/cli.h`, add to `struct RunOptions` (after line 36, the `hdmi_output_hint` field):

```cpp
  std::string output_mode = "auto";
```

- [ ] **Step 4: Parse and validate the flag**

In `apps/receiver/src/cli.cpp`, add the include after line 4 (`#include <string>`):

```cpp
#include "display_mode.h"
```

Then in the `run` argument loop, add a branch after the `--hdmi-output-hint` branch (after line 116):

```cpp
      } else if (is_flag(argument, "--output-mode")) {
        const std::string value = require_value(argc, argv, index);
        if (!IsValidOutputModeSpec(value)) {
          throw std::invalid_argument("Unsupported output mode (use auto or WxH@Hz): " + value);
        }
        options.run.output_mode = value;
```

- [ ] **Step 5: Document the flag in help**

In `apps/receiver/src/cli.cpp`, in `render_help()`, add this exact line after the `--hdmi-output-hint VALUE` line (line 195):

```
  --output-mode auto|WxH@Hz
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `cmake --build apps/receiver/build --target receiver-tests && ctest --test-dir apps/receiver/build --output-on-failure`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/receiver/src/cli.h apps/receiver/src/cli.cpp apps/receiver/tests/status_writer_test.cpp
git commit -m "feat(receiver): parse and validate --output-mode flag"
```

---

## Task 3: Native — status snapshot mode fields + serialization

**Files:**
- Modify: `apps/receiver/src/status_writer.h:1-24`
- Modify: `apps/receiver/src/status_writer.cpp:11-37`
- Test: `apps/receiver/tests/status_writer_test.cpp:20-49`

- [ ] **Step 1: Extend the test**

In `apps/receiver/tests/status_writer_test.cpp`, inside `test_status_writer()`, set the new fields after line 38 (`snapshot.updated_at = ...`):

```cpp
  snapshot.output_mode = "1920x1080@60";
  snapshot.output_mode_fallback = false;
  snapshot.available_modes = {
      ndi_receiver::DisplayMode{3840, 2160, 60, true, true},
      ndi_receiver::DisplayMode{1920, 1080, 60, false, false},
  };
```

And add assertions after line 48 (the uptime assertion):

```cpp
  expect(content.find("\"outputMode\": \"1920x1080@60\"") != std::string::npos,
         "status writer should persist output mode");
  expect(content.find("\"outputModeFallback\": false") != std::string::npos,
         "status writer should persist fallback flag");
  expect(content.find("\"id\": \"3840x2160@60\"") != std::string::npos,
         "status writer should persist available modes array");
  expect(content.find("\"isNative\": true") != std::string::npos,
         "available modes should carry the native flag");
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cmake --build apps/receiver/build --target receiver-tests`
Expected: FAIL — `snapshot.output_mode` etc. do not exist (compile error).

- [ ] **Step 3: Add fields to the snapshot struct**

In `apps/receiver/src/status_writer.h`, add the include after line 3 (`#include <string>`):

```cpp
#include <vector>

#include "display_mode.h"
```

Then add to `struct ReceiverStatusSnapshot` (after line 22, the `last_error` field):

```cpp
  std::string output_mode = "auto";
  bool output_mode_fallback = false;
  std::vector<DisplayMode> available_modes;
```

- [ ] **Step 4: Serialize the fields**

In `apps/receiver/src/status_writer.cpp`, add a helper inside the anonymous namespace (after `maybe_string`, before `serialize_snapshot_body`, around line 18):

```cpp
std::string serialize_available_modes(const std::vector<DisplayMode>& modes) {
  std::string out = "[";
  for (size_t i = 0; i < modes.size(); ++i) {
    const DisplayMode& m = modes[i];
    out += "{\"id\": \"" + FormatDisplayMode(m) + "\", \"width\": " + std::to_string(m.width) +
           ", \"height\": " + std::to_string(m.height) +
           ", \"refreshRate\": " + std::to_string(m.refresh_rate) +
           ", \"isNative\": " + (m.is_native ? "true" : "false") +
           ", \"isCurrent\": " + (m.is_current ? "true" : "false") + "}";
    if (i + 1 < modes.size()) {
      out += ", ";
    }
  }
  out += "]";
  return out;
}
```

Then in `serialize_snapshot_body`, change the `updatedAt` line (line 36) to add the new fields before it. Replace:

```cpp
         "  \"updatedAt\": \"" + json_escape(snapshot.updated_at) + "\"\n";
```

with:

```cpp
         "  \"outputMode\": \"" + json_escape(snapshot.output_mode) + "\",\n" +
         "  \"outputModeFallback\": " +
         std::string(snapshot.output_mode_fallback ? "true" : "false") + ",\n" +
         "  \"availableModes\": " + serialize_available_modes(snapshot.available_modes) + ",\n" +
         "  \"updatedAt\": \"" + json_escape(snapshot.updated_at) + "\"\n";
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `cmake --build apps/receiver/build --target receiver-tests && ctest --test-dir apps/receiver/build --output-on-failure`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/receiver/src/status_writer.h apps/receiver/src/status_writer.cpp apps/receiver/tests/status_writer_test.cpp
git commit -m "feat(receiver): serialize output mode and available modes in status"
```

---

## Task 4: Native — renderer enumerates and applies the mode

**Files:**
- Modify: `apps/receiver/src/render/renderer.h:1-23`
- Modify: `apps/receiver/src/render/renderer.cpp`

No new unit test (SDL/DRM cannot be exercised without real hardware; the selection logic is covered by Task 1). This task is verified by a successful build of both the SDL and headless renderer paths.

- [ ] **Step 1: Extend the `IRenderer` interface**

In `apps/receiver/src/render/renderer.h`, add the include after line 4 (`#include <string>`):

```cpp
#include <vector>

#include "../display_mode.h"
```

Then add three accessors to the `IRenderer` class (after the `Shutdown()` declaration, line 19):

```cpp
  // Modes advertised by the connected display, captured during Initialize.
  virtual std::vector<DisplayMode> AvailableModes() const = 0;
  // The mode actually applied: "auto" (native) or "WxH@Hz".
  virtual std::string AppliedMode() const = 0;
  // True if a concrete mode was requested but unavailable, so native was used.
  virtual bool ModeFallback() const = 0;
```

- [ ] **Step 2: Implement enumeration + modeset in `SdlRenderer`**

In `apps/receiver/src/render/renderer.cpp`, add private members to `SdlRenderer` (after line 152, `texture_format_`):

```cpp
  std::vector<DisplayMode> available_modes_;
  std::string applied_mode_ = "auto";
  bool mode_fallback_ = false;
```

Replace the window-creation block in `Initialize` (lines 68-76) with mode enumeration + selection. Replace:

```cpp
    const Uint32 flags = options.fullscreen ? SDL_WINDOW_FULLSCREEN_DESKTOP : 0;
    window_ = SDL_CreateWindow("ndi-receiver", SDL_WINDOWPOS_UNDEFINED, SDL_WINDOWPOS_UNDEFINED, 1280,
                               720, flags);
    if (window_ == nullptr) {
      if (error_message != nullptr) {
        *error_message = SDL_GetError();
      }
      return false;
    }
```

with:

```cpp
    // Enumerate the connected display's modes for the web UI to choose from.
    // NOTE: Verify on real Pi 5 hardware that SDL/KMSDRM enumerates every CEA
    // mode advertised by the display via the DRM connector modes. This cannot be
    // validated without an attached HDMI display.
    SDL_DisplayMode current_mode;
    const bool have_current = SDL_GetCurrentDisplayMode(0, &current_mode) == 0;
    const int mode_count = SDL_GetNumDisplayModes(0);
    for (int i = 0; i < mode_count; ++i) {
      SDL_DisplayMode m;
      if (SDL_GetDisplayMode(0, i, &m) != 0) {
        continue;
      }
      DisplayMode entry;
      entry.width = m.w;
      entry.height = m.h;
      entry.refresh_rate = m.refresh_rate;
      entry.is_native = (i == 0);  // SDL lists modes largest-first; index 0 is native.
      entry.is_current =
          have_current && m.w == current_mode.w && m.h == current_mode.h &&
          m.refresh_rate == current_mode.refresh_rate;
      available_modes_.push_back(entry);
    }

    const ModeSelection selection = SelectDisplayMode(available_modes_, options.output_mode);
    mode_fallback_ = selection.is_fallback;

    Uint32 flags = 0;
    int window_width = 1280;
    int window_height = 720;
    if (options.fullscreen) {
      flags = selection.use_native ? SDL_WINDOW_FULLSCREEN_DESKTOP : SDL_WINDOW_FULLSCREEN;
    }
    if (!selection.use_native) {
      window_width = selection.chosen.width;
      window_height = selection.chosen.height;
      applied_mode_ = FormatDisplayMode(selection.chosen);
    } else {
      applied_mode_ = "auto";
    }

    window_ = SDL_CreateWindow("ndi-receiver", SDL_WINDOWPOS_UNDEFINED, SDL_WINDOWPOS_UNDEFINED,
                               window_width, window_height, flags);
    if (window_ == nullptr) {
      if (error_message != nullptr) {
        *error_message = SDL_GetError();
      }
      return false;
    }

    if (!selection.use_native) {
      SDL_DisplayMode target;
      SDL_zero(target);
      target.w = selection.chosen.width;
      target.h = selection.chosen.height;
      target.refresh_rate = selection.chosen.refresh_rate;
      SDL_DisplayMode closest;
      if (SDL_GetClosestDisplayMode(0, &target, &closest) != nullptr) {
        SDL_SetWindowDisplayMode(window_, &closest);
      }
    }
```

- [ ] **Step 3: Implement the three accessors in `SdlRenderer`**

In `apps/receiver/src/render/renderer.cpp`, add to the `SdlRenderer` public section (after `Shutdown()`, around line 144):

```cpp
  std::vector<DisplayMode> AvailableModes() const override { return available_modes_; }
  std::string AppliedMode() const override { return applied_mode_; }
  bool ModeFallback() const override { return mode_fallback_; }
```

- [ ] **Step 4: Implement the accessors in `HeadlessRenderer`**

In `apps/receiver/src/render/renderer.cpp`, add to the `HeadlessRenderer` public section (after its `Shutdown()`, around line 165):

```cpp
  std::vector<DisplayMode> AvailableModes() const override { return {}; }
  std::string AppliedMode() const override { return "auto"; }
  bool ModeFallback() const override { return false; }
```

- [ ] **Step 5: Build both renderer paths**

Run (headless / stub path, works without SDL2): `cmake --build apps/receiver/build`
Expected: PASS — `ndi-receiver` links. (The SDL path compiles only where `libsdl2-dev` is present, e.g. on the Pi; the code is guarded by `#ifdef HAVE_SDL2`.)

- [ ] **Step 6: Commit**

```bash
git add apps/receiver/src/render/renderer.h apps/receiver/src/render/renderer.cpp
git commit -m "feat(receiver): enumerate display modes and apply requested HDMI mode"
```

---

## Task 5: Native — wire renderer mode info into the status snapshot

**Files:**
- Modify: `apps/receiver/src/receiver_app.cpp:48-64`

- [ ] **Step 1: Copy mode info into the status after init**

In `apps/receiver/src/receiver_app.cpp`, in `Run()`, immediately after the successful renderer init (after line 59, the closing brace of the `if (!renderer->Initialize(...))` block), add:

```cpp
  status_.output_mode = renderer->AppliedMode();
  status_.output_mode_fallback = renderer->ModeFallback();
  status_.available_modes = renderer->AvailableModes();
  if (status_.output_mode_fallback) {
    logger_.Warn(LogCategory::kRender,
                 "Requested output mode '" + options_.output_mode +
                     "' unavailable; using native display mode");
  }
```

- [ ] **Step 2: Build to verify it compiles**

Run: `cmake --build apps/receiver/build`
Expected: PASS — `ndi-receiver` links.

- [ ] **Step 3: Run the native tests (regression check)**

Run: `ctest --test-dir apps/receiver/build --output-on-failure`
Expected: PASS — `receiver-tests passed`.

- [ ] **Step 4: Commit**

```bash
git add apps/receiver/src/receiver_app.cpp
git commit -m "feat(receiver): report applied output mode in status snapshot"
```

---

## Task 6: Node — config schema `outputMode`

**Files:**
- Modify: `apps/web/src/config/schema.ts:36-39`
- Modify: `apps/web/src/types.ts:40-43`
- Modify: `config/default.yaml:26-28`
- Test: `apps/web/test/config-schema.test.ts`

- [ ] **Step 1: Add the failing tests**

In `apps/web/test/config-schema.test.ts`, first add `outputMode: "auto"` to the `baseConfig.display` object (line 34-37):

```ts
  display: {
    fullscreen: true,
    hdmiOutputHint: "auto",
    outputMode: "auto"
  },
```

Then append these tests at the end of the file:

```ts
test("validateConfig accepts a concrete output mode", () => {
  const parsed = validateConfig({
    ...baseConfig,
    display: { ...baseConfig.display, outputMode: "1920x1080@60" }
  });
  assert.equal(parsed.display.outputMode, "1920x1080@60");
});

test("validateConfig rejects a malformed output mode", () => {
  assert.throws(() => {
    validateConfig({
      ...baseConfig,
      display: { ...baseConfig.display, outputMode: "1080p" }
    });
  });
});

test("validateConfig defaults outputMode to auto when omitted", () => {
  const parsed = validateConfig({
    ...baseConfig,
    display: { fullscreen: true, hdmiOutputHint: "auto" }
  });
  assert.equal(parsed.display.outputMode, "auto");
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm --filter @ndi-monitor/web test`
Expected: FAIL — `outputMode` not in schema/type (typecheck + assertion failures).

- [ ] **Step 3: Add `outputMode` to the zod schema**

In `apps/web/src/config/schema.ts`, replace `displayConfigSchema` (lines 36-39):

```ts
const displayConfigSchema = z.object({
  fullscreen: z.boolean(),
  hdmiOutputHint: z.string().min(1),
  outputMode: z
    .string()
    .regex(/^(auto|\d{3,5}x\d{3,5}@\d{1,3})$/, "outputMode must be 'auto' or '<W>x<H>@<Hz>'")
    .default("auto")
}).strict();
```

- [ ] **Step 4: Add `outputMode` to the `AppConfig` type**

In `apps/web/src/types.ts`, update the `display` block (lines 40-43):

```ts
  display: {
    fullscreen: boolean;
    hdmiOutputHint: string;
    outputMode: string;
  };
```

- [ ] **Step 5: Add the default to `config/default.yaml`**

In `config/default.yaml`, update the `display` block (lines 26-28):

```yaml
display:
  fullscreen: true
  hdmiOutputHint: auto
  outputMode: auto
```

- [ ] **Step 6: Run the tests, verify they pass**

Run: `pnpm --filter @ndi-monitor/web test && pnpm --filter @ndi-monitor/web typecheck`
Expected: PASS — all tests green, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/config/schema.ts apps/web/src/types.ts config/default.yaml apps/web/test/config-schema.test.ts
git commit -m "feat(web): add display.outputMode config with validation"
```

---

## Task 7: Node — status types + parsing for modes

**Files:**
- Modify: `apps/web/src/types.ts:104-121` (ReceiverStatusFile), `:79-102` (ReceiverRuntimeStatus)
- Modify: `apps/web/src/receiver/status.ts`
- Test: `apps/web/test/status.test.ts`

- [ ] **Step 1: Add the failing test**

In `apps/web/test/status.test.ts`, add `outputMode: "auto"` to the `config.display` block (lines 31-34) so it matches the updated `AppConfig` type:

```ts
  display: {
    fullscreen: true,
    hdmiOutputHint: "auto",
    outputMode: "auto"
  },
```

Add the new status fields to the `snapshot` object (after `lastError: null` on line 57):

```ts
    outputMode: "1920x1080@60",
    outputModeFallback: false,
    availableModes: [
      { id: "1920x1080@60", width: 1920, height: 1080, refreshRate: 60, isNative: true, isCurrent: true }
    ],
```

Add assertions inside the existing test (after line 65):

```ts
  assert.equal(merged.outputMode, "1920x1080@60");
  assert.equal(merged.outputModeFallback, false);
  assert.equal(merged.availableModes.length, 1);
  assert.equal(merged.availableModes[0].refreshRate, 60);
```

And add a new test for missing-field defaults (older receiver):

```ts
test("createInitialStatus defaults the mode fields", () => {
  const initial = createInitialStatus(config);
  assert.equal(initial.outputMode, null);
  assert.equal(initial.outputModeFallback, false);
  assert.deepEqual(initial.availableModes, []);
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @ndi-monitor/web test`
Expected: FAIL — `outputMode`/`availableModes` not on the status types (typecheck/assertion failures).

- [ ] **Step 3: Add the `DisplayMode` type and status fields**

In `apps/web/src/types.ts`, add a `DisplayMode` interface (place it just before `ReceiverRuntimeStatus`, around line 78):

```ts
export interface DisplayMode {
  id: string;
  width: number;
  height: number;
  refreshRate: number;
  isNative: boolean;
  isCurrent: boolean;
}
```

Add three fields to `ReceiverRuntimeStatus` (after `lastError` on line 95):

```ts
  outputMode: string | null;
  outputModeFallback: boolean;
  availableModes: DisplayMode[];
```

Add the same three fields to `ReceiverStatusFile` (after `lastError` on line 119):

```ts
  outputMode: string | null;
  outputModeFallback: boolean;
  availableModes: DisplayMode[];
```

- [ ] **Step 4: Default and overlay the fields in `status.ts`**

In `apps/web/src/receiver/status.ts`, add to the object returned by `createInitialStatus` (after `lastError: null` on line 20):

```ts
    outputMode: null,
    outputModeFallback: false,
    availableModes: [],
```

And add to the object returned by `mergeStatusFile` (after `lastError: snapshot.lastError` on line 50). Use nullish fallbacks so older status payloads without these fields don't break:

```ts
    outputMode: snapshot.outputMode ?? null,
    outputModeFallback: snapshot.outputModeFallback ?? false,
    availableModes: snapshot.availableModes ?? current.availableModes,
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `pnpm --filter @ndi-monitor/web test && pnpm --filter @ndi-monitor/web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/types.ts apps/web/src/receiver/status.ts apps/web/test/status.test.ts
git commit -m "feat(web): carry output mode and available modes through status"
```

---

## Task 8: Node — pass `--output-mode` to the receiver

**Files:**
- Modify: `apps/web/src/receiver/receiver-supervisor.ts:340-376`

- [ ] **Step 1: Add the flag to `buildRunArguments`**

In `apps/web/src/receiver/receiver-supervisor.ts`, in `buildRunArguments`, add two array entries after the `--hdmi-output-hint` pair (after line 364, `config.display.hdmiOutputHint,`):

```ts
      "--output-mode",
      config.display.outputMode,
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @ndi-monitor/web typecheck`
Expected: PASS — no type errors.

- [ ] **Step 3: Run the backend tests (regression)**

Run: `pnpm --filter @ndi-monitor/web test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/receiver/receiver-supervisor.ts
git commit -m "feat(web): pass --output-mode to the native receiver"
```

---

## Task 9: Web UI — mirror config + status types

**Files:**
- Modify: `apps/web-ui/src/api/types.ts:56-63` (AppConfig.display), `:85-108` (ReceiverRuntimeStatus)

- [ ] **Step 1: Add `outputMode` to the mirrored `AppConfig`**

In `apps/web-ui/src/api/types.ts`, update the `display` block (lines 56-59):

```ts
  display: {
    fullscreen: boolean;
    hdmiOutputHint: string;
    outputMode: string;
  };
```

- [ ] **Step 2: Add `DisplayMode` + status fields**

In `apps/web-ui/src/api/types.ts`, add the `DisplayMode` interface (just before `ReceiverRuntimeStatus`, around line 84):

```ts
export interface DisplayMode {
  id: string;
  width: number;
  height: number;
  refreshRate: number;
  isNative: boolean;
  isCurrent: boolean;
}
```

Add three fields to `ReceiverRuntimeStatus` (after `lastError` on line 101):

```ts
  outputMode: string | null;
  outputModeFallback: boolean;
  availableModes: DisplayMode[];
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @ndi-monitor/web-ui typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web-ui/src/api/types.ts
git commit -m "feat(web-ui): mirror output mode config and status types"
```

---

## Task 10: Web UI — resolution selector in Settings

**Files:**
- Modify: `apps/web-ui/src/api/options.ts`
- Modify: `apps/web-ui/src/screens/Settings.tsx:13-19` (imports), `:528-548` (DEVICE & DISPLAY accordion)

- [ ] **Step 1: Add a label helper**

In `apps/web-ui/src/api/options.ts`, add at the end of the file:

```ts
import type { DisplayMode } from './types.ts';

export function formatDisplayModeLabel(mode: DisplayMode): string {
  const native = mode.isNative ? ' · native' : '';
  return `${mode.width}×${mode.height} · ${mode.refreshRate} Hz${native}`;
}
```

- [ ] **Step 2: Import the helper and `DisplayMode` in Settings**

In `apps/web-ui/src/screens/Settings.tsx`, add `DisplayMode` to the type import (line 13-19):

```tsx
import type {
  AppConfig,
  BandwidthMode,
  ColorFormat,
  DisplayMode,
  LogLevel,
  ScaleMode,
} from '../api/types.ts';
```

And add `formatDisplayModeLabel` to the options import (line 20-29), e.g. append it to the existing import list from `'../api/options.ts'`:

```tsx
  SCALE_MODE_LABELS,
  SCALE_MODES,
  formatDisplayModeLabel,
} from '../api/options.ts';
```

- [ ] **Step 3: Add the resolution `<select>` to the DEVICE & DISPLAY accordion**

In `apps/web-ui/src/screens/Settings.tsx`, inside the `<Accordion title="DEVICE & DISPLAY" ...>` block, add this `Field` right after the `FULLSCREEN OUTPUT` `ToggleRow` (after line 536, before the `HDMI OUTPUT HINT` field). It reads available modes from `status` (already destructured from `useAppState()` on line 48):

```tsx
            <Field label="HDMI OUTPUT RESOLUTION" hint="DRM MODESET">
              <select
                value={draft.display.outputMode}
                onChange={(e) => {
                  const v = e.target.value;
                  mutate((d) => ({ ...d, display: { ...d.display, outputMode: v } }), true);
                }}
              >
                <option value="auto">Auto (native)</option>
                {(status?.availableModes ?? []).map((m: DisplayMode) => (
                  <option key={m.id} value={m.id}>
                    {formatDisplayModeLabel(m)}
                  </option>
                ))}
                {draft.display.outputMode !== 'auto' &&
                  !(status?.availableModes ?? []).some((m) => m.id === draft.display.outputMode) && (
                    <option value={draft.display.outputMode}>
                      {draft.display.outputMode} (not currently detected)
                    </option>
                  )}
              </select>
            </Field>
```

- [ ] **Step 4: Add the cold-start hint and fallback warning**

In `apps/web-ui/src/screens/Settings.tsx`, directly after the new `Field` from Step 3, add:

```tsx
            {(status?.availableModes ?? []).length === 0 && (
              <p className="note">Start the receiver once to detect available display modes.</p>
            )}
            {status?.outputModeFallback && (
              <p className="note" style={{ color: 'var(--red)' }}>
                Requested mode unavailable — receiver is using the native display mode.
              </p>
            )}
```

- [ ] **Step 5: Typecheck and build**

Run: `pnpm --filter @ndi-monitor/web-ui typecheck && pnpm --filter @ndi-monitor/web-ui build`
Expected: PASS — type-clean, Vite build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web-ui/src/api/options.ts apps/web-ui/src/screens/Settings.tsx
git commit -m "feat(web-ui): add HDMI output resolution selector to settings"
```

---

## Task 11: Documentation

**Files:**
- Modify: `docs/DEPLOYMENT_PI5.md`
- Modify: `docs/OPERATIONS.md`

- [ ] **Step 1: Document resolution control in OPERATIONS.md**

In `docs/OPERATIONS.md`, add a section:

```markdown
## HDMI output resolution

By default the receiver uses the display's native resolution (`display.outputMode: auto`)
and scales the NDI frame to fit. To force a specific HDMI output mode (e.g. drive a
4K-capable display at 1080p to reduce GPU load):

1. Open the web UI → **Settings → Advanced → DEVICE & DISPLAY**.
2. Pick a mode from **HDMI OUTPUT RESOLUTION**. The list is populated from the modes the
   connected display advertises; it appears after the receiver has run at least once.
3. Saving restarts the receiver and applies the new mode via a DRM modeset.

If the configured mode is unavailable (e.g. a different monitor was attached), the
receiver falls back to the native mode, logs a warning, and the UI shows
"Requested mode unavailable". The appliance never goes dark.

The mode list is detected once per receiver start. To re-detect after swapping the
display, restart the receiver (any settings change does this).
```

- [ ] **Step 2: Document the config field in DEPLOYMENT_PI5.md**

In `docs/DEPLOYMENT_PI5.md`, in the configuration reference, add under the `display` block:

```markdown
- `display.outputMode`: `auto` (use native display mode) or `<W>x<H>@<Hz>` such as
  `1920x1080@60`. A concrete value performs a real DRM modeset via SDL2 KMSDRM; an
  unavailable value falls back to the native mode. Available modes are reported by the
  running receiver and shown in the web UI after the first start.
```

- [ ] **Step 3: Commit**

```bash
git add docs/OPERATIONS.md docs/DEPLOYMENT_PI5.md
git commit -m "docs: document HDMI output resolution control"
```

---

## Self-Review Notes

- **Spec coverage:** Config (Task 6) · CLI flag (Task 2) · renderer modeset + enumeration + fallback (Tasks 1, 4) · status fields (Tasks 3, 7) · Node arg passing (Task 8) · UI selector + cold-start + fallback chip (Tasks 9, 10) · tests (Tasks 1, 2, 3, 6, 7) · docs (Task 11). All spec sections map to a task.
- **Type consistency:** `DisplayMode` fields (`id/width/height/refreshRate/isNative/isCurrent`) are identical across the C++ JSON, `apps/web` types, and `apps/web-ui` mirror. Status fields `outputMode` / `outputModeFallback` / `availableModes` are named identically in C++ (`output_mode` / `output_mode_fallback` / `available_modes` → JSON `outputMode` / `outputModeFallback` / `availableModes`) and both TS layers.
- **Open hardware-verification point (carried from spec):** SDL/KMSDRM mode enumeration on the Pi 5 is marked with an inline NOTE in `renderer.cpp` (Task 4, Step 2) — it cannot be validated without an attached HDMI display.
```
