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

const EXAM_FILTERS = [
  { id: "all", label: "全部公告" },
  { id: "guangdong-provincial", label: "广东省考" },
  { id: "national", label: "国考" },
  { id: "recent", label: "近 7 天" },
  { id: "structured", label: "可选岗" }
];

const STAGE_FILTERS = [
  { id: "all", label: "全部阶段" },
  { id: "main", label: "主公告" },
  { id: "registration", label: "报名" },
  { id: "written-exam", label: "笔试" },
  { id: "qualification-review", label: "资格审核" },
  { id: "interview", label: "面试" },
  { id: "final", label: "录用" }
];

const ACTIONABLE_COMPARE_MODES = new Set([
  "open-existing",
  "reuse",
  "create-first",
  "create-new"
]);
const TRACKING_STAGE_IDS = new Set([
  "qualification-review",
  "interview",
  "physical-test",
  "final"
]);

function getPublishedTime(item = {}) {
  const publishedTime = Date.parse(String(item.publishedAt || "").trim());
  return Number.isFinite(publishedTime) ? publishedTime : 0;
}

function buildNoticePriority(item, noticeCompareSuggestion, noticeNextAction) {
  let score = 0;

  if (item.hasStructuredPositions) {
    score += 30;
  }
  if (ACTIONABLE_COMPARE_MODES.has(noticeCompareSuggestion.mode)) {
    score += 24;
  }
  if (item.noticeStageId === "main") {
    score += 12;
  }
  if (item.examType === "guangdong-provincial") {
    score += 8;
  }
  score += getPublishedTime(item) ? 6 : 0;

  if (item.hasStructuredPositions && ACTIONABLE_COMPARE_MODES.has(noticeCompareSuggestion.mode)) {
    return {
      label: "优先选岗",
      detail: noticeCompareSuggestion.hint || "当前公告已开放岗位筛选和对比，适合优先处理。",
      score,
      tagClass: "tag-active"
    };
  }

  if (item.hasStructuredPositions) {
    return {
      label: "先看岗位",
      detail: noticeNextAction.label ? `${noticeNextAction.label}，再决定是否进入对比。` : "当前公告已开放岗位筛选，建议先看岗位条件。",
      score,
      tagClass: ""
    };
  }

  if (TRACKING_STAGE_IDS.has(item.noticeStageId)) {
    return {
      label: "进度更新",
      detail: item.noticeProgressDetail || "当前更适合跟进后续进度，暂不建议直接选岗。",
      score: score - 6,
      tagClass: "tag-warn"
    };
  }

  if (item.sourceMode === "demo") {
    return {
      label: "信息观察",
      detail: item.sourceModeNote || "当前为演示或观察来源，建议先确认官方后续更新。",
      score: score - 10,
      tagClass: "tag-warn"
    };
  }

  return {
    label: "先看公告",
    detail: noticeNextAction.label ? `${noticeNextAction.label}，后续再看结构化状态。` : "建议先看公告和附件，等待岗位表结构化完成。",
    score,
    tagClass: ""
  };
}

function mapNoticeMode(item, options = {}) {
  const hasStructuredPositions = Boolean(item.hasStructuredPositions);
  const noticeNextAction = buildNoticeNextAction(item, {
    noticeTrust: item.noticeTrust || null
  });
  const noticeCompareSuggestion = item.noticeCompareSuggestion || buildNoticeCompareSuggestion(
    item,
    item.noticeCompareCandidateIds || options.positions || [],
    options.compareGroups || []
  );
  const noticePriority = buildNoticePriority(item, noticeCompareSuggestion, noticeNextAction);
  return {
    ...item,
    sourceModeLabel: item.sourceModeLabel || (item.sourceMode === "demo" ? "演示" : "官方"),
    availabilityLabel: hasStructuredPositions ? "可选岗" : "仅公告",
    availabilityTagClass: hasStructuredPositions ? "" : "tag-warn",
    noticeStageLabel: item.noticeStageLabel || "公告",
    relatedNoticeCount: Number(item.relatedNoticeCount || 0),
    followingNoticeCount: Number(item.followingNoticeCount || 0),
    noticeProgressHint: item.noticeProgressHint || "",
    noticeProgressDetail: item.noticeProgressDetail || "",
    noticeNextAction,
    noticeNextActionSummary: buildNoticeNextActionSummary(item, {
      noticeTrust: item.noticeTrust || null
    }),
    noticeActionTagClass: noticeNextAction.tone === "warn" ? "tag-warn" : (noticeNextAction.tone === "ok" ? "tag-active" : ""),
    noticeCompareSuggestion,
    noticeCompareTagClass: noticeCompareSuggestion.mode === "review-needed"
      ? "tag-warn"
      : (noticeCompareSuggestion.actionLabel ? "tag-active" : ""),
    trustAction: buildTrustAction(item.noticeTrust || null),
    noticePriorityLabel: noticePriority.label,
    noticePriorityDetail: noticePriority.detail,
    noticePriorityScore: noticePriority.score,
    noticePriorityTagClass: noticePriority.tagClass
  };
}

function isRecentNotice(item) {
  const publishedTime = new Date(item.publishedAt).getTime();
  if (Number.isNaN(publishedTime)) {
    return false;
  }
  return Date.now() - publishedTime <= 7 * 24 * 60 * 60 * 1000;
}

function filterByExam(notices, activeExamFilterId) {
  if (activeExamFilterId === "guangdong-provincial") {
    return notices.filter((item) => item.examType === "guangdong-provincial");
  }
  if (activeExamFilterId === "national") {
    return notices.filter((item) => item.examType === "national");
  }
  if (activeExamFilterId === "recent") {
    return notices.filter(isRecentNotice);
  }
  if (activeExamFilterId === "structured") {
    return notices.filter((item) => item.hasStructuredPositions);
  }
  return notices;
}

