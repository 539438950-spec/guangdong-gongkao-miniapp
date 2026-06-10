const api = require("../../utils/api");
const {
  executeQuickCompare,
  buildQuickCompareToastTitle
} = require("../../utils/compare-group-actions");
const {
  buildComparePageUrl,
  buildNoticeCompareContext,
  buildNoticeCompareRecord,
  buildEmptyNoticeCompareSuggestion
} = require("../../utils/notice-compare-guidance");
const {
  buildSourceGateChecks,
  buildGateCheckSummary,
  buildSourcePublishGate,
  buildSourceRiskSummary
} = require("../../utils/source-ops-guidance");
const { buildTrustAction } = require("../../utils/trust-action");

const ACTIONABLE_COMPARE_MODES = new Set([
  "open-existing",
  "reuse",
  "create-first",
  "create-new"
]);
const TRACKING_STAGE_IDS = new Set([
  "qualification-review",
  "interview",
  "physical-test",
  "final"
]);

function buildSubscriptionPositionsUrl(noticeId, subscriptionId, newPositionIds = []) {
  const params = [
    `noticeId=${noticeId}`,
    `subscriptionId=${subscriptionId}`
  ];
  if (Array.isArray(newPositionIds) && newPositionIds.length) {
    params.push(`newPositionIds=${encodeURIComponent(newPositionIds.join(","))}`);
  }
  return `/pages/positions/index?${params.join("&")}`;
}

function buildSavedFilterPositionsUrl(noticeId, savedFilterId) {
  return `/pages/positions/index?noticeId=${noticeId}&savedFilterId=${savedFilterId}`;
}

function mapSlaStatus(status) {
  if (status === "healthy") {
    return "按 SLA 更新";
  }
  if (status === "warning") {
    return "接近超时";
  }
  if (status === "overdue") {
    return "已超时未更新";
  }
  return "状态未知";
}

function getRiskScore(item) {
  return [
    item.fetchOverdue || item.publishOverdue ? 1 : 0,
    item.structureAlert ? 1 : 0,
    Number(item.pendingReviewCount || 0) > 0 ? 1 : 0,
    Number(item.consecutiveFailureCount || 0) > 0 ? 1 : 0
  ].reduce((sum, value) => sum + value, 0);
}

function hasProfileSignals(profile = {}) {
  return Boolean(
    profile.education ||
    profile.degree ||
    profile.majorKeywords ||
    profile.politicalStatus ||
    profile.serviceExperience ||
    profile.freshGraduateStatus
  );
}

function getPublishedTime(item = {}) {
  const publishedTime = Date.parse(String(item.publishedAt || "").trim());
  return Number.isFinite(publishedTime) ? publishedTime : 0;
}

function getRecencyScore(item = {}) {
  const publishedTime = getPublishedTime(item);
  if (!publishedTime) {
    return 0;
  }
  const ageDays = Math.max(0, Math.floor((Date.now() - publishedTime) / (24 * 60 * 60 * 1000)));
  if (ageDays <= 7) {
    return 18;
  }
  if (ageDays <= 30) {
    return 12;
  }
  if (ageDays <= 90) {
    return 6;
  }
  return 0;
}

