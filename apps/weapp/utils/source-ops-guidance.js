function normalizeReasonText(reasons = []) {
  return (reasons || [])
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function normalizeGateChecks(gateChecks = []) {
  return (gateChecks || []).map((item, index) => ({
    id: item.id || `gate-check-${index + 1}`,
    label: item.label || item.name || `校验项 ${index + 1}`,
    status: item.status || "unknown",
    detail: item.detail || item.message || ""
  }));
}

function isAttachmentOnlyExpected(item = {}) {
  return Boolean(item.attachmentOnlyExpected) || (
    (item.parseQualityStatus === "attachment-only" || item.parseStatus === "attachment-only") &&
    item.expectedPositionWorkbook === false
  );
}

function buildGateCheckSummary(gateChecks = []) {
  const checks = normalizeGateChecks(gateChecks);
  const passedCount = checks.filter((item) => item.status === "pass").length;
  const warningCount = checks.filter((item) => item.status === "warn").length;
  const failedCount = checks.filter((item) => item.status === "fail").length;
  const pendingCount = checks.filter((item) => item.status === "pending").length;
  const parts = [];
  if (passedCount > 0) {
    parts.push(`通过 ${passedCount}`);
  }
  if (warningCount > 0) {
    parts.push(`警告 ${warningCount}`);
  }
  if (failedCount > 0) {
    parts.push(`失败 ${failedCount}`);
  }
  if (pendingCount > 0) {
    parts.push(`待定 ${pendingCount}`);
  }
  return {
    total: checks.length,
    passedCount,
    warningCount,
    failedCount,
    pendingCount,
    summary: parts.join(" · ")
  };
}

function buildSourceGateChecks(sourceState = {}) {
  const blockingPendingReviewCount = Number(
    sourceState.blockingPendingReviewCount !== undefined
      ? sourceState.blockingPendingReviewCount
      : sourceState.pendingReviewCount || 0
  );
  const stalePendingReviewCount = Number(sourceState.stalePendingReviewCount || 0);
  const explicitChecks = normalizeGateChecks(sourceState.gateChecks || []);
  if (explicitChecks.length) {
    return explicitChecks;
  }

  const checks = [];
  if (sourceState.releaseOverrideActive) {
    checks.push({
      id: "manual-release",
      label: "人工发布策略",
      status: sourceState.releaseOverrideApplied ? "warn" : "fail",
      detail: sourceState.releaseOverrideMode === "notice-only"
        ? (sourceState.releaseOverrideReason || "已人工锁定为仅公告模式")
        : (
          sourceState.releaseOverrideApplied
            ? (sourceState.releaseOverrideReason || "已人工开放岗位能力")
            : (sourceState.releaseOverrideBlockedReason || "人工开放岗位能力未生效")
        )
    });
  }
  const parseQualityStatus = String(sourceState.parseQualityStatus || "").trim();
  if (parseQualityStatus) {
    const attachmentOnlyExpected = isAttachmentOnlyExpected(sourceState);
    checks.push({
      id: "parse-quality",
      label: attachmentOnlyExpected ? "公告阶段识别" : "岗位表结构化质量",
      status: parseQualityStatus === "healthy" || attachmentOnlyExpected ? "pass" : (parseQualityStatus === "warning" ? "fail" : "warn"),
      detail: attachmentOnlyExpected
        ? (sourceState.parseQualitySummary || "当前公告阶段以流程追踪为主，通常不包含岗位表")
        : (sourceState.parseQualitySummary || "")
    });
  }

  if (blockingPendingReviewCount > 0) {
    checks.push({
      id: "manual-review",
      label: "人工复核队列",
      status: "fail",
      detail: `当前待复核 ${blockingPendingReviewCount} 条`
    });
  }
  if (stalePendingReviewCount > 0) {
    checks.push({
      id: "stale-review",
      label: "历史复核积压",
      status: "warn",
      detail: `存在 ${stalePendingReviewCount} 条历史复核记录，建议清理`
    });
  }

  if (Number(sourceState.candidateWorkbookCount || 0) > 0 || Number(sourceState.extractedWorkbookCount || 0) > 0) {
    checks.push({
      id: "workbook-extraction",
      label: "岗位表附件识别",
      status: Number(sourceState.extractedWorkbookCount || 0) > 0 ? "pass" : "warn",
      detail: `候选 ${Number(sourceState.candidateWorkbookCount || 0)} 个，解包 ${Number(sourceState.extractedWorkbookCount || 0)} 个`
    });
  }

  if (sourceState.structureAlert) {
    checks.push({
      id: "dom-structure",
      label: "来源结构变化",
      status: "warn",
      detail: sourceState.structureChangeSummary || "来源页面结构发生变化"
    });
  }

  return checks;
}

function buildReviewGateChecks(reviewItem = {}) {
  const explicitChecks = normalizeGateChecks(reviewItem.gateChecks || []);
  if (explicitChecks.length) {
    return explicitChecks;
  }

  const checks = [
    {
      id: "raw-payload",
      label: "原始快照保留",
      status: reviewItem.hasRawPayload ? "pass" : "fail",
      detail: reviewItem.hasRawPayload ? "原始页面/附件已保留" : "原始页面/附件缺失"
    },
    {
      id: "parsed-payload",
      label: "解析结果生成",
      status: reviewItem.hasParsedPayload ? "pass" : "fail",
      detail: reviewItem.hasParsedPayload ? "已生成结构化结果" : "尚未生成结构化结果"
    }
  ];

  if (Number(reviewItem.fieldCoveragePercent || 0) > 0) {
    checks.push({
      id: "field-coverage",
      label: "关键字段覆盖率",
      status: Number(reviewItem.fieldCoveragePercent || 0) >= 90 ? "pass" : (Number(reviewItem.fieldCoveragePercent || 0) >= 70 ? "warn" : "fail"),
      detail: `覆盖率 ${reviewItem.fieldCoveragePercent}%`
    });
  } else if (reviewItem.parseStatus === "attachment-only") {
    const attachmentOnlyExpected = isAttachmentOnlyExpected(reviewItem);
    checks.push({
      id: "field-coverage",
      label: attachmentOnlyExpected ? "公告阶段识别" : "关键字段覆盖率",
      status: attachmentOnlyExpected ? "pass" : "warn",
      detail: attachmentOnlyExpected
        ? "当前阶段以流程追踪为主，通常不包含岗位表"
        : "当前仅完成公告/附件解析"
    });
  }

  return checks;
}

function buildSourcePublishGate(sourceState = {}) {
  const pendingReviewCount = Number(
    sourceState.blockingPendingReviewCount !== undefined
      ? sourceState.blockingPendingReviewCount
      : sourceState.pendingReviewCount || 0
  );
  const stalePendingReviewCount = Number(sourceState.stalePendingReviewCount || 0);
  const parseQualityStatus = String(sourceState.parseQualityStatus || "").trim();
  const hasFailures = Number(sourceState.consecutiveFailureCount || 0) > 0;
  const hasOverdue = Boolean(sourceState.fetchOverdue) || Boolean(sourceState.publishOverdue);
  const lastRunStatus = String(sourceState.lastRunStatus || "").trim();
  const stableVersionLabel = String(
    sourceState.stableVersionLabel ||
    sourceState.lastPublishedVersionLabel ||
    sourceState.lastPublishedVersionId ||
    sourceState.stableVersionId ||
    ""
  ).trim();
  const stableVersionHint = stableVersionLabel ? `当前稳定版本：${stableVersionLabel}。` : "";
  const gateFailureReason = String(sourceState.gateFailureReason || "").trim();
  const rollbackReason = String(sourceState.rollbackReason || "").trim();
  const attachmentOnlyExpected = isAttachmentOnlyExpected(sourceState);

  if (sourceState.sourceMode === "demo") {
    return {
      status: "demo",
      label: "演示来源，不作为生产发布",
      detail: sourceState.sourceModeNote || "当前来源仅用于产品演示，不应作为正式公告发布链路。",
      tone: "warn",
      focus: "run"
    };
  }

  if (sourceState.lastRollback) {
    return {
      status: "rollback",
      label: "前台继续使用上一稳定版本",
      detail: `${stableVersionHint}${rollbackReason || gateFailureReason || "本次抓取或解析结果未通过发布条件，前台应继续保留上一稳定版本，复核完成后再重新放量。"}`,
      tone: "warn",
      focus: pendingReviewCount > 0 ? "review" : "run"
    };
  }

  if (lastRunStatus === "error" || lastRunStatus === "failed" || hasFailures) {
    return {
      status: "blocked",
      label: pendingReviewCount > 0 ? "暂停发布，等待人工复核" : "运行异常，暂不发布",
      detail: `${stableVersionHint}${gateFailureReason || (
        pendingReviewCount > 0
          ? "本轮运行未形成可直接发布的稳定结果，进入人工复核前不要替换前台数据。"
          : "来源近期存在连续失败或校验失败，恢复稳定前不应替换前台版本。"
      )}`,
      tone: "warn",
      focus: pendingReviewCount > 0 ? "review" : "run"
    };
  }

  if (pendingReviewCount > 0) {
    if (parseQualityStatus === "healthy") {
      return {
        status: "review",
        label: "结构化结果待复核后发布",
        detail: `${stableVersionHint}${gateFailureReason || "岗位表已经结构化，但仍有待复核项，前台建议继续保留上一稳定版本。"}`,
        tone: "warn",
        focus: "review"
      };
    }
    if (parseQualityStatus === "warning") {
      return {
        status: "notice-only",
        label: "仅公告可发布，岗位表先复核",
        detail: `${stableVersionHint}${gateFailureReason || "公告可先展示，但字段命中率不足，岗位筛选、对比和推荐应继续关闭。"}`,
        tone: "warn",
        focus: "parse"
      };
    }
    return {
      status: "notice-only",
      label: "仅公告可发布",
      detail: `${stableVersionHint}${gateFailureReason || "当前尚未形成稳定结构化岗位表，前台只展示公告与附件，不开放岗位能力。"}`,
      tone: "warn",
      focus: "parse"
    };
  }

  if (parseQualityStatus === "warning") {
    return {
      status: "parse-warning",
      label: "岗位表需复核后再放开",
      detail: "结构化结果已产出，但字段质量仍需人工抽样核对，建议暂不开放岗位对比。",
      tone: "warn",
      focus: "parse"
    };
  }

  if (parseQualityStatus === "attachment-only") {
    if (attachmentOnlyExpected) {
      return {
        status: "tracking-only",
        label: "当前阶段以公告追踪为主",
        detail: `${sourceState.currentNoticeStageLabel || "当前"}阶段通常不包含岗位表，前台保持公告与流程追踪模式，不开放岗位筛选和对比。`,
        tone: "neutral",
        focus: ""
      };
    }
    return {
      status: "notice-only",
      label: "当前只发布公告",
      detail: "来源只完成公告与附件解析，岗位表未通过稳定结构化校验，前台保持公告模式。",
      tone: "warn",
      focus: "parse"
    };
  }

  if (hasOverdue) {
    return {
      status: "healthy-with-sla-risk",
      label: "结构化可发布，但需盯紧时效",
      detail: "当前结果可供前台使用，但抓取或发布时间已接近阈值，需要继续观察后续 SLA。",
      tone: "neutral",
      focus: "sla"
    };
  }

  if (stalePendingReviewCount > 0) {
    return {
      status: "healthy-with-backlog",
      label: "结构化可发布，但有历史复核积压",
      detail: `当前结构化结果可正常使用，另有 ${stalePendingReviewCount} 条历史复核记录建议清理，不影响当前岗位能力开放。`,
      tone: "neutral",
      focus: "review"
    };
  }

  return {
    status: "healthy",
    label: "结构化结果可发布",
    detail: "公告和岗位表都满足当前发布条件，可正常进入前台筛岗、对比和推荐流程。",
    tone: "ok",
    focus: ""
  };
}

function buildSourceRiskSummary(sourceState = {}) {
  const parts = [];
  const blockingPendingReviewCount = Number(
    sourceState.blockingPendingReviewCount !== undefined
      ? sourceState.blockingPendingReviewCount
      : sourceState.pendingReviewCount || 0
  );
  if (sourceState.fetchOverdue || sourceState.publishOverdue) {
    parts.push(`SLA ${sourceState.fetchOverdue && sourceState.publishOverdue ? "抓取/发布都超时" : (sourceState.fetchOverdue ? "抓取超时" : "发布超时")}`);
  }
  if (blockingPendingReviewCount > 0) {
    parts.push(`${blockingPendingReviewCount} 条待复核`);
  }
  if (Number(sourceState.stalePendingReviewCount || 0) > 0) {
    parts.push(`${sourceState.stalePendingReviewCount} 条历史复核积压`);
  }
  if (Number(sourceState.consecutiveFailureCount || 0) > 0) {
    parts.push(`${sourceState.consecutiveFailureCount} 次连续失败`);
  }
  if (sourceState.structureAlert) {
    parts.push("来源结构发生变化");
  }
  if (sourceState.parseQualityStatus === "warning" && Number(sourceState.fieldCoveragePercent || 0) > 0) {
    parts.push(`字段覆盖率 ${sourceState.fieldCoveragePercent}%`);
  }
  if (sourceState.parseQualityStatus === "attachment-only") {
    parts.push(isAttachmentOnlyExpected(sourceState) ? "当前阶段仅需公告追踪" : "岗位表未形成稳定结构化");
  }

  if (!parts.length) {
    return {
      headline: "当前抓取、发布和结构化状态正常",
      detail: "这个来源暂时没有明显时效或解析风险，可按当前周期继续巡检。"
    };
  }

  return {
    headline: parts[0],
    detail: parts.join(" · ")
  };
}

function buildReviewPriority(reviewItem = {}) {
  const reasonsText = normalizeReasonText(reviewItem.reasons);
  let score = 0;

  if (!reviewItem.hasRawPayload) {
    score += 4;
  }
  if (!reviewItem.hasParsedPayload) {
    score += 3;
  }
  if (reasonsText.includes("下载失败") || reasonsText.includes("链接失效")) {
    score += 3;
  }
  if (reasonsText.includes("字段映射失败") || reasonsText.includes("表头识别失败")) {
    score += 2;
  }
  if (Number(reviewItem.fieldCoveragePercent || 0) > 0 && Number(reviewItem.fieldCoveragePercent || 0) < 70) {
    score += 3;
  } else if (Number(reviewItem.fieldCoveragePercent || 0) >= 70 && Number(reviewItem.fieldCoveragePercent || 0) < 90) {
    score += 2;
  }
  if (reviewItem.parseStatus === "attachment-only" && !isAttachmentOnlyExpected(reviewItem)) {
    score += 1;
  }
  if (reviewItem.hasParsedPayload && Number(reviewItem.rowsTotal || 0) === 0) {
    score += 2;
  }

  if (score >= 7) {
    return {
      level: "high",
      label: "高优先级",
      tagClass: "tag-active",
      score
    };
  }
  if (score >= 4) {
    return {
      level: "medium",
      label: "中优先级",
      tagClass: "tag-warn",
      score
    };
  }
  return {
    level: "low",
    label: "低优先级",
    tagClass: "",
    score
  };
}

function buildReviewResolutionSuggestion(reviewItem = {}) {
  if (!reviewItem.hasRawPayload) {
    return "先核对原始页面或附件是否下载成功，再决定是否重跑抓取。";
  }
  if (!reviewItem.hasParsedPayload) {
    return "原始快照已保留，优先排查解析器、模板识别和字段映射。";
  }
  if (Number(reviewItem.fieldCoveragePercent || 0) > 0 && Number(reviewItem.fieldCoveragePercent || 0) < 70) {
    return "优先检查表头模板、合并单元格处理和字段映射日志，抽样核对关键字段。";
  }
  if (reviewItem.parseStatus === "attachment-only") {
    if (isAttachmentOnlyExpected(reviewItem)) {
      return "确认公告阶段归类是否正确；如果确认为资格审核、面试等后续阶段，可按公告追踪处理。";
    }
    return "先确认本轮是否只能展示公告，再决定是否继续开放岗位入口。";
  }
  if (reviewItem.hasParsedPayload && Number(reviewItem.rowsTotal || 0) === 0) {
    return "检查工作表识别结果，确认是空表、下载问题还是表头命中失败。";
  }
  return "人工抽样核对报名时间、岗位数和关键字段后，再决定是否恢复发布。";
}

function buildReviewReleaseImpact(reviewItem = {}) {
  if (!reviewItem.hasRawPayload || !reviewItem.hasParsedPayload) {
    return "当前无法形成新稳定版本，前台应继续使用上一稳定版本。";
  }
  if (reviewItem.parseStatus === "attachment-only") {
    if (isAttachmentOnlyExpected(reviewItem)) {
      return "当前阶段适合公告和流程追踪，不影响上一稳定岗位表能力。";
    }
    return "当前只适合公告展示，不应开放岗位筛选、岗位对比和推荐。";
  }
  if (Number(reviewItem.fieldCoveragePercent || 0) > 0 && Number(reviewItem.fieldCoveragePercent || 0) < 70) {
    return "结构化质量不足，恢复发布前需要先确认关键字段映射。";
  }
  return "问题更偏向结构化质量，复核通过后可恢复正常发布。";
}

module.exports = {
  normalizeGateChecks,
  buildGateCheckSummary,
  buildSourceGateChecks,
  buildReviewGateChecks,
  buildSourcePublishGate,
  buildSourceRiskSummary,
  buildReviewPriority,
  buildReviewResolutionSuggestion,
  buildReviewReleaseImpact
};
