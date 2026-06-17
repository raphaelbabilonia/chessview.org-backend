const cors = require("cors");
const express = require("express");
const path = require("path");
const authRoutes = require("./routes/authRoutes");
const broadcastRoutes = require("./routes/broadcastRoutes");
const eventRoutes = require("./routes/eventRoutes");
const tournamentRoutes = require("./routes/tournamentRoutes");
const errorMiddleware = require("./middleware/errorMiddleware");

const app = express();

app.use((req, res, next) => {
  if (process.env.NODE_ENV === "development") {
    const start = Date.now();
    res.on("finish", () => {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
    });
  }
  next();
});

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Chess View API is running",
    uptimeSeconds: process.uptime()
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api", tournamentRoutes);
app.use("/api", broadcastRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use(errorMiddleware);

module.exports = app;
