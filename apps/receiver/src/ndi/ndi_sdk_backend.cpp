#include "ndi_backend.h"

#ifdef NDI_SDK_AVAILABLE

#include <Processing.NDI.Lib.h>

#include <algorithm>
#include <cstring>
#include <memory>
#include <string>

namespace ndi_receiver {

namespace {

class NdiSdkBackend final : public INdiBackend {
 public:
  NdiSdkBackend() {
    NDIlib_initialize();
  }

  ~NdiSdkBackend() override {
    Disconnect();
    NDIlib_destroy();
  }

  std::vector<NdiSource> Discover(int timeout_ms) override {
    std::vector<NdiSource> result;

    NDIlib_find_create_t create_desc;
    create_desc.show_local_sources = true;
    find_instance_ = NDIlib_find_create_v2(&create_desc);
    if (find_instance_ == nullptr) {
      return result;
    }

    NDIlib_find_wait_for_sources(find_instance_, timeout_ms);
    uint32_t count = 0;
    const NDIlib_source_t* sources = NDIlib_find_get_current_sources(find_instance_, &count);
    for (uint32_t index = 0; index < count; ++index) {
      result.push_back(NdiSource{
          .id = sources[index].p_ndi_name,
          .name = sources[index].p_ndi_name,
          .address = sources[index].p_ip_address ? sources[index].p_ip_address : "",
          .groups = {},
      });
    }

    NDIlib_find_destroy(find_instance_);
    find_instance_ = nullptr;
    return result;
  }

  bool Connect(const RunOptions& options, std::string* error_message) override {
    const auto sources = Discover(2000);
    const auto match = std::find_if(
        sources.begin(), sources.end(),
        [&options](const NdiSource& source) { return source.name == options.source_name; });
    if (match == sources.end()) {
      if (error_message != nullptr) {
        *error_message = "Requested NDI source not found: " + options.source_name;
      }
      return false;
    }

    NDIlib_recv_create_v3_t recv_desc;
    recv_desc.color_format = NDIlib_recv_color_format_RGBX_RGBA;
    recv_desc.bandwidth = NDIlib_recv_bandwidth_highest;
    recv_desc.allow_video_fields = false;
    receiver_instance_ = NDIlib_recv_create_v3(&recv_desc);
    if (receiver_instance_ == nullptr) {
      if (error_message != nullptr) {
        *error_message = "Failed to create NDI receiver instance";
      }
      return false;
    }

    NDIlib_source_t source_desc;
    source_desc.p_ndi_name = match->name.c_str();
    source_desc.p_ip_address = match->address.empty() ? nullptr : match->address.c_str();
    NDIlib_recv_connect(receiver_instance_, &source_desc);
    return true;
  }

  PollResult Poll(int timeout_ms) override {
    if (receiver_instance_ == nullptr) {
      return {.kind = PollResultKind::kFatal, .message = "Receiver is not connected"};
    }

    NDIlib_video_frame_v2_t video_frame;
    NDIlib_audio_frame_v3_t audio_frame;
    NDIlib_metadata_frame_t metadata_frame;

    switch (NDIlib_recv_capture_v3(receiver_instance_, &video_frame, &audio_frame, &metadata_frame,
                                   timeout_ms)) {
      case NDIlib_frame_type_video: {
        VideoFrame frame;
        frame.width = video_frame.xres;
        frame.height = video_frame.yres;
        frame.fps = video_frame.frame_rate_D != 0
                        ? static_cast<double>(video_frame.frame_rate_N) /
                              static_cast<double>(video_frame.frame_rate_D)
                        : 0.0;
        const std::size_t bytes = static_cast<std::size_t>(frame.width * frame.height * 4);
        frame.rgba.resize(bytes);
        std::memcpy(frame.rgba.data(), video_frame.p_data, bytes);
        NDIlib_recv_free_video_v2(receiver_instance_, &video_frame);
        return {.kind = PollResultKind::kFrame, .frame = std::move(frame),
                .audio_active = audio_frame.no_samples > 0};
      }
      case NDIlib_frame_type_audio:
        NDIlib_recv_free_audio_v3(receiver_instance_, &audio_frame);
        return {.kind = PollResultKind::kTimeout, .audio_active = true};
      case NDIlib_frame_type_none:
        return {.kind = PollResultKind::kTimeout};
      case NDIlib_frame_type_status_change:
        return {.kind = PollResultKind::kTimeout};
      case NDIlib_frame_type_error:
      default:
        return {.kind = PollResultKind::kDisconnected, .message = "NDI capture reported disconnect"};
    }
  }

  void Disconnect() override {
    if (receiver_instance_ != nullptr) {
      NDIlib_recv_destroy(receiver_instance_);
      receiver_instance_ = nullptr;
    }
    if (find_instance_ != nullptr) {
      NDIlib_find_destroy(find_instance_);
      find_instance_ = nullptr;
    }
  }

 private:
  NDIlib_find_instance_t find_instance_ = nullptr;
  NDIlib_recv_instance_t receiver_instance_ = nullptr;
};

}  // namespace

std::unique_ptr<INdiBackend> CreateNdiBackend() { return std::make_unique<NdiSdkBackend>(); }

bool NdiSdkAvailable() { return true; }

}  // namespace ndi_receiver

#endif
