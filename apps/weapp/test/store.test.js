const test = require("node:test");
const assert = require("node:assert/strict");

const store = require("../utils/store");
const { installTestSeed } = require("./fixtures/test-seed");

function getGuangdongNotice() {
  return store.listNotices().find((item) => item.id.includes("rsks-gd")) || store.listNotices()[0];
}

function buildMatchingFilters(position) {
  return {
    selectedArea: position.area,
    selectedEducation: position.education,
    selectedServiceRequirement: position.serviceRequirement,
    selectedPoliticalStatus: position.politicalStatus,
    freshGraduateMode: position.freshGraduateOnly ? "only" : ""
  };
}

test.beforeEach(() => {
  installTestSeed(store, "store-test-seed");
});

test.afterEach(() => {
  store.__resetStateForTests();
});

test("saveFilterScheme should persist a reusable filter with live match counts", () => {
  const notice = getGuangdongNotice();
  const sample = store.getPositionsByNoticeId(notice.id)[0];
  const filters = buildMatchingFilters(sample);

  const saved = store.saveFilterScheme({
    name: "广州本科筛选",
    noticeId: notice.id,
    noticeTitle: notice.title,
    examType: notice.examType,
    filters,
    viewPreferences: {
      sortMode: "compare"
    },
    resultCount: 0
  });

  assert.equal(saved.name, "广州本科筛选");
  assert.ok(saved.summary.includes("地区"));
  assert.ok(saved.currentMatchCount > 0);
  assert.equal(saved.viewPreferences.sortMode, "compare");
  assert.ok(saved.currentPositionIds.length > 0);
  assert.equal(saved.currentPositionPreview[0].id, saved.currentPositionIds[0]);

  const updated = store.saveSavedFilterViewPreferences(saved.id, {
    sortMode: "eligibility"
  });
  assert.equal(updated.viewPreferences.sortMode, "eligibility");
  assert.equal(store.getSavedFilter(saved.id).viewPreferences.sortMode, "eligibility");
});

test("subscription should report new matching positions after data grows", () => {
  const notice = getGuangdongNotice();
  const sample = store.getPositionsByNoticeId(notice.id)[0];
  const filters = buildMatchingFilters(sample);

  store.savePersonalProfile({
    education: "本科",
    degree: "学士",
    majorKeywords: "法学",
    politicalStatus: "中共党员",
    serviceExperience: "has",
    freshGraduateStatus: "non-fresh"
  });

  const subscription = store.createSubscription({
    name: "广州岗位订阅",
    noticeId: notice.id,
    noticeTitle: notice.title,
    examType: notice.examType,
    filters,
    viewPreferences: {
      sortMode: "compare"
    },
    resultCount: 0
  });

  const initial = store.getSubscription(subscription.id);
  assert.equal(initial.newMatchCount, 0);
  assert.ok(initial.currentMatchCount > 0);
  assert.equal(initial.viewPreferences.sortMode, "compare");

  const updated = store.saveSubscriptionViewPreferences(subscription.id, {
    sortMode: "eligibility"
  });
  assert.equal(updated.viewPreferences.sortMode, "eligibility");
  assert.equal(store.getSubscription(subscription.id).viewPreferences.sortMode, "eligibility");

  const addedPosition = {
    ...sample,
    id: "subscription-test:new",
    title: `${sample.title}-新增命中`
  };
  store.__setPositionsForTests([...store.listPositions(), addedPosition]);

  const withNewHit = store.getSubscription(subscription.id);
  assert.equal(withNewHit.newMatchCount, 1);
  assert.ok(withNewHit.newPositionIds.includes("subscription-test:new"));
  assert.equal(withNewHit.newPositionPreview[0].id, "subscription-test:new");
  assert.equal(withNewHit.newPositionPreview[0].title, `${sample.title}-新增命中`);
  assert.equal(withNewHit.eligibleNewMatchCount, 1);
  assert.equal(withNewHit.cautionNewMatchCount, 0);
  assert.equal(withNewHit.decisionSummary, "新增 1 个岗位 · 可报 1 个 · 待确认 0 个");
  assert.ok(withNewHit.bestMatchSummary.includes(`${sample.title}-新增命中`));
  assert.ok(withNewHit.bestMatchSummary.includes("当前最匹配"));
  assert.equal(withNewHit.nextActionSummary, `${sample.title}-新增命中 · 可优先保留：当前没有明显硬门槛冲突，可继续保留。`);
  assert.equal(withNewHit.compareSuggestion.mode, "reuse");
  assert.equal(withNewHit.compareSuggestion.groupName, "省考主对比");
  assert.ok(withNewHit.compareHint.includes("省考主对比"));
  assert.equal(withNewHit.compareReady, true);
  assert.equal(withNewHit.compareActionLabel, "直接对比新增命中");

  const marked = store.markSubscriptionSeen(subscription.id);
  assert.equal(marked.newMatchCount, 0);
  assert.ok(marked.currentPositionIds.includes("subscription-test:new"));
});

