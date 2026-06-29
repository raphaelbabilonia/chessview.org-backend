const parseOrigins = () => {
  const developmentDefaults =
    process.env.NODE_ENV === "production"
      ? ""
      : "http://localhost:3000,http://localhost:3001,http://localhost:5173,http://localhost:5174,http://127.0.0.1:3001,http://127.0.0.1:5173,http://127.0.0.1:5174";
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

  if (process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET should be minimum 32 char length random string");
  }

  if (process.env.NODE_ENV === "production") {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is required in production");
    }

    if (!process.env.CLIENT_URLS && !process.env.CLIENT_URL) {
      throw new Error("CLIENT_URLS or CLIENT_URL is required in production");
    }
  }
};

module.exports = {
  parseOrigins,
  validateEnv
};
