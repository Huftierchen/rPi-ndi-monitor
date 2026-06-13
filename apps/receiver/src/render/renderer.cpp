#include "renderer.h"

#include <algorithm>
#include <chrono>
#include <string>
#include <thread>

#ifdef HAVE_SDL2
#include <SDL2/SDL.h>
#endif

namespace ndi_receiver {

namespace {

#ifdef HAVE_SDL2

SDL_Rect CalculateDestinationRect(int target_width, int target_height, int frame_width,
                                  int frame_height, ScaleMode mode) {
  if (mode == ScaleMode::kStretch) {
    return SDL_Rect{0, 0, target_width, target_height};
  }

  const double source_aspect = static_cast<double>(frame_width) / static_cast<double>(frame_height);
  const double target_aspect =
      static_cast<double>(target_width) / static_cast<double>(target_height);

  int width = target_width;
  int height = target_height;

  if ((mode == ScaleMode::kContain && source_aspect > target_aspect) ||
      (mode == ScaleMode::kCover && source_aspect < target_aspect)) {
    height = static_cast<int>(target_width / source_aspect);
  } else {
    width = static_cast<int>(target_height * source_aspect);
  }

  return SDL_Rect{(target_width - width) / 2, (target_height - height) / 2, width, height};
}

Uint32 to_sdl_pixel_format(VideoPixelFormat format) {
  switch (format) {
    case VideoPixelFormat::kRgba:
      return SDL_PIXELFORMAT_RGBA8888;
    case VideoPixelFormat::kRgbx:
      return SDL_PIXELFORMAT_RGBX8888;
    case VideoPixelFormat::kBgra:
      return SDL_PIXELFORMAT_BGRA8888;
    case VideoPixelFormat::kBgrx:
      return SDL_PIXELFORMAT_BGRX8888;
    case VideoPixelFormat::kUyvy:
      return SDL_PIXELFORMAT_UYVY;
  }
  return SDL_PIXELFORMAT_RGBA8888;
}

class SdlRenderer final : public IRenderer {
 public:
  bool Initialize(const RunOptions& options, std::string* error_message) override {
    SDL_SetHint(SDL_HINT_RENDER_SCALE_QUALITY, "linear");
    if (SDL_Init(SDL_INIT_VIDEO) != 0) {
      if (error_message != nullptr) {
        *error_message = SDL_GetError();
      }
      return false;
    }

    // Enumerate the connected display's modes for the web UI to choose from.
    // NOTE: Verify on real Pi 5 hardware that SDL/KMSDRM enumerates every CEA
    // mode advertised by the display via the DRM connector modes. This cannot be
    // validated without an attached HDMI display.
    SDL_DisplayMode current_mode;
    const bool have_current = SDL_GetCurrentDisplayMode(0, &current_mode) == 0;
    const int mode_count = SDL_GetNumDisplayModes(0);
    for (int i = 0; i < mode_count; ++i) {
      SDL_DisplayMode m;
      if (SDL_GetDisplayMode(0, i, &m) != 0) {
        continue;
      }
      DisplayMode entry;
      entry.width = m.w;
      entry.height = m.h;
      entry.refresh_rate = m.refresh_rate;
      entry.is_native = (i == 0);  // SDL lists modes largest-first; index 0 is native.
      entry.is_current =
          have_current && m.w == current_mode.w && m.h == current_mode.h &&
          m.refresh_rate == current_mode.refresh_rate;
      available_modes_.push_back(entry);
    }

    const ModeSelection selection = SelectDisplayMode(available_modes_, options.output_mode);
    mode_fallback_ = selection.is_fallback;

    Uint32 flags = 0;
    int window_width = 1280;
    int window_height = 720;
    if (options.fullscreen) {
      flags = selection.use_native ? SDL_WINDOW_FULLSCREEN_DESKTOP : SDL_WINDOW_FULLSCREEN;
    }
    if (!selection.use_native) {
      window_width = selection.chosen.width;
      window_height = selection.chosen.height;
      applied_mode_ = FormatDisplayMode(selection.chosen);
    } else {
      applied_mode_ = "auto";
    }

    window_ = SDL_CreateWindow("ndi-receiver", SDL_WINDOWPOS_UNDEFINED, SDL_WINDOWPOS_UNDEFINED,
                               window_width, window_height, flags);
    if (window_ == nullptr) {
      if (error_message != nullptr) {
        *error_message = SDL_GetError();
      }
      return false;
    }

    if (!selection.use_native) {
      SDL_DisplayMode target;
      SDL_zero(target);
      target.w = selection.chosen.width;
      target.h = selection.chosen.height;
      target.refresh_rate = selection.chosen.refresh_rate;
      SDL_DisplayMode closest;
      if (SDL_GetClosestDisplayMode(0, &target, &closest) != nullptr) {
        SDL_SetWindowDisplayMode(window_, &closest);
      }
    }

    renderer_ = SDL_CreateRenderer(window_, -1, SDL_RENDERER_ACCELERATED);
    if (renderer_ == nullptr) {
      if (error_message != nullptr) {
        *error_message = SDL_GetError();
      }
      return false;
    }

    SDL_ShowCursor(SDL_DISABLE);

    return true;
  }

