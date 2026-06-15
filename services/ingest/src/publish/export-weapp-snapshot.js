const fs = require("node:fs");
const path = require("node:path");
const {
  classifyNoticeStage,
  shouldExpectPositionWorkbookForNotice
} = require("../../../../packages/shared/src");
const { formatTimestamp, resolveDate, mapSourceState } = require("./source-state");
const { classifyReviewItem, summarizeReviewQueueBySource } = require("../review-analysis");

function mapNotice(payload, sourceState = null) {
  const batch = payload.batch || {};
  const stage = classifyNoticeStage({
    title: payload.notice.title,
    summary: payload.notice.summary,
    source: payload.source.name
  });
  const expectedPositionWorkbook = shouldExpectPositionWorkbookForNotice({
    title: payload.notice.title,
    summary: payload.notice.summary,
    source: payload.source.name,
    noticeStageId: stage.id
  });
  const releaseMode = sourceState && sourceState.releaseMode
    ? sourceState.releaseMode
    : "";
  const hasStructuredPositions = (
    batch.parseStatus !== "attachment-only" &&
    payload.positions.length > 0 &&
    releaseMode !== "notice-only"
  );
  const registrationWindow =
    payload.notice.registrationStart && payload.notice.registrationEnd
      ? `${payload.notice.registrationStart} - ${payload.notice.registrationEnd}`
      : payload.notice.registrationStart || "待官方补充";
  return {
    id: payload.notice.id,
    sourceId: payload.notice.sourceId,
    examType: payload.notice.examType,
    title: payload.notice.title,
    area: payload.notice.area,
    publishedAt: payload.notice.publishedAt ? payload.notice.publishedAt.slice(0, 10) : "",
    registrationWindow,
    writtenExamAt: payload.notice.writtenExamAt || "待官方补充",
    summary: payload.notice.summary,
    source: payload.source.name,
    sourceMode: (payload.source.metadata && payload.source.metadata.mode) || "official",
    sourceModeLabel: (payload.source.metadata && payload.source.metadata.modeLabel) || "官方",
    sourceModeNote: (payload.source.metadata && payload.source.metadata.modeNote) || "",
    url: payload.notice.url,
    attachments: payload.notice.attachments.map((item) => item.name || item.url),
    hasStructuredPositions,
    positionCount: payload.positions.length,
    noticeStageId: stage.id,
    noticeStageLabel: stage.label,
    noticeStagePriority: stage.priority,
    expectedPositionWorkbook,
    attachmentOnlyExpected: !hasStructuredPositions && batch.parseStatus === "attachment-only" && expectedPositionWorkbook === false
  };
}

function mapPosition(position) {
  return {
    id: position.id,
    sourceId: position.sourceId || "",
    noticeId: position.noticeId,
    batchId: position.batchId,
    examType: position.examType,
    agency: position.agency,
    title: position.title,
    positionCode: position.positionCode,
    positionType: position.positionType,
    headcount: position.headcount,
    area: position.area,
    education: position.educationRaw,
    degree: position.degreeRaw,
    major: position.majorRaw,
    majorCodes: position.majorCodes || [],
    serviceRequirement: position.serviceRequirement,
    freshGraduateOnly: position.freshGraduateOnly,
    politicalStatus: position.politicalStatus,
    notes: position.notes,
    sourceNoticeTitle: position.sourceNoticeTitle,
    hasManualCorrections: Boolean(position.hasManualCorrections),
    correctedFields: position.correctedFields || [],
    correctionSummary: position.correctionSummary || "",
    correctionLog: position.correctionLog || []
  };
}

function buildCompareGroups(positions) {
  const grouped = positions.reduce((result, position) => {
    const key = position.examType;
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(position.id);
    return result;
  }, {});

  return Object.entries(grouped)
    .filter(([, ids]) => ids.length > 0)
    .map(([examType, ids], index) => ({
      id: `cg-${index + 1}`,
      name: examType === "guangdong-provincial" ? "省考主对比" : "国考主对比",
      examType,
      positionIds: ids.slice(0, 2)
    }));
}