function buildHomeNoticePriority(item, profile = {}, focusAreas = []) {
  const reasons = [];
  let score = getRecencyScore(item);
  const noticeCompareSuggestion = item.noticeCompareSuggestion || buildEmptyNoticeCompareSuggestion();
  const profileActive = hasProfileSignals(profile);

  if (item.hasStructuredPositions) {
    score += 32;
    reasons.push("岗位已结构化");
  }

  if (ACTIONABLE_COMPARE_MODES.has(noticeCompareSuggestion.mode)) {
    score += profileActive ? 28 : 18;
    reasons.push(profileActive ? "可直接按你的条件开始选岗" : "可直接开始选岗");
  }

  if (item.noticeStageId === "main") {
    score += 16;
    reasons.push("主公告优先");
  }

  if (item.examType === "guangdong-provincial") {
    score += 10;
    reasons.push("广东首版重点");
  }

  if (focusAreas.includes(item.area)) {
    score += 6;
    reasons.push(`命中关注地区：${item.area}`);
  }

  if (TRACKING_STAGE_IDS.has(item.noticeStageId) && !item.hasStructuredPositions) {
    score -= 8;
    reasons.push("更适合进度追踪");
  }

  if (ACTIONABLE_COMPARE_MODES.has(noticeCompareSuggestion.mode)) {
    return {
      score,
      label: "优先选岗",
      detail: profileActive
        ? "可直接按你的条件开始选岗"
        : "可直接开始岗位筛选和对比"
    };
  }

  if (TRACKING_STAGE_IDS.has(item.noticeStageId) && !item.hasStructuredPositions) {
    return {
      score,
      label: "进度更新",
      detail: reasons[reasons.length - 1] || "当前更适合跟进后续流程"
    };
  }

  return {
    score,
    label: "最近更新",
    detail: reasons[0] || "适合先了解本批最新动态"
  };
}

function mapSourceMode(item, options = {}) {
  const hasStructuredPositions = Boolean(item.hasStructuredPositions);
  const noticeCompareSuggestion = item.noticeCompareSuggestion || buildEmptyNoticeCompareSuggestion();
  const homePriority = buildHomeNoticePriority(item, options.personalProfile || {}, options.focusAreas || []);
  return {
    ...item,
    lastSuccessfulFetchedAt: item.lastSuccessfulFetchedAt || item.lastFetchedAt || "",
    sourceModeLabel: item.sourceModeLabel || (item.sourceMode === "demo" ? "演示" : "官方"),
    availabilityLabel: hasStructuredPositions ? "可选岗" : "仅公告",
    availabilityTagClass: hasStructuredPositions ? "" : "tag-warn",
    noticeStageLabel: item.noticeStageLabel || "公告",
    relatedNoticeCount: Number(item.relatedNoticeCount || 0),
    followingNoticeCount: Number(item.followingNoticeCount || 0),
    noticeProgressHint: item.noticeProgressHint || "",
    noticeProgressDetail: item.noticeProgressDetail || "",
    noticeCompareSuggestion,
    noticeCompareTagClass: noticeCompareSuggestion.mode === "review-needed"
      ? "tag-warn"
      : (noticeCompareSuggestion.actionLabel ? "tag-active" : ""),
    trustAction: buildTrustAction(item.noticeTrust || null),
    homePriorityLabel: homePriority.label,
    homePriorityDetail: homePriority.detail,
    homePriorityScore: homePriority.score,
    homePriorityTagClass: homePriority.label === "优先选岗"
      ? "tag-active"
      : (homePriority.label === "进度更新" ? "tag-warn" : "")
  };
}

function selectHomeNotices(notices = [], limit = 3) {
  if (!Array.isArray(notices) || !notices.length) {
    return [];
  }

  const relevantFirst = notices.slice().sort((left, right) => {
    const scoreGap = Number(right.homePriorityScore || 0) - Number(left.homePriorityScore || 0);
    if (scoreGap !== 0) {
      return scoreGap;
    }
    return getPublishedTime(right) - getPublishedTime(left);
  });
  const recentFirst = notices.slice().sort((left, right) => {
    const publishedGap = getPublishedTime(right) - getPublishedTime(left);
    if (publishedGap !== 0) {
      return publishedGap;
    }
    return Number(right.homePriorityScore || 0) - Number(left.homePriorityScore || 0);
  });

  const merged = [];
  const pushUnique = (item) => {
    if (!item || merged.some((current) => current.id === item.id)) {
      return;
    }
    merged.push(item);
  };

  pushUnique(relevantFirst[0]);
  recentFirst.forEach(pushUnique);
  relevantFirst.slice(1).forEach(pushUnique);

  return merged.slice(0, limit);
}

function mapCompareExamTypeLabel(examType) {
  const labels = {
    "guangdong-provincial": "广东省考",
    national: "国考"
  };
  return labels[String(examType || "").trim()] || "其他考试";
}

