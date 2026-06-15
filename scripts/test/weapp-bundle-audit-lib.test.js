const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  PREVIEW_UPLOAD_LIMIT_KB,
  resolveWeappBundleAuditPaths,
  normalizePackIgnoreRules,
  classifyIgnoredFile,
  collectWeappProjectFiles,
  buildWeappBundleAudit,
  renderWeappBundleAuditReadme,
  buildWeappBundleAuditArtifacts,
  writeWeappBundleAuditArtifacts
} = require("../weapp-bundle-audit-lib");

test("weapp bundle audit lib should expose stable output paths", () => {
  const paths = resolveWeappBundleAuditPaths(path.resolve("C:/repo"));
  assert.ok(paths.projectDir.endsWith(path.join("apps", "weapp")));
  assert.ok(paths.outputDir.endsWith(path.join("output", "weapp-bundle")));
  assert.ok(paths.latestPath.endsWith(path.join("output", "weapp-bundle", "latest.json")));
});

test("weapp bundle audit lib should normalize ignore rules and classify files", () => {
  const rules = normalizePackIgnoreRules([
    { type: "folder", value: "./test/" },
    { type: "file", value: "data\\ingested.js" },
    { type: "file", value: "./project.private.config.json" }
  ]);

  assert.deepEqual(rules, [
    { type: "folder", value: "test" },
    { type: "file", value: "data/ingested.js" },
    { type: "file", value: "project.private.config.json" }
  ]);
  assert.equal(classifyIgnoredFile("test/pages.test.js", rules).ignored, true);
  assert.equal(classifyIgnoredFile("data/ingested.js", rules).ignored, true);
  assert.equal(classifyIgnoredFile("project.private.config.json", rules).ignored, true);
  assert.equal(classifyIgnoredFile("data/demo.js", rules).ignored, false);
});

test("weapp bundle audit lib should collect files and summarize included size", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "weapp-bundle-audit-"));
  const projectDir = path.join(tmpDir, "apps", "weapp");
  fs.mkdirSync(path.join(projectDir, "data"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "test"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "data", "demo.js"), "demo", "utf8");
  fs.writeFileSync(path.join(projectDir, "data", "ingested.js"), "x".repeat(4096), "utf8");
  fs.writeFileSync(path.join(projectDir, "test", "pages.test.js"), "test", "utf8");
  fs.writeFileSync(path.join(projectDir, "project.private.config.json"), "{\"private\":true}", "utf8");
  fs.writeFileSync(path.join(projectDir, "app.js"), "app", "utf8");

  const rules = normalizePackIgnoreRules([
    { type: "folder", value: "test" },
    { type: "file", value: "data/ingested.js" },
    { type: "file", value: "project.private.config.json" }
  ]);
  const files = collectWeappProjectFiles(projectDir, rules);
  const audit = buildWeappBundleAudit({
    projectConfig: {
      appid: "wx123",
      projectname: "gongkao-demo",
      miniprogramRoot: "./"
    },
    rules,
    files
  });

  assert.equal(files.length, 5);
  assert.equal(audit.summary.fileCount, 5);
  assert.equal(audit.summary.ignoredFileCount, 3);
  assert.equal(audit.summary.includedFileCount, 2);
  assert.equal(audit.summary.thresholdStatus, "within-limit");
  assert.equal(audit.limits.previewUploadLimitKB, PREVIEW_UPLOAD_LIMIT_KB);
  assert.equal(audit.largestIgnoredFiles[0].relPath, "data/ingested.js");
  assert.equal(audit.largestIncludedFiles[0].relPath, "data/demo.js");

  const readme = renderWeappBundleAuditReadme(audit);
  assert.ok(readme.includes("thresholdStatus: within-limit"));
  assert.ok(readme.includes("data/ingested.js"));
  assert.ok(readme.includes("project.private.config.json"));

  const outputDir = path.join(tmpDir, "output");
  const artifacts = buildWeappBundleAuditArtifacts(audit, outputDir);
  assert.equal(artifacts.length, 3);
  writeWeappBundleAuditArtifacts(artifacts);
  assert.equal(fs.existsSync(path.join(outputDir, "latest.json")), true);
  assert.equal(fs.existsSync(path.join(outputDir, "README.txt")), true);
});