function summarizeReviewItem(item) {
  const parsed = item.parsed || {};
  const notice = parsed.notice || {};
  const batch = parsed.batch || {};
  const parseMetrics = batch.parseMetrics || {};
  const rawPayload = item.rawPayload || {};
  const detailLines = [];

  if (notice.title) {
    detailLines.push(`公告：${notice.title}`);
  }
  if (batch.parseStatus) {
    detailLines.push(`解析状态：${batch.parseStatus}`);
  }
  if (parseMetrics.fieldCoveragePercent) {
    detailLines.push(`字段覆盖率：${parseMetrics.fieldCoveragePercent}%`);
  }
  if (batch.rowsTotal) {
    detailLines.push(`结构化岗位数：${batch.rowsTotal}`);
  }
  if (parseMetrics.sheetSummary) {
    detailLines.push(`工作表摘要：${parseMetrics.sheetSummary}`);
  }
  if (rawPayload.fetchedAt) {
    detailLines.push(`抓取时间：${formatTimestamp(rawPayload.fetchedAt)}`);
  }

  return {
    noticeId: notice.id || "",
    noticeTitle: notice.title || "",
    noticeUrl: notice.url || "",
    noticePublishedAt: formatTimestamp(notice.publishedAt),
    parseStatus: batch.parseStatus || "",
    rowsTotal: Number(batch.rowsTotal || 0),
    attachmentUrl: batch.attachmentUrl || "",
    parseLogPreview: Array.isArray(batch.parseLog) ? batch.parseLog.slice(0, 3) : [],
    fieldCoveragePercent: Number(parseMetrics.fieldCoveragePercent || 0),
    workbookSheetSummary: parseMetrics.sheetSummary || "",
    workbookSheetCount: Number(parseMetrics.sheetCount || 0),
    rawFetchedAt: formatTimestamp(rawPayload.fetchedAt),
    responseDigest: rawPayload.responseDigest || "",
    detailLines
  };
}

function mapReviewItem(item, sourceStateMap) {
  const sourceState = sourceStateMap[item.sourceId] || {};
  const summary = summarizeReviewItem(item);
  const reviewClassification = classifyReviewItem(item, sourceState);
  const stage = classifyNoticeStage({
    title: summary.noticeTitle,
    source: sourceState.sourceName || item.sourceId
  });
  const expectedPositionWorkbook = shouldExpectPositionWorkbookForNotice({
    title: summary.noticeTitle,
    source: sourceState.sourceName || item.sourceId,
    noticeStageId: stage.id
  });
  return {
    id: item.id || `${item.sourceId}:${item.createdAt || ""}:${(item.reason || []).join("|")}`,
    sourceId: item.sourceId,
    sourceName: sourceState.sourceName || item.sourceId,
    createdAt: formatTimestamp(item.createdAt),
    status: item.status || "pending",
    resolutionNote: item.resolutionNote || "",
    resolvedAt: formatTimestamp(item.resolvedAt),
    updatedAt: formatTimestamp(item.updatedAt || item.createdAt),
    candidateVersionId: item.candidateVersionId || sourceState.candidateVersionId || "",
    candidateVersionLabel: item.candidateVersionLabel || sourceState.candidateVersionLabel || "",
    candidateVersionCreatedAt: formatTimestamp(
      item.candidateVersionCreatedAt || sourceState.candidateVersionCreatedAt || item.createdAt
    ),
    rollbackToVersionId: item.rollbackToVersionId || sourceState.rollbackToVersionId || "",
    rollbackToVersionLabel: item.rollbackToVersionLabel || sourceState.rollbackToVersionLabel || "",
    reasons: Array.isArray(item.reason) ? item.reason : [],
    hasParsedPayload: Boolean(item.parsed),
    hasRawPayload: Boolean(item.rawPayload),
    noticeStageId: stage.id,
    noticeStageLabel: stage.label,
    expectedPositionWorkbook,
    attachmentOnlyExpected: summary.parseStatus === "attachment-only" && expectedPositionWorkbook === false,
    reviewClassification: reviewClassification.reason,
    staleReview: reviewClassification.stale,
    blockingReview: reviewClassification.blocking,
    ...summary
  };
}

