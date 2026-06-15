#!/usr/bin/env node

const {
  ensureLocalRuntimeSeed,
  localRuntimePaths,
  refreshCommittedBaselineFromRuntime
} = require("../services/runtime-paths");

function main() {
  const runtime = ensureLocalRuntimeSeed(localRuntimePaths());
  const result = refreshCommittedBaselineFromRuntime({
    runtimePaths: runtime
  });

  console.log("[baseline] refreshed committed baseline from runtime state");
  result.copied.forEach((item) => {
    console.log(`[baseline] copied ${item}`);
  });
}

main();
