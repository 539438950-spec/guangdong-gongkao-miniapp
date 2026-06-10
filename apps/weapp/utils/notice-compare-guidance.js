const {
  COMPARE_LIMIT,
  describeComparePlan
} = require("./compare-group-actions");

function buildComparePageUrl(compareSuggestion = {}) {
  if (compareSuggestion && compareSuggestion.groupId) {
    return `/pages/compare/index?groupId=${compareSuggestion.groupId}`;
  }
  return "/pages/compare/index";
}

function buildNoticeCompareContext(notice = {}, options = {}) {
  return {
    sourceType: options.sourceType || "notice",
    sourceLabel: options.sourceLabel || "公告详情",
    sourceEntry: options.sourceEntry || "notice-detail",
    sourceName: options.sourceName || `${notice.area || "当前"}公告岗位`,
    noticeId: options.noticeId || notice.id || "",
    noticeTitle: options.noticeTitle || notice.title || ""
  };
}

function getNoticeCompareCandidateIds(positions = []) {
  return Array.from(new Set(
    (positions || []).map((item) => {
      if (!item) {
        return "";
      }
      if (typeof item === "string") {
        return item;
      }
      return item.id || "";
    }).filter(Boolean)
  )).slice(0, COMPARE_LIMIT);
}

function buildNoticeCompareRecord(notice = {}, positions = []) {
  return {
    name: `${notice.area || "当前"}公告岗位`,
    examType: notice.examType,
    currentPositionIds: getNoticeCompareCandidateIds(positions)
  };
}

function buildEmptyNoticeCompareSuggestion() {
  return {
    mode: "",
    ready: false,
    hint: "",
    actionLabel: "",
    groupId: "",
    groupName: "",
    candidateCount: 0,
    totalPositionCount: 0,
    compatibleGroupCount: 0
  };
}

function appendOverflowHint(baseHint, candidateCount, totalPositionCount) {
  if (!candidateCount || totalPositionCount <= candidateCount) {
    return baseHint;
  }
  const overflowHint = `当前公告共 ${totalPositionCount} 个岗位，本次先带入前 ${candidateCount} 个；如需更精确可先去岗位列表筛选。`;
  return baseHint ? `${baseHint} ${overflowHint}` : overflowHint;
}

function buildNoticeCompareSuggestion(notice = {}, positions = [], compareGroups = []) {
  const candidateIds = getNoticeCompareCandidateIds(positions);
  const totalPositionCount = Array.from(new Set(
    (positions || []).map((item) => {
      if (!item) {
        return "";
      }
      if (typeof item === "string") {
        return item;
      }
      return item.id || "";
    }).filter(Boolean)
  )).length;

  if (!notice || !notice.hasStructuredPositions || !notice.examType) {
    return buildEmptyNoticeCompareSuggestion();
  }

  if (!candidateIds.length) {
    return {
      ...buildEmptyNoticeCompareSuggestion(),
      mode: "empty",
      hint: "当前公告暂无可直接带入对比方案的岗位",
      totalPositionCount
    };
  }

  const compareSuggestion = describeComparePlan(compareGroups, notice.examType, candidateIds);
  const nextSuggestion = {
    ...compareSuggestion,
    candidateCount: candidateIds.length,
    totalPositionCount
  };

  if (compareSuggestion.mode === "open-existing") {
    return {
      ...nextSuggestion,
      hint: appendOverflowHint(
        `当前公告岗位已在对比方案：${compareSuggestion.groupName}`,
        candidateIds.length,
        totalPositionCount
      ),
      actionLabel: "打开已有方案"
    };
  }

  if (compareSuggestion.mode === "reuse") {
    return {
      ...nextSuggestion,
      hint: appendOverflowHint(
        `可直接把当前公告岗位补入对比方案：${compareSuggestion.groupName}`,
        candidateIds.length,
        totalPositionCount
      ),
      actionLabel: candidateIds.length > 1 ? `带入 ${candidateIds.length} 个岗位对比` : "带入岗位对比"
    };
  }

  if (compareSuggestion.mode === "create-first") {
    return {
      ...nextSuggestion,
      hint: appendOverflowHint(
        "当前公告岗位可直接新建首个同考试对比方案",
        candidateIds.length,
        totalPositionCount
      ),
      actionLabel: "新建对比方案"
    };
  }

  if (compareSuggestion.mode === "create-new") {
    return {
      ...nextSuggestion,
      hint: appendOverflowHint(
        `现有 ${compareSuggestion.compatibleGroupCount} 个同考试方案已放满，当前公告岗位可新建方案`,
        candidateIds.length,
        totalPositionCount
      ),
      actionLabel: "新建对比方案"
    };
  }

  if (compareSuggestion.mode === "review-needed") {
    return {
      ...nextSuggestion,
      hint: appendOverflowHint(compareSuggestion.hint, candidateIds.length, totalPositionCount),
      actionLabel: "先去整理对比方案"
    };
  }

  return {
    ...nextSuggestion,
    hint: appendOverflowHint(compareSuggestion.hint || "", candidateIds.length, totalPositionCount),
    actionLabel: compareSuggestion.actionLabel || "带入岗位对比"
  };
}

module.exports = {
  buildComparePageUrl,
  buildNoticeCompareContext,
  getNoticeCompareCandidateIds,
  buildNoticeCompareRecord,
  buildEmptyNoticeCompareSuggestion,
  buildNoticeCompareSuggestion
};
