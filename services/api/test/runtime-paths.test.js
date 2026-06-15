const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  baselineSeedPaths,
  ensureLocalRuntimeSeed,
  localRuntimePaths,
  refreshCommittedBaselineFromRuntime
} = require("../../runtime-paths");

test("local runtime seed should copy committed baseline into isolated runtime targets", () => {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const runtimeRoot = fs.mkdtempSync(path.join(tmpRoot, "runtime-seed-"));
  const runtimePaths = {
    userStateFile: path.join(runtimeRoot, "api", "user-state.json"),
    snapshotTarget: path.join(runtimeRoot, "ingest", "ingested.js"),
    demoSnapshotTarget: path.join(runtimeRoot, "weapp", "demo.js"),
    ingestStoreRoot: path.join(runtimeRoot, "ingest"),
    positionOverridePath: path.join(runtimeRoot, "ingest", "position-overrides.json")
  };

  const baseline = baselineSeedPaths();
  const defaults = localRuntimePaths();
  const seeded = ensureLocalRuntimeSeed(runtimePaths);

  assert.notEqual(defaults.snapshotTarget, baseline.snapshotTarget);
  assert.equal(seeded.snapshotTarget, runtimePaths.snapshotTarget);
  assert.equal(fs.existsSync(seeded.snapshotTarget), true);
  assert.equal(fs.existsSync(path.join(seeded.ingestStoreRoot, "source-states.json")), true);
  assert.equal(fs.existsSync(path.join(seeded.ingestStoreRoot, "production")), true);
  assert.equal(fs.existsSync(seeded.positionOverridePath), true);
});

test("baseline refresh should copy runtime state back into committed baseline targets", () => {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(tmpRoot, "baseline-refresh-"));
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
  fs.mkdirSync(path.join(baselinePaths.ingestStoreRoot, "production"), { recursive: true });
  fs.writeFileSync(baselinePaths.snapshotTarget, "module.exports = { updatedAt: 'baseline' };\n", "utf8");
  fs.writeFileSync(path.join(baselinePaths.ingestStoreRoot, "source-states.json"), "[]\n", "utf8");
  fs.writeFileSync(baselinePaths.positionOverridePath, "[]\n", "utf8");
  fs.writeFileSync(path.join(baselinePaths.ingestStoreRoot, "production", "rsks-gd.json"), "{\"version\":\"baseline\"}\n", "utf8");

  fs.mkdirSync(path.dirname(runtimePaths.snapshotTarget), { recursive: true });
  fs.mkdirSync(path.join(runtimePaths.ingestStoreRoot, "production"), { recursive: true });
  fs.writeFileSync(runtimePaths.snapshotTarget, "module.exports = { updatedAt: 'runtime' };\n", "utf8");
  fs.writeFileSync(path.join(runtimePaths.ingestStoreRoot, "source-states.json"), "[{\"sourceId\":\"rsks-gd\"}]\n", "utf8");
  fs.writeFileSync(runtimePaths.positionOverridePath, "[{\"id\":\"rule-1\"}]\n", "utf8");
  fs.writeFileSync(path.join(runtimePaths.ingestStoreRoot, "production", "rsks-gd.json"), "{\"version\":\"runtime\"}\n", "utf8");

  const result = refreshCommittedBaselineFromRuntime({
    baselinePaths,
    runtimePaths
  });

  assert.equal(result.copied.length, 4);
  assert.equal(fs.readFileSync(baselinePaths.snapshotTarget, "utf8").includes("runtime"), true);
  assert.equal(fs.readFileSync(path.join(baselinePaths.ingestStoreRoot, "source-states.json"), "utf8").includes("rsks-gd"), true);
  assert.equal(fs.readFileSync(baselinePaths.positionOverridePath, "utf8").includes("rule-1"), true);
  assert.equal(fs.readFileSync(path.join(baselinePaths.ingestStoreRoot, "production", "rsks-gd.json"), "utf8").includes("runtime"), true);
});
