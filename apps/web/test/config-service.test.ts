import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { ConfigService } from "../src/config/service.js";
import type { RuntimePaths } from "../src/types.js";

function createPaths(root: string): RuntimePaths {
  return {
    repoRoot: root,
    runtimeRoot: path.join(root, "runtime"),
    configFile: path.join(root, "etc", "config.yaml"),
    defaultConfigFile: path.join(root, "defaults", "config.yaml"),
    dataDir: path.join(root, "var", "lib"),
    logDir: path.join(root, "var", "log"),
    receiverStatusFile: path.join(root, "var", "lib", "receiver-status.json"),
    webLogFile: path.join(root, "var", "log", "web.log"),
    receiverLogFile: path.join(root, "var", "log", "receiver.log"),
    receiverBinary: path.join(root, "bin", "ndi-receiver")
  };
}

const defaultYaml = `server:
  host: 0.0.0.0
  port: 8080
receiver:
  sourceName: Studio
  audioEnabled: false
  scaleMode: contain
  bandwidthMode: highest
  colorFormat: fastest
  outputFpsCap: 0
  lowLatencyMode: true
  autoStart: false
  reconnect:
    enabled: true
    initialDelayMs: 1000
    maxDelayMs: 5000
    backoffMultiplier: 1.8
logging:
  level: info
  maxFiles: 5
  maxSizeMb: 20
  json: false
display:
  fullscreen: true
  hdmiOutputHint: auto
device:
  name: pi
`;

test("ConfigService.ensureReady copies the default config when missing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ndi-monitor-config-"));
  const paths = createPaths(root);
  await mkdir(path.dirname(paths.defaultConfigFile), { recursive: true });
  await writeFile(paths.defaultConfigFile, defaultYaml, "utf8");

  const service = new ConfigService(paths);
  const config = await service.ensureReady();

  assert.equal(config.receiver.sourceName, "Studio");
  const persisted = await readFile(paths.configFile, "utf8");
  assert.match(persisted, /sourceName: Studio/);
});
