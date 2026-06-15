const api = require("../../utils/api");
const {
  buildSourceGateChecks,
  buildGateCheckSummary,
  buildSourcePublishGate,
  buildSourceRiskSummary
} = require("../../utils/source-ops-guidance");

function mapExamType(examType) {
  if (examType === "guangdong-provincial") {
    return "广东省考";
  }
  if (examType === "national") {
    return "国考";
  }
  return examType || "未知类型";
}

function mapRunStatus(status) {
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
  return "未知";
}

function mapParseQuality(item) {
  if (item.parseQualityStatus === "healthy") {
    return "岗位表稳定";
  }
  if (item.parseQualityStatus === "warning") {
    return "岗位表需关注";
  }
  if (item.parseQualityStatus === "attachment-only") {
    if (item.expectedPositionWorkbook === false || item.attachmentOnlyExpected) {
      return "阶段公告追踪";
    }
    return "仅公告未结构化";
  }
  return "解析状态未知";
}

function mapSourceModeLabel(item) {
  return item.sourceModeLabel || (item.sourceMode === "demo" ? "演示" : "官方");
}

function showToast(title, icon = "none") {
  if (typeof wx !== "undefined" && wx && typeof wx.showToast === "function") {
    wx.showToast({ title, icon });
  }
}

function isParseIssue(item = {}) {
  return item.parseQualityStatus === "warning" || (
    item.parseQualityStatus === "attachment-only" &&
    item.expectedPositionWorkbook !== false &&
    !item.attachmentOnlyExpected
  );
}

function getRiskScore(item) {
  return [
    item.fetchOverdue || item.publishOverdue ? 1 : 0,
    item.structureAlert ? 1 : 0,
    Number(item.pendingReviewCount || 0) > 0 ? 1 : 0,
    Number(item.consecutiveFailureCount || 0) > 0 ? 1 : 0,
    Boolean(item.lastRollback) || Boolean(item.rollbackReason) ? 1 : 0,
    isParseIssue(item) ? 1 : 0
  ].reduce((sum, value) => sum + value, 0);
}

function isCoverageRisk(item = {}) {
  return Number(item.fieldCoveragePercent || 0) > 0 && Number(item.fieldCoveragePercent || 0) < 90;
}

function isAttachmentOnlyRisk(item = {}) {
  return item.parseQualityStatus === "attachment-only" &&
    item.expectedPositionWorkbook !== false &&
    !item.attachmentOnlyExpected;
}

function isWorkbookRisk(item = {}) {
  return (
    Number(item.parseErrorCount || 0) > 0 ||
    (Number(item.candidateWorkbookCount || 0) > 0 && Number(item.extractedWorkbookCount || 0) === 0)
  );
}

function isBlockingReviewRisk(item = {}) {
  const blockingPendingReviewCount = Number(
    item.blockingPendingReviewCount !== undefined
      ? item.blockingPendingReviewCount
      : item.pendingReviewCount || 0
  );
  return blockingPendingReviewCount > 0 && item.publishGate && item.publishGate.focus === "review";
}

function buildQualityFocusItem(item = {}) {
  if (isBlockingReviewRisk(item)) {
    return {
      sourceId: item.sourceId || "",
      sourceName: item.sourceName || "",
      headline: "待复核阻塞发布",
      detail: `当前待复核 ${item.blockingPendingReviewCount !== undefined ? item.blockingPendingReviewCount : item.pendingReviewCount || 0} 条` +
        `${item.gateFailureReason ? ` · ${item.gateFailureReason}` : ""}`,
      action: "review",
      reviewFocus: "blocking",
      actionLabel: "处理待复核",
      tagLabel: item.parseQualityLabel || "待复核",
      tagClass: "tag-warn"
    };
  }

  if (isWorkbookRisk(item)) {
    return {
      sourceId: item.sourceId || "",
      sourceName: item.sourceName || "",
      headline: "岗位表解析异常",
      detail: [
        Number(item.parseErrorCount || 0) > 0 ? `解析错误 ${item.parseErrorCount} 个` : "",
        Number(item.candidateWorkbookCount || 0) > 0
          ? `候选附件 ${item.candidateWorkbookCount} 个，已解包 ${item.extractedWorkbookCount || 0} 个`
          : "",
        item.workbookSheetSummary || item.parseQualitySummary || ""
      ].filter(Boolean).join(" · "),
      action: "status",
      focus: "parse",
      actionLabel: "查看解析质量",
      tagLabel: "解析异常",
      tagClass: "tag-warn"
    };
  }

  if (isAttachmentOnlyRisk(item)) {
    return {
      sourceId: item.sourceId || "",
      sourceName: item.sourceName || "",
      headline: "仅公告未结构化",
      detail: item.parseQualitySummary || "当前岗位表还未形成稳定结构化结果。",
      action: "status",
      focus: "parse",
      actionLabel: "查看公告模式原因",
      tagLabel: item.parseQualityLabel || "仅公告",
      tagClass: "tag-warn"
    };
  }

  if (isCoverageRisk(item)) {
    return {
      sourceId: item.sourceId || "",
      sourceName: item.sourceName || "",
      headline: "字段覆盖率偏低",
      detail: [
        `当前覆盖率 ${item.fieldCoveragePercent}%`,
        item.workbookSheetSummary || "",
        item.parseQualitySummary || ""
      ].filter(Boolean).join(" · "),
      action: "status",
      focus: "parse",
      actionLabel: "查看覆盖率详情",
      tagLabel: "覆盖率偏低",
      tagClass: "tag-warn"
    };
  }

  return null;
}

