function formatTimestamp(value) {
  if (!value) {
    return "";
  }
  return String(value).replace("T", " ").slice(0, 16);
}

function buildVersionId(sourceId, timestamp) {
  if (!sourceId || !timestamp) {
    return "";
  }
  return `${sourceId}@${timestamp}`;
}

function buildVersionLabel(timestamp, suffix) {
  const formatted = formatTimestamp(timestamp);
  if (!formatted) {
    return "";
  }
  return `${formatted} ${suffix}`;
}

function resolveDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function minutesSince(base, value) {
  const target = resolveDate(value);
  if (!target) {
    return null;
  }
  return Math.max(0, Math.floor((base.getTime() - target.getTime()) / 60000));
}

function addMinutes(value, minutes) {
  const target = resolveDate(value);
  if (!target) {
    return "";
  }
  return formatTimestamp(new Date(target.getTime() + minutes * 60000).toISOString());
}

function normalizeParseQuality(state) {
  const parseStatus = state.lastParseStatus || "unknown";
  const matchedFieldCount = Number(state.matchedFieldCount || 0);
  const totalFieldCount = Number(state.totalFieldCount || 0);
  const fieldCoveragePercent = Number(state.fieldCoveragePercent || 0);
  const parseErrorCount = Number(state.parseErrorCount || 0);
  const workbookRowCount = Number(state.workbookRowCount || state.lastRowsTotal || 0);

  let parseQualityStatus = "unknown";
  if (parseStatus === "parsed" && parseErrorCount === 0 && fieldCoveragePercent >= 70) {
    parseQualityStatus = "healthy";
  } else if (parseStatus === "parsed" && workbookRowCount > 0) {
    parseQualityStatus = "warning";
  } else if (parseStatus === "attachment-only") {
    parseQualityStatus = "attachment-only";
  }

  let parseQualitySummary = "";
  if (parseStatus === "parsed") {
    parseQualitySummary = `字段命中 ${matchedFieldCount}/${totalFieldCount || "?"}，覆盖率 ${fieldCoveragePercent}%`;
  } else if (parseStatus === "attachment-only") {
    parseQualitySummary = "仅展示公告，岗位表尚未形成稳定结构化结果";
  }

  return {
    parseStatus,
    parseQualityStatus,
    parseQualitySummary,
    lastRowsTotal: Number(state.lastRowsTotal || 0),
    candidateWorkbookCount: Number(state.candidateWorkbookCount || 0),
    extractedWorkbookCount: Number(state.extractedWorkbookCount || 0),
    parseErrorCount,
    matchedFieldCount,
    totalFieldCount,
    fieldCoveragePercent,
    workbookSheetCount: Number(state.workbookSheetCount || 0),
    workbookSheetSummary: state.workbookSheetSummary || "",
    workbookPath: state.workbookPath || "",
    workbookRowCount,
    lastParseLog: Array.isArray(state.lastParseLog) ? state.lastParseLog : [],
    correctedPositionCount: Number(state.correctedPositionCount || 0),
    correctedFieldCount: Number(state.correctedFieldCount || 0),
    appliedCorrectionRuleCount: Number(state.appliedCorrectionRuleCount || 0),
    appliedCorrectionRuleIds: Array.isArray(state.appliedCorrectionRuleIds) ? state.appliedCorrectionRuleIds : []
  };
}

function deriveBaseReleaseMode(state, parseQualityStatus) {
  if (state.releaseMode === "notice-only") {
    return "notice-only";
  }
  if (parseQualityStatus !== "healthy") {
    return "notice-only";
  }
  return "positions-open";
}

function canApplyPositionsOpenOverride(state = {}) {
  if (state.sourceMode === "demo") {
    return {
      ok: false,
      reason: "演示来源不能人工开放岗位能力"
    };
  }
  if (state.lastRollback) {
    return {
      ok: false,
      reason: "当前来源刚发生回退，不能直接人工开放岗位能力"
    };
  }
  if (state.lastRunStatus === "error" || state.lastRunStatus === "failed") {
    return {
      ok: false,
      reason: "当前来源最近一次运行未通过，不能直接人工开放岗位能力"
    };
  }
  if (Number(state.consecutiveFailureCount || 0) > 0) {
    return {
      ok: false,
      reason: "当前来源存在连续失败，不能直接人工开放岗位能力"
    };
  }
  if (Number(state.pendingReviewCount || 0) > 0) {
    return {
      ok: false,
      reason: "当前来源仍有待复核记录，不能人工开放岗位能力"
    };
  }
  if (state.parseQualityStatus && state.parseQualityStatus !== "healthy") {
    return {
      ok: false,
      reason: "当前来源岗位表结构化状态不稳定，不能人工开放岗位能力"
    };
  }
  return {
    ok: true,
    reason: ""
  };
}

