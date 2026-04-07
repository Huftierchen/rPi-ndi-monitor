#include "cli.h"

#include <stdexcept>
#include <string>

namespace ndi_receiver {
namespace {

bool is_flag(const std::string& value, const char* flag) { return value == flag; }

LogLevel parse_log_level(const std::string& value) {
  if (value == "trace") return LogLevel::kTrace;
  if (value == "debug") return LogLevel::kDebug;
  if (value == "info") return LogLevel::kInfo;
  if (value == "warn") return LogLevel::kWarn;
  if (value == "error") return LogLevel::kError;
  throw std::invalid_argument("Unsupported log level: " + value);
}

ScaleMode parse_scale_mode(const std::string& value) {
  if (value == "contain") return ScaleMode::kContain;
  if (value == "cover") return ScaleMode::kCover;
  if (value == "stretch") return ScaleMode::kStretch;
  throw std::invalid_argument("Unsupported scale mode: " + value);
}

BandwidthMode parse_bandwidth_mode(const std::string& value) {
  if (value == "highest") return BandwidthMode::kHighest;
  if (value == "lowest") return BandwidthMode::kLowest;
  throw std::invalid_argument("Unsupported bandwidth mode: " + value);
}

bool parse_enabled_flag(const std::string& value) {
  if (value == "enabled" || value == "true") return true;
  if (value == "disabled" || value == "false") return false;
  throw std::invalid_argument("Unsupported boolean flag: " + value);
}

std::string require_value(int argc, char** argv, int& index) {
  if (index + 1 >= argc) {
    throw std::invalid_argument("Missing value for argument: " + std::string(argv[index]));
  }
  ++index;
  return argv[index];
}

}  // namespace

CliOptions parse_cli(int argc, char** argv) {
  CliOptions options;
  if (argc < 2) {
    return options;
  }

  const std::string command = argv[1];
  if (command == "run") {
    options.command = CommandKind::kRun;
    for (int index = 2; index < argc; ++index) {
      const std::string argument = argv[index];
      if (is_flag(argument, "--source")) {
        options.run.source_name = require_value(argc, argv, index);
      } else if (is_flag(argument, "--audio")) {
        options.run.audio_enabled = parse_enabled_flag(require_value(argc, argv, index));
      } else if (is_flag(argument, "--log-level")) {
        options.run.log_level = parse_log_level(require_value(argc, argv, index));
      } else if (is_flag(argument, "--scale-mode")) {
        options.run.scale_mode = parse_scale_mode(require_value(argc, argv, index));
      } else if (is_flag(argument, "--bandwidth-mode")) {
        options.run.bandwidth_mode = parse_bandwidth_mode(require_value(argc, argv, index));
      } else if (is_flag(argument, "--output-fps-cap")) {
        options.run.output_fps_cap = std::stoi(require_value(argc, argv, index));
      } else if (is_flag(argument, "--status-file")) {
        options.run.status_file = require_value(argc, argv, index);
      } else if (is_flag(argument, "--json-logs")) {
        options.run.json_logs = true;
      } else if (is_flag(argument, "--fullscreen")) {
        options.run.fullscreen = parse_enabled_flag(require_value(argc, argv, index));
      } else if (is_flag(argument, "--hdmi-output-hint")) {
        options.run.hdmi_output_hint = require_value(argc, argv, index);
      } else if (is_flag(argument, "--device-name")) {
        options.run.device_name = require_value(argc, argv, index);
      } else if (is_flag(argument, "--reconnect-enabled")) {
        options.run.reconnect_enabled = parse_enabled_flag(require_value(argc, argv, index));
      } else if (is_flag(argument, "--reconnect-initial-delay-ms")) {
        options.run.reconnect_initial_delay_ms = std::stoi(require_value(argc, argv, index));
      } else if (is_flag(argument, "--reconnect-max-delay-ms")) {
        options.run.reconnect_max_delay_ms = std::stoi(require_value(argc, argv, index));
      } else if (is_flag(argument, "--reconnect-backoff-multiplier")) {
        options.run.reconnect_backoff_multiplier = std::stod(require_value(argc, argv, index));
      } else if (is_flag(argument, "--help")) {
        options.command = CommandKind::kHelp;
      } else {
        throw std::invalid_argument("Unknown argument for run: " + argument);
      }
    }

    if (options.command == CommandKind::kRun) {
      if (options.run.source_name.empty()) {
        throw std::invalid_argument("--source is required for run");
      }
      if (options.run.status_file.empty()) {
        throw std::invalid_argument("--status-file is required for run");
      }
    }
    return options;
  }

  if (command == "discover") {
    options.command = CommandKind::kDiscover;
    for (int index = 2; index < argc; ++index) {
      const std::string argument = argv[index];
      if (is_flag(argument, "--json")) {
        options.discover.json = true;
      } else if (is_flag(argument, "--timeout-ms")) {
        options.discover.timeout_ms = std::stoi(require_value(argc, argv, index));
      } else if (is_flag(argument, "--help")) {
        options.command = CommandKind::kHelp;
      } else {
        throw std::invalid_argument("Unknown argument for discover: " + argument);
      }
    }
    return options;
  }

  if (command == "--help" || command == "help") {
    return options;
  }

  throw std::invalid_argument("Unknown command: " + command);
}

std::string render_help() {
  return R"(ndi-receiver

Commands:
  run --source NAME --status-file PATH [options]
  discover [--json] [--timeout-ms 4000]

Run options:
  --audio enabled|disabled
  --log-level trace|debug|info|warn|error
  --scale-mode contain|cover|stretch
  --bandwidth-mode highest|lowest
  --output-fps-cap VALUE
  --json-logs
  --fullscreen enabled|disabled
  --hdmi-output-hint VALUE
  --device-name VALUE
  --reconnect-enabled true|false
  --reconnect-initial-delay-ms VALUE
  --reconnect-max-delay-ms VALUE
  --reconnect-backoff-multiplier VALUE
)";
}

std::string to_string(LogLevel level) {
  switch (level) {
    case LogLevel::kTrace:
      return "trace";
    case LogLevel::kDebug:
      return "debug";
    case LogLevel::kInfo:
      return "info";
    case LogLevel::kWarn:
      return "warn";
    case LogLevel::kError:
      return "error";
  }
  return "info";
}

std::string to_string(ScaleMode mode) {
  switch (mode) {
    case ScaleMode::kContain:
      return "contain";
    case ScaleMode::kCover:
      return "cover";
    case ScaleMode::kStretch:
      return "stretch";
  }
  return "contain";
}

std::string to_string(BandwidthMode mode) {
  switch (mode) {
    case BandwidthMode::kHighest:
      return "highest";
    case BandwidthMode::kLowest:
      return "lowest";
  }
  return "highest";
}

}  // namespace ndi_receiver
