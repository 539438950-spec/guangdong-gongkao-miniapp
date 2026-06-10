const test = require("node:test");
const assert = require("node:assert/strict");

const { MemoryStore } = require("../src/storage/memory-store");
const { buildIngestHealthReport } = require("../src/health-report");

test("buildIngestHealthReport should summarize source readiness and risks", () => {
  const store = new MemoryStore();

  store.saveSourceState("rsks-gd", {
    sourceName: "广东人事考试网",
    examType: "guangdong-provincial",
    sourceMode: "official",
    sourceModeLabel: "官方",
    lastRunStatus: "published",
    lastFetchedAt: "2026-06-10T00:00:00.000Z",
    lastPublishedAt: "2026-06-10T00:05:00.000Z",
    lastSuccessAt: "2026-06-10T00:05:00.000Z",
    scheduleMinutes: 30,
    publishSlaMinutes: 60,
    pendingReviewCount: 0,
    consecutiveFailureCount: 0,
    lastRollback: false,
    releaseMode: "positions-open",
    lastParseStatus: "parsed",
    matchedFieldCount: 15,
    totalFieldCount: 17,
    fieldCoveragePercent: 88,
    workbookRowCount: 123
  });

  store.saveSourceState("ggfw-hrss-gd", {
    sourceName: "广东省公务员考试录用管理系统",
    examType: "guangdong-provincial",
    sourceMode: "official",
    sourceModeLabel: "官方",
    lastRunStatus: "published",
    lastFetchedAt: "2026-06-10T00:10:00.000Z",
    lastPublishedAt: "2026-06-10T00:15:00.000Z",
    lastSuccessAt: "2026-06-10T00:15:00.000Z",
    scheduleMinutes: 30,
    publishSlaMinutes: 60,
    pendingReviewCount: 0,
    consecutiveFailureCount: 0,
    lastRollback: false,
    releaseMode: "notice-only",
    lastParseStatus: "attachment-only",
    matchedFieldCount: 0,
    totalFieldCount: 17,
    fieldCoveragePercent: 0,
    workbookRowCount: 0
  });

  store.saveSourceState("demo-national", {
    sourceName: "国家公务员局专题",
    examType: "national",
    sourceMode: "demo",
    sourceModeLabel: "演示",
    lastRunStatus: "published",
    lastFetchedAt: "2026-06-10T00:20:00.000Z",
    lastPublishedAt: "2026-06-10T00:21:00.000Z",
    lastSuccessAt: "2026-06-10T00:21:00.000Z",
    scheduleMinutes: 30,
    publishSlaMinutes: 60,
    pendingReviewCount: 0,
    consecutiveFailureCount: 0,
    lastRollback: false,
    releaseMode: "positions-open",
    lastParseStatus: "parsed",
    matchedFieldCount: 10,
    totalFieldCount: 17,
    fieldCoveragePercent: 80,
    workbookRowCount: 2
  });

  const report = buildIngestHealthReport(store, {
    now: "2026-06-10T00:30:00.000Z"
  });

  assert.equal(report.summary.total, 3);
  assert.equal(report.summary.byReadiness.ready, 1);
  assert.equal(report.summary.byReadiness["tracking-only"], 1);
  assert.equal(report.summary.byReadiness.demo, 1);

  const readySource = report.sources.find((item) => item.sourceId === "rsks-gd");
  assert.equal(readySource.readiness.status, "ready");
  assert.deepEqual(readySource.riskFlags, []);

  const trackingSource = report.sources.find((item) => item.sourceId === "ggfw-hrss-gd");
  assert.equal(trackingSource.readiness.status, "tracking-only");
  assert.ok(trackingSource.riskFlags.includes("attachment-only"));

  const demoSource = report.sources.find((item) => item.sourceId === "demo-national");
  assert.equal(demoSource.readiness.status, "demo");
  assert.ok(demoSource.riskFlags.includes("demo-source"));
});

test("buildIngestHealthReport should not let stale legacy reviews block a healthy source", () => {
  const store = new MemoryStore();

  store.saveSourceState("rsks-gd", {
    sourceName: "广东人事考试网",
    examType: "guangdong-provincial",
    sourceMode: "official",
    sourceModeLabel: "官方",
    lastRunStatus: "published",
    lastFetchedAt: "2026-06-10T00:00:00.000Z",
    lastPublishedAt: "2026-06-10T00:05:00.000Z",
    lastSuccessAt: "2026-06-10T00:05:00.000Z",
    scheduleMinutes: 30,
    publishSlaMinutes: 60,
    pendingReviewCount: 1,
    consecutiveFailureCount: 0,
    lastRollback: false,
    releaseMode: "positions-open",
    lastParseStatus: "parsed",
    matchedFieldCount: 15,
    totalFieldCount: 17,
    fieldCoveragePercent: 88,
    workbookRowCount: 123
  });
  store.enqueueReview({
    id: "review-stale",
    createdAt: "2026-06-08T00:00:00.000Z",
    sourceId: "rsks-gd",
    reason: ["request failed: 404"],
    rawPayload: null
  });

  const report = buildIngestHealthReport(store, {
    now: "2026-06-10T00:30:00.000Z"
  });

  assert.equal(report.sources[0].readiness.status, "ready-with-backlog");
  assert.equal(report.sources[0].blockingPendingReviewCount, 0);
  assert.equal(report.sources[0].stalePendingReviewCount, 1);
  assert.ok(report.sources[0].riskFlags.includes("stale-review-backlog"));
});

test("buildIngestHealthReport should mark pending reviews and failed releases as blocked or manual review", () => {
  const store = new MemoryStore();

  store.saveSourceState("rsks-gd", {
    sourceName: "广东人事考试网",
    examType: "guangdong-provincial",
    sourceMode: "official",
    sourceModeLabel: "官方",
    lastRunStatus: "failed",
    lastFetchedAt: "2026-06-10T00:00:00.000Z",
    lastPublishedAt: "2026-06-09T23:00:00.000Z",
    lastSuccessAt: "2026-06-09T23:00:00.000Z",
    scheduleMinutes: 30,
    publishSlaMinutes: 60,
    pendingReviewCount: 2,
    consecutiveFailureCount: 1,
    lastRollback: true,
    releaseMode: "notice-only",
    lastParseStatus: "parsed",
    matchedFieldCount: 10,
    totalFieldCount: 17,
    fieldCoveragePercent: 75,
    workbookRowCount: 100
  });

  const report = buildIngestHealthReport(store, {
    now: "2026-06-10T00:30:00.000Z"
  });

  assert.equal(report.summary.byReadiness.blocked, 1);
  assert.equal(report.summary.risky, 1);
  assert.ok(report.sources[0].riskFlags.includes("rollback-active"));
  assert.ok(report.sources[0].riskFlags.includes("pending-review"));
  assert.match(report.sources[0].nextAction, /稳定版本/);
});
