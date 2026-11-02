const fs = require("node:fs");
const path = require("node:path");

const deploymentInfo = (root = path.resolve(__dirname, "../.."), environment = process.env) => {
  let stamped = "";
  try { stamped = fs.readFileSync(path.join(root, ".deployment-sha"), "utf8").trim(); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const candidate = stamped || environment.CHESSVIEW_DEPLOY_SHA || environment.DEPLOYMENT_SHA || "";
  return { deploymentSha: /^[a-f0-9]{40}$/i.test(candidate) ? candidate.toLowerCase() : null };
};

module.exports = { deploymentInfo };
