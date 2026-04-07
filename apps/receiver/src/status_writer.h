#pragma once

#include <string>

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
  std::string started_at;
  int uptime_seconds = 0;
  std::string last_error;
  std::string updated_at;
};

class StatusWriter {
 public:
  explicit StatusWriter(std::string path);

  void Write(const ReceiverStatusSnapshot& snapshot) const;
  const std::string& path() const;

 private:
  std::string path_;
};

}  // namespace ndi_receiver
