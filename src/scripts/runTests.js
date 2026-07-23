const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repositoryRoot = path.resolve(__dirname, "../..");
const testRoots = [
  "test",
  "Codex Tournament Connectors/test",
  "Codex Tournament Pipeline/test",
];

function findTestFiles(relativeRoot) {
  const absoluteRoot = path.join(repositoryRoot, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) {
    return [];
  }

  const files = [];
  const pending = [absoluteRoot];

  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".test.js")) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

const testFiles = testRoots.flatMap(findTestFiles).sort();

if (testFiles.length === 0) {
  console.error("No test files were found.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  cwd: repositoryRoot,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
