const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const backendRoot = path.resolve(__dirname, "../..");
const defaultBrainRoot = path.join(path.dirname(backendRoot), "chessview.org-brain");

const resolveBrainRoot = (env = process.env) => path.resolve(String(env.CHESSVIEW_BRAIN_ROOT || "").trim() || defaultBrainRoot);

const npmInvocation = (command, forwardedArgs, env = process.env) => {
  const npmCli = String(env.npm_execpath || "").trim();
  if (npmCli && fs.existsSync(npmCli)) {
    return { executable: process.execPath, args: [npmCli, "run", command, "--", ...forwardedArgs] };
  }
  return {
    executable: process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["run", command, "--", ...forwardedArgs]
  };
};

const forward = ({ argv = process.argv.slice(2), env = process.env, spawn = spawnSync } = {}) => {
  const [command, ...forwardedArgs] = argv;
  if (!command || !/^(?:agent:|tracking:)/.test(command)) throw new Error(`Unsupported brain command: ${command || "(missing)"}`);
  const brainRoot = resolveBrainRoot(env);
  if (!fs.existsSync(path.join(brainRoot, "package.json"))) {
    throw new Error(`ChessView brain checkout is unavailable: ${brainRoot}`);
  }
  const invocation = npmInvocation(command, forwardedArgs, env);
  return spawn(invocation.executable, invocation.args, {
    cwd: brainRoot,
    env,
    stdio: "inherit",
    windowsHide: true
  });
};

if (require.main === module) {
  try {
    const result = forward();
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { defaultBrainRoot, forward, npmInvocation, resolveBrainRoot };

