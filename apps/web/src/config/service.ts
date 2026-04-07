import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import YAML from "yaml";

import type { AppConfig, RuntimePaths } from "../types.js";
import { mergeConfig, validateConfig, type AppConfigPatch } from "./schema.js";

export class ConfigService {
  private config: AppConfig | null = null;

  public constructor(private readonly paths: RuntimePaths) {}

  public async ensureReady(): Promise<AppConfig> {
    await mkdir(path.dirname(this.paths.configFile), { recursive: true });
    await mkdir(this.paths.dataDir, { recursive: true });
    await mkdir(this.paths.logDir, { recursive: true });

    try {
      await readFile(this.paths.configFile, "utf8");
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : null;
      if (code !== "ENOENT") {
        throw error;
      }
      await copyFile(this.paths.defaultConfigFile, this.paths.configFile);
    }

    return this.load();
  }

  public async load(): Promise<AppConfig> {
    const raw = await readFile(this.paths.configFile, "utf8");
    const parsed = YAML.parse(raw);
    this.config = validateConfig(parsed);
    return this.config;
  }

  public getCached(): AppConfig {
    if (!this.config) {
      throw new Error("Configuration has not been loaded yet");
    }

    return this.config;
  }

  public async save(nextConfig: AppConfig): Promise<AppConfig> {
    const validated = validateConfig(nextConfig);
    const serialized = YAML.stringify(validated, {
      indent: 2,
      lineWidth: 120
    });
    await writeFile(this.paths.configFile, serialized, "utf8");
    this.config = validated;
    return validated;
  }

  public async update(patch: AppConfigPatch): Promise<AppConfig> {
    const current = this.getCached();
    const merged = mergeConfig(current, patch);
    return this.save(merged);
  }
}
