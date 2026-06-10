const store = require("./store");
const { explainMajorMatch } = require("./major-matcher");
const {
  getNoticeCompareCandidateIds,
  buildNoticeCompareSuggestion
} = require("./notice-compare-guidance");
const {
  buildSourceGateChecks,
  buildGateCheckSummary,
  buildSourcePublishGate,
  buildSourceRiskSummary,
  buildReviewGateChecks,
  buildReviewPriority,
  buildReviewResolutionSuggestion,
  buildReviewReleaseImpact
} = require("./source-ops-guidance");
const {
  NOTICE_STAGE_FLOW_ORDER,
  classifyNoticeStage,
  shouldExpectPositionWorkbookForNotice
} = require("../../../packages/shared/src");

const GATE_CHECK_TYPE_LABELS = {
  "coverage-check": "字段覆盖",
  "field-coverage": "字段覆盖",
  "workbook-check": "工作表识别",
  "workbook-extraction": "附件工作表",
  "download-check": "附件下载",
  "manual-review": "人工复核",
  "dom-structure": "结构变更",
  "parse-quality": "解析质量",
  "dedupe-check": "公告去重",
  "raw-payload": "原始快照",
  "parsed-payload": "解析结果"
};
const GUANGDONG_NOTICE_DEDUPE_SOURCE_IDS = new Set([
  "rsks-gd",
  "ggfw-hrss-gd"
]);
const NOTICE_SOURCE_PRIORITY = {
  "rsks-gd": 20,
  "ggfw-hrss-gd": 10
};

function mapExamTypeLabel(examType) {
  if (examType === "guangdong-provincial") {
    return "广东省考";
  }
  if (examType === "national") {
    return "国考";
  }
  return examType || "未知类型";
}

function mapRunStatusLabel(status) {
  if (status === "published") {
    return "发布成功";
  }
  if (status === "failed") {
    return "校验失败";
  }
  if (status === "error") {
    return "抓取异常";
  }
  if (status === "fetched") {
    return "已抓取待解析";
  }
  return status || "未知状态";
}

function mapSlaStatusLabel(status) {
  if (status === "healthy") {
    return "按 SLA 更新";
  }
  if (status === "warning") {
    return "接近超时";
  }
  if (status === "overdue") {
    return "已超时未更新";
  }
  return "未知";
}

function mapParseQualityLabel(status) {
  if (status === "healthy") {
    return "岗位表稳定";
  }
  if (status === "warning") {
    return "岗位表需关注";
  }
  if (status === "attachment-only") {
    return "仅公告未结构化";
  }
  return "解析状态未知";
}

function isAttachmentOnlyExpected(item = {}) {
  return Boolean(item.attachmentOnlyExpected) || (
    item.parseQualityStatus === "attachment-only" &&
    item.expectedPositionWorkbook === false
  );
}

function isParseIssue(item = {}) {
  return item.parseQualityStatus === "warning" || (
    item.parseQualityStatus === "attachment-only" &&
    !isAttachmentOnlyExpected(item)
  );
}

function mapSourceModeLabel(sourceState) {
  return sourceState.sourceModeLabel || (sourceState.sourceMode === "demo" ? "演示" : "官方");
}

function normalizeGateFailureTypeLabel(check = {}) {
  return (
    GATE_CHECK_TYPE_LABELS[check.id] ||
    check.label ||
    "其他问题"
  );
}

function buildSourceNextAction(sourceState = {}) {
  const publishGate = sourceState.publishGate || buildSourcePublishGate(sourceState);
  const firstFailedCheck = (sourceState.gateChecks || []).find(
    (item) => item.status === "fail" || item.status === "warn"
  ) || null;

  if (publishGate.focus === "review") {
    return {
      focus: "review",
      label: "优先处理复核队列",
      detail: firstFailedCheck
        ? `${firstFailedCheck.label}${firstFailedCheck.detail ? `：${firstFailedCheck.detail}` : ""}`
        : "先处理候选版本复核，再决定是否放量"
    };
  }

  if (publishGate.focus === "parse") {
    return {
      focus: "parse",
      label: "先修正岗位表解析",
      detail: firstFailedCheck
        ? `${firstFailedCheck.label}${firstFailedCheck.detail ? `：${firstFailedCheck.detail}` : ""}`
        : "当前只适合公告模式，岗位表能力暂不开放"
    };
  }

  if (publishGate.focus === "sla") {
    return {
      focus: "sla",
      label: "盯紧本轮时效",
      detail: "当前可继续使用，但需要关注抓取/发布时间是否逼近 SLA"
    };
  }

  if (publishGate.focus === "run") {
    return {
      focus: "run",
      label: "先恢复抓取运行",
      detail: sourceState.rollbackReason || sourceState.gateFailureReason || "本轮运行异常，前台继续保留稳定版本"
    };
  }

  return {
    focus: "",
    label: "维持当前发布节奏",
    detail: "公告和岗位表都满足当前发布条件"
  };
}

function enrichSourceStateWithCurrentNotice(sourceState = {}) {
  if (!sourceState.sourceId) {
    return sourceState;
  }
  const currentNotice = store.listNotices().find((notice) => notice.sourceId === sourceState.sourceId) || null;
  if (!currentNotice) {
    return sourceState;
  }
  const stage = classifyNoticeStage(currentNotice);
  const expectedPositionWorkbook = sourceState.expectedPositionWorkbook !== undefined
    ? Boolean(sourceState.expectedPositionWorkbook)
    : shouldExpectPositionWorkbookForNotice({
      ...currentNotice,
      noticeStageId: stage.id
    });
  return {
    ...sourceState,
    currentNoticeId: sourceState.currentNoticeId || currentNotice.id || "",
    currentNoticeTitle: sourceState.currentNoticeTitle || currentNotice.title || "",
    currentNoticePublishedAt: sourceState.currentNoticePublishedAt || currentNotice.publishedAt || "",
    currentNoticeStageId: sourceState.currentNoticeStageId || stage.id,
    currentNoticeStageLabel: sourceState.currentNoticeStageLabel || stage.label,
    expectedPositionWorkbook,
    attachmentOnlyExpected: Boolean(sourceState.attachmentOnlyExpected) || (
      sourceState.parseQualityStatus === "attachment-only" &&
      expectedPositionWorkbook === false
    )
  };
}

