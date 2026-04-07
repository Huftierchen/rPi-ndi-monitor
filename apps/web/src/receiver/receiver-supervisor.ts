import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";

import { ConfigService } from "../config/service.js";
import { EventBus } from "../events/event-bus.js";
import { AppLogger } from "../logging/app-logger.js";
import { LogStore } from "../logging/log-store.js";
import type {
  AppConfig,
  DiscoverySnapshot,
  DiscoverySource,
  ReceiverRuntimeStatus,
  ReceiverStatusFile,
  RuntimePaths
} from "../types.js";
import { createInitialStatus, mergeStatusFile } from "./status.js";

interface ReceiverEvent {
  type: string;
  message?: string;
  sourceName?: string;
}

export class ReceiverSupervisor {
  private child: ChildProcess | null = null;
  private status: ReceiverRuntimeStatus;
  private discoverySnapshot: DiscoverySnapshot | null = null;
  private statusPollTimer: NodeJS.Timeout | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private stopping = false;
  private controlQueue: Promise<unknown> = Promise.resolve();

  public constructor(
    private readonly paths: RuntimePaths,
    private readonly configService: ConfigService,
    private readonly logStore: LogStore,
    private readonly events: EventBus,
    private readonly logger: AppLogger
  ) {
    this.status = createInitialStatus(this.configService.getCached());
  }

  public async init(): Promise<void> {
    this.startStatusPolling();
    await this.refreshStatusFromFile();

    const config = this.configService.getCached();
    if (config.receiver.autoStart) {
      await this.start();
    }
  }

  public async dispose(): Promise<void> {
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
    }