function buildQualitySummary(sourceStates = []) {
  const items = (sourceStates || [])
    .map((item) => ({
      priority: isBlockingReviewRisk(item)
        ? 4
        : (isWorkbookRisk(item) ? 3 : (isAttachmentOnlyRisk(item) ? 2 : (isCoverageRisk(item) ? 1 : 0))),
      focusItem: buildQualityFocusItem(item),
      item
    }))
    .filter((entry) => entry.focusItem)
    .sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }
      return getRiskScore(right.item) - getRiskScore(left.item);
    })
    .map((entry) => entry.focusItem);

  return {
    structuredHealthyCount: (sourceStates || []).filter(
      (item) => item.parseQualityStatus === "healthy" && Number(item.fieldCoveragePercent || 0) >= 90
    ).length,
    coverageRiskCount: (sourceStates || []).filter(isCoverageRisk).length,
    attachmentOnlyCount: (sourceStates || []).filter(isAttachmentOnlyRisk).length,
    workbookRiskCount: (sourceStates || []).filter(isWorkbookRisk).length,
    reviewBlockedCount: (sourceStates || []).filter(isBlockingReviewRisk).length,
    items: items.slice(0, 4)
  };
}

function buildSourceFilterSummary(sourceStates = [], activeFocus = "") {
  const scopedSourceStates = sourceStates || [];
  return {
    activeFocus: activeFocus || "",
    allCount: scopedSourceStates.length,
    reviewCount: scopedSourceStates.filter((item) => matchesFocus(item, "review")).length,
    parseCount: scopedSourceStates.filter((item) => matchesFocus(item, "parse")).length,
    rollbackCount: scopedSourceStates.filter((item) => matchesFocus(item, "rollback")).length,
    runCount: scopedSourceStates.filter((item) => matchesFocus(item, "run")).length,
    slaCount: scopedSourceStates.filter((item) => matchesFocus(item, "sla")).length
  };
}

function getPrimarySourceGroupId(item = {}) {
  if (matchesFocus(item, "review")) {
    return "review";
  }
  if (matchesFocus(item, "parse")) {
    return "parse";
  }
  if (matchesFocus(item, "rollback")) {
    return "rollback";
  }
  if (matchesFocus(item, "run")) {
    return "run";
  }
  if (matchesFocus(item, "sla")) {
    return "sla";
  }
  return "watch";
}

function buildGroupedSourceEntry(item = {}, groupId = "") {
  const action = groupId === "review" ? "review" : "status";
  const focus = groupId === "watch"
    ? ((item.publishGate && item.publishGate.focus) || (item.nextAction && item.nextAction.focus) || "")
    : (groupId === "review" ? "" : groupId);
  const reviewFocus = groupId === "review" ? "blocking" : "";

  return {
    sourceId: item.sourceId || "",
    sourceName: item.sourceName || "",
    headline: item.opsSnapshot && item.opsSnapshot.headline
      ? item.opsSnapshot.headline
      : ((item.publishGate && item.publishGate.label) || ""),
    detail: item.opsSnapshot && item.opsSnapshot.detail
      ? item.opsSnapshot.detail
      : ((item.riskSummary && item.riskSummary.detail) || ""),
    action,
    focus,
    reviewFocus,
    actionLabel: groupId === "review"
      ? "处理待复核"
      : ((item.nextAction && item.nextAction.focus) === "review" ? "打开复核中心" : "查看对应风险")
  };
}

