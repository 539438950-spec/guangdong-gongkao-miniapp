const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function baselineSeedPaths() {
  return {
    userStateFile: path.join(ROOT, "services", "api", "var", "user-state.json"),
    snapshotTarget: path.join(ROOT, "apps", "weapp", "data", "ingested.js"),
    demoSnapshotTarget: path.join(ROOT, "apps", "weapp", "data", "demo.js"),
    ingestStoreRoot: path.join(ROOT, "services", "ingest", "var"),
    positionOverridePath: path.join(ROOT, "services", "ingest", "var", "position-overrides.json")
  };
}

function localRuntimePaths() {
  const baseline = baselineSeedPaths();
  return {
    userStateFile: path.join(ROOT, "services", "api", "var", "runtime", "user-state.json"),
    snapshotTarget: path.join(ROOT, "services", "ingest", "var", "runtime", "ingested.js"),
    demoSnapshotTarget: baseline.demoSnapshotTarget,
    ingestStoreRoot: path.join(ROOT, "services", "ingest", "var", "runtime"),
    positionOverridePath: path.join(ROOT, "services", "ingest", "var", "runtime", "position-overrides.json"),
    artifactsRoot: path.join(ROOT, "services", "ingest", "var", "runtime", "artifacts")
  };
}

function copyPathIfMissing(sourcePath, targetPath) {
  if (fs.existsSync(targetPath) || !fs.existsSync(sourcePath)) {
    return;
  }

  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.mkdirSync(targetPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath)) {
      copyPathIfMissing(path.join(sourcePath, entry), path.join(targetPath, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function replacePath(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.rmSync(targetPath, { recursive: true, force: true });
    fs.mkdirSync(targetPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath)) {
      replacePath(path.join(sourcePath, entry), path.join(targetPath, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function ensureLocalRuntimeSeed(paths = {}, options = {}) {
  const baseline = options.baselinePaths || baselineSeedPaths();
  const runtime = {
    ...localRuntimePaths(),
    ...paths
  };

  copyPathIfMissing(baseline.snapshotTarget, runtime.snapshotTarget);
  copyPathIfMissing(baseline.demoSnapshotTarget, runtime.demoSnapshotTarget);
  copyPathIfMissing(
    path.join(baseline.ingestStoreRoot, "source-states.json"),
    path.join(runtime.ingestStoreRoot, "source-states.json")
  );
  copyPathIfMissing(baseline.positionOverridePath, runtime.positionOverridePath);
  ["production", "review", "alerts"].forEach((segment) => {
    copyPathIfMissing(
      path.join(baseline.ingestStoreRoot, segment),
      path.join(runtime.ingestStoreRoot, segment)
    );
  });
  fs.mkdirSync(path.dirname(runtime.userStateFile), { recursive: true });
  return runtime;
}

function refreshCommittedBaselineFromRuntime(options = {}) {
  const baseline = options.baselinePaths || baselineSeedPaths();
  const runtime = {
    ...localRuntimePaths(),
    ...(options.runtimePaths || {})
  };

  replacePath(runtime.snapshotTarget, baseline.snapshotTarget);
  replacePath(path.join(runtime.ingestStoreRoot, "source-states.json"), path.join(baseline.ingestStoreRoot, "source-states.json"));
  replacePath(runtime.positionOverridePath, baseline.positionOverridePath);
  replacePath(path.join(runtime.ingestStoreRoot, "production"), path.join(baseline.ingestStoreRoot, "production"));

  return {
    baseline,
    runtime,
    copied: [
      baseline.snapshotTarget,
      path.join(baseline.ingestStoreRoot, "source-states.json"),
      baseline.positionOverridePath,
      path.join(baseline.ingestStoreRoot, "production")
    ]
  };
}

module.exports = {
  ROOT,
  baselineSeedPaths,
  localRuntimePaths,
  copyPathIfMissing,
  replacePath,
  ensureLocalRuntimeSeed,
  refreshCommittedBaselineFromRuntime
};
