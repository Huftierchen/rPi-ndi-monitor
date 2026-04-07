#pragma once

#include <atomic>
#include <chrono>

#include "cli.h"
#include "logger.h"
#include "status_writer.h"

namespace ndi_receiver {

// Coordinates the native receive/render loop, reconnect behavior, and status emission.
class ReceiverApp {
 public:
  ReceiverApp(RunOptions options, Logger logger, StatusWriter status_writer,
              std::atomic<bool>& stop_requested);

  // Runs until stopped, a fatal receiver error occurs, or reconnect policy gives up.
  int Run();

 private:
  // Publishes live status events and persists snapshots only for important state changes.
  void UpdateStatus(const std::string& lifecycle, const std::string& connection_state,
                    const std::string& error_message = "", bool force_write = false);
  void SleepWithStop(int delay_ms) const;

  RunOptions options_;
  Logger logger_;
  StatusWriter status_writer_;
  std::atomic<bool>& stop_requested_;
  ReceiverStatusSnapshot status_;
  ReceiverStatusSnapshot last_written_status_;
  std::chrono::steady_clock::time_point last_status_write_at_ {};
  bool has_written_status_ = false;
};

}  // namespace ndi_receiver
