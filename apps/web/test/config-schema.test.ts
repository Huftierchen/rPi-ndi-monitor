import { test } from "node:test";
import assert from "node:assert/strict";

import { appConfigPatchSchema, mergeConfig, validateConfig } from "../src/config/schema.js";
import type { AppConfig } from "../src/types.js";

const baseConfig: AppConfig = {
  server: {
    host: "0.0.0.0",
    port: 8080
  },
  receiver: {
    sourceName: "Studio",
    audioEnabled: false,
    scaleMode: "contain",
    bandwidthMode: "highest",
    colorFormat: "fastest",
    outputFpsCap: 0,
    lowLatencyMode: true,
    autoStart: true,
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
    name: "ndi-monitor-pi5"
  }
};

test("validateConfig accepts a valid configuration", () => {
  assert.equal(validateConfig(baseConfig).receiver.sourceName, "Studio");
  assert.equal(validateConfig(baseConfig).receiver.colorFormat, "fastest");
});

test("mergeConfig updates nested reconnect values", () => {
  const merged = mergeConfig(baseConfig, {
    receiver: {
      reconnect: {
        enabled: true,
        initialDelayMs: 2000,
        maxDelayMs: 7000,
        backoffMultiplier: 2.0
      }
    }
  });

  assert.equal(merged.receiver.reconnect.initialDelayMs, 2000);
  assert.equal(merged.receiver.reconnect.maxDelayMs, 7000);
});

test("validateConfig rejects invalid reconnect timing", () => {
  assert.throws(() => {
    validateConfig({
      ...baseConfig,
      receiver: {
        ...baseConfig.receiver,
        reconnect: {
          ...baseConfig.receiver.reconnect,
          initialDelayMs: 6000,
          maxDelayMs: 5000
        }
      }
    });
  });
});

test("validateConfig fills new receiver performance defaults", () => {
  const parsed = validateConfig({
    ...baseConfig,
    receiver: {
      ...baseConfig.receiver,
      colorFormat: undefined,
      lowLatencyMode: undefined
    }
  });

  assert.equal(parsed.receiver.colorFormat, "fastest");
  assert.equal(parsed.receiver.lowLatencyMode, true);
});

test("appConfigPatchSchema rejects unknown keys", () => {
  assert.throws(() => {
    appConfigPatchSchema.parse({
      receiver: {
        sourceName: "Studio",
        arbitraryPath: "/tmp/nope"
      }
    });
  });
});

test("appConfigPatchSchema accepts nested partial updates", () => {
  const patch = appConfigPatchSchema.parse({
    receiver: {
      reconnect: {
        maxDelayMs: 9000
      }
    }
  });

  assert.equal(patch.receiver?.reconnect?.maxDelayMs, 9000);
});
