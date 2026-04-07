#pragma once

#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <vector>

#include "../cli.h"

namespace ndi_receiver {

// Discovery metadata for a single NDI source as exposed to the web control plane.
struct NdiSource {
  std::string id;
  std::string name;
  std::string address;
  std::vector<std::string> groups;
  std::string resolution;
  double fps = 0.0;
  int connection_count = 0;
  std::string web_control_url;
};

enum class VideoPixelFormat { kRgba, kRgbx, kBgra, kBgrx, kUyvy };

// Owns a received video frame until the renderer is finished with it.
struct VideoFrame {
  int width = 0;
  int height = 0;
  double fps = 0.0;
  int stride_bytes = 0;
  VideoPixelFormat pixel_format = VideoPixelFormat::kRgba;
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

struct BackendDiagnostics {
  int dropped_video_frames = 0;
  int dropped_audio_frames = 0;
  int video_queue_depth = 0;
  int audio_queue_depth = 0;
};

class INdiBackend {
 public:
  virtual ~INdiBackend() = default;

  // Runs a short discovery pass without disturbing any active playback instance.
  virtual std::vector<NdiSource> Discover(int timeout_ms) = 0;
  // Connects a new receiver instance for the configured source and runtime options.
  virtual bool Connect(const RunOptions& options, std::string* error_message) = 0;
  // Returns the next receiver event, frame, or timeout snapshot.
  virtual PollResult Poll(int timeout_ms) = 0;
  // Exposes queue depth and drop counters from the underlying NDI runtime.
  virtual BackendDiagnostics GetDiagnostics() = 0;
  virtual void Disconnect() = 0;
};

std::unique_ptr<INdiBackend> CreateNdiBackend();
bool NdiSdkAvailable();

}  // namespace ndi_receiver
