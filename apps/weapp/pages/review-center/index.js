const api = require("../../utils/api");
const {
  buildReviewGateChecks,
  buildGateCheckSummary,
  buildReviewPriority,
  buildReviewResolutionSuggestion,
  buildReviewReleaseImpact
} = require("../../utils/source-ops-guidance");

const UPDATE_FIELD_LABELS = {
  politicalStatus: "政治面貌",
  notes: "其他要求",
  educationRaw: "学历要求",
  degreeRaw: "学位要求",
  majorRaw: "专业要求",
  serviceRequirement: "基层经历"
};

function isBlockingRelease(item = {}) {
  if (!item) {
    return false;
  }
  if (!item.hasRawPayload || !item.hasParsedPayload) {
    return true;
  }
  if (item.parseStatus === "attachment-only") {
    return item.expectedPositionWorkbook !== false && !item.attachmentOnlyExpected;
  }
  return Number(item.fieldCoveragePercent || 0) > 0 && Number(item.fieldCoveragePercent || 0) < 90;
}

function buildPayloadStatusLabel(item = {}) {
  return `原始快照：${item.hasRawPayload ? "有" : "无"} · 解析结果：${item.hasParsedPayload ? "有" : "无"}`;
}

function enrichReviewItem(item = {}) {
  const gateChecks = item.gateChecks && item.gateChecks.length
    ? item.gateChecks
    : buildReviewGateChecks(item);
  return {
    ...item,
    payloadStatusLabel: item.payloadStatusLabel || buildPayloadStatusLabel(item),
    candidateVersionId: item.candidateVersionId || "",
    candidateVersionLabel: item.candidateVersionLabel || "",
    candidateVersionCreatedAt: item.candidateVersionCreatedAt || item.createdAt || "",
    rollbackToVersionId: item.rollbackToVersionId || "",
    rollbackToVersionLabel: item.rollbackToVersionLabel || "",
    gateChecks,
    gateCheckSummary: item.gateCheckSummary || buildGateCheckSummary(gateChecks),
    priority: item.priority || buildReviewPriority(item),
    resolutionSuggestion: item.resolutionSuggestion || buildReviewResolutionSuggestion(item),
    releaseImpact: item.releaseImpact || buildReviewReleaseImpact(item),
    blockingRelease: typeof item.blockingRelease === "boolean"
      ? item.blockingRelease
      : isBlockingRelease(item)
  };
}

function buildDefaultDraftOverride(sourceId = "") {
  return {
    id: "",
    sourceId: sourceId || "",
    noticeId: "",
    positionId: "",
    positionCode: "",
    examType: "",
    agencyIncludes: "",
    titleIncludes: "",
    reason: "",
    politicalStatus: "",
    notes: "",
    educationRaw: "",
    degreeRaw: "",
    majorRaw: "",
    serviceRequirement: ""
  };
}

function trimValue(value) {
  return String(value || "").trim();
}

function canManageOverrides(apiConfig) {
  return Boolean(apiConfig && apiConfig.usingRemote && apiConfig.baseUrl);
}

function buildOverrideHint(apiConfig, connectionSummary) {
  if (canManageOverrides(apiConfig)) {
    return `Connected via ${connectionSummary.presetLabel || "remote API"}; saving an override will republish the latest validated stable snapshot.`;
  }
  if (apiConfig && apiConfig.mode === "remote") {
    return "Remote mode has no base URL; position overrides cannot be saved yet.";
  }
  return "Current connection is local read-only Store mode; switch to remote API to save position overrides.";
}

