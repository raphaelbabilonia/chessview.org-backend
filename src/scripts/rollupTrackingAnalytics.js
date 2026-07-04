require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const { rollupTrackingAnalytics } = require("../services/trackingService");

const argValue = (name, fallback = "") => {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const main = async () => {
  await connectDB();
  const days = Number(argValue("days", "90"));
  const result = await rollupTrackingAnalytics({ days });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
};

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, message: error.message }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
