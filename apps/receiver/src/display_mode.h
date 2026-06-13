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
