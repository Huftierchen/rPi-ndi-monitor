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

    const Uint32 flags = options.fullscreen ? SDL_WINDOW_FULLSCREEN_DESKTOP : 0;
    window_ = SDL_CreateWindow("ndi-receiver", SDL_WINDOWPOS_UNDEFINED, SDL_WINDOWPOS_UNDEFINED, 1280,
                               720, flags);
    if (window_ == nullptr) {
      if (error_message != nullptr) {
        *error_message = SDL_GetError();
      }
      return false;
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

 private:
  SDL_Window* window_ = nullptr;
  SDL_Renderer* renderer_ = nullptr;
  SDL_Texture* texture_ = nullptr;
  int frame_width_ = 0;
  int frame_height_ = 0;
  Uint32 texture_format_ = SDL_PIXELFORMAT_UNKNOWN;
};

#else

class HeadlessRenderer final : public IRenderer {
 public:
  bool Initialize(const RunOptions&, std::string*) override { return true; }

  void Render(const VideoFrame&, ScaleMode) override {
    std::this_thread::sleep_for(std::chrono::milliseconds(2));
  }

  void Shutdown() override {}
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
