#pragma once

#include <string>

#include "cli.h"

namespace ndi_receiver {

enum class LogCategory { kStartup, kNdi, kVideo, kAudio, kRender, kReconnect, kError };

std::string now_iso8601();
std::string json_escape(const std::string& value);
std::string to_string(LogCategory category);

class Logger {
 public:
  Logger(LogLevel level, bool json_logs);

  void Trace(LogCategory category, const std::string& message) const;
  void Debug(LogCategory category, const std::string& message) const;
  void Info(LogCategory category, const std::string& message) const;
  void Warn(LogCategory category, const std::string& message) const;
  void Error(LogCategory category, const std::string& message) const;

  void EmitEvent(const std::string& type, const std::string& message = "",
                 const std::string& source_name = "") const;

 private:
  void Write(LogLevel level, LogCategory category, const std::string& message) const;
  bool ShouldWrite(LogLevel level) const;

  LogLevel level_;
  bool json_logs_;
};

}  // namespace ndi_receiver
