const test = require("node:test");
const assert = require("node:assert/strict");

const { EXAM_TYPES, createSource } = require("../../../packages/shared/src");
const { MemoryStore } = require("../src/storage/memory-store");
const { SourceAdapter } = require("../src/core/adapter-base");
const { runPipeline } = require("../src/core/pipeline");

class GoodAdapter extends SourceAdapter {
  async fetch() {
    return {
      fetchedAt: "2026-06-08T00:00:00.000Z",
      responseDigest: "digest-1",
      sourceStructure: {
        fingerprint: "fp-good-v1",
        summary: "detail[div:10 | a:4]"
      },
      notice: {
        attachments: [{ url: "https://example.com/jobs.xlsx" }]
      }
    };
  }

  async parse() {
    return {
      notice: {
        id: "n1",
        title: "示例公告",
        url: "https://example.com/notice",
        sourceId: this.source.id,
        publishedAt: "2026-06-08T00:00:00.000Z"
      },
      batch: {
        id: "b1",
        attachmentUrl: "https://example.com/jobs.xlsx",
        parseStatus: "parsed",
        rowsTotal: 1,
        parseLog: ["position workbook: jobs.xlsx"],
        parseMetrics: {
          candidateWorkbookCount: 1,
          extractedWorkbookCount: 1,
          parseErrorCount: 0,
          matchedFieldCount: 12,
          totalFieldCount: 17,
          fieldCoveragePercent: 71,
          sheetCount: 1,
          sheetSummary: "职位表:1行/12列",
          workbookPath: "C:/tmp/jobs.xlsx",
          workbookRowCount: 1
        }
      },
      positions: [
        {
          id: "p1",
          agency: "示例单位",
          title: "示例岗位",
          headcount: 1
        }
      ]
    };
  }
}

class BadAdapter extends SourceAdapter {
  async fetch() {
    return {
      fetchedAt: "2026-06-08T01:00:00.000Z",
      responseDigest: "digest-2",
      sourceStructure: {
        fingerprint: "fp-bad-v1",
        summary: "detail[div:4 | table:1]"
      },
      notice: {
        attachments: [{ url: "https://example.com/bad.xlsx" }]
      }
    };
  }

  async parse() {
    return {
      notice: {
        id: "n2",
        title: "错误公告",
        url: "https://example.com/bad",
        sourceId: this.source.id,
        publishedAt: "2026-06-08T01:00:00.000Z"
      },
      batch: {
        id: "b2",
        attachmentUrl: "https://example.com/bad.xlsx"
      },
      positions: []
    };
  }
}

class ChangedStructureAdapter extends SourceAdapter {
  async fetch() {
    return {
      fetchedAt: "2026-06-08T02:00:00.000Z",
      responseDigest: "digest-3",
      sourceStructure: {
        fingerprint: "fp-good-v2",
        summary: "detail[section:8 | a:6]"
      },
      notice: {
        attachments: [{ url: "https://example.com/jobs-v2.xlsx" }]
      }
    };
  }

  async parse() {
    return {
      notice: {
        id: "n3",
        title: "结构变更后公告",
        url: "https://example.com/changed",
        sourceId: this.source.id,
        publishedAt: "2026-06-08T02:00:00.000Z"
      },
      batch: {
        id: "b3",
        attachmentUrl: "https://example.com/jobs-v2.xlsx"
      },
      positions: [
        {
          id: "p3",
          agency: "示例单位",
          title: "结构变更岗位",
          headcount: 1
        }
      ]
    };
  }
}

class AttachmentOnlyAdapter extends SourceAdapter {
  async fetch() {
    return {
      fetchedAt: "2026-06-08T03:00:00.000Z",
      responseDigest: "digest-4",
      sourceStructure: {
        fingerprint: "fp-attachment-v1",
        summary: "detail[p:8 | a:2]"
      },
      notice: {
        attachments: [{ url: "https://example.com/attachment-only.zip" }]
      }
    };
  }

  async parse() {
    return {
      notice: {
        id: "n4",
        title: "资格审核公告",
        url: "https://example.com/tracking-only",
        sourceId: this.source.id,
        publishedAt: "2026-06-08T03:00:00.000Z"
      },
      batch: {
        id: "b4",
        attachmentUrl: "https://example.com/attachment-only.zip",
        parseStatus: "attachment-only",
        rowsTotal: 0,
        parseLog: ["attachment analysis: ok"],
        parseMetrics: {
          candidateWorkbookCount: 0,
          extractedWorkbookCount: 0,
          parseErrorCount: 0,
          matchedFieldCount: 0,
          totalFieldCount: 17,
          fieldCoveragePercent: 0,
          sheetCount: 0,
          sheetSummary: "",
          workbookPath: "",
          workbookRowCount: 0
        }
      },
      positions: []
    };
  }
}

