import { test } from "node:test";
import assert from "node:assert/strict";

import { createInitialStatus, mergeStatusFile } from "../src/receiver/status.js";
import type { AppConfig, ReceiverStatusFile } from "../src/types.js";

const config: AppConfig = {
  server: { host: "0.0.0.0", port: 8080 },
  receiver: {
    sourceName: "Studio",
    audioEnabled: true,
    scaleMode: "contain",
    bandwidthMode: "highest",
    autoStart: false,
    reconnect: {
      enabled: true,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 1.8
    }
  },
  logging: {
    level: "info",
    maxFiles: 5,
    maxSizeMb: 20,
    json: false
  },
  display: {
    fullscreen: true,
    hdmiOutputHint: "auto"
  },
  device: {
    name: "pi5"
  }
};

test("mergeStatusFile overlays runtime fields from the receiver", () => {
  const initial = createInitialStatus(config);
  const snapshot: ReceiverStatusFile = {
    lifecycle: "running",
    connectionState: "connected",
    sourceName: "Studio",
    audioEnabled: true,
    videoActive: true,
    audioActive: false,
    resolution: "1920x1080",
    fps: 50,
    startedAt: "2026-04-07T18:00:00.000Z",
    uptimeSeconds: 12,
    lastError: null,
    updatedAt: "2026-04-07T18:00:12.000Z"
  };

  const merged = mergeStatusFile(initial, snapshot);
  assert.equal(merged.lifecycle, "running");
  assert.equal(merged.resolution, "1920x1080");
  assert.equal(merged.videoActive, true);
});
