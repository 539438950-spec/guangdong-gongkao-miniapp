const api = require("../../utils/api");
const { buildNoticeNextAction, buildNoticeNextActionSummary } = require("../../utils/notice-action-guidance");
const {
  executeQuickCompare,
  buildQuickCompareToastTitle
} = require("../../utils/compare-group-actions");
const {
  buildComparePageUrl,
  buildNoticeCompareContext,
  buildNoticeCompareRecord,
  buildEmptyNoticeCompareSuggestion,
  buildNoticeCompareSuggestion
} = require("../../utils/notice-compare-guidance");
const { buildTrustAction } = require("../../utils/trust-action");

function mapSourceModeLabel(notice) {
  return notice.sourceModeLabel || (notice.sourceMode === "demo" ? "演示" : "官方");
}

function mapTrustBadgeClass(noticeTrust) {
  if (!noticeTrust) {
    return "";
  }
  return noticeTrust.parseQualityStatus === "warning" || noticeTrust.parseQualityStatus === "attachment-only"
    ? "tag-warn"
    : "";
}

function getAvailabilitySummary(notice, noticeTrust) {
  if (!notice) {
    return "";
  }
  if (notice.hasStructuredPositions) {
    return "当前公告已经进入结构化岗位流程，可用于筛选、对比和推荐。";
  }
  if (noticeTrust && noticeTrust.parseQualityStatus === "attachment-only") {
    return "当前只完成公告与附件解析，岗位表尚未稳定结构化，暂不开放选岗和岗位对比。";
  }
  return "当前可以查看公告原文，岗位能力将在结构化验证通过后开放。";
}

function buildMergedSourceSummary(notice) {
  const mergedSourceCount = Number((notice && notice.mergedSourceCount) || 0);
  if (mergedSourceCount <= 1) {
    return "";
  }

  const positionSourceName = notice && notice.positionSourceName
    ? notice.positionSourceName
    : (notice && notice.source) || "";
  return `已聚合 ${mergedSourceCount} 个官方来源；岗位检索、岗位对比与相似岗位推荐以${positionSourceName || "岗位主源"}为准，其他来源用于补充公告原文和时间节点。`;
}

function buildMergedSourceEntries(notice) {
  const mergedSources = notice && Array.isArray(notice.mergedSources)
    ? notice.mergedSources
    : [];
  if (mergedSources.length <= 1) {
    return [];
  }

  const positionNoticeId = notice && notice.positionNoticeId ? notice.positionNoticeId : "";
  return mergedSources.map((item) => ({
    noticeId: item.noticeId || "",
    sourceId: item.sourceId || "",
    sourceName: item.sourceName || "",
    publishedAt: item.publishedAt || "",
    positionCount: Number(item.positionCount || 0),
    hasStructuredPositions: Boolean(item.hasStructuredPositions),
    parseQualityStatus: item.parseQualityStatus || "",
    releaseMode: item.releaseMode || "",
    isPrimary: Boolean(notice && item.noticeId === notice.id),
    isPositionSource: Boolean(positionNoticeId && item.noticeId === positionNoticeId),
    roleLabel: positionNoticeId && item.noticeId === positionNoticeId ? "岗位主源" : "辅助来源",
    roleDetail: positionNoticeId && item.noticeId === positionNoticeId
      ? "用于岗位检索、岗位对比和相似岗位推荐。"
      : "用于补充公告原文、时间节点和后续流程信息。",
    summary: item.hasStructuredPositions
      ? `已结构化 ${Number(item.positionCount || 0)} 个岗位，可直接用于筛选和对比。`
      : "当前仅补充公告信息，暂不作为岗位对比数据源。"
  }));
}

