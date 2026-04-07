import { randomUUID } from "node:crypto";

import type { DiscoverySnapshot, LogEntry, ReceiverRuntimeStatus, SseEvent } from "../types.js";

type Listener = (event: SseEvent) => void;

export class EventBus {
  private readonly listeners = new Map<string, Listener>();

  public subscribe(listener: Listener): () => void {
    const id = randomUUID();
    this.listeners.set(id, listener);
    return () => {
      this.listeners.delete(id);
    };
  }

  public publishStatus(payload: ReceiverRuntimeStatus): void {
    this.publish({ type: "status", payload });
  }

  public publishLog(payload: LogEntry): void {
    this.publish({ type: "log", payload });
  }

  public publishDiscovery(payload: DiscoverySnapshot): void {
    this.publish({ type: "discovery", payload });
  }

  private publish(event: SseEvent): void {
    for (const listener of this.listeners.values()) {
      listener(event);
    }
  }
}
