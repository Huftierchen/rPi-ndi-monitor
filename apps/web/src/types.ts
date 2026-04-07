export const scaleModes = ["contain", "cover", "stretch"] as const;
export type ScaleMode = (typeof scaleModes)[number];

export const logLevels = ["trace", "debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof logLevels)[number];

export interface AppConfig {
  server: {
    host: string;
    port: number;
  };
  receiver: {
    sourceName: string;
    audioEnabled: boolean;
    scaleMode: ScaleMode;
    autoStart: boolean;
    reconnect: {
      enabled: boolean;
      initialDelayMs: number;
      maxDelayMs: number;
      backoffMultiplier: number;
    };
  };
  logging: {
    level: LogLevel;
    maxFiles: number;
    maxSizeMb: number;
    json: boolean;
  };
  display: {
    fullscreen: boolean;
    hdmiOutputHint: string;
  };
  device: {
    name: string;
  };
}

export interface RuntimePaths {
  repoRoot: string;
  runtimeRoot: string;
  configFile: string;
  defaultConfigFile: string;
  dataDir: string;
  logDir: string;
  receiverStatusFile: string;
  webLogFile: string;
  receiverLogFile: string;
  receiverBinary: string;
}

export type ReceiverLifecycleState =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error"
  | "restarting";

export type ReceiverConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "source-not-found"
  | "disconnected"
  | "reconnecting"
  | "fatal";

export interface ReceiverRuntimeStatus {
  pid: number | null;
  lifecycle: ReceiverLifecycleState;
  connectionState: ReceiverConnectionState;
  sourceName: string | null;
  audioEnabled: boolean;
  videoActive: boolean;
  audioActive: boolean;
  resolution: string | null;
  fps: number | null;
  startedAt: string | null;
  uptimeSeconds: number | null;
  lastError: string | null;
  lastExitCode: number | null;
  lastExitSignal: NodeJS.Signals | null;
  restartCount: number;
  desiredRunning: boolean;
  statusFileUpdatedAt: string | null;
  updatedAt: string;
}

export interface ReceiverStatusFile {
  lifecycle: ReceiverLifecycleState;
  connectionState: ReceiverConnectionState;
  sourceName: string | null;
  audioEnabled: boolean;
  videoActive: boolean;
  audioActive: boolean;
  resolution: string | null;
  fps: number | null;
  startedAt: string | null;
  uptimeSeconds: number | null;
  lastError: string | null;
  updatedAt: string;
}

export interface DiscoverySource {
  id: string;
  name: string;
  address?: string;
  groups?: string[];
  isAvailable?: boolean;
}

export interface DiscoverySnapshot {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  sources: DiscoverySource[];
  error: string | null;
}

export type LogScope = "web" | "receiver";

export interface LogEntry {
  timestamp: string;
  scope: LogScope;
  level: LogLevel;
  message: string;
}

export interface StatusEvent {
  type: "status";
  payload: ReceiverRuntimeStatus;
}

export interface LogEvent {
  type: "log";
  payload: LogEntry;
}

export interface DiscoveryEvent {
  type: "discovery";
  payload: DiscoverySnapshot;
}

export type SseEvent = StatusEvent | LogEvent | DiscoveryEvent;
