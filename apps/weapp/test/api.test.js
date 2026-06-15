const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const api = require("../utils/api");
const store = require("../utils/store");
const { startApiServer, closeApiServer } = require("../../../services/api/src/index");
const { createMiniappTestSeed, installTestSeed, writeSeedModule } = require("./fixtures/test-seed");

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

function getGuangdongNotice() {
  return store.listNotices().find((item) => String(item.id || "").includes("rsks-gd")) || store.listNotices()[0];
}

function summarizeNotices(notices = []) {
  return notices.map((item) => ({
    id: item.id,
    sourceId: item.sourceId,
    examType: item.examType,
    title: item.title,
    hasStructuredPositions: Boolean(item.hasStructuredPositions),
    positionCount: Number(item.positionCount || 0),
    mergedSourceCount: Number(item.mergedSourceCount || 0),
    noticeTrustSourceId: item.noticeTrust ? item.noticeTrust.sourceId : "",
    noticeTrustStatus: item.noticeTrust ? item.noticeTrust.parseQualityStatus : ""
  }));
}

function summarizeSourceStates(sourceStates = []) {
  return sourceStates.map((item) => ({
    sourceId: item.sourceId,
    examType: item.examType,
    sourceMode: item.sourceMode,
    parseQualityStatus: item.parseQualityStatus,
    releaseMode: item.releaseMode,
    publishGateStatus: item.publishGateStatus,
    publishGateFocus: item.publishGateFocus,
    pendingReviewCount: Number(item.pendingReviewCount || 0),
    consecutiveFailureCount: Number(item.consecutiveFailureCount || 0)
  }));
}

function summarizeReviewQueue(reviewQueue = []) {
  return reviewQueue.map((item) => ({
    id: item.id,
    sourceId: item.sourceId,
    parseStatus: item.parseStatus || "",
    blockingRelease: Boolean(item.blockingRelease),
    priorityLevel: item.priority ? item.priority.level : "",
    gateCheckSummary: item.gateCheckSummary || ""
  }));
}

function summarizeCompareGroups(groups = []) {
  return groups.map((item) => ({
    id: item.id,
    name: item.name,
    examType: item.examType,
    positionIds: Array.isArray(item.positionIds) ? item.positionIds.slice() : [],
    pinned: Boolean(item.isPinned),
    lastUsedAt: item.lastUsedAt || "",
    sortMode: item.viewPreferences ? item.viewPreferences.sortMode : "",
    rowFocusMode: item.viewPreferences ? item.viewPreferences.rowFocusMode : "",
    compareSummary: item.compareSummary ? {
      positionCount: Number(item.compareSummary.positionCount || 0),
      matchedCount: Number(item.compareSummary.matchedCount || 0),
      blockedCount: Number(item.compareSummary.blockedCount || 0),
      topTitle: item.compareSummary.topTitle || "",
      bestFitTitle: item.compareSummary.bestFitTitle || ""
    } : null
  }));
}

function summarizeDashboard(dashboard = {}) {
  return {
    stats: {
      noticeCount: Number((dashboard.stats || {}).noticeCount || 0),
      positionCount: Number((dashboard.stats || {}).positionCount || 0),
      sourceCount: Number((dashboard.stats || {}).sourceCount || 0),
      pendingReviewTotal: Number((dashboard.stats || {}).pendingReviewTotal || 0),
      resolvedReviewTotal: Number((dashboard.stats || {}).resolvedReviewTotal || 0),
      compareGroupCount: Number((dashboard.stats || {}).compareGroupCount || 0),
      activeCompareGroupCount: Number((dashboard.stats || {}).activeCompareGroupCount || 0),
      unreadMessageCount: Number((dashboard.stats || {}).unreadMessageCount || 0)
    },
    notices: summarizeNotices(dashboard.notices),
    sourceStates: summarizeSourceStates(dashboard.sourceStates),
    reviewQueue: summarizeReviewQueue(dashboard.reviewQueue),
    compareGroups: summarizeCompareGroups(dashboard.compareGroups),
    sourceSummary: {
      sourceCount: Number((dashboard.sourceSummary || {}).sourceCount || 0),
      sourceAlertCount: Number((dashboard.sourceSummary || {}).sourceAlertCount || 0),
      gateFailureTypeSummary: Array.isArray((dashboard.sourceSummary || {}).gateFailureTypeSummary)
        ? dashboard.sourceSummary.gateFailureTypeSummary.map((item) => ({
          label: item.label,
          count: Number(item.count || 0)
        }))
        : []
    },
    reviewSummary: {
      total: Number((dashboard.reviewSummary || {}).total || 0),
      resolved: Number((dashboard.reviewSummary || {}).resolved || 0),
      failedCheckTypeSummary: Array.isArray((dashboard.reviewSummary || {}).failedCheckTypeSummary)
        ? dashboard.reviewSummary.failedCheckTypeSummary.map((item) => ({
          label: item.label,
          count: Number(item.count || 0)
        }))
        : []
    }
  };
}

function summarizePositionsPayload(payload = {}) {
  return {
    notice: {
      id: payload.notice ? payload.notice.id : "",
      examType: payload.notice ? payload.notice.examType : "",
      hasStructuredPositions: Boolean(payload.notice && payload.notice.hasStructuredPositions),
      positionCount: Number((payload.notice && payload.notice.positionCount) || 0),
      mergedSourceCount: Number((payload.notice && payload.notice.mergedSourceCount) || 0),
      noticeTrustSourceId: payload.noticeTrust ? payload.noticeTrust.sourceId : "",
      noticeTrustStatus: payload.noticeTrust ? payload.noticeTrust.parseQualityStatus : ""
    },
    positions: (payload.positions || []).map((item) => ({
      id: item.id,
      noticeId: item.noticeId,
      examType: item.examType,
      positionCode: item.positionCode,
      area: item.area,
      education: item.education,
      degree: item.degree,
      freshGraduateOnly: Boolean(item.freshGraduateOnly),
      mergedSourceCount: Number(item.mergedSourceCount || 0),
      noticeTrustSourceId: item.noticeTrust ? item.noticeTrust.sourceId : "",
      noticeTrustStatus: item.noticeTrust ? item.noticeTrust.parseQualityStatus : ""
    }))
  };
}

