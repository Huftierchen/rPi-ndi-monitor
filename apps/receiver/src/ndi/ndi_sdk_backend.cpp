#include "ndi_backend.h"

#ifdef NDI_SDK_AVAILABLE

#include <Processing.NDI.Lib.h>

#include <algorithm>
#include <atomic>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>

#ifdef HAVE_SDL2
#include <SDL2/SDL.h>
#endif

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
      NdiSource source;
      source.id = sources[index].p_ndi_name ? sources[index].p_ndi_name : "";
      source.name = sources[index].p_ndi_name ? sources[index].p_ndi_name : "";
      source.address = sources[index].p_ip_address ? sources[index].p_ip_address : "";
      result.push_back(std::move(source));
    }

    NDIlib_find_destroy(find_instance_);
    find_instance_ = nullptr;
    return result;
  }

  bool Connect(const RunOptions& options, std::string* error_message) override {
    Disconnect();

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

    NDIlib_recv_create_v3_t recv_desc = NDIlib_recv_create_v3_t();
    recv_desc.color_format = NDIlib_recv_color_format_RGBX_RGBA;
    recv_desc.bandwidth = options.bandwidth_mode == BandwidthMode::kLowest
                              ? NDIlib_recv_bandwidth_lowest
                              : NDIlib_recv_bandwidth_highest;
    recv_desc.allow_video_fields = false;
    receiver_instance_ = NDIlib_recv_create_v3(&recv_desc);
    if (receiver_instance_ == nullptr) {
      if (error_message != nullptr) {
        *error_message = "Failed to create NDI receiver instance";
      }
      return false;
    }

    NDIlib_source_t source_desc {};
    source_desc.p_ndi_name = match->name.c_str();
    source_desc.p_url_address = nullptr;
    NDIlib_recv_connect(receiver_instance_, &source_desc);
    audio_enabled_ = options.audio_enabled;

    if (audio_enabled_) {
      StartAudioOutput();
    }

    return true;
  }

  PollResult Poll(int timeout_ms) override {
    if (receiver_instance_ == nullptr) {
      PollResult result;
      result.kind = PollResultKind::kFatal;
      result.message = "Receiver is not connected";
      return result;
    }

    NDIlib_video_frame_v2_t video_frame {};
    NDIlib_audio_frame_v3_t audio_frame {};
    NDIlib_metadata_frame_t metadata_frame {};

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
        frame.stride_bytes = video_frame.line_stride_in_bytes;
        frame.pixels = static_cast<const std::uint8_t*>(video_frame.p_data);
        frame.release = [instance = receiver_instance_, video_frame]() mutable {
          if (instance != nullptr && video_frame.p_data != nullptr) {
            NDIlib_recv_free_video_v2(instance, &video_frame);
            video_frame.p_data = nullptr;
          }
        };
        PollResult result;
        result.kind = PollResultKind::kFrame;
        result.frame = std::move(frame);
        result.audio_active = audio_active_.load();
        return result;
      }
      case NDIlib_frame_type_audio:
        NDIlib_recv_free_audio_v3(receiver_instance_, &audio_frame);
        return PollResult{.kind = PollResultKind::kTimeout,
                          .audio_active = audio_enabled_ || audio_active_.load()};
      case NDIlib_frame_type_none:
        return PollResult{.kind = PollResultKind::kTimeout, .audio_active = audio_active_.load()};
      case NDIlib_frame_type_metadata:
        NDIlib_recv_free_metadata(receiver_instance_, &metadata_frame);
        return PollResult{.kind = PollResultKind::kTimeout, .audio_active = audio_active_.load()};
      case NDIlib_frame_type_status_change:
      case NDIlib_frame_type_source_change:
        return PollResult{.kind = PollResultKind::kTimeout, .audio_active = audio_active_.load()};
      case NDIlib_frame_type_error:
      default:
        return PollResult{.kind = PollResultKind::kDisconnected,
                          .message = "NDI capture reported disconnect",
                          .audio_active = false};
    }
  }

  void Disconnect() override {
    StopAudioOutput();

    if (receiver_instance_ != nullptr) {
      NDIlib_recv_destroy(receiver_instance_);
      receiver_instance_ = nullptr;
    }
    if (find_instance_ != nullptr) {
      NDIlib_find_destroy(find_instance_);
      find_instance_ = nullptr;
    }
    audio_enabled_ = false;
    audio_active_.store(false);
  }

 private:
  static void AudioCallback(void* userdata, Uint8* stream, int length) {
#ifdef HAVE_SDL2
    auto* self = static_cast<NdiSdkBackend*>(userdata);
    self->FillAudioBuffer(stream, length);
#else
    (void)userdata;
    (void)stream;
    (void)length;
#endif
  }

  void StartAudioOutput() {
#ifdef HAVE_SDL2
    if (receiver_instance_ == nullptr || audio_device_ != 0) {
      return;
    }

    if ((SDL_WasInit(SDL_INIT_AUDIO) & SDL_INIT_AUDIO) == 0) {
      SDL_InitSubSystem(SDL_INIT_AUDIO);
    }

    framesync_instance_ = NDIlib_framesync_create(receiver_instance_);
    if (framesync_instance_ == nullptr) {
      return;
    }

    SDL_AudioSpec desired {};
    desired.freq = 48000;
    desired.format = AUDIO_F32SYS;
    desired.channels = 2;
    desired.samples = 1024;
    desired.callback = &NdiSdkBackend::AudioCallback;
    desired.userdata = this;

    SDL_AudioSpec obtained {};
    audio_device_ = SDL_OpenAudioDevice(nullptr, 0, &desired, &obtained,
                                        SDL_AUDIO_ALLOW_CHANNELS_CHANGE |
                                            SDL_AUDIO_ALLOW_FREQUENCY_CHANGE);
    if (audio_device_ == 0) {
      NDIlib_framesync_destroy(framesync_instance_);
      framesync_instance_ = nullptr;
      return;
    }

    audio_spec_ = obtained;
    SDL_PauseAudioDevice(audio_device_, 0);
#endif
  }

  void StopAudioOutput() {
#ifdef HAVE_SDL2
    if (audio_device_ != 0) {
      SDL_CloseAudioDevice(audio_device_);
      audio_device_ = 0;
    }
    if (framesync_instance_ != nullptr) {
      NDIlib_framesync_destroy(framesync_instance_);
      framesync_instance_ = nullptr;
    }
#endif
  }

  void FillAudioBuffer(Uint8* stream, int length) {
#ifdef HAVE_SDL2
    std::memset(stream, 0, static_cast<std::size_t>(length));
    if (!audio_enabled_ || framesync_instance_ == nullptr || audio_spec_.channels <= 0 ||
        audio_spec_.freq <= 0) {
      audio_active_.store(false);
      return;
    }

    const int frame_count =
        length / static_cast<int>(sizeof(float) * static_cast<std::size_t>(audio_spec_.channels));
    if (frame_count <= 0) {
      audio_active_.store(false);
      return;
    }

    NDIlib_audio_frame_v2_t audio_frame;
    NDIlib_framesync_capture_audio(framesync_instance_, &audio_frame, audio_spec_.freq,
                                   audio_spec_.channels, frame_count);
    if (audio_frame.no_samples <= 0 || audio_frame.p_data == nullptr) {
      audio_active_.store(false);
      return;
    }

    auto* output = reinterpret_cast<float*>(stream);
    const int output_channels = audio_spec_.channels;
    const int frames_to_copy = std::min(frame_count, audio_frame.no_samples);
    for (int channel = 0; channel < std::min(output_channels, audio_frame.no_channels); ++channel) {
      const auto* source = reinterpret_cast<const float*>(
          reinterpret_cast<const std::uint8_t*>(audio_frame.p_data) +
          channel * audio_frame.channel_stride_in_bytes);
      for (int frame = 0; frame < frames_to_copy; ++frame) {
        output[frame * output_channels + channel] = source[frame];
      }
    }

    audio_active_.store(true);
    NDIlib_framesync_free_audio(framesync_instance_, &audio_frame);
#else
    (void)stream;
    (void)length;
#endif
  }

  NDIlib_find_instance_t find_instance_ = nullptr;
  NDIlib_recv_instance_t receiver_instance_ = nullptr;
  NDIlib_framesync_instance_t framesync_instance_ = nullptr;
  bool audio_enabled_ = false;
  std::atomic<bool> audio_active_ = false;
#ifdef HAVE_SDL2
  SDL_AudioDeviceID audio_device_ = 0;
  SDL_AudioSpec audio_spec_ {};
#endif
};

}  // namespace

std::unique_ptr<INdiBackend> CreateNdiBackend() { return std::make_unique<NdiSdkBackend>(); }

bool NdiSdkAvailable() { return true; }

}  // namespace ndi_receiver

#endif
