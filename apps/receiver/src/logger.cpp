#include "logger.h"

#include <chrono>
#include <ctime>
#include <iomanip>
#include <iostream>
#include <sstream>

namespace ndi_receiver {

namespace {

int severity(LogLevel level) {
  switch (level) {
    case LogLevel::kTrace:
      return 0;
    case LogLevel::kDebug:
      return 1;
    case LogLevel::kInfo:
      return 2;
    case LogLevel::kWarn:
      return 3;
    case LogLevel::kError:
      return 4;
  }
  return 2;
}

}  // namespace

std::string now_iso8601() {
  const auto now = std::chrono::system_clock::now();
  const std::time_t time = std::chrono::system_clock::to_time_t(now);
  const auto milliseconds =
      std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;

  std::tm utc_time {};
  gmtime_r(&time, &utc_time);

  std::ostringstream output;
  output << std::put_time(&utc_time, "%Y-%m-%dT%H:%M:%S") << '.' << std::setw(3)
         << std::setfill('0') << milliseconds.count() << 'Z';
  return output.str();
}

std::string json_escape(const std::string& value) {
  std::ostringstream output;
  for (const char character : value) {
    switch (character) {
      case '"':
        output << "\\\"";
        break;
      case '\\':
        output << "\\\\";
        break;
      case '\n':
        output << "\\n";
        break;
      case '\r':
        output << "\\r";
        break;
      case '\t':
        output << "\\t";
        break;
      default:
        output << character;
        break;
    }
  }
  return output.str();
}

std::string to_string(LogCategory category) {
  switch (category) {
    case LogCategory::kStartup:
      return "startup";
    case LogCategory::kNdi:
      return "ndi";
    case LogCategory::kVideo:
      return "video";
    case LogCategory::kAudio:
      return "audio";
    case LogCategory::kRender:
      return "render";
    case LogCategory::kReconnect:
      return "reconnect";
    case LogCategory::kError:
      return "error";
  }
  return "startup";
}

Logger::Logger(LogLevel level, bool json_logs) : level_(level), json_logs_(json_logs) {}

void Logger::Trace(LogCategory category, const std::string& message) const {
  Write(LogLevel::kTrace, category, message);
}

void Logger::Debug(LogCategory category, const std::string& message) const {
  Write(LogLevel::kDebug, category, message);
}

void Logger::Info(LogCategory category, const std::string& message) const {
  Write(LogLevel::kInfo, category, message);
}

void Logger::Warn(LogCategory category, const std::string& message) const {
  Write(LogLevel::kWarn, category, message);
}

void Logger::Error(LogCategory category, const std::string& message) const {
  Write(LogLevel::kError, category, message);
}

void Logger::EmitEvent(const std::string& type, const std::string& message,
                       const std::string& source_name) const {
  std::cout << "EVENT {\"type\":\"" << json_escape(type) << "\",\"message\":\""
            << json_escape(message) << "\",\"sourceName\":\"" << json_escape(source_name)
            << "\"}" << std::endl;
}

bool Logger::ShouldWrite(LogLevel level) const { return severity(level) >= severity(level_); }

void Logger::Write(LogLevel level, LogCategory category, const std::string& message) const {
  if (!ShouldWrite(level)) {
    return;
  }

  std::ostream& stream = level == LogLevel::kError || level == LogLevel::kWarn ? std::cerr : std::cout;
  if (json_logs_) {
    stream << "{\"ts\":\"" << now_iso8601() << "\",\"level\":\"" << to_string(level)
           << "\",\"category\":\"" << to_string(category) << "\",\"message\":\""
           << json_escape(message) << "\"}" << std::endl;
    return;
  }

  stream << "[" << now_iso8601() << "] " << to_string(level) << " [" << to_string(category)
         << "] " << message << std::endl;
}

}  // namespace ndi_receiver
