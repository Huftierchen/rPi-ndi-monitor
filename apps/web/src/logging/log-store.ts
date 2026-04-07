import { appendFile, mkdir, readFile } from "node:fs/promises";

import type { LogEntry, LogScope } from "../types.js";

export class LogStore {
  private readonly inMemory = new Map<LogScope, LogEntry[]>([
    ["web", []],
    ["receiver", []]
  ]);

  public constructor(
    private readonly filePaths: Record<LogScope, string>,
    private readonly maxEntries = 500
  ) {}

  public async ensureReady(): Promise<void> {
    await Promise.all(
      Object.values(this.filePaths).map(async (filePath) => {
        const directory = filePath.slice(0, filePath.lastIndexOf("/"));
        await mkdir(directory, { recursive: true });
      })
    );
  }

  public async append(entry: LogEntry): Promise<void> {
    const buffer = this.inMemory.get(entry.scope);
    if (buffer) {
      buffer.push(entry);
      if (buffer.length > this.maxEntries) {
        buffer.splice(0, buffer.length - this.maxEntries);
      }
    }

    await appendFile(this.filePaths[entry.scope], `${JSON.stringify(entry)}\n`, "utf8");
  }

  public getRecent(scope: LogScope, limit: number): LogEntry[] {
    const buffer = this.inMemory.get(scope) ?? [];
    return buffer.slice(Math.max(0, buffer.length - limit));
  }

  public async tail(scope: LogScope, limit: number): Promise<LogEntry[]> {
    const recent = this.getRecent(scope, limit);
    if (recent.length >= limit) {
      return recent;
    }

    try {
      const raw = await readFile(this.filePaths[scope], "utf8");
      const lines = raw.trim().split("\n").filter(Boolean);
      return lines
        .slice(Math.max(0, lines.length - limit))
        .map((line) => JSON.parse(line) as LogEntry);
    } catch {
      return recent;
    }
  }

  public getPath(scope: LogScope): string {
    return this.filePaths[scope];
  }
}
