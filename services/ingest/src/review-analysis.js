const { resolveDate } = require("./publish/source-state");

function normalizeReasons(reviewItem = {}) {
  return (Array.isArray(reviewItem.reason) ? reviewItem.reason : [])
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isLegacyTransientFailure(reviewItem = {}) {
  const reasons = normalizeReasons(reviewItem);
  const hasPayload = Boolean(reviewItem.rawPayload) || Boolean(reviewItem.parsed);
  if (hasPayload) {
    return false;
  }
  return (
    reasons.includes("fetch failed") ||
    reasons.includes("request failed") ||
    reasons.includes("404") ||
    reasons.includes("connect eacces") ||
    reasons.includes("econnreset") ||
    reasons.includes("socket hang up") ||
    reasons.includes("network") ||
    reasons.includes("timeout") ||
    reasons.includes("econn") ||
    reasons.includes("dns")
  );
}

function classifyReviewItem(reviewItem = {}, sourceState = {}) {
  const createdAt = resolveDate(reviewItem.createdAt);
  const lastSuccessAt = resolveDate(
    sourceState.lastSuccessAt ||
    sourceState.lastPublishedAt ||
    sourceState.stableVersionUpdatedAt
  );
  const hasLaterStableSuccess = Boolean(
    createdAt &&
    lastSuccessAt &&
    lastSuccessAt.getTime() > createdAt.getTime()
  );
  const staleBecauseRecovered = hasLaterStableSuccess && isLegacyTransientFailure(reviewItem);
  const status = reviewItem.status || "pending";
  const stale = status !== "resolved" && staleBecauseRecovered;
  const blocking = status !== "resolved" && !stale;

  return {
    status,
    blocking,
    stale,
    reason: stale
      ? "later-stable-success"
      : (blocking ? "active-review" : "resolved")
  };
}

function summarizeReviewQueueForSource(reviewQueue = [], sourceState = {}) {
  return reviewQueue.reduce((summary, item) => {
    if (item.sourceId !== sourceState.sourceId) {
      return summary;
    }
    const classification = classifyReviewItem(item, sourceState);
    if (classification.status === "resolved") {
      return summary;
    }
    summary.pendingCount += 1;
    if (classification.blocking) {
      summary.blockingPendingCount += 1;
      summary.blockingReviewIds.push(item.id || "");
    }
    if (classification.stale) {
      summary.stalePendingCount += 1;
      summary.staleReviewIds.push(item.id || "");
    }
    return summary;
  }, {
    pendingCount: 0,
    blockingPendingCount: 0,
    stalePendingCount: 0,
    blockingReviewIds: [],
    staleReviewIds: []
  });
}

function summarizeReviewQueueBySource(reviewQueue = [], sourceStates = []) {
  return sourceStates.reduce((result, sourceState) => {
    result[sourceState.sourceId] = summarizeReviewQueueForSource(reviewQueue, sourceState);
    return result;
  }, {});
}

module.exports = {
  classifyReviewItem,
  summarizeReviewQueueForSource,
  summarizeReviewQueueBySource
};