function buildDraftFromRule(rule = {}, defaultSourceId = "") {
  const updates = rule.updates || {};
  return {
    ...buildDefaultDraftOverride(defaultSourceId),
    id: trimValue(rule.id),
    sourceId: trimValue(rule.sourceId) || defaultSourceId,
    noticeId: trimValue(rule.noticeId),
    positionId: trimValue(rule.positionId),
    positionCode: trimValue(rule.positionCode),
    examType: trimValue(rule.examType),
    agencyIncludes: trimValue(rule.agencyIncludes),
    titleIncludes: trimValue(rule.titleIncludes),
    reason: trimValue(rule.reason),
    politicalStatus: trimValue(updates.politicalStatus),
    notes: trimValue(updates.notes),
    educationRaw: trimValue(updates.educationRaw),
    degreeRaw: trimValue(updates.degreeRaw),
    majorRaw: trimValue(updates.majorRaw),
    serviceRequirement: trimValue(updates.serviceRequirement)
  };
}

function summarizeOverrideSelectors(rule = {}) {
  const parts = [];
  if (rule.positionCode) {
    parts.push(`positionCode ${rule.positionCode}`);
  }
  if (rule.positionId) {
    parts.push(`positionId ${rule.positionId}`);
  }
  if (rule.noticeId) {
    parts.push(`noticeId ${rule.noticeId}`);
  }
  if (rule.sourceId) {
    parts.push(`sourceId ${rule.sourceId}`);
  }
  if (rule.examType) {
    parts.push(`examType ${rule.examType}`);
  }
  if (rule.agencyIncludes) {
    parts.push(`agency~${rule.agencyIncludes}`);
  }
  if (rule.titleIncludes) {
    parts.push(`title~${rule.titleIncludes}`);
  }
  return parts.length ? parts.join(" | ") : "no selectors";
}

function summarizeOverrideUpdates(rule = {}) {
  const updates = rule.updates || {};
  const parts = Object.keys(UPDATE_FIELD_LABELS).map((field) => {
    const value = trimValue(updates[field]);
    if (!value) {
      return "";
    }
    return `${UPDATE_FIELD_LABELS[field]} -> ${value}`;
  }).filter(Boolean);
  return parts.length ? parts.join(" | ") : "no updates";
}

function enrichOverrideRule(rule = {}) {
  return {
    ...rule,
    selectorSummary: summarizeOverrideSelectors(rule),
    updateSummary: summarizeOverrideUpdates(rule)
  };
}

function buildOverrideInput(draftOverride = {}) {
  const input = {
    id: trimValue(draftOverride.id) || `override-${Date.now()}`,
    sourceId: trimValue(draftOverride.sourceId),
    noticeId: trimValue(draftOverride.noticeId),
    positionId: trimValue(draftOverride.positionId),
    positionCode: trimValue(draftOverride.positionCode),
    examType: trimValue(draftOverride.examType),
    agencyIncludes: trimValue(draftOverride.agencyIncludes),
    titleIncludes: trimValue(draftOverride.titleIncludes),
    reason: trimValue(draftOverride.reason),
    updates: {}
  };

  Object.keys(UPDATE_FIELD_LABELS).forEach((field) => {
    const value = trimValue(draftOverride[field]);
    if (value) {
      input.updates[field] = value;
    }
  });

  return input;
}

function buildOverrideDraftFromReviewItem(item = {}, activeReasonKey = "", fallbackSourceId = "") {
  return buildReasonAwareOverrideDraftFromReviewItem(item, activeReasonKey, fallbackSourceId);
}