test("subscription should suggest reviewing compare groups when all compatible groups are full and limit is reached", () => {
  const notice = getGuangdongNotice();
  const sample = store.getPositionsByNoticeId(notice.id)[0];
  const filters = buildMatchingFilters(sample);
  const guangdongPositions = store.getPositionsByNoticeId(notice.id).slice(0, 4).map((item) => item.id);
  const snapshot = store.__exportUserStateForServer();

  snapshot.compareGroups = Array.from({ length: 20 }, (_, index) => ({
    id: `cg-full-${index + 1}`,
    name: `满额方案${index + 1}`,
    examType: "guangdong-provincial",
    positionIds: guangdongPositions,
    viewPreferences: {
      sortMode: "manual",
      rowFocusMode: "all"
    },
    originContext: null,
    lastActionContext: null,
    isPinned: index === 0,
    pinnedAt: index === 0 ? "2026-06-09T09:00:00.000Z" : "",
    lastUsedAt: `2026-06-09T${String(20 - index).padStart(2, "0")}:00:00.000Z`
  }));
  store.__hydrateUserStateForServer(snapshot);

  const subscription = store.createSubscription({
    name: "广州岗位订阅",
    noticeId: notice.id,
    noticeTitle: notice.title,
    examType: notice.examType,
    filters,
    viewPreferences: {
      sortMode: "compare"
    },
    resultCount: 0
  });

  const addedPosition = {
    ...sample,
    id: "subscription-test:review-needed",
    title: `${sample.title}-待整理`
  };
  store.__setPositionsForTests([...store.listPositions(), addedPosition]);

  const withNewHit = store.getSubscription(subscription.id);
  assert.equal(withNewHit.compareSuggestion.mode, "review-needed");
  assert.equal(withNewHit.compareSuggestion.groupName, "满额方案1");
  assert.equal(withNewHit.compareReady, false);
  assert.equal(withNewHit.compareActionLabel, "先去整理对比方案");
  assert.ok(withNewHit.compareHint.includes("20 组上限"));
});

test("recommendPositions should return same-exam positions with reasons", () => {
  const notice = getGuangdongNotice();
  const [base] = store.getPositionsByNoticeId(notice.id);

  const results = store.recommendPositions(base.id, 5);

  assert.ok(results.length > 0);
  assert.notEqual(results[0].id, base.id);
  assert.equal(results[0].examType, base.examType);
  assert.ok(results[0].reasons.length > 0);
});

test("favorites and browsing history should be queryable", () => {
  const notice = getGuangdongNotice();

  const favoriteIds = store.toggleFavorite(notice.id);
  assert.ok(favoriteIds.includes(notice.id));
  assert.equal(store.isFavoriteNotice(notice.id), true);
  assert.equal(store.listFavoriteNotices()[0].id, notice.id);

  store.recordBrowse({
    id: `notice:${notice.id}`,
    type: "notice",
    title: notice.title,
    noticeId: notice.id
  });

  const history = store.listBrowsingHistory();
  assert.equal(history[0].noticeId, notice.id);
  assert.equal(history[0].type, "notice");
});

