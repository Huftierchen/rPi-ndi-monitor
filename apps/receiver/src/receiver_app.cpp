#include "receiver_app.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <memory>
#include <thread>

#include "ndi/ndi_backend.h"
#include "render/renderer.h"

namespace ndi_receiver {

ReceiverApp::ReceiverApp(RunOptions options, Logger logger, StatusWriter status_writer,
                         std::atomic<bool>& stop_requested)
    : options_(std::move(options)),
      logger_(std::move(logger)),
      status_writer_(std::move(status_writer)),
      stop_requested_(stop_requested) {
  status_.source_name = options_.source_name;
  status_.audio_enabled = options_.audio_enabled;
  status_.updated_at = now_iso8601();
}

int ReceiverApp::Run() {
  auto backend = CreateNdiBackend();
  auto renderer = CreateRenderer();

  std::string renderer_error;
  if (!renderer->Initialize(options_, &renderer_error)) {
    status_.last_error = renderer_error;
    UpdateStatus("error", "fatal", renderer_error);
    logger_.Error(LogCategory::kRender, "Renderer initialization failed: " + renderer_error);
    logger_.EmitEvent("fatal-error", renderer_error, options_.source_name);
    return static_cast<int>(ExitCode::kRendererFailure);
  }

  logger_.Info(LogCategory::kStartup, "Receiver starting for source '" + options_.source_name + "'");
  logger_.EmitEvent("starting", "", options_.source_name);
  status_.started_at = now_iso8601();

  int reconnect_attempt = 0;
  while (!stop_requested_.load()) {
    std::string connect_error;
    if (!backend->Connect(options_, &connect_error)) {
      UpdateStatus("error", "source-not-found", connect_error);
      logger_.Warn(LogCategory::kNdi, connect_error);
      logger_.EmitEvent("source-missing", connect_error, options_.source_name);

      if (!options_.reconnect_enabled) {
        renderer->Shutdown();
        return static_cast<int>(ExitCode::kSourceUnavailable);
      }

      ++reconnect_attempt;
      const int delay = std::min(
          options_.reconnect_max_delay_ms,
          static_cast<int>(std::round(options_.reconnect_initial_delay_ms *
                                      std::pow(options_.reconnect_backoff_multiplier,
                                               reconnect_attempt - 1))));
      logger_.Info(LogCategory::kReconnect,
                   "Retrying source lookup in " + std::to_string(delay) + "ms");
      logger_.EmitEvent("reconnecting", connect_error, options_.source_name);
      SleepWithStop(delay);
      continue;
    }

    reconnect_attempt = 0;
    UpdateStatus("running", "connected");
    logger_.Info(LogCategory::kNdi, "Connected to source '" + options_.source_name + "'");
    logger_.EmitEvent("source-found", "", options_.source_name);
    logger_.EmitEvent("connected", "", options_.source_name);

    const auto started_at = std::chrono::steady_clock::now();
    while (!stop_requested_.load()) {
      const PollResult result = backend->Poll(1000);
      if (result.kind == PollResultKind::kTimeout) {
        continue;
      }
      if (result.kind == PollResultKind::kFatal) {
        UpdateStatus("error", "fatal", result.message);
        logger_.Error(LogCategory::kError, result.message);
        logger_.EmitEvent("fatal-error", result.message, options_.source_name);
        backend->Disconnect();
        renderer->Shutdown();
        return static_cast<int>(ExitCode::kReceiveFailure);
      }
      if (result.kind == PollResultKind::kDisconnected) {
        UpdateStatus("error", "disconnected", result.message);
        logger_.Warn(LogCategory::kNdi, result.message);
        logger_.EmitEvent("disconnected", result.message, options_.source_name);
        backend->Disconnect();
        break;
      }

      renderer->Render(result.frame, options_.scale_mode);
      status_.video_active = true;
      status_.audio_active = result.audio_active;
      status_.resolution =
          std::to_string(result.frame.width) + "x" + std::to_string(result.frame.height);
      status_.fps = result.frame.fps;
      status_.uptime_seconds = static_cast<int>(
          std::chrono::duration_cast<std::chrono::seconds>(std::chrono::steady_clock::now() -
                                                           started_at)
              .count());
      UpdateStatus("running", "connected");
    }

    backend->Disconnect();
    if (stop_requested_.load()) {
      break;
    }

    if (!options_.reconnect_enabled) {
      renderer->Shutdown();
      return static_cast<int>(ExitCode::kSourceUnavailable);
    }
    logger_.Info(LogCategory::kReconnect, "Source disconnected, reconnect loop continues");
    logger_.EmitEvent("reconnecting", "Source disconnected", options_.source_name);
    SleepWithStop(options_.reconnect_initial_delay_ms);
  }

  UpdateStatus("stopped", "idle");
  renderer->Shutdown();
  logger_.Info(LogCategory::kStartup, "Receiver stopped");
  return static_cast<int>(ExitCode::kOk);
}

void ReceiverApp::UpdateStatus(const std::string& lifecycle, const std::string& connection_state,
                               const std::string& error_message) {
  status_.lifecycle = lifecycle;
  status_.connection_state = connection_state;
  status_.last_error = error_message;
  status_.updated_at = now_iso8601();
  status_writer_.Write(status_);
}

void ReceiverApp::SleepWithStop(int delay_ms) const {
  int remaining = delay_ms;
  while (remaining > 0 && !stop_requested_.load()) {
    const int slice = std::min(remaining, 100);
    std::this_thread::sleep_for(std::chrono::milliseconds(slice));
    remaining -= slice;
  }
}

}  // namespace ndi_receiver