function buildReasonAwareOverrideDraftFromReviewItem(item = {}, activeReasonKey = "", fallbackSourceId = "") {
  const primaryReason = activeReasonKey
    ? normalizeReviewReasonValue(activeReasonKey)
    : getPrimaryReviewReason(item);
  const firstRiskCheck = (item.gateChecks || []).find(
    (checkItem) => checkItem && (checkItem.status === "fail" || checkItem.status === "warn")
  ) || (item.gateChecks || [])[0] || null;
  const reasonParts = [`鍩轰簬澶嶆牳璁板綍 ${item.id}`];
  if (primaryReason && primaryReason.label) {
    reasonParts.push(primaryReason.label);
  }
  if (firstRiskCheck && firstRiskCheck.label) {
    reasonParts.push(firstRiskCheck.label);
  }

  const noteLines = [];
  if (firstRiskCheck && (firstRiskCheck.label || firstRiskCheck.detail)) {
    noteLines.push(
      `check=${[firstRiskCheck.label || "", firstRiskCheck.detail || ""].filter(Boolean).join(" | ")}`
    );
  }
  if (Number(item.fieldCoveragePercent || 0) > 0) {
    noteLines.push(`coverage=${item.fieldCoveragePercent}%`);
  }
  if (item.parseStatus) {
    noteLines.push(`parseStatus=${item.parseStatus}`);
  }
  if (item.workbookSheetSummary) {
    noteLines.push(`sheetSummary=${item.workbookSheetSummary}`);
  }
  if (item.resolutionSuggestion) {
    noteLines.push(`suggestion=${item.resolutionSuggestion}`);
  }

  return {
    ...buildDefaultDraftOverride(fallbackSourceId || item.sourceId || ""),
    id: `override-${item.id}`,
    sourceId: item.sourceId || fallbackSourceId || "",
    noticeId: item.noticeId || "",
    positionId: item.positionId || "",
    positionCode: item.positionCode || "",
    examType: item.examType || "",
    agencyIncludes: item.agency || "",
    titleIncludes: item.title || "",
    reason: reasonParts.join(" | "),
    notes: noteLines.join("\n")
  };
}

function hasOverrideSelector(input = {}) {
  return [
    input.sourceId,
    input.noticeId,
    input.positionId,
    input.positionCode,
    input.examType,
    input.agencyIncludes,
    input.titleIncludes
  ].some(Boolean);
}

function hasOverrideUpdates(input = {}) {
  return Object.keys(input.updates || {}).length > 0;
}

function showToast(title, icon = "none") {
  if (typeof wx !== "undefined" && wx && typeof wx.showToast === "function") {
    wx.showToast({ title, icon });
  }
}

function matchesReviewFocus(item = {}, focus = "") {
  if (!focus) {
    return true;
  }
  if (focus === "stale") {
    return Boolean(item.staleReview);
  }
  if (focus === "blocking") {
    return Boolean(item.blockingReview) || Boolean(item.blockingRelease);
  }
  return true;
}

function normalizeReviewReasonValue(value = "") {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const lower = text.toLowerCase();
  const knownReasonKey = lower.includes("coverage")
    ? "coverage"
    : lower.includes("review") || lower.includes("blocking")
      ? "review"
      : lower.includes("timeout") || lower.includes("eacces")
        ? "timeout"
        : lower.includes("download")
          ? "download"
          : lower.includes("structure")
            ? "structure"
            : lower.includes("mapping")
              ? "mapping"
              : lower.includes("parse")
                ? "parse"
                : lower.includes("valid")
                  ? "validation"
                  : lower.includes("stale")
                    ? "stale"
                    : "";

  if (!knownReasonKey) {
    return null;
  }

  const labelMap = {
    coverage: "Coverage issue",
    review: "Blocking review",
    timeout: "Timeout",
    download: "Download failure",
    structure: "Source structure changed",
    mapping: "Field mapping failure",
    parse: "Workbook parse failure",
    validation: "Publish validation failure",
    stale: "Stale review backlog"
  };
  return {
    key: knownReasonKey,
    label: labelMap[knownReasonKey]
  };
}

function getPrimaryReviewReason(item = {}) {
  const coveragePercent = Number(item.fieldCoveragePercent || 0);
  if (coveragePercent > 0 && coveragePercent < 90) {
    return normalizeReviewReasonValue("coverage");
  }

  const firstRiskCheck = (item.gateChecks || []).find(
    (checkItem) => checkItem && (checkItem.status === "fail" || checkItem.status === "warn")
  );
  const candidateTexts = [
    firstRiskCheck && firstRiskCheck.label,
    firstRiskCheck && firstRiskCheck.detail,
    ...(item.reasons || []),
    item.releaseImpact,
    item.resolutionSuggestion
  ];

  for (const value of candidateTexts) {
    const normalized = normalizeReviewReasonValue(value);
    if (normalized) {
      return normalized;
    }
  }

  if (item.staleReview) {
    return normalizeReviewReasonValue("stale");
  }
  if (item.blockingReview || item.blockingRelease) {
    return normalizeReviewReasonValue("review");
  }
  return null;
}

