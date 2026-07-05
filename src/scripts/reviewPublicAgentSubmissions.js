const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config({ path: ".env.local", quiet: true });
require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const {
  makeHttpPublisher,
  reviewPublicAgentSubmissions
} = require("../services/agentCollaborationService");

const hasFlag = (name) => process.argv.includes(`--${name}`);

const argValue = (name, fallback = "") => {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};

const httpPublisherIfConfigured = () => {
  const apiBaseUrl = process.env.CHESSVIEW_API_BASE_URL;
  const token = process.env.AGENT_PUBLISH_TOKEN || process.env.CHESSVIEW_AGENT_PUBLISH_TOKEN;
  if (!apiBaseUrl && !token) return null;
  return makeHttpPublisher({ apiBaseUrl, token });
};

const main = async () => {
  await connectDB();
  const dryRun = !hasFlag("publish");
  const limit = parsePositiveInt(argValue("limit", process.env.AGENT_COLLABORATION_REVIEW_LIMIT || "250"), 250);
  const reviewRunId = `public-agent-review-${new Date().toISOString()}`;
  const publisher = httpPublisherIfConfigured();
  const result = await reviewPublicAgentSubmissions({
    dryRun,
    limit,
    reviewRunId,
    ...(publisher ? { publisher } : {})
  });

  const reportPath = argValue("report", "");
  const output = JSON.stringify(result, null, 2);
  if (reportPath) {
    fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
    fs.writeFileSync(reportPath, `${output}\n`);
  }
  console.log(output);
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
