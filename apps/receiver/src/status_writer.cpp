#include "status_writer.h"

#include <filesystem>
#include <fstream>

#include "logger.h"

namespace ndi_receiver {

namespace {

std::string maybe_string(const std::string& value) {
  if (value.empty()) {
    return "null";
  }
  return "\"" + json_escape(value) + "\"";
}

}  // namespace

StatusWriter::StatusWriter(std::string path) : path_(std::move(path)) {}

void StatusWriter::Write(const ReceiverStatusSnapshot& snapshot) const {
  const std::filesystem::path target(path_);
  std::filesystem::create_directories(target.parent_path());
  const std::filesystem::path temp = target.string() + ".tmp";

  std::ofstream output(temp, std::ios::trunc);
  output << "{\n"
         << "  \"lifecycle\": \"" << json_escape(snapshot.lifecycle) << "\",\n"
         << "  \"connectionState\": \"" << json_escape(snapshot.connection_state) << "\",\n"
         << "  \"sourceName\": " << maybe_string(snapshot.source_name) << ",\n"
         << "  \"audioEnabled\": " << (snapshot.audio_enabled ? "true" : "false") << ",\n"
         << "  \"videoActive\": " << (snapshot.video_active ? "true" : "false") << ",\n"
         << "  \"audioActive\": " << (snapshot.audio_active ? "true" : "false") << ",\n"
         << "  \"resolution\": " << maybe_string(snapshot.resolution) << ",\n"
         << "  \"fps\": " << snapshot.fps << ",\n"
         << "  \"droppedVideoFrames\": " << snapshot.dropped_video_frames << ",\n"
         << "  \"droppedAudioFrames\": " << snapshot.dropped_audio_frames << ",\n"
         << "  \"videoQueueDepth\": " << snapshot.video_queue_depth << ",\n"
         << "  \"audioQueueDepth\": " << snapshot.audio_queue_depth << ",\n"
         << "  \"startedAt\": " << maybe_string(snapshot.started_at) << ",\n"
         << "  \"uptimeSeconds\": " << snapshot.uptime_seconds << ",\n"
         << "  \"lastError\": " << maybe_string(snapshot.last_error) << ",\n"
         << "  \"updatedAt\": \"" << json_escape(snapshot.updated_at) << "\"\n"
         << "}\n";
  output.close();

  std::filesystem::rename(temp, target);
}

const std::string& StatusWriter::path() const { return path_; }

}  // namespace ndi_receiver
