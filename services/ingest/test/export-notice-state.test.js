const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { FileStore } = require("../src/storage/file-store");
const { exportWeappSnapshot } = require("../src/publish/export-weapp-snapshot");

test("exportWeappSnapshot should mark attachment-only notices as non-structured", () => {
  const rootDir = path.resolve(process.cwd(), ".tmp", `notice-state-${Date.now()}`);
  fs.mkdirSync(rootDir, { recursive: true });
  const store = new FileStore(rootDir);

  store.publish("rsks-gd", {
    source: { id: "rsks-gd", name: "广东省人事考试网" },
    notice: {
      id: "rsks-1",
      examType: "guangdong-provincial",
      title: "广东省2025年考试录用公务员公告",
      area: "广东",
      publishedAt: "2025-01-07T00:00:00.000Z",
      registrationStart: null,
      writtenExamAt: null,
      summary: "示例摘要",
      url: "https://rsks.gd.gov.cn/example",
      attachments: [{ name: "附件1-5.zip", url: "https://rsks.gd.gov.cn/a.zip" }]
    },
    batch: {
      parseStatus: "attachment-only"
    },
    positions: []
  });

  const targetFile = path.resolve(rootDir, "ingested.js");
  exportWeappSnapshot(store, targetFile);
  const snapshot = require(targetFile);

  assert.equal(snapshot.notices[0].hasStructuredPositions, false);
  assert.equal(snapshot.notices[0].positionCount, 0);
});

test("exportWeappSnapshot should downgrade structured notices when release mode is notice-only", () => {
  const rootDir = path.resolve(process.cwd(), ".tmp", `notice-state-release-${Date.now()}`);
  fs.mkdirSync(rootDir, { recursive: true });
  const store = new FileStore(rootDir);

  store.saveSourceState("rsks-gd", {
    sourceName: "广东省人事考试网",
    examType: "guangdong-provincial",
    lastRunStatus: "published",
    lastParseStatus: "parsed",
    matchedFieldCount: 17,
    totalFieldCount: 17,
    fieldCoveragePercent: 100,
    releaseMode: "notice-only",
    releaseOverrideMode: "notice-only",
    releaseOverrideApplied: true
  });

  store.publish("rsks-gd", {
    source: { id: "rsks-gd", name: "广东省人事考试网" },
    notice: {
      id: "rsks-release-1",
      sourceId: "rsks-gd",
      examType: "guangdong-provincial",
      title: "广东省2025年考试录用公务员公告",
      area: "广东",
      publishedAt: "2025-01-07T00:00:00.000Z",
      registrationStart: null,
      writtenExamAt: null,
      summary: "示例摘要",
      url: "https://rsks.gd.gov.cn/example",
      attachments: [{ name: "附件1.xlsx", url: "https://rsks.gd.gov.cn/a.xlsx" }]
    },
    batch: {
      parseStatus: "parsed"
    },
    positions: [
      {
        id: "position-release-1",
        noticeId: "rsks-release-1",
        batchId: "batch-release-1",
        examType: "guangdong-provincial",
        agency: "示例单位",
        title: "示例岗位",
        positionCode: "A001",
        positionType: "综合管理",
        headcount: 1,
        area: "广州",
        educationRaw: "本科",
        degreeRaw: "学士",
        majorRaw: "法学",
        majorCodes: [],
        serviceRequirement: "不限",
        freshGraduateOnly: false,
        politicalStatus: "不限",
        notes: "未注明",
        sourceNoticeTitle: "广东省2025年考试录用公务员公告",
        sourceUrl: "https://rsks.gd.gov.cn/example"
      }
    ]
  });

  const targetFile = path.resolve(rootDir, "ingested.js");
  exportWeappSnapshot(store, targetFile);
  const snapshot = require(targetFile);

  assert.equal(snapshot.notices[0].hasStructuredPositions, false);
  assert.equal(snapshot.notices[0].positionCount, 1);
  assert.equal(snapshot.sourceStates[0].releaseMode, "notice-only");
  assert.equal(snapshot.sourceStates[0].releaseOverrideMode, "notice-only");
});