function buildSourceGroups(sourceStates = []) {
  const groupMeta = {
    review: {
      id: "review",
      label: "复核阻塞",
      description: "优先处理会直接挡住新版本发布的待复核来源。",
      tagClass: "tag-warn"
    },
    parse: {
      id: "parse",
      label: "解析异常",
      description: "岗位表结构化还不稳定，适合优先修解析或映射规则。",
      tagClass: "tag-warn"
    },
    rollback: {
      id: "rollback",
      label: "绋冲畾鍥為€€",
      description: "鏈疆鏂扮増鏈病鑳藉畨鍏ㄦ斁琛岋紝鍓嶅彴杩樺湪浣跨敤涓婁竴涓ǔ瀹氱増鏈紝闇€浼樺厛鐪嬪洖閫€鍘熷洜銆?",
      tagClass: "tag-warn"
    },
    run: {
      id: "run",
      label: "运行异常",
      description: "抓取或发布链路异常，先恢复任务运行和稳定版本切换。",
      tagClass: "tag-active"
    },
    sla: {
      id: "sla",
      label: "SLA 风险",
      description: "数据还能用，但抓取或发布时间已经接近或超过 SLA。",
      tagClass: "tag-active"
    },
    watch: {
      id: "watch",
      label: "其余观察",
      description: "当前没有进入高优先桶，但仍建议保持追踪。",
      tagClass: ""
    }
  };
  groupMeta.review.actionLabel = "批量处理阻塞复核";
  groupMeta.review.action = "review";
  groupMeta.review.focus = "";
  groupMeta.review.reviewFocus = "blocking";
  groupMeta.parse.actionLabel = "只看解析异常";
  groupMeta.parse.action = "focus";
  groupMeta.parse.focus = "parse";
  groupMeta.parse.reviewFocus = "";
  groupMeta.rollback.actionLabel = "鍙湅鍥為€€鏉ユ簮";
  groupMeta.rollback.action = "focus";
  groupMeta.rollback.focus = "rollback";
  groupMeta.rollback.reviewFocus = "";
  groupMeta.run.actionLabel = "只看运行异常";
  groupMeta.run.action = "focus";
  groupMeta.run.focus = "run";
  groupMeta.run.reviewFocus = "";
  groupMeta.sla.actionLabel = "只看 SLA 风险";
  groupMeta.sla.action = "focus";
  groupMeta.sla.focus = "sla";
  groupMeta.sla.reviewFocus = "";
  groupMeta.watch.actionLabel = "查看全部来源";
  groupMeta.watch.action = "focus";
  groupMeta.watch.focus = "";
  groupMeta.watch.reviewFocus = "";

  const grouped = (sourceStates || []).reduce((result, item) => {
    const groupId = getPrimarySourceGroupId(item);
    if (!result[groupId]) {
      const meta = groupMeta[groupId];
      result[groupId] = {
        ...meta,
        items: []
      };
    }
    result[groupId].items.push(buildGroupedSourceEntry(item, groupId));
    return result;
  }, {});

  return ["review", "parse", "rollback", "run", "sla", "watch"]
    .map((groupId) => grouped[groupId] || null)
    .filter((group) => group && group.items.length)
    .map((group) => ({
      ...group,
      count: group.items.length
    }));
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

  if (Boolean(item.lastRollback) || Boolean(item.rollbackReason)) {
    return {
      focus: "rollback",
      label: "鍏堢‘璁ょǔ瀹氬洖閫€鍘熷洜",
      detail: item.rollbackReason || item.gateFailureReason || "鏈疆鏂扮増鏈湭鑳介€氳繃鍙戝竷闂搁棬锛屽墠鍙扮户缁娇鐢ㄧǔ瀹氱増鏈?"
    };
  }

  if (item.publishGate && item.publishGate.focus === "sla") {
    return {
      focus: "sla",
      label: "盯紧本轮时效",
      detail: "当前可以继续使用，但需要关注抓取和发布时间是否逼近 SLA"
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

function matchesFocus(item, focus) {
  if (!focus) {
    return true;
  }
  if (focus === "review") {
    const blockingPendingReviewCount = Number(
      item.blockingPendingReviewCount !== undefined
        ? item.blockingPendingReviewCount
        : ((item.publishGate && item.publishGate.focus === "review") ? (item.pendingReviewCount || 0) : 0)
    );
    return (
      blockingPendingReviewCount > 0 ||
      (item.publishGate && item.publishGate.focus === "review") ||
      item.type === "review-queued"
    );
  }
  if (focus === "sla") {
    return Boolean(item.fetchOverdue) || Boolean(item.publishOverdue) || item.type === "sla-overdue" || item.type === "sla-warning";
  }
  if (focus === "structure") {
    return Boolean(item.structureAlert) || item.type === "structure-change";
  }
  if (focus === "rollback") {
    return (
      Boolean(item.lastRollback) ||
      Boolean(item.rollbackReason) ||
      (item.publishGate && item.publishGate.status === "rollback") ||
      item.type === "rollback"
    );
  }
  if (focus === "run") {
    return (
      Number(item.consecutiveFailureCount || 0) > 0 ||
      item.type === "run-failed"
    );
  }
  if (focus === "parse") {
    return isParseIssue(item);
  }
  if (focus === "alert") {
    return true;
  }
  return true;
}

function canManageReleaseControls(apiConfig) {
  return Boolean(apiConfig && apiConfig.usingRemote && apiConfig.baseUrl);
}

function buildReviewCenterUrl(sourceId = "", reviewFocus = "", reasonKey = "") {
  const params = [];
  if (sourceId) {
    params.push(`sourceId=${encodeURIComponent(sourceId)}`);
  }
  if (reviewFocus) {
    params.push(`focus=${encodeURIComponent(reviewFocus)}`);
  }
  if (reasonKey) {
    params.push(`reasonKey=${encodeURIComponent(reasonKey)}`);
  }
  return `/pages/review-center/index${params.length ? `?${params.join("&")}` : ""}`;
}

function inferReviewFocus(sourceState = {}) {
  const stalePendingReviewCount = Number(sourceState.stalePendingReviewCount || 0);
  const blockingPendingReviewCount = Number(
    sourceState.blockingPendingReviewCount !== undefined
      ? sourceState.blockingPendingReviewCount
      : sourceState.pendingReviewCount || 0
  );
  if (stalePendingReviewCount > 0 && blockingPendingReviewCount === 0) {
    return "stale";
  }
  if (blockingPendingReviewCount > 0 && sourceState.publishGate && sourceState.publishGate.focus === "review") {
    return "blocking";
  }
  return "";
}

function buildSourceCardActions(item = {}) {
  const nextReviewFocus = inferReviewFocus(item);
  let primaryAction = null;
  let secondaryAction = null;

  if (item.publishGate && item.publishGate.focus === "review") {
    primaryAction = {
      label: "处理待复核",
      action: "review",
      focus: "",
      reviewFocus: "blocking"
    };
  } else if (matchesFocus(item, "rollback")) {
    primaryAction = {
      label: "鏌ョ湅鍥為€€鍘熷洜",
      action: "status",
      focus: "rollback",
      reviewFocus: ""
    };
  } else if (item.publishGate && item.publishGate.focus) {
    primaryAction = {
      label: "查看对应风险",
      action: "status",
      focus: item.publishGate.focus,
      reviewFocus: ""
    };
  } else if (Number(item.pendingReviewCount || 0) > 0) {
    primaryAction = {
      label: nextReviewFocus === "stale" ? "查看历史复核" : "查看该来源复核",
      action: "review",
      focus: "",
      reviewFocus: nextReviewFocus
    };
  } else if (item.nextAction && item.nextAction.focus) {
    primaryAction = {
      label: "查看对应风险",
      action: "status",
      focus: item.nextAction.focus,
      reviewFocus: ""
    };
  } else {
    primaryAction = {
      label: "查看来源状态",
      action: "status",
      focus: "",
      reviewFocus: ""
    };
  }

  if (Number(item.stalePendingReviewCount || 0) > 0 && (!primaryAction || primaryAction.reviewFocus !== "stale")) {
    secondaryAction = {
      label: "清理历史复核",
      action: "review",
      focus: "",
      reviewFocus: "stale"
    };
  } else if (
    Number(item.pendingReviewCount || 0) > 0 &&
    (!primaryAction || primaryAction.action !== "review")
  ) {
    secondaryAction = {
      label: nextReviewFocus === "stale" ? "查看历史复核" : "查看该来源复核",
      action: "review",
      focus: "",
      reviewFocus: nextReviewFocus
    };
  }

  return {
    primaryAction,
    secondaryAction
  };
}

function buildReleaseModeLabel(item, releaseMode) {
  if (item.releaseOverrideActive && item.releaseOverrideMode === "notice-only") {
    return "人工锁定，仅公告模式";
  }
  if (item.releaseOverrideActive && item.releaseOverrideMode === "positions-open") {
    return item.releaseOverrideApplied === false
      ? "人工开放未生效"
      : "人工开放公告 + 岗位能力";
  }
  return releaseMode === "positions-open" ? "开放公告 + 岗位能力" : "仅公告模式";
}

function applyReleaseOverrideView(item, publishGate, releaseMode) {
  if (!item.releaseOverrideActive) {
    return {
      publishGate,
      releaseMode,
      releaseModeLabel: buildReleaseModeLabel(item, releaseMode)
    };
  }

  if (item.releaseOverrideMode === "notice-only") {
    return {
      publishGate: {
        status: "notice-only",
        label: publishGate && publishGate.label ? publishGate.label : "人工锁定为仅公告模式",
        detail: item.releaseOverrideReason
          ? `${item.releaseOverrideReason}${publishGate && publishGate.detail ? ` · ${publishGate.detail}` : ""}`
          : (publishGate && publishGate.detail ? publishGate.detail : "当前来源已被人工锁定，仅允许公告模式对外发布。"),
        tone: publishGate && publishGate.tone ? publishGate.tone : "warn",
        focus: publishGate && publishGate.focus ? publishGate.focus : "parse"
      },
      releaseMode: "notice-only",
      releaseModeLabel: buildReleaseModeLabel(item, "notice-only")
    };
  }

  if (item.releaseOverrideMode === "positions-open" && item.releaseOverrideApplied === false) {
    return {
      publishGate: {
        status: "blocked",
        label: "人工开放岗位能力未生效",
        detail: item.releaseOverrideBlockedReason || "当前来源不满足人工开放岗位能力的条件。",
        tone: "warn",
        focus: publishGate && publishGate.focus ? publishGate.focus : "run"
      },
      releaseMode,
      releaseModeLabel: buildReleaseModeLabel(item, releaseMode)
    };
  }

  if (item.releaseOverrideMode === "positions-open") {
    const hasSlaRisk = publishGate && publishGate.status === "healthy-with-sla-risk";
    return {
      publishGate: {
        status: hasSlaRisk ? "healthy-with-sla-risk" : "healthy",
        label: hasSlaRisk ? "人工开放岗位能力，需关注时效" : "人工开放岗位能力",
        detail: item.releaseOverrideReason || "当前来源已人工开放岗位能力。",
        tone: hasSlaRisk ? "neutral" : "ok",
        focus: publishGate ? publishGate.focus || "" : ""
      },
      releaseMode: "positions-open",
      releaseModeLabel: buildReleaseModeLabel(item, "positions-open")
    };
  }

  return {
    publishGate,
    releaseMode,
    releaseModeLabel: buildReleaseModeLabel(item, releaseMode)
  };
}

function buildSourceOpsSnapshot(item = {}) {
  const latestFetchAt = item.lastSuccessfulFetchedAt || item.lastFetchedAt || "暂无";
  const latestPublishAt = item.stableVersionUpdatedAt || item.lastPublishedAt || "暂无";
  const headline = item.publishGate && item.publishGate.label
    ? item.publishGate.label
    : (item.riskSummary && item.riskSummary.headline ? item.riskSummary.headline : (item.runStatusLabel || "继续观察"));
  const detail = item.gateFailureReason ||
    item.rollbackReason ||
    (item.publishGate && item.publishGate.detail) ||
    (item.riskSummary && item.riskSummary.detail) ||
    "";
  const actionLabel = item.nextAction && item.nextAction.label
    ? item.nextAction.label
    : "继续观察";
  const actionDetail = item.nextAction && item.nextAction.detail
    ? item.nextAction.detail
    : "";

  return {
    headline,
    detail,
    actionLabel,
    actionDetail,
    quickFacts: [
      {
        label: "前台发布",
        value: item.releaseModeLabel || "暂无"
      },
      {
        label: "最近成功抓取",
        value: latestFetchAt
      },
      {
        label: "最近成功发布",
        value: latestPublishAt
      },
      {
        label: "下一步",
        value: actionLabel
      }
    ]
  };
}

function buildSourceView(item = {}, auditMap = {}) {
  const stableVersionLabel = item.stableVersionLabel || item.lastPublishedVersionLabel || (
    item.lastPublishedAt ? `${item.lastPublishedAt} 稳定快照` : ""
  );
  const gateChecks = item.gateChecks && item.gateChecks.length
    ? item.gateChecks
    : buildSourceGateChecks(item);
  const normalized = {
    ...item,
    lastSuccessfulFetchedAt: item.lastSuccessfulFetchedAt || item.lastFetchedAt || "",
    candidateVersionId: item.candidateVersionId || "",
    candidateVersionLabel: item.candidateVersionLabel || "",
    candidateVersionCreatedAt: item.candidateVersionCreatedAt || item.lastRunFinishedAt || item.lastFetchedAt || "",
    stableVersionId: item.stableVersionId || item.lastPublishedVersionId || "",
    stableVersionLabel,
    stableVersionUpdatedAt: item.stableVersionUpdatedAt || item.lastPublishedAt || "",
    rollbackToVersionId: item.rollbackToVersionId || item.stableVersionId || "",
    rollbackToVersionLabel: item.rollbackToVersionLabel || stableVersionLabel,
    gateFailureReason: item.gateFailureReason || "",
    rollbackReason: item.rollbackReason || "",
    gateChecks,
    gateCheckSummary: item.gateCheckSummary || buildGateCheckSummary(gateChecks),
    examTypeLabel: item.examTypeLabel || mapExamType(item.examType),
    sourceModeLabel: item.sourceModeLabel || mapSourceModeLabel(item),
    runStatusLabel: item.runStatusLabel || mapRunStatus(item.lastRunStatus),
    slaStatusLabel: item.slaStatusLabel || mapSlaStatus(item.slaStatus),
    parseQualityLabel: item.parseQualityLabel || mapParseQuality(item)
  };
  const basePublishGate = item.publishGate || buildSourcePublishGate(normalized);
  const baseReleaseMode = item.releaseMode || (basePublishGate.status === "healthy" ? "positions-open" : "notice-only");
  const releaseOverrideView = applyReleaseOverrideView(normalized, basePublishGate, baseReleaseMode);

  const enriched = {
    ...normalized,
    publishGate: releaseOverrideView.publishGate,
    releaseMode: releaseOverrideView.releaseMode,
    releaseModeLabel: releaseOverrideView.releaseModeLabel,
    riskSummary: item.riskSummary || buildSourceRiskSummary(normalized),
    nextAction: buildNextAction({
      ...normalized,
      publishGate: releaseOverrideView.publishGate
    }),
    recentAudits: auditMap[item.sourceId] || []
  };

  return {
    ...enriched,
    opsSnapshot: buildSourceOpsSnapshot(enriched),
    sourceCardActions: buildSourceCardActions(enriched)
  };
}

function mapAuditEventTypeLabel(eventType) {
  const labelMap = {
    publish: "鍙戝竷鎴愬姛",
    rollback: "鍥為€€淇濈暀绋冲畾鐗堟湰",
    "publish-blocked": "鏂扮増鏈湭鏀捐",
    "publish-error": "杩愯閿欒",
    "release-override": "发布策略",
    "review-resolved": "复核处理",
    "review-reopened": "复核重开",
    "review-stale-resolved": "历史复核清理",
    "position-override-saved": "岗位纠错",
    "position-override-deleted": "岗位纠错"
  };
  return labelMap[String(eventType || "").trim()] || "操作日志";
}

function mapAuditTagClass(eventType) {
  if (
    eventType === "rollback" ||
    eventType === "publish-blocked" ||
    eventType === "publish-error" ||
    eventType === "release-override"
  ) {
    return "tag-warn";
  }
  if (
    eventType === "publish" ||
    eventType === "review-stale-resolved" ||
    eventType === "position-override-saved"
  ) {
    return "tag-active";
  }
  return "";
}

function enrichAuditItem(item = {}) {
  return {
    ...item,
    eventTypeLabel: mapAuditEventTypeLabel(item.eventType),
    tagClass: mapAuditTagClass(item.eventType)
  };
}

function normalizeAuditReason(value = "") {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const lower = text.toLowerCase();
  const knownReasonKey = (
    lower.includes("coverage") || text.includes("覆盖率") || text.includes("字段命中")
  ) ? "coverage"
    : (
      lower.includes("review") || text.includes("复核")
    ) ? "review"
      : (
        lower.includes("timeout") || text.includes("超时")
      ) ? "timeout"
        : (
          lower.includes("download") || text.includes("下载")
        ) ? "download"
          : (
            lower.includes("structure") || text.includes("结构")
          ) ? "structure"
            : (
              lower.includes("mapping") || text.includes("映射")
            ) ? "mapping"
              : (
                lower.includes("parse") || text.includes("解析")
              ) ? "parse"
                : (
                  lower.includes("valid") || text.includes("校验")
                ) ? "validation"
                  : "";

  if (knownReasonKey) {
    const labelMap = {
      coverage: "关键字段覆盖率不足",
      review: "待复核阻塞发布",
      timeout: "抓取或发布超时",
      download: "附件下载失败",
      structure: "来源结构变更",
      mapping: "字段映射失败",
      parse: "岗位表解析失败",
      validation: "发布校验未通过"
    };
    return {
      key: knownReasonKey,
      label: labelMap[knownReasonKey]
    };
  }

  const compactText = text.replace(/\s+/g, " ");
  const label = compactText.length > 24 ? `${compactText.slice(0, 24)}...` : compactText;
  return {
    key: `raw:${label.toLowerCase()}`,
    label
  };
}

function extractAuditReason(item = {}) {
  const directReason = normalizeAuditReason(
    item.reason || item.rollbackReason || item.gateFailureReason || ""
  );
  if (directReason) {
    return directReason;
  }

  const detail = String(item.detail || "");
  const detailReasonMatch = detail.match(/reason=([^|]+)/i);
  if (detailReasonMatch && detailReasonMatch[1]) {
    return normalizeAuditReason(detailReasonMatch[1]);
  }
  return null;
}

function buildPublishAuditReasonAction(reasonKey = "", sourceIds = [], eventTypes = []) {
  const targetSourceId = sourceIds.length === 1 ? sourceIds[0] : "";
  let action = "status";
  let focus = "";
  let reviewFocus = "";

  if (reasonKey === "review") {
    action = "review";
    reviewFocus = "blocking";
  } else if (reasonKey === "timeout") {
    focus = "run";
  } else if (reasonKey === "structure") {
    focus = "structure";
  } else if (["coverage", "download", "mapping", "parse", "validation"].includes(reasonKey)) {
    focus = "parse";
  } else if (eventTypes.length && eventTypes.every((item) => item === "rollback")) {
    focus = "rollback";
  } else if (eventTypes.includes("publish-error")) {
    focus = "run";
  } else if (eventTypes.includes("publish-blocked")) {
    focus = "parse";
  }

  if (action === "review") {
    return {
      action,
      focus,
      reviewFocus,
      sourceId: targetSourceId,
      actionLabel: targetSourceId ? "处理该来源复核" : "查看阻塞复核"
    };
  }

  const labelMap = {
    parse: targetSourceId ? "查看该来源解析风险" : "查看解析风险",
    rollback: targetSourceId ? "查看该来源回退" : "查看回退来源",
    run: targetSourceId ? "查看该来源运行异常" : "查看运行异常",
    structure: targetSourceId ? "查看该来源结构告警" : "查看结构告警",
    "": targetSourceId ? "查看该来源" : "查看受影响来源"
  };

  return {
    action,
    focus,
    reviewFocus,
    sourceId: targetSourceId,
    actionLabel: labelMap[focus !== undefined ? focus : ""] || labelMap[""]
  };
}

function enrichPublishAuditSummary(summary = {}, audits = []) {
  const normalizedAudits = audits || [];
  return {
    ...summary,
    topReasons: (summary.topReasons || []).map((item) => {
      const matchingAudits = normalizedAudits.filter((auditItem) => {
        const reason = extractAuditReason(auditItem);
        return reason && reason.key === item.key;
      });
      const sourceIds = Array.from(new Set(
        matchingAudits
          .map((auditItem) => auditItem.sourceId || "")
          .filter(Boolean)
      ));
      const sourceNames = Array.from(new Set(
        matchingAudits
          .map((auditItem) => auditItem.sourceName || "")
          .filter(Boolean)
      ));
      const eventTypes = Array.from(new Set(
        matchingAudits
          .map((auditItem) => auditItem.eventType || "")
          .filter(Boolean)
      ));
      const actionState = buildPublishAuditReasonAction(item.key, sourceIds, eventTypes);

      return {
        ...item,
        sourceIds,
        sourceNames,
        sourceCount: sourceIds.length,
        sourceScopeText: sourceIds.length <= 1
          ? (sourceNames[0] || sourceIds[0] || "")
          : `涉及 ${sourceIds.length} 个来源`,
        ...actionState
      };
    })
  };
}

function buildAuditReasonScopeMap(audits = []) {
  return (audits || []).reduce((result, item) => {
    const reason = extractAuditReason(item);
    if (!reason) {
      return result;
    }

    if (!result[reason.key]) {
      result[reason.key] = {
        key: reason.key,
        label: reason.label,
        sourceIds: [],
        eventTypes: []
      };
    }

    if (item.sourceId && !result[reason.key].sourceIds.includes(item.sourceId)) {
      result[reason.key].sourceIds.push(item.sourceId);
    }
    if (item.eventType && !result[reason.key].eventTypes.includes(item.eventType)) {
      result[reason.key].eventTypes.push(item.eventType);
    }
    return result;
  }, {});
}

function buildPublishAuditSummary(audits = []) {
  const normalizedAudits = audits || [];
  const alertEventTypes = ["publish-blocked", "rollback", "publish-error"];
  const alertAudits = normalizedAudits.filter((item) => alertEventTypes.includes(item.eventType));
  const reasonMap = alertAudits.reduce((result, item) => {
    const reason = extractAuditReason(item);
    if (!reason) {
      return result;
    }
    if (!result[reason.key]) {
      result[reason.key] = {
        key: reason.key,
        label: reason.label,
        count: 0,
        eventTypes: [],
        sourceIds: [],
        sourceNames: []
      };
    }
    result[reason.key].count += 1;
    if (!result[reason.key].eventTypes.includes(item.eventType)) {
      result[reason.key].eventTypes.push(item.eventType);
    }
    if (item.sourceId && !result[reason.key].sourceIds.includes(item.sourceId)) {
      result[reason.key].sourceIds.push(item.sourceId);
    }
    if (item.sourceName && !result[reason.key].sourceNames.includes(item.sourceName)) {
      result[reason.key].sourceNames.push(item.sourceName);
    }
    return result;
  }, {});

  return {
    totalCount: normalizedAudits.length,
    sourceCount: new Set(
      normalizedAudits
        .map((item) => item.sourceId || "")
        .filter(Boolean)
    ).size,
    publishCount: normalizedAudits.filter((item) => item.eventType === "publish").length,
    blockedCount: normalizedAudits.filter((item) => item.eventType === "publish-blocked").length,
    rollbackCount: normalizedAudits.filter((item) => item.eventType === "rollback").length,
    errorCount: normalizedAudits.filter((item) => item.eventType === "publish-error").length,
    releaseOverrideCount: normalizedAudits.filter((item) => item.eventType === "release-override").length,
    alertCount: alertAudits.length,
    hasAlerts: alertAudits.length > 0,
    healthyMessage: normalizedAudits.length
      ? "最近没有新的发版阻塞、稳定回退或运行异常。"
      : "当前还没有最近操作日志。",
    topReasons: Object.values(reasonMap)
      .sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count;
        }
        return left.label.localeCompare(right.label);
      })
      .slice(0, 3)
      .map((item) => ({
        ...item,
        eventTypeLabels: item.eventTypes.map((eventType) => mapAuditEventTypeLabel(eventType)),
        eventTypeSummaryText: item.eventTypes.map((eventType) => mapAuditEventTypeLabel(eventType)).join(" 路 ")
      }))
  };
}