test("pipeline should publish validated payload", async () => {
  const source = createSource({
    id: "rsks-gd",
    name: "广东省人事考试网",
    baseUrl: "https://rsks.gd.gov.cn",
    examType: EXAM_TYPES.GUANGDONG_PROVINCIAL
  });
  const store = new MemoryStore();
  const result = await runPipeline({
    source,
    adapter: new GoodAdapter(source),
    store
  });

  assert.equal(result.published, true);
  assert.equal(store.getProduction(source.id).notice.id, "n1");
  assert.equal(store.reviewQueue.length, 0);
  assert.equal(store.listSourceStates()[0].lastRunStatus, "published");
  assert.equal(store.listSourceStates()[0].lastFetchedAt, "2026-06-08T00:00:00.000Z");
  assert.equal(store.listSourceStates()[0].lastSuccessfulFetchedAt, "2026-06-08T00:00:00.000Z");
  assert.equal(store.listSourceStates()[0].consecutiveFailureCount, 0);
  assert.equal(store.listSourceStates()[0].pendingReviewCount, 0);
  assert.equal(store.listSourceStates()[0].structureFingerprint, "fp-good-v1");
  assert.equal(store.listSourceStates()[0].structureAlert, false);
  assert.equal(store.listSourceStates()[0].lastParseStatus, "parsed");
  assert.ok(store.listSourceStates()[0].candidateVersionId.includes("rsks-gd@"));
  assert.ok(store.listSourceStates()[0].candidateVersionLabel.includes("候选版本"));
  assert.ok(store.listSourceStates()[0].stableVersionId.includes("rsks-gd@"));
  assert.ok(store.listSourceStates()[0].stableVersionLabel.includes("稳定快照"));
  assert.equal(store.listSourceStates()[0].releaseMode, "positions-open");
  assert.equal(store.listSourceStates()[0].fieldCoveragePercent, 71);
  assert.equal(store.listSourceStates()[0].workbookSheetSummary, "职位表:1行/12列");
  assert.equal(store.listPublishAudits(source.id).length, 1);
  assert.equal(store.listPublishAudits(source.id)[0].eventType, "publish");
  assert.equal(store.listPublishAudits(source.id)[0].releaseMode, "positions-open");
});

test("pipeline should rollback to previous stable payload when validation fails", async () => {
  const source = createSource({
    id: "rsks-gd",
    name: "广东省人事考试网",
    baseUrl: "https://rsks.gd.gov.cn",
    examType: EXAM_TYPES.GUANGDONG_PROVINCIAL
  });
  const store = new MemoryStore();

  await runPipeline({
    source,
    adapter: new GoodAdapter(source),
    store
  });
  const result = await runPipeline({
    source,
    adapter: new BadAdapter(source),
    store
  });

  assert.equal(result.published, false);
  assert.equal(result.rollback, true);
  assert.equal(store.reviewQueue.length, 1);
  assert.equal(store.getProduction(source.id).notice.id, "n1");
  assert.equal(store.listSourceStates()[0].lastRollback, true);
  assert.equal(store.listSourceStates()[0].lastRunStatus, "failed");
  assert.equal(store.listSourceStates()[0].lastFetchedAt, "2026-06-08T01:00:00.000Z");
  assert.equal(store.listSourceStates()[0].lastSuccessfulFetchedAt, "2026-06-08T01:00:00.000Z");
  assert.equal(store.listSourceStates()[0].consecutiveFailureCount, 1);
  assert.equal(store.listSourceStates()[0].pendingReviewCount, 1);
  assert.equal(store.listSourceStates()[0].structureAlert, true);
  assert.ok(store.listSourceStates()[0].candidateVersionLabel.includes("候选版本"));
  assert.ok(store.listSourceStates()[0].rollbackToVersionLabel.includes("稳定快照"));
  assert.equal(store.listSourceStates()[0].releaseMode, "notice-only");
  assert.equal(store.reviewQueue[0].candidateVersionId, store.listSourceStates()[0].candidateVersionId);
  assert.equal(store.reviewQueue[0].rollbackToVersionId, store.listSourceStates()[0].rollbackToVersionId);
  assert.equal(store.listPublishAudits(source.id).length, 2);
  assert.equal(store.listPublishAudits(source.id)[0].eventType, "rollback");
  assert.equal(store.listPublishAudits(source.id)[1].eventType, "publish");
  assert.equal(store.listPublishAudits(source.id)[0].releaseMode, "notice-only");
});

