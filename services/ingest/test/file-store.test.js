const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { FileStore } = require("../src/storage/file-store");

test("FileStore should persist raw snapshots and production payloads to disk", () => {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tmpRoot, "gongkao-file-store-"));
  const store = new FileStore(rootDir);

  store.saveRawSnapshot({
    sourceId: "rsks-gd",
    fetchedAt: "2026-06-08T00:00:00.000Z",
    responseDigest: "digest-1",
    attachmentUrls: ["https://example.com/jobs.xlsx"]
  });
  store.publish("rsks-gd", {
    notice: { id: "n1", title: "示例公告" },
    positions: []
  });

  const rawFiles = fs.readdirSync(path.join(rootDir, "raw"));
  const productionFiles = fs.readdirSync(path.join(rootDir, "production"));

  assert.equal(rawFiles.length, 1);
  assert.ok(productionFiles.includes("rsks-gd.json"));
});

test("FileStore should restore previous production payloads on startup", () => {
  const rootDir = path.resolve(process.cwd(), ".tmp", `file-store-restore-${Date.now()}`);
  fs.mkdirSync(path.join(rootDir, "production"), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, "production", "rsks-gd.json"),
    JSON.stringify({
      source: { id: "rsks-gd", name: "广东省人事考试网" },
      notice: { id: "n1", title: "广东省2025年考试录用公务员公告" },
      positions: []
    }),
    "utf8"
  );

  const store = new FileStore(rootDir);

  assert.equal(store.getProduction("rsks-gd").notice.id, "n1");
  assert.equal(store.rollback("rsks-gd").notice.title, "广东省2025年考试录用公务员公告");
});

test("FileStore should persist and restore source states", () => {
  const rootDir = path.resolve(process.cwd(), ".tmp", `file-store-state-${Date.now()}`);
  fs.mkdirSync(rootDir, { recursive: true });

  const first = new FileStore(rootDir);
  first.saveSourceState("rsks-gd", {
    sourceName: "广东省人事考试网",
    lastFetchedAt: "2026-06-09T00:00:00.000Z",
    lastSuccessfulFetchedAt: "2026-06-09T00:00:00.000Z",
    lastPublishedAt: "2026-06-09T00:05:00.000Z",
    lastRunStatus: "published"
  });

  const second = new FileStore(rootDir);
  const states = second.listSourceStates();

  assert.equal(states.length, 1);
  assert.equal(states[0].sourceId, "rsks-gd");
  assert.equal(states[0].lastRunStatus, "published");
  assert.equal(states[0].lastSuccessfulFetchedAt, "2026-06-09T00:00:00.000Z");
});

test("FileStore should restore historical review queue on startup", () => {
  const rootDir = path.resolve(process.cwd(), ".tmp", `file-store-review-${Date.now()}`);
  fs.mkdirSync(path.join(rootDir, "review"), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, "review", "rsks-gd-review.json"),
    JSON.stringify({
      sourceId: "rsks-gd",
      reason: ["fetch failed"],
      createdAt: "2026-06-09T00:00:00.000Z"
    }),
    "utf8"
  );

  const store = new FileStore(rootDir);

  assert.equal(store.listReviewQueue().length, 1);
  assert.equal(store.listReviewQueue()[0].sourceId, "rsks-gd");
});

test("FileStore should infer review ids and createdAt for historical files", () => {
  const rootDir = path.resolve(process.cwd(), ".tmp", `file-store-review-normalize-${Date.now()}`);
  const reviewDir = path.join(rootDir, "review");
  fs.mkdirSync(reviewDir, { recursive: true });
  fs.writeFileSync(
    path.join(reviewDir, "rsks-gd-1780929011153.json"),
    JSON.stringify({
      sourceId: "rsks-gd",
      reason: ["fetch failed"]
    }),
    "utf8"
  );

  const store = new FileStore(rootDir);
  const [item] = store.listReviewQueue();

  assert.equal(item.id, "rsks-gd-1780929011153");
  assert.equal(item.createdAt, "2026-06-08T14:30:11.153Z");
});

