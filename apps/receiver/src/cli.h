#pragma once

#include <string>

namespace ndi_receiver {

enum class ExitCode {
  kOk = 0,
  kInvalidArguments = 2,
  kInitializationFailure = 3,
  kSourceUnavailable = 4,
  kSdkUnavailable = 5,
  kRendererFailure = 6,
  kReceiveFailure = 7
};

enum class LogLevel { kTrace, kDebug, kInfo, kWarn, kError };
enum class ScaleMode { kContain, kCover, kStretch };
enum class CommandKind { kRun, kDiscover, kHelp };

struct RunOptions {
  std::string source_name;
  bool audio_enabled = false;
  LogLevel log_level = LogLevel::kInfo;
  ScaleMode scale_mode = ScaleMode::kContain;
  std::string status_file;
  bool json_logs = false;
  bool fullscreen = true;
  std::string hdmi_output_hint = "auto";
  std::string device_name = "ndi-monitor-pi5";
  bool reconnect_enabled = true;
  int reconnect_initial_delay_ms = 1000;
  int reconnect_max_delay_ms = 15000;
  double reconnect_backoff_multiplier = 1.8;
};

struct DiscoverOptions {
  bool json = false;
  int timeout_ms = 4000;
};

struct CliOptions {
  CommandKind command = CommandKind::kHelp;
  RunOptions run;
  DiscoverOptions discover;
};

CliOptions parse_cli(int argc, char** argv);
std::string render_help();
std::string to_string(LogLevel level);
std::string to_string(ScaleMode mode);

}  // namespace ndi_receiver
