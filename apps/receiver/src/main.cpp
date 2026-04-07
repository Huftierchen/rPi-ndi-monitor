#include <atomic>
#include <csignal>
#include <exception>
#include <iostream>

#include "cli.h"
#include "logger.h"
#include "ndi/ndi_backend.h"
#include "receiver_app.h"
#include "status_writer.h"

namespace ndi_receiver {
namespace {

std::atomic<bool> g_stop_requested(false);

void signal_handler(int) { g_stop_requested.store(true); }

std::string render_sources_json(const std::vector<NdiSource>& sources) {
  std::string output = "[";
  for (std::size_t index = 0; index < sources.size(); ++index) {
    const auto& source = sources[index];
    output += "{\"id\":\"" + json_escape(source.id) + "\",\"name\":\"" + json_escape(source.name) +
              "\",\"address\":\"" + json_escape(source.address) + "\",\"groups\":[";
    for (std::size_t group_index = 0; group_index < source.groups.size(); ++group_index) {
      output += "\"" + json_escape(source.groups[group_index]) + "\"";
      if (group_index + 1 < source.groups.size()) {
        output += ",";
      }
    }
    output += "]}";
    if (index + 1 < sources.size()) {
      output += ",";
    }
  }
  output += "]";
  return output;
}

}  // namespace
}  // namespace ndi_receiver

int main(int argc, char** argv) {
  using namespace ndi_receiver;

  std::signal(SIGINT, signal_handler);
  std::signal(SIGTERM, signal_handler);

  try {
    const CliOptions options = parse_cli(argc, argv);
    if (options.command == CommandKind::kHelp) {
      std::cout << render_help();
      return static_cast<int>(ExitCode::kOk);
    }

    if (options.command == CommandKind::kDiscover) {
      Logger logger(LogLevel::kInfo, false);
      auto backend = CreateNdiBackend();
      const auto sources = backend->Discover(options.discover.timeout_ms);
      if (options.discover.json) {
        std::cout << render_sources_json(sources) << std::endl;
      } else {
        for (const auto& source : sources) {
          std::cout << source.name << " (" << source.address << ")" << std::endl;
        }
      }
      if (!NdiSdkAvailable() && sources.empty()) {
        logger.Warn(LogCategory::kNdi,
                    "Discovery returned no sources in stub mode. Set NDI_RECEIVER_STUB_SOURCE for local demo discovery.");
      }
      return static_cast<int>(ExitCode::kOk);
    }

    Logger logger(options.run.log_level, options.run.json_logs);
    StatusWriter status_writer(options.run.status_file);
    ReceiverApp app(options.run, logger, status_writer, g_stop_requested);
    return app.Run();
  } catch (const std::exception& error) {
    std::cerr << "fatal: " << error.what() << std::endl;
    return static_cast<int>(ExitCode::kInvalidArguments);
  }
}