function formatCompareUpdatedAt(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text.replace("T", " ").slice(0, 16);
}

function buildCompareWorkspaceItem(group = {}) {
  const compareSummary = group.compareSummary || {};
  const positionCount = Number(compareSummary.positionCount || (Array.isArray(group.positionIds) ? group.positionIds.length : 0));
  const matchedCount = Number(compareSummary.matchedCount || 0);
  const blockedCount = Number(compareSummary.blockedCount || 0);
  const cautionCount = Number(compareSummary.cautionCount || 0);
  const lastActionContext = group.lastActionContext || null;
  const originContext = group.originContext || null;
  const updatedAt = formatCompareUpdatedAt(
    group.lastUsedAt ||
    (lastActionContext && lastActionContext.actedAt) ||
    (originContext && originContext.actedAt) ||
    ""
  );
  const recencyScore = Date.parse(
    group.lastUsedAt ||
    (lastActionContext && lastActionContext.actedAt) ||
    (originContext && originContext.actedAt) ||
    ""
  ) || 0;
  let priorityScore = 0;

  if (group.isPinned) {
    priorityScore += 20;
  }
  if (positionCount > 0) {
    priorityScore += 20;
  }
  if (compareSummary.active) {
    priorityScore += 18;
  }
  if (blockedCount > 0) {
    priorityScore += 24;
  } else if (cautionCount > 0) {
    priorityScore += 12;
  } else if (matchedCount > 0) {
    priorityScore += 8;
  }
  priorityScore += Math.floor(recencyScore / (24 * 60 * 60 * 1000 * 100));

  let headline = "";
  let detail = "";
  if (positionCount === 0) {
    headline = "优先补岗位";
    detail = "当前方案还是空的，后续命中岗位时可以优先补进来。";
  } else if (blockedCount > 0) {
    headline = "优先核对可报性";
    detail = compareSummary.bestFitTitle
      ? `${compareSummary.bestFitTitle} 最接近可报，当前仍有 ${blockedCount} 个岗位待确认。`
      : `当前有 ${blockedCount} 个岗位待确认，建议先回到对比页核对门槛。`;
  } else if (cautionCount > 0) {
    headline = "回看门槛限制";
    detail = compareSummary.topTitle
      ? `${compareSummary.topTitle} 当前更值得优先看，但仍有 ${cautionCount} 个岗位偏谨慎。`
      : `当前有 ${cautionCount} 个岗位偏谨慎，建议回到对比页继续判断。`;
  } else if (positionCount > 0) {
    headline = "继续处理当前方案";
    detail = compareSummary.bestFitTitle
      ? `${compareSummary.bestFitTitle} 当前最值得优先保留，可继续扩展或收敛对比。`
      : `当前方案已有 ${positionCount} 个岗位，可继续扩展或收敛对比。`;
  }

  return {
    ...group,
    examTypeLabel: mapCompareExamTypeLabel(group.examType),
    positionCount,
    matchedCount,
    blockedCount,
    cautionCount,
    compareSummary,
    updatedAt,
    recencyScore,
    priorityScore,
    headline,
    detail,
    tags: [
      group.examType ? mapCompareExamTypeLabel(group.examType) : "",
      positionCount > 0 ? `${positionCount} 岗位` : "空方案",
      matchedCount > 0 ? `可报 ${matchedCount}` : "",
      blockedCount > 0 ? `待确认 ${blockedCount}` : "",
      cautionCount > 0 ? `偏谨慎 ${cautionCount}` : ""
    ].filter(Boolean)
  };
}