function matchesReviewReason(item = {}, reasonKey = "") {
  if (!reasonKey) {
    return true;
  }
  if (reasonKey === "review") {
    return Boolean(item.blockingReview) || Boolean(item.blockingRelease);
  }
  if (reasonKey === "stale") {
    return Boolean(item.staleReview);
  }
  const reason = getPrimaryReviewReason(item);
  return Boolean(reason && reason.key === reasonKey);
}

function buildReviewReasonScopeMap(reviewQueue = []) {
  return (reviewQueue || []).reduce((result, item) => {
    const reason = getPrimaryReviewReason(item);
    if (!reason) {
      return result;
    }
    if (!result[reason.key]) {
      result[reason.key] = {
        key: reason.key,
        label: reason.label,
        sourceIds: [],
        sourceNames: [],
        count: 0
      };
    }
    result[reason.key].count += 1;
    if (item.sourceId && !result[reason.key].sourceIds.includes(item.sourceId)) {
      result[reason.key].sourceIds.push(item.sourceId);
    }
    if (item.sourceName && !result[reason.key].sourceNames.includes(item.sourceName)) {
      result[reason.key].sourceNames.push(item.sourceName);
    }
    return result;
  }, {});
}

function buildReviewReasonSummary(reviewQueue = []) {
  return Object.values(buildReviewReasonScopeMap(reviewQueue))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.label.localeCompare(right.label);
    })
    .map((item) => ({
      ...item,
      focus: item.key === "stale" ? "stale" : "blocking",
      actionLabel: "Only this reason"
    }));
}

function buildReviewSourceSummaries(reviewQueue = []) {
  const summaryMap = (reviewQueue || []).reduce((result, item) => {
    const sourceId = item && item.sourceId ? item.sourceId : "";
    if (!sourceId) {
      return result;
    }
    if (!result[sourceId]) {
      result[sourceId] = {
        sourceId,
        sourceName: item.sourceName || sourceId,
        totalCount: 0,
        blockingCount: 0,
        staleCount: 0,
        highPriorityCount: 0
      };
    }
    result[sourceId].totalCount += 1;
    if (item.blockingReview || item.blockingRelease) {
      result[sourceId].blockingCount += 1;
    }
    if (item.staleReview) {
      result[sourceId].staleCount += 1;
    }
    if (item.priority && item.priority.level === "high") {
      result[sourceId].highPriorityCount += 1;
    }
    return result;
  }, {});

  return Object.values(summaryMap)
    .sort((left, right) => {
      if (right.blockingCount !== left.blockingCount) {
        return right.blockingCount - left.blockingCount;
      }
      if (right.staleCount !== left.staleCount) {
        return right.staleCount - left.staleCount;
      }
      if (right.highPriorityCount !== left.highPriorityCount) {
        return right.highPriorityCount - left.highPriorityCount;
      }
      return right.totalCount - left.totalCount;
    })
    .map((item) => ({
      ...item,
      primaryActionLabel: "Only this source",
      blockingActionLabel: item.blockingCount > 0 ? "Blocking" : "",
      staleActionLabel: item.staleCount > 0 ? "Stale" : ""
    }));
}

