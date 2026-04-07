import { buildApp } from "./app.js";
import { resolveRuntimePaths } from "./utils/paths.js";

const paths = resolveRuntimePaths();
const { app, config, logger } = await buildApp(paths);

await app.listen({
  host: config.server.host,
  port: config.server.port
});

await logger.info("Web service listening", {
  host: config.server.host,
  port: config.server.port
});