function groupAuditsBySource(audits = []) {
  return (audits || []).reduce((result, item) => {
    const sourceId = item && item.sourceId ? item.sourceId : "";
    if (!sourceId) {
      return result;
    }
    if (!result[sourceId]) {
      result[sourceId] = [];
    }
    if (result[sourceId].length < 3) {
      result[sourceId].push(item);
    }
    return result;
  }, {});
}

Page({
  data: {
    pageState: "loading",
    pageStatusMessage: "",
    sourceStates: [],
    alertEvents: [],
    publishAudits: [],
    publishAuditSummary: {
      totalCount: 0,
      sourceCount: 0,
      publishCount: 0,
      blockedCount: 0,
      rollbackCount: 0,
      errorCount: 0,
      releaseOverrideCount: 0,
      alertCount: 0,
      hasAlerts: false,
      healthyMessage: "当前还没有最近操作日志。",
      topReasons: []
    },
    qualitySummary: {
      structuredHealthyCount: 0,
      coverageRiskCount: 0,
      attachmentOnlyCount: 0,
      workbookRiskCount: 0,
      reviewBlockedCount: 0,
      items: []
    },
    sourceFilterSummary: {
      activeFocus: "",
      allCount: 0,
      reviewCount: 0,
      parseCount: 0,
      rollbackCount: 0,
      runCount: 0,
      slaCount: 0
    },
    sourceGroups: [],
    sourceDetailExpanded: {},
    sourceName: "",
    focusLabel: "",
    reasonLabel: "",
    canManageReleaseControls: false,
    releaseActionBusySourceId: "",
    releaseControlHint: "",
    connectionSummary: {
      modeLabel: "本地 Store",
      presetLabel: "本地模式",
      endpointLabel: "不经过远端 API",
      sourceLabel: "项目默认",
      hint: ""
    },
    summary: {
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
    }
  },

  onLoad(query = {}) {
    this.sourceId = query.sourceId || "";
    this.focus = query.focus || "";
    this.reasonKey = query.reasonKey || "";
  },

  onShow() {
    return this.loadPageData();
  },

  loadPageData() {
    this.setData({
      pageState: "loading",
      pageStatusMessage: "正在加载来源状态..."
    });

    return Promise.all([
      api.getDashboard(),
      Promise.resolve(api.getRuntimeConfig())
    ]).then(([payload, apiConfig]) => {
      const connectionSummary = api.getConnectionSummary(apiConfig);
      const allowManage = canManageReleaseControls(apiConfig);
      const auditsPromise = allowManage
        ? Promise.resolve(api.listPublishAudits(this.sourceId)).catch(() => payload.publishAudits || [])
        : Promise.resolve(payload.publishAudits || []);

      return Promise.resolve(auditsPromise).then((publishAudits) => {
        const enrichedAudits = (publishAudits || []).map(enrichAuditItem);
        const scopedAudits = enrichedAudits.filter((item) => !this.sourceId || item.sourceId === this.sourceId);
        const reasonScopeMap = buildAuditReasonScopeMap(scopedAudits);
        const hasReasonFilter = Boolean(this.reasonKey);
        const reasonScope = this.reasonKey ? (reasonScopeMap[this.reasonKey] || null) : null;
        const reasonScopedAudits = hasReasonFilter
          ? scopedAudits.filter((item) => {
            const reason = extractAuditReason(item);
            return reason && reason.key === this.reasonKey;
          })
          : scopedAudits;
        const auditMap = groupAuditsBySource(enrichedAudits);
        const allSourceStates = (payload.sourceStates || []).map((item) => buildSourceView(item, auditMap));
        const qualitySummary = buildQualitySummary(allSourceStates);
        const scopedSourceStates = allSourceStates
          .filter((item) => !this.sourceId || item.sourceId === this.sourceId);
        const reasonScopedSourceStates = hasReasonFilter
          ? (reasonScope
            ? scopedSourceStates.filter((item) => reasonScope.sourceIds.includes(item.sourceId))
            : [])
          : scopedSourceStates;
        const sourceStates = reasonScopedSourceStates
          .filter((item) => matchesFocus(item, this.focus))
          .sort((left, right) => {
            const riskGap = getRiskScore(right) - getRiskScore(left);
            if (riskGap !== 0) {
              return riskGap;
            }
            return Number(right.publishLagMinutes || -1) - Number(left.publishLagMinutes || -1);
          });

        const alertEvents = (payload.alertEvents || [])
          .filter((item) => !this.sourceId || item.sourceId === this.sourceId)
          .filter((item) => !hasReasonFilter || (reasonScope && reasonScope.sourceIds.includes(item.sourceId)))
          .filter((item) => matchesFocus(item, this.focus));
        const sourceFilterSummary = buildSourceFilterSummary(reasonScopedSourceStates, this.focus);
        const sourceGroups = buildSourceGroups(sourceStates);

        const sourceName = this.sourceId
          ? ((allSourceStates.find((item) => item.sourceId === this.sourceId) || {}).sourceName || this.sourceId)
          : "";
        const publishAuditSummary = enrichPublishAuditSummary(
          buildPublishAuditSummary(reasonScopedAudits),
          reasonScopedAudits
        );
        const summary = payload.sourceSummary || {
          sourceCount: payload.stats.sourceCount,
          sourceAlertCount: payload.stats.sourceAlertCount,
          overdueSourceCount: payload.stats.overdueSourceCount,
          pendingReviewTotal: payload.stats.pendingReviewTotal,
          alertEventCount: payload.stats.alertEventCount,
          parseIssueCount: allSourceStates.filter(isParseIssue).length,
          publishableCount: allSourceStates.filter(
            (item) => item.publishGate && item.publishGate.status === "healthy"
          ).length,
          restrictedCount: allSourceStates.filter(
            (item) => !item.publishGate || item.publishGate.status !== "healthy"
          ).length,
          gateBlockedCount: allSourceStates.filter(
            (item) => item.publishGate && (
              item.publishGate.status === "blocked" ||
              item.publishGate.status === "notice-only" ||
              item.publishGate.status === "parse-warning" ||
              item.publishGate.status === "review"
            )
          ).length,
          rollbackCount: allSourceStates.filter(
            (item) => item.publishGate && item.publishGate.status === "rollback"
          ).length,
          gateFailureTypeSummary: []
        };
        const pageState = !sourceStates.length
          ? "empty"
          : (
            summary.sourceAlertCount > 0 ||
            summary.gateBlockedCount > 0 ||
            summary.rollbackCount > 0 ||
            summary.pendingReviewTotal > 0 ||
            qualitySummary.items.length > 0 ||
            publishAuditSummary.hasAlerts
          )
            ? "degraded"
            : "content";

        const focusLabelMap = {
          sla: "时效告警",
          structure: "结构告警",
          run: "运行异常",
          parse: "解析质量",
          alert: "来源告警"
        };
        focusLabelMap.review = "复核阻塞";

        focusLabelMap.review = focusLabelMap.review || "澶嶆牳闃诲";
        focusLabelMap.rollback = "绋冲畾鍥為€€";

        this.setData({
          pageState,
          pageStatusMessage: pageState === "degraded"
            ? "当前存在来源风险或发布阻塞，请优先处理卡点。"
            : (!sourceStates.length ? "当前还没有来源状态数据。" : ""),
          sourceStates,
          alertEvents,
          publishAudits: reasonScopedAudits,
          publishAuditSummary,
          qualitySummary,
          sourceFilterSummary,
          sourceGroups,
          sourceName,
          focusLabel: focusLabelMap[this.focus] || "",
          reasonLabel: reasonScope ? reasonScope.label : "",
          canManageReleaseControls: allowManage,
          releaseControlHint: allowManage
            ? "当前为远端运营模式，可直接调整来源发布策略。"
            : "当前连接为只读模式，切到远端 API 后才能调整来源发布策略。",
          connectionSummary,
          summary
        });
      });
    }).catch((error) => {
      this.setData({
        pageState: "error",
        pageStatusMessage: error && error.message ? error.message : "加载来源状态失败"
      });
      showToast(error && error.message ? error.message : "加载来源状态失败");
      throw error;
    });
  },

  setFocus(event) {
    const nextFocus = event && event.currentTarget && event.currentTarget.dataset
      ? (event.currentTarget.dataset.focus || "")
      : "";
    if (nextFocus === this.focus) {
      return Promise.resolve();
    }
    this.focus = nextFocus;
    this.setData({
      focusLabel: "",
      sourceFilterSummary: {
        ...this.data.sourceFilterSummary,
        activeFocus: nextFocus
      }
    });
    return this.loadPageData();
  },

  clearReason() {
    if (!this.reasonKey) {
      return Promise.resolve();
    }
    this.reasonKey = "";
    this.setData({
      reasonLabel: ""
    });
    return this.loadPageData();
  },

  openGroupAction(event) {
    const dataset = event && event.currentTarget && event.currentTarget.dataset
      ? event.currentTarget.dataset
      : {};
    const action = dataset.action || "";
    const focus = dataset.focus || "";
    const reviewFocus = dataset.reviewFocus || "";
    if (action === "review") {
      wx.navigateTo({ url: buildReviewCenterUrl("", reviewFocus, this.reasonKey || "") });
      return;
    }
    return this.setFocus({
      currentTarget: {
        dataset: {
          focus
        }
      }
    });
  },

  toggleSourceDetail(event) {
    const sourceId = event && event.currentTarget && event.currentTarget.dataset
      ? (event.currentTarget.dataset.sourceId || "")
      : "";
    if (!sourceId) {
      return;
    }
    this.setData({
      sourceDetailExpanded: {
        ...this.data.sourceDetailExpanded,
        [sourceId]: !this.data.sourceDetailExpanded[sourceId]
      }
    });
  },

  applyReleaseOverride(event) {
    const { sourceId, mode } = event.currentTarget.dataset;
    if (!this.data.canManageReleaseControls) {
      showToast("当前连接不支持调整来源发布策略");
      return Promise.resolve();
    }

    this.setData({
      releaseActionBusySourceId: sourceId
    });

    return api.setSourceReleaseOverride({
      sourceId,
      mode,
      reason: mode === "notice-only"
        ? "运营手动锁定为仅公告模式"
        : (mode === "positions-open" ? "运营手动开放岗位能力" : "清除人工发布策略")
    }).then(() => this.loadPageData())
      .then(() => {
        showToast(mode ? "已更新发布策略" : "已恢复自动发布策略", "success");
      })
      .finally(() => {
        this.setData({
          releaseActionBusySourceId: ""
        });
      });
  },

  openReviewCenter() {
    wx.navigateTo({ url: buildReviewCenterUrl(this.sourceId, "", this.reasonKey || "") });
  },

  focusReviewCenter(event) {
    const { sourceId, reviewFocus } = event.currentTarget.dataset;
    const sourceState = (this.data.sourceStates || []).find((item) => item.sourceId === sourceId) || null;
    const nextReviewFocus = reviewFocus || inferReviewFocus(sourceState || {});
    wx.navigateTo({ url: buildReviewCenterUrl(sourceId, nextReviewFocus, this.reasonKey || "") });
  },

  openFocusedStatus(event) {
    const { sourceId, focus, reasonKey } = event.currentTarget.dataset;
    const params = [];
    if (sourceId) {
      params.push(`sourceId=${encodeURIComponent(sourceId)}`);
    }
    if (focus) {
      params.push(`focus=${encodeURIComponent(focus)}`);
    }
    if (reasonKey || this.reasonKey) {
      params.push(`reasonKey=${encodeURIComponent(reasonKey || this.reasonKey)}`);
    }
    wx.navigateTo({ url: `/pages/source-status/index${params.length ? `?${params.join("&")}` : ""}` });
  },

  openAlertAction(event) {
    const { sourceId, focus, action, reviewFocus, reasonKey } = event.currentTarget.dataset;
    if (action === "review") {
      wx.navigateTo({ url: buildReviewCenterUrl(sourceId, reviewFocus, reasonKey || this.reasonKey || "") });
      return;
    }

    const params = [];
    if (sourceId) {
      params.push(`sourceId=${encodeURIComponent(sourceId)}`);
    }
    if (focus) {
      params.push(`focus=${encodeURIComponent(focus)}`);
    }
    if (reasonKey || this.reasonKey) {
      params.push(`reasonKey=${encodeURIComponent(reasonKey || this.reasonKey)}`);
    }
    wx.navigateTo({ url: `/pages/source-status/index${params.length ? `?${params.join("&")}` : ""}` });
  }
});