test("FileStore should persist and restore alert events", () => {
  const rootDir = path.resolve(process.cwd(), ".tmp", `file-store-alert-${Date.now()}`);
  fs.mkdirSync(rootDir, { recursive: true });

  const first = new FileStore(rootDir);
  first.saveAlertEvent({
    sourceId: "rsks-gd",
    sourceName: "广东省人事考试网",
    type: "sla-overdue",
    severity: "high",
    createdAt: "2026-06-09T10:00:00.000Z",
    summary: "广东省人事考试网已超时未更新",
    details: "抓取已超时 90 分钟。"
  });

  const second = new FileStore(rootDir);
  const events = second.listAlertEvents();

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "sla-overdue");
  assert.equal(events[0].sourceId, "rsks-gd");
  assert.equal(events[0].createdAt, "2026-06-09T10:00:00.000Z");
});

test("FileStore should persist resolved review items and reopen them with alert recovery", () => {
  const rootDir = path.resolve(process.cwd(), ".tmp", `file-store-review-resolve-${Date.now()}`);
  fs.mkdirSync(rootDir, { recursive: true });

  const first = new FileStore(rootDir);
  first.saveSourceState("rsks-gd", {
    sourceName: "广东省人事考试网",
    pendingReviewCount: 0
  });
  first.enqueueReview({
    id: "review-1",
    sourceId: "rsks-gd",
    reason: ["fetch failed"],
    createdAt: "2026-06-09T09:36:00.000Z"
  });
  first.saveAlertEvent({
    id: "alert-review-1",
    sourceId: "rsks-gd",
    sourceName: "广东省人事考试网",
    type: "review-queued",
    severity: "medium",
    createdAt: "2026-06-09T09:37:00.000Z",
    summary: "广东省人事考试网有待复核记录",
    details: "当前待复核 1 条。"
  });

  const resolved = first.resolveReviewItem("review-1", "已人工核对");
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolutionNote, "已人工核对");
  assert.equal(first.listReviewQueue().length, 0);
  assert.equal(first.listResolvedReviewQueue().length, 1);
  assert.equal(first.listAlertEvents().length, 0);
  assert.equal(first.getSourceState("rsks-gd").pendingReviewCount, 0);

  const storedReview = JSON.parse(
    fs.readFileSync(path.join(rootDir, "review", "review-1.json"), "utf8")
  );
  const storedAlert = JSON.parse(
    fs.readFileSync(path.join(rootDir, "alerts", "alert-review-1.json"), "utf8")
  );
  assert.equal(storedReview.status, "resolved");
  assert.equal(storedReview.resolutionNote, "已人工核对");
  assert.equal(storedAlert.status, "resolved");

  const second = new FileStore(rootDir);
  assert.equal(second.listReviewQueue().length, 0);
  assert.equal(second.listResolvedReviewQueue().length, 1);
  assert.equal(second.listResolvedReviewQueue()[0].id, "review-1");
  assert.equal(second.listAlertEvents().length, 0);
  assert.equal(second.getSourceState("rsks-gd").pendingReviewCount, 0);

  const reopened = second.reopenReviewItem("review-1");
  assert.equal(reopened.status, "pending");
  assert.equal(reopened.resolvedAt, "");
  assert.equal(second.listReviewQueue().length, 1);
  assert.equal(second.listResolvedReviewQueue().length, 0);
  assert.equal(second.getSourceState("rsks-gd").pendingReviewCount, 1);
  assert.equal(second.listAlertEvents().length, 1);
  assert.equal(second.listAlertEvents()[0].type, "review-queued");

  const reopenedReview = JSON.parse(
    fs.readFileSync(path.join(rootDir, "review", "review-1.json"), "utf8")
  );
  assert.equal(reopenedReview.status, "pending");
  assert.equal(reopenedReview.resolvedAt, "");

  const third = new FileStore(rootDir);
  assert.equal(third.listReviewQueue().length, 1);
  assert.equal(third.listResolvedReviewQueue().length, 0);
  assert.equal(third.getSourceState("rsks-gd").pendingReviewCount, 1);
  assert.equal(third.listAlertEvents().length, 1);
  assert.equal(third.listAlertEvents()[0].type, "review-queued");
});
