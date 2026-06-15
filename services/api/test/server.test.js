const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

const { startApiServer, closeApiServer } = require("../src/index");
const { createSeedSnapshotLoader } = require("../src/core");
const { cloudFunctionHandler } = require("../src/cloud");
const store = require("../../../apps/weapp/utils/store");
const { createMiniappTestSeed, writeSeedModule } = require("../../../apps/weapp/test/fixtures/test-seed");
const { FileStore } = require("../../ingest/src/storage/file-store");
const { exportWeappSnapshot } = require("../../ingest/src/publish/export-weapp-snapshot");

async function rpc(baseUrl, action, args = []) {
  const target = new URL(`${baseUrl}/rpc`);
  const transport = target.protocol === "https:" ? https : http;
  const body = JSON.stringify({ action, args });

  const payload = await new Promise((resolve, reject) => {
    const request = transport.request(target, {
      method: "POST",
      agent: false,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        connection: "close"
      }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          resolve({
            statusCode: response.statusCode || 0,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.end(body);
  });

  assert.equal(payload.statusCode >= 200 && payload.statusCode < 300, true);
  assert.equal(payload.body.ok, true);
  return payload.body.data;
}

async function rpcExpectError(baseUrl, action, args = []) {
  const target = new URL(`${baseUrl}/rpc`);
  const transport = target.protocol === "https:" ? https : http;
  const body = JSON.stringify({ action, args });

  const payload = await new Promise((resolve, reject) => {
    const request = transport.request(target, {
      method: "POST",
      agent: false,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        connection: "close"
      }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          resolve({
            statusCode: response.statusCode || 0,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.end(body);
  });

  assert.equal(payload.statusCode >= 400, true);
  assert.equal(payload.body.ok, false);
  return payload.body.error || "";
}

async function getText(targetUrl) {
  const target = new URL(targetUrl);
  const transport = target.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(target, {
      method: "GET",
      agent: false,
      headers: {
        connection: "close"
      }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode || 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    request.on("error", reject);
    request.end();
  });
}

function createServerSeedFiles(name) {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const seedRoot = fs.mkdtempSync(path.join(tmpRoot, `${name}-`));
  const snapshotTarget = path.join(seedRoot, "ingested.js");
  const demoSnapshotTarget = path.join(seedRoot, "demo.js");
  const seed = createMiniappTestSeed();
  writeSeedModule(snapshotTarget, seed);
  writeSeedModule(demoSnapshotTarget, seed);
  return {
    snapshotTarget,
    demoSnapshotTarget
  };
}

function writeCountingSeedModule(filePath, counterName, updatedAt, noticeId) {
  fs.writeFileSync(filePath, [
    `globalThis.${counterName} = (globalThis.${counterName} || 0) + 1;`,
    "module.exports = {",
    `  updatedAt: ${JSON.stringify(updatedAt)},`,
    "  notices: [",
    `    { id: ${JSON.stringify(noticeId)} }`,
    "  ],",
    "  positions: [],",
    "  compareGroups: [],",
    "  sourceStates: [],",
    "  reviewQueue: [],",
    "  resolvedReviewQueue: [],",
    "  alertEvents: [],",
    "  publishAudits: []",
    "};",
    ""
  ].join("\n"), "utf8");
}

test.afterEach(() => {
  store.__resetStateForTests();
});

test("seed snapshot loader should reuse module snapshots until files change", () => {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const seedRoot = fs.mkdtempSync(path.join(tmpRoot, "api-seed-loader-"));
  const snapshotTarget = path.join(seedRoot, "ingested.js");
  const demoSnapshotTarget = path.join(seedRoot, "demo.js");
  const ingestedCounterName = "__gongkaoSeedLoaderIngestedCount";
  const demoCounterName = "__gongkaoSeedLoaderDemoCount";
  delete globalThis[ingestedCounterName];
  delete globalThis[demoCounterName];

  writeCountingSeedModule(
    snapshotTarget,
    ingestedCounterName,
    "2026-06-11T10:00:00.000Z",
    "notice-loader-1"
  );
  writeCountingSeedModule(
    demoSnapshotTarget,
    demoCounterName,
    "2026-06-11T09:00:00.000Z",
    "notice-demo-1"
  );

  const loader = createSeedSnapshotLoader({
    snapshotTarget,
    demoSnapshotTarget
  });
  const first = loader();
  const second = loader();

  assert.equal(first.seedVersion, "2026-06-11T10:00:00.000Z");
  assert.equal(second.seedVersion, "2026-06-11T10:00:00.000Z");
  assert.equal(globalThis[ingestedCounterName], 1);
  assert.equal(globalThis[demoCounterName], 1);

  writeCountingSeedModule(
    snapshotTarget,
    ingestedCounterName,
    "2026-06-11T10:05:00.000Z",
    "notice-loader-2"
  );
  const nextFileTime = new Date(Date.now() + 2000);
  fs.utimesSync(snapshotTarget, nextFileTime, nextFileTime);

  const refreshed = loader();

  assert.equal(refreshed.seedVersion, "2026-06-11T10:05:00.000Z");
  assert.equal(refreshed.seed.notices[0].id, "notice-loader-2");
  assert.equal(globalThis[ingestedCounterName], 2);
  assert.equal(globalThis[demoCounterName], 2);

  delete globalThis[ingestedCounterName];
  delete globalThis[demoCounterName];
});

test("api server should persist user state across restarts", async () => {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const userStateFile = path.join(tmpRoot, `api-user-state-${Date.now()}.json`);
  const seedFiles = createServerSeedFiles("api-server-seed");

  const first = await startApiServer({
    port: 0,
    userStateFile,
    snapshotTarget: seedFiles.snapshotTarget,
    demoSnapshotTarget: seedFiles.demoSnapshotTarget
  });
  const firstBaseUrl = `http://127.0.0.1:${first.port}`;

  const notices = await rpc(firstBaseUrl, "listNotices");
  const favoriteIds = await rpc(firstBaseUrl, "toggleFavoriteNotice", [notices[0].id]);
  assert.ok(favoriteIds.includes(notices[0].id));

  const createdGroup = await rpc(firstBaseUrl, "createCompareGroup", ["服务端对比组", "guangdong-provincial"]);
  assert.equal(createdGroup.name, "服务端对比组");

  await closeApiServer(first.server);

  const second = await startApiServer({
    port: 0,
    userStateFile,
    snapshotTarget: seedFiles.snapshotTarget,
    demoSnapshotTarget: seedFiles.demoSnapshotTarget
  });
  const secondBaseUrl = `http://127.0.0.1:${second.port}`;

  const favorites = await rpc(secondBaseUrl, "listFavoriteNotices");
  const groups = await rpc(secondBaseUrl, "listCompareGroups");
  assert.ok(favorites.some((item) => item.id === notices[0].id));
  assert.ok(groups.some((item) => item.name === "服务端对比组"));

  await closeApiServer(second.server);
});

test("api server should fall back to a random port when the default port is busy", async () => {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const userStateFile = path.join(tmpRoot, `api-port-fallback-${Date.now()}.json`);
  const seedFiles = createServerSeedFiles("api-port-fallback-seed");
  const blocker = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("busy");
  });
  await new Promise((resolve) => blocker.listen(0, resolve));
  const blockedPort = blocker.address().port;

  const instance = await startApiServer({
    port: blockedPort,
    allowPortFallback: true,
    userStateFile,
    snapshotTarget: seedFiles.snapshotTarget,
    demoSnapshotTarget: seedFiles.demoSnapshotTarget
  });

  assert.equal(instance.requestedPort, blockedPort);
  assert.notEqual(instance.port, blockedPort);
  const notices = await rpc(`http://127.0.0.1:${instance.port}`, "listNotices");
  assert.ok(Array.isArray(notices));
  assert.ok(notices.length > 0);

  await closeApiServer(instance.server);
  await new Promise((resolve, reject) => blocker.close((error) => (error ? reject(error) : resolve())));
});

test("api server should expose browser demo page", async () => {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const userStateFile = path.join(tmpRoot, `api-demo-page-${Date.now()}.json`);
  const seedFiles = createServerSeedFiles("api-demo-page-seed");

  const instance = await startApiServer({
    port: 0,
    userStateFile,
    snapshotTarget: seedFiles.snapshotTarget,
    demoSnapshotTarget: seedFiles.demoSnapshotTarget
  });
  const baseUrl = `http://127.0.0.1:${instance.port}`;

  const response = await getText(`${baseUrl}/demo`);
  assert.equal(response.statusCode, 200);
  assert.ok(String(response.headers["content-type"] || "").includes("text/html"));
  assert.equal(response.body.trimStart().startsWith("<!DOCTYPE html>"), true);
  assert.equal(response.body.trimStart().startsWith("\""), false);
  assert.ok(response.body.includes("广东公考信息 / 选岗工具 Demo"));
  assert.ok(response.body.includes("最新公告"));
  assert.ok(response.body.includes("来源状态"));
  assert.ok(response.body.includes("岗位对比"));
  assert.ok(response.body.includes("/demo"));

  const rootResponse = await getText(`${baseUrl}/`);
  assert.equal(rootResponse.statusCode, 200);
  assert.ok(String(rootResponse.headers["content-type"] || "").includes("text/html"));
  assert.equal(rootResponse.body.trimStart().startsWith("<!DOCTYPE html>"), true);

  await closeApiServer(instance.server);
});

test("api server should resolve review items through ingest persistence", async () => {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tmpRoot, "api-review-"));
  const ingestStoreRoot = path.join(rootDir, "ingest-var");
  const snapshotTarget = path.join(rootDir, "ingested.js");
  const userStateFile = path.join(rootDir, "user-state.json");
  const ingestStore = new FileStore(ingestStoreRoot);

  ingestStore.saveSourceState("rsks-gd", {
    sourceName: "广东省人事考试网",
    examType: "guangdong-provincial",
    pendingReviewCount: 1
  });
  ingestStore.enqueueReview({
    id: "review-api-1",
    sourceId: "rsks-gd",
    reason: ["fetch failed"],
    createdAt: "2026-06-09T09:36:00.000Z"
  });
  ingestStore.saveAlertEvent({
    id: "alert-api-1",
    sourceId: "rsks-gd",
    sourceName: "广东省人事考试网",
    type: "review-queued",
    severity: "medium",
    createdAt: "2026-06-09T09:37:00.000Z",
    summary: "广东省人事考试网有待复核记录",
    details: "当前待复核 1 条。"
  });
  ingestStore.publish("rsks-gd", {
    source: {
      id: "rsks-gd",
      name: "广东省人事考试网",
      metadata: {
        mode: "official",
        modeLabel: "官方"
      }
    },
    notice: {
      id: "notice-api-1",
      examType: "guangdong-provincial",
      title: "广东省2026年考试录用公务员公告",
      area: "广东",
      publishedAt: "2026-01-08T00:00:00.000Z",
      registrationStart: "2026年1月10日09:00",
      registrationEnd: "2026年1月16日16:00",
      writtenExamAt: "2026年3月15日",
      summary: "测试公告",
      url: "https://rsks.gd.gov.cn/example",
      attachments: []
    },
    batch: {
      parseStatus: "parsed"
    },
    positions: [],
    publishedAt: "2026-06-09T09:35:00.000Z"
  });
  exportWeappSnapshot(ingestStore, snapshotTarget, {
    now: "2026-06-09T10:00:00.000Z"
  });

  const instance = await startApiServer({
    port: 0,
    userStateFile,
    snapshotTarget,
    ingestStoreRoot
  });
  const baseUrl = `http://127.0.0.1:${instance.port}`;

  const before = await rpc(baseUrl, "getDashboard");
  assert.equal(before.reviewQueue.length, 1);
  assert.equal(before.resolvedReviewQueue.length, 0);

  const resolved = await rpc(baseUrl, "resolveReviewItem", ["review-api-1", "已人工核对"]);
  assert.equal(resolved.status, "resolved");

  const after = await rpc(baseUrl, "getDashboard");
  assert.equal(after.reviewQueue.length, 0);
  assert.equal(after.resolvedReviewQueue.length, 1);
  assert.equal(after.resolvedReviewQueue[0].resolutionNote, "已人工核对");

   const audits = await rpc(baseUrl, "listPublishAudits");
   assert.equal(audits.length, 1);
   assert.equal(audits[0].eventType, "review-resolved");
   assert.equal(audits[0].sourceId, "rsks-gd");

  await closeApiServer(instance.server);
});

test("api server should bulk-resolve stale review backlog through ingest persistence", async () => {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tmpRoot, "api-review-stale-"));
  const ingestStoreRoot = path.join(rootDir, "ingest-var");
  const snapshotTarget = path.join(rootDir, "ingested.js");
  const userStateFile = path.join(rootDir, "user-state.json");
  const ingestStore = new FileStore(ingestStoreRoot);

  ingestStore.saveSourceState("rsks-gd", {
    sourceName: "广东省人事考试网",
    examType: "guangdong-provincial",
    lastSuccessAt: "2026-06-10T01:00:00.000Z",
    lastPublishedAt: "2026-06-10T01:00:00.000Z"
  });
  ingestStore.enqueueReview({
    id: "review-stale-api-1",
    sourceId: "rsks-gd",
    reason: ["connect EACCES 120.197.33.7:443"],
    createdAt: "2026-06-08T14:40:34.681Z",
    rawPayload: null
  });
  ingestStore.enqueueReview({
    id: "review-active-api-1",
    sourceId: "rsks-gd",
    reason: ["字段覆盖率不足"],
    createdAt: "2026-06-10T01:10:00.000Z",
    rawPayload: {
      fetchedAt: "2026-06-10T01:05:00.000Z",
      responseDigest: "digest-active-api-1"
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
          sheetSummary: "职位表 12行12列",
          sheetCount: 1
        }
      }
    }
  });
  ingestStore.publish("rsks-gd", {
    source: {
      id: "rsks-gd",
      name: "广东省人事考试网",
      metadata: {
        mode: "official",
        modeLabel: "官方"
      }
    },
    notice: {
      id: "notice-review-stale-1",
      sourceId: "rsks-gd",
      examType: "guangdong-provincial",
      title: "广东省2026年考试录用公务员公告",
      area: "广东",
      publishedAt: "2026-01-15T00:00:00.000Z",
      registrationStart: "2026-01-16 09:00",
      registrationEnd: "2026-01-22 16:00",
      summary: "测试公告",
      url: "https://rsks.gd.gov.cn/example",
      attachments: []
    },
    batch: {
      id: "batch-review-stale-1",
      parseStatus: "attachment-only"
    },
    positions: [],
    publishedAt: "2026-06-10T01:00:00.000Z"
  });
  exportWeappSnapshot(ingestStore, snapshotTarget, {
    now: "2026-06-10T01:20:00.000Z"
  });

  const instance = await startApiServer({
    port: 0,
    userStateFile,
    snapshotTarget,
    ingestStoreRoot
  });
  const baseUrl = `http://127.0.0.1:${instance.port}`;

  const before = await rpc(baseUrl, "getDashboard");
  assert.equal(before.reviewQueue.length, 2);
  assert.equal(before.reviewQueue.some((item) => item.id === "review-stale-api-1" && item.staleReview), true);

  const result = await rpc(baseUrl, "resolveStaleReviewItems", [{
    sourceId: "rsks-gd",
    note: "自动关闭历史复核"
  }]);
  assert.equal(result.resolvedCount, 1);
  assert.deepEqual(result.reviewIds, ["review-stale-api-1"]);

  const after = await rpc(baseUrl, "getDashboard");
  assert.equal(after.reviewQueue.length, 1);
  assert.equal(after.reviewQueue[0].id, "review-active-api-1");
  assert.equal(after.resolvedReviewQueue.some((item) => item.id === "review-stale-api-1"), true);
  assert.equal(after.resolvedReviewQueue.find((item) => item.id === "review-stale-api-1").resolutionNote, "自动关闭历史复核");

  const audits = await rpc(baseUrl, "listPublishAudits");
  assert.equal(audits.length, 1);
  assert.equal(audits[0].eventType, "review-stale-resolved");
  assert.equal(audits[0].sourceId, "rsks-gd");

  await closeApiServer(instance.server);
});

