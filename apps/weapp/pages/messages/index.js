const api = require("../../utils/api");
const { buildNoticeNextActionSummary } = require("../../utils/notice-action-guidance");
const {
  executeQuickCompare,
  buildQuickCompareToastTitle
} = require("../../utils/compare-group-actions");
const {
  buildNoticeCompareContext,
  buildNoticeCompareRecord,
  buildEmptyNoticeCompareSuggestion
} = require("../../utils/notice-compare-guidance");

function buildSubscriptionPositionsUrl(noticeId, subscriptionId, newPositionIds = []) {
  const params = [
    `noticeId=${noticeId}`,
    `subscriptionId=${subscriptionId}`
  ];
  if (Array.isArray(newPositionIds) && newPositionIds.length) {
    params.push(`newPositionIds=${encodeURIComponent(newPositionIds.join(","))}`);
  }
  return `/pages/positions/index?${params.join("&")}`;
}

function resolveNavigation(message) {
  if (message.pageUrl) {
    return message.pageUrl;
  }
  if (message.type === "subscription") {
    return buildSubscriptionPositionsUrl(message.noticeId, message.subscriptionId);
  }
  if (message.noticeId) {
    return `/pages/notice-detail/index?id=${message.noticeId}`;
  }
  return "";
}

function buildComparePageUrl(compareSuggestion = {}) {
  if (compareSuggestion && compareSuggestion.groupId) {
    return `/pages/compare/index?groupId=${compareSuggestion.groupId}`;
  }
  return "/pages/compare/index";
}

const OPEN_COMPARE_PAGE_MODES = new Set(["review-needed", "open-existing"]);

function buildNoticeLookup(notices = []) {
  return (notices || []).reduce((result, item) => {
    if (item && item.id) {
      result[item.id] = item;
    }
    return result;
  }, {});
}

function enrichProgressMessages(messages = [], notices = []) {
  const noticeMap = buildNoticeLookup(notices);
  return (messages || []).map((item) => {
    const currentNotice = noticeMap[item.noticeId] || null;
    const favoriteNotice = noticeMap[item.favoriteNoticeId] || null;
    const compareNotice = currentNotice && currentNotice.hasStructuredPositions
      ? currentNotice
      : (favoriteNotice && favoriteNotice.hasStructuredPositions ? favoriteNotice : currentNotice || favoriteNotice || null);
    const noticeCompareSuggestion = compareNotice
      ? (compareNotice.noticeCompareSuggestion || buildEmptyNoticeCompareSuggestion())
      : buildEmptyNoticeCompareSuggestion();
    const nextActionSummary = currentNotice
      ? buildNoticeNextActionSummary(currentNotice, {
        noticeTrust: currentNotice.noticeTrust || null,
        noticeTimeline: [favoriteNotice, currentNotice].filter(Boolean)
      })
      : "";
    const priority = buildProgressPriority(item, nextActionSummary, noticeCompareSuggestion);

    return {
      ...item,
      nextActionSummary,
      noticeCompareSuggestion,
      compareHint: noticeCompareSuggestion.hint || "",
      compareActionLabel: noticeCompareSuggestion.actionLabel || "",
      compareReady: Boolean(noticeCompareSuggestion.ready),
      compareNoticeId: compareNotice ? compareNotice.id : "",
      compareNoticeTitle: compareNotice ? (compareNotice.title || "") : "",
      compareNoticeArea: compareNotice ? (compareNotice.area || "") : "",
      compareExamType: compareNotice ? (compareNotice.examType || "") : "",
      compareCandidateIds: compareNotice && Array.isArray(compareNotice.noticeCompareCandidateIds)
        ? compareNotice.noticeCompareCandidateIds.slice()
        : [],
      compareFallbackSummary: compareNotice && favoriteNotice && currentNotice && compareNotice.id !== currentNotice.id
        ? `岗位对比将回到${compareNotice.noticeStageLabel || "主公告"}：${compareNotice.title || "当前公告"}`
        : "",
      priorityLabel: priority.label,
      prioritySummary: priority.summary,
      priorityTags: priority.tags
    };
  });
}