test("progress reminder settings should be readable and persist updates", () => {
  const initial = store.getProgressReminderSettings();
  assert.equal(initial.qualificationReview, true);
  assert.equal(initial.interview, true);
  assert.equal(initial.final, true);

  const saved = store.saveProgressReminderSettings({
    qualificationReview: false,
    interview: true
  });

  assert.equal(saved.qualificationReview, false);
  assert.equal(saved.interview, true);
  assert.equal(saved.final, true);
  assert.equal(store.getProgressReminderSettings().qualificationReview, false);
});

test("personal profile should persist normalized eligibility preferences", () => {
  const initial = store.getPersonalProfile();
  assert.equal(initial.education, "");
  assert.equal(initial.freshGraduateStatus, "");

  const saved = store.savePersonalProfile({
    education: " 本科 ",
    degree: "学士",
    majorKeywords: "法学,行政管理",
    politicalStatus: "中共党员",
    serviceExperience: "none",
    freshGraduateStatus: "non-fresh"
  });

  assert.equal(saved.education, "本科");
  assert.equal(saved.degree, "学士");
  assert.equal(saved.majorKeywords, "法学,行政管理");
  assert.equal(saved.politicalStatus, "中共党员");
  assert.equal(saved.serviceExperience, "none");
  assert.equal(saved.freshGraduateStatus, "non-fresh");
  assert.deepEqual(store.getPersonalProfile(), saved);
});

test("notice progress reminder settings should merge global defaults and per-notice overrides", () => {
  const notice = getGuangdongNotice();

  store.saveProgressReminderSettings({
    qualificationReview: true,
    interview: false,
    final: true
  });

  const initial = store.getNoticeProgressReminderSettings(notice.id);
  assert.equal(initial.qualificationReview, true);
  assert.equal(initial.interview, false);
  assert.equal(initial.final, true);

  const saved = store.saveNoticeProgressReminderSettings(notice.id, {
    qualificationReview: false
  });
  assert.equal(saved.qualificationReview, false);
  assert.equal(saved.interview, false);
  assert.equal(saved.final, true);

  const refreshed = store.getNoticeProgressReminderSettings(notice.id);
  assert.equal(refreshed.qualificationReview, false);
  assert.equal(refreshed.interview, false);
  assert.equal(refreshed.final, true);
});

test("unfavorite should clear per-notice reminder overrides", () => {
  const notice = getGuangdongNotice();

  store.toggleFavorite(notice.id);
  store.saveNoticeProgressReminderSettings(notice.id, {
    qualificationReview: false
  });
  assert.equal(store.getNoticeProgressReminderSettings(notice.id).qualificationReview, false);

  store.toggleFavorite(notice.id);

  assert.equal(store.isFavoriteNotice(notice.id), false);
  assert.equal(store.getNoticeProgressReminderSettings(notice.id).qualificationReview, true);
});