test("api server should manage position overrides and refresh snapshot", async () => {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tmpRoot, "api-overrides-"));
  const ingestStoreRoot = path.join(rootDir, "ingest-var");
  const snapshotTarget = path.join(rootDir, "ingested.js");
  const positionOverridePath = path.join(ingestStoreRoot, "position-overrides.json");
  const userStateFile = path.join(rootDir, "user-state.json");
  const ingestStore = new FileStore(ingestStoreRoot);

  ingestStore.saveSourceState("rsks-gd", {
    sourceName: "广东省人事考试网",
    examType: "guangdong-provincial",
    lastParseStatus: "parsed",
    fieldCoveragePercent: 80
  });
  ingestStore.publish("rsks-gd", {
    source: {
      id: "rsks-gd",
      name: "广东省人事考试网",
      metadata: {
        mode: "official",
        modeLabel: "官方"
      }
    },
    notice: {
      id: "notice-override-1",
      sourceId: "rsks-gd",
      examType: "guangdong-provincial",
      title: "广东省2026年考试录用公务员公告",
      area: "广东",
      publishedAt: "2026-01-08T00:00:00.000Z",
      registrationStart: "2026-01-10 09:00",
      registrationEnd: "2026-01-16 16:00",
      writtenExamAt: "2026-03-15",
      summary: "测试公告",
      url: "https://rsks.gd.gov.cn/example",
      attachments: []
    },
    batch: {
      id: "batch-override-1",
      parseStatus: "parsed"
    },
    positions: [
      {
        id: "position-override-1",
        sourceId: "rsks-gd",
        noticeId: "notice-override-1",
        batchId: "batch-override-1",
        examType: "guangdong-provincial",
        agency: "广州市某单位",
        title: "综合管理岗",
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
        sourceNoticeTitle: "广东省2026年考试录用公务员公告",
        sourceUrl: "https://rsks.gd.gov.cn/example"
      }
    ],
    publishedAt: "2026-06-09T09:35:00.000Z"
  });
  exportWeappSnapshot(ingestStore, snapshotTarget, {
    now: "2026-06-09T10:00:00.000Z"
  });

  const instance = await startApiServer({
    port: 0,
    userStateFile,
    snapshotTarget,
    ingestStoreRoot,
    positionOverridePath
  });
  const baseUrl = `http://127.0.0.1:${instance.port}`;

  const initialRules = await rpc(baseUrl, "listPositionOverrides");
  assert.deepEqual(initialRules, []);

  const savedRule = await rpc(baseUrl, "savePositionOverride", [{
    id: "rule-api-1",
    sourceId: "rsks-gd",
    positionCode: "A001",
    reason: "人工核对岗位表后修正政治面貌",
    updates: {
      politicalStatus: "中共党员",
      notes: "需通过体能测试"
    }
  }]);
  assert.equal(savedRule.id, "rule-api-1");

  const savedRules = await rpc(baseUrl, "listPositionOverrides");
  assert.equal(savedRules.length, 1);
  assert.equal(savedRules[0].positionCode, "A001");

  const positionsPayload = await rpc(baseUrl, "listPositionsByNotice", ["notice-override-1"]);
  assert.equal(positionsPayload.positions[0].politicalStatus, "中共党员");
  assert.equal(positionsPayload.positions[0].hasManualCorrections, true);
  assert.equal(positionsPayload.positions[0].correctionLog[0].ruleId, "rule-api-1");

  const snapshot = require(snapshotTarget);
  assert.equal(snapshot.positions[0].correctionSummary.includes("人工纠错"), true);

  const auditsAfterSave = await rpc(baseUrl, "listPublishAudits");
  assert.equal(auditsAfterSave.length, 1);
  assert.equal(auditsAfterSave[0].eventType, "position-override-saved");
  assert.equal(auditsAfterSave[0].sourceId, "rsks-gd");

  const deleted = await rpc(baseUrl, "deletePositionOverride", ["rule-api-1"]);
  assert.equal(deleted.id, "rule-api-1");
  const finalRules = await rpc(baseUrl, "listPositionOverrides");
  assert.equal(finalRules.length, 0);
  const revertedPositionsPayload = await rpc(baseUrl, "listPositionsByNotice", ["notice-override-1"]);
  assert.equal(revertedPositionsPayload.positions[0].politicalStatus, "不限");
  assert.equal(Boolean(revertedPositionsPayload.positions[0].hasManualCorrections), false);

  const auditsAfterDelete = await rpc(baseUrl, "listPublishAudits");
  assert.equal(auditsAfterDelete.length, 2);
  assert.equal(auditsAfterDelete[0].eventType, "position-override-deleted");
  assert.equal(auditsAfterDelete[1].eventType, "position-override-saved");

  await closeApiServer(instance.server);
});