function summarizeCompareDetail(payload = {}) {
  return {
    group: {
      id: payload.group ? payload.group.id : "",
      name: payload.group ? payload.group.name : "",
      examType: payload.group ? payload.group.examType : "",
      positionIds: Array.isArray(payload.group && payload.group.positionIds) ? payload.group.positionIds.slice() : [],
      sortMode: payload.group && payload.group.viewPreferences ? payload.group.viewPreferences.sortMode : "",
      rowFocusMode: payload.group && payload.group.viewPreferences ? payload.group.viewPreferences.rowFocusMode : "",
      compareSummary: payload.group && payload.group.compareSummary ? {
        positionCount: Number(payload.group.compareSummary.positionCount || 0),
        matchedCount: Number(payload.group.compareSummary.matchedCount || 0),
        blockedCount: Number(payload.group.compareSummary.blockedCount || 0),
        topTitle: payload.group.compareSummary.topTitle || "",
        bestFitTitle: payload.group.compareSummary.bestFitTitle || ""
      } : null
    },
    positions: (payload.positions || []).map((item) => ({
      id: item.id,
      noticeId: item.noticeId,
      examType: item.examType,
      positionCode: item.positionCode,
      noticeTrustSourceId: item.noticeTrust ? item.noticeTrust.sourceId : "",
      noticeTrustStatus: item.noticeTrust ? item.noticeTrust.parseQualityStatus : "",
      compareSuggestion: item.compareSuggestion ? {
        matchStatus: item.compareSuggestion.matchStatus || "",
        ruleSummary: item.compareSuggestion.ruleSummary || ""
      } : null
    }))
  };
}

test.afterEach(() => {
  delete global.getApp;
  api.setRuntimeConfigForTests({
    mode: "local",
    baseUrl: ""
  });
  store.__resetStateForTests();
});

test("api local and remote modes should expose the same read-model semantics for the same seed", async (t) => {
  installTestSeed(store, "api-parity-seed");
  api.setRuntimeConfigForTests({
    mode: "local",
    baseUrl: ""
  });

  const localNotices = await api.listNotices();
  const localSourceStates = await api.listSourceStates();
  const localDashboard = await api.getDashboard();
  const localPositionsPayload = await api.listPositionsByNotice("rsks-gd|notice-2026");
  const localCompareDetail = await api.getCompareGroupDetail("seed-compare-group-1");

  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const seedFiles = createServerSeedFiles("weapp-api-parity-seed");
  const serverInstance = await startApiServer({
    port: 0,
    userStateFile: path.join(tmpRoot, `weapp-api-parity-${Date.now()}.json`),
    snapshotTarget: seedFiles.snapshotTarget,
    demoSnapshotTarget: seedFiles.demoSnapshotTarget
  });
  t.after(async () => {
    await closeApiServer(serverInstance.server);
  });

  api.setRuntimeConfigForTests({
    mode: "remote",
    baseUrl: `http://127.0.0.1:${serverInstance.port}`
  });

  const remoteNotices = await api.listNotices();
  const remoteSourceStates = await api.listSourceStates();
  const remoteDashboard = await api.getDashboard();
  const remotePositionsPayload = await api.listPositionsByNotice("rsks-gd|notice-2026");
  const remoteCompareDetail = await api.getCompareGroupDetail("seed-compare-group-1");

  assert.deepEqual(summarizeNotices(remoteNotices), summarizeNotices(localNotices));
  assert.deepEqual(summarizeSourceStates(remoteSourceStates), summarizeSourceStates(localSourceStates));
  assert.deepEqual(summarizeDashboard(remoteDashboard), summarizeDashboard(localDashboard));
  assert.deepEqual(summarizePositionsPayload(remotePositionsPayload), summarizePositionsPayload(localPositionsPayload));
  assert.deepEqual(summarizeCompareDetail(remoteCompareDetail), summarizeCompareDetail(localCompareDetail));
});

test("api module should support remote mode through local service", async (t) => {
  installTestSeed(store, "api-test-seed");
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const seedFiles = createServerSeedFiles("weapp-api-seed");
  const serverInstance = await startApiServer({
    port: 0,
    userStateFile: path.join(tmpRoot, `weapp-api-${Date.now()}.json`),
    snapshotTarget: seedFiles.snapshotTarget,
    demoSnapshotTarget: seedFiles.demoSnapshotTarget
  });
  t.after(async () => {
    await closeApiServer(serverInstance.server);
  });

  api.setRuntimeConfigForTests({
    mode: "remote",
    baseUrl: `http://127.0.0.1:${serverInstance.port}`
  });

  const notices = await api.listNotices();
  assert.ok(notices.length > 0);

  const toggled = await api.toggleFavoriteNotice(notices[0].id);
  assert.ok(toggled.includes(notices[0].id));

  const favorites = await api.listFavoriteNotices();
  assert.ok(favorites.some((item) => item.id === notices[0].id));

  const dashboard = await api.getDashboard();
  assert.equal(dashboard.stats.favoriteCount, 1);
  assert.ok(Array.isArray(dashboard.publishAudits));
});