function resolveReleaseControl(state = {}, fallbackReleaseMode) {
  const releaseOverrideMode = String(state.releaseOverrideMode || "").trim();
  if (!releaseOverrideMode) {
    return {
      releaseMode: fallbackReleaseMode,
      releaseModeBase: fallbackReleaseMode,
      releaseModeStrategy: "auto",
      releaseOverrideActive: false,
      releaseOverrideMode: "",
      releaseOverrideApplied: false,
      releaseOverrideBlockedReason: ""
    };
  }

  if (releaseOverrideMode === "notice-only") {
    return {
      releaseMode: "notice-only",
      releaseModeBase: fallbackReleaseMode,
      releaseModeStrategy: "manual",
      releaseOverrideActive: true,
      releaseOverrideMode,
      releaseOverrideApplied: true,
      releaseOverrideBlockedReason: ""
    };
  }

  if (releaseOverrideMode === "positions-open") {
    const check = canApplyPositionsOpenOverride(state);
    return {
      releaseMode: check.ok ? "positions-open" : fallbackReleaseMode,
      releaseModeBase: fallbackReleaseMode,
      releaseModeStrategy: "manual",
      releaseOverrideActive: true,
      releaseOverrideMode,
      releaseOverrideApplied: check.ok,
      releaseOverrideBlockedReason: check.reason || ""
    };
  }

  return {
    releaseMode: fallbackReleaseMode,
    releaseModeBase: fallbackReleaseMode,
    releaseModeStrategy: "auto",
    releaseOverrideActive: false,
    releaseOverrideMode: "",
    releaseOverrideApplied: false,
    releaseOverrideBlockedReason: ""
  };
}