test("api server should manage source release overrides and publish audits", async () => {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tmpRoot, "api-release-"));
  const ingestStoreRoot = path.join(rootDir, "ingest-var");
  const snapshotTarget = path.join(rootDir, "ingested.js");
  const userStateFile = path.join(rootDir, "user-state.json");
  const ingestStore = new FileStore(ingestStoreRoot);

  ingestStore.saveSourceState("rsks-gd", {
    sourceName: "广东省人事考试网",
    examType: "guangdong-provincial",
    sourceMode: "official",
    sourceModeLabel: "官方",
    lastRunStatus: "published",
    lastParseStatus: "parsed",
    matchedFieldCount: 17,
    totalFieldCount: 17,
    fieldCoveragePercent: 100,
    parseErrorCount: 0,
    lastRowsTotal: 20,
    pendingReviewCount: 0,
    consecutiveFailureCount: 0,
    lastFetchedAt: "2026-06-09T09:50:00.000Z",
    lastSuccessfulFetchedAt: "2026-06-09T09:50:00.000Z",
    lastRunFinishedAt: "2026-06-09T09:50:00.000Z",
    candidateVersionCreatedAt: "2026-06-09T09:50:00.000Z",
    candidateVersionId: "rsks-gd@2026-06-09T09:50:00.000Z",
    candidateVersionLabel: "2026-06-09 09:50 候选版本",
    lastPublishedAt: "2026-06-09T09:35:00.000Z",
    lastSuccessAt: "2026-06-09T09:35:00.000Z",
    stableVersionUpdatedAt: "2026-06-09T09:35:00.000Z",
    stableVersionId: "rsks-gd@2026-06-09T09:35:00.000Z",
    stableVersionLabel: "2026-06-09 09:35 稳定快照",
    scheduleMinutes: 30,
    publishSlaMinutes: 60
  });
  ingestStore.publish("rsks-gd", {
    source: {
      id: "rsks-gd",
      name: "广东省人事考试网",
      metadata: {
        mode: "official",
        modeLabel: "官方"
      }
    },
    notice: {
      id: "notice-release-1",
      sourceId: "rsks-gd",
      examType: "guangdong-provincial",
      title: "广东省2026年考试录用公务员公告",
      area: "广东",
      publishedAt: "2026-01-08T00:00:00.000Z",
      registrationStart: "2026-01-10 09:00",
      registrationEnd: "2026-01-16 16:00",
      writtenExamAt: "2026-03-15",
      summary: "测试公告",
      url: "https://rsks.gd.gov.cn/example",
      attachments: []
    },
    batch: {
      id: "batch-release-1",
      parseStatus: "parsed"
    },
    positions: [],
    publishedAt: "2026-06-09T09:35:00.000Z"
  });
  exportWeappSnapshot(ingestStore, snapshotTarget, {
    now: "2026-06-09T10:00:00.000Z"
  });

  const instance = await startApiServer({
    port: 0,
    userStateFile,
    snapshotTarget,
    ingestStoreRoot
  });
  const baseUrl = `http://127.0.0.1:${instance.port}`;

  const initialAudits = await rpc(baseUrl, "listPublishAudits");
  assert.deepEqual(initialAudits, []);

  const opened = await rpc(baseUrl, "setSourceReleaseOverride", [{
    sourceId: "rsks-gd",
    mode: "positions-open",
    reason: "运营手动开放岗位能力"
  }]);
  assert.equal(opened.sourceState.releaseOverrideMode, "positions-open");
  assert.equal(opened.sourceState.releaseOverrideApplied, true);
  assert.equal(opened.sourceState.releaseMode, "positions-open");

  const afterOpenAudits = await rpc(baseUrl, "listPublishAudits");
  assert.equal(afterOpenAudits.length, 1);
  assert.equal(afterOpenAudits[0].releaseOverrideMode, "positions-open");

  const dashboardAfterOpen = await rpc(baseUrl, "getDashboard");
  const openedSourceState = dashboardAfterOpen.sourceStates.find((item) => item.sourceId === "rsks-gd");
  assert.ok(openedSourceState);
  assert.equal(openedSourceState.releaseOverrideMode, "positions-open");
  assert.equal(openedSourceState.releaseOverrideApplied, true);
  assert.equal(openedSourceState.releaseMode, "positions-open");
  assert.ok(Array.isArray(dashboardAfterOpen.publishAudits));
  assert.equal(dashboardAfterOpen.publishAudits.length, 1);

  const cleared = await rpc(baseUrl, "setSourceReleaseOverride", [{
    sourceId: "rsks-gd",
    mode: "",
    reason: "清除人工发布策略"
  }]);
  assert.equal(cleared.sourceState.releaseOverrideMode, "");
  assert.equal(cleared.sourceState.releaseMode, "positions-open");

  const afterClearAudits = await rpc(baseUrl, "listPublishAudits");
  assert.equal(afterClearAudits.length, 2);
  assert.equal(afterClearAudits[0].releaseOverrideMode, "");

  const dashboardAfterClear = await rpc(baseUrl, "getDashboard");
  const clearedSourceState = dashboardAfterClear.sourceStates.find((item) => item.sourceId === "rsks-gd");
  assert.ok(clearedSourceState);
  assert.equal(clearedSourceState.releaseOverrideMode, "");
  assert.equal(clearedSourceState.releaseMode, "positions-open");

  await closeApiServer(instance.server);
});

