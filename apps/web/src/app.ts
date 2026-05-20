import path from "node:path";
import { readFile } from "node:fs/promises";

import fastify from "fastify";
import fastifyFormBody from "@fastify/formbody";
import fastifyStatic from "@fastify/static";
import { z } from "zod";

import { ConfigService } from "./config/service.js";
import { EventBus } from "./events/event-bus.js";
import { registerRoutes } from "./api/routes.js";
import { AppLogger } from "./logging/app-logger.js";
import { LogStore } from "./logging/log-store.js";
import { ReceiverSupervisor } from "./receiver/receiver-supervisor.js";
import { DiscoverySupervisor } from "./receiver/discovery-supervisor.js";
import type { RuntimePaths } from "./types.js";

export interface BuildAppOptions {
  installSignalHandlers?: boolean;
}

async function readWebVersion(repoRoot: string): Promise<string> {
  try {
    const raw = await readFile(path.join(repoRoot, "apps", "web", "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "dev";
  } catch {
    return "dev";
  }
}

export async function buildApp(paths: RuntimePaths, options: BuildAppOptions = {}) {
  const { installSignalHandlers = true } = options;
  const version = await readWebVersion(paths.repoRoot);

  const configService = new ConfigService(paths);
  const config = await configService.ensureReady();

  const events = new EventBus();
  const logStore = new LogStore({
    web: paths.webLogFile,
    receiver: paths.receiverLogFile
  });
  await logStore.ensureReady();

  const logger = new AppLogger(config.logging.level, "web", logStore, events);
  const supervisor = new ReceiverSupervisor(paths, configService, logStore, events, logger.child("supervisor"));
  await supervisor.init();

  const discoverySupervisor = new DiscoverySupervisor({
    intervalMs: 20000,
    discover: () => supervisor.discover(),
    onError: (err) => { void logger.warn("Auto-discovery failed", { error: String(err) }); }
  });

  const app = fastify({
    logger: false,
    disableRequestLogging: true
  });

  app.register(fastifyFormBody);
  const uiDist = path.join(paths.repoRoot, "apps", "web-ui", "dist");
  app.register(fastifyStatic, {
    root: uiDist,
    prefix: "/",
    decorateReply: false
  });

  app.setErrorHandler(async (error, _request, reply) => {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = error instanceof z.ZodError ? 400 : 500;
    await logger.error("Request failed", { error: message });
    reply.status(statusCode).send({
      ok: false,
      error: message
    });
  });

  await registerRoutes(app, {
    configService,
    events,
    logStore,
    logger,
    supervisor,
    discoverySupervisor,
    version
  });

  app.setNotFoundHandler(async (request, reply) => {
    const url = request.url;
    if (url.startsWith("/api/") || url === "/healthz") {
      reply.status(404).send({ ok: false, error: "Not found" });
      return;
    }
    try {
      const html = await readFile(path.join(uiDist, "index.html"), "utf8");
      reply.type("text/html").send(html);
    } catch {
      reply.status(500).send({ ok: false, error: "UI bundle missing — run pnpm build:ui" });
    }
  });

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    await logger.info("Shutting down web service", { signal });
    discoverySupervisor.dispose();
    await supervisor.dispose();
    await app.close();
    process.exit(0);
  }

  if (installSignalHandlers) {
    process.once("SIGINT", () => {
      void shutdown("SIGINT");
    });
    process.once("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
  }

  return {
    app,
    config,
    logger,
    supervisor
  };
}