function buildHomeCompareWorkspace(compareGroups = []) {
  if (!Array.isArray(compareGroups) || !compareGroups.length) {
    return {
      active: false,
      groupId: "",
      groupName: "",
      headline: "",
      detail: "",
      updatedAt: "",
      tags: [],
      actionLabel: "打开岗位对比"
    };
  }

  const ranked = compareGroups
    .map((item) => buildCompareWorkspaceItem(item))
    .sort((left, right) => {
      const scoreGap = Number(right.priorityScore || 0) - Number(left.priorityScore || 0);
      if (scoreGap !== 0) {
        return scoreGap;
      }
      const matchedGap = Number(right.matchedCount || 0) - Number(left.matchedCount || 0);
      if (matchedGap !== 0) {
        return matchedGap;
      }
      const blockedGap = Number(right.blockedCount || 0) - Number(left.blockedCount || 0);
      if (blockedGap !== 0) {
        return blockedGap;
      }
      const positionGap = Number(right.positionCount || 0) - Number(left.positionCount || 0);
      if (positionGap !== 0) {
        return positionGap;
      }
      const recencyGap = Number(right.recencyScore || 0) - Number(left.recencyScore || 0);
      if (recencyGap !== 0) {
        return recencyGap;
      }
      return String(left.name || "").localeCompare(String(right.name || ""));
    });
  const top = ranked[0];

  return {
    active: true,
    groupId: top.id || "",
    groupName: top.name || "",
    headline: top.headline,
    detail: top.detail,
    updatedAt: top.updatedAt,
    tags: top.tags || [],
    actionLabel: "继续处理方案"
  };
}

function buildSavedFilterWorkspaceItem(savedFilter = {}) {
  const currentMatchCount = Number(savedFilter.currentMatchCount || 0);
  const previewPosition = savedFilter.currentPositionPreview && savedFilter.currentPositionPreview.length
    ? savedFilter.currentPositionPreview[0]
    : null;
  const summary = String(savedFilter.summary || "").trim();
  let priorityScore = 0;
  let headline = "";
  let detail = "";
  let actionLabel = "回到岗位页";

  if (currentMatchCount >= 2 && currentMatchCount <= 4) {
    priorityScore = 42;
    headline = "适合继续收敛后直接对比";
    detail = `当前命中 ${currentMatchCount} 个岗位，适合回到岗位页继续筛一轮，再直接进入对比。`;
    actionLabel = "继续筛选并准备对比";
  } else if (currentMatchCount === 1) {
    priorityScore = 34;
    headline = "优先核对单个岗位";
    detail = previewPosition
      ? `当前只命中 1 个岗位：${previewPosition.title}，适合直接核对报考门槛。`
      : "当前只命中 1 个岗位，适合直接核对报考门槛。";
    actionLabel = "继续核对岗位";
  } else if (currentMatchCount > 4) {
    priorityScore = 24;
    headline = "先缩小筛选范围";
    detail = `当前命中 ${currentMatchCount} 个岗位，建议先收紧地区、专业或学历条件，再进入对比。`;
    actionLabel = "继续缩小范围";
  } else {
    priorityScore = 8;
    headline = "回去调整筛选条件";
    detail = "当前没有命中岗位，建议回到岗位页调整地区、专业或学历条件。";
    actionLabel = "调整筛选条件";
  }

  return {
    ...savedFilter,
    currentMatchCount,
    priorityScore,
    headline,
    detail,
    actionLabel,
    tags: [
      currentMatchCount > 0 ? `命中 ${currentMatchCount}` : "当前无命中",
      currentMatchCount >= 2 && currentMatchCount <= 4 ? "可直接对比" : "",
      currentMatchCount > 4 ? "先收窄范围" : "",
      summary || ""
    ].filter(Boolean)
  };
}

function buildHomeSavedFilterWorkspace(savedFilters = []) {
  if (!Array.isArray(savedFilters) || !savedFilters.length) {
    return {
      active: false,
      filterId: "",
      filterName: "",
      noticeId: "",
      headline: "",
      detail: "",
      actionLabel: "打开岗位筛选",
      tags: []
    };
  }

  const ranked = savedFilters
    .map((item) => buildSavedFilterWorkspaceItem(item))
    .sort((left, right) => {
      const scoreGap = Number(right.priorityScore || 0) - Number(left.priorityScore || 0);
      if (scoreGap !== 0) {
        return scoreGap;
      }
      const countGap = Number(right.currentMatchCount || 0) - Number(left.currentMatchCount || 0);
      if (countGap !== 0) {
        return countGap;
      }
      return String(left.name || "").localeCompare(String(right.name || ""));
    });
  const top = ranked[0];

  return {
    active: true,
    filterId: top.id || "",
    filterName: top.name || "",
    noticeId: top.noticeId || "",
    headline: top.headline,
    detail: top.detail,
    actionLabel: top.actionLabel,
    tags: top.tags || []
  };
}