function filterByStage(notices, activeStageFilterId) {
  if (activeStageFilterId === "all") {
    return notices;
  }
  return notices.filter((item) => item.noticeStageId === activeStageFilterId);
}

function buildNoticesSummary(notices = []) {
  if (!Array.isArray(notices) || !notices.length) {
    return {
      active: false,
      headline: "",
      detail: "",
      tags: []
    };
  }

  const actionableCount = notices.filter((item) => item.noticePriorityLabel === "优先选岗").length;
  const structuredCount = notices.filter((item) => item.hasStructuredPositions).length;
  const trackingCount = notices.filter((item) => item.noticePriorityLabel === "进度更新").length;
  const topNotice = notices.slice().sort((left, right) => {
    const scoreGap = Number(right.noticePriorityScore || 0) - Number(left.noticePriorityScore || 0);
    if (scoreGap !== 0) {
      return scoreGap;
    }
    return getPublishedTime(right) - getPublishedTime(left);
  })[0] || null;

  if (actionableCount > 0) {
    return {
      active: true,
      headline: `优先处理 ${actionableCount} 条可选岗公告`,
      detail: topNotice ? `${topNotice.title} 当前最值得先看。${topNotice.noticePriorityDetail || ""}` : "当前已有可直接进入选岗或对比的公告。",
      tags: [
        structuredCount > 0 ? `可选岗 ${structuredCount}` : "",
        trackingCount > 0 ? `进度更新 ${trackingCount}` : ""
      ].filter(Boolean)
    };
  }

  if (structuredCount > 0) {
    return {
      active: true,
      headline: `优先处理 ${structuredCount} 条可选岗公告`,
      detail: topNotice ? `${topNotice.title} 已开放岗位查看，建议先处理这一条。${topNotice.noticePriorityDetail || ""}` : "当前已有公告进入岗位筛选阶段，但可能需要先整理对比方案。",
      tags: [
        trackingCount > 0 ? `进度更新 ${trackingCount}` : ""
      ].filter(Boolean)
    };
  }

  if (trackingCount > 0) {
    return {
      active: true,
      headline: `当前以进度更新为主`,
      detail: topNotice ? `${topNotice.title} 更适合继续跟进后续流程。` : "当前列表里的公告更适合做进度追踪。",
      tags: [`进度更新 ${trackingCount}`]
    };
  }

  return {
    active: true,
    headline: "先看公告再等结构化",
    detail: topNotice ? `${topNotice.title} 当前更适合先看公告和附件。` : "当前列表里的公告还没有进入可选岗状态。",
    tags: []
  };
}

Page({
  data: {
    examFilters: EXAM_FILTERS,
    stageFilters: STAGE_FILTERS,
    activeFilterId: "all",
    activeExamFilterId: "all",
    activeStageFilterId: "all",
    notices: [],
    allNotices: [],
    noticesSummary: {
      active: false,
      headline: "",
      detail: "",
      tags: []
    }
  },

  onShow() {
    const compareGroupsPromise = typeof api.listCompareGroups === "function"
      ? api.listCompareGroups().catch(() => [])
      : Promise.resolve([]);

    Promise.all([
      api.listNotices(),
      compareGroupsPromise
    ]).then(([notices, compareGroups]) => {
      const allNotices = notices.map((item) => mapNoticeMode(item, {
        compareGroups
      }));
      this.setData({ allNotices });
      this.applyFilters(this.data.activeExamFilterId, this.data.activeStageFilterId);
    });
  },

  applyFilters(activeExamFilterId, activeStageFilterId) {
    const examFiltered = filterByExam(this.data.allNotices, activeExamFilterId);
    const notices = filterByStage(examFiltered, activeStageFilterId);
    this.setData({
      activeFilterId: activeExamFilterId,
      activeExamFilterId,
      activeStageFilterId,
      notices,
      noticesSummary: buildNoticesSummary(notices)
    });
  },

  changeExamFilter(event) {
    const { id } = event.currentTarget.dataset;
    this.applyFilters(id, this.data.activeStageFilterId);
  },

  changeFilter(event) {
    this.changeExamFilter(event);
  },

  changeStageFilter(event) {
    const { id } = event.currentTarget.dataset;
    this.applyFilters(this.data.activeExamFilterId, id);
  },

  openNotice(event) {
    const { id } = event.currentTarget.dataset;
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

  handleCompareAction(event) {
    const { id } = event.currentTarget.dataset;
    const notice = this.data.allNotices.find((item) => item.id === id) || null;
    const noticeCompareSuggestion = notice ? notice.noticeCompareSuggestion : buildEmptyNoticeCompareSuggestion();

    if (!notice || !noticeCompareSuggestion || !noticeCompareSuggestion.mode) {
      wx.showToast({ title: "当前公告暂无可对比岗位", icon: "none" });
      return;
    }

    if (noticeCompareSuggestion.mode === "review-needed" || noticeCompareSuggestion.mode === "open-existing") {
      wx.navigateTo({ url: buildComparePageUrl(noticeCompareSuggestion) });
      return;
    }

    const compareRecord = buildNoticeCompareRecord(notice, notice.noticeCompareCandidateIds || []);
    if (!compareRecord.currentPositionIds.length) {
      wx.showToast({ title: "当前公告暂无可对比岗位", icon: "none" });
      return;
    }

    executeQuickCompare(api, compareRecord, {
      compareContext: buildNoticeCompareContext(notice, {
        sourceLabel: "公告列表",
        sourceEntry: "notices"
      })
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
  }
});
