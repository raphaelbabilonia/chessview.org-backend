const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { defaultBrainRoot, forward, resolveBrainRoot } = require("../../src/scripts/forwardBrainCommand");

test("brain shim defaults to the sibling checkout and honors an explicit override", () => {
  assert.equal(path.basename(defaultBrainRoot), "chessview.org-brain");
  assert.equal(resolveBrainRoot({ CHESSVIEW_BRAIN_ROOT: "C:\\custom\\brain" }), path.resolve("C:\\custom\\brain"));
});

test("brain shim preserves command arguments, working directory, and exit result", () => {
  let captured;
  const testBrainRoot = path.resolve(__dirname, "../..");
  const env = { ...process.env, CHESSVIEW_BRAIN_ROOT: testBrainRoot, npm_execpath: process.env.npm_execpath };
  const expected = { status: 37, signal: null };
  const result = forward({
    argv: ["agent:publish", "--publish", "--domain", "news"],
    env,
    spawn: (executable, args, options) => {
      captured = { executable, args, options };
      return expected;
    }
  });
  assert.equal(result, expected);
  assert.equal(captured.options.cwd, testBrainRoot);
  assert.deepEqual(captured.args.slice(-6), ["run", "agent:publish", "--", "--publish", "--domain", "news"]);
  assert.equal(captured.options.stdio, "inherit");
});
