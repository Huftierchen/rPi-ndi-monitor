#include "status_writer.h"

#include <filesystem>
#include <fstream>
#include <stdexcept>

#include "logger.h"

namespace ndi_receiver {

namespace {

std::string maybe_string(const std::string& value) {
  if (value.empty()) {
    return "null";
  }
  return "\"" + json_escape(value) + "\"";
}

std::string serialize_snapshot_body(const ReceiverStatusSnapshot& snapshot) {
  return "\"lifecycle\": \"" + json_escape(snapshot.lifecycle) + "\",\n" +
         "  \"connectionState\": \"" + json_escape(snapshot.connection_state) + "\",\n" +
         "  \"sourceName\": " + maybe_string(snapshot.source_name) + ",\n" +
         "  \"audioEnabled\": " + std::string(snapshot.audio_enabled ? "true" : "false") + ",\n" +
         "  \"videoActive\": " + std::string(snapshot.video_active ? "true" : "false") + ",\n" +
         "  \"audioActive\": " + std::string(snapshot.audio_active ? "true" : "false") + ",\n" +
         "  \"resolution\": " + maybe_string(snapshot.resolution) + ",\n" +
         "  \"fps\": " + std::to_string(snapshot.fps) + ",\n" +
         "  \"droppedVideoFrames\": " + std::to_string(snapshot.dropped_video_frames) + ",\n" +
         "  \"droppedAudioFrames\": " + std::to_string(snapshot.dropped_audio_frames) + ",\n" +
         "  \"videoQueueDepth\": " + std::to_string(snapshot.video_queue_depth) + ",\n" +
         "  \"audioQueueDepth\": " + std::to_string(snapshot.audio_queue_depth) + ",\n" +
         "  \"startedAt\": " + maybe_string(snapshot.started_at) + ",\n" +
         "  \"uptimeSeconds\": " + std::to_string(snapshot.uptime_seconds) + ",\n" +
         "  \"lastError\": " + maybe_string(snapshot.last_error) + ",\n" +
         "  \"updatedAt\": \"" + json_escape(snapshot.updated_at) + "\"\n";
}

}  // namespace

StatusWriter::StatusWriter(std::string path) : path_(std::move(path)) {}

std::string serialize_status_snapshot_json(const ReceiverStatusSnapshot& snapshot) {
  return "{\n  " + serialize_snapshot_body(snapshot) + "}";
}

void StatusWriter::Write(const ReceiverStatusSnapshot& snapshot) const {
  const std::filesystem::path target(path_);
  std::filesystem::create_directories(target.parent_path());
  const std::filesystem::path temp = target.string() + ".tmp";

  std::ofstream output(temp, std::ios::trunc);
  if (!output.is_open()) {
    throw std::runtime_error("Failed to open status temp file for writing: " + temp.string());
  }
  output << serialize_status_snapshot_json(snapshot) << "\n";
  if (!output.good()) {
    throw std::runtime_error("Failed to write receiver status snapshot: " + temp.string());
  }
  output.close();
  if (output.fail()) {
    throw std::runtime_error("Failed to flush receiver status snapshot: " + temp.string());
  }

  std::error_code rename_error;
  std::filesystem::rename(temp, target, rename_error);
  if (rename_error) {
    throw std::runtime_error("Failed to promote receiver status snapshot: " +
                             rename_error.message());
  }
}

const std::string& StatusWriter::path() const { return path_; }

}  // namespace ndi_receiver