test("api runtime config should persist mode and support health checks", async (t) => {
  installTestSeed(store, "api-test-seed");
  const tmpRoot = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const seedFiles = createServerSeedFiles("weapp-health-seed");
  const serverInstance = await startApiServer({
    port: 0,
    userStateFile: path.join(tmpRoot, `weapp-health-${Date.now()}.json`),
    snapshotTarget: seedFiles.snapshotTarget,
    demoSnapshotTarget: seedFiles.demoSnapshotTarget
  });
  t.after(async () => {
    await closeApiServer(serverInstance.server);
  });

  const config = await api.saveRuntimeConfig({
    mode: "remote",
    baseUrl: `http://127.0.0.1:${serverInstance.port}/`
  });
  assert.equal(config.mode, "remote");
  assert.equal(config.usingRemote, true);
  assert.equal(config.baseUrl, `http://127.0.0.1:${serverInstance.port}`);

  const health = await api.testRemoteHealth();
  assert.equal(health.status, "ok");
  assert.equal(health.baseUrl, `http://127.0.0.1:${serverInstance.port}`);
  assert.equal(health.diagnostics.status, "success");
  assert.equal(health.diagnostics.baseUrl, `http://127.0.0.1:${serverInstance.port}`);

  const diagnostics = api.getConnectionDiagnostics(config);
  assert.equal(diagnostics.status, "success");
  assert.equal(diagnostics.isForCurrentConfig, true);
  assert.ok(diagnostics.scopeLabel);
});

test("api runtime config should expose connection presets and summary", () => {
  const presets = api.listConnectionPresets();
  assert.ok(presets.some((item) => item.id === "local-dev"));

  const summary = api.getConnectionSummary({
    mode: "local",
    baseUrl: "",
    sourceType: "project-default"
  });
  assert.equal(summary.canTestHealth, false);
  assert.ok(summary.modeLabel);
  assert.ok(summary.sourceLabel);
});

test("api runtime config should reject incomplete remote config", async () => {
  await assert.rejects(
    api.saveRuntimeConfig({
      mode: "remote",
      baseUrl: ""
    }),
    /API Base URL/
  );

  await assert.rejects(
    api.saveRuntimeConfig({
      mode: "remote",
      baseUrl: "127.0.0.1:3100"
    }),
    /http:\/\/|https:\/\//
  );
});

test("api runtime config should support reset to local mode", async () => {
  await api.saveRuntimeConfig({
    mode: "remote",
    baseUrl: "http://127.0.0.1:3100/"
  });

  const resetConfig = await api.resetRuntimeConfig();
  assert.equal(resetConfig.mode, "local");
  assert.equal(resetConfig.baseUrl, "");
  assert.equal(resetConfig.usingRemote, false);
});

test("api runtime config reset should restore project default config", async () => {
  global.getApp = () => ({
    globalData: {
      apiDefaultMode: "remote",
      apiDefaultBaseUrl: "https://gateway.example.com/gongkao",
      apiDefaultLabel: "gateway"
    }
  });

  await api.saveRuntimeConfig({
    mode: "local",
    baseUrl: ""
  });

  const resetConfig = await api.resetRuntimeConfig();
  assert.equal(resetConfig.mode, "remote");
  assert.equal(resetConfig.baseUrl, "https://gateway.example.com/gongkao");
  assert.equal(resetConfig.sourceType, "project-default");
  assert.equal(resetConfig.activePresetId, "project-default");
});

test("api runtime config should surface project default preset from app config", () => {
  global.getApp = () => ({
    globalData: {
      apiDefaultMode: "remote",
      apiDefaultBaseUrl: "https://gateway.example.com/gongkao",
      apiDefaultLabel: "gateway"
    }
  });

  const presets = api.listConnectionPresets();
  assert.equal(presets[0].id, "project-default");
  assert.equal(presets[0].name, "gateway");
  assert.equal(presets[0].baseUrl, "https://gateway.example.com/gongkao");

  const summary = api.getConnectionSummary({
    mode: "remote",
    baseUrl: "https://gateway.example.com/gongkao",
    sourceType: "project-default"
  });
  assert.equal(summary.presetLabel, "gateway");
  assert.ok(summary.sourceLabel);
});

test("api runtime config should align local-dev preset with loopback project default endpoint", () => {
  global.getApp = () => ({
    globalData: {
      apiDefaultMode: "remote",
      apiDefaultBaseUrl: "http://127.0.0.1:56613",
      apiDefaultLabel: "最近一次本机 Demo"
    }
  });

  const presets = api.listConnectionPresets();
  const localDevPreset = presets.find((item) => item.id === "local-dev");
  const projectDefaultPreset = presets.find((item) => item.id === "project-default");

  assert.ok(localDevPreset);
  assert.ok(projectDefaultPreset);
  assert.equal(localDevPreset.baseUrl, "http://127.0.0.1:56613");
  assert.equal(projectDefaultPreset.baseUrl, "http://127.0.0.1:56613");
  assert.ok(localDevPreset.description.includes("Demo"));

  const summary = api.getConnectionSummary({
    mode: "remote",
    baseUrl: "http://127.0.0.1:56613",
    sourceType: "project-default"
  });
  assert.equal(summary.presetLabel, "最近一次本机 Demo");
});

test("api runtime config should persist failed health diagnostics", async () => {
  api.setRuntimeConfigForTests({
    mode: "remote",
    baseUrl: "http://127.0.0.1:1"
  });

  await assert.rejects(
    api.testRemoteHealth(),
    /request failed|ECONNREFUSED|connect/
  );

  const diagnostics = api.getConnectionDiagnostics();
  assert.equal(diagnostics.status, "failure");
  assert.equal(diagnostics.baseUrl, "http://127.0.0.1:1");
  assert.equal(Boolean(diagnostics.checkedAt), true);
  assert.equal(diagnostics.isForCurrentConfig, true);
  assert.ok(diagnostics.scopeLabel);
});

test("api read actions should fall back to local store when project-default loopback remote is unreachable", async () => {
  installTestSeed(store, "api-test-seed");
  global.getApp = () => ({
    globalData: {
      apiMode: "remote",
      apiBaseUrl: "http://127.0.0.1:1",
      apiDefaultMode: "remote",
      apiDefaultBaseUrl: "http://127.0.0.1:1",
      apiConfigSource: "project-default"
    }
  });

  api.setRuntimeConfigForTests({
    mode: "remote",
    baseUrl: "http://127.0.0.1:1",
    sourceType: "project-default"
  });

  const notices = await api.listNotices();
  const dashboard = await api.getDashboard();

  assert.ok(Array.isArray(notices));
  assert.ok(notices.length > 0);
  assert.ok(dashboard);
  assert.ok(dashboard.stats);

  await assert.rejects(
    api.listPublishAudits(),
    /request failed|ECONNREFUSED|connect/
  );
});

