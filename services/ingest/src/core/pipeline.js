const {
  validateNotice,
  validatePositionBatch
} = require("../../../../packages/shared/src");
const { publishWithGate } = require("../publish/gate");
const { applyPositionOverrideRules } = require("./position-overrides");

function buildVersionId(sourceId, timestamp) {
  if (!sourceId || !timestamp) {
    return "";
  }
  return `${sourceId}@${timestamp}`;
}

function buildVersionLabel(timestamp, suffix) {
  if (!timestamp) {
    return "";
  }
  return String(timestamp).replace("T", " ").slice(0, 16) + ` ${suffix}`;
}

function enrichParsedPositions(source, parsed) {
  const notice = parsed.notice || {};
  const batch = parsed.batch || {};
  return (parsed.positions || []).map((position) => ({
    ...position,
    sourceId: position.sourceId || notice.sourceId || source.id,
    noticeId: position.noticeId || notice.id || "",
    batchId: position.batchId || batch.id || "",
    examType: position.examType || notice.examType || source.examType,
    sourceNoticeTitle: position.sourceNoticeTitle || notice.title || "",
    sourceUrl: position.sourceUrl || notice.url || ""
  }));
}

function deriveReleaseMode({ published, batch, positions }) {
  if (!published) {
    return "notice-only";
  }
  if (!batch || batch.parseStatus === "attachment-only") {
    return "notice-only";
  }
  return Array.isArray(positions) && positions.length > 0 ? "positions-open" : "notice-only";
}

