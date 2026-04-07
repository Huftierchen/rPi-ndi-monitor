#pragma once

#include <memory>
#include <string>

#include "../cli.h"
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
};

std::unique_ptr<IRenderer> CreateRenderer();

}  // namespace ndi_receiver