Page({
  data: {
    pageState: "loading",
    pageStatusMessage: "",
    reviewQueue: [],
    resolvedReviewQueue: [],
    sourceName: "",
    draftNotes: {},
    positionOverrides: [],
    positionOverrideEnabled: false,
    staleReviewActionEnabled: false,
    staleReviewActionBusy: false,
    staleReviewCount: 0,
    staleReviewHint: "",
    positionOverrideHint: "",
    positionOverrideBusy: false,
    reviewFocusLabel: "",
    reasonLabel: "",
    reviewFilterSummary: {
      allCount: 0,
      blockingCount: 0,
      staleCount: 0,
      activeFocus: ""
    },
    reviewSourceSummaries: [],
    reviewItemExpanded: {},
    resolvedReviewItemExpanded: {},
    draftOverride: buildDefaultDraftOverride(),
    connectionSummary: {
      modeLabel: "鏈湴 Store",
      presetLabel: "鏈湴妯″紡",
      endpointLabel: "涓嶇粡杩囪繙绔?API",
      sourceLabel: "椤圭洰榛樿",
      hint: ""
    },
    summary: {
      total: 0,
      resolved: 0,
      highPriority: 0,
      blockingRelease: 0,
      failedCheckTypeSummary: []
    }
  },

  onLoad(query = {}) {
    this.sourceId = query.sourceId || "";
    this.reviewFocus = query.focus || "";
    this.reasonKey = query.reasonKey || "";
    this.setData({
      draftOverride: buildDefaultDraftOverride(this.sourceId)
    });
  },

  onShow() {
    this.setData({
      pageState: "loading",
      pageStatusMessage: "正在加载复核中心..."
    });
    return this.loadPageData();
  },

  loadPageData() {
    return Promise.all([
      api.getDashboard(),
      Promise.resolve(api.getRuntimeConfig())
    ]).then(([payload, apiConfig]) => {
      const allReviewQueue = (payload.reviewQueue || []).map(enrichReviewItem);
      const allResolvedReviewQueue = (payload.resolvedReviewQueue || []).map(enrichReviewItem);
      const scopedReviewQueue = allReviewQueue
        .filter((item) => !this.sourceId || item.sourceId === this.sourceId);
      const scopedResolvedReviewQueue = allResolvedReviewQueue.filter(
        (item) => !this.sourceId || item.sourceId === this.sourceId
      );
      const reasonScopeMap = buildReviewReasonScopeMap(scopedReviewQueue);
      const hasReasonFilter = Boolean(this.reasonKey);
      const reasonScope = this.reasonKey ? (reasonScopeMap[this.reasonKey] || null) : null;
      const reasonScopedReviewQueue = hasReasonFilter
        ? scopedReviewQueue.filter((item) => matchesReviewReason(item, this.reasonKey))
        : scopedReviewQueue;
      const reviewQueue = reasonScopedReviewQueue
        .filter((item) => matchesReviewFocus(item, this.reviewFocus));
      const resolvedReviewQueue = (hasReasonFilter
        ? scopedResolvedReviewQueue.filter((item) => matchesReviewReason(item, this.reasonKey))
        : scopedResolvedReviewQueue);
      const sourceName = this.sourceId
        ? (
          ((payload.sourceStates || []).find((item) => item.sourceId === this.sourceId) || {}).sourceName ||
          ((allReviewQueue || []).find((item) => item.sourceId === this.sourceId) || {}).sourceName ||
          this.sourceId
        )
        : "";
      const computedSummary = {
        total: reasonScopedReviewQueue.length,
        resolved: resolvedReviewQueue.length,
        highPriority: reviewQueue.filter((item) => item.priority && item.priority.level === "high").length,
        blockingRelease: reviewQueue.filter((item) => item.blockingRelease).length,
        failedCheckTypeSummary: buildReviewReasonSummary(reasonScopedReviewQueue)
      };
      const reviewSummary = (this.sourceId || this.reasonKey)
        ? computedSummary
        : {
          ...(payload.reviewSummary || {
            total: payload.stats.pendingReviewTotal,
            resolved: payload.stats.resolvedReviewTotal,
            highPriority: reviewQueue.filter((item) => item.priority && item.priority.level === "high").length,
            blockingRelease: reviewQueue.filter((item) => item.blockingRelease).length,
            failedCheckTypeSummary: []
          }),
          failedCheckTypeSummary: buildReviewReasonSummary(scopedReviewQueue)
        };
      const connectionSummary = api.getConnectionSummary(apiConfig);
      const positionOverrideEnabled = canManageOverrides(apiConfig);
      const staleReviewCount = reviewQueue.filter((item) => item.staleReview).length;
      const reviewFilterSummary = {
        allCount: reasonScopedReviewQueue.length,
        blockingCount: reasonScopedReviewQueue.filter(
          (item) => Boolean(item.blockingReview) || Boolean(item.blockingRelease)
        ).length,
        staleCount: reasonScopedReviewQueue.filter((item) => item.staleReview).length,
        activeFocus: this.reviewFocus || ""
      };
      const reviewSourceSummaries = this.sourceId ? [] : buildReviewSourceSummaries(reasonScopedReviewQueue);
      const reviewFocusLabelMap = {
        stale: "历史复核积压",
        blocking: "阻塞发布"
      };
      const overridePromise = positionOverrideEnabled
        ? api.listPositionOverrides()
        : Promise.resolve([]);

      return Promise.resolve(overridePromise).then((rules) => {
        const positionOverrides = (rules || [])
          .filter((item) => !this.sourceId || item.sourceId === this.sourceId)
          .map(enrichOverrideRule)
          .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
        const hasContent = Boolean(
          reviewQueue.length ||
          resolvedReviewQueue.length ||
          positionOverrides.length ||
          reviewSourceSummaries.length ||
          (reviewSummary.failedCheckTypeSummary && reviewSummary.failedCheckTypeSummary.length)
        );

        this.setData({
          pageState: hasContent ? "content" : "empty",
          pageStatusMessage: hasContent ? "" : "当前没有待复核记录、已处理记录或可操作纠错规则。",
          reviewQueue,
          resolvedReviewQueue,
          sourceName,
          positionOverrides,
          positionOverrideEnabled,
          staleReviewActionEnabled: positionOverrideEnabled,
          staleReviewCount,
          staleReviewHint: positionOverrideEnabled
            ? (
              staleReviewCount > 0
                ? `There are ${staleReviewCount} stale review items already covered by a newer stable version; you can resolve them in batch.`
                : "There are no stale review items to resolve in batch."
            )
            : "Switch to the remote API connection before resolving stale review items in batch.",
          positionOverrideHint: buildOverrideHint(apiConfig, connectionSummary),
          reviewFocusLabel: reviewFocusLabelMap[this.reviewFocus] || "",
          reasonLabel: reasonScope ? reasonScope.label : "",
          reviewFilterSummary,
          reviewSourceSummaries,
          connectionSummary,
          summary: (this.sourceId || this.reasonKey) ? {
            total: reviewQueue.length,
            resolved: resolvedReviewQueue.length,
            highPriority: reviewQueue.filter((item) => item.priority && item.priority.level === "high").length,
            blockingRelease: reviewQueue.filter((item) => item.blockingRelease).length,
            failedCheckTypeSummary: reviewSummary.failedCheckTypeSummary || []
          } : reviewSummary
        });
      });
    }).catch((error) => {
      this.setData({
        pageState: "error",
        pageStatusMessage: error && error.message ? error.message : "加载复核中心失败"
      });
      showToast(error && error.message ? error.message : "Failed to load review center.");
      throw error;
    });
  },

  setReviewFocus(event) {
    const nextFocus = event && event.currentTarget && event.currentTarget.dataset
      ? (event.currentTarget.dataset.focus || "")
      : "";
    if (nextFocus === this.reviewFocus) {
      return Promise.resolve();
    }
    this.reviewFocus = nextFocus;
    this.setData({
      reviewFocusLabel: "",
      reviewItemExpanded: {},
      resolvedReviewItemExpanded: {},
      reviewFilterSummary: {
        ...this.data.reviewFilterSummary,
        activeFocus: nextFocus
      }
    });
    return this.loadPageData();
  },

  setReviewReason(event) {
    const dataset = event && event.currentTarget && event.currentTarget.dataset
      ? event.currentTarget.dataset
      : {};
    const nextReasonKey = dataset.reasonKey || "";
    const nextFocus = dataset.focus || this.reviewFocus || "";
    if (nextReasonKey === this.reasonKey && nextFocus === this.reviewFocus) {
      return Promise.resolve();
    }
    this.reasonKey = nextReasonKey;
    this.reviewFocus = nextFocus;
    this.setData({
      reasonLabel: "",
      reviewFocusLabel: "",
      reviewItemExpanded: {},
      resolvedReviewItemExpanded: {},
      reviewFilterSummary: {
        ...this.data.reviewFilterSummary,
        activeFocus: nextFocus
      }
    });
    return this.loadPageData();
  },

  clearReviewReason() {
    if (!this.reasonKey) {
      return Promise.resolve();
    }
    this.reasonKey = "";
    this.setData({
      reasonLabel: ""
    });
    return this.loadPageData();
  },

  setReviewSourceScope(event) {
    const dataset = event && event.currentTarget && event.currentTarget.dataset
      ? event.currentTarget.dataset
      : {};
    const nextSourceId = dataset.sourceId || "";
    const nextFocus = dataset.focus || "";
    if (nextSourceId === this.sourceId && nextFocus === this.reviewFocus) {
      return Promise.resolve();
    }
    this.sourceId = nextSourceId;
    this.reviewFocus = nextFocus;
    this.setData({
      sourceName: "",
      reviewFocusLabel: "",
      reviewItemExpanded: {},
      resolvedReviewItemExpanded: {},
      reviewFilterSummary: {
        ...this.data.reviewFilterSummary,
        activeFocus: nextFocus
      }
    });
    return this.loadPageData();
  },

  clearReviewSourceScope() {
    if (!this.sourceId && !this.reviewFocus) {
      return Promise.resolve();
    }
    this.sourceId = "";
    this.reviewFocus = "";
    this.setData({
      sourceName: "",
      reviewFocusLabel: "",
      reviewItemExpanded: {},
      resolvedReviewItemExpanded: {},
      reviewFilterSummary: {
        ...this.data.reviewFilterSummary,
        activeFocus: ""
      }
    });
    return this.loadPageData();
  },

  toggleReviewItemDetail(event) {
    const dataset = event && event.currentTarget && event.currentTarget.dataset
      ? event.currentTarget.dataset
      : {};
    const id = dataset.id || "";
    const section = dataset.section === "resolved" ? "resolved" : "pending";
    if (!id) {
      return;
    }

    if (section === "resolved") {
      const resolvedReviewItemExpanded = {
        ...this.data.resolvedReviewItemExpanded,
        [id]: !this.data.resolvedReviewItemExpanded[id]
      };
      this.setData({ resolvedReviewItemExpanded });
      return;
    }

    const reviewItemExpanded = {
      ...this.data.reviewItemExpanded,
      [id]: !this.data.reviewItemExpanded[id]
    };
    this.setData({ reviewItemExpanded });
  },

  onResolutionInput(event) {
    const { id } = event.currentTarget.dataset;
    const draftNotes = {
      ...this.data.draftNotes,
      [id]: event.detail.value
    };
    this.setData({ draftNotes });
  },

  onOverrideFieldInput(event) {
    const { field } = event.currentTarget.dataset;
    const draftOverride = {
      ...this.data.draftOverride,
      [field]: event.detail.value
    };
    this.setData({ draftOverride });
  },

  resetOverrideDraft() {
    this.setData({
      draftOverride: buildDefaultDraftOverride(this.sourceId || this.data.draftOverride.sourceId || "")
    });
  },

  prefillOverrideFromReviewItem(event) {
    const { id } = event.currentTarget.dataset;
    const item = (this.data.reviewQueue || []).find((current) => current.id === id);
    if (!item) {
      return;
    }
    this.setData({
      draftOverride: buildReasonAwareOverrideDraftFromReviewItem(item, this.reasonKey, this.sourceId)
    });
  },

  editPositionOverride(event) {
    const { id } = event.currentTarget.dataset;
    const item = (this.data.positionOverrides || []).find((current) => current.id === id);
    if (!item) {
      return;
    }
    this.setData({
      draftOverride: buildDraftFromRule(item, this.sourceId || item.sourceId || "")
    });
  },

  savePositionOverride() {
    if (!this.data.positionOverrideEnabled) {
      showToast("Current connection does not support saving position overrides.");
      return Promise.resolve();
    }
    const input = buildOverrideInput(this.data.draftOverride);
    if (!hasOverrideSelector(input)) {
      showToast("Add at least one selector before saving.");
      return Promise.resolve();
    }
    if (!hasOverrideUpdates(input)) {
      showToast("Add at least one update field before saving.");
      return Promise.resolve();
    }

    this.setData({ positionOverrideBusy: true });
    return api.savePositionOverride(input).then((savedRule) => {
      this.setData({
        draftOverride: buildDraftFromRule(savedRule, this.sourceId || savedRule.sourceId || "")
      });
      return this.loadPageData();
    }).then(() => {
      showToast("已保存纠错规则", "success");
    }).finally(() => {
      this.setData({ positionOverrideBusy: false });
    });
  },

  deletePositionOverride(event) {
    if (!this.data.positionOverrideEnabled) {
      showToast("Current connection does not support deleting position overrides.");
      return Promise.resolve();
    }
    const { id } = event.currentTarget.dataset;
    this.setData({ positionOverrideBusy: true });
    return api.deletePositionOverride(id).then(() => {
      const shouldResetDraft = this.data.draftOverride.id === id;
      return this.loadPageData().then(() => {
        if (shouldResetDraft) {
          this.resetOverrideDraft();
        }
      });
    }).then(() => {
      showToast("已删除纠错规则", "success");
    }).finally(() => {
      this.setData({ positionOverrideBusy: false });
    });
  },

  resolveStaleItems() {
    if (!this.data.staleReviewActionEnabled) {
      showToast("Current connection does not support batch stale review resolution.");
      return Promise.resolve();
    }
    if (!this.data.staleReviewCount) {
      showToast("There are no stale review items to resolve.");
      return Promise.resolve();
    }

    this.setData({ staleReviewActionBusy: true });
    return api.resolveStaleReviewItems({
      sourceId: this.sourceId || "",
      note: "自动关闭：后续已有稳定成功版本，判定为历史瞬时错误。"
    }).then((result) => {
      return this.loadPageData().then(() => result);
    }).then((result) => {
      const resolvedCount = Number(result && result.resolvedCount ? result.resolvedCount : 0);
      showToast(
        resolvedCount > 0
          ? `已清理 ${resolvedCount} 条历史复核`
          : "当前没有需要清理的历史复核",
        "success"
      );
    }).finally(() => {
      this.setData({ staleReviewActionBusy: false });
    });
  },

  resolveItem(event) {
    const { id } = event.currentTarget.dataset;
    const note = (this.data.draftNotes[id] || "").trim();
    api.resolveReviewItem(id, note).then(() => {
      const draftNotes = { ...this.data.draftNotes };
      const reviewItemExpanded = { ...this.data.reviewItemExpanded };
      delete draftNotes[id];
      delete reviewItemExpanded[id];
      this.setData({ draftNotes, reviewItemExpanded });
      return this.loadPageData();
    }).then(() => {
      showToast("已标记处理", "success");
    });
  },

  reopenItem(event) {
    const { id } = event.currentTarget.dataset;
    const resolvedReviewItemExpanded = { ...this.data.resolvedReviewItemExpanded };
    delete resolvedReviewItemExpanded[id];
    this.setData({ resolvedReviewItemExpanded });
    api.reopenReviewItem(id).then(() => {
      return this.loadPageData();
    }).then(() => {
      showToast("已重新打开", "success");
    });
  }
});
