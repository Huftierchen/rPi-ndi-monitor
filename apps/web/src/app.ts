import path from "node:path";

import fastify from "fastify";
import fastifyFormBody from "@fastify/formbody";
import fastifyStatic from "@fastify/static";

import { ConfigService } from "./config/service.js";
import { EventBus } from "./events/event-bus.js";
import { registerRoutes } from "./api/routes.js";
import { AppLogger } from "./logging/app-logger.js";
import { LogStore } from "./logging/log-store.js";
import { ReceiverSupervisor } from "./receiver/receiver-supervisor.js";
import type { RuntimePaths } from "./types.js";

export async function buildApp(paths: RuntimePaths) {
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

  const app = fastify({
    logger: false,
    disableRequestLogging: true
  });

  app.register(fastifyFormBody);
  app.register(fastifyStatic, {
    root: path.join(paths.repoRoot, "apps", "web", "src", "ui", "assets"),
    prefix: "/assets/"
  });

  app.setErrorHandler(async (error, _request, reply) => {
    const message = error instanceof Error ? error.message : String(error);
    await logger.error("Request failed", { error: message });
    reply.status(500).send({
      ok: false,
      error: message
    });
  });

  await registerRoutes(app, {
    configService,
    events,
    logStore,
    logger,
    supervisor
  });

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    await logger.info("Shutting down web service", { signal });
    await supervisor.dispose();
    await app.close();
    process.exit(0);
  }

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  return {
    app,
    config,
    logger,
    supervisor
  };
}