test("api runtime config should keep historical diagnostics when current base url changes", () => {
  api.setRuntimeConfigForTests({
    mode: "remote",
    baseUrl: "https://current.example.com/gongkao",
    healthDiagnostics: {
      status: "success",
      baseUrl: "https://old.example.com/gongkao",
      checkedAt: "2026-06-09T10:00:00.000Z",
      message: "ok"
    }
  });

  const diagnostics = api.getConnectionDiagnostics();
  assert.equal(diagnostics.status, "success");
  assert.equal(diagnostics.baseUrl, "https://old.example.com/gongkao");
  assert.equal(diagnostics.isForCurrentConfig, false);
  assert.ok(diagnostics.scopeLabel);
  assert.ok(diagnostics.statusLabel);
});

test("api should persist personal profile and surface it through dashboard", async () => {
  installTestSeed(store, "api-test-seed");
  const initial = await api.getPersonalProfile();
  assert.equal(initial.profile.education, "");
  assert.equal(initial.profile.freshGraduateStatus, "");

  const saved = await api.savePersonalProfile({
    education: "本科",
    degree: "学士",
    majorKeywords: "法学",
    politicalStatus: "中共党员",
    serviceExperience: "none",
    freshGraduateStatus: "non-fresh"
  });

  assert.equal(saved.profile.education, "本科");
  assert.equal(saved.profile.degree, "学士");
  assert.equal(saved.profile.majorKeywords, "法学");
  assert.equal(saved.profile.politicalStatus, "中共党员");
  assert.equal(saved.profile.serviceExperience, "none");
  assert.equal(saved.profile.freshGraduateStatus, "non-fresh");

  const dashboard = await api.getDashboard();
  assert.equal(dashboard.personalProfile.education, "本科");
  assert.equal(dashboard.personalProfile.freshGraduateStatus, "non-fresh");
});

