const { mapSourceState } = require("./publish/source-state");
const { summarizeReviewQueueForSource } = require("./review-analysis");

function buildRiskFlags(sourceState) {
  const flags = [];
  if (sourceState.sourceMode === "demo") {
    flags.push("demo-source");
  }
  if (sourceState.pendingReviewCount > 0) {
    flags.push("pending-review");
  }
  if (sourceState.lastRollback) {
    flags.push("rollback-active");
  }
  if (sourceState.fetchOverdue) {
    flags.push("fetch-overdue");
  }
  if (sourceState.publishOverdue) {
    flags.push("publish-overdue");
  }
  if (sourceState.structureAlert) {
    flags.push("structure-alert");
  }
  if (sourceState.parseQualityStatus === "warning") {
    flags.push("parse-warning");
  }
  if (sourceState.parseQualityStatus === "attachment-only") {
    flags.push("attachment-only");
  }
  if (sourceState.releaseOverrideActive) {
    flags.push(sourceState.releaseOverrideApplied ? "manual-release-override" : "blocked-release-override");
  }
  if (sourceState.lastRunStatus === "failed" || sourceState.lastRunStatus === "error") {
    flags.push("run-failed");
  }
  if (sourceState.consecutiveFailureCount > 0) {
    flags.push("consecutive-failures");
  }
  return flags;
}

function deriveReadiness(sourceState, reviewSummary = {}) {
  const blockingPendingReviewCount = Number(reviewSummary.blockingPendingCount || sourceState.blockingPendingReviewCount || 0);
  const stalePendingReviewCount = Number(reviewSummary.stalePendingCount || sourceState.stalePendingReviewCount || 0);
  if (sourceState.sourceMode === "demo") {
    return {
      status: "demo",
      label: "演示源",
      nextAction: "保持演示标记；真实官方链路稳定前不要按正式来源开放。"
    };
  }

  if (sourceState.lastRollback || sourceState.lastRunStatus === "failed" || sourceState.lastRunStatus === "error") {
    return {
      status: "blocked",
      label: "已回退/阻塞",
      nextAction: "继续使用上一稳定版本，先定位本轮失败原因。"
    };
  }

  if (blockingPendingReviewCount > 0) {
    return {
      status: "manual-review",
      label: "待人工复核",
      nextAction: `先处理 ${blockingPendingReviewCount} 条阻塞复核记录，再决定是否开放岗位能力。`
    };
  }

  if (sourceState.structureAlert) {
    return {
      status: "manual-review",
      label: "结构变更待确认",
      nextAction: "来源结构已变化，先人工核对 DOM/附件模板，再决定是否继续自动发布。"
    };
  }

  if (sourceState.fetchOverdue || sourceState.publishOverdue) {
    return {
      status: "blocked",
      label: "SLA 超时",
      nextAction: "检查调度、抓取链路和发布链路，确认最近成功抓取与发布时间。"
    };
  }

  if (sourceState.parseQualityStatus === "attachment-only") {
    return {
      status: "tracking-only",
      label: "仅公告跟踪",
      nextAction: "当前只适合展示公告；岗位表结构化稳定前不要开放选岗和对比。"
    };
  }

  if (sourceState.parseQualityStatus === "warning") {
    return {
      status: "manual-review",
      label: "解析质量预警",
      nextAction: "抽样核对岗位字段命中率，必要时补字段映射或纠错规则。"
    };
  }

  if (sourceState.releaseOverrideActive && !sourceState.releaseOverrideApplied) {
    return {
      status: "manual-review",
      label: "人工放开被拦截",
      nextAction: "当前人工放开未通过发布闸门，先清理失败、复核或解析问题。"
    };
  }

  if (sourceState.releaseMode === "positions-open") {
    if (stalePendingReviewCount > 0) {
      return {
        status: "ready-with-backlog",
        label: "可开放，但有历史复核积压",
        nextAction: `当前来源可继续开放岗位能力；另有 ${stalePendingReviewCount} 条历史复核记录建议批量清理。`
      };
    }
    return {
      status: "ready",
      label: "可开放岗位能力",
      nextAction: "可继续开放岗位检索、对比与推荐能力。"
    };
  }

  return {
    status: "tracking-only",
    label: "仅公告模式",
    nextAction: "当前保持公告模式，待闸门条件满足后再开放岗位能力。"
  };
}

