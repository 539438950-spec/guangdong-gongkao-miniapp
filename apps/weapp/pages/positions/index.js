const api = require("../../utils/api");
const { explainMajorMatch } = require("../../utils/major-matcher");
const {
  COMPARE_LIMIT,
  describeComparePlan,
  executeQuickCompare,
  buildQuickCompareToastTitle
} = require("../../utils/compare-group-actions");
const { buildPositionNextActionSummary } = require("../../utils/position-action-guidance");
const recommendationExplainer = require("../../utils/recommendation-explainer");
const { buildTrustAction } = require("../../utils/trust-action");

const DEFAULT_PERSONAL_PROFILE = {
  education: "",
  degree: "",
  majorKeywords: "",
  politicalStatus: "",
  serviceExperience: "",
  freshGraduateStatus: ""
};

function buildFilterOptions(positions, key) {
  return Array.from(
    new Set(
      (positions || [])
        .map((item) => item[key])
        .filter(Boolean)
    )
  ).sort();
}

function matchKeyword(position, keyword) {
  if (!keyword) {
    return true;
  }
  const target = [
    position.title,
    position.agency,
    position.positionCode,
    position.major,
    position.notes
  ].join(" ");
  return target.toLowerCase().includes(String(keyword).toLowerCase());
}

function normalizeValue(value) {
  if (value === undefined || value === null || value === "") {
    return "未注明";
  }
  return String(value);
}

function isOpenRequirement(value) {
  const text = normalizeValue(value);
  return text === "不限" || text === "未注明";
}

function normalizePersonalProfile(profile = {}) {
  return {
    education: String(profile.education || "").trim(),
    degree: String(profile.degree || "").trim(),
    majorKeywords: String(profile.majorKeywords || "").trim(),
    politicalStatus: String(profile.politicalStatus || "").trim(),
    serviceExperience: ["", "has", "none"].includes(String(profile.serviceExperience || ""))
      ? String(profile.serviceExperience || "")
      : "",
    freshGraduateStatus: ["", "fresh", "non-fresh"].includes(String(profile.freshGraduateStatus || ""))
      ? String(profile.freshGraduateStatus || "")
      : ""
  };
}

function hasPersonalProfile(profile = {}) {
  const normalized = normalizePersonalProfile(profile);
  return Boolean(
    normalized.education ||
    normalized.degree ||
    normalized.majorKeywords ||
    normalized.politicalStatus ||
    normalized.serviceExperience ||
    normalized.freshGraduateStatus
  );
}

function buildPersonalProfileSummary(profile = {}) {
  const normalized = normalizePersonalProfile(profile);
  const parts = [];
  if (normalized.education) parts.push(`学历:${normalized.education}`);
  if (normalized.degree) parts.push(`学位:${normalized.degree}`);
  if (normalized.majorKeywords) parts.push(`专业:${normalized.majorKeywords}`);
  if (normalized.politicalStatus) parts.push(`政治面貌:${normalized.politicalStatus}`);
  if (normalized.serviceExperience === "has") parts.push("有基层经历");
  if (normalized.serviceExperience === "none") parts.push("暂无基层经历");
  if (normalized.freshGraduateStatus === "fresh") parts.push("应届");
  if (normalized.freshGraduateStatus === "non-fresh") parts.push("非应届");
  return parts.length ? parts.join(" · ") : "尚未填写个人报考条件。";
}

function buildMergedSourceSummary(notice = {}) {
  const mergedSourceCount = Number(notice.mergedSourceCount || 0);
  if (mergedSourceCount <= 1) {
    return "";
  }

  const positionSourceName = notice.positionSourceName || notice.source || "";
  return `已聚合 ${mergedSourceCount} 个官方来源；岗位检索、岗位对比与相似岗位推荐以${positionSourceName || "岗位主源"}为准，其他来源用于补充公告原文和时间节点。`;
}

