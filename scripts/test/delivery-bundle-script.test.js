const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

test("delivery bundle script should include only the latest session and execute audit artifacts plus active aliases", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-bundle-script-"));
  const outputDir = path.join(root, "bundle");
  const executeAuditDir = path.join(root, "execute-audit");
  const sessionAuditDir = path.join(root, "session-audit");
  const weappBundleAuditDir = path.join(root, "weapp-bundle");
  const weappDevtoolsAuditDir = path.join(root, "weapp-devtools");
  const docsAuditDir = path.join(root, "docs-entrypoints");
  fs.mkdirSync(executeAuditDir, { recursive: true });
  fs.mkdirSync(sessionAuditDir, { recursive: true });
  fs.mkdirSync(weappBundleAuditDir, { recursive: true });
  fs.mkdirSync(weappDevtoolsAuditDir, { recursive: true });
  fs.mkdirSync(docsAuditDir, { recursive: true });

  fs.writeFileSync(path.join(executeAuditDir, "latest.json"), JSON.stringify({
    auditId: "2026-06-11T13-24-29-228Z",
    generatedAt: "2026-06-11T13:24:29.228Z",
    status: "dry-run",
    apply: false,
    mode: "all",
    results: []
  }), "utf8");
  fs.writeFileSync(path.join(executeAuditDir, "2026-06-11T13-24-29-228Z.json"), JSON.stringify({
    auditId: "2026-06-11T13-24-29-228Z",
    generatedAt: "2026-06-11T13:24:29.228Z",
    status: "dry-run",
    apply: false,
    mode: "all",
    results: []
  }), "utf8");
  fs.writeFileSync(path.join(executeAuditDir, "2026-06-11T13-23-11-255Z.json"), "{}\n", "utf8");

  fs.writeFileSync(path.join(sessionAuditDir, "latest.json"), JSON.stringify({
    auditId: "2026-06-11T13-45-46-482Z",
    generatedAt: "2026-06-11T13:45:46.482Z",
    status: "dry-run",
    apply: false,
    commits: [],
    results: []
  }), "utf8");
  fs.writeFileSync(path.join(sessionAuditDir, "2026-06-11T13-45-46-482Z.json"), JSON.stringify({
    auditId: "2026-06-11T13-45-46-482Z",
    generatedAt: "2026-06-11T13:45:46.482Z",
    status: "dry-run",
    apply: false,
    commits: [],
    results: []
  }), "utf8");
  fs.writeFileSync(path.join(sessionAuditDir, "03-frontend-stage-commit.json"), JSON.stringify({
    auditId: "2026-06-11T13-45-46-482Z",
    generatedAt: "2026-06-11T13:45:46.482Z",
    status: "dry-run",
    apply: false,
    commits: [],
    results: []
  }), "utf8");
  fs.writeFileSync(path.join(sessionAuditDir, "2026-06-11T14-15-01-477Z.json"), "{}\n", "utf8");

  fs.writeFileSync(path.join(weappBundleAuditDir, "latest.json"), JSON.stringify({
    statusId: "2026-06-12T09-00-00-000Z",
    generatedAt: "2026-06-12T09:00:00.000Z",
    summary: {
      thresholdStatus: "within-limit",
      includedSizeKB: 683.28,
      ignoredSizeKB: 0
    }
  }), "utf8");
  fs.writeFileSync(path.join(weappBundleAuditDir, "2026-06-12T09-00-00-000Z.json"), JSON.stringify({
    statusId: "2026-06-12T09-00-00-000Z",
    generatedAt: "2026-06-12T09:00:00.000Z",
    summary: {
      thresholdStatus: "within-limit",
      includedSizeKB: 683.28,
      ignoredSizeKB: 0
    }
  }), "utf8");
  fs.writeFileSync(path.join(weappBundleAuditDir, "2026-06-12T08-59-00-000Z.json"), "{}\n", "utf8");

  fs.writeFileSync(path.join(weappDevtoolsAuditDir, "latest.json"), JSON.stringify({
    statusId: "2026-06-12T09-01-00-000Z",
    generatedAt: "2026-06-12T09:01:00.000Z",
    ok: true,
    mode: "preview-success",
    message: "preview succeeded"
  }), "utf8");
  fs.writeFileSync(path.join(weappDevtoolsAuditDir, "2026-06-12T09-01-00-000Z.json"), JSON.stringify({
    statusId: "2026-06-12T09-01-00-000Z",
    generatedAt: "2026-06-12T09:01:00.000Z",
    ok: true,
    mode: "preview-success",
    message: "preview succeeded"
  }), "utf8");
  fs.writeFileSync(path.join(weappDevtoolsAuditDir, "2026-06-12T09-00-30-000Z.json"), "{}\n", "utf8");
  fs.writeFileSync(path.join(weappDevtoolsAuditDir, "active-run.lock.json"), "{ \"pid\": 1 }\n", "utf8");
  fs.writeFileSync(path.join(weappDevtoolsAuditDir, "preview-info.json"), "{ \"qrcodePath\": \"preview-qr.png\" }\n", "utf8");

  fs.writeFileSync(path.join(docsAuditDir, "latest.json"), JSON.stringify({
    statusId: "2026-06-12T09-02-00-000Z",
    generatedAt: "2026-06-12T09:02:00.000Z",
    ok: true,
    failures: []
  }), "utf8");
  fs.writeFileSync(path.join(docsAuditDir, "README.txt"), "ok\n", "utf8");
  fs.writeFileSync(path.join(docsAuditDir, "2026-06-12T09-02-00-000Z.json"), JSON.stringify({
    statusId: "2026-06-12T09-02-00-000Z",
    generatedAt: "2026-06-12T09:02:00.000Z",
    ok: true,
    failures: []
  }), "utf8");

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "stale.txt"), "stale\n", "utf8");

  const script = path.resolve(process.cwd(), "scripts", "delivery-bundle.js");
  require("node:child_process").execFileSync(process.execPath, [
    script,
    "--skip-smoke",
    "--write",
    "--output-dir",
    outputDir,
    "--execute-audit-dir",
    executeAuditDir,
    "--session-audit-dir",
    sessionAuditDir,
    "--weapp-bundle-audit-dir",
    weappBundleAuditDir,
    "--weapp-devtools-audit-dir",
    weappDevtoolsAuditDir,
    "--docs-audit-dir",
    docsAuditDir
  ], {
    cwd: process.cwd(),
    stdio: "pipe"
  });

  assert.ok(fs.existsSync(path.join(outputDir, "artifacts", "session-audit", "latest.json")));
  assert.ok(fs.existsSync(path.join(outputDir, "artifacts", "session-audit", "2026-06-11T13-45-46-482Z.json")));
  assert.ok(fs.existsSync(path.join(outputDir, "artifacts", "session-audit", "03-frontend-stage-commit.json")));
  assert.equal(fs.existsSync(path.join(outputDir, "artifacts", "session-audit", "2026-06-11T14-15-01-477Z.json")), false);
  assert.ok(fs.existsSync(path.join(outputDir, "artifacts", "execute-audit", "latest.json")));
  assert.ok(fs.existsSync(path.join(outputDir, "artifacts", "execute-audit", "2026-06-11T13-24-29-228Z.json")));
  assert.equal(fs.existsSync(path.join(outputDir, "artifacts", "execute-audit", "2026-06-11T13-23-11-255Z.json")), false);
  assert.ok(fs.existsSync(path.join(outputDir, "artifacts", "weapp-bundle-audit", "latest.json")));
  assert.ok(fs.existsSync(path.join(outputDir, "artifacts", "weapp-bundle-audit", "2026-06-12T09-00-00-000Z.json")));
  assert.equal(fs.existsSync(path.join(outputDir, "artifacts", "weapp-bundle-audit", "2026-06-12T08-59-00-000Z.json")), false);
  assert.ok(fs.existsSync(path.join(outputDir, "artifacts", "weapp-devtools-audit", "latest.json")));
  assert.ok(fs.existsSync(path.join(outputDir, "artifacts", "weapp-devtools-audit", "2026-06-12T09-01-00-000Z.json")));
  assert.equal(fs.existsSync(path.join(outputDir, "artifacts", "weapp-devtools-audit", "2026-06-12T09-00-30-000Z.json")), false);
  assert.equal(fs.existsSync(path.join(outputDir, "artifacts", "weapp-devtools-audit", "active-run.lock.json")), false);
  assert.equal(fs.existsSync(path.join(outputDir, "artifacts", "weapp-devtools-audit", "preview-info.json")), false);
  assert.ok(fs.existsSync(path.join(outputDir, "artifacts", "docs-entrypoints-audit", "latest.json")));
  assert.ok(fs.existsSync(path.join(outputDir, "artifacts", "docs-entrypoints-audit", "2026-06-12T09-02-00-000Z.json")));
  assert.ok(fs.existsSync(path.join(outputDir, "RUNBOOK.txt")));
  assert.ok(fs.existsSync(path.join(outputDir, "QUICKSTART.txt")));
  assert.equal(fs.existsSync(path.join(outputDir, "stale.txt")), false);
});
