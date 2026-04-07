import { z } from "zod";

import { bandwidthModes, colorFormats, logLevels, scaleModes, type AppConfig } from "../types.js";

export const appConfigSchema = z.object({
  server: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535)
  }),
  receiver: z.object({
    sourceName: z.string(),
    audioEnabled: z.boolean(),
    scaleMode: z.enum(scaleModes),
    bandwidthMode: z.enum(bandwidthModes).default("highest"),
    colorFormat: z.enum(colorFormats).default("fastest"),
    outputFpsCap: z.number().int().min(0).max(120).default(0),
    lowLatencyMode: z.boolean().default(true),
    autoStart: z.boolean(),
    reconnect: z.object({
      enabled: z.boolean(),
      initialDelayMs: z.number().int().min(100),
      maxDelayMs: z.number().int().min(100),
      backoffMultiplier: z.number().min(1)
    })
  }),
  logging: z.object({
    level: z.enum(logLevels),
    maxFiles: z.number().int().min(1).max(100),
    maxSizeMb: z.number().int().min(1).max(1024),
    json: z.boolean()
  }),
  display: z.object({
    fullscreen: z.boolean(),
    hdmiOutputHint: z.string().min(1)
  }),
  device: z.object({
    name: z.string().min(1).max(128)
  })
});

export type AppConfigInput = z.input<typeof appConfigSchema>;
export type AppConfigPatch = Partial<{
  [K in keyof AppConfig]: AppConfig[K] extends object ? Partial<AppConfig[K]> : AppConfig[K];
}>;

export function validateConfig(input: unknown): AppConfig {
  const parsed = appConfigSchema.parse(input);
  if (
    parsed.receiver.reconnect.enabled &&
    parsed.receiver.reconnect.initialDelayMs > parsed.receiver.reconnect.maxDelayMs
  ) {
    throw new Error(
      "receiver.reconnect.initialDelayMs must be less than or equal to maxDelayMs"
    );
  }

  return parsed;
}

export function mergeConfig(base: AppConfig, patch: AppConfigPatch): AppConfig {
  return validateConfig({
    ...base,
    ...patch,
    server: { ...base.server, ...patch.server },
    receiver: {
      ...base.receiver,
      ...patch.receiver,
      reconnect: {
        ...base.receiver.reconnect,
        ...patch.receiver?.reconnect
      }
    },
    logging: { ...base.logging, ...patch.logging },
    display: { ...base.display, ...patch.display },
    device: { ...base.device, ...patch.device }
  });
}
