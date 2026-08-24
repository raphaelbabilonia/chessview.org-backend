const cors = require("cors");
const crypto = require("crypto");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const helmet = require("helmet");
const mongoose = require("mongoose");
const path = require("path");
const agentCollaborationRoutes = require("./routes/agentCollaborationRoutes");
const agentIngestRoutes = require("./routes/agentIngestRoutes");
const authRoutes = require("./routes/authRoutes");
const broadcastRoutes = require("./routes/broadcastRoutes");
const eventRoutes = require("./routes/eventRoutes");
const newsRoutes = require("./routes/newsRoutes");
const tournamentRoutes = require("./routes/tournamentRoutes");
const errorMiddleware = require("./middleware/errorMiddleware");
const { parseOrigins } = require("./config/env");
const logger = require("./services/logger");

const app = express();

const allowedOrigins = parseOrigins();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  req.requestId = String(req.get("X-Request-Id") || crypto.randomUUID()).slice(0, 128);
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false
}));

app.use((req, res, next) => {
  if (process.env.NODE_ENV === "development") {
    const start = Date.now();
    res.on("finish", () => {
      logger.info("http.request", {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - start
      });
    });
  }
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      const error = new Error("Origin is not allowed");
      error.status = 403;
      return callback(error);
    },
    credentials: false
  })
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 900,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test"
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test"
});
const deviceLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test"
});

app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/device", deviceLimiter);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb", parameterLimit: 100 }));
app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", "uploads"), {
    dotfiles: "deny",
    fallthrough: false,
    immutable: true,
    maxAge: "7d",
    setHeaders(res) {
      res.setHeader("Content-Disposition", "inline");
    }
  })
);

const healthPayload = () => ({
  ok: true,
  service: "chessview-api",
  uptimeSeconds: Math.floor(process.uptime())
});

app.get("/health", (req, res) => res.json(healthPayload()));
app.get("/api/health", (req, res) => res.json(healthPayload()));
app.get("/ready", (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  res.status(databaseReady ? 200 : 503).json({
    ok: databaseReady,
    service: "chessview-api",
    dependencies: { database: databaseReady ? "up" : "down" }
  });
});
app.get("/api/ready", (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  res.status(databaseReady ? 200 : 503).json({
    ok: databaseReady,
    service: "chessview-api",
    dependencies: { database: databaseReady ? "up" : "down" }
  });
});

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "chessview-api"
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/agent-collaboration", agentCollaborationRoutes);
app.use("/api/agent-ingest", agentIngestRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/news", newsRoutes);
app.use("/api", tournamentRoutes);
app.use("/api", broadcastRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use(errorMiddleware);

module.exports = app;
