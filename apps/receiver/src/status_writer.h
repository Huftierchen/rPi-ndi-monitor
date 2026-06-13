#pragma once

#include <string>
#include <vector>

#include "display_mode.h"

namespace ndi_receiver {

struct ReceiverStatusSnapshot {
  std::string lifecycle = "stopped";
  std::string connection_state = "idle";
  std::string source_name;
  bool audio_enabled = false;
  bool video_active = false;
  bool audio_active = false;
  std::string resolution;
  double fps = 0.0;
  int dropped_video_frames = 0;
  int dropped_audio_frames = 0;
  int video_queue_depth = 0;
  int audio_queue_depth = 0;
  std::string started_at;
  int uptime_seconds = 0;
  std::string last_error;
  std::string output_mode = "auto";
  bool output_mode_fallback = false;
  std::vector<DisplayMode> available_modes;
  std::string updated_at;
};

std::string serialize_status_snapshot_json(const ReceiverStatusSnapshot& snapshot);

class StatusWriter {
 public:
  explicit StatusWriter(std::string path);

  void Write(const ReceiverStatusSnapshot& snapshot) const;
  const std::string& path() const;

 private:
  std::string path_;
};

}  // namespace ndi_receiver
