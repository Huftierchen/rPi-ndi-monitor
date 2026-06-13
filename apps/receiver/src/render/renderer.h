#pragma once

#include <memory>
#include <string>
#include <vector>

#include "../cli.h"
#include "../display_mode.h"
#include "../ndi/ndi_backend.h"

namespace ndi_receiver {

class IRenderer {
 public:
  virtual ~IRenderer() = default;

  // Sets up the fullscreen HDMI output path.
  virtual bool Initialize(const RunOptions& options, std::string* error_message) = 0;
  // Presents a single frame using the configured scaling mode.
  virtual void Render(const VideoFrame& frame, ScaleMode scale_mode) = 0;
  virtual void Shutdown() = 0;

  // Modes advertised by the connected display, captured during Initialize.
  virtual std::vector<DisplayMode> AvailableModes() const = 0;
  // The mode actually applied: "auto" (native) or "WxH@Hz".
  virtual std::string AppliedMode() const = 0;
  // True if a concrete mode was requested but unavailable, so native was used.
  virtual bool ModeFallback() const = 0;
};

std::unique_ptr<IRenderer> CreateRenderer();

}  // namespace ndi_receiver
