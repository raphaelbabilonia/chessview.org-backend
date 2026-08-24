const SECRET_KEY = /(authorization|cookie|password|secret|token|api[-_]?key|mongo|uri)/i;

const clean = (value, key = "", depth = 0) => {
  if (SECRET_KEY.test(key)) return "[redacted]";
  if (value instanceof Error) {
    return {
      name: value.name,
      message: String(value.message || "Error").slice(0, 500)
    };
  }
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") return value.slice(0, 1000);
  if (depth >= 3) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => clean(item, key, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 40)
        .map(([childKey, childValue]) => [childKey, clean(childValue, childKey, depth + 1)])
    );
  }
  return String(value).slice(0, 500);
};

const write = (level, event, fields = {}) => {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...clean(fields)
  });
  const output = level === "error" ? console.error : console.log;
  output(payload);
};

module.exports = {
  error: (event, fields) => write("error", event, fields),
  info: (event, fields) => write("info", event, fields),
  warn: (event, fields) => write("warn", event, fields)
};
