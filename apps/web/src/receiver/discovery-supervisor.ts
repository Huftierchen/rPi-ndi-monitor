import type { DiscoverySnapshot } from "../types.js";

export interface DiscoverySupervisorDeps {
  discover: () => Promise<DiscoverySnapshot | unknown>;
  intervalMs: number;
  onError?: (err: unknown) => void;
}

export class DiscoverySupervisor {
  private clientCount = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private disposed = false;

  constructor(private readonly deps: DiscoverySupervisorDeps) {}

  notifyClientConnected(): void {
    if (this.disposed) return;
    this.clientCount += 1;
    if (this.clientCount === 1 && !this.timer) {
      this.timer = setInterval(() => { void this.tick(); }, this.deps.intervalMs);
      void this.tick();
    }
  }

  notifyClientDisconnected(): void {
    if (this.disposed) return;
    this.clientCount = Math.max(0, this.clientCount - 1);
    if (this.clientCount === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.disposed || this.running) return;
    this.running = true;
    try {
      await this.deps.discover();
    } catch (err) {
      this.deps.onError?.(err);
    } finally {
      this.running = false;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clientCount = 0;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