function enrichSourceState(sourceState = {}) {
  sourceState = enrichSourceStateWithCurrentNotice(sourceState);
  const stableVersionLabel = sourceState.stableVersionLabel || sourceState.lastPublishedVersionLabel || (
    sourceState.lastPublishedAt ? `${sourceState.lastPublishedAt} 稳定快照` : ""
  );
  const gateChecks = buildSourceGateChecks(sourceState);
  const normalized = {
    ...sourceState,
    lastSuccessfulFetchedAt: sourceState.lastSuccessfulFetchedAt || sourceState.lastFetchedAt || "",
    candidateVersionId: sourceState.candidateVersionId || "",
    candidateVersionLabel: sourceState.candidateVersionLabel || "",
    candidateVersionCreatedAt: sourceState.candidateVersionCreatedAt || sourceState.lastRunFinishedAt || sourceState.lastFetchedAt || "",
    stableVersionId: sourceState.stableVersionId || sourceState.lastPublishedVersionId || "",
    stableVersionLabel,
    stableVersionUpdatedAt: sourceState.stableVersionUpdatedAt || sourceState.lastPublishedAt || "",
    rollbackToVersionId: sourceState.rollbackToVersionId || sourceState.stableVersionId || "",
    rollbackToVersionLabel: sourceState.rollbackToVersionLabel || stableVersionLabel,
    gateFailureReason: sourceState.gateFailureReason || "",
    rollbackReason: sourceState.rollbackReason || "",
    gateChecks,
    gateCheckSummary: buildGateCheckSummary(gateChecks),
    examTypeLabel: mapExamTypeLabel(sourceState.examType),
    sourceModeLabel: mapSourceModeLabel(sourceState),
    runStatusLabel: mapRunStatusLabel(sourceState.lastRunStatus),
    slaStatusLabel: mapSlaStatusLabel(sourceState.slaStatus),
    parseQualityLabel: mapParseQualityLabel(sourceState.parseQualityStatus)
  };
  const publishGate = buildSourcePublishGate(normalized);
  const releaseMode = sourceState.releaseMode || (publishGate.status === "healthy" ? "positions-open" : "notice-only");
  const riskSummary = buildSourceRiskSummary(normalized);
  return {
    ...normalized,
    publishGate,
    publishGateStatus: sourceState.publishGateStatus || publishGate.status || "",
    publishGateLabel: sourceState.publishGateLabel || publishGate.label || "",
    publishGateDetail: sourceState.publishGateDetail || publishGate.detail || "",
    publishGateTone: sourceState.publishGateTone || publishGate.tone || "",
    publishGateFocus: sourceState.publishGateFocus || publishGate.focus || "",
    riskSummary,
    releaseMode,
    nextAction: buildSourceNextAction({
      ...normalized,
      publishGate,
      releaseMode,
      riskSummary
    })
  };
}

function buildReviewPayloadStatusLabel(reviewItem = {}) {
  return `原始快照：${reviewItem.hasRawPayload ? "有" : "无"} · 解析结果：${reviewItem.hasParsedPayload ? "有" : "无"}`;
}

function buildReviewBlockingRelease(reviewItem = {}) {
  if (!reviewItem.hasRawPayload || !reviewItem.hasParsedPayload) {
    return true;
  }
  if (reviewItem.parseStatus === "attachment-only") {
    return !isAttachmentOnlyExpected(reviewItem);
  }
  return Number(reviewItem.fieldCoveragePercent || 0) > 0 && Number(reviewItem.fieldCoveragePercent || 0) < 90;
}

function enrichReviewItem(reviewItem = {}) {
  const priority = reviewItem.priority || buildReviewPriority(reviewItem);
  const gateChecks = buildReviewGateChecks(reviewItem);
  return {
    ...reviewItem,
    payloadStatusLabel: buildReviewPayloadStatusLabel(reviewItem),
    candidateVersionId: reviewItem.candidateVersionId || "",
    candidateVersionLabel: reviewItem.candidateVersionLabel || "",
    candidateVersionCreatedAt: reviewItem.candidateVersionCreatedAt || reviewItem.createdAt || "",
    rollbackToVersionId: reviewItem.rollbackToVersionId || "",
    rollbackToVersionLabel: reviewItem.rollbackToVersionLabel || "",
    gateChecks,
    gateCheckSummary: buildGateCheckSummary(gateChecks),
    priority,
    resolutionSuggestion: reviewItem.resolutionSuggestion || buildReviewResolutionSuggestion(reviewItem),
    releaseImpact: reviewItem.releaseImpact || buildReviewReleaseImpact(reviewItem),
    blockingRelease: buildReviewBlockingRelease(reviewItem)
  };
}

function sortReviewItems(reviewItems = []) {
  return reviewItems.slice().sort((left, right) => {
    const scoreGap = Number((right.priority && right.priority.score) || 0) - Number((left.priority && left.priority.score) || 0);
    if (scoreGap !== 0) {
      return scoreGap;
    }
    return String(right.createdAt || right.resolvedAt || "").localeCompare(String(left.createdAt || left.resolvedAt || ""));
  });
}

