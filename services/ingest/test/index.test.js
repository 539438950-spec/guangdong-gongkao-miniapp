const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { FileStore } = require("../src/storage/file-store");
const { applyReviewAction, resolveStaleReviewItems } = require("../src/index");

function loadSnapshot(targetFile) {
  delete require.cache[require.resolve(targetFile)];
  return require(targetFile);
}

test("applyReviewAction should resolve and reopen review items with snapshot export", async () => {
  const rootDir = path.resolve(process.cwd(), ".tmp", `ingest-index-${Date.now()}`);
  const snapshotTarget = path.join(rootDir, "ingested.js");
  fs.mkdirSync(rootDir, { recursive: true });

  const store = new FileStore(rootDir);
  store.saveSourceState("rsks-gd", {
    sourceName: "广东省人事考试网"
  });
  store.enqueueReview({
    id: "review-cli-1",
    sourceId: "rsks-gd",
    reason: ["fetch failed"],
    createdAt: "2026-06-09T09:36:00.000Z",
    rawPayload: {
      fetchedAt: "2026-06-09T09:30:00.000Z",
      responseDigest: "digest-cli-1"
    },
    parsed: {
      notice: {
        title: "广东省2026年考试录用公务员公告",
        url: "https://rsks.gd.gov.cn/example",
        publishedAt: "2026-01-15T00:00:00.000Z"
      },
      batch: {
        parseStatus: "parsed",
        rowsTotal: 12,
        parseMetrics: {
          fieldCoveragePercent: 71,
          sheetSummary: "职位表:12行/12列",
          sheetCount: 1
        }
      }
    }
  });
  store.saveAlertEvent({
    id: "alert-cli-1",
    sourceId: "rsks-gd",
    sourceName: "广东省人事考试网",
    type: "review-queued",
    severity: "medium",
    createdAt: "2026-06-09T09:37:00.000Z",
    summary: "广东省人事考试网有待复核记录",
    details: "当前待复核 1 条。"
  });

  const resolved = await applyReviewAction({
    action: "resolve",
    reviewId: "review-cli-1",
    note: "已人工核对",
    storeRoot: rootDir,
    snapshotTarget,
    now: "2026-06-09T10:00:00.000Z"
  });
  assert.equal(resolved.result.status, "resolved");

  let snapshot = loadSnapshot(snapshotTarget);
  assert.equal(snapshot.reviewQueue.length, 0);
  assert.equal(snapshot.resolvedReviewQueue.length, 1);
  assert.equal(snapshot.resolvedReviewQueue[0].id, "review-cli-1");
  assert.equal(snapshot.resolvedReviewQueue[0].resolutionNote, "已人工核对");
  assert.equal(snapshot.resolvedReviewQueue[0].noticeTitle, "广东省2026年考试录用公务员公告");
  assert.equal(snapshot.resolvedReviewQueue[0].fieldCoveragePercent, 71);
  assert.equal(snapshot.alertEvents.length, 0);
  assert.equal(snapshot.publishAudits.length, 1);
  assert.equal(snapshot.publishAudits[0].eventType, "review-resolved");
  assert.equal(snapshot.publishAudits[0].sourceId, "rsks-gd");

  const reopened = await applyReviewAction({
    action: "reopen",
    reviewId: "review-cli-1",
    storeRoot: rootDir,
    snapshotTarget,
    now: "2026-06-09T10:05:00.000Z"
  });
  assert.equal(reopened.result.status, "pending");

  snapshot = loadSnapshot(snapshotTarget);
  assert.equal(snapshot.reviewQueue.length, 1);
  assert.equal(snapshot.reviewQueue[0].id, "review-cli-1");
  assert.equal(snapshot.reviewQueue[0].noticeTitle, "广东省2026年考试录用公务员公告");
  assert.equal(snapshot.reviewQueue[0].parseStatus, "parsed");
  assert.equal(snapshot.resolvedReviewQueue.length, 0);
  assert.equal(snapshot.alertEvents.length, 1);
  assert.equal(snapshot.alertEvents[0].type, "review-queued");
  assert.equal(snapshot.publishAudits.length, 2);
  assert.equal(snapshot.publishAudits[0].eventType, "review-reopened");
  assert.equal(snapshot.publishAudits[1].eventType, "review-resolved");
});

test("resolveStaleReviewItems should bulk-resolve historical transient failures", async () => {
  const rootDir = path.resolve(process.cwd(), ".tmp", `ingest-stale-${Date.now()}`);
  const snapshotTarget = path.join(rootDir, "ingested.js");
  fs.mkdirSync(rootDir, { recursive: true });

  const store = new FileStore(rootDir);
  store.saveSourceState("rsks-gd", {
    sourceName: "广东省人事考试网",
    lastSuccessAt: "2026-06-10T01:00:00.000Z"
  });
  store.enqueueReview({
    id: "review-stale-1",
    sourceId: "rsks-gd",
    reason: ["connect EACCES 120.197.33.7:443"],
    createdAt: "2026-06-08T14:40:34.681Z",
    rawPayload: null
  });
  store.enqueueReview({
    id: "review-active-1",
    sourceId: "rsks-gd",
    reason: ["字段覆盖率不足"],
    createdAt: "2026-06-10T01:10:00.000Z",
    rawPayload: {
      fetchedAt: "2026-06-10T01:05:00.000Z",
      responseDigest: "digest-active-1"
    },
    parsed: {
      notice: {
        title: "广东省2026年考试录用公务员公告",
        url: "https://rsks.gd.gov.cn/example",
        publishedAt: "2026-01-15T00:00:00.000Z"
      },
      batch: {
        parseStatus: "parsed",
        rowsTotal: 12,
        parseMetrics: {
          fieldCoveragePercent: 65,
          sheetSummary: "职位表:12行/12列",
          sheetCount: 1
        }
      }
    }
  });

  const result = await resolveStaleReviewItems({
    sourceId: "rsks-gd",
    note: "自动关闭历史复核",
    storeRoot: rootDir,
    snapshotTarget,
    now: "2026-06-10T01:20:00.000Z"
  });

  assert.equal(result.resolvedCount, 1);
  assert.deepEqual(result.reviewIds, ["review-stale-1"]);

  const snapshot = loadSnapshot(snapshotTarget);
  assert.equal(snapshot.reviewQueue.length, 1);
  assert.equal(snapshot.reviewQueue[0].id, "review-active-1");
  assert.equal(snapshot.resolvedReviewQueue.length, 1);
  assert.equal(snapshot.resolvedReviewQueue[0].id, "review-stale-1");
  assert.equal(snapshot.resolvedReviewQueue[0].resolutionNote, "自动关闭历史复核");
  assert.equal(snapshot.publishAudits.length, 1);
  assert.equal(snapshot.publishAudits[0].eventType, "review-stale-resolved");
  assert.equal(snapshot.publishAudits[0].sourceId, "rsks-gd");
});
