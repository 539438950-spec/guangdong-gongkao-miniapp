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
    isParseIssue(item) ? 1 : 0
  ].reduce((sum, value) => sum + value, 0);
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
  if (focus === "sla") {
    return Boolean(item.fetchOverdue) || Boolean(item.publishOverdue) || item.type === "sla-overdue" || item.type === "sla-warning";
  }
  if (focus === "structure") {
    return Boolean(item.structureAlert) || item.type === "structure-change";
  }
  if (focus === "run") {
    return (
      Number(item.consecutiveFailureCount || 0) > 0 ||
      Boolean(item.lastRollback) ||
      item.type === "run-failed" ||
      item.type === "rollback"
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

function buildReviewCenterUrl(sourceId = "", reviewFocus = "") {
  const params = [];
  if (sourceId) {
    params.push(`sourceId=${encodeURIComponent(sourceId)}`);
  }
  if (reviewFocus) {
    params.push(`focus=${encodeURIComponent(reviewFocus)}`);
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

  return {
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
    sourceStates: [],
    alertEvents: [],
    publishAudits: [],
    sourceName: "",
    focusLabel: "",
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
  },

  onShow() {
    return this.loadPageData();
  },

  loadPageData() {
    return Promise.all([
      api.getDashboard(),
      Promise.resolve(api.getRuntimeConfig())
    ]).then(([payload, apiConfig]) => {
      const connectionSummary = api.getConnectionSummary(apiConfig);
      const allowManage = canManageReleaseControls(apiConfig);
      const auditsPromise = allowManage
        ? api.listPublishAudits(this.sourceId)
        : Promise.resolve([]);

      return Promise.resolve(auditsPromise).then((publishAudits) => {
        const auditMap = groupAuditsBySource(publishAudits || []);
        const allSourceStates = (payload.sourceStates || []).map((item) => buildSourceView(item, auditMap));
        const sourceStates = allSourceStates
          .filter((item) => !this.sourceId || item.sourceId === this.sourceId)
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
          .filter((item) => matchesFocus(item, this.focus));

        const sourceName = this.sourceId
          ? ((allSourceStates.find((item) => item.sourceId === this.sourceId) || {}).sourceName || this.sourceId)
          : "";

        const focusLabelMap = {
          sla: "时效告警",
          structure: "结构告警",
          run: "运行异常",
          parse: "解析质量",
          alert: "来源告警"
        };

        this.setData({
          sourceStates,
          alertEvents,
          publishAudits: publishAudits || [],
          sourceName,
          focusLabel: focusLabelMap[this.focus] || "",
          canManageReleaseControls: allowManage,
          releaseControlHint: allowManage
            ? "当前为远端运营模式，可直接调整来源发布策略。"
            : "当前连接为只读模式，切到远端 API 后才能调整来源发布策略。",
          connectionSummary,
          summary: payload.sourceSummary || {
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
          }
        });
      });
    }).catch((error) => {
      showToast(error && error.message ? error.message : "加载来源状态失败");
      throw error;
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
    wx.navigateTo({ url: buildReviewCenterUrl(this.sourceId, "") });
  },

  focusReviewCenter(event) {
    const { sourceId, reviewFocus } = event.currentTarget.dataset;
    const sourceState = (this.data.sourceStates || []).find((item) => item.sourceId === sourceId) || null;
    const nextReviewFocus = reviewFocus || inferReviewFocus(sourceState || {});
    wx.navigateTo({ url: buildReviewCenterUrl(sourceId, nextReviewFocus) });
  },

  openFocusedStatus(event) {
    const { sourceId, focus } = event.currentTarget.dataset;
    const params = [];
    if (sourceId) {
      params.push(`sourceId=${encodeURIComponent(sourceId)}`);
    }
    if (focus) {
      params.push(`focus=${encodeURIComponent(focus)}`);
    }
    wx.navigateTo({ url: `/pages/source-status/index${params.length ? `?${params.join("&")}` : ""}` });
  },

  openAlertAction(event) {
    const { sourceId, focus, action, reviewFocus } = event.currentTarget.dataset;
    if (action === "review") {
      wx.navigateTo({ url: buildReviewCenterUrl(sourceId, reviewFocus) });
      return;
    }

    const params = [];
    if (sourceId) {
      params.push(`sourceId=${encodeURIComponent(sourceId)}`);
    }
    if (focus) {
      params.push(`focus=${encodeURIComponent(focus)}`);
    }
    wx.navigateTo({ url: `/pages/source-status/index${params.length ? `?${params.join("&")}` : ""}` });
  }
});
