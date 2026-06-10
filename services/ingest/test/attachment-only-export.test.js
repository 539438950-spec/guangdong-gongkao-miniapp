const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { FileStore } = require("../src/storage/file-store");
const { exportWeappSnapshot } = require("../src/publish/export-weapp-snapshot");

test("exportWeappSnapshot should keep attachment-only notices compare-safe", () => {
  const rootDir = path.resolve(process.cwd(), ".tmp", `attachment-only-${Date.now()}`);
  fs.mkdirSync(rootDir, { recursive: true });
  const store = new FileStore(rootDir);

  store.saveSourceState("ggfw-hrss-gd", {
    sourceName: "广东省公务员考试录用管理系统",
    examType: "guangdong-provincial",
    sourceMode: "official",
    sourceModeLabel: "官方",
    scheduleMinutes: 30,
    publishSlaMinutes: 60,
    lastFetchedAt: "2026-06-09T09:30:00.000Z",
    lastSuccessfulFetchedAt: "2026-06-09T09:30:00.000Z",
    lastPublishedAt: "2026-06-09T09:35:00.000Z",
    lastNoticePublishedAt: "2025-10-19T15:04:00.000Z",
    lastRunFinishedAt: "2026-06-09T09:35:00.000Z",
    lastRunStatus: "published",
    lastRollback: false,
    lastParseStatus: "attachment-only",
    lastRowsTotal: 0,
    lastErrors: []
  });

  store.publish("ggfw-hrss-gd", {
    source: {
      id: "ggfw-hrss-gd",
      name: "广东省公务员考试录用管理系统",
      metadata: {
        mode: "official",
        modeLabel: "官方"
      }
    },
    notice: {
      id: "notice-attachment-only",
      sourceId: "ggfw-hrss-gd",
      examType: "guangdong-provincial",
      title: "广东省2026年考试录用公务员公告",
      area: "广东",
      publishedAt: "2025-10-19T15:04:00.000Z",
      registrationStart: "2025年10月20日9:00",
      registrationEnd: "2025年10月24日16:00",
      writtenExamAt: "2025年12月7日",
      summary: "广东省2026年考试录用公务员公告摘要",
      url: "https://www.gdzz.gov.cn/tzgg/content/post_24016.html",
      attachments: [
        {
          name: "点击查看：附件1-5",
          url: "https://www.gdzz.gov.cn/public/广东省2026年考试录用公务员公告附件.zip"
        }
      ]
    },
    batch: {
      id: "notice-attachment-only:batch:1",
      noticeId: "notice-attachment-only",
      sourceId: "ggfw-hrss-gd",
      attachmentUrl: "https://www.gdzz.gov.cn/public/广东省2026年考试录用公务员公告附件.zip",
      parseStatus: "attachment-only",
      parseLog: ["attachment analysis: ok"],
      rowsTotal: 0
    },
    positions: [],
    publishedAt: "2026-06-09T09:35:00.000Z"
  });

  const targetFile = path.resolve(rootDir, "ingested.js");
  exportWeappSnapshot(store, targetFile, {
    now: "2026-06-09T10:00:00.000Z"
  });

  const snapshot = require(targetFile);
  assert.equal(snapshot.notices.length, 1);
  assert.equal(snapshot.notices[0].sourceId, "ggfw-hrss-gd");
  assert.equal(snapshot.notices[0].hasStructuredPositions, false);
  assert.equal(snapshot.notices[0].positionCount, 0);
  assert.equal(snapshot.notices[0].expectedPositionWorkbook, true);
  assert.equal(snapshot.notices[0].attachmentOnlyExpected, false);
  assert.equal(snapshot.compareGroups.length, 0);
  assert.equal(snapshot.sourceStates[0].parseStatus, "attachment-only");
  assert.equal(snapshot.sourceStates[0].parseQualityStatus, "attachment-only");
  assert.equal(snapshot.sourceStates[0].lastSuccessfulFetchedAt, "2026-06-09 09:30");
});

test("exportWeappSnapshot should mark stage attachment-only notices as tracking-only", () => {
  const rootDir = path.resolve(process.cwd(), ".tmp", `attachment-only-stage-${Date.now()}`);
  fs.mkdirSync(rootDir, { recursive: true });
  const store = new FileStore(rootDir);

  store.saveSourceState("ggfw-hrss-gd", {
    sourceName: "\u5e7f\u4e1c\u7701\u516c\u52a1\u5458\u8003\u8bd5\u5f55\u7528\u7ba1\u7406\u7cfb\u7edf",
    examType: "guangdong-provincial",
    sourceMode: "official",
    sourceModeLabel: "\u5b98\u65b9",
    scheduleMinutes: 30,
    publishSlaMinutes: 60,
    lastFetchedAt: "2026-06-09T09:30:00.000Z",
    lastSuccessfulFetchedAt: "2026-06-09T09:30:00.000Z",
    lastPublishedAt: "2026-06-09T09:35:00.000Z",
    lastNoticePublishedAt: "2026-03-01T10:00:00.000Z",
    lastRunFinishedAt: "2026-06-09T09:35:00.000Z",
    lastRunStatus: "published",
    lastRollback: false,
    lastParseStatus: "attachment-only",
    lastRowsTotal: 0,
    lastErrors: []
  });

  store.publish("ggfw-hrss-gd", {
    source: {
      id: "ggfw-hrss-gd",
      name: "\u5e7f\u4e1c\u7701\u516c\u52a1\u5458\u8003\u8bd5\u5f55\u7528\u7ba1\u7406\u7cfb\u7edf",
      metadata: {
        mode: "official",
        modeLabel: "\u5b98\u65b9"
      }
    },
    notice: {
      id: "notice-qualification-review",
      sourceId: "ggfw-hrss-gd",
      examType: "guangdong-provincial",
      title: "\u5e7f\u4e1c\u77012026\u5e74\u8003\u8bd5\u5f55\u7528\u516c\u52a1\u5458\u8d44\u683c\u5ba1\u6838\u516c\u544a",
      area: "\u5e7f\u4e1c",
      publishedAt: "2026-03-01T10:00:00.000Z",
      summary: "\u8d44\u683c\u5ba1\u6838\u9636\u6bb5\u516c\u544a",
      url: "https://example.com/qualification-review",
      attachments: [
        {
          name: "\u8d44\u683c\u5ba1\u6838\u540d\u5355",
          url: "https://example.com/qualification-review.pdf"
        }
      ]
    },
    batch: {
      id: "notice-qualification-review:batch:1",
      noticeId: "notice-qualification-review",
      sourceId: "ggfw-hrss-gd",
      attachmentUrl: "https://example.com/qualification-review.pdf",
      parseStatus: "attachment-only",
      parseLog: ["attachment analysis: ok"],
      rowsTotal: 0
    },
    positions: [],
    publishedAt: "2026-06-09T09:35:00.000Z"
  });

  const targetFile = path.resolve(rootDir, "ingested.js");
  exportWeappSnapshot(store, targetFile, {
    now: "2026-06-09T10:00:00.000Z"
  });

  const snapshot = require(targetFile);
  assert.equal(snapshot.notices.length, 1);
  assert.equal(snapshot.notices[0].noticeStageId, "qualification-review");
  assert.equal(snapshot.notices[0].expectedPositionWorkbook, false);
  assert.equal(snapshot.notices[0].attachmentOnlyExpected, true);
  assert.equal(snapshot.sourceStates[0].currentNoticeStageId, "qualification-review");
  assert.equal(snapshot.sourceStates[0].expectedPositionWorkbook, false);
  assert.equal(snapshot.sourceStates[0].attachmentOnlyExpected, true);
});
