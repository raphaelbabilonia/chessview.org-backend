const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const workspaceRoot = path.resolve(repoRoot, "..");
const nextRoot = path.join(workspaceRoot, "chessview.org-next.js");
const trackingRoot = path.join(repoRoot, "Codex Tracking");
const stateDir = path.join(trackingRoot, "state");
const runsDir = path.join(trackingRoot, "runs");

const now = new Date();
const dateKey = now.toISOString().slice(0, 10);
const runId = `${dateKey}__tracking-audit__${now.toISOString().slice(11, 19).replace(/:/g, "")}`;
const runDir = path.join(runsDir, dateKey, runId);

const readText = (file) => fs.readFileSync(file, "utf8");

const collectFiles = (dir, matcher, files = []) => {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", ".next", ".git"].includes(entry.name)) collectFiles(file, matcher, files);
      continue;
    }
    if (entry.isFile() && matcher(file)) files.push(file);
  }
  return files;
};

const routeFromPageFile = (file) => {
  const rel = path.relative(path.join(nextRoot, "src", "app"), file).replace(/\\/g, "/");
  return `/${rel.replace(/\/page\.js$/, "").replace(/\(.*?\)\//g, "").replace(/\[locale\]/g, ":locale").replace(/\[(.*?)\]/g, ":$1")}`.replace(/\/index$/, "") || "/";
};

const hasTrackingMarker = (text) => /data-tracking-event|trackAnalyticsEvent|TrackingProvider/.test(text);

const audit = () => {
  const pageFiles = collectFiles(path.join(nextRoot, "src", "app"), (file) => file.endsWith("page.js"));
  const componentFiles = collectFiles(path.join(nextRoot, "src", "components"), (file) => file.endsWith(".js"));
  const pages = pageFiles.map((file) => {
    const text = readText(file);
    return {
      file: path.relative(workspaceRoot, file).replace(/\\/g, "/"),
      route: routeFromPageFile(file),
      hasTrackingMarker: hasTrackingMarker(text),
      hasExternalLinks: /target="_blank"|href="https?:\/\//.test(text)
    };
  });
  const components = componentFiles.map((file) => {
    const text = readText(file);
    return {
      file: path.relative(workspaceRoot, file).replace(/\\/g, "/"),
      hasTrackingMarker: hasTrackingMarker(text),
      hasExternalLinks: /target="_blank"|href="https?:\/\//.test(text),
      hasFormOrButton: /<form|<button/.test(text)
    };
  });
  const missingCoverage = [
    ...pages.filter((page) => page.hasExternalLinks && !page.hasTrackingMarker).map((page) => `${page.route} external links`),
    ...components
      .filter((component) => (component.hasExternalLinks || component.hasFormOrButton) && !component.hasTrackingMarker)
      .map((component) => component.file)
  ];

  return { pages, components, missingCoverage };
};

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const writeReadme = () => {
  const file = path.join(trackingRoot, "README.md");
  if (fs.existsSync(file)) return;
  fs.mkdirSync(trackingRoot, { recursive: true });
  fs.writeFileSync(
    file,
    [
      "# Codex Tracking Workspace",
      "",
      "Local-only operational workspace for ChessView tracking coverage audits.",
      "This folder is ignored by Git and can contain run history, local notes, and coverage state.",
      ""
    ].join("\n")
  );
};

const main = () => {
  writeReadme();
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  const result = audit();
  const manifest = {
    runId,
    startedAt: now.toISOString(),
    finishedAt: new Date().toISOString(),
    status: "completed",
    nextRoot: path.relative(workspaceRoot, nextRoot).replace(/\\/g, "/"),
    missingCoverage: result.missingCoverage
  };
  writeJson(path.join(runDir, "run-manifest.json"), manifest);
  writeJson(path.join(stateDir, "coverage.json"), {
    updatedAt: manifest.finishedAt,
    pages: result.pages,
    components: result.components,
    missingCoverage: result.missingCoverage
  });
  fs.writeFileSync(
    path.join(runDir, "tracking-audit.md"),
    [
      "# Tracking Coverage Audit",
      "",
      `Run: ${runId}`,
      `Missing coverage items: ${result.missingCoverage.length}`,
      "",
      ...result.missingCoverage.map((item) => `- ${item}`),
      ""
    ].join("\n")
  );
  console.log(JSON.stringify({ ok: true, runId, missingCoverage: result.missingCoverage.length }, null, 2));
};

main();
