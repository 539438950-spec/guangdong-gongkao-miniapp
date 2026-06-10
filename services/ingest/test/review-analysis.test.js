const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyReviewItem,
  summarizeReviewQueueForSource
} = require("../src/review-analysis");

test("classifyReviewItem should mark legacy transient failures as stale after later success", () => {
  const classification = classifyReviewItem({
    id: "review-1",
    sourceId: "rsks-gd",
    createdAt: "2026-06-08T00:00:00.000Z",
    reason: ["request failed: 404"],
    rawPayload: null
  }, {
    sourceId: "rsks-gd",
    lastSuccessAt: "2026-06-10T00:00:00.000Z"
  });

  assert.equal(classification.stale, true);
  assert.equal(classification.blocking, false);
  assert.equal(classification.reason, "later-stable-success");
});

test("classifyReviewItem should keep parsed quality issues as blocking", () => {
  const classification = classifyReviewItem({
    id: "review-2",
    sourceId: "rsks-gd",
    createdAt: "2026-06-10T00:00:00.000Z",
    reason: ["字段覆盖率不足"],
    rawPayload: { fetchedAt: "2026-06-10T00:00:00.000Z" },
    parsed: { batch: { parseStatus: "parsed" } }
  }, {
    sourceId: "rsks-gd",
    lastSuccessAt: "2026-06-10T00:30:00.000Z"
  });

  assert.equal(classification.stale, false);
  assert.equal(classification.blocking, true);
  assert.equal(classification.reason, "active-review");
});

test("summarizeReviewQueueForSource should split blocking and stale counts", () => {
  const summary = summarizeReviewQueueForSource([
    {
      id: "review-stale",
      sourceId: "rsks-gd",
      createdAt: "2026-06-08T00:00:00.000Z",
      reason: ["fetch failed"],
      rawPayload: null
    },
    {
      id: "review-blocking",
      sourceId: "rsks-gd",
      createdAt: "2026-06-10T00:10:00.000Z",
      reason: ["字段覆盖率不足"],
      rawPayload: { fetchedAt: "2026-06-10T00:10:00.000Z" },
      parsed: { batch: { parseStatus: "parsed" } }
    }
  ], {
    sourceId: "rsks-gd",
    lastSuccessAt: "2026-06-10T00:30:00.000Z"
  });

  assert.equal(summary.pendingCount, 2);
  assert.equal(summary.blockingPendingCount, 1);
  assert.equal(summary.stalePendingCount, 1);
  assert.deepEqual(summary.blockingReviewIds, ["review-blocking"]);
  assert.deepEqual(summary.staleReviewIds, ["review-stale"]);
});
