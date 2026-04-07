import pino, { type Logger as PinoLogger } from "pino";

import { EventBus } from "../events/event-bus.js";
import type { LogEntry, LogLevel, LogScope } from "../types.js";
import { LogStore } from "./log-store.js";

function serializeMeta(meta: Record<string, unknown> | undefined): string {
  if (!meta || Object.keys(meta).length === 0) {
    return "";
  }

  return ` ${JSON.stringify(meta)}`;
}

export class AppLogger {
  private readonly pino: PinoLogger;

  public constructor(
    private readonly level: LogLevel,
    private readonly scope: LogScope,
    private readonly store: LogStore,
    private readonly events: EventBus,
    private readonly context?: string,
    pinoInstance?: PinoLogger
  ) {
    this.pino =
      pinoInstance ??
      pino({
        level: this.level,
        base: null,
        timestamp: pino.stdTimeFunctions.isoTime
      });
  }

  public child(context: string): AppLogger {
    return new AppLogger(this.level, this.scope, this.store, this.events, context, this.pino);
  }

  public async debug(message: string, meta?: Record<string, unknown>): Promise<void> {
    await this.write("debug", message, meta);
  }

  public async info(message: string, meta?: Record<string, unknown>): Promise<void> {
    await this.write("info", message, meta);
  }

  public async warn(message: string, meta?: Record<string, unknown>): Promise<void> {
    await this.write("warn", message, meta);
  }

  public async error(message: string, meta?: Record<string, unknown>): Promise<void> {
    await this.write("error", message, meta);
  }

  private async write(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ): Promise<void> {
    const renderedMessage = this.context ? `${this.context}: ${message}` : message;
    this.pino[level](meta ?? {}, renderedMessage);

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      scope: this.scope,
      level,
      message: `${renderedMessage}${serializeMeta(meta)}`
    };

    await this.store.append(entry);
    this.events.publishLog(entry);
  }
}