test("messages should aggregate subscriptions, favorites and history with unread state", () => {
  const notice = getGuangdongNotice();
  const sample = store.getPositionsByNoticeId(notice.id)[0];
  const filters = buildMatchingFilters(sample);

  store.savePersonalProfile({
    education: sample.education,
    degree: sample.degree,
    majorKeywords: sample.major,
    serviceExperience: "none",
    freshGraduateStatus: sample.freshGraduateOnly ? "fresh" : "non-fresh"
  });

  const subscription = store.createSubscription({
    name: "广州岗位订阅",
    noticeId: notice.id,
    noticeTitle: notice.title,
    examType: notice.examType,
    filters,
    resultCount: 0
  });

  store.toggleFavorite(notice.id);
  store.recordBrowse({
    id: `notice:${notice.id}`,
    type: "notice",
    title: notice.title,
    noticeId: notice.id,
    viewedAt: "2026-06-09T00:00:00.000Z"
  });
  store.createCompareGroup("广州方案", notice.examType);

  const addedPosition = {
    ...sample,
    id: "message-test:new",
    title: `${sample.title}-消息新增命中`
  };
  store.__setPositionsForTests([...store.listPositions(), addedPosition]);
  store.__setAlertEventsForTests([
    {
      id: "alert-message-test",
      sourceId: "rsks-gd",
      sourceName: "广东省人事考试网",
      type: "run-failed",
      severity: "high",
      createdAt: "2026-06-09T00:10:00.000Z",
      summary: "广东省人事考试网最新运行失败",
      details: "request timeout"
    }
  ]);

  const messages = store.listMessages();
  assert.equal(messages[0].type, "source-alert");
  assert.ok(messages.some((item) => item.type === "subscription"));
  assert.ok(messages.some((item) => item.type === "favorite-ready"));
  assert.ok(messages.some((item) => item.type === "history"));
  assert.ok(messages.some((item) => item.type === "source-alert"));
  assert.ok(messages.every((item) => item.read === false));
  const subscriptionMessage = messages.find((item) => item.type === "subscription");
  assert.equal(subscriptionMessage.newPositionPreview[0].id, "message-test:new");
  assert.equal(subscriptionMessage.newPositionPreview[0].title, `${sample.title}-消息新增命中`);
  assert.ok(subscriptionMessage.summary.includes("可报"));
  assert.ok(subscriptionMessage.bestMatchSummary.includes(`${sample.title}-消息新增命中`));
  assert.ok(subscriptionMessage.nextActionSummary.includes(`${sample.title}-消息新增命中`));
  assert.ok(subscriptionMessage.nextActionSummary.includes("可优先保留"));
  assert.ok(
    subscriptionMessage.compareHint.includes("省考主对比") ||
    subscriptionMessage.compareHint.includes("广州方案")
  );
  assert.equal(subscriptionMessage.compareReady, true);

  const target = messages.find((item) => item.type === "source-alert");
  const marked = store.markMessageRead(target.id);
  assert.equal(marked.unreadCount, messages.length - 1);

  const refreshed = store.listMessages();
  const refreshedTarget = refreshed.find((item) => item.id === target.id);
  assert.equal(refreshedTarget.read, true);
  assert.equal(store.getDashboardStats().unreadMessageCount, refreshed.filter((item) => !item.read).length);
});

test("sourceStates should be readable from snapshot seed", () => {
  const states = store.listSourceStates();

  assert.ok(states.length > 0);
  assert.ok(states.every((item) => item.sourceId));
  assert.ok(states.every((item) => typeof item.publishGateStatus === "string"));
  assert.ok(states.every((item) => typeof item.releaseMode === "string"));
  assert.ok(states.every((item) => Array.isArray(item.gateChecks)));
  assert.ok(states.every((item) => item.gateCheckSummary && typeof item.gateCheckSummary.summary === "string"));
  assert.equal(store.getDashboardStats().sourceCount, states.length);
});

