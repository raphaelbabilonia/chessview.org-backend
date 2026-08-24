const parseOrigins = () => {
  const developmentDefaults =
    process.env.NODE_ENV === "production"
      ? ""
      : "http://localhost:3000,http://localhost:3001,http://localhost:5173,http://localhost:5174,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:5173,http://127.0.0.1:5174";
  const raw = [process.env.CLIENT_URLS, process.env.CLIENT_URL, developmentDefaults].filter(Boolean).join(",");
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const validateEnv = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error("Invalid JWT_SECRET environment variable");
  }

  if (process.env.JWT_SECRET.length < 64) {
    throw new Error("JWT_SECRET must contain at least 64 random characters");
  }

  if (process.env.NODE_ENV === "production") {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is required in production");
    }

    if (!process.env.CLIENT_URLS && !process.env.CLIENT_URL) {
      throw new Error("CLIENT_URLS or CLIENT_URL is required in production");
    }

    const databaseName = new URL(process.env.MONGO_URI).pathname.replace(/^\//, "");
    if (databaseName !== "chessview") {
      throw new Error("MONGO_URI must target the isolated chessview database");
    }

    const origins = parseOrigins();
    if (!origins.length || origins.some((origin) => !origin.startsWith("https://"))) {
      throw new Error("Production client origins must use HTTPS");
    }

    if (!process.env.AGENT_PUBLISH_TOKEN || process.env.AGENT_PUBLISH_TOKEN.length < 48) {
      throw new Error("AGENT_PUBLISH_TOKEN must contain at least 48 random characters");
    }

    if (process.env.AGENT_PUBLISH_TOKEN === process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET and AGENT_PUBLISH_TOKEN must be different");
    }

    if (process.env.TRACKING_ENABLED === "true" && (!process.env.TRACKING_SALT || process.env.TRACKING_SALT.length < 48)) {
      throw new Error("TRACKING_SALT must contain at least 48 random characters when tracking is enabled");
    }
  }
};

module.exports = {
  parseOrigins,
  validateEnv
};
