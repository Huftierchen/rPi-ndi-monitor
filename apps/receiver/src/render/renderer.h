#pragma once

#include <memory>
#include <string>

#include "../cli.h"
#include "../ndi/ndi_backend.h"

namespace ndi_receiver {

class IRenderer {
 public:
  virtual ~IRenderer() = default;

  virtual bool Initialize(const RunOptions& options, std::string* error_message) = 0;
  virtual void Render(const VideoFrame& frame, ScaleMode scale_mode) = 0;
  virtual void Shutdown() = 0;
};

std::unique_ptr<IRenderer> CreateRenderer();

}  // namespace ndi_receiver
