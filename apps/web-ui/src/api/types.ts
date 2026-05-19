// Client-side mirror of the backend API contract.
// Source of truth: apps/web/src/types.ts
// We re-declare here to avoid coupling the Vite build to the Fastify TS build.

export type ScaleMode = "contain" | "cover" | "stretch";
export type BandwidthMode = "highest" | "lowest";
export type ColorFormat = "fastest" | "uyvy" | "rgba";
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

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

export type LogScope = "web" | "receiver";

export interface AppConfig {
  server: {
    host: string;
    port: number;
  };
  receiver: {
    sourceName: string;
    audioEnabled: boolean;
    scaleMode: ScaleMode;
    bandwidthMode: BandwidthMode;
    colorFormat: ColorFormat;
    outputFpsCap: number;
    lowLatencyMode: boolean;
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

export interface DiscoverySource {
  id: string;
  name: string;
  address?: string;
  groups?: string[];
  isAvailable?: boolean;
  resolution?: string | null;
  fps?: number | null;
  connectionCount?: number | null;
  webControlUrl?: string | null;
}

export interface DiscoverySnapshot {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  sources: DiscoverySource[];
  error: string | null;
}

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
  droppedVideoFrames: number | null;
  droppedAudioFrames: number | null;
  videoQueueDepth: number | null;
  audioQueueDepth: number | null;
  startedAt: string | null;
  uptimeSeconds: number | null;
  lastError: string | null;
  lastExitCode: number | null;
  lastExitSignal: string | null;
  restartCount: number;
  desiredRunning: boolean;
  statusFileUpdatedAt: string | null;
  updatedAt: string;
}

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