test("api handlers should attach trust metadata to positions compare and recommendations", async () => {
  installTestSeed(store, "api-test-seed");
  const notice = getGuangdongNotice();
  const rsksState = store.listSourceStates().find((item) => item.sourceId === "rsks-gd");
  const [basePosition] = store.getPositionsByNoticeId(notice.id);
  const samplePositions = [
    {
      ...basePosition,
      id: "api-compare:matched",
      title: "综合管理岗",
      agency: "广州市某单位",
      headcount: 2,
      area: "广州",
      education: "本科",
      degree: "学士",
      major: "法学",
      serviceRequirement: "不限",
      freshGraduateOnly: false,
      politicalStatus: "不限",
      notes: "未注明"
    },
    {
      ...basePosition,
      id: "api-compare:blocked",
      title: "执法岗",
      agency: "深圳市某单位",
      headcount: 1,
      area: "深圳",
      education: "硕士",
      degree: "硕士",
      major: "公安学",
      serviceRequirement: "2年基层经历",
      freshGraduateOnly: true,
      politicalStatus: "中共党员",
      notes: "需通过体能测试"
    },
    {
      ...basePosition,
      id: "api-compare:recommended",
      title: "综合文字岗",
      agency: "佛山市某单位",
      headcount: 3,
      area: "佛山",
      education: "本科",
      degree: "学士",
      major: "法学",
      serviceRequirement: "不限",
      freshGraduateOnly: false,
      politicalStatus: "不限",
      notes: "未注明"
    }
  ];

  assert.ok(notice);
  assert.ok(rsksState);
  assert.ok(samplePositions.length >= 3);

  store.__setPositionsForTests(samplePositions);
  await api.savePersonalProfile({
    education: "本科",
    degree: "学士",
    majorKeywords: "法学",
    politicalStatus: "",
    serviceExperience: "none",
    freshGraduateStatus: "non-fresh"
  });
  const expectedStatus = rsksState.parseQualityStatus || "healthy";

  const positionsPayload = await api.listPositionsByNotice(notice.id);
  assert.ok(positionsPayload.noticeTrust);
  assert.equal(positionsPayload.noticeTrust.sourceId, "rsks-gd");
  assert.equal(positionsPayload.noticeTrust.parseQualityStatus, expectedStatus);
  assert.equal(typeof positionsPayload.noticeTrust.lastSuccessfulFetchedAt, "string");
  assert.equal(typeof positionsPayload.noticeTrust.publishGateLabel, "string");
  assert.equal(typeof positionsPayload.noticeTrust.runStatusLabel, "string");
  assert.equal(typeof positionsPayload.notice.mergedSourceCount, "number");
  assert.ok(positionsPayload.notice.positionSourceName);
  assert.equal(positionsPayload.positions.length, 3);
  assert.equal(positionsPayload.positions[0].noticeTrust.sourceId, "rsks-gd");
  assert.equal(positionsPayload.positions[0].mergedSourceCount, positionsPayload.notice.mergedSourceCount);
  assert.equal(positionsPayload.positions[0].positionSourceName, positionsPayload.notice.positionSourceName);
  assert.ok(Array.isArray(positionsPayload.positions[0].mergedSources));
  assert.equal(positionsPayload.positions[0].mergedSources.length, positionsPayload.notice.mergedSources.length);

  const group = await api.createCompareGroup("trust-test", notice.examType, {
    originContext: {
      sourceType: "subscription",
      sourceLabel: "订阅命中",
      sourceEntry: "messages",
      sourceName: "珠三角订阅",
      noticeId: notice.id,
      noticeTitle: notice.title,
      action: "create",
      actedAt: "2026-06-09T09:00:00.000Z",
      positionIds: positionsPayload.positions.slice(0, 2).map((item) => item.id),
      addedCount: 2
    }
  });
  await api.addPositionToGroup(group.id, positionsPayload.positions[0].id, {
    sourceType: "positions",
    sourceLabel: "岗位列表",
    sourceEntry: "positions",
    sourceName: "广东岗位",
    noticeId: notice.id,
    noticeTitle: notice.title,
    action: "reuse",
    actedAt: "2026-06-09T09:10:00.000Z",
    positionIds: [positionsPayload.positions[0].id],
    addedCount: 1
  });
  await api.addPositionToGroup(group.id, positionsPayload.positions[1].id, {
    sourceType: "positions",
    sourceLabel: "岗位列表",
    sourceEntry: "positions",
    sourceName: "广东岗位",
    noticeId: notice.id,
    noticeTitle: notice.title,
    action: "reuse",
    actedAt: "2026-06-09T09:11:00.000Z",
    positionIds: [positionsPayload.positions[1].id],
    addedCount: 1
  });
  const recordedGroup = await api.recordCompareGroupAction(group.id, {
    sourceType: "subscription",
    sourceLabel: "订阅命中",
    sourceEntry: "home",
    sourceName: "珠三角订阅",
    noticeId: notice.id,
    noticeTitle: notice.title,
    action: "open-existing",
    actedAt: "2026-06-09T09:12:00.000Z",
    positionIds: positionsPayload.positions.slice(0, 2).map((item) => item.id),
    addedCount: 0
  });
  assert.equal(recordedGroup.lastActionContext.sourceEntry, "home");
  assert.equal(recordedGroup.lastUsedAt, "2026-06-09T09:12:00.000Z");

  const touchedGroup = await api.touchCompareGroup(group.id, "2026-06-09T09:13:00.000Z");
  assert.equal(touchedGroup.lastUsedAt, "2026-06-09T09:13:00.000Z");

  const pinnedGroup = await api.setCompareGroupPinned(group.id, true, "2026-06-09T09:14:00.000Z");
  assert.equal(pinnedGroup.isPinned, true);
  assert.equal(pinnedGroup.pinnedAt, "2026-06-09T09:14:00.000Z");

  const updatedGroup = await api.saveCompareGroupPreferences(group.id, {
    sortMode: "trust",
    rowFocusMode: "different"
  });
  assert.equal(updatedGroup.viewPreferences.sortMode, "trust");
  assert.equal(updatedGroup.viewPreferences.rowFocusMode, "different");

  const compareGroups = await api.listCompareGroups();
  const compareGroupSummary = compareGroups.find((item) => item.id === group.id).compareSummary;
  assert.equal(compareGroupSummary.positionCount, 2);
  assert.equal(compareGroupSummary.matchedCount, 1);
  assert.equal(compareGroupSummary.blockedCount, 1);
  assert.equal(compareGroupSummary.topTitle, "综合管理岗");
  assert.equal(compareGroupSummary.bestFitTitle, "综合管理岗");

  const comparePayload = await api.getCompareGroupDetail(group.id);
  assert.equal(comparePayload.positions.length, 2);
  assert.ok(comparePayload.positions.every((item) => item.noticeTrust));
  assert.equal(comparePayload.positions[0].noticeTrust.sourceId, "rsks-gd");
  assert.equal(comparePayload.positions[0].positionSourceName, positionsPayload.notice.positionSourceName);
  assert.equal(comparePayload.positions[0].mergedSourceCount, positionsPayload.notice.mergedSourceCount);
  assert.equal(comparePayload.group.viewPreferences.sortMode, "trust");
  assert.equal(comparePayload.group.originContext.sourceType, "subscription");
  assert.equal(comparePayload.group.lastActionContext.sourceEntry, "home");
  assert.equal(comparePayload.group.lastUsedAt, "2026-06-09T09:13:00.000Z");
  assert.equal(comparePayload.group.isPinned, true);
  assert.equal(comparePayload.group.pinnedAt, "2026-06-09T09:14:00.000Z");
  assert.equal(comparePayload.group.compareSummary.positionCount, 2);
  assert.equal(comparePayload.group.compareSummary.matchedCount, 1);
  assert.equal(comparePayload.group.compareSummary.bestFitTitle, "综合管理岗");

  const dashboard = await api.getDashboard();
  const dashboardGroup = dashboard.compareGroups.find((item) => item.id === group.id);
  const dashboardSource = dashboard.sourceStates.find((item) => item.sourceId === "rsks-gd");
  assert.equal(dashboardGroup.compareSummary.positionCount, 2);
  assert.equal(dashboardGroup.compareSummary.blockedCount, 1);
  assert.ok(Array.isArray(dashboard.sourceStates));
  assert.ok(dashboardSource);
  assert.ok(Array.isArray(dashboard.publishAudits));
  assert.ok(dashboardSource.publishGate);
  assert.ok(dashboardSource.gateCheckSummary);
  assert.ok(dashboardSource.riskSummary);
  assert.ok(dashboardSource.nextAction);
  assert.equal(dashboardSource.nextAction.focus, "review");
  assert.ok(Array.isArray(dashboard.reviewQueue));
  assert.ok(dashboard.reviewQueue[0].priority);
  assert.ok(dashboard.reviewQueue[0].gateCheckSummary);
  assert.equal(typeof dashboard.reviewQueue[0].blockingRelease, "boolean");
  assert.ok(dashboard.sourceSummary);
  assert.equal(dashboard.sourceSummary.sourceCount, dashboard.sourceStates.length);
  assert.ok(Array.isArray(dashboard.sourceSummary.gateFailureTypeSummary));
  assert.ok(dashboard.sourceSummary.gateFailureTypeSummary.length > 0);
  assert.equal(dashboard.sourceSummary.gateFailureTypeSummary[0].label, "解析质量");
  assert.ok(dashboard.reviewSummary);
  assert.equal(dashboard.reviewSummary.total, dashboard.reviewQueue.length);
  assert.ok(Array.isArray(dashboard.reviewSummary.failedCheckTypeSummary));
  assert.equal(dashboard.reviewSummary.failedCheckTypeSummary.length, 0);

  const recommendations = await api.getRecommendedPositions(positionsPayload.positions[0].id, 3);
  assert.ok(recommendations.length > 0);
  assert.ok(recommendations.every((item) => item.noticeTrust));
  assert.equal(recommendations[0].positionSourceName, positionsPayload.notice.positionSourceName);
  assert.equal(recommendations[0].mergedSourceCount, positionsPayload.notice.mergedSourceCount);
});

