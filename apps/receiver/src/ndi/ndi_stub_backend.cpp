#include "ndi_backend.h"

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <thread>

namespace ndi_receiver {

namespace {

std::string configured_stub_source() {
  const char* value = std::getenv("NDI_RECEIVER_STUB_SOURCE");
  if (value == nullptr) {
    return "";
  }
  return value;
}

class StubNdiBackend final : public INdiBackend {
 public:
  std::vector<NdiSource> Discover(int timeout_ms) override {
    std::this_thread::sleep_for(std::chrono::milliseconds(timeout_ms / 4));
    const std::string source = configured_stub_source();
    if (source.empty()) {
      return {};
    }

    return {NdiSource{
        .id = "stub-source-1",
        .name = source,
        .address = "stub://localhost",
        .groups = {"stub", "demo"},
    }};
  }

  bool Connect(const RunOptions& options, std::string* error_message) override {
    source_name_ = configured_stub_source();
    if (source_name_.empty()) {
      if (error_message != nullptr) {
        *error_message =
            "NDI SDK unavailable in this build. Set NDI_RECEIVER_STUB_SOURCE for local demo mode or rebuild with the NDI SDK.";
      }
      return false;
    }
    if (options.source_name != source_name_) {
      if (error_message != nullptr) {
        *error_message = "Configured source not available in stub mode: " + options.source_name;
      }
      return false;
    }

    connected_ = true;
    frame_index_ = 0;
    return true;
  }

  PollResult Poll(int timeout_ms) override {
    if (!connected_) {
      return {.kind = PollResultKind::kDisconnected, .message = "Stub backend is disconnected"};
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(timeout_ms > 50 ? 33 : timeout_ms));

    VideoFrame frame;
    frame.width = 1280;
    frame.height = 720;
    frame.fps = 30.0;
    frame.stride_bytes = frame.width * 4;
    frame.owned_rgba.resize(static_cast<std::size_t>(frame.width * frame.height * 4));

    for (int y = 0; y < frame.height; ++y) {
      for (int x = 0; x < frame.width; ++x) {
        const int index = (y * frame.width + x) * 4;
        const double phase = (static_cast<double>(frame_index_) / 10.0);
        frame.owned_rgba[static_cast<std::size_t>(index)] =
            static_cast<std::uint8_t>((std::sin((x / 40.0) + phase) + 1.0) * 127.0);
        frame.owned_rgba[static_cast<std::size_t>(index + 1)] =
            static_cast<std::uint8_t>((std::sin((y / 34.0) + phase) + 1.0) * 127.0);
        frame.owned_rgba[static_cast<std::size_t>(index + 2)] =
            static_cast<std::uint8_t>((std::sin(((x + y) / 55.0) + phase) + 1.0) * 127.0);
        frame.owned_rgba[static_cast<std::size_t>(index + 3)] = 255;
      }
    }
    frame.pixels = frame.owned_rgba.data();

    ++frame_index_;
    return {.kind = PollResultKind::kFrame, .frame = std::move(frame), .audio_active = false};
  }

  void Disconnect() override { connected_ = false; }

 private:
  bool connected_ = false;
  std::string source_name_;
  int frame_index_ = 0;
};

}  // namespace

#ifndef NDI_SDK_AVAILABLE

std::unique_ptr<INdiBackend> CreateNdiBackend() { return std::make_unique<StubNdiBackend>(); }

bool NdiSdkAvailable() { return false; }

#endif

}  // namespace ndi_receiver