test("dashboard stats should summarize risky source states", () => {
  store.__setSourceStatesForTests([
    {
      sourceId: "rsks-gd",
      sourceName: "广东省人事考试网",
      lastPublishedAt: "2026-06-09T09:35:00.000Z",
      consecutiveFailureCount: 2,
      pendingReviewCount: 1,
      lastRollback: true,
      lastErrorSummary: "字段映射失败，已回退到上一稳定版本"
    },
    {
      sourceId: "national-bm",
      sourceName: "国家公务员局专题",
      consecutiveFailureCount: 0,
      pendingReviewCount: 0,
      publishOverdue: true
    },
    {
      sourceId: "mock-source",
      sourceName: "模拟来源",
      consecutiveFailureCount: 0,
      pendingReviewCount: 3
    },
    {
      sourceId: "structure-only",
      sourceName: "结构变更来源",
      consecutiveFailureCount: 0,
      pendingReviewCount: 0,
      structureAlert: true
    }
  ]);
  store.__setReviewQueueForTests([
    { id: "review-1", sourceId: "rsks-gd" },
    { id: "review-2", sourceId: "mock-source" },
    { id: "review-3", sourceId: "mock-source" },
    { id: "review-4", sourceId: "mock-source" }
  ]);
  store.__setAlertEventsForTests([
    { id: "alert-1", sourceId: "rsks-gd", type: "run-failed" },
    { id: "alert-2", sourceId: "national-bm", type: "sla-overdue" }
  ]);

  const stats = store.getDashboardStats();
  const states = store.listSourceStates();
  const rsksState = states.find((item) => item.sourceId === "rsks-gd");

  assert.equal(stats.sourceCount, 4);
  assert.equal(stats.sourceAlertCount, 4);
  assert.equal(stats.overdueSourceCount, 1);
  assert.equal(stats.pendingReviewTotal, 4);
  assert.equal(stats.alertEventCount, 2);
  assert.equal(rsksState.stableVersionLabel, "2026-06-09T09:35:00.000Z 稳定快照");
  assert.equal(rsksState.publishGateStatus, "rollback");
  assert.ok(rsksState.publishGateDetail.includes("字段映射失败"));
  assert.equal(rsksState.releaseMode, "notice-only");
  assert.equal(rsksState.rollbackReason, "字段映射失败，已回退到上一稳定版本");
  assert.ok(rsksState.gateChecks.some((item) => item.label === "人工复核队列"));
  assert.ok(rsksState.gateCheckSummary.summary.includes("失败"));
});

test("dashboard stats should summarize compare group health", () => {
  const snapshot = store.__exportUserStateForServer();
  const positions = store.listPositions().slice(0, 4).map((item) => item.id);

  snapshot.compareGroups = [
    {
      id: "cg-health-1",
      name: "可复用方案",
      examType: "guangdong-provincial",
      positionIds: positions.slice(0, 2),
      viewPreferences: {
        sortMode: "manual",
        rowFocusMode: "all"
      },
      originContext: null,
      lastActionContext: null,
      isPinned: true,
      pinnedAt: "2026-06-09T09:00:00.000Z",
      lastUsedAt: "2026-06-09T10:00:00.000Z"
    },
    {
      id: "cg-health-2",
      name: "空方案",
      examType: "national",
      positionIds: [],
      viewPreferences: {
        sortMode: "manual",
        rowFocusMode: "all"
      },
      originContext: null,
      lastActionContext: null,
      isPinned: false,
      pinnedAt: "",
      lastUsedAt: "2026-06-09T08:00:00.000Z"
    },
    {
      id: "cg-health-3",
      name: "满额方案",
      examType: "guangdong-provincial",
      positionIds: positions,
      viewPreferences: {
        sortMode: "manual",
        rowFocusMode: "all"
      },
      originContext: null,
      lastActionContext: null,
      isPinned: false,
      pinnedAt: "",
      lastUsedAt: "2026-06-09T07:00:00.000Z"
    }
  ];
  store.__hydrateUserStateForServer(snapshot);

  const stats = store.getDashboardStats();

  assert.equal(stats.compareGroupCount, 3);
  assert.equal(stats.compareGroupLimit, 20);
  assert.equal(stats.compareGroupCapacityLimit, 4);
  assert.equal(stats.pinnedCompareGroupCount, 1);
  assert.equal(stats.fullCompareGroupCount, 1);
  assert.equal(stats.emptyCompareGroupCount, 1);
  assert.equal(stats.reusableCompareGroupCount, 1);
  assert.equal(stats.activeCompareGroupCount, 3);
  assert.equal(stats.remainingCompareGroupCount, 17);
  assert.equal(stats.reviewNeededCompareGroupCount, 1);
});