async function runPipeline({ source, adapter, store, positionOverrideRules = [] }) {
  const startedAt = new Date().toISOString();
  try {
    const rawPayload = await adapter.fetch();
    const previousState = store.getSourceState(source.id) || {};
    const previousStructureFingerprint = previousState.structureFingerprint || "";
    const nextStructureFingerprint = rawPayload.sourceStructure
      ? rawPayload.sourceStructure.fingerprint
      : undefined;
    const structureAlert = Boolean(
      nextStructureFingerprint &&
      previousStructureFingerprint &&
      previousStructureFingerprint !== nextStructureFingerprint
    );
    const structureChangeSummary = structureAlert
      ? `来源结构发生变化：${previousStructureFingerprint.slice(0, 8)} -> ${nextStructureFingerprint.slice(0, 8)}`
      : "";

    store.saveSourceState(source.id, {
      sourceName: source.name,
      examType: source.examType,
      sourceMode: source.metadata && source.metadata.mode,
      sourceModeLabel: source.metadata && source.metadata.modeLabel,
      sourceModeNote: source.metadata && source.metadata.modeNote,
      scheduleMinutes: source.scheduleMinutes,
      publishSlaMinutes: source.publishSlaMinutes,
      lastFetchedAt: rawPayload.fetchedAt,
      lastSuccessfulFetchedAt: rawPayload.fetchedAt,
      lastRunStartedAt: startedAt,
      lastRunStatus: "fetched",
      structureFingerprint: nextStructureFingerprint,
      structureSummary: rawPayload.sourceStructure ? rawPayload.sourceStructure.summary : undefined,
      structureAlert,
      lastStructureChangedAt: structureAlert ? rawPayload.fetchedAt : undefined,
      structureChangeSummary
    });
    store.saveRawSnapshot({
      sourceId: source.id,
      fetchedAt: rawPayload.fetchedAt,
      responseDigest: rawPayload.responseDigest,
      attachmentUrls: rawPayload.notice && rawPayload.notice.attachments
        ? rawPayload.notice.attachments.map((item) => item.url)
        : []
    });

    const parsed = await adapter.parse(rawPayload);
    parsed.positions = enrichParsedPositions(source, parsed);
    const parseMetrics = parsed.batch && parsed.batch.parseMetrics
      ? parsed.batch.parseMetrics
      : null;
    const positionOverrideResult = applyPositionOverrideRules(parsed.positions, positionOverrideRules);
    const correctedPositions = positionOverrideResult.positions;
    const noticeValidation = validateNotice(parsed.notice);
    const batchValidation = validatePositionBatch(parsed.batch, correctedPositions);
    const result = publishWithGate(store, source, {
      notice: parsed.notice,
      batch: parsed.batch,
      positions: correctedPositions,
      noticeValidation,
      batchValidation
    });
    const finishedAt = new Date().toISOString();
    const releaseMode = deriveReleaseMode({
      published: result.published,
      batch: parsed.batch,
      positions: correctedPositions
    });
    const candidateVersionId = buildVersionId(source.id, finishedAt);
    const candidateVersionLabel = buildVersionLabel(finishedAt, "候选版本");
    const stablePayload = result.published
      ? result.payload
      : (result.stablePayload || store.rollback(source.id));
    const stableVersionTimestamp = stablePayload && stablePayload.publishedAt
      ? stablePayload.publishedAt
      : "";
    const stableVersionId = stablePayload
      ? buildVersionId(source.id, stableVersionTimestamp)
      : "";
    const stableVersionLabel = stableVersionTimestamp
      ? buildVersionLabel(stableVersionTimestamp, "稳定快照")
      : "";

    if (!result.published) {
      store.enqueueReview({
        createdAt: finishedAt,
        sourceId: source.id,
        reason: result.errors,
        rawPayload,
        candidateVersionId,
        candidateVersionLabel,
        candidateVersionCreatedAt: finishedAt,
        rollbackToVersionId: result.rollback ? stableVersionId : "",
        rollbackToVersionLabel: result.rollback ? stableVersionLabel : "",
        parsed
      });
    }

    const currentState = store.getSourceState(source.id) || {};
    const nextFailureCount = result.published
      ? 0
      : Number(currentState.consecutiveFailureCount || 0) + 1;

    store.saveSourceState(source.id, {
      sourceName: source.name,
      examType: source.examType,
      sourceMode: source.metadata && source.metadata.mode,
      sourceModeLabel: source.metadata && source.metadata.modeLabel,
      sourceModeNote: source.metadata && source.metadata.modeNote,
      scheduleMinutes: source.scheduleMinutes,
      publishSlaMinutes: source.publishSlaMinutes,
      structureFingerprint: nextStructureFingerprint,
      structureSummary: rawPayload.sourceStructure ? rawPayload.sourceStructure.summary : "",
      structureAlert,
      lastStructureChangedAt: structureAlert ? rawPayload.fetchedAt : "",
      structureChangeSummary,
      candidateVersionId,
      candidateVersionLabel,
      candidateVersionCreatedAt: finishedAt,
      stableVersionId: stableVersionId || undefined,
      stableVersionLabel: stableVersionLabel || undefined,
      stableVersionUpdatedAt: stableVersionTimestamp || undefined,
      lastPublishedVersionId: stableVersionId || undefined,
      lastPublishedVersionLabel: stableVersionLabel || undefined,
      rollbackToVersionId: result.rollback ? stableVersionId : "",
      rollbackToVersionLabel: result.rollback ? stableVersionLabel : "",
      gateFailureReason: result.published ? "" : result.errors.join("；"),
      rollbackReason: result.rollback ? (result.errors[0] || "已回退到上一稳定版本") : "",
      releaseMode,
      lastRunFinishedAt: finishedAt,
      lastRunStatus: result.published ? "published" : "failed",
      lastPublishedAt: result.published && result.payload ? result.payload.publishedAt : undefined,
      lastNoticePublishedAt: parsed.notice.publishedAt,
      lastRollback: result.rollback,
      lastErrors: result.errors,
      consecutiveFailureCount: nextFailureCount,
      pendingReviewCount: store.countReviewQueue(source.id),
      lastSuccessAt: result.published && result.payload ? result.payload.publishedAt : undefined,
      lastParseStatus: parsed.batch && parsed.batch.parseStatus,
      lastRowsTotal: parsed.batch && parsed.batch.rowsTotal,
      lastParseLog: parsed.batch && parsed.batch.parseLog,
      correctedPositionCount: positionOverrideResult.stats.correctedPositionCount,
      correctedFieldCount: positionOverrideResult.stats.correctedFieldCount,
      appliedCorrectionRuleCount: positionOverrideResult.stats.appliedRuleCount,
      appliedCorrectionRuleIds: positionOverrideResult.stats.appliedRuleIds,
      candidateWorkbookCount: parseMetrics && parseMetrics.candidateWorkbookCount,
      extractedWorkbookCount: parseMetrics && parseMetrics.extractedWorkbookCount,
      parseErrorCount: parseMetrics && parseMetrics.parseErrorCount,
      matchedFieldCount: parseMetrics && parseMetrics.matchedFieldCount,
      totalFieldCount: parseMetrics && parseMetrics.totalFieldCount,
      fieldCoveragePercent: parseMetrics && parseMetrics.fieldCoveragePercent,
      workbookSheetCount: parseMetrics && parseMetrics.sheetCount,
      workbookSheetSummary: parseMetrics && parseMetrics.sheetSummary,
      workbookPath: parseMetrics && parseMetrics.workbookPath,
      workbookRowCount: parseMetrics && parseMetrics.workbookRowCount
    });

    store.savePublishAudit({
      createdAt: finishedAt,
      sourceId: source.id,
      sourceName: source.name,
      eventType: result.published ? "publish" : (result.rollback ? "rollback" : "publish-blocked"),
      summary: result.published
        ? "Published candidate snapshot"
        : (result.rollback ? "Rollback kept previous stable snapshot" : "Candidate snapshot blocked"),
      detail: result.published
        ? `candidate=${candidateVersionLabel} | stable=${stableVersionLabel || candidateVersionLabel}`
        : `candidate=${candidateVersionLabel} | reason=${result.errors.join(" | ")}`,
      releaseMode,
      releaseOverrideMode: currentState.releaseOverrideMode || "",
      reason: result.errors[0] || "",
      candidateVersionId,
      candidateVersionLabel,
      stableVersionId,
      stableVersionLabel
    });

    store.saveRunLog({
      sourceId: source.id,
      startedAt,
      finishedAt,
      published: result.published,
      rollback: result.rollback,
      errors: result.errors
    });

    return result;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const candidateVersionId = buildVersionId(source.id, finishedAt);
    const candidateVersionLabel = buildVersionLabel(finishedAt, "候选版本");
    const stablePayload = store.rollback(source.id);
    const stableVersionTimestamp = stablePayload && stablePayload.publishedAt
      ? stablePayload.publishedAt
      : "";
    const stableVersionId = stablePayload
      ? buildVersionId(source.id, stableVersionTimestamp)
      : "";
    const stableVersionLabel = stableVersionTimestamp
      ? buildVersionLabel(stableVersionTimestamp, "稳定快照")
      : "";
    store.enqueueReview({
      createdAt: finishedAt,
      sourceId: source.id,
      reason: [error.message],
      rawPayload: null,
      candidateVersionId,
      candidateVersionLabel,
      candidateVersionCreatedAt: finishedAt,
      rollbackToVersionId: stableVersionId,
      rollbackToVersionLabel: stableVersionLabel
    });
    const previousState = store.getSourceState(source.id) || {};
    store.saveSourceState(source.id, {
      sourceName: source.name,
      examType: source.examType,
      sourceMode: source.metadata && source.metadata.mode,
      sourceModeLabel: source.metadata && source.metadata.modeLabel,
      sourceModeNote: source.metadata && source.metadata.modeNote,
      scheduleMinutes: source.scheduleMinutes,
      publishSlaMinutes: source.publishSlaMinutes,
      structureAlert: previousState.structureAlert || false,
      structureChangeSummary: previousState.structureChangeSummary || "",
      lastStructureChangedAt: previousState.lastStructureChangedAt || "",
      candidateVersionId,
      candidateVersionLabel,
      candidateVersionCreatedAt: finishedAt,
      stableVersionId: stableVersionId || undefined,
      stableVersionLabel: stableVersionLabel || undefined,
      stableVersionUpdatedAt: stableVersionTimestamp || undefined,
      lastPublishedVersionId: stableVersionId || undefined,
      lastPublishedVersionLabel: stableVersionLabel || undefined,
      rollbackToVersionId: stableVersionId,
      rollbackToVersionLabel: stableVersionLabel,
      gateFailureReason: error.message,
      rollbackReason: stablePayload ? error.message : "",
      releaseMode: "notice-only",
      lastRunStartedAt: startedAt,
      lastRunFinishedAt: finishedAt,
      lastRunStatus: "error",
      lastRollback: Boolean(stablePayload),
      lastErrors: [error.message],
      consecutiveFailureCount: Number(previousState.consecutiveFailureCount || 0) + 1,
      pendingReviewCount: store.countReviewQueue(source.id)
    });
    store.savePublishAudit({
      createdAt: finishedAt,
      sourceId: source.id,
      sourceName: source.name,
      eventType: stablePayload ? "rollback" : "publish-error",
      summary: stablePayload
        ? "Runtime error triggered rollback to stable snapshot"
        : "Runtime error blocked candidate snapshot",
      detail: `candidate=${candidateVersionLabel} | reason=${error.message}`,
      releaseMode: "notice-only",
      releaseOverrideMode: previousState.releaseOverrideMode || "",
      reason: error.message,
      candidateVersionId,
      candidateVersionLabel,
      stableVersionId,
      stableVersionLabel
    });
    store.saveRunLog({
      sourceId: source.id,
      startedAt,
      finishedAt,
      published: false,
      rollback: Boolean(stablePayload),
      errors: [error.message]
    });
    return {
      published: false,
      rollback: Boolean(stablePayload),
      errors: [error.message],
      stablePayload
    };
  }
}

module.exports = {
  runPipeline
};