  void Render(const VideoFrame& frame, ScaleMode scale_mode) override {
    if (renderer_ == nullptr) {
      return;
    }
    const auto* pixels = frame.Data();
    if (pixels == nullptr || frame.stride_bytes <= 0) {
      return;
    }

    const Uint32 texture_format = to_sdl_pixel_format(frame.pixel_format);
    if (texture_ == nullptr || frame.width != frame_width_ || frame.height != frame_height_ ||
        texture_format != texture_format_) {
      if (texture_ != nullptr) {
        SDL_DestroyTexture(texture_);
      }
      texture_ = SDL_CreateTexture(renderer_, texture_format, SDL_TEXTUREACCESS_STREAMING,
                                   frame.width, frame.height);
      frame_width_ = frame.width;
      frame_height_ = frame.height;
      texture_format_ = texture_format;
      if (texture_ == nullptr) {
        return;
      }
      SDL_SetTextureBlendMode(texture_, SDL_BLENDMODE_NONE);
    }

    SDL_UpdateTexture(texture_, nullptr, pixels, frame.stride_bytes);
    int target_width = 0;
    int target_height = 0;
    SDL_GetRendererOutputSize(renderer_, &target_width, &target_height);
    const SDL_Rect destination =
        CalculateDestinationRect(target_width, target_height, frame.width, frame.height, scale_mode);

    SDL_SetRenderDrawColor(renderer_, 0, 0, 0, 255);
    SDL_RenderClear(renderer_);
    SDL_RenderCopy(renderer_, texture_, nullptr, &destination);
    SDL_RenderPresent(renderer_);
  }

  void Shutdown() override {
    if (texture_ != nullptr) {
      SDL_DestroyTexture(texture_);
      texture_ = nullptr;
    }
    if (renderer_ != nullptr) {
      SDL_DestroyRenderer(renderer_);
      renderer_ = nullptr;
    }
    if (window_ != nullptr) {
      SDL_DestroyWindow(window_);
      window_ = nullptr;
    }
    SDL_Quit();
  }

  std::vector<DisplayMode> AvailableModes() const override { return available_modes_; }
  std::string AppliedMode() const override { return applied_mode_; }
  bool ModeFallback() const override { return mode_fallback_; }

 private:
  SDL_Window* window_ = nullptr;
  SDL_Renderer* renderer_ = nullptr;
  SDL_Texture* texture_ = nullptr;
  int frame_width_ = 0;
  int frame_height_ = 0;
  Uint32 texture_format_ = SDL_PIXELFORMAT_UNKNOWN;
  std::vector<DisplayMode> available_modes_;
  std::string applied_mode_ = "auto";
  bool mode_fallback_ = false;
};

#else

class HeadlessRenderer final : public IRenderer {
 public:
  bool Initialize(const RunOptions&, std::string*) override { return true; }

  void Render(const VideoFrame&, ScaleMode) override {
    std::this_thread::sleep_for(std::chrono::milliseconds(2));
  }

  void Shutdown() override {}

  std::vector<DisplayMode> AvailableModes() const override { return {}; }
  std::string AppliedMode() const override { return "auto"; }
  bool ModeFallback() const override { return false; }
};

#endif

}  // namespace

std::unique_ptr<IRenderer> CreateRenderer() {
#ifdef HAVE_SDL2
  return std::make_unique<SdlRenderer>();
#else
  return std::make_unique<HeadlessRenderer>();
#endif
}

}  // namespace ndi_receiver