test("api should persist saved filter and subscription view preferences", async () => {
  installTestSeed(store, "api-test-seed");
  const notice = getGuangdongNotice();
  const sample = store.getPositionsByNoticeId(notice.id)[0];
  const filters = {
    selectedArea: sample.area,
    selectedEducation: sample.education,
    selectedServiceRequirement: sample.serviceRequirement,
    selectedPoliticalStatus: sample.politicalStatus,
    freshGraduateMode: sample.freshGraduateOnly ? "only" : ""
  };

  const savedFilter = await api.saveFilterScheme({
    name: "view-pref-filter",
    noticeId: notice.id,
    noticeTitle: notice.title,
    examType: notice.examType,
    filters,
    viewPreferences: {
      sortMode: "compare"
    }
  });
  assert.equal(savedFilter.viewPreferences.sortMode, "compare");
  assert.ok(savedFilter.currentPositionIds.length > 0);
  assert.equal(savedFilter.currentPositionPreview[0].id, savedFilter.currentPositionIds[0]);

  const updatedFilter = await api.saveSavedFilterViewPreferences(savedFilter.id, {
    sortMode: "eligibility"
  });
  assert.equal(updatedFilter.viewPreferences.sortMode, "eligibility");
  assert.equal((await api.getSavedFilter(savedFilter.id)).viewPreferences.sortMode, "eligibility");

  const subscription = await api.createSubscription({
    name: "view-pref-subscription",
    noticeId: notice.id,
    noticeTitle: notice.title,
    examType: notice.examType,
    filters,
    viewPreferences: {
      sortMode: "compare"
    }
  });
  assert.equal(subscription.viewPreferences.sortMode, "compare");

  const updatedSubscription = await api.saveSubscriptionViewPreferences(subscription.id, {
    sortMode: "eligibility"
  });
  assert.equal(updatedSubscription.viewPreferences.sortMode, "eligibility");
  assert.equal((await api.getSubscription(subscription.id)).viewPreferences.sortMode, "eligibility");
});

test("api should surface favorite progress messages for related notices", async () => {
  store.__setSeedSnapshotLoaderForTests(() => ({
    seedVersion: "favorite-progress-test",
    seed: {
      updatedAt: "2026-06-09T12:00:00.000Z",
      notices: [
        {
          id: "rsks-gd|main-2026",
          sourceId: "rsks-gd",
          examType: "guangdong-provincial",
          title: "广东省2026年考试录用公务员公告",
          area: "广东",
          source: "广东省人事考试网",
          publishedAt: "2026-01-05",
          hasStructuredPositions: true,
          positionCount: 10
        },
        {
          id: "ggfw-hrss-gd|qualification-2026",
          sourceId: "ggfw-hrss-gd",
          examType: "guangdong-provincial",
          title: "广东省2026年考试录用公务员资格审核公告",
          area: "广东",
          source: "广东人社",
          publishedAt: "2026-03-01",
          hasStructuredPositions: false,
          positionCount: 0
        }
      ],
      positions: [],
      sourceStates: [],
      reviewQueue: [],
      resolvedReviewQueue: [],
      alertEvents: [],
      compareGroups: []
    }
  }));

  store.toggleFavorite("rsks-gd|main-2026");

  const messages = await api.listMessages();
  const progressMessage = messages.find((item) => item.type === "favorite-progress");

  assert.ok(progressMessage);
  assert.equal(progressMessage.noticeId, "ggfw-hrss-gd|qualification-2026");
  assert.equal(progressMessage.favoriteNoticeId, "rsks-gd|main-2026");
  assert.equal(progressMessage.read, false);

  const dashboard = await api.getDashboard();
  assert.ok(dashboard.messages.some((item) => item.type === "favorite-progress"));
  assert.ok(dashboard.stats.unreadMessageCount >= 1);

  await api.markMessageRead(progressMessage.id);
  const refreshed = await api.listMessages();
  const refreshedProgressMessage = refreshed.find((item) => item.id === progressMessage.id);
  assert.equal(refreshedProgressMessage.read, true);
});

