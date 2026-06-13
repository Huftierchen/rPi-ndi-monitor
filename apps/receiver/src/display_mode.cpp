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
