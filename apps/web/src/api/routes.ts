import { createReadStream } from "node:fs";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { appConfigPatchSchema, mergeConfig, type AppConfigPatch } from "../config/schema.js";
import { ConfigService } from "../config/service.js";
import { EventBus } from "../events/event-bus.js";
import { AppLogger } from "../logging/app-logger.js";
import { LogStore } from "../logging/log-store.js";
import { ReceiverSupervisor } from "../receiver/receiver-supervisor.js";
import type { LogScope } from "../types.js";
import {
  renderAboutPage,
  renderDashboardPage,
  renderLogsPage,
  renderSettingsPage,
  renderSourcesPage
} from "../ui/pages.js";

interface RouteContext {
  configService: ConfigService;
  events: EventBus;
  logStore: LogStore;
  logger: AppLogger;
  supervisor: ReceiverSupervisor;
  version: string;
}

const logQuerySchema = z.object({
  scope: z.enum(["web", "receiver"]).default("receiver"),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

const switchSourceSchema = z.object({
  sourceName: z.string().min(1)
});

const settingsPatchSchema: z.ZodType<AppConfigPatch> = appConfigPatchSchema;

export async function registerRoutes(app: FastifyInstance, context: RouteContext): Promise<void> {
  const { configService, events, logStore, logger, supervisor } = context;

  app.get("/", async (_request, reply) => {
    reply.type("text/html").send(renderDashboardPage(supervisor.getStatus(), configService.getCached()));
  });

  app.get("/sources", async (_request, reply) => {
    reply
      .type("text/html")
      .send(
        renderSourcesPage(
          supervisor.getStatus(),
          supervisor.getDiscoverySnapshot(),
          configService.getCached()
        )
      );
  });

  app.get("/settings", async (_request, reply) => {
    reply.type("text/html").send(renderSettingsPage(configService.getCached()));
  });

  app.get("/logs", async (_request, reply) => {
    const [webLogs, receiverLogs] = await Promise.all([
      logStore.tail("web", 120),
      logStore.tail("receiver", 120)
    ]);
    reply.type("text/html").send(renderLogsPage(webLogs, receiverLogs));
  });

  app.get("/about", async (_request, reply) => {
    reply.type("text/html").send(renderAboutPage(configService.getCached()));
  });

  app.get("/healthz", async () => ({
    ok: true,
    status: "healthy",
    timestamp: new Date().toISOString()
  }));

  app.get("/api/status", async () => ({
    ok: true,
    data: supervisor.getStatus()
  }));

  app.get("/api/version", async () => ({
    ok: true,
    data: { version: context.version }
  }));

  app.get("/api/settings", async () => ({
    ok: true,
    data: configService.getCached()
  }));

  app.put("/api/settings", async (request) => {
    const patch = settingsPatchSchema.parse(request.body);
    const merged = mergeConfig(configService.getCached(), patch);
    await configService.save(merged);
    supervisor.syncConfig(merged);
    await logger.info("Configuration updated", {
      sourceName: merged.receiver.sourceName,
      autoStart: merged.receiver.autoStart
    });

    if (supervisor.getStatus().pid) {
      await supervisor.restart();
    }

    return {
      ok: true,
      data: merged
    };
  });

  app.get("/api/discovery", async () => ({
    ok: true,
    data: supervisor.getDiscoverySnapshot()
  }));

  app.post("/api/discovery", async () => ({
    ok: true,
    data: await supervisor.discover()
  }));

  app.post("/api/control/start", async () => ({
    ok: true,
    data: await supervisor.start()
  }));

  app.post("/api/control/stop", async () => ({
    ok: true,
    data: await supervisor.stop()
  }));

  app.post("/api/control/restart", async () => ({
    ok: true,
    data: await supervisor.restart()
  }));

  app.post("/api/control/reconnect", async () => ({
    ok: true,
    data: await supervisor.reconnect()
  }));

  app.post("/api/control/switch-source", async (request) => {
    const body = switchSourceSchema.parse(request.body);
    const updatedConfig = await configService.update({
      receiver: {
        ...configService.getCached().receiver,
        sourceName: body.sourceName
      }
    });
    supervisor.syncConfig(updatedConfig);

    if (supervisor.getStatus().pid) {
      await supervisor.restart();
    }

    return {
      ok: true,
      data: updatedConfig
    };
  });

  app.get("/api/logs", async (request) => {
    const { scope, limit } = logQuerySchema.parse(request.query);
    return {
      ok: true,
      data: await logStore.tail(scope, limit)
    };
  });

  app.get("/api/logs/download", async (request, reply) => {
    const { scope } = logQuerySchema.extend({ limit: z.any().optional() }).parse(request.query);
    const targetScope = scope as LogScope;
    reply.type("application/x-ndjson");
    reply.header("content-disposition", `attachment; filename="${targetScope}.log.ndjson"`);
    return reply.send(createReadStream(logStore.getPath(targetScope)));
  });

  app.get("/api/events", async (_request: FastifyRequest, reply: FastifyReply) => {
    let closed = false;
    let unsubscribe: (() => void) | null = null;
    let heartbeat: NodeJS.Timeout | null = null;

    const cleanup = (): void => {
      if (closed) {
        return;
      }
      closed = true;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      unsubscribe?.();
      unsubscribe = null;
      if (!reply.raw.destroyed && !reply.raw.writableEnded) {
        reply.raw.end();
      }
    };

    const writeSseFrame = (payload: string): boolean => {
      if (closed || reply.raw.destroyed || reply.raw.writableEnded) {
        cleanup();
        return false;
      }

      try {
        reply.raw.write(payload);
        return true;
      } catch {
        cleanup();
        return false;
      }
    };

    reply.raw.setHeader("content-type", "text/event-stream");
    reply.raw.setHeader("cache-control", "no-cache");
    reply.raw.setHeader("connection", "keep-alive");
    reply.raw.flushHeaders();

    if (!writeSseFrame(`data: ${JSON.stringify({ type: "status", payload: supervisor.getStatus() })}\n\n`)) {
      return;
    }
    const discovery = supervisor.getDiscoverySnapshot();
    if (discovery && !writeSseFrame(`data: ${JSON.stringify({ type: "discovery", payload: discovery })}\n\n`)) {
      return;
    }

    unsubscribe = events.subscribe((event) => {
      writeSseFrame(`data: ${JSON.stringify(event)}\n\n`);
    });

    heartbeat = setInterval(() => {
      writeSseFrame(": keep-alive\n\n");
    }, 15000);

    reply.raw.once("close", cleanup);
    reply.raw.once("error", cleanup);
    reply.raw.once("finish", cleanup);
  });
}
