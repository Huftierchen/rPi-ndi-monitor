import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { buildApp } from "../../src/app.js";
import type { RuntimePaths } from "../../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../..");

export async function buildTestApp() {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "ndi-monitor-test-"));
  const logDir = path.join(runtimeRoot, "logs");
  const configDir = path.join(runtimeRoot, "config");

  const paths: RuntimePaths = {
    repoRoot,
    runtimeRoot,
    configFile: path.join(configDir, "config.yaml"),
    defaultConfigFile: path.join(repoRoot, "config", "default.yaml"),
    dataDir: runtimeRoot,
    logDir,
    receiverStatusFile: path.join(runtimeRoot, "receiver-status.json"),
    webLogFile: path.join(logDir, "web.log"),
    receiverLogFile: path.join(logDir, "receiver.log"),
    receiverBinary: path.join(repoRoot, "apps", "receiver", "build", "ndi-receiver")
  };

  let built: Awaited<ReturnType<typeof buildApp>>;
  try {
    built = await buildApp(paths, { installSignalHandlers: false });
    await built.app.ready();
  } catch (err) {
    await rm(runtimeRoot, { recursive: true, force: true });
    throw err;
  }

  return {
    app: built.app,
    paths,
    supervisor: built.supervisor,
    config: built.config,
    logger: built.logger,
    async cleanup() {
      await built.supervisor.dispose();
      await built.app.close();
      await rm(runtimeRoot, { recursive: true, force: true });
    }
  };
}