function buildMergedSourceEntries(notice = {}) {
  const mergedSources = Array.isArray(notice.mergedSources) ? notice.mergedSources : [];
  if (mergedSources.length <= 1) {
    return [];
  }

  const positionNoticeId = notice.positionNoticeId || "";
  return mergedSources.map((item) => ({
    noticeId: item.noticeId || "",
    sourceId: item.sourceId || "",
    sourceName: item.sourceName || "",
    publishedAt: item.publishedAt || "",
    positionCount: Number(item.positionCount || 0),
    isPrimary: Boolean(item.noticeId && item.noticeId === notice.id),
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

function includesKeyword(text, keyword) {
  return String(text || "").toLowerCase().includes(String(keyword || "").toLowerCase());
}

function evaluateEligibility(position, profile = {}) {
  const normalizedProfile = normalizePersonalProfile(profile);
  if (!hasPersonalProfile(normalizedProfile)) {
    return {
      eligibilityActive: false,
      mismatchCount: 0,
      mismatchReasons: [],
      majorMatchReasons: [],
      majorMatchSummary: "",
      isFullyMatched: true,
      eligibilityLabel: "未启用"
    };
  }

  const mismatchReasons = [];
  const education = normalizeValue(position.education);
  const degree = normalizeValue(position.degree);
  const major = normalizeValue(position.major);
  const politicalStatus = normalizeValue(position.politicalStatus);
  const hasMajorRequirement = !isOpenRequirement(major) || (
    Array.isArray(position.majorCodes) && position.majorCodes.length > 0
  );

  const majorMatchResult = normalizedProfile.majorKeywords && hasMajorRequirement
    ? explainMajorMatch(
      {
        majorRequirement: position.major,
        majorCodes: position.majorCodes
      },
      normalizedProfile.majorKeywords
    )
    : { matched: false, reasons: [], summary: "" };

  if (
    normalizedProfile.education &&
    !isOpenRequirement(education) &&
    !includesKeyword(education, normalizedProfile.education)
  ) {
    mismatchReasons.push("学历要求不匹配");
  }
  if (
    normalizedProfile.degree &&
    !isOpenRequirement(degree) &&
    !includesKeyword(degree, normalizedProfile.degree)
  ) {
    mismatchReasons.push("学位要求不匹配");
  }
  if (
    normalizedProfile.majorKeywords &&
    hasMajorRequirement &&
    !majorMatchResult.matched
  ) {
    mismatchReasons.push("专业要求不匹配");
  }
  if (
    normalizedProfile.politicalStatus &&
    !isOpenRequirement(politicalStatus) &&
    !includesKeyword(politicalStatus, normalizedProfile.politicalStatus)
  ) {
    mismatchReasons.push("政治面貌要求不匹配");
  }
  if (
    normalizedProfile.serviceExperience === "none" &&
    !isOpenRequirement(position.serviceRequirement)
  ) {
    mismatchReasons.push("缺少岗位要求的基层经历");
  }
  if (
    normalizedProfile.freshGraduateStatus === "non-fresh" &&
    position.freshGraduateOnly
  ) {
    mismatchReasons.push("该岗位仅限应届报考");
  }

  return {
    eligibilityActive: true,
    mismatchCount: mismatchReasons.length,
    mismatchReasons,
    majorMatchReasons: majorMatchResult.reasons || [],
    majorMatchSummary: majorMatchResult.summary || "",
    isFullyMatched: mismatchReasons.length === 0,
    eligibilityLabel: mismatchReasons.length ? `${mismatchReasons.length} 项不匹配` : "条件匹配"
  };
}

function enrichPositionWithEligibility(position, profile) {
  const enriched = {
    ...position,
    ...evaluateEligibility(position, profile)
  };
  return {
    ...enriched,
    nextActionSummary: buildPositionNextActionSummary(enriched)
  };
}

function buildEligibilitySummary(positions, personalProfile) {
  if (!hasPersonalProfile(personalProfile)) {
    return {
      active: false,
      profileSummary: buildPersonalProfileSummary(personalProfile),
      matchedCount: 0,
      blockedCount: 0
    };
  }

  return {
    active: true,
    profileSummary: buildPersonalProfileSummary(personalProfile),
    matchedCount: (positions || []).filter((item) => item.isFullyMatched).length,
    blockedCount: (positions || []).filter((item) => item.mismatchCount > 0).length
  };
}

function pickPreferredPosition(positions = []) {
  if (!Array.isArray(positions) || !positions.length) {
    return null;
  }

  return positions.slice().sort((left, right) => {
    if (Boolean(left.isFullyMatched) !== Boolean(right.isFullyMatched)) {
      return left.isFullyMatched ? -1 : 1;
    }
    const mismatchGap = Number(left.mismatchCount || 0) - Number(right.mismatchCount || 0);
    if (mismatchGap !== 0) {
      return mismatchGap;
    }
    if (Boolean(left.isNewSubscriptionHit) !== Boolean(right.isNewSubscriptionHit)) {
      return left.isNewSubscriptionHit ? -1 : 1;
    }
    return normalizeHeadcountValue(right.headcount) - normalizeHeadcountValue(left.headcount);
  })[0];
}

function buildEmptyScreeningSummary() {
  return {
    active: false,
    headline: "",
    detail: "",
    tags: []
  };
}

function buildScreeningSummary(positions = [], options = {}) {
  if (!Array.isArray(positions) || !positions.length) {
    return {
      active: true,
      headline: "当前筛选结果为空",
      detail: "建议放宽地区、学历、基层经历或关键词条件后再继续筛选。",
      tags: ["无结果"]
    };
  }

  const eligibilitySummary = options.eligibilitySummary || {};
  const currentResultsCompareSuggestion = options.currentResultsCompareSuggestion || {};
  const referenceFilterInfo = options.referenceFilterInfo || null;
  const onlyMatchedMode = Boolean(options.onlyMatchedMode);
  const onlyNewSubscriptionHits = Boolean(options.onlyNewSubscriptionHits);
  const preferredPosition = pickPreferredPosition(positions);
  const resultCount = positions.length;
  const matchedCount = Number(eligibilitySummary.matchedCount || 0);
  const blockedCount = Number(eligibilitySummary.blockedCount || 0);
  const newHitCount = positions.filter((item) => item.isNewSubscriptionHit).length;
  const tags = [];

  if (onlyMatchedMode) {
    tags.push("只看匹配");
  }
  if (onlyNewSubscriptionHits && newHitCount > 0) {
    tags.push(`新增命中 ${newHitCount}`);
  }
  if (referenceFilterInfo && referenceFilterInfo.type === "subscription") {
    tags.push("订阅回填");
  } else if (referenceFilterInfo && referenceFilterInfo.type === "saved-filter") {
    tags.push("方案回填");
  }

  if (currentResultsCompareSuggestion.mode === "review-needed") {
    return {
      active: true,
      headline: "先整理对比方案",
      detail: currentResultsCompareSuggestion.hint || "当前筛选结果已经适合对比，但现有方案容量不足，建议先整理后再写入。",
      tags: tags.concat("待整理")
    };
  }

  if (eligibilitySummary.active && matchedCount === 0) {
    return {
      active: true,
      headline: "先放宽筛选或调整个人条件",
      detail: `当前 ${resultCount} 个岗位都存在不匹配${blockedCount ? `，优先回看学历、专业和基层经历条件。` : "。"}`,
      tags: tags.concat("暂无可报")
    };
  }

  if (onlyNewSubscriptionHits && newHitCount > 0 && resultCount <= COMPARE_LIMIT) {
    return {
      active: true,
      headline: "优先处理新增命中",
      detail: `当前新增命中 ${newHitCount} 个岗位${preferredPosition ? `，可先从 ${preferredPosition.title} 开始核对或直接进对比。` : "，建议直接核对。"} `,
      tags: tags.concat("可直接处理")
    };
  }

  if (resultCount === 1 && preferredPosition) {
    return {
      active: true,
      headline: `先核对 ${preferredPosition.title}`,
      detail: preferredPosition.nextActionSummary || "当前只剩 1 个岗位，适合直接核对报考条件和原表字段。",
      tags: tags.concat(preferredPosition.isFullyMatched ? "当前可报" : "待确认")
    };
  }

  if (resultCount <= COMPARE_LIMIT && currentResultsCompareSuggestion.ready) {
    return {
      active: true,
      headline: "当前筛选结果适合直接进对比",
      detail: preferredPosition
        ? `当前共 ${resultCount} 个岗位，可先以 ${preferredPosition.title} 为基准加入对比，再做取舍。`
        : `当前共 ${resultCount} 个岗位，已经适合直接进入对比。`,
      tags: tags.concat("可对比")
    };
  }

  if (resultCount > COMPARE_LIMIT) {
    return {
      active: true,
      headline: "建议先缩小范围再进对比",
      detail: `当前命中 ${resultCount} 个岗位，已超过单组 ${COMPARE_LIMIT} 岗上限，建议先继续缩小筛选范围。`,
      tags: tags.concat("结果偏多")
    };
  }

  return {
    active: true,
    headline: "继续筛选后再决定是否进对比",
    detail: preferredPosition
      ? `当前可先重点看 ${preferredPosition.title}，再结合个人条件和对比方案容量决定下一步。`
      : "当前结果还需要进一步筛选后再决定是否进对比。",
    tags
  };
}

function buildEmptyRecommendationContext() {
  return {
    active: false,
    basePositionId: "",
    baseTitle: "",
    baseAgency: "",
    baseEligibilityLabel: ""
  };
}

function decorateRecommendedPosition(basePosition, candidatePosition) {
  const explanation = recommendationExplainer.decorateRecommendedPosition(basePosition, candidatePosition);
  return {
    ...candidatePosition,
    profileHint: explanation.profileHint,
    reasonSummary: explanation.reasonSummary,
    nextActionSummary: explanation.nextActionSummary
  };
}

function buildComparePageUrl(compareSuggestion = {}) {
  if (compareSuggestion && compareSuggestion.groupId) {
    return `/pages/compare/index?groupId=${compareSuggestion.groupId}`;
  }
  return "/pages/compare/index";
}

function buildFilterState(page) {
  return {
    keyword: page.data.keyword,
    selectedArea: page.data.selectedArea,
    selectedEducation: page.data.selectedEducation,
    selectedServiceRequirement: page.data.selectedServiceRequirement,
    selectedPoliticalStatus: page.data.selectedPoliticalStatus,
    freshGraduateMode: page.data.freshGraduateMode
  };
}

function buildSavedFilterName(notice, resultCount) {
  const area = (notice && notice.area) || "岗位";
  return `${area}筛选方案 ${resultCount}岗`;
}

function buildSubscriptionName(notice) {
  const area = (notice && notice.area) || "岗位";
  return `${area}岗位订阅`;
}

function buildGroupName(notice) {
  const area = (notice && notice.area) || "岗位";
  return `${area}岗位对比`;
}

function buildReferenceFilterTags(filters = {}) {
  const tags = [];
  if (filters.keyword) tags.push(`关键词:${filters.keyword}`);
  if (filters.selectedArea) tags.push(`地区:${filters.selectedArea}`);
  if (filters.selectedEducation) tags.push(`学历:${filters.selectedEducation}`);
  if (filters.selectedServiceRequirement) tags.push(`基层经历:${filters.selectedServiceRequirement}`);
  if (filters.selectedPoliticalStatus) tags.push(`政治面貌:${filters.selectedPoliticalStatus}`);
  if (filters.freshGraduateMode === "only") tags.push("仅看限应届");
  if (filters.freshGraduateMode === "exclude") tags.push("排除限应届");
  return tags;
}

function buildReferenceFilterInfo(referenceFilter, options = {}) {
  if (!referenceFilter) {
    return null;
  }

  const isSubscription = Boolean(options.isSubscription);
  return {
    type: isSubscription ? "subscription" : "saved-filter",
    tagLabel: isSubscription ? "订阅命中" : "筛选方案",
    name: referenceFilter.name || "",
    summary: referenceFilter.summary || "",
    ruleTags: buildReferenceFilterTags(referenceFilter.filters || {}),
    currentMatchCount: Number(referenceFilter.currentMatchCount || 0),
    newMatchCount: isSubscription ? Number(referenceFilter.newMatchCount || 0) : 0,
    hint: isSubscription
      ? "当前列表已按订阅规则回填筛选条件。"
      : "当前列表已按已保存的筛选方案回填条件。"
  };
}

function mapPositionsWithCompareStatus(positions, currentGroup) {
  const currentIds = currentGroup && Array.isArray(currentGroup.positionIds)
    ? currentGroup.positionIds
    : [];
  return (positions || []).map((item) => ({
    ...item,
    inCompare: currentIds.includes(item.id)
  }));
}

function parseIdListQuery(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeListViewPreferences(preferences = {}) {
  const normalized = preferences || {};
  return {
    sortMode: ["manual", "eligibility", "compare"].includes(normalized.sortMode)
      ? normalized.sortMode
      : "manual"
  };
}

function filterCompatibleCompareGroups(groups, examType) {
  if (!Array.isArray(groups) || !examType) {
    return [];
  }
  return groups.filter((group) => group && group.examType === examType);
}

function resolveCurrentGroupId(groups, preferredGroupId) {
  if (preferredGroupId && groups.some((group) => group.id === preferredGroupId)) {
    return preferredGroupId;
  }
  return groups[0] ? groups[0].id : "";
}

function findGroupById(groups, groupId) {
  return (groups || []).find((group) => group.id === groupId) || null;
}

function buildCompareResultPatch(result) {
  if (!result || !result.group) {
    return {
      lastCompareStatus: "",
      lastCompareTargetGroupId: "",
      lastCompareTargetGroupName: ""
    };
  }

  return {
    lastCompareStatus: String(result.status || ""),
    lastCompareTargetGroupId: result.group.id || "",
    lastCompareTargetGroupName: result.group.name || ""
  };
}

function buildEmptyPositionCompareSuggestion() {
  return {
    mode: "",
    ready: false,
    hint: "",
    actionLabel: "加入对比",
    groupId: "",
    groupName: ""
  };
}

function normalizeHeadcountValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isCompareGroupFull(group) {
  return Boolean(group) &&
    Array.isArray(group.positionIds) &&
    group.positionIds.length >= COMPARE_LIMIT;
}

function hasAlternativeCompareSlot(groups = [], currentGroupId = "", candidateId = "") {
  return (groups || []).some((group) => {
    if (!group || group.id === currentGroupId) {
      return false;
    }

    const positionIds = Array.isArray(group.positionIds) ? group.positionIds : [];
    return positionIds.includes(candidateId) || positionIds.length < COMPARE_LIMIT;
  });
}

function buildPositionCompareSuggestion(position, compareGroups = [], currentGroup = null) {
  if (!position) {
    return buildEmptyPositionCompareSuggestion();
  }

  const currentPositionIds = currentGroup && Array.isArray(currentGroup.positionIds)
    ? currentGroup.positionIds
    : [];

  if (currentGroup && currentPositionIds.includes(position.id)) {
    return {
      mode: "in-current-group",
      ready: true,
      hint: `已在当前方案：${currentGroup.name || "当前对比方案"}`,
      actionLabel: "已在当前方案",
      groupId: currentGroup.id || "",
      groupName: currentGroup.name || ""
    };
  }

  if (
    currentGroup &&
    isCompareGroupFull(currentGroup) &&
    !currentPositionIds.includes(position.id) &&
    !hasAlternativeCompareSlot(compareGroups, currentGroup.id, position.id)
  ) {
    return {
      mode: "replacement-needed",
      ready: false,
      hint: `当前方案“${currentGroup.name || "当前对比方案"}”已满，点击后可先看替换建议`,
      actionLabel: "先看替换建议",
      groupId: currentGroup.id || "",
      groupName: currentGroup.name || ""
    };
  }

  const compareSuggestion = describeComparePlan(
    compareGroups,
    position.examType,
    [position.id],
    {
      preferredGroupId: currentGroup ? currentGroup.id : ""
    }
  );

  if (compareSuggestion.mode === "open-existing") {
    if (currentGroup && compareSuggestion.groupId === currentGroup.id) {
      return {
        ...compareSuggestion,
        hint: `已在当前方案：${compareSuggestion.groupName}`,
        actionLabel: "打开当前方案"
      };
    }
    return {
      ...compareSuggestion,
      hint: `已在对比方案：${compareSuggestion.groupName}`,
      actionLabel: "打开已有方案"
    };
  }

  if (compareSuggestion.mode === "reuse") {
    if (currentGroup && compareSuggestion.groupId === currentGroup.id) {
      return {
        ...compareSuggestion,
        hint: `可直接加入当前方案：${compareSuggestion.groupName}`,
        actionLabel: "加入当前方案"
      };
    }
    return {
      ...compareSuggestion,
      hint: `可直接加入对比方案：${compareSuggestion.groupName}`,
      actionLabel: "加入推荐方案"
    };
  }

  if (compareSuggestion.mode === "create-first") {
    return {
      ...compareSuggestion,
      hint: "还没有同考试对比方案，可直接新建",
      actionLabel: "新建对比方案"
    };
  }

  if (compareSuggestion.mode === "create-new") {
    return {
      ...compareSuggestion,
      hint: `现有 ${compareSuggestion.compatibleGroupCount} 个同考试方案已放满，可直接新建`,
      actionLabel: "新建对比方案"
    };
  }

  if (compareSuggestion.mode === "review-needed") {
    return {
      ...compareSuggestion,
      hint: compareSuggestion.hint,
      actionLabel: "先去整理对比方案"
    };
  }

  return {
    ...compareSuggestion,
    actionLabel: compareSuggestion.actionLabel || "加入对比"
  };
}

function decoratePositionWithCompareSuggestion(position, compareGroups = [], currentGroup = null) {
  const compareSuggestion = buildPositionCompareSuggestion(position, compareGroups, currentGroup);
  return {
    ...position,
    compareSuggestion,
    compareHint: compareSuggestion.hint || "",
    compareActionLabel: compareSuggestion.actionLabel || "加入对比"
  };
}

function buildEmptyBatchCompareSuggestion() {
  return {
    mode: "",
    ready: false,
    hint: "",
    actionLabel: "一键对比当前筛选结果",
    groupId: "",
    groupName: "",
    candidateCount: 0
  };
}

function buildBatchCompareSuggestion(positions = [], compareGroups = [], currentGroup = null, examType = "") {
  const candidateIds = Array.from(new Set((positions || []).map((item) => item.id).filter(Boolean))).slice(0, COMPARE_LIMIT);
  if (!candidateIds.length) {
    return {
      ...buildEmptyBatchCompareSuggestion(),
      mode: "empty",
      hint: "当前筛选下没有可对比岗位"
    };
  }

  const compareSuggestion = describeComparePlan(compareGroups, examType, candidateIds, {
    preferredGroupId: currentGroup ? currentGroup.id : ""
  });

  if (compareSuggestion.mode === "open-existing") {
    if (currentGroup && compareSuggestion.groupId === currentGroup.id) {
      return {
        ...compareSuggestion,
        hint: `当前筛选结果已在当前方案：${compareSuggestion.groupName}`,
        actionLabel: "打开当前方案"
      };
    }
    return {
      ...compareSuggestion,
      hint: `当前筛选结果已在对比方案：${compareSuggestion.groupName}`,
      actionLabel: "打开已有方案"
    };
  }

  if (compareSuggestion.mode === "reuse") {
    if (currentGroup && compareSuggestion.groupId === currentGroup.id) {
      return {
        ...compareSuggestion,
        hint: `当前筛选结果将补入当前方案：${compareSuggestion.groupName}`,
        actionLabel: "写入当前方案"
      };
    }
    return {
      ...compareSuggestion,
      hint: `当前筛选结果将补入对比方案：${compareSuggestion.groupName}`,
      actionLabel: "写入推荐方案"
    };
  }

  if (compareSuggestion.mode === "create-first") {
    return {
      ...compareSuggestion,
      hint: "当前筛选结果将新建首个同考试对比方案",
      actionLabel: "新建对比方案"
    };
  }

  if (compareSuggestion.mode === "create-new") {
    return {
      ...compareSuggestion,
      hint: `现有 ${compareSuggestion.compatibleGroupCount} 个同考试方案已放满，当前筛选结果将新建方案`,
      actionLabel: "新建对比方案"
    };
  }

  if (compareSuggestion.mode === "review-needed") {
    return {
      ...compareSuggestion,
      hint: compareSuggestion.hint,
      actionLabel: "先去整理对比方案"
    };
  }

  return {
    ...compareSuggestion,
    actionLabel: compareSuggestion.actionLabel || "一键对比当前筛选结果"
  };
}

function buildReplacementReasons(currentPosition, incomingPosition) {
  const reasons = [];
  const currentMismatchCount = Number(currentPosition.mismatchCount || 0);
  const incomingMismatchCount = Number(incomingPosition.mismatchCount || 0);
  const currentHeadcount = normalizeHeadcountValue(currentPosition.headcount);
  const incomingHeadcount = normalizeHeadcountValue(incomingPosition.headcount);
  const currentTrust = currentPosition.noticeTrust ? currentPosition.noticeTrust.parseQualityStatus : "";
  const incomingTrust = incomingPosition.noticeTrust ? incomingPosition.noticeTrust.parseQualityStatus : "";

  if (incomingPosition.isFullyMatched && !currentPosition.isFullyMatched) {
    reasons.push("替换后可报岗位数更高");
  } else if (incomingMismatchCount < currentMismatchCount) {
    reasons.push("替换后待确认项更少");
  } else if (incomingMismatchCount > currentMismatchCount) {
    reasons.push("替换后待确认项会增加");
  }

  if (incomingHeadcount > currentHeadcount) {
    reasons.push("新岗位招录人数更多");
  } else if (incomingHeadcount < currentHeadcount) {
    reasons.push("当前岗位招录人数更多");
  }

  if (isOpenRequirement(incomingPosition.serviceRequirement) && !isOpenRequirement(currentPosition.serviceRequirement)) {
    reasons.push("新岗位基层经历限制更少");
  } else if (!isOpenRequirement(incomingPosition.serviceRequirement) && isOpenRequirement(currentPosition.serviceRequirement)) {
    reasons.push("当前岗位基层经历限制更少");
  }

  if (!incomingPosition.freshGraduateOnly && currentPosition.freshGraduateOnly) {
    reasons.push("新岗位应届限制更少");
  } else if (incomingPosition.freshGraduateOnly && !currentPosition.freshGraduateOnly) {
    reasons.push("当前岗位应届限制更少");
  }

  if (incomingTrust === "healthy" && currentTrust && currentTrust !== "healthy") {
    reasons.push("新岗位结构化可信度更高");
  }

  return reasons.slice(0, 3);
}

function buildReplacementSuggestions(currentPositions = [], incomingPosition = {}) {
  const currentMatchedCount = currentPositions.filter((item) => item.isFullyMatched).length;

  return currentPositions
    .map((currentPosition) => {
      const remaining = currentPositions.filter((item) => item.id !== currentPosition.id);
      const nextPositions = remaining.concat([incomingPosition]);
      const nextMatchedCount = nextPositions.filter((item) => item.isFullyMatched).length;
      const currentMismatchCount = Number(currentPosition.mismatchCount || 0);
      const incomingMismatchCount = Number(incomingPosition.mismatchCount || 0);
      const matchedDelta = nextMatchedCount - currentMatchedCount;
      const mismatchDelta = currentMismatchCount - incomingMismatchCount;
      const headcountDelta = normalizeHeadcountValue(incomingPosition.headcount) - normalizeHeadcountValue(currentPosition.headcount);
      const reasons = buildReplacementReasons(currentPosition, incomingPosition);

      return {
        removePositionId: currentPosition.id,
        removeTitle: currentPosition.title,
        removeAgency: currentPosition.agency,
        currentEligibilityLabel: currentPosition.eligibilityLabel || "",
        incomingEligibilityLabel: incomingPosition.eligibilityLabel || "",
        matchedDelta,
        mismatchDelta,
        score: matchedDelta * 100 + mismatchDelta * 20 + headcountDelta * 2,
        reasons,
        summary: reasons[0] || "替换后方案变化不大"
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return String(left.removeTitle || "").localeCompare(String(right.removeTitle || ""));
    });
}

function buildEmptyReplacementSuggestion() {
  return {
    active: false,
    targetGroupId: "",
    targetGroupName: "",
    incomingPositionId: "",
    incomingPositionTitle: "",
    incomingPositionAgency: "",
    incomingEligibilityLabel: "",
    suggestions: [],
    canCreateNewGroup: true,
    createNewGroupActionLabel: "新建方案容纳该岗位",
    createNewGroupHint: "",
    createNewGroupCompareSuggestion: buildEmptyPositionCompareSuggestion()
  };
}

function buildCompareContext(notice = {}, options = {}) {
  return {
    sourceType: options.sourceType || "positions",
    sourceLabel: options.sourceLabel || "岗位列表",
    sourceEntry: "positions",
    sourceName: options.sourceName || `${notice.area || "当前"}岗位`,
    noticeId: notice.id || "",
    noticeTitle: notice.title || ""
  };
}

function sortPositions(positions, sortMode = "manual") {
  const list = Array.isArray(positions) ? positions.slice() : [];
  if (sortMode === "eligibility") {
    return list.sort((left, right) => {
      if (Boolean(left.isFullyMatched) !== Boolean(right.isFullyMatched)) {
        return left.isFullyMatched ? -1 : 1;
      }
      const mismatchGap = Number(left.mismatchCount || 0) - Number(right.mismatchCount || 0);
      if (mismatchGap !== 0) {
        return mismatchGap;
      }
      if (Boolean(left.isNewSubscriptionHit) !== Boolean(right.isNewSubscriptionHit)) {
        return left.isNewSubscriptionHit ? -1 : 1;
      }
      return Number(right.headcount || 0) - Number(left.headcount || 0);
    });
  }
  if (sortMode === "compare") {
    return list.sort((left, right) => {
      if (Boolean(left.inCompare) !== Boolean(right.inCompare)) {
        return left.inCompare ? -1 : 1;
      }
      if (Boolean(left.isNewSubscriptionHit) !== Boolean(right.isNewSubscriptionHit)) {
        return left.isNewSubscriptionHit ? -1 : 1;
      }
      const mismatchGap = Number(left.mismatchCount || 0) - Number(right.mismatchCount || 0);
      if (mismatchGap !== 0) {
        return mismatchGap;
      }
      return Number(right.headcount || 0) - Number(left.headcount || 0);
    });
  }
  return list;
}

Page({
  data: {
    notice: null,
    noticeTrust: null,
    positions: [],
    allPositions: [],
    recommendedPositions: [],
    recommendationBaseId: "",
    compareGroups: [],
    currentGroupId: "",
    currentGroupName: "",
    subscriptionId: "",
    canViewPositions: false,
    keyword: "",
    selectedArea: "",
    selectedEducation: "",
    selectedServiceRequirement: "",
    selectedPoliticalStatus: "",
    freshGraduateMode: "",
    sortMode: "manual",
    onlyMatchedMode: false,
    onlyNewSubscriptionHits: false,
    newSubscriptionHitCount: 0,
    areaOptions: [],
    educationOptions: [],
    serviceOptions: [],
    politicalOptions: [],
    referenceFilterInfo: null,
    personalProfile: { ...DEFAULT_PERSONAL_PROFILE },
    personalProfileSummary: "",
    eligibilitySummary: {
      active: false,
      profileSummary: "",
      matchedCount: 0,
      blockedCount: 0
    },
    screeningSummary: buildEmptyScreeningSummary(),
    recommendationContext: buildEmptyRecommendationContext(),
    replacementSuggestion: buildEmptyReplacementSuggestion(),
    currentResultsCompareSuggestion: buildEmptyBatchCompareSuggestion(),
    resultCount: 0,
    currentGroupSize: 0,
    lastCompareStatus: "",
    lastCompareTargetGroupId: "",
    lastCompareTargetGroupName: "",
    trustAction: buildTrustAction(),
    mergedSourceSummary: "",
    mergedSourceEntries: []
  },

  onLoad(query) {
    this.noticeId = query.noticeId;
    this.savedFilterId = query.savedFilterId || "";
    this.subscriptionId = query.subscriptionId || "";
    this.subscriptionNewPositionIds = parseIdListQuery(query.newPositionIds);
    this.subscriptionNewPositionIdSet = new Set(this.subscriptionNewPositionIds);
    this.referenceFilterApplied = false;

    this.setData({
      subscriptionId: this.subscriptionId
    });

    if (this.subscriptionNewPositionIds.length) {
      this.setData({
        onlyNewSubscriptionHits: true,
        newSubscriptionHitCount: this.subscriptionNewPositionIds.length
      });
    }
  },

  onShow() {
    const referencePromise = !this.referenceFilterApplied && this.savedFilterId
      ? api.getSavedFilter(this.savedFilterId)
      : !this.referenceFilterApplied && this.subscriptionId
        ? api.getSubscription(this.subscriptionId)
        : Promise.resolve(null);

    Promise.all([
      api.listCompareGroups(),
      api.listPositionsByNotice(this.noticeId),
      referencePromise,
      api.getPersonalProfile()
    ]).then(([groups, payload, referenceFilter, profilePayload]) => {
      const referenceFilterInfo = referenceFilter
        ? buildReferenceFilterInfo(referenceFilter, {
          isSubscription: Boolean(this.subscriptionId) && !this.savedFilterId
        })
        : (this.savedFilterId || this.subscriptionId ? this.data.referenceFilterInfo : null);

      if ((!this.subscriptionNewPositionIds || !this.subscriptionNewPositionIds.length) && referenceFilter) {
        this.subscriptionNewPositionIds = Array.isArray(referenceFilter.newPositionIds)
          ? referenceFilter.newPositionIds.slice()
          : [];
        this.subscriptionNewPositionIdSet = new Set(this.subscriptionNewPositionIds);
      }

      const shouldEnableOnlyNewSubscriptionHits = Boolean(
        this.data.onlyNewSubscriptionHits ||
        (
          referenceFilter &&
          Array.isArray(referenceFilter.newPositionIds) &&
          referenceFilter.newPositionIds.length
        )
      );

      const personalProfile = normalizePersonalProfile(
        (profilePayload && profilePayload.profile) || DEFAULT_PERSONAL_PROFILE
      );
      this.allCompareGroups = Array.isArray(groups) ? groups.slice() : [];
      const viewPreferences = normalizeListViewPreferences(referenceFilter && referenceFilter.viewPreferences);
      const compatibleGroups = filterCompatibleCompareGroups(groups, payload.notice && payload.notice.examType);
      const currentGroupId = resolveCurrentGroupId(compatibleGroups, this.data.currentGroupId);
      const currentGroup = compatibleGroups.find((group) => group.id === currentGroupId) || null;
      const currentGroupName = currentGroup ? (currentGroup.name || "") : "";

      if (!payload.canViewPositions) {
        this.setData({
          notice: payload.notice,
          noticeTrust: payload.noticeTrust || null,
          positions: [],
          allPositions: [],
          compareGroups: compatibleGroups,
          currentGroupId,
          currentGroupName,
          canViewPositions: false,
          areaOptions: [],
          educationOptions: [],
          serviceOptions: [],
          politicalOptions: [],
          referenceFilterInfo,
          onlyNewSubscriptionHits: shouldEnableOnlyNewSubscriptionHits,
          newSubscriptionHitCount: this.subscriptionNewPositionIds.length,
          sortMode: viewPreferences.sortMode,
          personalProfile,
          personalProfileSummary: buildPersonalProfileSummary(personalProfile),
          eligibilitySummary: buildEligibilitySummary([], personalProfile),
          screeningSummary: buildEmptyScreeningSummary(),
          replacementSuggestion: buildEmptyReplacementSuggestion(),
          currentResultsCompareSuggestion: buildEmptyBatchCompareSuggestion(),
          resultCount: 0,
          currentGroupSize: 0,
          recommendedPositions: [],
          recommendationBaseId: "",
          recommendationContext: buildEmptyRecommendationContext(),
          trustAction: buildTrustAction(payload.noticeTrust || null),
          mergedSourceSummary: buildMergedSourceSummary(payload.notice || {}),
          mergedSourceEntries: buildMergedSourceEntries(payload.notice || {})
        });
        return;
      }

      const allPositions = mapPositionsWithCompareStatus(payload.positions, currentGroup)
        .map((item) => ({
          ...enrichPositionWithEligibility(item, personalProfile),
          isNewSubscriptionHit: this.subscriptionNewPositionIdSet.has(item.id)
        }))
        .map((item) => decoratePositionWithCompareSuggestion(item, this.allCompareGroups, currentGroup));

      this.setData({
        notice: payload.notice,
        noticeTrust: payload.noticeTrust || null,
        allPositions,
        compareGroups: compatibleGroups,
        currentGroupId,
        currentGroupName,
        canViewPositions: true,
        areaOptions: buildFilterOptions(allPositions, "area"),
        educationOptions: buildFilterOptions(allPositions, "education"),
        serviceOptions: buildFilterOptions(allPositions, "serviceRequirement"),
        politicalOptions: buildFilterOptions(allPositions, "politicalStatus"),
        referenceFilterInfo,
        onlyNewSubscriptionHits: shouldEnableOnlyNewSubscriptionHits,
        newSubscriptionHitCount: this.subscriptionNewPositionIds.length,
        sortMode: viewPreferences.sortMode,
        personalProfile,
        personalProfileSummary: buildPersonalProfileSummary(personalProfile),
        trustAction: buildTrustAction(payload.noticeTrust || null),
        mergedSourceSummary: buildMergedSourceSummary(payload.notice || {}),
        mergedSourceEntries: buildMergedSourceEntries(payload.notice || {})
      });

      if (referenceFilter && referenceFilter.filters) {
        this.setData({
          keyword: referenceFilter.filters.keyword || "",
          selectedArea: referenceFilter.filters.selectedArea || "",
          selectedEducation: referenceFilter.filters.selectedEducation || "",
          selectedServiceRequirement: referenceFilter.filters.selectedServiceRequirement || "",
          selectedPoliticalStatus: referenceFilter.filters.selectedPoliticalStatus || "",
          freshGraduateMode: referenceFilter.filters.freshGraduateMode || ""
        });
        this.referenceFilterApplied = true;
      }

      this.applyFilters();
    });
  },

  getCurrentGroup() {
    return this.data.compareGroups.find((group) => group.id === this.data.currentGroupId) || null;
  },

  resetReplacementSuggestion() {
    this.setData({
      replacementSuggestion: buildEmptyReplacementSuggestion()
    });
  },

  applyFilters() {
    const {
      allPositions,
      keyword,
      selectedArea,
      selectedEducation,
      selectedServiceRequirement,
      selectedPoliticalStatus,
      freshGraduateMode,
      sortMode,
      onlyMatchedMode,
      onlyNewSubscriptionHits,
      personalProfile
    } = this.data;

    const currentGroup = this.getCurrentGroup();
    const compareGroupsForSuggestion = Array.isArray(this.allCompareGroups) && this.allCompareGroups.length
      ? this.allCompareGroups
      : this.data.compareGroups;

    const positions = sortPositions(
      mapPositionsWithCompareStatus(
        (allPositions || [])
          .filter((item) => !selectedArea || item.area === selectedArea)
          .filter((item) => !selectedEducation || item.education === selectedEducation)
          .filter((item) => !selectedServiceRequirement || item.serviceRequirement === selectedServiceRequirement)
          .filter((item) => !selectedPoliticalStatus || item.politicalStatus === selectedPoliticalStatus)
          .filter((item) => {
            if (!freshGraduateMode) {
              return true;
            }
            return freshGraduateMode === "only" ? item.freshGraduateOnly : !item.freshGraduateOnly;
          })
          .filter((item) => (
            !onlyNewSubscriptionHits ||
            !this.subscriptionNewPositionIdSet ||
            this.subscriptionNewPositionIdSet.size === 0 ||
            this.subscriptionNewPositionIdSet.has(item.id)
          ))
          .filter((item) => !onlyMatchedMode || item.isFullyMatched)
          .filter((item) => matchKeyword(item, keyword)),
        currentGroup
      )
        .map((item) => enrichPositionWithEligibility(item, personalProfile))
        .map((item) => decoratePositionWithCompareSuggestion(item, compareGroupsForSuggestion, currentGroup)),
      sortMode
    );

    const recommendationBaseId = this.data.recommendationBaseId || (positions[0] && positions[0].id) || "";
    const currentResultsCompareSuggestion = buildBatchCompareSuggestion(
      positions,
      compareGroupsForSuggestion,
      currentGroup,
      this.data.notice && this.data.notice.examType
    );
    const eligibilitySummary = buildEligibilitySummary(positions, personalProfile);
    this.setData({
      positions,
      resultCount: positions.length,
      currentGroupSize: currentGroup ? (currentGroup.positionIds || []).length : 0,
      recommendationBaseId,
      eligibilitySummary,
      screeningSummary: buildScreeningSummary(positions, {
        eligibilitySummary,
        currentResultsCompareSuggestion,
        referenceFilterInfo: this.data.referenceFilterInfo,
        onlyMatchedMode,
        onlyNewSubscriptionHits
      }),
      currentResultsCompareSuggestion
    });
    this.loadRecommendations(recommendationBaseId);
  },

  loadRecommendations(positionId) {
    if (!positionId) {
      this.setData({
        recommendationBaseId: "",
        recommendedPositions: [],
        recommendationContext: buildEmptyRecommendationContext()
      });
      return;
    }

    const basePosition = this.data.allPositions.find((item) => item.id === positionId) || null;
    const currentGroup = this.getCurrentGroup();
    const compareGroupsForSuggestion = Array.isArray(this.allCompareGroups) && this.allCompareGroups.length
      ? this.allCompareGroups
      : this.data.compareGroups;
    const recommendationContext = basePosition
      ? {
        active: true,
        basePositionId: basePosition.id,
        baseTitle: basePosition.title || "",
        baseAgency: basePosition.agency || "",
        baseEligibilityLabel: basePosition.eligibilityLabel || ""
      }
      : buildEmptyRecommendationContext();

    api.getRecommendedPositions(positionId, 5).then((recommendedPositions) => {
      const decoratedRecommendations = (recommendedPositions || [])
        .map((item) => enrichPositionWithEligibility(item, this.data.personalProfile))
        .map((item) => decorateRecommendedPosition(basePosition, item))
        .map((item) => decoratePositionWithCompareSuggestion(item, compareGroupsForSuggestion, currentGroup));
      this.setData({
        recommendationBaseId: positionId,
        recommendationContext,
        recommendedPositions: decoratedRecommendations
      });
    });
  },

  changeGroup(event) {
    const { id } = event.currentTarget.dataset;
    const selectedGroup = findGroupById(this.data.compareGroups, id);
    this.setData({
      currentGroupId: id,
      currentGroupName: selectedGroup ? (selectedGroup.name || "") : ""
    });
    this.resetReplacementSuggestion();
    this.applyFilters();
  },

  onKeywordInput(event) {
    this.setData({ keyword: String(event.detail.value || "").trim() });
    this.applyFilters();
  },

  toggleArea(event) {
    const { value } = event.currentTarget.dataset;
    this.setData({
      selectedArea: this.data.selectedArea === value ? "" : value
    });
    this.applyFilters();
  },

  toggleEducation(event) {
    const { value } = event.currentTarget.dataset;
    this.setData({
      selectedEducation: this.data.selectedEducation === value ? "" : value
    });
    this.applyFilters();
  },

  toggleService(event) {
    const { value } = event.currentTarget.dataset;
    this.setData({
      selectedServiceRequirement: this.data.selectedServiceRequirement === value ? "" : value
    });
    this.applyFilters();
  },

  togglePolitical(event) {
    const { value } = event.currentTarget.dataset;
    this.setData({
      selectedPoliticalStatus: this.data.selectedPoliticalStatus === value ? "" : value
    });
    this.applyFilters();
  },

  toggleFreshGraduate(event) {
    const { value } = event.currentTarget.dataset;
    this.setData({
      freshGraduateMode: this.data.freshGraduateMode === value ? "" : value
    });
    this.applyFilters();
  },

  toggleOnlyMatched() {
    this.setData({
      onlyMatchedMode: !this.data.onlyMatchedMode
    });
    this.applyFilters();
  },

  changeSortMode(event) {
    const { mode } = event.currentTarget.dataset;
    const nextMode = ["manual", "eligibility", "compare"].includes(mode) ? mode : "manual";
    this.setData({
      sortMode: nextMode
    });
    this.applyFilters();
    this.persistReferenceViewPreferences(nextMode);
  },

  persistReferenceViewPreferences(sortMode) {
    const viewPreferences = { sortMode };
    if (this.savedFilterId) {
      api.saveSavedFilterViewPreferences(this.savedFilterId, viewPreferences).catch((error) => {
        wx.showToast({ title: error.message, icon: "none" });
      });
      return;
    }
    if (this.subscriptionId) {
      api.saveSubscriptionViewPreferences(this.subscriptionId, viewPreferences).catch((error) => {
        wx.showToast({ title: error.message, icon: "none" });
      });
    }
  },

  toggleOnlyNewSubscriptionHits() {
    if (!this.subscriptionNewPositionIdSet || this.subscriptionNewPositionIdSet.size === 0) {
      return;
    }
    this.setData({
      onlyNewSubscriptionHits: !this.data.onlyNewSubscriptionHits
    });
    this.applyFilters();
  },

  resetFilters() {
    this.setData({
      keyword: "",
      selectedArea: "",
      selectedEducation: "",
      selectedServiceRequirement: "",
      selectedPoliticalStatus: "",
      freshGraduateMode: "",
      onlyMatchedMode: false,
      onlyNewSubscriptionHits: Boolean(this.subscriptionNewPositionIdSet && this.subscriptionNewPositionIdSet.size)
    });
    this.resetReplacementSuggestion();
    this.applyFilters();
  },

  showReplacementSuggestions(incomingPositionId) {
    const currentGroup = this.getCurrentGroup();
    const incomingPosition = this.data.allPositions.find((item) => item.id === incomingPositionId) || null;

    if (!currentGroup || !incomingPosition) {
      return Promise.resolve(false);
    }

    return api.getCompareGroupDetail(currentGroup.id).then((payload) => {
      const currentPositions = (payload && payload.positions ? payload.positions : [])
        .map((item) => enrichPositionWithEligibility(item, this.data.personalProfile));
      const suggestions = buildReplacementSuggestions(currentPositions, incomingPosition);
      const compareGroupsForSuggestion = Array.isArray(this.allCompareGroups) && this.allCompareGroups.length
        ? this.allCompareGroups
        : this.data.compareGroups;
      const createNewGroupCompareSuggestion = describeComparePlan(
        compareGroupsForSuggestion,
        incomingPosition.examType,
        [incomingPosition.id],
        {
          preferredGroupId: ""
        }
      );
      const canCreateNewGroup = createNewGroupCompareSuggestion.mode !== "review-needed";

      this.setData({
        replacementSuggestion: {
          active: true,
          targetGroupId: currentGroup.id,
          targetGroupName: currentGroup.name || "",
          incomingPositionId: incomingPosition.id,
          incomingPositionTitle: incomingPosition.title || "",
          incomingPositionAgency: incomingPosition.agency || "",
          incomingEligibilityLabel: incomingPosition.eligibilityLabel || "",
          suggestions,
          canCreateNewGroup,
          createNewGroupActionLabel: canCreateNewGroup ? "新建方案容纳该岗位" : "先去整理对比方案",
          createNewGroupHint: canCreateNewGroup ? "" : createNewGroupCompareSuggestion.hint,
          createNewGroupCompareSuggestion
        }
      });
      return true;
    }).catch((error) => {
      wx.showToast({ title: error.message, icon: "none" });
      return false;
    });
  },

  cancelReplacementSuggestion() {
    this.resetReplacementSuggestion();
  },

  createNewCompareGroupForIncomingPosition() {
    const replacementSuggestion = this.data.replacementSuggestion || {};
    if (!replacementSuggestion.incomingPositionId) {
      return;
    }

    if (replacementSuggestion.canCreateNewGroup === false) {
      wx.navigateTo({
        url: buildComparePageUrl(replacementSuggestion.createNewGroupCompareSuggestion)
      });
      return;
    }

    const notice = this.data.notice || {};
    const compareRecord = {
      name: `${(notice && notice.area) || "岗位"}岗位`,
      examType: notice.examType,
      currentPositionIds: [replacementSuggestion.incomingPositionId]
    };

    executeQuickCompare(api, compareRecord, {
      preferredGroupId: "",
      compareContext: buildCompareContext(notice, {
        sourceName: compareRecord.name
      })
    }).then((result) => {
      if (!result || result.status === "empty" || !result.group) {
        wx.showToast({ title: "当前没有可对比岗位", icon: "none" });
        return;
      }

      this.resetReplacementSuggestion();
      this.setData({
        currentGroupId: result.group.id,
        currentGroupName: result.group.name || "",
        ...buildCompareResultPatch(result)
      });
      this.onShow();
      wx.showToast({
        title: "已新建方案容纳该岗位",
        icon: "success"
      });
    }).catch((error) => {
      wx.showToast({ title: error.message, icon: "none" });
    });
  },

  applyReplacementSuggestion(event) {
    const { removeId } = event.currentTarget.dataset;
    const replacementSuggestion = this.data.replacementSuggestion || {};
    const targetGroupId = replacementSuggestion.targetGroupId;
    const incomingPositionId = replacementSuggestion.incomingPositionId;
    const targetGroupName = replacementSuggestion.targetGroupName;

    if (!targetGroupId || !incomingPositionId || !removeId) {
      return;
    }

    const notice = this.data.notice || {};
    const replaceContext = {
      ...buildCompareContext(notice, {
        sourceLabel: "岗位替换",
        sourceName: targetGroupName || `${(notice && notice.area) || "岗位"}岗位`
      }),
      action: "replace",
      positionIds: [incomingPositionId],
      addedCount: 1
    };

    api.removePositionFromGroup(targetGroupId, removeId)
      .then(() => api.addPositionToGroup(targetGroupId, incomingPositionId, replaceContext))
      .then((group) => {
        this.resetReplacementSuggestion();
        this.setData({
          currentGroupId: targetGroupId,
          currentGroupName: (group && group.name) || targetGroupName || "",
          ...buildCompareResultPatch({
            status: "replaced",
            group: {
              id: targetGroupId,
              name: (group && group.name) || targetGroupName || ""
            }
          })
        });
        this.onShow();
        wx.showToast({
          title: "已替换进当前方案",
          icon: "success"
        });
      })
      .catch((error) => {
        wx.showToast({ title: error.message, icon: "none" });
      });
  },

  saveCurrentFilter() {
    const { notice, resultCount } = this.data;
    api.saveFilterScheme({
      name: buildSavedFilterName(notice, resultCount),
      noticeId: notice.id,
      noticeTitle: notice.title,
      examType: notice.examType,
      filters: buildFilterState(this),
      viewPreferences: {
        sortMode: this.data.sortMode
      },
      resultCount
    }).then(() => {
      wx.showToast({ title: "已保存筛选方案", icon: "success" });
    });
  },

  subscribeCurrentFilter() {
    const { notice, resultCount } = this.data;
    api.createSubscription({
      name: buildSubscriptionName(notice),
      noticeId: notice.id,
      noticeTitle: notice.title,
      examType: notice.examType,
      filters: buildFilterState(this),
      viewPreferences: {
        sortMode: this.data.sortMode
      },
      resultCount
    }).then(() => {
      wx.showToast({ title: "已加入订阅", icon: "success" });
    });
  },

  ensureCurrentGroup() {
    const currentGroup = this.getCurrentGroup();
    const { notice } = this.data;

    if (currentGroup) {
      return Promise.resolve(currentGroup);
    }

    return api.createCompareGroup(buildGroupName(notice), notice.examType, {
      originContext: buildCompareContext(notice, {
        sourceType: "positions",
        sourceLabel: "岗位列表",
        sourceName: buildGroupName(notice)
      }),
      lastActionContext: buildCompareContext(notice, {
        sourceType: "positions",
        sourceLabel: "岗位列表",
        sourceName: buildGroupName(notice)
      })
    }).then((group) =>
      api.listCompareGroups().then((groups) => {
        const compatibleGroups = filterCompatibleCompareGroups(groups, notice.examType);
        this.setData({
          compareGroups: compatibleGroups,
          currentGroupId: resolveCurrentGroupId(compatibleGroups, group.id),
          currentGroupName: group.name || ""
        });
        return compatibleGroups.find((item) => item.id === group.id) || group;
      })
    );
  },

  getPositionById(positionId) {
    if (!positionId) {
      return null;
    }

    return this.data.positions.find((item) => item.id === positionId) ||
      this.data.recommendedPositions.find((item) => item.id === positionId) ||
      this.data.allPositions.find((item) => item.id === positionId) ||
      null;
  },

  addToCompare(event) {
    const { id } = event.currentTarget.dataset;
    const notice = this.data.notice || {};
    const currentGroup = this.getCurrentGroup();
    const position = this.getPositionById(id);
    const compareGroupsForSuggestion = Array.isArray(this.allCompareGroups) && this.allCompareGroups.length
      ? this.allCompareGroups
      : this.data.compareGroups;
    const compareSuggestion = buildPositionCompareSuggestion(position, compareGroupsForSuggestion, currentGroup);

    if (compareSuggestion.mode === "empty") {
      wx.showToast({ title: "当前没有可对比岗位", icon: "none" });
      return;
    }

    if (compareSuggestion.mode === "review-needed") {
      wx.navigateTo({ url: buildComparePageUrl(compareSuggestion) });
      return;
    }

    if (compareSuggestion.mode === "replacement-needed") {
      this.showReplacementSuggestions(id);
      return;
    }

    const compareRecord = {
      name: `${(notice && notice.area) || "岗位"}岗位`,
      examType: notice.examType,
      currentPositionIds: [id]
    };

    executeQuickCompare(api, compareRecord, {
      preferredGroupId: this.data.currentGroupId || "",
      compareContext: buildCompareContext(notice, {
        sourceName: compareRecord.name
      })
    }).then((result) => {
      if (!result || result.status === "empty" || !result.group) {
        wx.showToast({ title: "当前没有可对比岗位", icon: "none" });
        return;
      }

      this.resetReplacementSuggestion();
      this.setData({
        currentGroupId: result.group.id,
        currentGroupName: result.group.name || "",
        ...buildCompareResultPatch(result)
      });
      this.onShow();
      wx.showToast({
        title: buildQuickCompareToastTitle(result),
        icon: "success"
      });
      if (result.status === "existing") {
        wx.navigateTo({ url: `/pages/compare/index?groupId=${result.group.id}` });
      }
    })
      .catch((error) => {
        wx.showToast({ title: error.message, icon: "none" });
      });
  },

  compareCurrentResults() {
    const compareGroupsForSuggestion = Array.isArray(this.allCompareGroups) && this.allCompareGroups.length
      ? this.allCompareGroups
      : this.data.compareGroups;
    const currentGroup = this.getCurrentGroup();
    const batchCompareSuggestion = buildBatchCompareSuggestion(
      this.data.positions,
      compareGroupsForSuggestion,
      currentGroup,
      this.data.notice && this.data.notice.examType
    );

    if (batchCompareSuggestion.mode === "empty" || !this.data.positions.length) {
      wx.showToast({ title: "当前筛选下没有可对比岗位", icon: "none" });
      return;
    }

    if (batchCompareSuggestion.mode === "review-needed") {
      wx.navigateTo({ url: buildComparePageUrl(batchCompareSuggestion) });
      return;
    }

    const { notice, positions } = this.data;
    const compareRecord = {
      name: `${(notice && notice.area) || "岗位"}岗位`,
      examType: notice.examType,
      currentPositionIds: positions.map((item) => item.id).slice(0, COMPARE_LIMIT)
    };

    executeQuickCompare(api, compareRecord, {
      preferredGroupId: this.data.currentGroupId || "",
      compareContext: buildCompareContext(notice, {
        sourceName: compareRecord.name
      })
    }).then((result) => {
      if (!result) {
        return;
      }
      if (result.status === "empty" || !result.group) {
        wx.showToast({ title: "当前没有可对比岗位", icon: "none" });
        return;
      }

      this.resetReplacementSuggestion();
      this.setData({
        currentGroupId: result.group.id,
        currentGroupName: result.group.name || "",
        ...buildCompareResultPatch(result)
      });
      this.onShow();
      wx.showToast({
        title: buildQuickCompareToastTitle(result),
        icon: "success"
      });
      wx.navigateTo({ url: `/pages/compare/index?groupId=${result.group.id}` });
    }).catch((error) => {
      wx.showToast({ title: error.message, icon: "none" });
    });
  },

  removeFromCompare(event) {
    const { id } = event.currentTarget.dataset;
    api.removePositionFromGroup(this.data.currentGroupId, id).then(() => {
      this.onShow();
    });
  },

  refreshRecommendations(event) {
    const { id } = event.currentTarget.dataset;
    this.loadRecommendations(id);
  },

  openCompare() {
    const { currentGroupId } = this.data;
    if (!currentGroupId) {
      wx.showToast({ title: "请先加入至少一个岗位", icon: "none" });
      return;
    }
    wx.navigateTo({ url: `/pages/compare/index?groupId=${currentGroupId}` });
  },

  createGroup() {
    const { notice } = this.data;
    if (!this.data.canViewPositions) {
      wx.showToast({ title: "当前公告暂无可对比岗位", icon: "none" });
      return;
    }
    api.createCompareGroup(buildGroupName(notice), notice.examType, {
      originContext: buildCompareContext(notice, {
        sourceType: "positions",
        sourceLabel: "手动建组",
        sourceName: buildGroupName(notice)
      }),
      lastActionContext: buildCompareContext(notice, {
        sourceType: "positions",
        sourceLabel: "手动建组",
        sourceName: buildGroupName(notice)
      })
    })
      .then((group) => {
        this.setData({
          currentGroupId: group.id,
          currentGroupName: group.name || ""
        });
        this.onShow();
      })
      .catch((error) => {
        wx.showToast({ title: error.message, icon: "none" });
      });
  },

  openProfile() {
    wx.navigateTo({ url: "/pages/profile/index" });
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
  }
});