function mapPublishAudit(item, sourceStateMap) {
  const sourceState = sourceStateMap[item.sourceId] || {};
  return {
    id: item.id,
    sourceId: item.sourceId,
    sourceName: item.sourceName || sourceState.sourceName || item.sourceId,
    eventType: item.eventType || "",
    createdAt: formatTimestamp(item.createdAt),
    updatedAt: formatTimestamp(item.updatedAt || item.createdAt),
    summary: item.summary || "",
    detail: item.detail || "",
    releaseMode: item.releaseMode || sourceState.releaseMode || "",
    releaseOverrideMode: item.releaseOverrideMode || "",
    reason: item.reason || "",
    operator: item.operator || "",
    candidateVersionId: item.candidateVersionId || sourceState.candidateVersionId || "",
    candidateVersionLabel: item.candidateVersionLabel || sourceState.candidateVersionLabel || "",
    stableVersionId: item.stableVersionId || sourceState.stableVersionId || "",
    stableVersionLabel: item.stableVersionLabel || sourceState.stableVersionLabel || ""
  };
}

function exportWeappSnapshot(store, targetFile, options = {}) {
  const now = resolveDate(options.now) || new Date();
  const payloads = Array.from(store.production.values());
  const mappedSourceStates = store.listSourceStates().map((state) => mapSourceState(state, { now }));
  const sourceStateById = Object.fromEntries(
    mappedSourceStates.map((item) => [item.sourceId, item])
  );
  const notices = payloads.map((payload) => mapNotice(
    payload,
    sourceStateById[payload.notice.sourceId] || null
  ));
  const positions = payloads.flatMap((payload) => payload.positions.map(mapPosition));
  const compareGroups = buildCompareGroups(positions);
  const noticeBySourceId = Object.fromEntries(notices.map((notice) => [notice.sourceId, notice]));
  const pendingReviewQueue = store.listReviewQueue();
  const enrichedSourceStates = mappedSourceStates.map((state) => {
    const mapped = state;
    const notice = noticeBySourceId[state.sourceId];
    if (!notice) {
      return mapped;
    }
    return {
      ...mapped,
      currentNoticeId: notice.id,
      currentNoticeTitle: notice.title,
      currentNoticePublishedAt: notice.publishedAt,
      currentNoticeStageId: notice.noticeStageId,
      currentNoticeStageLabel: notice.noticeStageLabel,
      expectedPositionWorkbook: notice.expectedPositionWorkbook,
      attachmentOnlyExpected: mapped.parseStatus === "attachment-only" && notice.expectedPositionWorkbook === false
    };
  });
  const reviewSummaryBySource = summarizeReviewQueueBySource(pendingReviewQueue, mappedSourceStates);
  const sourceStates = enrichedSourceStates.map((item) => ({
    ...item,
    blockingPendingReviewCount: reviewSummaryBySource[item.sourceId]?.blockingPendingCount || 0,
    stalePendingReviewCount: reviewSummaryBySource[item.sourceId]?.stalePendingCount || 0,
    blockingReviewIds: reviewSummaryBySource[item.sourceId]?.blockingReviewIds || [],
    staleReviewIds: reviewSummaryBySource[item.sourceId]?.staleReviewIds || []
  }));
  const sourceStateMap = Object.fromEntries(sourceStates.map((item) => [item.sourceId, item]));
  const reviewQueue = pendingReviewQueue.map((item) => mapReviewItem(item, sourceStateMap));
  const resolvedReviewQueue = (store.listResolvedReviewQueue ? store.listResolvedReviewQueue() : [])
    .map((item) => mapReviewItem(item, sourceStateMap))
    .slice(0, 50);
  const alertEvents = (store.listAlertEvents ? store.listAlertEvents() : [])
    .slice()
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
    .slice(0, 20)
    .map((item) => ({
      id: item.id,
      sourceId: item.sourceId,
      sourceName: item.sourceName || sourceStateMap[item.sourceId]?.sourceName || item.sourceId,
      type: item.type,
      severity: item.severity,
      createdAt: formatTimestamp(item.createdAt),
      summary: item.summary,
      details: item.details || ""
    }));
  const publishAudits = (store.listPublishAudits ? store.listPublishAudits() : [])
    .slice(0, 100)
    .map((item) => mapPublishAudit(item, sourceStateMap));
  const snapshot = {
    updatedAt: now.toISOString(),
    notices,
    positions,
    compareGroups,
    sourceStates,
    reviewQueue,
    resolvedReviewQueue,
    alertEvents,
    publishAudits
  };

  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(
    targetFile,
    `module.exports = ${JSON.stringify(snapshot, null, 2)};\n`,
    "utf8"
  );
}

module.exports = {
  exportWeappSnapshot
};
