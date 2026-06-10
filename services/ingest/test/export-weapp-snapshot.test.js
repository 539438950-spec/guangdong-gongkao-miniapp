const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { FileStore } = require("../src/storage/file-store");
const { exportWeappSnapshot } = require("../src/publish/export-weapp-snapshot");

test("exportWeappSnapshot should emit parse quality and review context fields", () => {
  const rootDir = path.resolve(process.cwd(), ".tmp", `snapshot-${Date.now()}`);
  fs.mkdirSync(rootDir, { recursive: true });
  const store = new FileStore(rootDir);
  store.saveSourceState("rsks-gd", {
    sourceName: "广东省人事考试网",
    examType: "guangdong-provincial",
    sourceMode: "official",
    sourceModeLabel: "官方",
    scheduleMinutes: 30,
    publishSlaMinutes: 60,
    lastFetchedAt: "2026-06-09T09:30:00.000Z",
    lastSuccessfulFetchedAt: "2026-06-09T09:25:00.000Z",
    lastPublishedAt: "2026-06-09T09:35:00.000Z",
    lastNoticePublishedAt: "2024-01-15T00:00:00.000Z",
    lastRunFinishedAt: "2026-06-09T09:35:00.000Z",
    lastRunStatus: "published",
    lastRollback: false,
    structureAlert: true,
    structureSummary: "detail[section:8 | a:6]",
    lastStructureChangedAt: "2026-06-09T09:31:00.000Z",
    structureChangeSummary: "来源结构发生变化：aaaabbbb -> ccccdddd",
    lastParseStatus: "parsed",
    lastRowsTotal: 20,
    candidateWorkbookCount: 1,
    extractedWorkbookCount: 1,
    parseErrorCount: 0,
    matchedFieldCount: 11,
    totalFieldCount: 17,
    fieldCoveragePercent: 65,
    workbookSheetCount: 2,
    workbookSheetSummary: "县级机关:12行/11列；公安系统:8行/10列",
    workbookPath: "C:/tmp/positions.xlsx",
    workbookRowCount: 20,
    lastErrors: []
  });
  store.enqueueReview({
    id: "review-pending",
    sourceId: "rsks-gd",
    reason: ["fetch failed"],
    createdAt: "2026-06-09T09:36:00.000Z",
    rawPayload: {
      fetchedAt: "2026-06-09T09:30:00.000Z",
      responseDigest: "digest-1"
    },
    parsed: {
      notice: {
        title: "广东省2024年考试录用公务员公告",
        url: "https://rsks.gd.gov.cn/example",
        publishedAt: "2024-01-15T00:00:00.000Z"
      },
      batch: {
        parseStatus: "parsed",
        rowsTotal: 20,
        attachmentUrl: "https://rsks.gd.gov.cn/attachment.zip",
        parseLog: ["position workbook: positions.xlsx"],
        parseMetrics: {
          fieldCoveragePercent: 65,
          sheetSummary: "县级机关:12行/11列；公安系统:8行/10列",
          sheetCount: 2
        }
      }
    }
  });
  store.enqueueReview({
    id: "review-resolved",
    sourceId: "rsks-gd",
    reason: ["field mapping changed"],
    createdAt: "2026-06-09T09:38:00.000Z"
  });
  store.resolveReviewItem("review-resolved", "已人工核对");
  store.saveAlertEvent({
    sourceId: "rsks-gd",
    sourceName: "广东省人事考试网",
    type: "review-queued",
    severity: "medium",
    createdAt: "2026-06-09T09:37:00.000Z",
    summary: "广东省人事考试网有待复核记录",
    details: "当前待复核 1 条。"
  });

  store.publish("rsks-gd", {
    source: {
      name: "广东省人事考试网",
      metadata: {
        mode: "official",
        modeLabel: "官方"
      }
    },
    notice: {
      id: "n1",
      examType: "guangdong-provincial",
      title: "广东省2024年考试录用公务员公告",
      area: "广东",
      publishedAt: "2024-01-15T00:00:00.000Z",
      registrationStart: "2024年1月16日9:00至1月22日16:00",
      writtenExamAt: "待官方补充",
      summary: "示例摘要",
      url: "https://rsks.gd.gov.cn/example",
      attachments: [{ name: "附件1-5.zip", url: "https://rsks.gd.gov.cn/attachment.zip" }]
    },
    positions: []
  });

  const targetFile = path.resolve(rootDir, "ingested.js");
  exportWeappSnapshot(store, targetFile, {
    now: "2026-06-09T10:00:00.000Z"
  });

  const output = fs.readFileSync(targetFile, "utf8");
  const snapshot = require(targetFile);
  assert.match(output, /广东省2024年考试录用公务员公告/);
  assert.match(output, /fieldCoveragePercent/);
  assert.match(output, /parseQualityStatus/);
  assert.match(output, /noticeTitle/);
  assert.match(output, /detailLines/);
  assert.match(output, /module\.exports/);
  assert.equal(snapshot.reviewQueue.length, 1);
  assert.equal(snapshot.reviewQueue[0].id, "review-pending");
  assert.equal(snapshot.reviewQueue[0].noticeTitle, "广东省2024年考试录用公务员公告");
  assert.equal(snapshot.reviewQueue[0].parseStatus, "parsed");
  assert.equal(snapshot.reviewQueue[0].fieldCoveragePercent, 65);
  assert.equal(snapshot.reviewQueue[0].rawFetchedAt, "2026-06-09 09:30");
  assert.equal(snapshot.reviewQueue[0].candidateVersionId, "rsks-gd@2026-06-09T09:35:00.000Z");
  assert.equal(snapshot.reviewQueue[0].candidateVersionLabel, "2026-06-09 09:35 候选版本");
  assert.equal(snapshot.reviewQueue[0].rollbackToVersionLabel, "2026-06-09 09:35 稳定快照");
  assert.equal(snapshot.reviewQueue[0].detailLines.length >= 3, true);
  assert.equal(snapshot.resolvedReviewQueue.length, 1);
  assert.equal(snapshot.resolvedReviewQueue[0].id, "review-resolved");
  assert.equal(snapshot.resolvedReviewQueue[0].resolutionNote, "已人工核对");
  assert.equal(snapshot.sourceStates[0].parseQualityStatus, "warning");
  assert.equal(snapshot.sourceStates[0].lastSuccessfulFetchedAt, "2026-06-09 09:25");
  assert.equal(snapshot.sourceStates[0].fieldCoveragePercent, 65);
  assert.equal(snapshot.sourceStates[0].workbookSheetCount, 2);
  assert.equal(snapshot.sourceStates[0].candidateVersionLabel, "2026-06-09 09:35 候选版本");
  assert.equal(snapshot.sourceStates[0].stableVersionLabel, "2026-06-09 09:35 稳定快照");
  assert.equal(snapshot.sourceStates[0].rollbackToVersionLabel, "2026-06-09 09:35 稳定快照");
});