function buildGateFailureTypeSummary(items = []) {
  const counts = {};
  (items || []).forEach((item) => {
    const firstBlockingCheck = (item.gateChecks || []).find(
      (check) => check.status === "fail" || check.status === "warn"
    );
    if (!firstBlockingCheck) {
      return;
    }
    const label = normalizeGateFailureTypeLabel(firstBlockingCheck);
    counts[label] = (counts[label] || 0) + 1;
  });

  return Object.keys(counts)
    .map((label) => ({ label, count: counts[label] }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function buildSourceSummary(sourceStates = [], alertEvents = [], fallbackStats = {}) {
  return {
    sourceCount: fallbackStats.sourceCount !== undefined ? fallbackStats.sourceCount : sourceStates.length,
    sourceAlertCount: fallbackStats.sourceAlertCount !== undefined ? fallbackStats.sourceAlertCount : sourceStates.filter(
      (item) =>
        Number(item.consecutiveFailureCount || 0) > 0 ||
        Number(item.pendingReviewCount || 0) > 0 ||
        Boolean(item.structureAlert) ||
        Boolean(item.fetchOverdue) ||
        Boolean(item.publishOverdue)
    ).length,
    overdueSourceCount: fallbackStats.overdueSourceCount !== undefined ? fallbackStats.overdueSourceCount : sourceStates.filter(
      (item) => Boolean(item.fetchOverdue) || Boolean(item.publishOverdue)
    ).length,
    pendingReviewTotal: fallbackStats.pendingReviewTotal !== undefined ? fallbackStats.pendingReviewTotal : sourceStates.reduce(
      (sum, item) => sum + Number(item.pendingReviewCount || 0),
      0
    ),
    alertEventCount: fallbackStats.alertEventCount !== undefined ? fallbackStats.alertEventCount : alertEvents.length,
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
        item.publishGate.status === "review"
      )
    ).length,
    rollbackCount: sourceStates.filter(
      (item) => item.publishGate && item.publishGate.status === "rollback"
    ).length,
    gateFailureTypeSummary: buildGateFailureTypeSummary(sourceStates)
  };
}

function buildReviewSummary(reviewQueue = [], resolvedReviewQueue = [], fallbackStats = {}) {
  return {
    total: fallbackStats.pendingReviewTotal !== undefined ? fallbackStats.pendingReviewTotal : reviewQueue.length,
    resolved: fallbackStats.resolvedReviewTotal !== undefined ? fallbackStats.resolvedReviewTotal : resolvedReviewQueue.length,
    highPriority: reviewQueue.filter((item) => item.priority && item.priority.level === "high").length,
    blockingRelease: reviewQueue.filter((item) => item.blockingRelease).length,
    failedCheckTypeSummary: buildGateFailureTypeSummary(reviewQueue)
  };
}

function deriveSourceIdFromNotice(notice) {
  if (!notice) {
    return "";
  }
  if (notice.sourceId) {
    return notice.sourceId;
  }
  const noticeId = String(notice.id || "");
  return noticeId.includes("|") ? noticeId.split("|")[0] : "";
}

function getSourceStateByNotice(notice) {
  const sourceId = deriveSourceIdFromNotice(notice);
  if (!sourceId) {
    return null;
  }
  return store.listSourceStates().find((item) => item.sourceId === sourceId) || null;
}

function mapTrustLabel(parseQualityStatus, options = {}) {
  if (parseQualityStatus === "healthy") {
    return "结构化稳定";
  }
  if (parseQualityStatus === "warning") {
    return "结构化需关注";
  }
  if (parseQualityStatus === "attachment-only") {
    if (options.attachmentOnlyExpected) {
      return "阶段公告追踪";
    }
    return "仅公告未结构化";
  }
  return "结构化状态未知";
}

function mapTrustSummary(notice, sourceState) {
  const attachmentOnlyExpected = Boolean(notice && notice.attachmentOnlyExpected) || (
    sourceState &&
    sourceState.parseQualityStatus === "attachment-only" &&
    sourceState.expectedPositionWorkbook === false
  );
  if (attachmentOnlyExpected) {
    const stageLabel = (notice && notice.noticeStageLabel) || (sourceState && sourceState.currentNoticeStageLabel) || "当前";
    return `${stageLabel}阶段以流程追踪为主，官方公告本身通常不包含岗位表，当前不开放选岗和岗位对比。`;
  }
  if (sourceState && sourceState.parseQualitySummary) {
    return sourceState.parseQualitySummary;
  }
  if (notice && notice.hasStructuredPositions) {
    return "当前岗位数据已结构化，可用于筛选、推荐和岗位对比。";
  }
  return "当前仅展示公告与附件信息，岗位表尚未形成稳定结构化结果。";
}

function buildNoticeTrust(notice) {
  if (!notice) {
    return null;
  }

  const rawSourceState = getSourceStateByNotice(notice);
  const sourceState = rawSourceState ? enrichSourceState(rawSourceState) : null;
  const expectedPositionWorkbook = notice.expectedPositionWorkbook !== undefined
    ? Boolean(notice.expectedPositionWorkbook)
    : shouldExpectPositionWorkbookForNotice(notice);
  const attachmentOnlyExpected = Boolean(notice.attachmentOnlyExpected) || (
    !notice.hasStructuredPositions &&
    expectedPositionWorkbook === false
  ) || (
    sourceState &&
    sourceState.parseQualityStatus === "attachment-only" &&
    sourceState.expectedPositionWorkbook === false
  );
  const parseQualityStatus = sourceState && sourceState.parseQualityStatus
    ? sourceState.parseQualityStatus
    : notice.hasStructuredPositions
      ? "healthy"
      : "attachment-only";

  return {
    sourceId: sourceState ? sourceState.sourceId : deriveSourceIdFromNotice(notice),
    sourceName: (sourceState && sourceState.sourceName) || notice.source || "",
    sourceModeLabel: (sourceState && sourceState.sourceModeLabel) || notice.sourceModeLabel || "",
    parseQualityStatus,
    parseQualitySummary: mapTrustSummary(notice, sourceState),
    trustLabel: mapTrustLabel(parseQualityStatus, { attachmentOnlyExpected }),
    expectedPositionWorkbook,
    attachmentOnlyExpected,
    fieldCoveragePercent: Number((sourceState && sourceState.fieldCoveragePercent) || 0),
    workbookSheetSummary: (sourceState && sourceState.workbookSheetSummary) || "",
    lastSuccessfulFetchedAt: (sourceState && sourceState.lastSuccessfulFetchedAt) || "",
    lastPublishedAt: (sourceState && sourceState.lastPublishedAt) || "",
    publishGateStatus: (sourceState && sourceState.publishGateStatus) || "",
    publishGateLabel: (sourceState && sourceState.publishGateLabel) || "",
    publishGateDetail: (sourceState && sourceState.publishGateDetail) || "",
    publishGateFocus: (sourceState && sourceState.publishGateFocus) || "",
    runStatusLabel: (sourceState && sourceState.runStatusLabel) || "",
    riskSummary: (sourceState && sourceState.riskSummary) || ""
  };
}

function enrichNotice(notice) {
  if (!notice) {
    return null;
  }

  const stage = classifyNoticeStage(notice);
  const expectedPositionWorkbook = notice.expectedPositionWorkbook !== undefined
    ? Boolean(notice.expectedPositionWorkbook)
    : shouldExpectPositionWorkbookForNotice({
      ...notice,
      noticeStageId: stage.id
    });
  return {
    ...notice,
    noticeStageId: stage.id,
    noticeStageLabel: stage.label,
    noticeStagePriority: stage.priority,
    expectedPositionWorkbook,
    attachmentOnlyExpected: Boolean(notice.attachmentOnlyExpected) || (
      !notice.hasStructuredPositions &&
      expectedPositionWorkbook === false
    )
  };
}

function extractNoticeYear(notice) {
  if (!notice) {
    return "";
  }

  const titleMatch = String(notice.title || "").match(/(20\d{2})年/);
  if (titleMatch) {
    return titleMatch[1];
  }

  const publishedAtMatch = String(notice.publishedAt || "").match(/(20\d{2})/);
  return publishedAtMatch ? publishedAtMatch[1] : "";
}

function buildSourceStateMap() {
  return store.listSourceStates().reduce((result, item) => {
    if (item && item.sourceId) {
      result[item.sourceId] = item;
    }
    return result;
  }, {});
}

function normalizeNoticeDedupeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[\s\u3000"'`~!@#$%^&*()\-_=+\[\]{}\\|;:,.<>/?，。！？、；：（）【】《》“”‘’]/g, "");
}

function shouldDedupeGuangdongNotice(notice) {
  return Boolean(
    notice &&
    notice.examType === "guangdong-provincial" &&
    GUANGDONG_NOTICE_DEDUPE_SOURCE_IDS.has(String(notice.sourceId || ""))
  );
}

function buildNoticeDedupeKey(notice) {
  if (!shouldDedupeGuangdongNotice(notice)) {
    return "";
  }

  const year = extractNoticeYear(notice);
  const stageId = String(notice.noticeStageId || "");
  const normalizedTitle = normalizeNoticeDedupeTitle(notice.title);
  if (!year || !stageId || !normalizedTitle) {
    return "";
  }

  return `${notice.examType}|${year}|${stageId}|${normalizedTitle}`;
}

function scoreCanonicalNoticeCandidate(notice, sourceStateMap = {}) {
  if (!notice) {
    return Number.NEGATIVE_INFINITY;
  }

  const sourceState = sourceStateMap[notice.sourceId] || {};
  let score = 0;

  if (notice.hasStructuredPositions) {
    score += 100000;
  }
  if (sourceState.parseQualityStatus === "healthy") {
    score += 5000;
  } else if (sourceState.parseQualityStatus === "warning") {
    score += 1000;
  }
  if (sourceState.releaseMode === "positions-open") {
    score += 3000;
  }

  score += Math.min(Number(notice.positionCount || 0), 50000);
  score += Math.min(Number(sourceState.fieldCoveragePercent || 0), 100);
  score += NOTICE_SOURCE_PRIORITY[notice.sourceId] || 0;
  return score;
}

function compareCanonicalNoticeCandidates(left, right, sourceStateMap = {}) {
  const scoreGap = scoreCanonicalNoticeCandidate(right, sourceStateMap) - scoreCanonicalNoticeCandidate(left, sourceStateMap);
  if (scoreGap !== 0) {
    return scoreGap;
  }

  const publishedDiff = String(right.publishedAt || "").localeCompare(String(left.publishedAt || ""));
  if (publishedDiff !== 0) {
    return publishedDiff;
  }

  return String(left.id || "").localeCompare(String(right.id || ""));
}

function buildMergedNoticeSourceEntries(notices = [], sourceStateMap = {}) {
  return notices.map((notice) => {
    const sourceState = sourceStateMap[notice.sourceId] || {};
    return {
      noticeId: notice.id,
      sourceId: notice.sourceId || "",
      sourceName: notice.source || sourceState.sourceName || "",
      publishedAt: notice.publishedAt || "",
      hasStructuredPositions: Boolean(notice.hasStructuredPositions),
      positionCount: Number(notice.positionCount || 0),
      parseQualityStatus: sourceState.parseQualityStatus || "",
      releaseMode: sourceState.releaseMode || "",
      url: notice.url || ""
    };
  });
}

function mergeNoticeGroup(notices = [], sourceStateMap = {}) {
  if (!Array.isArray(notices) || notices.length === 0) {
    return null;
  }

  const ranked = notices.slice().sort((left, right) => compareCanonicalNoticeCandidates(left, right, sourceStateMap));
  const primaryNotice = ranked[0];
  const positionNotice = ranked.find((item) => item.hasStructuredPositions) || primaryNotice;
  const publishedCandidates = ranked
    .map((item) => String(item.publishedAt || "").trim())
    .filter(Boolean)
    .sort();

  return {
    ...primaryNotice,
    publishedAt: publishedCandidates[0] || primaryNotice.publishedAt || "",
    hasStructuredPositions: Boolean(positionNotice.hasStructuredPositions),
    positionCount: Number(positionNotice.positionCount || primaryNotice.positionCount || 0),
    aliasNoticeIds: ranked.map((item) => item.id),
    mergedSourceIds: Array.from(new Set(ranked.map((item) => item.sourceId).filter(Boolean))),
    mergedSourceCount: ranked.length,
    mergedSources: buildMergedNoticeSourceEntries(ranked, sourceStateMap),
    primarySourceId: primaryNotice.sourceId || "",
    positionNoticeId: positionNotice.id,
    positionSourceId: positionNotice.sourceId || "",
    positionSourceName: positionNotice.source || ""
  };
}

function buildNoticeDirectory() {
  const rawNotices = store.listNotices().map(enrichNotice);
  const sourceStateMap = buildSourceStateMap();
  const groups = [];
  const groupByKey = new Map();

  rawNotices.forEach((notice) => {
    const dedupeKey = buildNoticeDedupeKey(notice);
    if (!dedupeKey) {
      groups.push([notice]);
      return;
    }

    if (!groupByKey.has(dedupeKey)) {
      const nextGroup = [];
      groupByKey.set(dedupeKey, nextGroup);
      groups.push(nextGroup);
    }

    groupByKey.get(dedupeKey).push(notice);
  });

  const notices = [];
  const byId = {};
  const aliasToCanonicalId = {};

  groups.forEach((group) => {
    const mergedNotice = mergeNoticeGroup(group, sourceStateMap);
    if (!mergedNotice) {
      return;
    }

    notices.push(mergedNotice);
    byId[mergedNotice.id] = mergedNotice;
    (mergedNotice.aliasNoticeIds || [mergedNotice.id]).forEach((noticeId) => {
      aliasToCanonicalId[noticeId] = mergedNotice.id;
    });
  });

  return {
    notices,
    byId,
    aliasToCanonicalId
  };
}

function resolveCanonicalNoticeId(noticeId, noticeDirectory = buildNoticeDirectory()) {
  const directory = noticeDirectory && noticeDirectory.aliasToCanonicalId
    ? noticeDirectory
    : buildNoticeDirectory();
  return directory.aliasToCanonicalId[noticeId] || noticeId;
}

function getCanonicalNoticeById(noticeId, noticeDirectory = buildNoticeDirectory()) {
  const directory = noticeDirectory && noticeDirectory.byId
    ? noticeDirectory
    : buildNoticeDirectory();
  const canonicalId = resolveCanonicalNoticeId(noticeId, directory);
  return directory.byId[canonicalId] || null;
}

function getCanonicalNoticeAliasIds(noticeId, noticeDirectory = buildNoticeDirectory()) {
  const notice = getCanonicalNoticeById(noticeId, noticeDirectory);
  return notice ? (notice.aliasNoticeIds || [notice.id]) : [noticeId];
}

function listFavoriteCanonicalNoticeIds(noticeDirectory = buildNoticeDirectory()) {
  const seen = new Set();
  return store.listFavoriteNoticeIds()
    .map((noticeId) => resolveCanonicalNoticeId(noticeId, noticeDirectory))
    .filter((noticeId) => {
      if (!noticeId || seen.has(noticeId)) {
        return false;
      }
      seen.add(noticeId);
      return true;
    });
}

function isFavoriteCanonicalNotice(noticeId, noticeDirectory = buildNoticeDirectory()) {
  const aliasIds = new Set(getCanonicalNoticeAliasIds(noticeId, noticeDirectory));
  return store.listFavoriteNoticeIds().some((favoriteId) => aliasIds.has(favoriteId));
}

function getMergedNoticePositions(noticeId, noticeDirectory = buildNoticeDirectory()) {
  const notice = getCanonicalNoticeById(noticeId, noticeDirectory);
  if (!notice) {
    return [];
  }

  return store.getPositionsByNoticeId(notice.positionNoticeId || notice.id);
}

function buildNoticeBatch(notice) {
  if (!notice) {
    return null;
  }

  const year = extractNoticeYear(notice);
  const examType = String(notice.examType || "");
  if (!year || !examType) {
    return null;
  }

  return {
    key: `${examType}:${year}`,
    year,
    examType,
    label: `${year}年${notice.area || examType}批次`
  };
}

function getNoticeTimelineSortValue(notice) {
  return NOTICE_STAGE_FLOW_ORDER[notice.noticeStageId] || NOTICE_STAGE_FLOW_ORDER.general;
}

function compareTimelineNotice(left, right) {
  const stageOrderDiff = getNoticeTimelineSortValue(left) - getNoticeTimelineSortValue(right);
  if (stageOrderDiff !== 0) {
    return stageOrderDiff;
  }

  const publishedDiff = String(left.publishedAt || "").localeCompare(String(right.publishedAt || ""));
  if (publishedDiff !== 0) {
    return publishedDiff;
  }

  return String(left.title || "").localeCompare(String(right.title || ""));
}

function buildNoticeProgressSummary(noticeTimeline, currentNoticeId) {
  const timeline = Array.isArray(noticeTimeline) ? noticeTimeline : [];
  const currentIndex = timeline.findIndex((item) => item.id === currentNoticeId);
  const currentNotice = currentIndex >= 0 ? timeline[currentIndex] : null;
  const followingNotices = currentIndex >= 0 ? timeline.slice(currentIndex + 1) : [];
  const previousNotices = currentIndex > 0 ? timeline.slice(0, currentIndex) : [];
  const followingStageLabels = Array.from(new Set(
    followingNotices.map((item) => item.noticeStageLabel).filter(Boolean)
  ));

  if (followingNotices.length > 0) {
    return {
      currentStageLabel: currentNotice ? currentNotice.noticeStageLabel : "",
      relatedNoticeCount: Math.max(timeline.length - 1, 0),
      followingNoticeCount: followingNotices.length,
      followingStageLabels,
      progressHint: `本批后续 ${followingNotices.length} 条`,
      progressDetail: followingStageLabels.length
        ? `后续节点：${followingStageLabels.join("、")}`
        : "后续节点已进入同批公告链"
    };
  }

  if (previousNotices.length > 0) {
    return {
      currentStageLabel: currentNotice ? currentNotice.noticeStageLabel : "",
      relatedNoticeCount: Math.max(timeline.length - 1, 0),
      followingNoticeCount: 0,
      followingStageLabels: [],
      progressHint: `本批已识别 ${timeline.length} 条公告`,
      progressDetail: "当前位于已识别公告链的最新节点"
    };
  }

  return {
    currentStageLabel: currentNotice ? currentNotice.noticeStageLabel : "",
    relatedNoticeCount: 0,
    followingNoticeCount: 0,
    followingStageLabels: [],
    progressHint: "当前批次仅识别 1 条公告",
    progressDetail: "后续节点会在官方发布后持续补齐"
  };
}

function buildRelatedNotices(notice, noticePool) {
  if (!notice) {
    return {
      noticeBatch: null,
      noticeTimeline: [],
      relatedNotices: []
    };
  }

  const noticeBatch = buildNoticeBatch(notice);
  const timelineSource = Array.isArray(noticePool) ? noticePool : [];
  const noticeTimeline = timelineSource
    .filter((item) => {
      if (!noticeBatch) {
        return item.id === notice.id;
      }
      const itemBatch = buildNoticeBatch(item);
      return Boolean(itemBatch) && itemBatch.key === noticeBatch.key;
    })
    .sort(compareTimelineNotice)
    .map((item) => ({
      ...item,
      isCurrent: item.id === notice.id
    }));
  const progress = buildNoticeProgressSummary(noticeTimeline, notice.id);

  return {
    noticeBatch,
    noticeTimeline,
    relatedNotices: noticeTimeline.filter((item) => !item.isCurrent),
    noticeProgress: progress
  };
}

function buildProgressReminderPreferenceMap() {
  return store.getProgressReminderOptions().reduce((result, item) => {
    result[item.stageId] = item.id;
    return result;
  }, {});
}

function enrichNoticeWithBatchSummary(notice, noticePool) {
  const enrichedNotice = notice && notice.noticeStageId ? notice : enrichNotice(notice);
  if (!enrichedNotice) {
    return null;
  }

  const { noticeBatch, noticeTimeline, relatedNotices, noticeProgress } = buildRelatedNotices(enrichedNotice, noticePool);
  return {
    ...enrichedNotice,
    noticeBatch,
    noticeTimelineCount: noticeTimeline.length,
    relatedNoticeCount: relatedNotices.length,
    followingNoticeCount: noticeProgress.followingNoticeCount,
    followingStageLabels: noticeProgress.followingStageLabels,
    noticeProgressHint: noticeProgress.progressHint,
    noticeProgressDetail: noticeProgress.progressDetail
  };
}

function listBaseEnrichedNotices() {
  return buildNoticeDirectory().notices;
}

function attachNoticeTrustToPosition(position, noticeDirectory = buildNoticeDirectory()) {
  const notice = getCanonicalNoticeById(position.noticeId, noticeDirectory);
  return {
    ...position,
    rawNoticeId: position.noticeId,
    noticeId: (notice && notice.id) || position.noticeId,
    noticeTitle: (notice && notice.title) || position.sourceNoticeTitle || "",
    noticeStageId: (notice && notice.noticeStageId) || "",
    noticeStageLabel: (notice && notice.noticeStageLabel) || "",
    noticePublishedAt: (notice && notice.publishedAt) || "",
    noticeArea: (notice && notice.area) || position.area || "",
    sourceId: (notice && notice.sourceId) || position.sourceId || "",
    sourceName: (notice && notice.source) || position.sourceName || "",
    mergedSourceCount: Number((notice && notice.mergedSourceCount) || 0),
    mergedSources: (notice && Array.isArray(notice.mergedSources)) ? notice.mergedSources : [],
    primarySourceId: (notice && notice.primarySourceId) || "",
    positionNoticeId: (notice && notice.positionNoticeId) || "",
    positionSourceId: (notice && notice.positionSourceId) || "",
    positionSourceName: (notice && notice.positionSourceName) || ((notice && notice.source) || position.sourceName || ""),
    noticeTrust: buildNoticeTrust(notice)
  };
}

function normalizeCompareValue(value) {
  if (value === undefined || value === null || value === "") {
    return "未注明";
  }
  return String(value);
}

function normalizeCompareHeadcount(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isOpenCompareRequirement(value) {
  const text = normalizeCompareValue(value);
  return text === "不限" || text === "未注明";
}

function normalizeComparePersonalProfile(profile = {}) {
  return {
    education: String(profile.education || "").trim(),
    degree: String(profile.degree || "").trim(),
    majorKeywords: String(profile.majorKeywords || "").trim(),
    politicalStatus: String(profile.politicalStatus || "").trim(),
    serviceExperience: ["", "has", "none"].includes(String(profile.serviceExperience || ""))
      ? String(profile.serviceExperience || "")
      : "",
    freshGraduateStatus: ["", "fresh", "non-fresh"].includes(String(profile.freshGraduateStatus || ""))
      ? String(profile.freshGraduateStatus || "")
      : ""
  };
}

function hasComparePersonalProfile(profile = {}) {
  const normalized = normalizeComparePersonalProfile(profile);
  return Boolean(
    normalized.education ||
    normalized.degree ||
    normalized.majorKeywords ||
    normalized.politicalStatus ||
    normalized.serviceExperience ||
    normalized.freshGraduateStatus
  );
}

function includesCompareKeyword(text, keyword) {
  return String(text || "").toLowerCase().includes(String(keyword || "").toLowerCase());
}

function evaluatePositionEligibilitySummary(position, profile = {}) {
  const normalizedProfile = normalizeComparePersonalProfile(profile);
  const active = hasComparePersonalProfile(normalizedProfile);

  if (!active) {
    return {
      eligibilityActive: false,
      mismatchCount: 0,
      mismatchReasons: [],
      isFullyMatched: true
    };
  }

  const mismatchReasons = [];
  const addMismatch = (reason) => {
    mismatchReasons.push(reason);
  };

  const education = normalizeCompareValue(position.education);
  if (
    normalizedProfile.education &&
    !isOpenCompareRequirement(education) &&
    !includesCompareKeyword(education, normalizedProfile.education)
  ) {
    addMismatch("学历要求不匹配");
  }

  const degree = normalizeCompareValue(position.degree);
  if (
    normalizedProfile.degree &&
    !isOpenCompareRequirement(degree) &&
    !includesCompareKeyword(degree, normalizedProfile.degree)
  ) {
    addMismatch("学位要求不匹配");
  }

  const major = normalizeCompareValue(position.major);
  const hasMajorRequirement = !isOpenCompareRequirement(major) || (
    Array.isArray(position.majorCodes) && position.majorCodes.length > 0
  );
  const majorMatched = normalizedProfile.majorKeywords && hasMajorRequirement
    ? explainMajorMatch(
      {
        majorRequirement: position.major,
        majorCodes: position.majorCodes
      },
      normalizedProfile.majorKeywords
    ).matched
    : false;
  if (normalizedProfile.majorKeywords && hasMajorRequirement && !majorMatched) {
    addMismatch("专业要求不匹配");
  }

  const politicalStatus = normalizeCompareValue(position.politicalStatus);
  if (
    normalizedProfile.politicalStatus &&
    !isOpenCompareRequirement(politicalStatus) &&
    !includesCompareKeyword(politicalStatus, normalizedProfile.politicalStatus)
  ) {
    addMismatch("政治面貌要求不匹配");
  }

  if (normalizedProfile.serviceExperience === "none" && !isOpenCompareRequirement(position.serviceRequirement)) {
    addMismatch("缺少岗位要求的基层经历");
  }

  if (normalizedProfile.freshGraduateStatus === "non-fresh" && position.freshGraduateOnly) {
    addMismatch("该岗位仅限应届报考");
  }

  return {
    eligibilityActive: true,
    mismatchCount: mismatchReasons.length,
    mismatchReasons,
    isFullyMatched: mismatchReasons.length === 0
  };
}

function scoreComparePositionSummary(position) {
  let score = 50;
  let barrierCount = 0;
  const opportunityReasons = [];
  const cautionReasons = [];
  const headcount = normalizeCompareHeadcount(position.headcount);
  const trustStatus = position.noticeTrust ? position.noticeTrust.parseQualityStatus : "";

  if (headcount >= 3) {
    score += 15;
    opportunityReasons.push("招录人数更高");
  } else if (headcount === 2) {
    score += 10;
    opportunityReasons.push("招录人数较充足");
  } else if (headcount === 1) {
    score += 4;
    opportunityReasons.push("至少有明确名额");
  }

  if (isOpenCompareRequirement(position.serviceRequirement)) {
    score += 12;
    opportunityReasons.push("基层经历限制较少");
  } else {
    score -= 12;
    barrierCount += 1;
    cautionReasons.push("基层经历要求更严格");
  }

  if (position.freshGraduateOnly) {
    score -= 10;
    barrierCount += 1;
    cautionReasons.push("仅限应届");
  } else {
    score += 8;
    opportunityReasons.push("不限应届身份");
  }

  if (isOpenCompareRequirement(position.politicalStatus)) {
    score += 8;
    opportunityReasons.push("政治面貌限制较少");
  } else {
    score -= 8;
    barrierCount += 1;
    cautionReasons.push("政治面貌要求更严格");
  }

  const education = normalizeCompareValue(position.education);
  if (education.includes("本科")) {
    score += 8;
    opportunityReasons.push("学历门槛相对友好");
  } else if (education.includes("研究生") || education.includes("硕士") || education.includes("博士")) {
    score -= 8;
    barrierCount += 1;
    cautionReasons.push("学历门槛更高");
  }

  const degree = normalizeCompareValue(position.degree);
  if (degree.includes("学士") || degree === "不限" || degree === "未注明") {
    score += 5;
    opportunityReasons.push("学位要求较宽松");
  } else if (degree.includes("硕士") || degree.includes("博士")) {
    score -= 5;
    barrierCount += 1;
    cautionReasons.push("学位要求更高");
  }

  const notes = normalizeCompareValue(position.notes);
  if (notes === "未注明" || notes === "不限") {
    score += 5;
    opportunityReasons.push("附加要求较少");
  } else {
    score -= 6;
    barrierCount += 1;
    cautionReasons.push("附加要求较多");
  }

  if (trustStatus === "healthy") {
    score += 8;
    opportunityReasons.push("结构化质量稳定");
  } else if (trustStatus === "warning") {
    score -= 4;
    cautionReasons.push("结构化结果需复核");
  } else if (trustStatus === "attachment-only") {
    score -= 12;
    cautionReasons.push("仅公告未结构化");
  }

  const finalScore = Math.max(0, Math.min(100, score));
  let ruleLabel = "条件较严";
  if (finalScore >= 70) {
    ruleLabel = "机会优先";
  } else if (finalScore >= 55) {
    ruleLabel = "可以重点看";
  }

  return {
    ruleScore: finalScore,
    ruleLabel,
    ruleScoreLabel: `${finalScore} 分`,
    barrierCount,
    opportunityReasons,
    cautionReasons
  };
}

function buildCompareGroupSummary(group, positions = [], personalProfile = {}) {
  const active = hasComparePersonalProfile(personalProfile);
  if (!group) {
    return {
      active,
      positionCount: 0,
      matchedCount: 0,
      blockedCount: 0,
      cautionCount: 0,
      barrierCountTotal: 0,
      topTitle: "",
      topAgency: "",
      topLabel: "",
      topScoreLabel: "",
      topReason: "",
      bestFitTitle: "",
      bestFitLabel: "",
      bestFitReason: ""
    };
  }

  const scored = (positions || []).map((position) => {
    const eligibility = evaluatePositionEligibilitySummary(position, personalProfile);
    const rule = scoreComparePositionSummary(position);
    return {
      ...position,
      ...eligibility,
      ...rule
    };
  });

  if (!scored.length) {
    return {
      active,
      positionCount: 0,
      matchedCount: 0,
      blockedCount: 0,
      cautionCount: 0,
      barrierCountTotal: 0,
      topTitle: "",
      topAgency: "",
      topLabel: "",
      topScoreLabel: "",
      topReason: "",
      bestFitTitle: "",
      bestFitLabel: "",
      bestFitReason: ""
    };
  }

  const top = scored.slice().sort((left, right) => {
    const ruleGap = Number(right.ruleScore || 0) - Number(left.ruleScore || 0);
    if (ruleGap !== 0) {
      return ruleGap;
    }
    return Number(left.barrierCount || 0) - Number(right.barrierCount || 0);
  })[0];
  const bestFit = active
    ? scored.slice().sort((left, right) => {
      const mismatchGap = Number(left.mismatchCount || 0) - Number(right.mismatchCount || 0);
      if (mismatchGap !== 0) {
        return mismatchGap;
      }
      return Number(right.ruleScore || 0) - Number(left.ruleScore || 0);
    })[0]
    : null;

  return {
    active,
    positionCount: scored.length,
    matchedCount: active ? scored.filter((item) => item.isFullyMatched).length : 0,
    blockedCount: active ? scored.filter((item) => item.mismatchCount > 0).length : 0,
    cautionCount: scored.filter((item) => Number(item.ruleScore || 0) < 55).length,
    barrierCountTotal: scored.reduce((sum, item) => sum + Number(item.barrierCount || 0), 0),
    topTitle: top.title || "",
    topAgency: top.agency || "",
    topLabel: top.ruleLabel || "",
    topScoreLabel: top.ruleScoreLabel || "",
    topReason: top.opportunityReasons[0] || top.cautionReasons[0] || "",
    bestFitTitle: bestFit ? bestFit.title || "" : "",
    bestFitLabel: bestFit
      ? (bestFit.mismatchCount ? `${bestFit.mismatchCount} 项待确认` : "当前最匹配")
      : "",
    bestFitReason: bestFit
      ? (
        bestFit.mismatchCount
          ? (bestFit.mismatchReasons[0] || "")
          : (bestFit.opportunityReasons[0] || "")
      )
      : ""
  };
}

function decorateCompareGroup(group, personalProfile = store.getPersonalProfile()) {
  if (!group) {
    return null;
  }
  const noticeDirectory = buildNoticeDirectory();
  const positions = store.getComparePositions(group.id).map((item) => attachNoticeTrustToPosition(item, noticeDirectory));
  return {
    ...group,
    compareSummary: buildCompareGroupSummary(group, positions, personalProfile)
  };
}

function groupPositionsByNoticeId(positions = [], noticeDirectory = buildNoticeDirectory()) {
  return (positions || []).reduce((result, item) => {
    const noticeId = item && item.noticeId
      ? resolveCanonicalNoticeId(item.noticeId, noticeDirectory)
      : "";
    if (!noticeId) {
      return result;
    }
    if (!result[noticeId]) {
      result[noticeId] = [];
    }
    result[noticeId].push(item);
    return result;
  }, {});
}

function buildNoticeCompareMetadata(notice, positions = [], compareGroups = store.listCompareGroups()) {
  const noticeCompareCandidateIds = getNoticeCompareCandidateIds(positions);
  return {
    noticeCompareCandidateIds,
    noticeCompareSuggestion: buildNoticeCompareSuggestion(notice, positions, compareGroups)
  };
}

function listNotices() {
  const noticeDirectory = buildNoticeDirectory();
  const baseNotices = noticeDirectory.notices;
  const compareGroups = store.listCompareGroups();
  const positionsByNoticeId = groupPositionsByNoticeId(store.listPositions(), noticeDirectory);
  return baseNotices.map((item) => {
    const notice = enrichNoticeWithBatchSummary(item, baseNotices);
    const compareMetadata = buildNoticeCompareMetadata(
      notice,
      positionsByNoticeId[notice.id] || [],
      compareGroups
    );
    return {
      ...notice,
      noticeTrust: buildNoticeTrust(notice),
      ...compareMetadata
    };
  });
}

function listSourceStates() {
  return store.listSourceStates().map(enrichSourceState);
}

function listReviewQueue() {
  return sortReviewItems(store.listReviewQueue().map(enrichReviewItem));
}

function listResolvedReviewQueue() {
  return sortReviewItems(store.listResolvedReviewQueue().map(enrichReviewItem));
}

function listAlertEvents() {
  return store.listAlertEvents();
}

function getNoticeDetail(id) {
  const noticeDirectory = buildNoticeDirectory();
  const canonicalId = resolveCanonicalNoticeId(id, noticeDirectory);
  const baseNotices = noticeDirectory.notices;
  const rawNotice = store.getNoticeById(canonicalId) || store.getNoticeById(id);
  const baseNotice = noticeDirectory.byId[canonicalId] || null;
  const notice = enrichNoticeWithBatchSummary(baseNotice, baseNotices);
  const positions = getMergedNoticePositions(canonicalId, noticeDirectory).map((position) => (
    attachNoticeTrustToPosition(position, noticeDirectory)
  ));
  const compareMetadata = buildNoticeCompareMetadata(notice, positions);
  const favorite = isFavoriteCanonicalNotice(canonicalId, noticeDirectory);
  const { noticeBatch, noticeTimeline, relatedNotices, noticeProgress } = buildRelatedNotices(notice, baseNotices);
  if (notice || rawNotice) {
    store.recordBrowse({
      id: `notice:${canonicalId}`,
      type: "notice",
      title: (notice && notice.title) || (rawNotice && rawNotice.title) || "",
      noticeId: canonicalId
    });
  }
  return {
    notice: {
      ...notice,
      ...compareMetadata
    },
    positions,
    noticeTrust: buildNoticeTrust(notice),
    canViewPositions: Boolean(notice && notice.hasStructuredPositions),
    favorite,
    noticeBatch,
    noticeTimeline,
    relatedNotices,
    noticeProgress,
    progressReminderSettings: store.getNoticeProgressReminderSettings(canonicalId),
    progressReminderOptions: store.getProgressReminderOptions()
  };
}

function listPositionsByNotice(noticeId, compareGroupId) {
  const noticeDirectory = buildNoticeDirectory();
  const canonicalId = resolveCanonicalNoticeId(noticeId, noticeDirectory);
  const notice = getCanonicalNoticeById(canonicalId, noticeDirectory);
  const positions = getMergedNoticePositions(canonicalId, noticeDirectory).map((position) => ({
    ...attachNoticeTrustToPosition(position, noticeDirectory),
    inCompare: compareGroupId ? store.getCompareStatus(position.id, compareGroupId) : false
  }));
  return {
    notice,
    noticeTrust: buildNoticeTrust(notice),
    positions,
    canViewPositions: Boolean(notice && notice.hasStructuredPositions)
  };
}

function listCompareGroups() {
  const personalProfile = store.getPersonalProfile();
  return store.listCompareGroups().map((group) => decorateCompareGroup(group, personalProfile));
}

function getCompareGroupDetail(groupId) {
  const group = store.getCompareGroup(groupId);
  const noticeDirectory = buildNoticeDirectory();
  const positions = group ? store.getComparePositions(group.id).map((item) => attachNoticeTrustToPosition(item, noticeDirectory)) : [];
  return {
    group: group ? {
      ...group,
      compareSummary: buildCompareGroupSummary(group, positions, store.getPersonalProfile())
    } : group,
    positions
  };
}

function getRecommendedPositions(positionId, limit) {
  const noticeDirectory = buildNoticeDirectory();
  return store.recommendPositions(positionId, limit).map((item) => attachNoticeTrustToPosition(item, noticeDirectory));
}

function createCompareGroup(name, examType, options) {
  return store.createCompareGroup(name, examType, options);
}

function renameCompareGroup(groupId, name) {
  return store.renameCompareGroup(groupId, name);
}

function saveCompareGroupPreferences(groupId, preferences) {
  return store.saveCompareGroupPreferences(groupId, preferences);
}

function setCompareGroupPinned(groupId, pinned, pinnedAt) {
  return store.setCompareGroupPinned(groupId, pinned, pinnedAt);
}

function deleteCompareGroup(groupId) {
  return store.deleteCompareGroup(groupId);
}

function recordCompareGroupAction(groupId, context) {
  return store.recordCompareGroupAction(groupId, context);
}

function touchCompareGroup(groupId, touchedAt) {
  return store.touchCompareGroup(groupId, touchedAt);
}

function addPositionToGroup(groupId, positionId, context) {
  return store.addPositionToCompareGroup(groupId, positionId, context);
}

function removePositionFromGroup(groupId, positionId) {
  return store.removePositionFromCompareGroup(groupId, positionId);
}

function listSavedFilters() {
  return store.listSavedFilters();
}

function getSavedFilter(savedFilterId) {
  return store.getSavedFilter(savedFilterId);
}

function saveFilterScheme(input) {
  return store.saveFilterScheme(input);
}

function saveSavedFilterViewPreferences(savedFilterId, viewPreferences) {
  return store.saveSavedFilterViewPreferences(savedFilterId, viewPreferences);
}

function deleteSavedFilter(savedFilterId) {
  return store.deleteSavedFilter(savedFilterId);
}

function listSubscriptions() {
  return store.listSubscriptions();
}

function getSubscription(subscriptionId) {
  return store.getSubscription(subscriptionId);
}

function createSubscription(input) {
  return store.createSubscription(input);
}

function saveSubscriptionViewPreferences(subscriptionId, viewPreferences) {
  return store.saveSubscriptionViewPreferences(subscriptionId, viewPreferences);
}

function markSubscriptionSeen(subscriptionId) {
  return store.markSubscriptionSeen(subscriptionId);
}

function deleteSubscription(subscriptionId) {
  return store.deleteSubscription(subscriptionId);
}

function buildFavoriteProgressMessages() {
  const notices = listNotices();
  const noticeMap = notices.reduce((result, item) => {
    result[item.id] = item;
    return result;
  }, {});
  const preferenceMap = buildProgressReminderPreferenceMap();

  return listFavoriteCanonicalNoticeIds()
    .map((noticeId) => noticeMap[noticeId])
    .filter(Boolean)
    .flatMap((favoriteNotice) => {
      const progressReminderSettings = store.getNoticeProgressReminderSettings(favoriteNotice.id);
      const { relatedNotices = [], noticeProgress } = buildRelatedNotices(favoriteNotice, notices);
      const followingNotices = relatedNotices.filter(
        (item) => {
          if (getNoticeTimelineSortValue(item) <= getNoticeTimelineSortValue(favoriteNotice)) {
            return false;
          }
          const preferenceKey = preferenceMap[item.noticeStageId];
          if (!preferenceKey) {
            return false;
          }
          return progressReminderSettings[preferenceKey] !== false;
        }
      );

      if (!followingNotices.length) {
        return [];
      }

      return followingNotices.map((relatedNotice) => {
        const id = `favorite-progress:${favoriteNotice.id}:${relatedNotice.id}`;
        return {
          id,
          type: "favorite-progress",
          typeLabel: "收藏追踪",
          priority: 2,
          title: `收藏公告已进入${relatedNotice.noticeStageLabel || "后续阶段"}`,
          summary: `${favoriteNotice.title} · 新增节点：${relatedNotice.title}`,
          createdAt: relatedNotice.publishedAt || favoriteNotice.publishedAt,
          actionLabel: "查看后续公告",
          noticeId: relatedNotice.id,
          favoriteNoticeId: favoriteNotice.id,
          read: store.isMessageRead(id)
        };
      });
    });
}

function sortMessages(messages) {
  return messages
    .slice()
    .sort((left, right) => {
      if (left.read !== right.read) {
        return left.read ? 1 : -1;
      }
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
    });
}

function listMessages() {
  const storedMessages = store.listMessages();
  const favoriteProgressMessages = buildFavoriteProgressMessages().filter(
    (item) => !storedMessages.some((message) => message.id === item.id)
  );

  return sortMessages([
    ...storedMessages,
    ...favoriteProgressMessages
  ]);
}

function markMessageRead(messageId) {
  const result = store.markMessageRead(messageId);
  return {
    ...result,
    unreadCount: listMessages().filter((item) => !item.read).length
  };
}

function getProgressReminderSettings() {
  return {
    settings: store.getProgressReminderSettings(),
    options: store.getProgressReminderOptions()
  };
}

function getPersonalProfile() {
  return {
    profile: store.getPersonalProfile()
  };
}

function savePersonalProfile(input) {
  return {
    profile: store.savePersonalProfile(input || {})
  };
}

function saveProgressReminderSettings(input) {
  return {
    settings: store.saveProgressReminderSettings(input || {}),
    options: store.getProgressReminderOptions()
  };
}

function getNoticeProgressReminderSettings(noticeId) {
  const canonicalId = resolveCanonicalNoticeId(noticeId);
  return {
    settings: store.getNoticeProgressReminderSettings(canonicalId),
    options: store.getProgressReminderOptions()
  };
}

function saveNoticeProgressReminderSettings(noticeId, input) {
  const canonicalId = resolveCanonicalNoticeId(noticeId);
  return {
    settings: store.saveNoticeProgressReminderSettings(canonicalId, input || {}),
    options: store.getProgressReminderOptions()
  };
}

function resolveReviewItem(reviewId, resolutionNote) {
  return store.resolveReviewItem(reviewId, resolutionNote);
}

function reopenReviewItem(reviewId) {
  return store.reopenReviewItem(reviewId);
}

function toggleFavoriteNotice(noticeId) {
  const noticeDirectory = buildNoticeDirectory();
  const canonicalId = resolveCanonicalNoticeId(noticeId, noticeDirectory);
  const aliasIds = getCanonicalNoticeAliasIds(canonicalId, noticeDirectory);
  const favoriteIds = new Set(store.listFavoriteNoticeIds());
  const alreadyFavorite = aliasIds.some((id) => favoriteIds.has(id));

  if (alreadyFavorite) {
    aliasIds
      .filter((id) => favoriteIds.has(id))
      .forEach((id) => {
        store.toggleFavorite(id);
      });
  } else {
    store.toggleFavorite(canonicalId);
  }

  return listFavoriteCanonicalNoticeIds(noticeDirectory);
}

function listFavoriteNotices() {
  const noticeDirectory = buildNoticeDirectory();
  const baseNotices = noticeDirectory.notices;
  return listFavoriteCanonicalNoticeIds(noticeDirectory)
    .map((noticeId) => noticeDirectory.byId[noticeId])
    .filter(Boolean)
    .map((item) => enrichNoticeWithBatchSummary(item, baseNotices));
}

function listBrowsingHistory() {
  return store.listBrowsingHistory();
}

function getDashboard() {
  const notices = listNotices();
  const messages = listMessages();
  const sourceStates = listSourceStates();
  const reviewQueue = listReviewQueue();
  const resolvedReviewQueue = listResolvedReviewQueue();
  const alertEvents = store.listAlertEvents();
  const publishAudits = typeof store.listPublishAudits === "function"
    ? store.listPublishAudits()
    : [];
  const baseStats = store.getDashboardStats();
  const sourceSummary = buildSourceSummary(sourceStates, alertEvents, baseStats);
  const reviewSummary = buildReviewSummary(reviewQueue, resolvedReviewQueue, baseStats);
  return {
    notices,
    sourceStates,
    reviewQueue,
    resolvedReviewQueue,
    alertEvents,
    publishAudits,
    compareGroups: listCompareGroups(),
    savedFilters: store.listSavedFilters(),
    subscriptions: store.listSubscriptions(),
    messages,
    favoriteNotices: listFavoriteNotices(),
    browsingHistory: store.listBrowsingHistory(),
    personalProfile: store.getPersonalProfile(),
    progressReminderSettings: store.getProgressReminderSettings(),
    sourceSummary,
    reviewSummary,
    stats: {
      ...baseStats,
      ...sourceSummary,
      noticeCount: notices.length,
      pendingReviewTotal: reviewSummary.total,
      resolvedReviewTotal: reviewSummary.resolved,
      unreadMessageCount: messages.filter((item) => !item.read).length
    }
  };
}

module.exports = {
  listNotices,
  listSourceStates,
  listReviewQueue,
  listResolvedReviewQueue,
  listAlertEvents,
  getNoticeDetail,
  listPositionsByNotice,
  listCompareGroups,
  getCompareGroupDetail,
  getRecommendedPositions,
  createCompareGroup,
  renameCompareGroup,
  saveCompareGroupPreferences,
  setCompareGroupPinned,
  deleteCompareGroup,
  recordCompareGroupAction,
  touchCompareGroup,
  addPositionToGroup,
  removePositionFromGroup,
  listSavedFilters,
  getSavedFilter,
  saveFilterScheme,
  saveSavedFilterViewPreferences,
  deleteSavedFilter,
  listSubscriptions,
  getSubscription,
  createSubscription,
  saveSubscriptionViewPreferences,
  markSubscriptionSeen,
  deleteSubscription,
  listMessages,
  markMessageRead,
  getPersonalProfile,
  savePersonalProfile,
  getProgressReminderSettings,
  saveProgressReminderSettings,
  getNoticeProgressReminderSettings,
  saveNoticeProgressReminderSettings,
  resolveReviewItem,
  reopenReviewItem,
  toggleFavoriteNotice,
  listFavoriteNotices,
  listBrowsingHistory,
  getDashboard,
  buildNoticeTrust,
  classifyNoticeStage
};
