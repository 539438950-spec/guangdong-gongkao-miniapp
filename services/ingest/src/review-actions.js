const path = require("node:path");

const { FileStore } = require("./storage/file-store");
const { exportWeappSnapshot } = require("./publish/export-weapp-snapshot");
const { classifyReviewItem } = require("./review-analysis");
const { mapSourceState } = require("./publish/source-state");

function buildMappedSourceState(store, sourceId, now) {
  return mapSourceState(store.getSourceState(sourceId) || { sourceId }, { now });
}

function saveReviewAudit(store, event, sourceId, sourceName, now) {
  const mappedSourceState = buildMappedSourceState(store, sourceId, now);
  return store.savePublishAudit({
    createdAt: typeof now === "string" ? now : now.toISOString(),
    sourceId,
    sourceName,
    releaseMode: mappedSourceState.releaseMode || "",
    stableVersionId: mappedSourceState.stableVersionId || "",
    stableVersionLabel: mappedSourceState.stableVersionLabel || "",
    candidateVersionId: mappedSourceState.candidateVersionId || "",
    candidateVersionLabel: mappedSourceState.candidateVersionLabel || "",
    ...event
  });
}

function defaultReviewPaths() {
  return {
    storeRoot: path.resolve(__dirname, "../var"),
    positionOverridePath: path.resolve(__dirname, "../var/position-overrides.json"),
    snapshotTarget: path.resolve(__dirname, "../../../apps/weapp/data/ingested.js")
  };
}

async function applyReviewAction(options) {
  const store = new FileStore(options.storeRoot);
  const now = options.now || new Date();
  const result = options.action === "resolve"
    ? store.resolveReviewItem(options.reviewId, options.note || "")
    : store.reopenReviewItem(options.reviewId);
  const sourceState = store.getSourceState(result.sourceId) || {};

  saveReviewAudit(
    store,
    {
      eventType: options.action === "resolve" ? "review-resolved" : "review-reopened",
      summary: options.action === "resolve"
        ? "Manually resolved review item"
        : "Reopened review item",
      detail: [
        `review=${result.id}`,
        result.noticeTitle ? `notice=${result.noticeTitle}` : "",
        options.action === "resolve" && (options.note || result.resolutionNote)
          ? `note=${options.note || result.resolutionNote}`
          : ""
      ].filter(Boolean).join(" | ")
    },
    result.sourceId || "",
    sourceState.sourceName || result.sourceName || result.sourceId || "",
    now
  );

  exportWeappSnapshot(store, options.snapshotTarget, { now });
  return {
    result,
    snapshotTarget: options.snapshotTarget
  };
}

async function resolveStaleReviewItems(options) {
  const store = new FileStore(options.storeRoot);
  const now = options.now || new Date();
  const sourceId = String(options.sourceId || "").trim();
  const note = options.note || "自动关闭：后续已有稳定成功版本，判定为历史瞬时错误。";
  const sourceStates = Object.fromEntries(store.listSourceStates().map((item) => [item.sourceId, item]));
  const reviewQueue = store.listReviewQueue().filter((item) => !sourceId || item.sourceId === sourceId);
  const staleItems = reviewQueue.filter((item) => classifyReviewItem(item, sourceStates[item.sourceId] || {}).stale);
  const staleItemsBySource = staleItems.reduce((result, item) => {
    if (!result[item.sourceId]) {
      result[item.sourceId] = [];
    }
    result[item.sourceId].push(item);
    return result;
  }, {});

  staleItems.forEach((item) => {
    store.resolveReviewItem(item.id, note);
  });

  Object.keys(staleItemsBySource).forEach((currentSourceId) => {
    const items = staleItemsBySource[currentSourceId];
    const sourceState = store.getSourceState(currentSourceId) || sourceStates[currentSourceId] || {};
    saveReviewAudit(
      store,
      {
        eventType: "review-stale-resolved",
        summary: "Bulk resolved stale review backlog",
        detail: [
          `count=${items.length}`,
          `reviews=${items.map((item) => item.id).join(",")}`,
          note ? `note=${note}` : ""
        ].filter(Boolean).join(" | ")
      },
      currentSourceId,
      sourceState.sourceName || items[0].sourceName || currentSourceId,
      now
    );
  });

  exportWeappSnapshot(store, options.snapshotTarget, { now });
  return {
    resolvedCount: staleItems.length,
    reviewIds: staleItems.map((item) => item.id),
    snapshotTarget: options.snapshotTarget,
    sourceId
  };
}

module.exports = {
  defaultReviewPaths,
  applyReviewAction,
  resolveStaleReviewItems
};