test("api should persist progress reminder settings and filter favorite progress messages", async () => {
  store.__setSeedSnapshotLoaderForTests(() => ({
    seedVersion: "favorite-progress-settings-test",
    seed: {
      updatedAt: "2026-06-09T12:00:00.000Z",
      notices: [
        {
          id: "rsks-gd|main-2026",
          sourceId: "rsks-gd",
          examType: "guangdong-provincial",
          title: "广东省2026年考试录用公务员公告",
          area: "广东",
          source: "广东省人事考试网",
          publishedAt: "2026-01-05",
          hasStructuredPositions: true,
          positionCount: 10
        },
        {
          id: "ggfw-hrss-gd|qualification-2026",
          sourceId: "ggfw-hrss-gd",
          examType: "guangdong-provincial",
          title: "广东省2026年考试录用公务员资格审核公告",
          area: "广东",
          source: "广东人社",
          publishedAt: "2026-03-01",
          hasStructuredPositions: false,
          positionCount: 0
        },
        {
          id: "ggfw-hrss-gd|interview-2026",
          sourceId: "ggfw-hrss-gd",
          examType: "guangdong-provincial",
          title: "广东省2026年考试录用公务员面试公告",
          area: "广东",
          source: "广东人社",
          publishedAt: "2026-03-20",
          hasStructuredPositions: false,
          positionCount: 0
        }
      ],
      positions: [],
      sourceStates: [],
      reviewQueue: [],
      resolvedReviewQueue: [],
      alertEvents: [],
      compareGroups: []
    }
  }));

  store.toggleFavorite("rsks-gd|main-2026");

  const initialSettingsPayload = await api.getProgressReminderSettings();
  assert.equal(initialSettingsPayload.settings.qualificationReview, true);
  assert.equal(initialSettingsPayload.settings.interview, true);
  assert.equal(initialSettingsPayload.options.length, 3);

  const initialMessages = await api.listMessages();
  assert.ok(initialMessages.some((item) => item.noticeId === "ggfw-hrss-gd|qualification-2026"));
  assert.ok(initialMessages.some((item) => item.noticeId === "ggfw-hrss-gd|interview-2026"));

  const savedSettingsPayload = await api.saveProgressReminderSettings({
    qualificationReview: false
  });
  assert.equal(savedSettingsPayload.settings.qualificationReview, false);
  assert.equal(savedSettingsPayload.settings.interview, true);

  const filteredMessages = await api.listMessages();
  assert.ok(!filteredMessages.some((item) => item.noticeId === "ggfw-hrss-gd|qualification-2026"));
  assert.ok(filteredMessages.some((item) => item.noticeId === "ggfw-hrss-gd|interview-2026"));

  const dashboard = await api.getDashboard();
  assert.equal(dashboard.progressReminderSettings.qualificationReview, false);
});

test("api should prefer per-notice reminder overrides over global settings", async () => {
  store.__setSeedSnapshotLoaderForTests(() => ({
    seedVersion: "favorite-progress-notice-override-test",
    seed: {
      updatedAt: "2026-06-09T12:00:00.000Z",
      notices: [
        {
          id: "rsks-gd|main-2026",
          sourceId: "rsks-gd",
          examType: "guangdong-provincial",
          title: "广东省2026年考试录用公务员公告",
          area: "广东",
          source: "广东省人事考试网",
          publishedAt: "2026-01-05",
          hasStructuredPositions: true,
          positionCount: 10
        },
        {
          id: "ggfw-hrss-gd|qualification-2026",
          sourceId: "ggfw-hrss-gd",
          examType: "guangdong-provincial",
          title: "广东省2026年考试录用公务员资格审核公告",
          area: "广东",
          source: "广东人社",
          publishedAt: "2026-03-01",
          hasStructuredPositions: false,
          positionCount: 0
        },
        {
          id: "ggfw-hrss-gd|interview-2026",
          sourceId: "ggfw-hrss-gd",
          examType: "guangdong-provincial",
          title: "广东省2026年考试录用公务员面试公告",
          area: "广东",
          source: "广东人社",
          publishedAt: "2026-03-20",
          hasStructuredPositions: false,
          positionCount: 0
        }
      ],
      positions: [],
      sourceStates: [],
      reviewQueue: [],
      resolvedReviewQueue: [],
      alertEvents: [],
      compareGroups: []
    }
  }));

  store.toggleFavorite("rsks-gd|main-2026");
  store.saveProgressReminderSettings({
    qualificationReview: true,
    interview: true,
    final: true
  });

  const initialDetail = await api.getNoticeDetail("rsks-gd|main-2026");
  assert.equal(initialDetail.progressReminderSettings.qualificationReview, true);
  assert.equal(initialDetail.progressReminderSettings.interview, true);

  const savedPayload = await api.saveNoticeProgressReminderSettings("rsks-gd|main-2026", {
    qualificationReview: false
  });
  assert.equal(savedPayload.settings.qualificationReview, false);
  assert.equal(savedPayload.settings.interview, true);

  const noticeSettingsPayload = await api.getNoticeProgressReminderSettings("rsks-gd|main-2026");
  assert.equal(noticeSettingsPayload.settings.qualificationReview, false);
  assert.equal(noticeSettingsPayload.settings.interview, true);

  const messages = await api.listMessages();
  assert.ok(!messages.some((item) => item.noticeId === "ggfw-hrss-gd|qualification-2026"));
  assert.ok(messages.some((item) => item.noticeId === "ggfw-hrss-gd|interview-2026"));

  const detail = await api.getNoticeDetail("rsks-gd|main-2026");
  assert.equal(detail.progressReminderSettings.qualificationReview, false);
  assert.equal(detail.progressReminderSettings.interview, true);
});