test("api server should expose notice-only release overrides through notice and positions payloads", async () => {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tmpRoot, "api-release-notice-only-"));
  const ingestStoreRoot = path.join(rootDir, "ingest-var");
  const snapshotTarget = path.join(rootDir, "ingested.js");
  const userStateFile = path.join(rootDir, "user-state.json");
  const ingestStore = new FileStore(ingestStoreRoot);

  ingestStore.saveSourceState("rsks-gd", {
    sourceName: "广东省人事考试网",
    examType: "guangdong-provincial",
    sourceMode: "official",
    sourceModeLabel: "官方",
    lastRunStatus: "published",
    lastParseStatus: "parsed",
    matchedFieldCount: 17,
    totalFieldCount: 17,
    fieldCoveragePercent: 100,
    parseErrorCount: 0,
    lastRowsTotal: 1,
    pendingReviewCount: 0,
    consecutiveFailureCount: 0,
    lastFetchedAt: "2026-06-09T09:50:00.000Z",
    lastSuccessfulFetchedAt: "2026-06-09T09:50:00.000Z",
    lastRunFinishedAt: "2026-06-09T09:50:00.000Z",
    candidateVersionCreatedAt: "2026-06-09T09:50:00.000Z",
    candidateVersionId: "rsks-gd@2026-06-09T09:50:00.000Z",
    candidateVersionLabel: "2026-06-09 09:50 候选版本",
    lastPublishedAt: "2026-06-09T09:35:00.000Z",
    lastSuccessAt: "2026-06-09T09:35:00.000Z",
    stableVersionUpdatedAt: "2026-06-09T09:35:00.000Z",
    stableVersionId: "rsks-gd@2026-06-09T09:35:00.000Z",
    stableVersionLabel: "2026-06-09 09:35 稳定快照",
    scheduleMinutes: 30,
    publishSlaMinutes: 60
  });
  ingestStore.publish("rsks-gd", {
    source: {
      id: "rsks-gd",
      name: "广东省人事考试网",
      metadata: {
        mode: "official",
        modeLabel: "官方"
      }
    },
    notice: {
      id: "notice-release-structured-1",
      sourceId: "rsks-gd",
      examType: "guangdong-provincial",
      title: "广东省2026年考试录用公务员公告",
      area: "广东",
      publishedAt: "2026-01-08T00:00:00.000Z",
      registrationStart: "2026-01-10 09:00",
      registrationEnd: "2026-01-16 16:00",
      writtenExamAt: "2026-03-15",
      summary: "测试公告",
      url: "https://rsks.gd.gov.cn/example",
      attachments: []
    },
    batch: {
      id: "batch-release-structured-1",
      parseStatus: "parsed"
    },
    positions: [
      {
        id: "position-release-structured-1",
        sourceId: "rsks-gd",
        noticeId: "notice-release-structured-1",
        batchId: "batch-release-structured-1",
        examType: "guangdong-provincial",
        agency: "广州市某单位",
        title: "综合管理岗",
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
        sourceNoticeTitle: "广东省2026年考试录用公务员公告",
        sourceUrl: "https://rsks.gd.gov.cn/example"
      }
    ],
    publishedAt: "2026-06-09T09:35:00.000Z"
  });
  exportWeappSnapshot(ingestStore, snapshotTarget, {
    now: "2026-06-09T10:00:00.000Z"
  });

  const instance = await startApiServer({
    port: 0,
    userStateFile,
    snapshotTarget,
    ingestStoreRoot
  });
  const baseUrl = `http://127.0.0.1:${instance.port}`;

  const initialNotice = await rpc(baseUrl, "getNoticeDetail", ["notice-release-structured-1"]);
  const initialPositionsPayload = await rpc(baseUrl, "listPositionsByNotice", ["notice-release-structured-1"]);
  assert.equal(initialNotice.canViewPositions, true);
  assert.equal(initialNotice.notice.hasStructuredPositions, true);
  assert.equal(initialPositionsPayload.canViewPositions, true);
  assert.equal(initialPositionsPayload.positions.length, 1);

  const locked = await rpc(baseUrl, "setSourceReleaseOverride", [{
    sourceId: "rsks-gd",
    mode: "notice-only",
    reason: "岗位表临时回退为仅公告模式"
  }]);
  assert.equal(locked.sourceState.releaseOverrideMode, "notice-only");
  assert.equal(locked.sourceState.releaseMode, "notice-only");

  const lockedNotice = await rpc(baseUrl, "getNoticeDetail", ["notice-release-structured-1"]);
  const lockedPositionsPayload = await rpc(baseUrl, "listPositionsByNotice", ["notice-release-structured-1"]);
  assert.equal(lockedNotice.canViewPositions, false);
  assert.equal(lockedNotice.notice.hasStructuredPositions, false);
  assert.equal(lockedPositionsPayload.canViewPositions, false);
  assert.ok(lockedPositionsPayload.notice);

  const unlocked = await rpc(baseUrl, "setSourceReleaseOverride", [{
    sourceId: "rsks-gd",
    mode: "",
    reason: "恢复自动发布策略"
  }]);
  assert.equal(unlocked.sourceState.releaseOverrideMode, "");
  assert.equal(unlocked.sourceState.releaseMode, "positions-open");

  const restoredNotice = await rpc(baseUrl, "getNoticeDetail", ["notice-release-structured-1"]);
  const restoredPositionsPayload = await rpc(baseUrl, "listPositionsByNotice", ["notice-release-structured-1"]);
  assert.equal(restoredNotice.canViewPositions, true);
  assert.equal(restoredNotice.notice.hasStructuredPositions, true);
  assert.equal(restoredPositionsPayload.canViewPositions, true);
  assert.equal(restoredPositionsPayload.positions.length, 1);

  await closeApiServer(instance.server);
});