test("pipeline should reset consecutive failure count after a later successful run", async () => {
  const source = createSource({
    id: "rsks-gd",
    name: "广东省人事考试网",
    baseUrl: "https://rsks.gd.gov.cn",
    examType: EXAM_TYPES.GUANGDONG_PROVINCIAL
  });
  const store = new MemoryStore();

  await runPipeline({
    source,
    adapter: new GoodAdapter(source),
    store
  });
  await runPipeline({
    source,
    adapter: new BadAdapter(source),
    store
  });
  await runPipeline({
    source,
    adapter: new GoodAdapter(source),
    store
  });

  assert.equal(store.listSourceStates()[0].lastRunStatus, "published");
  assert.equal(store.listSourceStates()[0].consecutiveFailureCount, 0);
  assert.equal(store.listSourceStates()[0].pendingReviewCount, 1);
});

test("pipeline should apply manual position overrides before publish", async () => {
  const source = createSource({
    id: "rsks-gd",
    name: "广东省人事考试网",
    baseUrl: "https://rsks.gd.gov.cn",
    examType: EXAM_TYPES.GUANGDONG_PROVINCIAL
  });
  const store = new MemoryStore();

  await runPipeline({
    source,
    adapter: new GoodAdapter(source),
    store,
    positionOverrideRules: [
      {
        id: "rule-fix-title",
        sourceId: "rsks-gd",
        positionId: "p1",
        reason: "人工核对原表后修正岗位名称和政治面貌",
        updates: {
          title: "修正后岗位",
          politicalStatus: "中共党员"
        }
      }
    ]
  });

  const payload = store.getProduction(source.id);
  const state = store.listSourceStates()[0];
  assert.equal(payload.positions[0].title, "修正后岗位");
  assert.equal(payload.positions[0].politicalStatus, "中共党员");
  assert.equal(payload.positions[0].hasManualCorrections, true);
  assert.deepEqual(payload.positions[0].correctedFields.sort(), ["politicalStatus", "title"]);
  assert.equal(payload.positions[0].correctionLog[0].ruleId, "rule-fix-title");
  assert.equal(state.correctedPositionCount, 1);
  assert.equal(state.correctedFieldCount, 2);
  assert.equal(state.appliedCorrectionRuleCount, 1);
  assert.deepEqual(state.appliedCorrectionRuleIds, ["rule-fix-title"]);
});

test("pipeline should flag source structure changes even when publish succeeds", async () => {
  const source = createSource({
    id: "rsks-gd",
    name: "广东省人事考试网",
    baseUrl: "https://rsks.gd.gov.cn",
    examType: EXAM_TYPES.GUANGDONG_PROVINCIAL
  });
  const store = new MemoryStore();

  await runPipeline({
    source,
    adapter: new GoodAdapter(source),
    store
  });
  const result = await runPipeline({
    source,
    adapter: new ChangedStructureAdapter(source),
    store
  });
  const state = store.listSourceStates()[0];

  assert.equal(result.published, true);
  assert.equal(state.structureAlert, true);
  assert.equal(state.structureFingerprint, "fp-good-v2");
  assert.equal(state.lastStructureChangedAt, "2026-06-08T02:00:00.000Z");
  assert.match(state.structureChangeSummary, /来源结构发生变化/);
});

test("pipeline should clear structure alert after later stable run with the same new structure", async () => {
  const source = createSource({
    id: "rsks-gd",
    name: "广东省人事考试网",
    baseUrl: "https://rsks.gd.gov.cn",
    examType: EXAM_TYPES.GUANGDONG_PROVINCIAL
  });
  const store = new MemoryStore();

  await runPipeline({
    source,
    adapter: new GoodAdapter(source),
    store
  });
  await runPipeline({
    source,
    adapter: new ChangedStructureAdapter(source),
    store
  });
  await runPipeline({
    source,
    adapter: new ChangedStructureAdapter(source),
    store
  });

  const state = store.listSourceStates()[0];
  assert.equal(state.structureAlert, false);
  assert.equal(state.structureChangeSummary, "");
  assert.equal(state.lastStructureChangedAt, "");
});

test("pipeline should keep attachment-only publishes in notice-only release mode", async () => {
  const source = createSource({
    id: "ggfw-hrss-gd",
    name: "广东省公务员考试录用管理系统",
    baseUrl: "https://ggfw.hrss.gd.gov.cn",
    examType: EXAM_TYPES.GUANGDONG_PROVINCIAL
  });
  const store = new MemoryStore();

  const result = await runPipeline({
    source,
    adapter: new AttachmentOnlyAdapter(source),
    store
  });

  assert.equal(result.published, true);
  assert.equal(store.listSourceStates()[0].releaseMode, "notice-only");
});
