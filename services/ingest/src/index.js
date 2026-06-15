const path = require("node:path");
const { runIngestCycle } = require("./core/run-cycle");
const { startScheduler } = require("./scheduler");
const { defaultReviewPaths, applyReviewAction, resolveStaleReviewItems } = require("./review-actions");

function hasFlag(name) {
  return process.argv.includes(name);
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) {
    return "";
  }
  return process.argv[index + 1];
}

function defaultPaths() {
  return defaultReviewPaths();
}

function resolvePathArg(name, fallback) {
  const value = getArgValue(name);
  if (!value) {
    return fallback;
  }
  return path.resolve(process.cwd(), value);
}

function getReviewAction() {
  if (hasFlag("--resolve-stale-reviews")) {
    return {
      action: "resolve-stale"
    };
  }

  const resolveId = getArgValue("--resolve-review");
  if (resolveId) {
    return {
      action: "resolve",
      reviewId: resolveId
    };
  }

  const reopenId = getArgValue("--reopen-review");
  if (reopenId) {
    return {
      action: "reopen",
      reviewId: reopenId
    };
  }

  return null;
}

function buildRunOptions() {
  const defaults = defaultPaths();
  return {
    storeRoot: resolvePathArg("--store-root", defaults.storeRoot || defaults.ingestStoreRoot),
    snapshotTarget: resolvePathArg("--snapshot-target", defaults.snapshotTarget),
    positionOverridePath: resolvePathArg("--position-override-path", defaults.positionOverridePath)
  };
}

async function main() {
  const runOptions = buildRunOptions();
  const reviewAction = getReviewAction();

  if (reviewAction) {
    if (reviewAction.action === "resolve-stale") {
      const result = await resolveStaleReviewItems({
        ...runOptions,
        sourceId: getArgValue("--source-id"),
        note: getArgValue("--note"),
        now: new Date()
      });
      console.log(
        `[review] resolved ${result.resolvedCount} stale review item(s)${result.sourceId ? ` for ${result.sourceId}` : ""} and exported snapshot to ${result.snapshotTarget}`
      );
      return;
    }

    const { result, snapshotTarget } = await applyReviewAction({
      ...runOptions,
      ...reviewAction,
      note: getArgValue("--note")
    });
    console.log(
      `[review] ${reviewAction.action}d ${result.id} (${result.sourceId}) and exported snapshot to ${snapshotTarget}`
    );
    return;
  }

  if (hasFlag("--watch")) {
    await startScheduler({
      ...runOptions,
      intervalMs: Number(process.env.INGEST_INTERVAL_MS || 300000)
    });
    return;
  }

  await runIngestCycle(runOptions);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  applyReviewAction,
  resolveStaleReviewItems,
  runIngestCycle,
  startScheduler
};