function buildNoticeDecisionPriority(notice, noticeNextAction, noticeNextActionSummary, noticeCompareSuggestion, canViewPositions) {
  if (noticeCompareSuggestion && noticeCompareSuggestion.ready) {
    return {
      label: "优先去选岗或对比",
      summary: noticeCompareSuggestion.hint || noticeNextActionSummary || "",
      tags: ["可对比", "结构化可用"]
    };
  }
  if (noticeCompareSuggestion && noticeCompareSuggestion.mode === "review-needed") {
    return {
      label: "先整理对比方案",
      summary: noticeCompareSuggestion.hint || noticeNextActionSummary || "",
      tags: ["待整理", "方案已满"]
    };
  }
  if (noticeNextAction && noticeNextAction.primaryActionType === "notice") {
    return {
      label: "优先跟进后续进度",
      summary: noticeNextActionSummary || "",
      tags: ["进度追踪", notice && notice.noticeStageLabel ? notice.noticeStageLabel : "公告"]
    };
  }
  if (canViewPositions) {
    return {
      label: "先去核对岗位条件",
      summary: noticeNextActionSummary || "",
      tags: ["可选岗", "需核对原表"]
    };
  }
  return {
    label: "当前先追踪公告",
    summary: noticeNextActionSummary || getAvailabilitySummary(notice, notice && notice.noticeTrust),
    tags: ["仅公告"]
  };
}

