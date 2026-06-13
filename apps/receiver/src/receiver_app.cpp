#include "receiver_app.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <iostream>
#include <memory>
#include <thread>

#include "ndi/ndi_backend.h"
#include "render/renderer.h"

namespace ndi_receiver {

namespace {

void emit_status_event(const ReceiverStatusSnapshot& snapshot) {
  std::string payload = serialize_status_snapshot_json(snapshot);
  payload.erase(std::remove(payload.begin(), payload.end(), '\n'), payload.end());
  std::cout << "EVENT {\"type\":\"status\",\"payload\":" << payload << "}" << std::endl;
}

int compute_reconnect_delay_ms(const RunOptions& options, int reconnect_attempt) {
  const double delay =
      static_cast<double>(options.reconnect_initial_delay_ms) *
      std::pow(options.reconnect_backoff_multiplier, reconnect_attempt - 1);
  if (!std::isfinite(delay)) {
    return options.reconnect_max_delay_ms;
  }

  const double clamped = std::min(delay, static_cast<double>(options.reconnect_max_delay_ms));
  return static_cast<int>(std::round(clamped));
}

}  // namespace

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
    UpdateStatus("error", "fatal", renderer_error, true);
    logger_.Error(LogCategory::kRender, "Renderer initialization failed: " + renderer_error);
    logger_.EmitEvent("fatal-error", renderer_error, options_.source_name);
    return static_cast<int>(ExitCode::kRendererFailure);
  }

  status_.output_mode = renderer->AppliedMode();
  status_.output_mode_fallback = renderer->ModeFallback();
  status_.available_modes = renderer->AvailableModes();
  if (status_.output_mode_fallback) {
    logger_.Warn(LogCategory::kRender,
                 "Requested output mode '" + options_.output_mode +
                     "' unavailable; using native display mode");
  }

  logger_.Info(LogCategory::kStartup, "Receiver starting for source '" + options_.source_name + "'");
  logger_.EmitEvent("starting", "", options_.source_name);
  status_.started_at = now_iso8601();

  int reconnect_attempt = 0;
  const double output_interval_seconds =
      options_.output_fps_cap > 0 ? 1.0 / static_cast<double>(options_.output_fps_cap) : 0.0;
  while (!stop_requested_.load()) {
    std::string connect_error;
    if (!backend->Connect(options_, &connect_error)) {
      UpdateStatus("error", "source-not-found", connect_error, true);
      logger_.Warn(LogCategory::kNdi, connect_error);
      logger_.EmitEvent("source-missing", connect_error, options_.source_name);

      if (!options_.reconnect_enabled) {
        renderer->Shutdown();
        return static_cast<int>(ExitCode::kSourceUnavailable);
      }

      ++reconnect_attempt;
      const int delay = compute_reconnect_delay_ms(options_, reconnect_attempt);
      logger_.Info(LogCategory::kReconnect,
                   "Retrying source lookup in " + std::to_string(delay) + "ms");
      logger_.EmitEvent("reconnecting", connect_error, options_.source_name);
      SleepWithStop(delay);
      continue;
    }

    reconnect_attempt = 0;
    UpdateStatus("running", "connected", "", true);
    logger_.Info(LogCategory::kNdi, "Connected to source '" + options_.source_name + "'");
    logger_.EmitEvent("source-found", "", options_.source_name);
    logger_.EmitEvent("connected", "", options_.source_name);

    const auto started_at = std::chrono::steady_clock::now();
    auto last_rendered_at = std::chrono::steady_clock::time_point{};
    auto last_diagnostics_at = started_at - std::chrono::seconds(1);
    while (!stop_requested_.load()) {
      const PollResult result = backend->Poll(1000);
      if (result.kind == PollResultKind::kTimeout) {
        continue;
      }
      if (result.kind == PollResultKind::kFatal) {
        UpdateStatus("error", "fatal", result.message, true);
        logger_.Error(LogCategory::kError, result.message);
        logger_.EmitEvent("fatal-error", result.message, options_.source_name);
        backend->Disconnect();
        renderer->Shutdown();
        return static_cast<int>(ExitCode::kReceiveFailure);
      }
      if (result.kind == PollResultKind::kDisconnected) {
        UpdateStatus("error", "disconnected", result.message, true);
        logger_.Warn(LogCategory::kNdi, result.message);
        logger_.EmitEvent("disconnected", result.message, options_.source_name);
        backend->Disconnect();
        break;
      }

      const auto now = std::chrono::steady_clock::now();
      bool should_render = true;
      if (output_interval_seconds > 0.0 && last_rendered_at.time_since_epoch().count() != 0) {
        const double elapsed_seconds =
            std::chrono::duration_cast<std::chrono::duration<double>>(now - last_rendered_at)
                .count();
        should_render = elapsed_seconds >= output_interval_seconds;
      }

      if (should_render) {
        renderer->Render(result.frame, options_.scale_mode);
        last_rendered_at = now;
      }

      status_.video_active = true;
      status_.audio_active = result.audio_active;
      status_.resolution =
          std::to_string(result.frame.width) + "x" + std::to_string(result.frame.height);
      status_.fps = result.frame.fps;
      if (std::chrono::duration_cast<std::chrono::milliseconds>(now - last_diagnostics_at).count() >=
          500) {
        const BackendDiagnostics diagnostics = backend->GetDiagnostics();
        status_.dropped_video_frames = diagnostics.dropped_video_frames;
        status_.dropped_audio_frames = diagnostics.dropped_audio_frames;
        status_.video_queue_depth = diagnostics.video_queue_depth;
        status_.audio_queue_depth = diagnostics.audio_queue_depth;
        last_diagnostics_at = now;
      }
      status_.uptime_seconds = static_cast<int>(
          std::chrono::duration_cast<std::chrono::seconds>(now - started_at)
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

  UpdateStatus("stopped", "idle", "", true);
  renderer->Shutdown();
  logger_.Info(LogCategory::kStartup, "Receiver stopped");
  return static_cast<int>(ExitCode::kOk);
}

void ReceiverApp::UpdateStatus(const std::string& lifecycle, const std::string& connection_state,
                               const std::string& error_message, bool force_write) {
  status_.lifecycle = lifecycle;
  status_.connection_state = connection_state;
  status_.last_error = error_message;
  status_.updated_at = now_iso8601();

  const auto now = std::chrono::steady_clock::now();
  const bool interval_elapsed =
      !has_written_status_ ||
      std::chrono::duration_cast<std::chrono::milliseconds>(now - last_status_write_at_).count() >=
          500;
  const bool important_change =
      !has_written_status_ || force_write || status_.lifecycle != last_written_status_.lifecycle ||
      status_.connection_state != last_written_status_.connection_state ||
      status_.last_error != last_written_status_.last_error ||
      status_.source_name != last_written_status_.source_name ||
      status_.video_active != last_written_status_.video_active ||
      status_.audio_active != last_written_status_.audio_active ||
      status_.resolution != last_written_status_.resolution;

  if (!important_change && !interval_elapsed) {
    return;
  }

  emit_status_event(status_);
  if (force_write && !status_writer_.path().empty()) {
    try {
      status_writer_.Write(status_);
    } catch (const std::exception& error) {
      logger_.Warn(LogCategory::kError,
                   "Failed to persist receiver status snapshot: " + std::string(error.what()));
    }
  }
  last_written_status_ = status_;
  last_status_write_at_ = now;
  has_written_status_ = true;
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