test("reviewQueue should be readable from snapshot seed", () => {
  const reviewQueue = store.listReviewQueue();

  assert.ok(reviewQueue.length > 0);
  assert.ok(reviewQueue.every((item) => item.sourceId));
  assert.ok(reviewQueue.every((item) => item.priority && typeof item.priority.label === "string"));
  assert.ok(reviewQueue.every((item) => typeof item.resolutionSuggestion === "string"));
  assert.ok(reviewQueue.every((item) => typeof item.releaseImpact === "string"));
  assert.ok(reviewQueue.every((item) => Array.isArray(item.gateChecks)));
  assert.ok(reviewQueue.every((item) => item.gateCheckSummary && typeof item.gateCheckSummary.summary === "string"));
});

test("alertEvents should be readable from snapshot seed", () => {
  const alertEvents = store.listAlertEvents();

  assert.ok(alertEvents.length > 0);
  assert.ok(alertEvents.every((item) => item.id));
});

test("resolveReviewItem should move item out of pending queue and close review alert", () => {
  store.__setSourceStatesForTests([
    {
      sourceId: "rsks-gd",
      sourceName: "广东省人事考试网",
      pendingReviewCount: 1
    }
  ]);
  store.__setReviewQueueForTests([
    {
      id: "review-resolve-1",
      sourceId: "rsks-gd",
      sourceName: "广东省人事考试网",
      createdAt: "2026-06-09T10:00:00.000Z",
      reasons: ["fetch failed"]
    }
  ]);
  store.__setAlertEventsForTests([
    {
      id: "alert-review-1",
      sourceId: "rsks-gd",
      sourceName: "广东省人事考试网",
      type: "review-queued",
      severity: "medium",
      createdAt: "2026-06-09T10:00:00.000Z",
      summary: "广东省人事考试网有待复核记录"
    }
  ]);

  const resolved = store.resolveReviewItem("review-resolve-1", "已人工核对");

  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolutionNote, "已人工核对");
  assert.equal(store.listReviewQueue().length, 0);
  assert.equal(store.listResolvedReviewQueue().length, 1);
  assert.equal(store.listAlertEvents().length, 0);
  assert.equal(store.listSourceStates()[0].pendingReviewCount, 0);
  assert.equal(store.getDashboardStats().pendingReviewTotal, 0);
  assert.equal(store.getDashboardStats().resolvedReviewTotal, 1);
});

test("reopenReviewItem should restore pending queue and recreate review alert", () => {
  store.__setSourceStatesForTests([
    {
      sourceId: "rsks-gd",
      sourceName: "广东省人事考试网",
      pendingReviewCount: 0
    }
  ]);
  store.__setReviewQueueForTests([
    {
      id: "review-reopen-1",
      sourceId: "rsks-gd",
      sourceName: "广东省人事考试网",
      status: "resolved",
      createdAt: "2026-06-09T10:00:00.000Z",
      resolvedAt: "2026-06-09T10:10:00.000Z",
      resolutionNote: "已处理",
      reasons: ["fetch failed"]
    }
  ]);
  store.__setAlertEventsForTests([]);

  const reopened = store.reopenReviewItem("review-reopen-1");

  assert.equal(reopened.status, "pending");
  assert.equal(store.listReviewQueue().length, 1);
  assert.equal(store.listResolvedReviewQueue().length, 0);
  assert.equal(store.listAlertEvents().length, 1);
  assert.equal(store.listAlertEvents()[0].type, "review-queued");
  assert.equal(store.listSourceStates()[0].pendingReviewCount, 1);
});