    await this.stop();
  }

  public getStatus(): ReceiverRuntimeStatus {
    return { ...this.status };
  }

  public getDiscoverySnapshot(): DiscoverySnapshot | null {
    return this.discoverySnapshot;
  }

  public async start(): Promise<ReceiverRuntimeStatus> {
    return this.runExclusive(() => this.startInternal());
  }

  public async stop(): Promise<ReceiverRuntimeStatus> {
    return this.runExclusive(() => this.stopInternal());
  }

  public async restart(): Promise<ReceiverRuntimeStatus> {
    return this.runExclusive(async () => {
      await this.stopInternal();
      return this.startInternal();
    });
  }

  public async reconnect(): Promise<ReceiverRuntimeStatus> {
    return this.restart();
  }

  public async discover(timeoutMs = 4000): Promise<DiscoverySnapshot> {
    return this.runExclusive(() => this.discoverInternal(timeoutMs));
  }

  private async startInternal(): Promise<ReceiverRuntimeStatus> {
    if (this.child) {
      return this.getStatus();
    }

    await this.ensureReceiverBinary();
    const config = this.configService.getCached();
    if (!config.receiver.sourceName) {
      throw new Error("No NDI source configured");
    }

    this.stopping = false;
    this.clearRestartTimer();
    this.applyStatus({
      desiredRunning: true,
      lifecycle: "starting",
      connectionState: "connecting",
      sourceName: config.receiver.sourceName,
      audioEnabled: config.receiver.audioEnabled,
      lastError: null
    });

    const child = spawn(this.paths.receiverBinary, this.buildRunArguments(config), {
      cwd: this.paths.repoRoot,
      env: {
        ...process.env,
        SDL_VIDEODRIVER: process.env.SDL_VIDEODRIVER ?? "kmsdrm",
        SDL_AUDIODRIVER: process.env.SDL_AUDIODRIVER ?? "alsa"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    this.child = child;
    this.applyStatus({
      pid: child.pid ?? null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    child.once("error", (error) => {
      void this.handleChildError(error);
    });

    child.once("exit", (code, signal) => {
      void this.handleChildExit(code, signal);
    });

    if (child.stdout) {
      createInterface({ input: child.stdout }).on("line", (line) => {
        void this.handleChildLine(line, "info");
      });
    }

    if (child.stderr) {
      createInterface({ input: child.stderr }).on("line", (line) => {
        void this.handleChildLine(line, "warn");
      });
    }

    await this.logger.info("Receiver process started", {
      pid: child.pid ?? null,
      sourceName: config.receiver.sourceName
    });

    return this.getStatus();
  }

  private async stopInternal(): Promise<ReceiverRuntimeStatus> {
    this.clearRestartTimer();
    this.status.desiredRunning = false;

    if (!this.child) {
      this.applyStatus({
        lifecycle: "stopped",
        connectionState: "idle",
        pid: null,
        videoActive: false,
        audioActive: false,
        resolution: null,
        fps: null,
        uptimeSeconds: null,
        updatedAt: new Date().toISOString()
      });
      return this.getStatus();
    }

    const child = this.child;
    this.stopping = true;
    this.applyStatus({
      lifecycle: "stopping",
      updatedAt: new Date().toISOString()
    });

    await this.logger.info("Stopping receiver process", { pid: child.pid ?? null });

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.child) {
          this.child.kill("SIGKILL");
        }
      }, 5000);

      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });

      child.kill("SIGTERM");
    });

    return this.getStatus();
  }

  private async discoverInternal(timeoutMs: number): Promise<DiscoverySnapshot> {
    await this.ensureReceiverBinary();

    const startedAt = new Date();
    const proc = spawn(
      this.paths.receiverBinary,
      ["discover", "--json", "--timeout-ms", String(timeoutMs)],
      {
        cwd: this.paths.repoRoot,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    const exitCode = await new Promise<number>((resolve, reject) => {
      proc.once("error", reject);
      proc.once("exit", (code) => resolve(code ?? 1));
    });

    const finishedAt = new Date();
    let sources: DiscoverySource[] = [];
    let error: string | null = null;

    if (exitCode === 0) {
      try {
        sources = JSON.parse(stdout) as DiscoverySource[];
      } catch (parseError) {
        error = `Failed to parse discovery output: ${String(parseError)}`;
      }
    } else {
      error = stderr.trim() || `receiver discover exited with code ${exitCode}`;
    }

    const snapshot: DiscoverySnapshot = {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      sources,
      error
    };

    this.discoverySnapshot = snapshot;
    this.events.publishDiscovery(snapshot);
    await this.logger.info("Discovery completed", {
      sources: snapshot.sources.length,
      error: snapshot.error
    });

    return snapshot;
  }

  private startStatusPolling(): void {
    this.statusPollTimer = setInterval(() => {
      void this.refreshStatusFromFile();
    }, 1000);
  }

  private async refreshStatusFromFile(): Promise<void> {
    try {
      const raw = await readFile(this.paths.receiverStatusFile, "utf8");
      const parsed = JSON.parse(raw) as ReceiverStatusFile;
      this.status = mergeStatusFile(this.status, parsed);
      this.events.publishStatus(this.getStatus());
    } catch {
      // Missing or partially written status file is non-fatal.
    }
  }

  private buildRunArguments(config: AppConfig): string[] {
    return [
      "run",
      "--source",
      config.receiver.sourceName,
      "--audio",
      config.receiver.audioEnabled ? "enabled" : "disabled",
      "--log-level",
      config.logging.level,
      "--scale-mode",
      config.receiver.scaleMode,
      "--status-file",
      this.paths.receiverStatusFile,
      "--fullscreen",
      config.display.fullscreen ? "enabled" : "disabled",
      "--hdmi-output-hint",
      config.display.hdmiOutputHint,
      "--device-name",
      config.device.name,
      "--reconnect-enabled",
      config.receiver.reconnect.enabled ? "true" : "false",
      "--reconnect-initial-delay-ms",
      String(config.receiver.reconnect.initialDelayMs),
      "--reconnect-max-delay-ms",
      String(config.receiver.reconnect.maxDelayMs),
      "--reconnect-backoff-multiplier",
      String(config.receiver.reconnect.backoffMultiplier)
    ];
  }

  private async ensureReceiverBinary(): Promise<void> {
    try {
      await access(this.paths.receiverBinary, constants.X_OK);
    } catch {
      throw new Error(
        `Receiver binary is not executable at ${this.paths.receiverBinary}. Build apps/receiver or set NDI_MONITOR_RECEIVER_BINARY.`
      );
    }
  }

  private async handleChildLine(
    line: string,
    level: "info" | "warn"
  ): Promise<void> {
    if (line.startsWith("EVENT ")) {
      this.applyReceiverEvent(JSON.parse(line.slice(6)) as ReceiverEvent);
      return;
    }

    await this.logStore.append({
      timestamp: new Date().toISOString(),
      scope: "receiver",
      level,
      message: line
    });
    this.events.publishLog({
      timestamp: new Date().toISOString(),
      scope: "receiver",
      level,
      message: line
    });
  }

  private applyReceiverEvent(event: ReceiverEvent): void {
    switch (event.type) {
      case "starting":
        this.applyStatus({
          lifecycle: "starting",
          connectionState: "connecting",
          lastError: null
        });
        break;
      case "source-found":
        this.applyStatus({
          connectionState: "connecting",
          sourceName: event.sourceName ?? this.status.sourceName
        });
        break;
      case "source-missing":
        this.applyStatus({
          connectionState: "source-not-found",
          lastError: event.message ?? "Source not found"
        });
        break;
      case "connected":
        this.applyStatus({
          lifecycle: "running",
          connectionState: "connected",
          lastError: null
        });
        break;
      case "disconnected":
        this.applyStatus({
          connectionState: "disconnected",
          lastError: event.message ?? "Source disconnected"
        });
        break;
      case "reconnecting":
        this.applyStatus({
          lifecycle: "restarting",
          connectionState: "reconnecting"
        });
        break;
      case "fatal-error":
        this.applyStatus({
          lifecycle: "error",
          connectionState: "fatal",
          lastError: event.message ?? "Fatal receiver error"
        });
        break;
      default:
        break;
    }
  }

  private async handleChildError(error: Error): Promise<void> {
    this.applyStatus({
      lifecycle: "error",
      connectionState: "fatal",
      lastError: error.message
    });
    await this.logger.error("Receiver child process error", {
      error: error.message
    });
  }

  private async handleChildExit(
    code: number | null,
    signal: NodeJS.Signals | null
  ): Promise<void> {
    const unexpected = !this.stopping && this.status.desiredRunning;
    this.child = null;
    this.applyStatus({
      pid: null,
      lifecycle: unexpected ? "error" : "stopped",
      connectionState: unexpected ? "disconnected" : "idle",
      videoActive: false,
      audioActive: false,
      resolution: unexpected ? this.status.resolution : null,
      fps: unexpected ? this.status.fps : null,
      uptimeSeconds: null,
      lastExitCode: code,
      lastExitSignal: signal,
      updatedAt: new Date().toISOString()
    });

    await this.logger.warn("Receiver process exited", {
      code,
      signal,
      unexpected
    });

    if (unexpected) {
      this.scheduleRestart();
    } else {
      this.stopping = false;
    }
  }

  private scheduleRestart(): void {
    const config = this.configService.getCached();
    if (!this.status.desiredRunning || !config.receiver.reconnect.enabled) {
      return;
    }

    this.clearRestartTimer();
    const attempt = this.status.restartCount + 1;
    const delay = Math.min(
      config.receiver.reconnect.maxDelayMs,
      Math.round(
        config.receiver.reconnect.initialDelayMs *
          config.receiver.reconnect.backoffMultiplier ** (attempt - 1)
      )
    );

    this.applyStatus({
      lifecycle: "restarting",
      connectionState: "reconnecting",
      restartCount: attempt,
      updatedAt: new Date().toISOString()
    });

    this.restartTimer = setTimeout(() => {
      void this.start();
    }, delay);
  }

  private clearRestartTimer(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private applyStatus(patch: Partial<ReceiverRuntimeStatus>): void {
    this.status = {
      ...this.status,
      ...patch,
      updatedAt: patch.updatedAt ?? new Date().toISOString()
    };
    this.events.publishStatus(this.getStatus());
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.controlQueue.then(operation, operation);
    this.controlQueue = next.then(
      async () => {
        await sleep(0);
      },
      async () => {
        await sleep(0);
      }
    );
    return next;
  }
}
