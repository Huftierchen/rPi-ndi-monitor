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

class SdlRenderer final : public IRenderer {
 public:
  bool Initialize(const RunOptions& options, std::string* error_message) override {
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

    if (texture_ == nullptr || frame.width != frame_width_ || frame.height != frame_height_) {
      if (texture_ != nullptr) {
        SDL_DestroyTexture(texture_);
      }
      texture_ = SDL_CreateTexture(renderer_, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_STREAMING,
                                   frame.width, frame.height);
      frame_width_ = frame.width;
      frame_height_ = frame.height;
    }

    SDL_UpdateTexture(texture_, nullptr, frame.rgba.data(), frame.width * 4);
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
