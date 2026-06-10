const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { EXAM_TYPES, createSource } = require("../../../packages/shared/src");
const { MemoryStore } = require("../src/storage/memory-store");
const { SourceAdapter } = require("../src/core/adapter-base");
const { runIngestCycle, shouldRunSource } = require("../src/core/run-cycle");

class SuccessfulAdapter extends SourceAdapter {
  async fetch() {
    return {
      fetchedAt: "2026-06-09T10:00:00.000Z",
      responseDigest: "digest-ok",
      sourceStructure: {
        fingerprint: "fp-ok",
        summary: "detail[div:8]"
      },
      notice: {
        attachments: [{ url: "https://example.com/jobs.xlsx" }]
      }
    };
  }

  async parse() {
    return {
      notice: {
        id: "notice-ok",
        title: "示例公告",
        url: "https://example.com/notice-ok",
        sourceId: this.source.id,
        publishedAt: "2026-06-09T10:00:00.000Z"
      },
      batch: {
        id: "batch-ok",
        attachmentUrl: "https://example.com/jobs.xlsx"
      },
      positions: [
        {
          id: "position-ok",
          agency: "示例单位",
          title: "示例岗位",
          headcount: 1
        }
      ]
    };
  }
}

class FailingAdapter extends SourceAdapter {
  async fetch() {
    return {
      fetchedAt: "2026-06-09T10:00:00.000Z",
      responseDigest: "digest-fail",
      sourceStructure: {
        fingerprint: "fp-fail",
        summary: "detail[table:3]"
      },
      notice: {
        attachments: [{ url: "https://example.com/bad.xlsx" }]
      }
    };
  }

  async parse() {
    return {
      notice: {
        id: "notice-fail",
        title: "错误公告",
        url: "https://example.com/notice-fail",
        sourceId: this.source.id,
        publishedAt: "2026-06-09T10:00:00.000Z"
      },
      batch: {
        id: "batch-fail",
        attachmentUrl: "https://example.com/bad.xlsx"
      },
      positions: []
    };
  }
}

test("shouldRunSource should respect schedule window", () => {
  const source = createSource({
    id: "rsks-gd",
    name: "广东省人事考试网",
    baseUrl: "https://rsks.gd.gov.cn",
    examType: EXAM_TYPES.GUANGDONG_PROVINCIAL,
    scheduleMinutes: 30
  });

  assert.equal(shouldRunSource(source, null, "2026-06-09T10:00:00.000Z"), true);
  assert.equal(
    shouldRunSource(
      source,
      { lastFetchedAt: "2026-06-09T09:50:00.000Z" },
      "2026-06-09T10:00:00.000Z"
    ),
    false
  );
  assert.equal(
    shouldRunSource(
      source,
      { lastFetchedAt: "2026-06-09T09:20:00.000Z" },
      "2026-06-09T10:00:00.000Z"
    ),
    true
  );
});

test("runIngestCycle should skip non-due sources when onlyDue is enabled", async () => {
  const store = new MemoryStore();
  const source = createSource({
    id: "rsks-gd",
    name: "广东省人事考试网",
    baseUrl: "https://rsks.gd.gov.cn",
    examType: EXAM_TYPES.GUANGDONG_PROVINCIAL,
    scheduleMinutes: 30
  });
  store.saveSourceState(source.id, {
    sourceName: source.name,
    examType: source.examType,
    lastFetchedAt: "2026-06-09T09:50:00.000Z"
  });

  const rootDir = path.resolve(process.cwd(), ".tmp", `run-cycle-skip-${Date.now()}`);
  fs.mkdirSync(rootDir, { recursive: true });
  const snapshotTarget = path.join(rootDir, "ingested.js");

  const result = await runIngestCycle({
    store,
    sources: [source],
    adapters: { [source.id]: new SuccessfulAdapter(source) },
    snapshotTarget,
    now: "2026-06-09T10:00:00.000Z",
    onlyDue: true,
    logRecommendations: false
  });

  assert.deepEqual(result.results, []);
  assert.deepEqual(result.skippedSources, ["rsks-gd"]);
});

test("runIngestCycle should emit alert events for failed runs and export them", async () => {
  const store = new MemoryStore();
  const source = createSource({
    id: "rsks-gd",
    name: "广东省人事考试网",
    baseUrl: "https://rsks.gd.gov.cn",
    examType: EXAM_TYPES.GUANGDONG_PROVINCIAL,
    scheduleMinutes: 30
  });

  store.publish(source.id, {
    source,
    notice: {
      id: "stable-notice",
      examType: source.examType,
      title: "稳定公告",
      area: "广东",
      publishedAt: "2026-06-09T09:00:00.000Z",
      summary: "稳定版本",
      url: "https://example.com/stable",
      attachments: []
    },
    batch: {
      parseStatus: "parsed"
    },
    positions: [
      {
        id: "stable-position",
        noticeId: "stable-notice",
        examType: source.examType,
        agency: "稳定单位",
        title: "稳定岗位",
        headcount: 1
      }
    ],
    publishedAt: "2026-06-09T09:00:00.000Z"
  });

  const rootDir = path.resolve(process.cwd(), ".tmp", `run-cycle-alert-${Date.now()}`);
  fs.mkdirSync(rootDir, { recursive: true });
  const snapshotTarget = path.join(rootDir, "ingested.js");

  const result = await runIngestCycle({
    store,
    sources: [source],
    adapters: { [source.id]: new FailingAdapter(source) },
    snapshotTarget,
    now: "2026-06-09T10:00:00.000Z",
    onlyDue: false,
    logRecommendations: false
  });

  const events = result.alertEvents;
  const snapshot = require(snapshotTarget);

  assert.ok(events.some((item) => item.type === "run-failed"));
  assert.ok(events.some((item) => item.type === "rollback"));
  assert.ok(events.some((item) => item.type === "review-queued"));
  assert.ok(Array.isArray(snapshot.alertEvents));
  assert.ok(snapshot.alertEvents.some((item) => item.type === "run-failed"));
});