function buildProgressPriority(message = {}, nextActionSummary = "", compareSuggestion = {}) {
  if (compareSuggestion && compareSuggestion.ready) {
    return {
      label: "可直接进对比",
      summary: compareSuggestion.hint || nextActionSummary || message.summary || "",
      tags: ["进度提醒", "可对比"].filter(Boolean)
    };
  }
  if (compareSuggestion && compareSuggestion.mode === "review-needed") {
    return {
      label: "先整理对比方案",
      summary: compareSuggestion.hint || nextActionSummary || message.summary || "",
      tags: ["进度提醒", "待整理"].filter(Boolean)
    };
  }
  return {
    label: "优先跟进进度",
    summary: nextActionSummary || message.summary || "",
    tags: ["进度提醒", "继续追踪"].filter(Boolean)
  };
}

function enrichSubscriptionMessages(messages = []) {
  return (messages || []).map((item) => {
    const explicitNewMatchCount = Number(item.newMatchCount || 0);
    const previewNewMatchCount = Array.isArray(item.newPositionPreview) ? item.newPositionPreview.length : 0;
    const summaryNewMatchMatch = String(item.summary || "").match(/新增\s*(\d+)\s*个岗位/);
    const summaryNewMatchCount = summaryNewMatchMatch ? Number(summaryNewMatchMatch[1] || 0) : 0;
    const newMatchCount = Math.max(explicitNewMatchCount, previewNewMatchCount, summaryNewMatchCount);
    const compareReady = Boolean(item.compareReady);
    let priorityLabel = "";
    let prioritySummary = "";
    const priorityTags = [];

    if (newMatchCount > 0 && compareReady) {
      priorityLabel = "优先处理新增命中";
      prioritySummary = item.decisionSummary || item.summary || item.nextActionSummary || "";
      priorityTags.push("新增命中", "可对比");
    } else if (newMatchCount > 0) {
      priorityLabel = "先回看新增命中";
      prioritySummary = item.compareHint || item.nextActionSummary || item.summary || "";
      priorityTags.push("新增命中", "待整理");
    } else if (compareReady) {
      priorityLabel = "可直接复查历史命中";
      prioritySummary = item.nextActionSummary || item.summary || "";
      priorityTags.push("无新增", "可对比");
    } else {
      priorityLabel = "按需回看";
      prioritySummary = item.compareHint || item.nextActionSummary || item.summary || "";
      priorityTags.push("无新增");
    }

    return {
      ...item,
      priorityLabel,
      prioritySummary,
      priorityTags
    };
  });
}

function partitionMessages(messages) {
  const progressMessages = messages.filter((item) => item.type === "favorite-progress");
  const subscriptionMessages = messages.filter((item) => item.type === "subscription");
  const alertMessages = messages.filter((item) => item.type === "source-alert");
  const otherMessages = messages.filter((item) => (
    item.type !== "favorite-progress" &&
    item.type !== "subscription" &&
    item.type !== "source-alert"
  ));

  return {
    progressMessages,
    subscriptionMessages,
    alertMessages,
    otherMessages
  };
}