test("api server should keep notice-only mode when positions-open override cannot pass publish gate", async () => {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tmpRoot, "api-release-blocked-"));
  const ingestStoreRoot = path.join(rootDir, "ingest-var");
  const snapshotTarget = path.join(rootDir, "ingested.js");
  const userStateFile = path.join(rootDir, "user-state.json");
  const ingestStore = new FileStore(ingestStoreRoot);

  ingestStore.saveSourceState("rsks-gd", {
    sourceName: "广东省人事考试网",
    examType: "guangdong-provincial",
    sourceMode: "official",
    sourceModeLabel: "官方",
    lastRunStatus: "published",
    lastParseStatus: "attachment-only",
    matchedFieldCount: 0,
    totalFieldCount: 0,
    fieldCoveragePercent: 0,
    parseErrorCount: 0,
    lastRowsTotal: 1,
    pendingReviewCount: 0,
    consecutiveFailureCount: 0,
    lastFetchedAt: "2026-06-09T09:50:00.000Z",
    lastSuccessfulFetchedAt: "2026-06-09T09:50:00.000Z",
    lastRunFinishedAt: "2026-06-09T09:50:00.000Z",
    candidateVersionCreatedAt: "2026-06-09T09:50:00.000Z",
    candidateVersionId: "rsks-gd@2026-06-09T09:50:00.000Z",
    candidateVersionLabel: "2026-06-09 09:50 候选版本",
    lastPublishedAt: "2026-06-09T09:35:00.000Z",
    lastSuccessAt: "2026-06-09T09:35:00.000Z",
    stableVersionUpdatedAt: "2026-06-09T09:35:00.000Z",
    stableVersionId: "rsks-gd@2026-06-09T09:35:00.000Z",
    stableVersionLabel: "2026-06-09 09:35 稳定快照",
    scheduleMinutes: 30,
    publishSlaMinutes: 60
  });
  ingestStore.publish("rsks-gd", {
    source: {
      id: "rsks-gd",
      name: "广东省人事考试网",
      metadata: {
        mode: "official",
        modeLabel: "官方"
      }
    },
    notice: {
      id: "notice-release-blocked-1",
      sourceId: "rsks-gd",
      examType: "guangdong-provincial",
      title: "广东省2026年考试录用公务员公告",
      area: "广东",
      publishedAt: "2026-01-08T00:00:00.000Z",
      registrationStart: "2026-01-10 09:00",
      registrationEnd: "2026-01-16 16:00",
      writtenExamAt: "2026-03-15",
      summary: "测试公告",
      url: "https://rsks.gd.gov.cn/example",
      attachments: []
    },
    batch: {
      id: "batch-release-blocked-1",
      parseStatus: "attachment-only"
    },
    positions: [],
    publishedAt: "2026-06-09T09:35:00.000Z"
  });
  exportWeappSnapshot(ingestStore, snapshotTarget, {
    now: "2026-06-09T10:00:00.000Z"
  });

  const instance = await startApiServer({
    port: 0,
    userStateFile,
    snapshotTarget,
    ingestStoreRoot
  });
  const baseUrl = `http://127.0.0.1:${instance.port}`;

  const initialNotice = await rpc(baseUrl, "getNoticeDetail", ["notice-release-blocked-1"]);
  const initialPositionsPayload = await rpc(baseUrl, "listPositionsByNotice", ["notice-release-blocked-1"]);
  assert.equal(initialNotice.canViewPositions, false);
  assert.equal(initialNotice.notice.hasStructuredPositions, false);
  assert.equal(initialPositionsPayload.canViewPositions, false);

  const attemptedError = await rpcExpectError(baseUrl, "setSourceReleaseOverride", [{
    sourceId: "rsks-gd",
    mode: "positions-open",
    reason: "尝试人工强开岗位能力"
  }]);
  assert.ok(attemptedError.includes("不能人工开放岗位能力"));

  const attemptedNotice = await rpc(baseUrl, "getNoticeDetail", ["notice-release-blocked-1"]);
  const attemptedPositionsPayload = await rpc(baseUrl, "listPositionsByNotice", ["notice-release-blocked-1"]);
  assert.equal(attemptedNotice.canViewPositions, false);
  assert.equal(attemptedNotice.notice.hasStructuredPositions, false);
  assert.equal(attemptedPositionsPayload.canViewPositions, false);
  const attemptedDashboard = await rpc(baseUrl, "getDashboard");
  const attemptedSourceState = attemptedDashboard.sourceStates.find((item) => item.sourceId === "rsks-gd");
  assert.equal(attemptedSourceState.releaseOverrideMode, "");
  assert.equal(attemptedSourceState.releaseMode, "notice-only");

  await closeApiServer(instance.server);
});

