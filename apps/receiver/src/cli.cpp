#include "cli.h"

#include <stdexcept>
#include <string>

#include "display_mode.h"

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

ColorFormat parse_color_format(const std::string& value) {
  if (value == "rgba") return ColorFormat::kRgba;
  if (value == "uyvy") return ColorFormat::kUyvy;
  if (value == "fastest") return ColorFormat::kFastest;
  throw std::invalid_argument("Unsupported color format: " + value);
}

bool parse_enabled_flag(const std::string& value) {
  if (value == "enabled" || value == "true") return true;
  if (value == "disabled" || value == "false") return false;
  throw std::invalid_argument("Unsupported boolean flag: " + value);
}

int parse_int_at_least(const std::string& raw, const char* flag, int minimum) {
  const int value = std::stoi(raw);
  if (value < minimum) {
    throw std::invalid_argument(std::string(flag) + " must be >= " + std::to_string(minimum));
  }
  return value;
}

int parse_int_in_range(const std::string& raw, const char* flag, int minimum, int maximum) {
  const int value = std::stoi(raw);
  if (value < minimum || value > maximum) {
    throw std::invalid_argument(std::string(flag) + " must be between " +
                                std::to_string(minimum) + " and " + std::to_string(maximum));
  }
  return value;
}

double parse_double_at_least(const std::string& raw, const char* flag, double minimum) {
  const double value = std::stod(raw);
  if (value < minimum) {
    throw std::invalid_argument(std::string(flag) + " must be >= " + std::to_string(minimum));
  }
  return value;
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
      } else if (is_flag(argument, "--color-format")) {
        options.run.color_format = parse_color_format(require_value(argc, argv, index));
      } else if (is_flag(argument, "--output-fps-cap")) {
        options.run.output_fps_cap =
            parse_int_in_range(require_value(argc, argv, index), "--output-fps-cap", 0, 120);
      } else if (is_flag(argument, "--low-latency-mode")) {
        options.run.low_latency_mode = parse_enabled_flag(require_value(argc, argv, index));
      } else if (is_flag(argument, "--status-file")) {
        options.run.status_file = require_value(argc, argv, index);
      } else if (is_flag(argument, "--json-logs")) {
        options.run.json_logs = true;
      } else if (is_flag(argument, "--fullscreen")) {
        options.run.fullscreen = parse_enabled_flag(require_value(argc, argv, index));
      } else if (is_flag(argument, "--hdmi-output-hint")) {
        options.run.hdmi_output_hint = require_value(argc, argv, index);
      } else if (is_flag(argument, "--output-mode")) {
        const std::string value = require_value(argc, argv, index);
        if (!IsValidOutputModeSpec(value)) {
          throw std::invalid_argument("Unsupported output mode (use auto or WxH@Hz): " + value);
        }
        options.run.output_mode = value;
      } else if (is_flag(argument, "--device-name")) {
        options.run.device_name = require_value(argc, argv, index);
      } else if (is_flag(argument, "--reconnect-enabled")) {
        options.run.reconnect_enabled = parse_enabled_flag(require_value(argc, argv, index));
      } else if (is_flag(argument, "--reconnect-initial-delay-ms")) {
        options.run.reconnect_initial_delay_ms = parse_int_at_least(
            require_value(argc, argv, index), "--reconnect-initial-delay-ms", 100);
      } else if (is_flag(argument, "--reconnect-max-delay-ms")) {
        options.run.reconnect_max_delay_ms =
            parse_int_at_least(require_value(argc, argv, index), "--reconnect-max-delay-ms", 100);
      } else if (is_flag(argument, "--reconnect-backoff-multiplier")) {
        options.run.reconnect_backoff_multiplier = parse_double_at_least(
            require_value(argc, argv, index), "--reconnect-backoff-multiplier", 1.0);
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
      if (options.run.reconnect_initial_delay_ms > options.run.reconnect_max_delay_ms) {
        throw std::invalid_argument(
            "--reconnect-initial-delay-ms must be less than or equal to --reconnect-max-delay-ms");
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
        options.discover.timeout_ms =
            parse_int_at_least(require_value(argc, argv, index), "--timeout-ms", 1);
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
  --color-format rgba|uyvy|fastest
  --output-fps-cap VALUE
  --low-latency-mode enabled|disabled
  --json-logs
  --fullscreen enabled|disabled
  --hdmi-output-hint VALUE
  --output-mode auto|WxH@Hz
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

std::string to_string(ColorFormat format) {
  switch (format) {
    case ColorFormat::kRgba:
      return "rgba";
    case ColorFormat::kUyvy:
      return "uyvy";
    case ColorFormat::kFastest:
      return "fastest";
  }
  return "fastest";
}

}  // namespace ndi_receiver
