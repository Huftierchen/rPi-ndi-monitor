import path from "node:path";
import { accessSync, constants } from "node:fs";
import { fileURLToPath } from "node:url";

import type { RuntimePaths } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../..");

function exists(candidate: string): boolean {
  try {
    accessSync(candidate, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveRuntimePaths(): RuntimePaths {
  const explicitRuntimeRoot = process.env.NDI_MONITOR_RUNTIME_ROOT;
  const explicitConfig = process.env.NDI_MONITOR_CONFIG_PATH;
  const explicitReceiverBinary = process.env.NDI_MONITOR_RECEIVER_BINARY;

  const productionConfig = "/etc/ndi-receiver/config.yaml";
  const useProductionLayout =
    !explicitRuntimeRoot && !explicitConfig && exists(productionConfig);

  const runtimeRoot = explicitRuntimeRoot
    ? path.resolve(explicitRuntimeRoot)
    : useProductionLayout
      ? "/var/lib/ndi-receiver"
      : path.join(repoRoot, "runtime");

  const configFile = explicitConfig
    ? path.resolve(explicitConfig)
    : useProductionLayout
      ? productionConfig
      : path.join(runtimeRoot, "config", "config.yaml");

  const defaultConfigFile = path.join(repoRoot, "config", "default.yaml");
  const dataDir = runtimeRoot;
  const logDir = useProductionLayout
    ? "/var/log/ndi-receiver"
    : path.join(runtimeRoot, "logs");
  const receiverBinary = explicitReceiverBinary
    ? path.resolve(explicitReceiverBinary)
    : useProductionLayout
      ? "/opt/ndi-monitor/bin/ndi-receiver"
      : path.join(repoRoot, "apps", "receiver", "build", "ndi-receiver");

  return {
    repoRoot,
    runtimeRoot,
    configFile,
    defaultConfigFile,
    dataDir,
    logDir,
    receiverStatusFile: path.join(dataDir, "receiver-status.json"),
    webLogFile: path.join(logDir, "web.log"),
    receiverLogFile: path.join(logDir, "receiver.log"),
    receiverBinary
  };
}