test("exportWeappSnapshot should keep structured major codes in positions", () => {
  const rootDir = path.resolve(process.cwd(), ".tmp", `snapshot-major-codes-${Date.now()}`);
  fs.mkdirSync(rootDir, { recursive: true });
  const store = new FileStore(rootDir);

  store.publish("bm-scs-gov-cn", {
    source: {
      name: "demo-national",
      metadata: {
        mode: "demo",
        modeLabel: "demo"
      }
    },
    notice: {
      id: "n2",
      sourceId: "bm-scs-gov-cn",
      examType: "national",
      title: "2026 national demo",
      area: "national",
      publishedAt: "2026-10-14T00:00:00.000Z",
      registrationStart: "2026-10-15",
      writtenExamAt: "2026-11-29",
      summary: "demo notice",
      url: "https://bm.scs.gov.cn/demo/2026-national",
      attachments: []
    },
    batch: {
      parseStatus: "parsed"
    },
    positions: [
      {
        id: "p-major-codes",
        sourceId: "bm-scs-gov-cn",
        noticeId: "n2",
        batchId: "b2",
        examType: "national",
        agency: "demo-agency",
        title: "demo-position",
        positionCode: "130110001",
        positionType: "demo-type",
        headcount: 2,
        area: "guangzhou",
        educationRaw: "undergraduate",
        degreeRaw: "bachelor",
        majorRaw: "Law(B0301),IP(B030102)",
        majorCodes: ["B0301", "B030102"],
        serviceRequirement: "none",
        freshGraduateOnly: false,
        politicalStatus: "none",
        notes: "demo notes",
        sourceNoticeTitle: "2026 national demo",
        sourceUrl: "https://bm.scs.gov.cn/demo/2026-national",
        hasManualCorrections: true,
        correctedFields: ["majorRaw", "majorCodes"],
        correctionSummary: "专业要求、专业代码已人工纠错",
        correctionLog: [
          {
            ruleId: "rule-major-codes",
            reason: "人工核对原始岗位表",
            fields: [
              {
                field: "majorRaw",
                from: "Law(B0301)",
                to: "Law(B0301),IP(B030102)"
              }
            ]
          }
        ]
      }
    ]
  });

  const targetFile = path.resolve(rootDir, "ingested.js");
  exportWeappSnapshot(store, targetFile, {
    now: "2026-06-09T10:00:00.000Z"
  });

  const snapshot = require(targetFile);
  assert.deepEqual(snapshot.positions[0].majorCodes, ["B0301", "B030102"]);
  assert.equal(snapshot.positions[0].sourceId, "bm-scs-gov-cn");
  assert.equal(snapshot.positions[0].hasManualCorrections, true);
  assert.equal(snapshot.positions[0].correctionSummary, "专业要求、专业代码已人工纠错");
  assert.equal(snapshot.positions[0].correctionLog[0].ruleId, "rule-major-codes");
});
