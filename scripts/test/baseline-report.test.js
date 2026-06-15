const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildBaselineReport,
  renderBaselineReportText
} = require("../baseline-report-lib");

test("baseline report should classify synced and out-of-sync files", () => {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(tmpRoot, "baseline-report-"));
  const baselinePaths = {
    userStateFile: path.join(root, "baseline", "api", "user-state.json"),
    snapshotTarget: path.join(root, "baseline", "weapp", "ingested.js"),
    demoSnapshotTarget: path.join(root, "baseline", "weapp", "demo.js"),
    ingestStoreRoot: path.join(root, "baseline", "ingest"),
    positionOverridePath: path.join(root, "baseline", "ingest", "position-overrides.json")
  };
  const runtimePaths = {
    userStateFile: path.join(root, "runtime", "api", "user-state.json"),
    snapshotTarget: path.join(root, "runtime", "ingest", "ingested.js"),
    demoSnapshotTarget: path.join(root, "runtime", "weapp", "demo.js"),
    ingestStoreRoot: path.join(root, "runtime", "ingest"),
    positionOverridePath: path.join(root, "runtime", "ingest", "position-overrides.json")
  };

  fs.mkdirSync(path.dirname(baselinePaths.snapshotTarget), { recursive: true });
  fs.mkdirSync(path.dirname(runtimePaths.snapshotTarget), { recursive: true });
  fs.mkdirSync(path.join(baselinePaths.ingestStoreRoot, "production"), { recursive: true });
  fs.mkdirSync(path.join(runtimePaths.ingestStoreRoot, "production"), { recursive: true });

  fs.writeFileSync(baselinePaths.snapshotTarget, "snapshot-a\n", "utf8");
  fs.writeFileSync(runtimePaths.snapshotTarget, "snapshot-a\n", "utf8");
  fs.writeFileSync(path.join(baselinePaths.ingestStoreRoot, "source-states.json"), "{\"a\":1}\n", "utf8");
  fs.writeFileSync(path.join(runtimePaths.ingestStoreRoot, "source-states.json"), "{\"a\":2}\n", "utf8");
  fs.writeFileSync(baselinePaths.positionOverridePath, "[]\n", "utf8");
  fs.writeFileSync(runtimePaths.positionOverridePath, "[]\n", "utf8");
  fs.writeFileSync(path.join(baselinePaths.ingestStoreRoot, "production", "rsks-gd.json"), "{\"v\":\"same\"}\n", "utf8");
  fs.writeFileSync(path.join(runtimePaths.ingestStoreRoot, "production", "rsks-gd.json"), "{\"v\":\"same\"}\n", "utf8");
  fs.writeFileSync(path.join(runtimePaths.ingestStoreRoot, "production", "national-bm.json"), "{\"v\":\"runtime-only\"}\n", "utf8");

  const deliveryReport = {
    summary: {
      baseline: [
        { file: normalize(path.relative(process.cwd(), baselinePaths.snapshotTarget)) },
        { file: normalize(path.relative(process.cwd(), path.join(baselinePaths.ingestStoreRoot, "source-states.json"))) }
      ]
    }
  };

  const report = buildBaselineReport({
    baselinePaths,
    runtimePaths,
    deliveryReport
  });

  assert.equal(report.summary.total, 5);
  assert.equal(report.summary.gitChanged, 2);
  assert.equal(report.summary.synced, 3);
  assert.equal(report.summary["out-of-sync"], 1);
  assert.equal(report.summary["missing-baseline"], 1);

  const text = renderBaselineReportText(report);
  assert.ok(text.includes("基线差异报告"));
  assert.ok(text.includes("[out-of-sync]"));
  assert.ok(text.includes("[missing-baseline]"));
});

function normalize(filePath) {
  return String(filePath).replace(/\\/g, "/");
}
