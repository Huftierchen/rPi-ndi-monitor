#pragma once

#include <atomic>

#include "cli.h"
#include "logger.h"
#include "status_writer.h"

namespace ndi_receiver {

class ReceiverApp {
 public:
  ReceiverApp(RunOptions options, Logger logger, StatusWriter status_writer,
              std::atomic<bool>& stop_requested);

  int Run();

 private:
  void UpdateStatus(const std::string& lifecycle, const std::string& connection_state,
                    const std::string& error_message = "");
  void SleepWithStop(int delay_ms) const;

  RunOptions options_;
  Logger logger_;
  StatusWriter status_writer_;
  std::atomic<bool>& stop_requested_;
  ReceiverStatusSnapshot status_;
};

}  // namespace ndi_receiver
