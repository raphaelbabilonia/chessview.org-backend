const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { deploymentInfo } = require("../../src/utils/deploymentInfo");

test("health identifies the actual stamped release and rejects invalid revisions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chessview-release-test-"));
  try {
    const sha = "1".repeat(40);
    fs.writeFileSync(path.join(root, ".deployment-sha"), sha + "\n");
    assert.equal(deploymentInfo(root, { DEPLOYMENT_SHA: "2".repeat(40) }).deploymentSha, sha);
    fs.writeFileSync(path.join(root, ".deployment-sha"), "invalid");
    assert.equal(deploymentInfo(root, {}).deploymentSha, null);
  } finally {
    assert.equal(path.dirname(root), os.tmpdir());
    fs.rmSync(root, { recursive: true, force: true });
  }
});