Page({
  data: {
    notice: null,
    noticeTrust: null,
    positions: [],
    noticeBatch: null,
    noticeTimeline: [],
    relatedNotices: [],
    progressReminderSettings: null,
    progressReminderOptions: [],
    canViewPositions: false,
    favorite: false,
    sourceModeLabel: "",
    trustBadgeClass: "",
    availabilitySummary: "",
    noticeNextAction: null,
    noticeNextActionSummary: "",
    decisionPriority: {
      label: "",
      summary: "",
      tags: []
    },
    secondaryActionLabel: "",
    noticeCompareSuggestion: buildEmptyNoticeCompareSuggestion(),
    trustAction: buildTrustAction(),
    mergedSourceSummary: "",
    mergedSourceEntries: []
  },

  onLoad(query) {
    this.noticeId = query.id;
  },

  onShow() {
    const compareGroupsPromise = typeof api.listCompareGroups === "function"
      ? api.listCompareGroups().catch(() => [])
      : Promise.resolve([]);

    Promise.all([
      api.getNoticeDetail(this.noticeId),
      compareGroupsPromise
    ]).then(([payload, compareGroups]) => {
      const {
        notice,
        positions,
        noticeTrust,
        canViewPositions,
        favorite,
        noticeBatch,
        noticeTimeline,
        relatedNotices,
        progressReminderSettings,
        progressReminderOptions,
        noticeProgress
      } = payload;
      const resolvedNotice = notice || null;
      const resolvedNoticeTrust = noticeTrust || null;
      const resolvedTimeline = noticeTimeline || [];
      const noticeNextAction = buildNoticeNextAction(resolvedNotice || {}, {
        noticeTrust: resolvedNoticeTrust,
        noticeTimeline: resolvedTimeline,
        noticeProgress: noticeProgress || null
      });
      const resolvedPositions = positions || [];
      const noticeCompareSuggestion = buildNoticeCompareSuggestion(
        resolvedNotice || {},
        resolvedPositions,
        compareGroups || []
      );
      const noticeNextActionSummary = buildNoticeNextActionSummary(resolvedNotice || {}, {
        noticeTrust: resolvedNoticeTrust,
        noticeTimeline: resolvedTimeline,
        noticeProgress: noticeProgress || null
      });
      this.setData({
        notice: resolvedNotice,
        noticeTrust: resolvedNoticeTrust,
        positions: resolvedPositions,
        noticeBatch: noticeBatch || null,
        noticeTimeline: resolvedTimeline,
        relatedNotices: relatedNotices || [],
        progressReminderSettings: progressReminderSettings || null,
        progressReminderOptions: progressReminderOptions || [],
        canViewPositions,
        favorite,
        sourceModeLabel: resolvedNotice ? mapSourceModeLabel(resolvedNotice) : "",
        trustBadgeClass: mapTrustBadgeClass(resolvedNoticeTrust),
        availabilitySummary: getAvailabilitySummary(resolvedNotice, resolvedNoticeTrust),
        noticeNextAction,
        noticeNextActionSummary,
        decisionPriority: buildNoticeDecisionPriority(
          resolvedNotice,
          noticeNextAction,
          noticeNextActionSummary,
          noticeCompareSuggestion,
          canViewPositions
        ),
        secondaryActionLabel: canViewPositions ? "收藏后继续对比" : "收藏后继续追踪",
        noticeCompareSuggestion,
        trustAction: buildTrustAction(resolvedNoticeTrust),
        mergedSourceSummary: buildMergedSourceSummary(resolvedNotice),
        mergedSourceEntries: buildMergedSourceEntries(resolvedNotice)
      });
    });
  },

  toggleFavorite() {
    const { notice } = this.data;
    api.toggleFavoriteNotice(notice.id).then((favoriteIds) => {
      const isFavorite = favoriteIds.includes(notice.id);
      this.setData({
        favorite: isFavorite
      });
      wx.showToast({
        title: isFavorite ? "已收藏公告" : "已取消收藏",
        icon: "success"
      });
    });
  },

  goToPositions() {
    const { notice } = this.data;
    if (!this.data.canViewPositions) {
      wx.showToast({ title: "岗位表尚未结构化，暂不可选岗", icon: "none" });
      return;
    }
    wx.navigateTo({ url: `/pages/positions/index?noticeId=${notice.id}` });
  },

  handlePrimaryAction() {
    const { noticeNextAction } = this.data;
    if (!noticeNextAction) {
      return;
    }
    if (noticeNextAction.primaryActionType === "positions") {
      this.goToPositions();
      return;
    }
    if (noticeNextAction.primaryActionType === "notice" && noticeNextAction.primaryNoticeId) {
      wx.navigateTo({ url: `/pages/notice-detail/index?id=${noticeNextAction.primaryNoticeId}` });
    }
  },

  handleCompareAction() {
    const { notice, positions, noticeCompareSuggestion } = this.data;
    if (!notice || !noticeCompareSuggestion || !noticeCompareSuggestion.mode) {
      wx.showToast({ title: "当前公告暂无可对比岗位", icon: "none" });
      return;
    }

    if (noticeCompareSuggestion.mode === "review-needed") {
      wx.navigateTo({ url: buildComparePageUrl(noticeCompareSuggestion) });
      return;
    }

    const compareRecord = buildNoticeCompareRecord(notice, positions);
    if (!compareRecord.currentPositionIds.length) {
      wx.showToast({ title: "当前公告暂无可对比岗位", icon: "none" });
      return;
    }

    executeQuickCompare(api, compareRecord, {
      compareContext: buildNoticeCompareContext(notice)
    }).then((result) => {
      if (!result || result.status === "empty" || !result.group) {
        wx.showToast({ title: "当前公告暂无可对比岗位", icon: "none" });
        return;
      }

      wx.showToast({
        title: buildQuickCompareToastTitle(result),
        icon: "success"
      });
      wx.navigateTo({ url: `/pages/compare/index?groupId=${result.group.id}` });
    }).catch((error) => {
      wx.showToast({ title: error.message, icon: "none" });
    });
  },

  openRelatedNotice(event) {
    const { id } = event.currentTarget.dataset;
    if (!id || id === this.noticeId) {
      return;
    }
    wx.navigateTo({ url: `/pages/notice-detail/index?id=${id}` });
  },

  openTrustRoute(event) {
    const route = (event && event.detail && event.detail.route) || (
      event && event.currentTarget && event.currentTarget.dataset
        ? event.currentTarget.dataset.route
        : ""
    );
    if (!route) {
      return;
    }
    wx.navigateTo({ url: route });
  },

  toggleProgressReminderSetting(event) {
    const { id } = event.currentTarget.dataset;
    const settings = this.data.progressReminderSettings || {};
    if (!id || !(id in settings)) {
      return;
    }

    api.saveNoticeProgressReminderSettings(this.noticeId, {
      [id]: !settings[id]
    }).then((payload) => {
      this.setData({
        progressReminderSettings: payload.settings || settings,
        progressReminderOptions: payload.options || this.data.progressReminderOptions
      });
      wx.showToast({
        title: payload.settings && payload.settings[id] ? "已开启提醒" : "已关闭提醒",
        icon: "success"
      });
    });
  }
});