function summarizeCounts(items) {
  return items.reduce((summary, item) => {
    const key = item.readiness.status;
    summary.total += 1;
    summary.byReadiness[key] = (summary.byReadiness[key] || 0) + 1;
    if (item.riskFlags.length > 0) {
      summary.risky += 1;
    }
    return summary;
  }, {
    total: 0,
    risky: 0,
    byReadiness: {}
  });
}

function buildSourceHealthItem(state, options = {}) {
  const mapped = mapSourceState(state, options);
  const reviewSummary = summarizeReviewQueueForSource(options.reviewQueue || [], mapped);
  const readiness = deriveReadiness(mapped, reviewSummary);
  const riskFlags = buildRiskFlags(mapped);
  if (Number(reviewSummary.stalePendingCount || 0) > 0) {
    riskFlags.push("stale-review-backlog");
  }
  const pendingReviewCount = Number(reviewSummary.pendingCount || 0);
  return {
    sourceId: mapped.sourceId,
    sourceName: mapped.sourceName,
    examType: mapped.examType,
    sourceMode: mapped.sourceMode,
    sourceModeLabel: mapped.sourceModeLabel,
    releaseMode: mapped.releaseMode,
    releaseModeStrategy: mapped.releaseModeStrategy,
    releaseOverrideActive: mapped.releaseOverrideActive,
    releaseOverrideApplied: mapped.releaseOverrideApplied,
    releaseOverrideMode: mapped.releaseOverrideMode,
    lastRunStatus: mapped.lastRunStatus,
    slaStatus: mapped.slaStatus,
    parseQualityStatus: mapped.parseQualityStatus,
    parseQualitySummary: mapped.parseQualitySummary,
    pendingReviewCount,
    blockingPendingReviewCount: reviewSummary.blockingPendingCount,
    stalePendingReviewCount: reviewSummary.stalePendingCount,
    consecutiveFailureCount: mapped.consecutiveFailureCount,
    lastFetchedAt: mapped.lastFetchedAt,
    lastPublishedAt: mapped.lastPublishedAt,
    lastNoticePublishedAt: mapped.lastNoticePublishedAt,
    candidateVersionLabel: mapped.candidateVersionLabel,
    stableVersionLabel: mapped.stableVersionLabel,
    workbookRowCount: mapped.workbookRowCount,
    fieldCoveragePercent: mapped.fieldCoveragePercent,
    riskFlags,
    readiness,
    nextAction: readiness.nextAction,
    staleReviewIds: reviewSummary.staleReviewIds || [],
    blockingReviewIds: reviewSummary.blockingReviewIds || []
  };
}

function buildIngestHealthReport(store, options = {}) {
  const sourceId = options.sourceId ? String(options.sourceId).trim() : "";
  const auditLimit = Number.isFinite(Number(options.auditLimit)) ? Number(options.auditLimit) : 5;
  const sourceStates = store.listSourceStates()
    .filter((item) => !sourceId || item.sourceId === sourceId)
    .map((item) => buildSourceHealthItem(item, {
      ...options,
      reviewQueue: store.listReviewQueue()
    }))
    .sort((left, right) => String(left.sourceId).localeCompare(String(right.sourceId)));

  const audits = store.listPublishAudits(sourceId)
    .slice(0, Math.max(0, auditLimit))
    .map((item) => ({
      createdAt: item.createdAt,
      sourceId: item.sourceId,
      sourceName: item.sourceName,
      eventType: item.eventType,
      summary: item.summary,
      detail: item.detail,
      releaseMode: item.releaseMode,
      releaseOverrideMode: item.releaseOverrideMode
    }));

  return {
    generatedAt: options.now || new Date().toISOString(),
    summary: summarizeCounts(sourceStates),
    sources: sourceStates,
    recentAudits: audits
  };
}

module.exports = {
  buildRiskFlags,
  deriveReadiness,
  buildSourceHealthItem,
  buildIngestHealthReport
};
