require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const app = require("./app");
const { connectDB } = require("./config/db");
const { validateEnv } = require("./config/env");
const logger = require("./services/logger");

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "127.0.0.1";
let server;

try {
  validateEnv();
} catch (error) {
  logger.error("server.invalid_environment", { error });
  process.exit(1);
}

connectDB()
  .then(() => {
    server = app.listen(PORT, HOST, () => {
      logger.info("server.started", {
        host: HOST,
        port: Number(PORT),
        environment: process.env.NODE_ENV || "development"
      });
      if (typeof process.send === "function") process.send("ready");
    });
    server.on("error", (error) => {
      logger.error("server.listener_error", { error });
      process.exit(1);
    });
  })
  .catch((error) => {
    logger.error("server.start_failed", { error });
    process.exit(1);
  });

const shutdown = async (signal) => {
  logger.info("server.stopping", { signal });
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (error) => logger.error("process.unhandled_rejection", { error }));
process.on("uncaughtException", (error) => {
  logger.error("process.uncaught_exception", { error });
  shutdown("uncaughtException");
});