test("compare groups should support rename, delete and cross-exam guard", () => {
  const notice = getGuangdongNotice();
  const base = store.getPositionsByNoticeId(notice.id)[0];
  const sameExam = store.getPositionsByNoticeId(notice.id)[1];
  const national = store.listPositions().find((item) => item.examType !== base.examType);

  const group = store.createCompareGroup("原方案", base.examType);
  assert.equal(group.viewPreferences.sortMode, "manual");
  assert.equal(group.viewPreferences.rowFocusMode, "all");
  const renamed = store.renameCompareGroup(group.id, "广州优先方案");
  assert.equal(renamed.name, "广州优先方案");

  const withPreferences = store.saveCompareGroupPreferences(group.id, {
    sortMode: "eligibility",
    rowFocusMode: "barrier"
  });
  assert.equal(withPreferences.viewPreferences.sortMode, "eligibility");
  assert.equal(withPreferences.viewPreferences.rowFocusMode, "barrier");
  assert.equal(store.getCompareGroup(group.id).viewPreferences.sortMode, "eligibility");

  store.addPositionToCompareGroup(group.id, base.id);
  store.addPositionToCompareGroup(group.id, sameExam.id);
  assert.equal(store.getComparePositions(group.id).length, 2);

  assert.throws(
    () => store.addPositionToCompareGroup(group.id, national.id),
    /不能跨考试类型对比/
  );

  const groups = store.deleteCompareGroup(group.id);
  assert.ok(groups.length > 0);
  assert.ok(!groups.some((item) => item.id === group.id));
});

test("compare groups should persist origin and last action context", () => {
  const notice = getGuangdongNotice();
  const [base, sameExam] = store.getPositionsByNoticeId(notice.id);

  const group = store.createCompareGroup("来源方案", base.examType, {
    originContext: {
      sourceType: "subscription",
      sourceLabel: "订阅命中",
      sourceEntry: "messages",
      sourceName: "珠三角订阅",
      noticeId: notice.id,
      noticeTitle: notice.title,
      action: "create",
      actedAt: "2026-06-09T10:00:00.000Z",
      positionIds: [base.id],
      addedCount: 1
    }
  });

  assert.equal(group.originContext.sourceType, "subscription");
  assert.equal(group.originContext.sourceEntry, "messages");
  assert.equal(group.lastActionContext.action, "create");

  const afterAdd = store.addPositionToCompareGroup(group.id, base.id, {
    sourceType: "positions",
    sourceLabel: "岗位列表",
    sourceEntry: "positions",
    sourceName: "广东岗位",
    noticeId: notice.id,
    noticeTitle: notice.title,
    action: "reuse",
    actedAt: "2026-06-09T11:00:00.000Z",
    positionIds: [base.id],
    addedCount: 1
  });
  assert.equal(afterAdd.lastActionContext.sourceType, "positions");
  assert.equal(afterAdd.lastActionContext.action, "reuse");
  assert.equal(afterAdd.originContext.sourceType, "subscription");

  const afterRecord = store.recordCompareGroupAction(group.id, {
    sourceType: "subscription",
    sourceLabel: "订阅命中",
    sourceEntry: "home",
    sourceName: "珠三角订阅",
    noticeId: notice.id,
    noticeTitle: notice.title,
    action: "open-existing",
    actedAt: "2026-06-09T12:00:00.000Z",
    positionIds: [base.id, sameExam.id],
    addedCount: 0
  });
  assert.equal(afterRecord.lastActionContext.sourceEntry, "home");
  assert.equal(afterRecord.lastActionContext.action, "open-existing");
  assert.equal(afterRecord.originContext.sourceEntry, "messages");
  assert.equal(afterRecord.lastUsedAt, "2026-06-09T12:00:00.000Z");

  const touched = store.touchCompareGroup(group.id, "2026-06-09T12:30:00.000Z");
  assert.equal(touched.lastUsedAt, "2026-06-09T12:30:00.000Z");

  const pinned = store.setCompareGroupPinned(group.id, true, "2026-06-09T12:31:00.000Z");
  assert.equal(pinned.isPinned, true);
  assert.equal(pinned.pinnedAt, "2026-06-09T12:31:00.000Z");

  const unpinned = store.setCompareGroupPinned(group.id, false);
  assert.equal(unpinned.isPinned, false);
  assert.equal(unpinned.pinnedAt, "");
});
