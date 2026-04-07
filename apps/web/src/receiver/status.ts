import type { AppConfig, ReceiverRuntimeStatus, ReceiverStatusFile } from "../types.js";

export function createInitialStatus(config: AppConfig): ReceiverRuntimeStatus {
  return {
    pid: null,
    lifecycle: "stopped",
    connectionState: "idle",
    sourceName: config.receiver.sourceName || null,
    audioEnabled: config.receiver.audioEnabled,
    videoActive: false,
    audioActive: false,
    resolution: null,
    fps: null,
    droppedVideoFrames: null,
    droppedAudioFrames: null,
    videoQueueDepth: null,
    audioQueueDepth: null,
    startedAt: null,
    uptimeSeconds: null,
    lastError: null,
    lastExitCode: null,
    lastExitSignal: null,
    restartCount: 0,
    desiredRunning: false,
    statusFileUpdatedAt: null,
    updatedAt: new Date().toISOString()
  };
}

export function mergeStatusFile(
  current: ReceiverRuntimeStatus,
  snapshot: ReceiverStatusFile
): ReceiverRuntimeStatus {
  return {
    ...current,
    lifecycle: snapshot.lifecycle,
    connectionState: snapshot.connectionState,
    sourceName: snapshot.sourceName,
    audioEnabled: snapshot.audioEnabled,
    videoActive: snapshot.videoActive,
    audioActive: snapshot.audioActive,
    resolution: snapshot.resolution,
    fps: snapshot.fps,
    droppedVideoFrames: snapshot.droppedVideoFrames,
    droppedAudioFrames: snapshot.droppedAudioFrames,
    videoQueueDepth: snapshot.videoQueueDepth,
    audioQueueDepth: snapshot.audioQueueDepth,
    startedAt: snapshot.startedAt,
    uptimeSeconds: snapshot.uptimeSeconds,
    lastError: snapshot.lastError,
    statusFileUpdatedAt: snapshot.updatedAt,
    updatedAt: new Date().toISOString()
  };
}