test("api should dedupe duplicate Guangdong official notices and resolve alias ids", async () => {
  const rsksMainId = "rsks-gd|main-2026";
  const ggfwMainId = "ggfw-hrss-gd|main-2026";
  const qualificationId = "ggfw-hrss-gd|qualification-2026";

  store.__setSeedSnapshotLoaderForTests(() => ({
    seedVersion: "dual-source-dedupe-test",
    seed: {
      updatedAt: "2026-06-10T12:00:00.000Z",
      notices: [
        {
          id: rsksMainId,
          sourceId: "rsks-gd",
          examType: "guangdong-provincial",
          title: "骞夸笢鐪?026骞磋€冭瘯褰曠敤鍏姟鍛樺叕鍛?",
          area: "骞夸笢",
          source: "骞夸笢鐪佷汉浜嬭€冭瘯缃?",
          sourceMode: "official",
          publishedAt: "2025-10-19",
          registrationWindow: "2025-10-20 鑷?2025-10-24",
          writtenExamAt: "2025-12-01",
          hasStructuredPositions: true,
          positionCount: 2
        },
        {
          id: ggfwMainId,
          sourceId: "ggfw-hrss-gd",
          examType: "guangdong-provincial",
          title: "骞夸笢鐪?026骞磋€冭瘯褰曠敤鍏姟鍛樺叕鍛?",
          area: "骞夸笢",
          source: "骞夸笢鐪佸叕鍔″憳鑰冭瘯褰曠敤绠＄悊绯荤粺",
          sourceMode: "official",
          publishedAt: "2025-10-19",
          registrationWindow: "2025-10-20 鑷?2025-10-24",
          writtenExamAt: "2025-12-01",
          hasStructuredPositions: true,
          positionCount: 2
        },
        {
          id: qualificationId,
          sourceId: "ggfw-hrss-gd",
          examType: "guangdong-provincial",
          title: "骞夸笢鐪?026骞磋€冭瘯褰曠敤鍏姟鍛樿祫鏍煎鏍稿叕鍛?",
          area: "骞夸笢",
          source: "骞夸笢鐪佸叕鍔″憳鑰冭瘯褰曠敤绠＄悊绯荤粺",
          sourceMode: "official",
          publishedAt: "2026-03-01",
          hasStructuredPositions: false,
          positionCount: 0
        }
      ],
      positions: [
        {
          id: `${rsksMainId}:position-1`,
          noticeId: rsksMainId,
          batchId: `${rsksMainId}:batch-1`,
          examType: "guangdong-provincial",
          agency: "骞垮窞甯傛煇鍗曚綅",
          title: "缁煎悎绠＄悊宀?",
          positionCode: "440100001",
          positionType: "缁煎悎绠＄悊绫?",
          headcount: 2,
          area: "骞垮窞",
          education: "鏈",
          degree: "瀛﹀＋",
          major: "娉曞",
          majorCodes: ["A030101"],
          serviceRequirement: "涓嶉檺",
          freshGraduateOnly: false,
          politicalStatus: "涓嶉檺",
          notes: "鏈敞鏄?",
          sourceNoticeTitle: "骞夸笢鐪?026骞磋€冭瘯褰曠敤鍏姟鍛樺叕鍛?"
        },
        {
          id: `${rsksMainId}:position-2`,
          noticeId: rsksMainId,
          batchId: `${rsksMainId}:batch-1`,
          examType: "guangdong-provincial",
          agency: "娣卞湷甯傛煇鍗曚綅",
          title: "鎵ф硶宀?",
          positionCode: "440300002",
          positionType: "琛屾斂鎵ф硶绫?",
          headcount: 1,
          area: "娣卞湷",
          education: "鏈",
          degree: "瀛﹀＋",
          major: "娉曞",
          majorCodes: ["A030101"],
          serviceRequirement: "涓嶉檺",
          freshGraduateOnly: false,
          politicalStatus: "涓嶉檺",
          notes: "鏈敞鏄?",
          sourceNoticeTitle: "骞夸笢鐪?026骞磋€冭瘯褰曠敤鍏姟鍛樺叕鍛?"
        },
        {
          id: `${ggfwMainId}:position-shadow`,
          noticeId: ggfwMainId,
          batchId: `${ggfwMainId}:batch-1`,
          examType: "guangdong-provincial",
          agency: "浣涘北甯傛煇鍗曚綅",
          title: "褰卞瓙宀椾綅",
          positionCode: "440600999",
          positionType: "缁煎悎绠＄悊绫?",
          headcount: 1,
          area: "浣涘北",
          education: "鏈",
          degree: "瀛﹀＋",
          major: "琛屾斂绠＄悊",
          majorCodes: ["A120402"],
          serviceRequirement: "涓嶉檺",
          freshGraduateOnly: false,
          politicalStatus: "涓嶉檺",
          notes: "鏈敞鏄?",
          sourceNoticeTitle: "骞夸笢鐪?026骞磋€冭瘯褰曠敤鍏姟鍛樺叕鍛?"
        }
      ],
      sourceStates: [
        {
          sourceId: "rsks-gd",
          sourceName: "骞夸笢鐪佷汉浜嬭€冭瘯缃?",
          examType: "guangdong-provincial",
          sourceMode: "official",
          lastRunStatus: "published",
          parseQualityStatus: "healthy",
          fieldCoveragePercent: 94,
          releaseMode: "positions-open"
        },
        {
          sourceId: "ggfw-hrss-gd",
          sourceName: "骞夸笢鐪佸叕鍔″憳鑰冭瘯褰曠敤绠＄悊绯荤粺",
          examType: "guangdong-provincial",
          sourceMode: "official",
          lastRunStatus: "published",
          parseQualityStatus: "healthy",
          fieldCoveragePercent: 94,
          releaseMode: "positions-open"
        }
      ],
      reviewQueue: [],
      resolvedReviewQueue: [],
      alertEvents: [],
      compareGroups: []
    }
  }));

  const notices = await api.listNotices();
  assert.equal(notices.length, 2);
  const mainNotice = notices.find((item) => item.id === rsksMainId);
  assert.ok(mainNotice);
  assert.equal(mainNotice.id, rsksMainId);
  assert.equal(mainNotice.positionNoticeId, rsksMainId);
  assert.equal(mainNotice.mergedSourceCount, 2);
  assert.deepEqual(mainNotice.aliasNoticeIds.slice().sort(), [ggfwMainId, rsksMainId].sort());

  const aliasDetail = await api.getNoticeDetail(ggfwMainId);
  assert.equal(aliasDetail.notice.id, rsksMainId);
  assert.equal(aliasDetail.positions.length, 2);
  assert.ok(aliasDetail.positions.every((item) => item.noticeId === rsksMainId));

  const aliasPositions = await api.listPositionsByNotice(ggfwMainId);
  assert.equal(aliasPositions.notice.id, rsksMainId);
  assert.equal(aliasPositions.positions.length, 2);
  assert.ok(aliasPositions.positions.every((item) => item.noticeId === rsksMainId));
  assert.ok(!aliasPositions.positions.some((item) => item.id === `${ggfwMainId}:position-shadow`));

  store.toggleFavorite(ggfwMainId);
  const favorites = await api.listFavoriteNotices();
  assert.equal(favorites.length, 1);
  assert.equal(favorites[0].id, rsksMainId);

  const toggled = await api.toggleFavoriteNotice(rsksMainId);
  assert.deepEqual(toggled, []);
  assert.equal((await api.listFavoriteNotices()).length, 0);
});
