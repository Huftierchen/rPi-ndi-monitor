#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <string>

#include "../src/cli.h"
#include "../src/logger.h"
#include "../src/status_writer.h"

namespace {

void expect(bool condition, const std::string& message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}

void test_status_writer() {
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
  expect(content.find("\"connectionState\": \"connected\"") != std::string::npos,
         "status writer should persist connection state");
  expect(content.find("\"sourceName\": \"Test Source\"") != std::string::npos,
         "status writer should persist source name");
  expect(content.find("\"uptimeSeconds\": 42") != std::string::npos,
         "status writer should persist uptime");
}

void test_json_escape() {
  const std::string escaped = ndi_receiver::json_escape(std::string("line\x01\t\"\\"));
  expect(escaped == "line\\u0001\\t\\\"\\\\", "json_escape should escape control characters");
}

void test_cli_validation() {
  {
    const char* argv[] = {"ndi-receiver", "run", "--source", "Studio", "--status-file",
                          "/tmp/status.json", "--output-fps-cap", "30",
                          "--reconnect-initial-delay-ms", "1000",
                          "--reconnect-max-delay-ms", "5000"};
    const auto options = ndi_receiver::parse_cli(static_cast<int>(std::size(argv)),
                                                 const_cast<char**>(argv));
    expect(options.run.output_fps_cap == 30, "cli should parse valid fps cap");
  }

  {
    const char* argv[] = {"ndi-receiver", "run", "--source", "Studio", "--status-file",
                          "/tmp/status.json", "--output-fps-cap", "-1"};
    bool threw = false;
    try {
      (void)ndi_receiver::parse_cli(static_cast<int>(std::size(argv)), const_cast<char**>(argv));
    } catch (const std::invalid_argument&) {
      threw = true;
    }
    expect(threw, "cli should reject negative fps cap");
  }

  {
    const char* argv[] = {"ndi-receiver", "run", "--source", "Studio", "--status-file",
                          "/tmp/status.json", "--reconnect-initial-delay-ms", "5000",
                          "--reconnect-max-delay-ms", "1000"};
    bool threw = false;
    try {
      (void)ndi_receiver::parse_cli(static_cast<int>(std::size(argv)), const_cast<char**>(argv));
    } catch (const std::invalid_argument&) {
      threw = true;
    }
    expect(threw, "cli should reject reconnect ranges where initial > max");
  }
}

}  // namespace

int main() {
  try {
    test_status_writer();
    test_json_escape();
    test_cli_validation();
  } catch (const std::exception& error) {
    std::cerr << "receiver-tests failed: " << error.what() << "\n";
    return 1;
  }

  std::cout << "receiver-tests passed\n";
  return 0;
}