function buildGateFailureTypeSummary(sourceStates = []) {
  const counts = sourceStates.reduce((summary, item) => {
    const checks = Array.isArray(item.gateChecks) ? item.gateChecks : [];
    checks.forEach((check) => {
      if (check && check.status === "fail") {
        const label = check.label || "发布校验失败";
        summary[label] = (summary[label] || 0) + 1;
      }
    });
    return summary;
  }, {});

  return Object.keys(counts)
    .map((label) => ({
      label,
      count: counts[label]
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function buildFailedCheckTypeSummary(reviewQueue = []) {
  const counts = reviewQueue.reduce((summary, item) => {
    const checks = Array.isArray(item.gateChecks) ? item.gateChecks : [];
    checks.forEach((check) => {
      if (check && check.status === "fail") {
        const label = check.label || "复核失败";
        summary[label] = (summary[label] || 0) + 1;
      }
    });
    return summary;
  }, {});

  return Object.keys(counts)
    .map((label) => ({
      label,
      count: counts[label]
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function isBlockingRelease(reviewItem = {}) {
  if (!reviewItem) {
    return false;
  }
  if (typeof reviewItem.blockingRelease === "boolean") {
    return reviewItem.blockingRelease;
  }
  if (!reviewItem.hasRawPayload || !reviewItem.hasParsedPayload) {
    return true;
  }
  if (reviewItem.parseStatus === "attachment-only") {
    return reviewItem.expectedPositionWorkbook !== false && !reviewItem.attachmentOnlyExpected;
  }
  return Number(reviewItem.fieldCoveragePercent || 0) > 0 && Number(reviewItem.fieldCoveragePercent || 0) < 90;
}

function isParseIssue(item = {}) {
  return item.parseQualityStatus === "warning" || (
    item.parseQualityStatus === "attachment-only" &&
    item.expectedPositionWorkbook !== false &&
    !item.attachmentOnlyExpected
  );
}

function buildSourceSummary(sourceStates = [], stats = {}) {
  return {
    sourceCount: Number(stats.sourceCount || sourceStates.length || 0),
    sourceAlertCount: Number(stats.sourceAlertCount || 0),
    overdueSourceCount: Number(stats.overdueSourceCount || 0),
    pendingReviewTotal: Number(stats.pendingReviewTotal || 0),
    alertEventCount: Number(stats.alertEventCount || 0),
    parseIssueCount: sourceStates.filter(isParseIssue).length,
    publishableCount: sourceStates.filter(
      (item) => item.publishGate && item.publishGate.status === "healthy"
    ).length,
    restrictedCount: sourceStates.filter(
      (item) => !item.publishGate || item.publishGate.status !== "healthy"
    ).length,
    gateBlockedCount: sourceStates.filter(
      (item) => item.publishGate && (
        item.publishGate.status === "blocked" ||
        item.publishGate.status === "notice-only" ||
        item.publishGate.status === "parse-warning" ||
        item.publishGate.status === "review" ||
        item.publishGate.status === "rollback"
      )
    ).length,
    rollbackCount: sourceStates.filter(
      (item) => item.publishGate && item.publishGate.status === "rollback"
    ).length,
    gateFailureTypeSummary: buildGateFailureTypeSummary(sourceStates)
  };
}

function buildReviewSummary(reviewQueue = [], resolvedReviewQueue = [], stats = {}) {
  return {
    total: Number(stats.pendingReviewTotal || reviewQueue.length || 0),
    resolved: Number(stats.resolvedReviewTotal || resolvedReviewQueue.length || 0),
    highPriority: reviewQueue.filter((item) => item.priority && item.priority.level === "high").length,
    blockingRelease: reviewQueue.filter((item) => isBlockingRelease(item)).length,
    failedCheckTypeSummary: buildFailedCheckTypeSummary(reviewQueue)
  };
}

function buildNextAction(item = {}) {
  if (item.nextAction && item.nextAction.label) {
    return item.nextAction;
  }

  const firstRiskCheck = (item.gateChecks || []).find(
    (check) => check.status === "fail" || check.status === "warn"
  ) || null;

  if (item.publishGate && item.publishGate.focus === "review") {
    return {
      focus: "review",
      label: "优先处理复核队列",
      detail: firstRiskCheck
        ? `${firstRiskCheck.label}${firstRiskCheck.detail ? ` · ${firstRiskCheck.detail}` : ""}`
        : "先处理候选版本复核，再决定是否放量"
    };
  }

  if (item.publishGate && item.publishGate.focus === "parse") {
    return {
      focus: "parse",
      label: "先修正岗位表解析",
      detail: firstRiskCheck
        ? `${firstRiskCheck.label}${firstRiskCheck.detail ? ` · ${firstRiskCheck.detail}` : ""}`
        : "当前只适合公告模式，岗位表能力暂不开放"
    };
  }

  if (item.publishGate && item.publishGate.focus === "sla") {
    return {
      focus: "sla",
      label: "盯紧本轮时效",
      detail: "当前可继续使用，但需要关注抓取和发布时间是否接近 SLA"
    };
  }

  if (item.publishGate && item.publishGate.focus === "run") {
    return {
      focus: "run",
      label: "先恢复抓取运行",
      detail: item.rollbackReason || item.gateFailureReason || "本轮运行异常，前台继续保留稳定版本"
    };
  }

  return {
    focus: "",
    label: "",
    detail: ""
  };
}

function buildPublishGateTagClass(publishGate = {}) {
  if (!publishGate || !publishGate.status) {
    return "";
  }
  if (publishGate.status === "healthy") {
    return "tag-active";
  }
  if (publishGate.status === "healthy-with-sla-risk") {
    return "";
  }
  return "tag-warn";
}

function enrichHomeSourceState(item, options = {}) {
  const gateChecks = item.gateChecks && item.gateChecks.length
    ? item.gateChecks
    : buildSourceGateChecks(item);
  const normalized = {
    ...mapSourceMode(item, options),
    lastSuccessfulFetchedAt: item.lastSuccessfulFetchedAt || item.lastFetchedAt || "",
    gateChecks,
    gateCheckSummary: item.gateCheckSummary || buildGateCheckSummary(gateChecks),
    slaStatusLabel: item.slaStatusLabel || mapSlaStatus(item.slaStatus)
  };
  const publishGate = item.publishGate || buildSourcePublishGate(normalized);
  const nextAction = buildNextAction({
    ...normalized,
    publishGate
  });

  return {
    ...normalized,
    publishGate,
    nextAction,
    riskSummary: item.riskSummary || buildSourceRiskSummary(normalized),
    publishGateTagClass: buildPublishGateTagClass(publishGate)
  };
}

Page({
  data: {
    heroStats: {
      sourceCount: 0,
      sourceAlertCount: 0,
      overdueSourceCount: 0,
      pendingReviewTotal: 0,
      alertEventCount: 0,
      compareGroupCount: 0,
      updateSla: "1 小时",
      subscriptionNewHitCount: 0,
      unreadMessageCount: 0
    },
    latestNotices: [],
    subscriptions: [],
    compareWorkspace: {
      active: false,
      groupId: "",
      groupName: "",
      headline: "",
      detail: "",
      updatedAt: "",
      tags: [],
      actionLabel: "打开岗位对比"
    },
    savedFilterWorkspace: {
      active: false,
      filterId: "",
      filterName: "",
      noticeId: "",
      headline: "",
      detail: "",
      actionLabel: "打开岗位筛选",
      tags: []
    },
    sourceStates: [],
    sourceSummary: {
      sourceCount: 0,
      sourceAlertCount: 0,
      overdueSourceCount: 0,
      pendingReviewTotal: 0,
      alertEventCount: 0,
      parseIssueCount: 0,
      publishableCount: 0,
      restrictedCount: 0,
      gateBlockedCount: 0,
      rollbackCount: 0,
      gateFailureTypeSummary: []
    },
    reviewSummary: {
      total: 0,
      resolved: 0,
      highPriority: 0,
      blockingRelease: 0,
      failedCheckTypeSummary: []
    },
    focusAreas: ["广州", "深圳", "佛山", "省直"]
  },

  onShow() {
    api.getDashboard().then((payload) => {
      const personalProfile = payload.personalProfile || {};
      const focusAreas = this.data.focusAreas || [];
      const reviewQueue = payload.reviewQueue || [];
      const resolvedReviewQueue = payload.resolvedReviewQueue || [];
      const sourceStates = (payload.sourceStates || [])
        .map((item) => enrichHomeSourceState(item, { personalProfile, focusAreas }))
        .sort((left, right) => {
          const riskGap = getRiskScore(right) - getRiskScore(left);
          if (riskGap !== 0) {
            return riskGap;
          }
          return Number(right.publishLagMinutes || -1) - Number(left.publishLagMinutes || -1);
        });

      this.setData({
        heroStats: {
          sourceCount: payload.stats.sourceCount,
          sourceAlertCount: payload.stats.sourceAlertCount,
          overdueSourceCount: payload.stats.overdueSourceCount,
          pendingReviewTotal: payload.stats.pendingReviewTotal,
          alertEventCount: payload.stats.alertEventCount,
          compareGroupCount: payload.stats.compareGroupCount,
          updateSla: "1 小时",
          subscriptionNewHitCount: payload.stats.subscriptionNewHitCount,
          unreadMessageCount: payload.stats.unreadMessageCount
        },
        latestNotices: selectHomeNotices(
          (payload.notices || []).map((item) => mapSourceMode(item, { personalProfile, focusAreas })),
          3
        ),
        subscriptions: (payload.subscriptions || []).slice(0, 3),
        compareWorkspace: buildHomeCompareWorkspace(payload.compareGroups || []),
        savedFilterWorkspace: buildHomeSavedFilterWorkspace(payload.savedFilters || []),
        sourceStates,
        sourceSummary: payload.sourceSummary || buildSourceSummary(sourceStates, payload.stats || {}),
        reviewSummary: payload.reviewSummary || buildReviewSummary(
          reviewQueue,
          resolvedReviewQueue,
          payload.stats || {}
        )
      });
    });
  },

  openSubscription(event) {
    const { noticeId, id } = event.currentTarget.dataset;
    api.getSubscription(id).then((subscription) => {
      const targetUrl = buildSubscriptionPositionsUrl(
        noticeId,
        id,
        subscription && Array.isArray(subscription.newPositionIds) ? subscription.newPositionIds : []
      );
      return api.markSubscriptionSeen(id).then(() => {
        wx.navigateTo({ url: targetUrl });
      });
    });
  },

  quickCompareSubscription(event) {
    const { id } = event.currentTarget.dataset;
    let subscriptionId = id;
    api.getSubscription(id).then((subscription) => {
      if (!subscription) {
        wx.showToast({ title: "订阅方案不存在", icon: "none" });
        return null;
      }
      subscriptionId = subscription.id || id;
      if (subscription.compareSuggestion && subscription.compareSuggestion.mode === "review-needed") {
        wx.navigateTo({ url: buildComparePageUrl(subscription.compareSuggestion) });
        return null;
      }

      return executeQuickCompare(api, subscription, {
        preferNew: true,
        compareContext: {
          sourceType: "subscription",
          sourceLabel: "订阅命中",
          sourceEntry: "home",
          sourceName: subscription.name || "",
          noticeId: subscription.noticeId || "",
          noticeTitle: subscription.noticeTitle || ""
        }
      });
    }).then((result) => {
      if (!result) {
        return;
      }
      if (result.status === "empty" || !result.group) {
        wx.showToast({ title: "当前没有可对比岗位", icon: "none" });
        return;
      }

      api.markSubscriptionSeen(subscriptionId).then(() => {
        this.onShow();
        wx.showToast({
          title: buildQuickCompareToastTitle(result),
          icon: "success"
        });
        wx.navigateTo({ url: `/pages/compare/index?groupId=${result.group.id}` });
      });
    }).catch((error) => {
      wx.showToast({ title: error.message, icon: "none" });
    });
  },

  openLatestNotice(event) {
    const { id } = event.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/notice-detail/index?id=${id}` });
  },

  openTrustRoute(event) {
    const route = (event && event.detail && event.detail.route) || (
      event && event.currentTarget && event.currentTarget.dataset
        ? event.currentTarget.dataset.route
        : ""
    );
    if (!route) {
      return;
    }
    wx.navigateTo({ url: route });
  },

  quickCompareLatestNotice(event) {
    const { id } = event.currentTarget.dataset;
    const notice = this.data.latestNotices.find((item) => item.id === id) || null;
    const noticeCompareSuggestion = notice ? notice.noticeCompareSuggestion : buildEmptyNoticeCompareSuggestion();

    if (!notice || !noticeCompareSuggestion || !noticeCompareSuggestion.mode) {
      wx.showToast({ title: "当前公告暂无可对比岗位", icon: "none" });
      return;
    }

    if (noticeCompareSuggestion.mode === "review-needed" || noticeCompareSuggestion.mode === "open-existing") {
      wx.navigateTo({ url: buildComparePageUrl(noticeCompareSuggestion) });
      return;
    }

    const compareRecord = buildNoticeCompareRecord(notice, notice.noticeCompareCandidateIds || []);
    if (!compareRecord.currentPositionIds.length) {
      wx.showToast({ title: "当前公告暂无可对比岗位", icon: "none" });
      return;
    }

    executeQuickCompare(api, compareRecord, {
      compareContext: buildNoticeCompareContext(notice, {
        sourceLabel: "首页公告",
        sourceEntry: "home"
      })
    }).then((result) => {
      if (!result || result.status === "empty" || !result.group) {
        wx.showToast({ title: "当前公告暂无可对比岗位", icon: "none" });
        return;
      }

      this.onShow();
      wx.showToast({
        title: buildQuickCompareToastTitle(result),
        icon: "success"
      });
      wx.navigateTo({ url: `/pages/compare/index?groupId=${result.group.id}` });
    }).catch((error) => {
      wx.showToast({ title: error.message, icon: "none" });
    });
  },

  goToNotices() {
    wx.navigateTo({ url: "/pages/notices/index" });
  },

  goToCompare() {
    wx.navigateTo({ url: "/pages/compare/index" });
  },

  openCompareWorkspace() {
    const { compareWorkspace } = this.data;
    if (compareWorkspace && compareWorkspace.groupId) {
      wx.navigateTo({ url: `/pages/compare/index?groupId=${compareWorkspace.groupId}` });
      return;
    }
    this.goToCompare();
  },

  openSavedFilterWorkspace() {
    const { savedFilterWorkspace } = this.data;
    if (savedFilterWorkspace && savedFilterWorkspace.filterId && savedFilterWorkspace.noticeId) {
      wx.navigateTo({
        url: buildSavedFilterPositionsUrl(savedFilterWorkspace.noticeId, savedFilterWorkspace.filterId)
      });
      return;
    }
    this.goToNotices();
  },

  goToMessages() {
    wx.navigateTo({ url: "/pages/messages/index" });
  },

  goToSourceStatus() {
    wx.navigateTo({ url: "/pages/source-status/index" });
  },

  goToReviewCenter() {
    wx.navigateTo({ url: "/pages/review-center/index" });
  }
});
