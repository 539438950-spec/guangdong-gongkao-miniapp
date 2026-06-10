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
    return `当前连接使用 ${connectionSummary.presetLabel || "远端 API"}，保存规则后会重新发布校验通过的稳定快照。`;
  }
  if (apiConfig && apiConfig.mode === "remote") {
    return "远端模式未配置可用 Base URL，暂不能保存岗位纠错规则。";
  }
  return "当前是本地 Store 只读模式。岗位纠错规则需要切到远端 API 后才能保存。";
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
    parts.push(`职位代码 ${rule.positionCode}`);
  }
  if (rule.positionId) {
    parts.push(`岗位 ID ${rule.positionId}`);
  }
  if (rule.noticeId) {
    parts.push(`公告 ${rule.noticeId}`);
  }
  if (rule.sourceId) {
    parts.push(`来源 ${rule.sourceId}`);
  }
  if (rule.examType) {
    parts.push(`考试类型 ${rule.examType}`);
  }
  if (rule.agencyIncludes) {
    parts.push(`单位含“${rule.agencyIncludes}”`);
  }
  if (rule.titleIncludes) {
    parts.push(`岗位名含“${rule.titleIncludes}”`);
  }
  return parts.length ? parts.join(" · ") : "未设置命中条件";
}

function summarizeOverrideUpdates(rule = {}) {
  const updates = rule.updates || {};
  const parts = Object.keys(UPDATE_FIELD_LABELS).map((field) => {
    const value = trimValue(updates[field]);
    if (!value) {
      return "";
    }
    return `${UPDATE_FIELD_LABELS[field]} → ${value}`;
  }).filter(Boolean);
  return parts.length ? parts.join(" · ") : "未设置修正字段";
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

Page({
  data: {
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
    draftOverride: buildDefaultDraftOverride(),
    connectionSummary: {
      modeLabel: "本地 Store",
      presetLabel: "本地模式",
      endpointLabel: "不经过远端 API",
      sourceLabel: "项目默认",
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
    this.setData({
      draftOverride: buildDefaultDraftOverride(this.sourceId)
    });
  },

  onShow() {
    this.loadPageData();
  },

  loadPageData() {
    return Promise.all([
      api.getDashboard(),
      Promise.resolve(api.getRuntimeConfig())
    ]).then(([payload, apiConfig]) => {
      const allReviewQueue = (payload.reviewQueue || []).map(enrichReviewItem);
      const allResolvedReviewQueue = (payload.resolvedReviewQueue || []).map(enrichReviewItem);
      const reviewQueue = allReviewQueue
        .filter((item) => !this.sourceId || item.sourceId === this.sourceId)
        .filter((item) => matchesReviewFocus(item, this.reviewFocus));
      const resolvedReviewQueue = allResolvedReviewQueue.filter(
        (item) => !this.sourceId || item.sourceId === this.sourceId
      );
      const sourceName = this.sourceId
        ? ((payload.sourceStates || []).find((item) => item.sourceId === this.sourceId) || {}).sourceName || this.sourceId
        : "";
      const reviewSummary = payload.reviewSummary || {
        total: payload.stats.pendingReviewTotal,
        resolved: payload.stats.resolvedReviewTotal,
        highPriority: reviewQueue.filter((item) => item.priority && item.priority.level === "high").length,
        blockingRelease: reviewQueue.filter((item) => item.blockingRelease).length,
        failedCheckTypeSummary: []
      };
      const connectionSummary = api.getConnectionSummary(apiConfig);
      const positionOverrideEnabled = canManageOverrides(apiConfig);
      const staleReviewCount = reviewQueue.filter((item) => item.staleReview).length;
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

        this.setData({
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
                ? `当前有 ${staleReviewCount} 条历史复核记录已被后续稳定版本覆盖，可批量关闭。`
                : "当前没有可批量关闭的历史复核记录。"
            )
            : "切换到远端 API 后，才能批量关闭历史复核记录并回写采集状态。",
          positionOverrideHint: buildOverrideHint(apiConfig, connectionSummary),
          reviewFocusLabel: reviewFocusLabelMap[this.reviewFocus] || "",
          connectionSummary,
          summary: this.sourceId ? {
            total: reviewQueue.length,
            resolved: resolvedReviewQueue.length,
            highPriority: reviewQueue.filter((item) => item.priority && item.priority.level === "high").length,
            blockingRelease: reviewQueue.filter((item) => item.blockingRelease).length,
            failedCheckTypeSummary: reviewSummary.failedCheckTypeSummary || []
          } : reviewSummary
        });
      });
    }).catch((error) => {
      showToast(error && error.message ? error.message : "加载复核中心失败");
      throw error;
    });
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
      draftOverride: {
        ...buildDefaultDraftOverride(this.sourceId || item.sourceId || ""),
        id: `override-${item.id}`,
        sourceId: item.sourceId || this.sourceId || "",
        noticeId: item.noticeId || "",
        examType: item.examType || "",
        reason: `基于复核记录 ${item.id}`
      }
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
      showToast("当前连接不支持保存纠错规则");
      return Promise.resolve();
    }
    const input = buildOverrideInput(this.data.draftOverride);
    if (!hasOverrideSelector(input)) {
      showToast("至少填写一个命中条件");
      return Promise.resolve();
    }
    if (!hasOverrideUpdates(input)) {
      showToast("至少填写一个修正字段");
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
      showToast("当前连接不支持删除纠错规则");
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
      showToast("当前连接不支持批量关闭历史复核");
      return Promise.resolve();
    }
    if (!this.data.staleReviewCount) {
      showToast("当前没有可批量关闭的历史复核记录");
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
      showToast(resolvedCount > 0 ? `已清理 ${resolvedCount} 条历史复核` : "当前没有需要清理的历史复核", "success");
    }).finally(() => {
      this.setData({ staleReviewActionBusy: false });
    });
  },

  resolveItem(event) {
    const { id } = event.currentTarget.dataset;
    const note = (this.data.draftNotes[id] || "").trim();
    api.resolveReviewItem(id, note).then(() => {
      const draftNotes = { ...this.data.draftNotes };
      delete draftNotes[id];
      this.setData({ draftNotes });
      return this.loadPageData();
    }).then(() => {
      showToast("已标记处理", "success");
    });
  },

  reopenItem(event) {
    const { id } = event.currentTarget.dataset;
    api.reopenReviewItem(id).then(() => {
      return this.loadPageData();
    }).then(() => {
      showToast("已重新打开", "success");
    });
  }
});