test("cloud handler should expose health endpoint", async () => {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const userStateFile = path.join(tmpRoot, `cloud-health-${Date.now()}.json`);
  const seedFiles = createServerSeedFiles("cloud-health-seed");

  const response = await cloudFunctionHandler(
    {
      path: "/health",
      httpMethod: "GET"
    },
    {},
    {
      userStateFile,
      snapshotTarget: seedFiles.snapshotTarget,
      demoSnapshotTarget: seedFiles.demoSnapshotTarget
    }
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.isBase64Encoded, false);

  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.data.status, "ok");
  assert.equal(body.data.userStateFile, userStateFile);
});

test("cloud handler should support rpc actions and persist user state", async () => {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const userStateFile = path.join(tmpRoot, `cloud-user-state-${Date.now()}.json`);
  const seedFiles = createServerSeedFiles("cloud-rpc-seed");

  const noticesResponse = await cloudFunctionHandler(
    {
      rawPath: "/rpc",
      requestContext: {
        http: {
          method: "POST"
        }
      },
      body: JSON.stringify({
        action: "listNotices",
        args: []
      })
    },
    {},
    {
      userStateFile,
      snapshotTarget: seedFiles.snapshotTarget,
      demoSnapshotTarget: seedFiles.demoSnapshotTarget
    }
  );
  const noticesBody = JSON.parse(noticesResponse.body);
  assert.equal(noticesResponse.statusCode, 200);
  assert.equal(noticesBody.ok, true);
  assert.ok(noticesBody.data.length > 0);

  const favoriteResponse = await cloudFunctionHandler(
    {
      path: "/rpc",
      httpMethod: "POST",
      isBase64Encoded: true,
      body: Buffer.from(JSON.stringify({
        action: "toggleFavoriteNotice",
        args: [noticesBody.data[0].id]
      }), "utf8").toString("base64")
    },
    {},
    {
      userStateFile,
      snapshotTarget: seedFiles.snapshotTarget,
      demoSnapshotTarget: seedFiles.demoSnapshotTarget
    }
  );
  const favoriteBody = JSON.parse(favoriteResponse.body);
  assert.equal(favoriteResponse.statusCode, 200);
  assert.equal(favoriteBody.ok, true);
  assert.ok(favoriteBody.data.includes(noticesBody.data[0].id));

  const persisted = JSON.parse(fs.readFileSync(userStateFile, "utf8"));
  assert.ok(persisted.favorites.includes(noticesBody.data[0].id));
});

