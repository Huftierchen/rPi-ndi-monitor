#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>

#include "../src/status_writer.h"

int main() {
  namespace fs = std::filesystem;
  const fs::path temp_dir = fs::temp_directory_path() / "ndi-receiver-tests";
  fs::create_directories(temp_dir);
  const fs::path status_file = temp_dir / "status.json";

  ndi_receiver::StatusWriter writer(status_file.string());
  ndi_receiver::ReceiverStatusSnapshot snapshot;
  snapshot.lifecycle = "running";
  snapshot.connection_state = "connected";
  snapshot.source_name = "Test Source";
  snapshot.audio_enabled = true;
  snapshot.video_active = true;
  snapshot.audio_active = false;
  snapshot.resolution = "1920x1080";
  snapshot.fps = 59.94;
  snapshot.started_at = "2026-01-01T00:00:00.000Z";
  snapshot.uptime_seconds = 42;
  snapshot.updated_at = "2026-01-01T00:00:42.000Z";
  writer.Write(snapshot);

  std::ifstream input(status_file);
  std::string content((std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
  const bool ok = content.find("\"connectionState\": \"connected\"") != std::string::npos &&
                  content.find("\"sourceName\": \"Test Source\"") != std::string::npos &&
                  content.find("\"uptimeSeconds\": 42") != std::string::npos;

  if (!ok) {
    std::cerr << "status_writer_test failed\n";
    return 1;
  }

  std::cout << "status_writer_test passed\n";
  return 0;
}
