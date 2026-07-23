const crypto = require("crypto");

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (value[key] !== undefined) result[key] = stableValue(value[key]);
    return result;
  }, {});
};

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

const comparableOutcomes = (result = {}) => {
  const keys = ["created", "updated", "merged", "skipped", "rejected", "errors"];
  return Object.fromEntries(keys.map((key) => [
    key,
    (Array.isArray(result[key]) ? result[key] : [])
      .map((entry) => stableValue(entry))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  ]));
};

const inputHashFor = (items = []) => {
  const comparableItems = items.map((entry) => ({ file: entry.file, data: entry.data }));
  return `sha256:${sha256(JSON.stringify(stableValue(comparableItems)))}`;
};

const createPublishPlan = ({ manifestPath, items, result }) => {
  const payload = {
    schemaVersion: 1,
    manifestPath: String(manifestPath || "").replace(/\\/g, "/"),
    inputHash: inputHashFor(items),
    outcomes: comparableOutcomes(result)
  };
  return {
    ...payload,
    planHash: `sha256:${sha256(JSON.stringify(stableValue(payload)))}`
  };
};

module.exports = { comparableOutcomes, createPublishPlan, inputHashFor, stableValue };