test("cloud handler should support prefixed gateway routes", async () => {
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const userStateFile = path.join(tmpRoot, `cloud-prefixed-${Date.now()}.json`);
  const seedFiles = createServerSeedFiles("cloud-prefixed-seed");

  const healthResponse = await cloudFunctionHandler(
    {
      rawPath: "/prod/gongkao/health",
      requestContext: {
        http: {
          method: "GET"
        }
      }
    },
    {},
    {
      userStateFile,
      snapshotTarget: seedFiles.snapshotTarget,
      demoSnapshotTarget: seedFiles.demoSnapshotTarget,
      routeBasePath: "/prod/gongkao"
    }
  );
  assert.equal(healthResponse.statusCode, 200);

  const rpcResponse = await cloudFunctionHandler(
    {
      rawPath: "/prod/gongkao/rpc",
      requestContext: {
        http: {
          method: "POST"
        }
      },
      body: JSON.stringify({
        action: "listNotices",
        args: []
      })
    },
    {},
    {
      userStateFile,
      snapshotTarget: seedFiles.snapshotTarget,
      demoSnapshotTarget: seedFiles.demoSnapshotTarget,
      routeBasePath: "/prod/gongkao"
    }
  );
  const rpcBody = JSON.parse(rpcResponse.body);
  assert.equal(rpcResponse.statusCode, 200);
  assert.equal(rpcBody.ok, true);
  assert.ok(rpcBody.data.length > 0);
});