Page({
  data: {
    unreadCount: 0,
    messages: [],
    progressMessages: [],
    subscriptionMessages: [],
    alertMessages: [],
    otherMessages: [],
    progressMessageCount: 0,
    alertMessageCount: 0,
    subscriptionMessageCount: 0,
    otherMessageCount: 0
  },

  onShow() {
    api.getDashboard().then((payload) => {
      const messages = payload.messages || [];
      const {
        progressMessages,
        subscriptionMessages,
        alertMessages,
        otherMessages
      } = partitionMessages(messages);
      const enrichedProgressMessages = enrichProgressMessages(progressMessages, payload.notices || []);
      const enrichedSubscriptionMessages = enrichSubscriptionMessages(subscriptionMessages);

      this.setData({
        unreadCount: payload.stats.unreadMessageCount,
        messages,
        progressMessages: enrichedProgressMessages,
        subscriptionMessages: enrichedSubscriptionMessages,
        alertMessages,
        otherMessages,
        progressMessageCount: enrichedProgressMessages.length,
        alertMessageCount: alertMessages.length,
        subscriptionMessageCount: enrichedSubscriptionMessages.length,
        otherMessageCount: otherMessages.length
      });
    });
  },

  openMessage(event) {
    const { id } = event.currentTarget.dataset;
    const message = this.data.messages.find((item) => item.id === id);
    if (!message) {
      return;
    }

    if (message.type === "subscription" && message.subscriptionId) {
      Promise.all([
        api.getSubscription(message.subscriptionId),
        api.markMessageRead(message.id)
      ]).then(([subscription]) => {
        const targetUrl = buildSubscriptionPositionsUrl(
          message.noticeId,
          message.subscriptionId,
          subscription && Array.isArray(subscription.newPositionIds) ? subscription.newPositionIds : []
        );
        return api.markSubscriptionSeen(message.subscriptionId).then(() => {
          this.onShow();
          wx.navigateTo({ url: targetUrl });
        });
      });
      return;
    }

    const targetUrl = resolveNavigation(message);
    api.markMessageRead(message.id).then(() => {
      this.onShow();
      if (targetUrl) {
        wx.navigateTo({ url: targetUrl });
      }
    });
  },

  quickCompareMessage(event) {
    const { id } = event.currentTarget.dataset;
    const message = this.data.messages.find((item) => item.id === id);
    if (!message || message.type !== "subscription" || !message.subscriptionId) {
      return;
    }

    Promise.all([
      api.getSubscription(message.subscriptionId),
      api.markMessageRead(message.id)
    ]).then(([subscription]) => {
      if (!subscription) {
        wx.showToast({ title: "订阅方案不存在", icon: "none" });
        return null;
      }
      if (subscription.compareSuggestion && subscription.compareSuggestion.mode === "review-needed") {
        this.onShow();
        wx.navigateTo({ url: buildComparePageUrl(subscription.compareSuggestion) });
        return null;
      }

      return executeQuickCompare(api, subscription, {
        preferNew: true,
        compareContext: {
          sourceType: "subscription",
          sourceLabel: "订阅命中",
          sourceEntry: "messages",
          sourceName: subscription.name || "",
          noticeId: message.noticeId || subscription.noticeId || "",
          noticeTitle: subscription.noticeTitle || ""
        }
      });
    }).then((result) => {
      if (!result) {
        return;
      }
      if (result.status === "empty" || !result.group) {
        wx.showToast({ title: "当前没有可对比岗位", icon: "none" });
        return;
      }

      api.markSubscriptionSeen(message.subscriptionId).then(() => {
        this.onShow();
        wx.showToast({
          title: buildQuickCompareToastTitle(result),
          icon: "success"
        });
        wx.navigateTo({ url: `/pages/compare/index?groupId=${result.group.id}` });
      });
    }).catch((error) => {
      wx.showToast({ title: error.message, icon: "none" });
    });
  },

  quickCompareProgressMessage(event) {
    const { id } = event.currentTarget.dataset;
    const message = this.data.progressMessages.find((item) => item.id === id);
    const noticeCompareSuggestion = message
      ? message.noticeCompareSuggestion
      : buildEmptyNoticeCompareSuggestion();

    if (!message || !noticeCompareSuggestion || !noticeCompareSuggestion.mode) {
      wx.showToast({ title: "当前公告暂无可对比岗位", icon: "none" });
      return;
    }

    api.markMessageRead(message.id).then(() => {
      if (OPEN_COMPARE_PAGE_MODES.has(noticeCompareSuggestion.mode)) {
        this.onShow();
        wx.navigateTo({ url: buildComparePageUrl(noticeCompareSuggestion) });
        return null;
      }

      const compareNotice = {
        id: message.compareNoticeId || message.noticeId || "",
        title: message.compareNoticeTitle || "",
        area: message.compareNoticeArea || "",
        examType: message.compareExamType || ""
      };
      const compareRecord = buildNoticeCompareRecord(compareNotice, message.compareCandidateIds || []);
      if (!compareRecord.currentPositionIds.length) {
        wx.showToast({ title: "当前公告暂无可对比岗位", icon: "none" });
        this.onShow();
        return null;
      }

      return executeQuickCompare(api, compareRecord, {
        compareContext: buildNoticeCompareContext(compareNotice, {
          sourceLabel: "进度提醒",
          sourceEntry: "messages",
          noticeId: message.compareNoticeId || message.noticeId || "",
          noticeTitle: message.compareNoticeTitle || message.title || ""
        })
      });
    }).then((result) => {
      if (!result) {
        return;
      }
      if (result.status === "empty" || !result.group) {
        wx.showToast({ title: "当前公告暂无可对比岗位", icon: "none" });
        return;
      }

      this.onShow();
      wx.showToast({
        title: buildQuickCompareToastTitle(result),
        icon: "success"
      });
      wx.navigateTo({ url: `/pages/compare/index?groupId=${result.group.id}` });
    }).catch((error) => {
      wx.showToast({ title: error.message, icon: "none" });
    });
  }
});
