#pragma once

#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <vector>

#include "../cli.h"

namespace ndi_receiver {

struct NdiSource {
  std::string id;
  std::string name;
  std::string address;
  std::vector<std::string> groups;
};

struct VideoFrame {
  int width = 0;
  int height = 0;
  double fps = 0.0;
  int stride_bytes = 0;
  const std::uint8_t* pixels = nullptr;
  std::vector<std::uint8_t> owned_rgba;
  std::function<void()> release;

  VideoFrame() = default;
  VideoFrame(const VideoFrame&) = delete;
  VideoFrame& operator=(const VideoFrame&) = delete;
  VideoFrame(VideoFrame&&) = default;
  VideoFrame& operator=(VideoFrame&&) = default;
  ~VideoFrame() {
    if (release) {
      release();
    }
  }

  const std::uint8_t* Data() const {
    if (pixels != nullptr) {
      return pixels;
    }
    return owned_rgba.empty() ? nullptr : owned_rgba.data();
  }
};

enum class PollResultKind { kFrame, kTimeout, kDisconnected, kFatal };

struct PollResult {
  PollResultKind kind = PollResultKind::kTimeout;
  VideoFrame frame;
  std::string message;
  bool audio_active = false;
};

class INdiBackend {
 public:
  virtual ~INdiBackend() = default;

  virtual std::vector<NdiSource> Discover(int timeout_ms) = 0;
  virtual bool Connect(const RunOptions& options, std::string* error_message) = 0;
  virtual PollResult Poll(int timeout_ms) = 0;
  virtual void Disconnect() = 0;
};

std::unique_ptr<INdiBackend> CreateNdiBackend();
bool NdiSdkAvailable();

}  // namespace ndi_receiver