function mapSourceState(state, options = {}) {
  const now = resolveDate(options.now) || new Date();
  const scheduleMinutes = Number(state.scheduleMinutes || 30);
  const publishSlaMinutes = Number(state.publishSlaMinutes || Math.max(scheduleMinutes * 2, 60));
  const lastSuccessfulFetchedAt = state.lastSuccessfulFetchedAt || state.lastFetchedAt;
  const fetchLagMinutes = minutesSince(now, state.lastFetchedAt);
  const publishLagMinutes = minutesSince(now, state.lastSuccessAt || state.lastPublishedAt);
  const fetchOverdue = fetchLagMinutes === null ? true : fetchLagMinutes > scheduleMinutes * 2;
  const publishOverdue = publishLagMinutes === null ? true : publishLagMinutes > publishSlaMinutes;
  const fetchWarning = fetchLagMinutes !== null && fetchLagMinutes > scheduleMinutes;
  const publishWarning =
    publishLagMinutes !== null &&
    publishLagMinutes > Math.max(scheduleMinutes, Math.floor(publishSlaMinutes * 0.8));
  const slaStatus = fetchOverdue || publishOverdue
    ? "overdue"
    : fetchWarning || publishWarning
      ? "warning"
      : "healthy";
  const parseQuality = normalizeParseQuality(state);
  const candidateVersionCreatedAt = state.candidateVersionCreatedAt || state.lastRunFinishedAt || state.lastFetchedAt || "";
  const stableVersionUpdatedAt = state.stableVersionUpdatedAt || state.lastPublishedAt || "";
  const candidateVersionId = state.candidateVersionId || buildVersionId(state.sourceId, candidateVersionCreatedAt);
  const stableVersionId = state.stableVersionId || state.lastPublishedVersionId || buildVersionId(state.sourceId, stableVersionUpdatedAt);
  const stableVersionLabel = state.stableVersionLabel || state.lastPublishedVersionLabel || buildVersionLabel(stableVersionUpdatedAt, "稳定快照");
  const rollbackToVersionId = state.rollbackToVersionId || stableVersionId;
  const rollbackToVersionLabel = state.rollbackToVersionLabel || stableVersionLabel;
  const parseQualitySummary = parseQuality.correctedPositionCount > 0
    ? `${parseQuality.parseQualitySummary || ""}${parseQuality.parseQualitySummary ? " 路 " : ""}人工纠错 ${parseQuality.correctedPositionCount} 个岗位`
    : parseQuality.parseQualitySummary;
  const fallbackReleaseMode = deriveBaseReleaseMode(state, parseQuality.parseQualityStatus);
  const releaseControl = resolveReleaseControl({
    ...state,
    parseQualityStatus: parseQuality.parseQualityStatus
  }, fallbackReleaseMode);

  return {
    sourceId: state.sourceId,
    sourceName: state.sourceName,
    examType: state.examType,
    sourceMode: state.sourceMode || "official",
    sourceModeLabel: state.sourceModeLabel || (state.sourceMode === "demo" ? "演示" : "官方"),
    sourceModeNote: state.sourceModeNote || "",
    candidateVersionId,
    candidateVersionLabel: state.candidateVersionLabel || buildVersionLabel(candidateVersionCreatedAt, "候选版本"),
    candidateVersionCreatedAt: formatTimestamp(candidateVersionCreatedAt),
    stableVersionId,
    stableVersionLabel,
    stableVersionUpdatedAt: formatTimestamp(stableVersionUpdatedAt),
    lastPublishedVersionId: state.lastPublishedVersionId || stableVersionId,
    lastPublishedVersionLabel: state.lastPublishedVersionLabel || stableVersionLabel,
    rollbackToVersionId,
    rollbackToVersionLabel,
    scheduleMinutes,
    publishSlaMinutes,
    lastFetchedAt: formatTimestamp(state.lastFetchedAt),
    lastSuccessfulFetchedAt: formatTimestamp(lastSuccessfulFetchedAt),
    lastPublishedAt: formatTimestamp(state.lastPublishedAt),
    lastNoticePublishedAt: formatTimestamp(state.lastNoticePublishedAt),
    lastRunFinishedAt: formatTimestamp(state.lastRunFinishedAt),
    lastSuccessAt: formatTimestamp(state.lastSuccessAt),
    nextFetchDueAt: addMinutes(state.lastFetchedAt, scheduleMinutes),
    nextPublishDueAt: addMinutes(state.lastSuccessAt || state.lastPublishedAt, publishSlaMinutes),
    fetchLagMinutes,
    publishLagMinutes,
    fetchOverdue,
    publishOverdue,
    slaStatus,
    lastRunStatus: state.lastRunStatus || "unknown",
    lastRollback: Boolean(state.lastRollback),
    consecutiveFailureCount: Number(state.consecutiveFailureCount || 0),
    pendingReviewCount: Number(state.pendingReviewCount || 0),
    releaseMode: releaseControl.releaseMode,
    releaseModeBase: releaseControl.releaseModeBase,
    releaseModeStrategy: releaseControl.releaseModeStrategy,
    releaseOverrideActive: releaseControl.releaseOverrideActive,
    releaseOverrideMode: releaseControl.releaseOverrideMode,
    releaseOverrideApplied: releaseControl.releaseOverrideApplied,
    releaseOverrideReason: state.releaseOverrideReason || "",
    releaseOverrideUpdatedAt: formatTimestamp(state.releaseOverrideUpdatedAt),
    releaseOverrideOperator: state.releaseOverrideOperator || "",
    releaseOverrideBlockedReason: releaseControl.releaseOverrideBlockedReason,
    structureAlert: Boolean(state.structureAlert),
    structureSummary: state.structureSummary || "",
    lastStructureChangedAt: formatTimestamp(state.lastStructureChangedAt),
    structureChangeSummary: state.structureChangeSummary || "",
    parseStatus: parseQuality.parseStatus,
    parseQualityStatus: parseQuality.parseQualityStatus,
    parseQualitySummary,
    lastRowsTotal: parseQuality.lastRowsTotal,
    candidateWorkbookCount: parseQuality.candidateWorkbookCount,
    extractedWorkbookCount: parseQuality.extractedWorkbookCount,
    parseErrorCount: parseQuality.parseErrorCount,
    matchedFieldCount: parseQuality.matchedFieldCount,
    totalFieldCount: parseQuality.totalFieldCount,
    fieldCoveragePercent: parseQuality.fieldCoveragePercent,
    workbookSheetCount: parseQuality.workbookSheetCount,
    workbookSheetSummary: parseQuality.workbookSheetSummary,
    workbookPath: parseQuality.workbookPath,
    workbookRowCount: parseQuality.workbookRowCount,
    lastParseLog: parseQuality.lastParseLog,
    correctedPositionCount: parseQuality.correctedPositionCount,
    correctedFieldCount: parseQuality.correctedFieldCount,
    appliedCorrectionRuleCount: parseQuality.appliedCorrectionRuleCount,
    appliedCorrectionRuleIds: parseQuality.appliedCorrectionRuleIds,
    lastErrorSummary: Array.isArray(state.lastErrors) && state.lastErrors.length
      ? state.lastErrors.join("；")
      : ""
  };
}

module.exports = {
  formatTimestamp,
  resolveDate,
  minutesSince,
  addMinutes,
  mapSourceState,
  canApplyPositionsOpenOverride
};
