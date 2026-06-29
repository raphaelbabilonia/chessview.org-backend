require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const { ensureDefaultScrapeSources, runDueScrapeSources } = require("../services/scrapeRunner");

const readArg = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }

  return fallback;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mode = readArg("mode", process.env.SCRAPER_WORKER_MODE || "apply");
const intervalMs = Number(readArg("interval-ms", process.env.SCRAPER_WORKER_INTERVAL_MS || "60000"));
const limit = Number(readArg("limit", process.env.SCRAPER_WORKER_LIMIT || "5"));
const leaseMs = Number(readArg("lease-ms", process.env.SCRAPER_WORKER_LEASE_MS || "600000"));
const workerId = readArg("worker-id", `${process.env.COMPUTERNAME || process.env.HOSTNAME || "worker"}:${process.pid}`);

let shuttingDown = false;

const log = (payload) => {
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      workerId,
      ...payload
    })
  );
};

const runOnce = async () => {
  const jobs = await runDueScrapeSources({ mode, limit, workerId, leaseMs });
  log({
    event: "tick",
    mode,
    jobs: jobs.length,
    jobIds: jobs.map((job) => job.id)
  });
};

const shutdown = async () => {
  shuttingDown = true;
  log({ event: "shutdown" });
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

process.on("SIGINT", () => {
  shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  shutdown().finally(() => process.exit(0));
});

const main = async () => {
  await connectDB();

  if (process.env.SCRAPER_WORKER_ENSURE_DEFAULTS !== "false") {
    const sources = await ensureDefaultScrapeSources();
    log({
      event: "ensure-defaults",
      sources: sources.map((source) => source.key)
    });
  }

  log({ event: "start", mode, intervalMs, limit, leaseMs });

  while (!shuttingDown) {
    try {
      await runOnce();
    } catch (error) {
      log({ event: "error", message: error.message });
    }
    await sleep(Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 60000);
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
