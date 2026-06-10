const api = require("../../utils/api");
const {
  describeComparePlan,
  executeQuickCompare,
  buildQuickCompareToastTitle
} = require("../../utils/compare-group-actions");
const { explainMajorMatch } = require("../../utils/major-matcher");
const { buildPositionNextAction } = require("../../utils/position-action-guidance");
const recommendationExplainer = require("../../utils/recommendation-explainer");
const { buildTrustAction } = require("../../utils/trust-action");

const ROW_LABELS = [
  ["单位", "agency"],
  ["岗位名称", "title"],
  ["职位代码", "positionCode"],
  ["职位类型", "positionType"],
  ["招录人数", "headcount"],
  ["地区", "area"],
  ["学历", "education"],
  ["学位", "degree"],
  ["专业", "major"],
  ["基层经历", "serviceRequirement"],
  ["应届限制", "freshGraduateOnlyLabel"],
  ["政治面貌", "politicalStatus"],
  ["其他要求", "notes"],
  ["数据可信度", "trustLabel"]
];

const DEFAULT_PERSONAL_PROFILE = {
  education: "",
  degree: "",
  majorKeywords: "",
  politicalStatus: "",
  serviceExperience: "",
  freshGraduateStatus: ""
};

const BARRIER_ROW_KEYS = new Set([
  "education",
  "degree",
  "major",
  "serviceRequirement",
  "freshGraduateOnlyLabel",
  "politicalStatus",
  "notes",
  "trustLabel"
]);

function normalizeValue(value) {
  if (value === undefined || value === null || value === "") {
    return "未注明";
  }
  return String(value);
}

function normalizeHeadcount(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
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
  return parts.join(" · ");
}

function includesKeyword(text, keyword) {
  return String(text || "").toLowerCase().includes(String(keyword || "").toLowerCase());
}

function evaluateEligibility(position, profile = {}) {
  const normalizedProfile = normalizePersonalProfile(profile);
  const active = hasPersonalProfile(normalizedProfile);

  if (!active) {
    return {
      eligibilityActive: false,
      mismatchCount: 0,
      mismatchKeys: [],
      mismatchReasons: [],
      majorMatchReasons: [],
      majorMatchSummary: "",
      isFullyMatched: true,
      eligibilityLabel: "未启用"
    };
  }

  const mismatches = [];
  const addMismatch = (key, reason) => {
    mismatches.push({ key, reason });
  };

  const education = normalizeValue(position.education);
  if (normalizedProfile.education && !isOpenRequirement(education) && !includesKeyword(education, normalizedProfile.education)) {
    addMismatch("education", "学历要求不匹配");
  }

  const degree = normalizeValue(position.degree);
  if (normalizedProfile.degree && !isOpenRequirement(degree) && !includesKeyword(degree, normalizedProfile.degree)) {
    addMismatch("degree", "学位要求不匹配");
  }

  const major = normalizeValue(position.major);
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
  const hasMajorMismatch = normalizedProfile.majorKeywords &&
    hasMajorRequirement &&
    !majorMatchResult.matched;
  if (hasMajorMismatch) {
    addMismatch("major", "专业要求不匹配");
  }

  const politicalStatus = normalizeValue(position.politicalStatus);
  if (
    normalizedProfile.politicalStatus &&
    !isOpenRequirement(politicalStatus) &&
    !includesKeyword(politicalStatus, normalizedProfile.politicalStatus)
  ) {
    addMismatch("politicalStatus", "政治面貌要求不匹配");
  }

  if (normalizedProfile.serviceExperience === "none" && !isOpenRequirement(position.serviceRequirement)) {
    addMismatch("serviceRequirement", "缺少岗位要求的基层经历");
  }

  if (normalizedProfile.freshGraduateStatus === "non-fresh" && position.freshGraduateOnly) {
    addMismatch("freshGraduateOnlyLabel", "该岗位仅限应届报考");
  }

  return {
    eligibilityActive: true,
    mismatchCount: mismatches.length,
    mismatchKeys: mismatches.map((item) => item.key),
    mismatchReasons: mismatches.map((item) => item.reason),
    majorMatchReasons: majorMatchResult.reasons,
    majorMatchSummary: majorMatchResult.summary,
    isFullyMatched: mismatches.length === 0,
    eligibilityLabel: mismatches.length ? `${mismatches.length} 项不匹配` : "条件匹配"
  };
}

function collectFieldMeta(positions) {
  return ROW_LABELS.map(([label, key]) => {
    const values = positions.map((position) => normalizeValue(position[key]));
    const uniqueValues = Array.from(new Set(values));
    return {
      label,
      key,
      uniqueValues,
      isDifferent: uniqueValues.length > 1
    };
  });
}

function shouldIncludeRow(row, rowFocusMode) {
  if (rowFocusMode === "different") {
    return row.isDifferent;
  }
  if (rowFocusMode === "barrier") {
    return row.isBarrier || row.isMismatch;
  }
  return true;
}

function buildCompareColumns(positions, rowFocusMode = "all") {
  const fieldMetaMap = Object.fromEntries(
    collectFieldMeta(positions).map((item) => [item.key, item])
  );
  return positions.map((position) => {
    const sourceTrace = buildPositionSourceTrace(position);
    const trustAction = buildTrustAction(position.noticeTrust || null);
    return {
      id: position.id,
      title: position.title,
      agency: position.agency,
      noticeId: position.noticeId,
      noticeTitle: position.noticeTitle || "",
      noticeStageLabel: position.noticeStageLabel || "",
      noticePublishedAt: position.noticePublishedAt || "",
      noticeArea: position.noticeArea || "",
      area: position.area,
      noticeTrust: position.noticeTrust || null,
      ruleScore: position.ruleScore,
      ruleLabel: position.ruleLabel,
      ruleReasons: position.ruleReasons,
      opportunityReasons: position.opportunityReasons || [],
      cautionReasons: position.cautionReasons || [],
      barrierCount: position.barrierCount || 0,
      mismatchReasons: position.mismatchReasons || [],
      mismatchCount: position.mismatchCount || 0,
      majorMatchSummary: position.majorMatchSummary || "",
      eligibilityLabel: position.eligibilityLabel || "",
      hasManualCorrections: Boolean(position.hasManualCorrections),
      correctionSummary: position.correctionSummary || "",
      correctedFields: position.correctedFields || [],
      nextAction: position.nextAction || null,
      sourceTraceLabel: sourceTrace.roleLabel,
      sourceTraceName: sourceTrace.sourceName,
      sourceTraceSummary: sourceTrace.summary,
      sourceTraceDetail: sourceTrace.detail,
      sourceTraceAggregated: sourceTrace.isAggregated,
      trustAction,
      trustActionPrimaryLabel: trustAction.primaryLabel,
      trustActionPrimaryRoute: trustAction.primaryRoute,
      trustActionSecondaryLabel: trustAction.secondaryLabel,
      trustActionSecondaryRoute: trustAction.secondaryRoute,
      rows: ROW_LABELS.map(([label, key]) => ({
        key,
        label,
        value: normalizeValue(position[key]),
        isDifferent: Boolean(fieldMetaMap[key] && fieldMetaMap[key].isDifferent),
        isMismatch: Boolean(position.mismatchKeys && position.mismatchKeys.includes(key)),
        isBarrier: BARRIER_ROW_KEYS.has(key)
      })).filter((row) => shouldIncludeRow(row, rowFocusMode))
    };
  });
}

function sortComparePositions(positions, sortMode = "manual") {
  const list = Array.isArray(positions) ? positions.slice() : [];
  if (sortMode === "rule") {
    return list.sort((left, right) => {
      const scoreGap = Number(right.ruleScore || 0) - Number(left.ruleScore || 0);
      if (scoreGap !== 0) {
        return scoreGap;
      }
      const barrierGap = Number(left.barrierCount || 0) - Number(right.barrierCount || 0);
      if (barrierGap !== 0) {
        return barrierGap;
      }
      return Number(left.mismatchCount || 0) - Number(right.mismatchCount || 0);
    });
  }
  if (sortMode === "eligibility") {
    return list.sort((left, right) => {
      const mismatchGap = Number(left.mismatchCount || 0) - Number(right.mismatchCount || 0);
      if (mismatchGap !== 0) {
        return mismatchGap;
      }
      const scoreGap = Number(right.ruleScore || 0) - Number(left.ruleScore || 0);
      if (scoreGap !== 0) {
        return scoreGap;
      }
      return Number(left.barrierCount || 0) - Number(right.barrierCount || 0);
    });
  }
  return list;
}

function scorePosition(position) {
  let score = 50;
  const opportunityReasons = [];
  const cautionReasons = [];
  const headcount = normalizeHeadcount(position.headcount);
  const trustStatus = position.noticeTrust ? position.noticeTrust.parseQualityStatus : "";
  let barrierCount = 0;

  if (headcount >= 3) {
    score += 15;
    opportunityReasons.push("招录人数更高");
  } else if (headcount === 2) {
    score += 10;
    opportunityReasons.push("招录人数较充足");
  } else if (headcount === 1) {
    score += 4;
    opportunityReasons.push("至少有明确名额");
  }

  if (isOpenRequirement(position.serviceRequirement)) {
    score += 12;
    opportunityReasons.push("基层经历限制较少");
  } else {
    score -= 12;
    barrierCount += 1;
    cautionReasons.push("基层经历要求更严格");
  }

  if (position.freshGraduateOnly) {
    score -= 10;
    barrierCount += 1;
    cautionReasons.push("仅限应届");
  } else {
    score += 8;
    opportunityReasons.push("不限制应届身份");
  }

  if (isOpenRequirement(position.politicalStatus)) {
    score += 8;
    opportunityReasons.push("政治面貌限制较少");
  } else {
    score -= 8;
    barrierCount += 1;
    cautionReasons.push("政治面貌要求更严格");
  }

  const education = normalizeValue(position.education);
  if (education.includes("本科")) {
    score += 8;
    opportunityReasons.push("学历门槛相对友好");
  } else if (education.includes("研究生") || education.includes("硕士") || education.includes("博士")) {
    score -= 8;
    barrierCount += 1;
    cautionReasons.push("学历门槛更高");
  }

  const degree = normalizeValue(position.degree);
  if (degree.includes("学士") || degree === "不限" || degree === "未注明") {
    score += 5;
    opportunityReasons.push("学位要求较宽松");
  } else if (degree.includes("硕士") || degree.includes("博士")) {
    score -= 5;
    barrierCount += 1;
    cautionReasons.push("学位要求更高");
  }

  const notes = normalizeValue(position.notes);
  if (notes === "未注明" || notes === "不限") {
    score += 5;
    opportunityReasons.push("附加要求较少");
  } else {
    score -= 6;
    barrierCount += 1;
    cautionReasons.push("附加要求较多");
  }

  if (trustStatus === "healthy") {
    score += 8;
    opportunityReasons.push("结构化质量稳定");
  } else if (trustStatus === "warning") {
    score -= 4;
    cautionReasons.push("结构化结果需复核");
  } else if (trustStatus === "attachment-only") {
    score -= 12;
    cautionReasons.push("仅公告未结构化");
  }

  const finalScore = Math.max(0, Math.min(100, score));
  let ruleLabel = "条件较严";
  if (finalScore >= 70) {
    ruleLabel = "机会优先";
  } else if (finalScore >= 55) {
    ruleLabel = "可以重点看";
  }

  return {
    ruleScore: finalScore,
    ruleScoreLabel: `${finalScore} 分`,
    ruleLabel,
    ruleReasons: [...opportunityReasons, ...cautionReasons].slice(0, 6),
    opportunityReasons,
    cautionReasons,
    barrierCount
  };
}

function buildDifferenceSummary(positions) {
  const fields = collectFieldMeta(positions);
  const sharedFields = fields.filter((item) => !item.isDifferent).map((item) => item.label);
  const differentFields = fields
    .filter((item) => item.isDifferent)
    .map((item) => ({
      label: item.label,
      summary: item.uniqueValues.join(" · ")
    }));
  const totalHeadcount = positions.reduce(
    (sum, item) => sum + normalizeHeadcount(item.headcount),
    0
  );
  const freshGraduateCount = positions.filter((item) => item.freshGraduateOnly).length;
  const areaCount = new Set(positions.map((item) => item.area).filter(Boolean)).size;

  return {
    sharedFields,
    differentFields,
    stats: [
      { label: "对比岗位", value: positions.length },
      { label: "总招录", value: totalHeadcount || "-" },
      { label: "地区数", value: areaCount || "-" },
      { label: "限应届", value: freshGraduateCount }
    ]
  };
}

function buildDecisionSummary(positions, differenceSummary) {
  if (!positions.length) {
    return {
      topTitle: "",
      topAgency: "",
      topLabel: "",
      topScoreLabel: "",
      topReasons: [],
      topCautions: [],
      focusFields: [],
      cautionCount: 0,
      lowestBarrierTitle: "",
      lowestBarrierAgency: "",
      lowestBarrierReasons: [],
      strictestTitle: "",
      strictestAgency: "",
      strictestReasons: [],
      cautionItems: [],
      helperText: ""
    };
  }

  const ranked = positions.slice().sort((left, right) => right.ruleScore - left.ruleScore);
  const top = ranked[0];
  const lowestBarrier = positions.slice().sort((left, right) => {
    const barrierGap = Number(left.barrierCount || 0) - Number(right.barrierCount || 0);
    if (barrierGap !== 0) {
      return barrierGap;
    }
    return right.ruleScore - left.ruleScore;
  })[0];
  const strictest = positions.slice().sort((left, right) => {
    const barrierGap = Number(right.barrierCount || 0) - Number(left.barrierCount || 0);
    if (barrierGap !== 0) {
      return barrierGap;
    }
    return left.ruleScore - right.ruleScore;
  })[0];
  const cautionCount = ranked.filter((item) => item.ruleScore < 55).length;
  const cautionItems = positions
    .filter((item) => item.cautionReasons.length)
    .sort((left, right) => {
      const barrierGap = Number(right.barrierCount || 0) - Number(left.barrierCount || 0);
      if (barrierGap !== 0) {
        return barrierGap;
      }
      return left.ruleScore - right.ruleScore;
    })
    .slice(0, 2)
    .map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.cautionReasons.slice(0, 2).join("、")
    }));

  return {
    topTitle: top.title,
    topAgency: top.agency,
    topLabel: top.ruleLabel,
    topScoreLabel: top.ruleScoreLabel,
    topReasons: top.ruleReasons.slice(0, 3),
    topCautions: top.cautionReasons.slice(0, 2),
    focusFields: (differenceSummary.differentFields || []).slice(0, 3).map((item) => item.label),
    cautionCount,
    lowestBarrierTitle: lowestBarrier.title,
    lowestBarrierAgency: lowestBarrier.agency,
    lowestBarrierReasons: lowestBarrier.opportunityReasons.slice(0, 3),
    strictestTitle: strictest.title,
    strictestAgency: strictest.agency,
    strictestReasons: strictest.cautionReasons.slice(0, 3),
    cautionItems,
    helperText: "规则提示基于招录人数、门槛限制和结构化质量，不代表真实竞争强度。"
  };
}

function buildEligibilitySummary(positions, personalProfile) {
  const normalizedProfile = normalizePersonalProfile(personalProfile);
  if (!positions.length || !hasPersonalProfile(normalizedProfile)) {
    return {
      active: false,
      profileSummary: buildPersonalProfileSummary(normalizedProfile),
      matchedCount: 0,
      blockedCount: 0,
      bestFitTitle: "",
      bestFitAgency: "",
      bestFitLabel: "",
      bestFitReasons: [],
      blockingItems: []
    };
  }

  const matchedCount = positions.filter((item) => item.isFullyMatched).length;
  const blockedCount = positions.filter((item) => item.mismatchCount > 0).length;
  const bestFit = positions.slice().sort((left, right) => {
    const mismatchGap = Number(left.mismatchCount || 0) - Number(right.mismatchCount || 0);
    if (mismatchGap !== 0) {
      return mismatchGap;
    }
    return Number(right.ruleScore || 0) - Number(left.ruleScore || 0);
  })[0];
  const blockingItems = positions
    .filter((item) => item.mismatchCount > 0)
    .sort((left, right) => {
      const mismatchGap = Number(right.mismatchCount || 0) - Number(left.mismatchCount || 0);
      if (mismatchGap !== 0) {
        return mismatchGap;
      }
      return Number(left.ruleScore || 0) - Number(right.ruleScore || 0);
    })
    .slice(0, 2)
    .map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.mismatchReasons.slice(0, 2).join("、")
    }));

  return {
    active: true,
    profileSummary: buildPersonalProfileSummary(normalizedProfile),
    matchedCount,
    blockedCount,
    bestFitTitle: bestFit.title,
    bestFitAgency: bestFit.agency,
    bestFitLabel: bestFit.mismatchCount ? `${bestFit.mismatchCount} 项待确认` : "当前最匹配",
    bestFitReasons: bestFit.mismatchCount
      ? bestFit.mismatchReasons.slice(0, 3)
      : bestFit.opportunityReasons.slice(0, 3),
    blockingItems
  };
}

function buildDecisionAlignmentSummary(positions, personalProfile) {
  const normalizedProfile = normalizePersonalProfile(personalProfile);
  if (!positions.length || !hasPersonalProfile(normalizedProfile)) {
    return {
      active: false,
      headline: "",
      detail: "",
      tags: []
    };
  }

  const ruleTop = positions.slice().sort((left, right) => {
    const scoreGap = Number(right.ruleScore || 0) - Number(left.ruleScore || 0);
    if (scoreGap !== 0) {
      return scoreGap;
    }
    return Number(left.barrierCount || 0) - Number(right.barrierCount || 0);
  })[0];
  const bestFit = positions.slice().sort((left, right) => {
    const mismatchGap = Number(left.mismatchCount || 0) - Number(right.mismatchCount || 0);
    if (mismatchGap !== 0) {
      return mismatchGap;
    }
    return Number(right.ruleScore || 0) - Number(left.ruleScore || 0);
  })[0];

  if (!ruleTop || !bestFit) {
    return {
      active: false,
      headline: "",
      detail: "",
      tags: []
    };
  }

  if (ruleTop.id === bestFit.id) {
    return {
      active: true,
      headline: `${ruleTop.title} 同时是规则最优和当前最匹配`,
      detail: bestFit.mismatchCount
        ? `虽然仍有 ${bestFit.mismatchCount} 项待确认，但它在当前对比组里对你最接近。`
        : "如果先只重点看一个岗位，优先从它开始。",
      tags: (ruleTop.ruleReasons || []).slice(0, 3)
    };
  }

  return {
    active: true,
    headline: "规则最优岗和当前最匹配岗不是同一个",
    detail: `规则更优：${ruleTop.title}；更适合你：${bestFit.title}。先确认你是否优先追求门槛更友好，还是优先追求当前可报。`,
    tags: [
      ruleTop.ruleLabel ? `${ruleTop.title}：${ruleTop.ruleLabel}` : "",
      bestFit.mismatchCount ? `${bestFit.title}：${bestFit.mismatchCount} 项待确认` : `${bestFit.title}：当前最匹配`
    ].filter(Boolean)
  };
}

function buildActionPlanSummary(
  positions,
  decisionSummary = {},
  eligibilitySummary = {},
  decisionAlignmentSummary = {}
) {
  if (!positions.length) {
    return {
      headline: "",
      detail: "",
      items: []
    };
  }

  const preferred = positions.slice().sort((left, right) => {
    const mismatchGap = Number(left.mismatchCount || 0) - Number(right.mismatchCount || 0);
    if (mismatchGap !== 0) {
      return mismatchGap;
    }
    return Number(right.ruleScore || 0) - Number(left.ruleScore || 0);
  })[0];
  const reviewTarget = positions
    .filter((item) => item.id !== (preferred && preferred.id))
    .sort((left, right) => {
      const mismatchGap = Number(right.mismatchCount || 0) - Number(left.mismatchCount || 0);
      if (mismatchGap !== 0) {
        return mismatchGap;
      }
      const trustGap = String((left.noticeTrust && left.noticeTrust.parseQualityStatus) || "")
        .localeCompare(String((right.noticeTrust && right.noticeTrust.parseQualityStatus) || ""));
      if (trustGap !== 0) {
        return trustGap;
      }
      return Number(left.ruleScore || 0) - Number(right.ruleScore || 0);
    })[0] || null;
  const trustReviewTargets = positions
    .filter((item) => item.noticeTrust && item.noticeTrust.parseQualityStatus !== "healthy")
    .slice(0, 2);

  const items = [];
  if (preferred) {
    items.push({
      label: preferred.mismatchCount ? "先看最接近可报的岗位" : "第一优先",
      summary: `${preferred.title} · ${preferred.mismatchCount ? preferred.eligibilityLabel : `${preferred.ruleLabel} · ${preferred.eligibilityLabel}`}`,
      tone: preferred.mismatchCount ? "neutral" : "ok"
    });
  }
  if (reviewTarget) {
    const nextAction = buildPositionNextAction(reviewTarget);
    items.push({
      label: nextAction.label,
      summary: `${reviewTarget.title} · ${nextAction.detail}`,
      tone: nextAction.tone
    });
  }
  if (trustReviewTargets.length) {
    items.push({
      label: "最后核对公告原文",
      summary: trustReviewTargets.map((item) => item.title).join(" · "),
      tone: "warn"
    });
  }

  let headline = "";
  let detail = "";
  if (eligibilitySummary.active && preferred && !preferred.mismatchCount) {
    headline = `先把 ${preferred.title} 作为第一优先`;
    detail = decisionAlignmentSummary.active
      ? decisionAlignmentSummary.detail
      : `${preferred.title} 当前既没有明显报考冲突，也更值得优先投入时间核对。`;
  } else if (eligibilitySummary.active && preferred) {
    headline = `先把岗位分成“可报”和“待确认”两类`;
    detail = `${preferred.title} 是当前最接近可报的岗位，但仍需先确认 ${preferred.mismatchReasons.slice(0, 2).join("、")}。`;
  } else if (decisionSummary.topTitle) {
    headline = `先从 ${decisionSummary.topTitle} 开始看`;
    detail = `${decisionSummary.topTitle} 在当前规则评分里更靠前，但仍要结合公告原文和个人条件判断。`;
  } else {
    headline = "先看门槛，再看机会点";
    detail = "先排除明显报考冲突，再比较地区、职位类型和附加要求。";
  }

  return {
    headline,
    detail,
    items
  };
}

function buildRowFocusSummary(positions) {
  const fields = collectFieldMeta(positions);
  const mismatchKeySet = new Set();
  positions.forEach((position) => {
    (position.mismatchKeys || []).forEach((key) => mismatchKeySet.add(key));
  });

  return {
    totalCount: ROW_LABELS.length,
    differentCount: fields.filter((item) => item.isDifferent).length,
    barrierCount: ROW_LABELS.filter(([, key]) => BARRIER_ROW_KEYS.has(key)).length,
    mismatchCount: mismatchKeySet.size
  };
}

function buildEmptyNoticeContextSummary() {
  return {
    active: false,
    sameNotice: false,
    noticeCount: 0,
    stageLabels: [],
    latestPublishedAt: "",
    headline: "",
    detail: "",
    items: []
  };
}

function collectUniqueText(values = []) {
  return Array.from(new Set(
    (values || [])
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  ));
}

function buildPositionSourceTrace(position = {}) {
  const mergedSourceCount = Number(position.mergedSourceCount || 0);
  const mergedSources = Array.isArray(position.mergedSources) ? position.mergedSources : [];
  const sourceName = String(position.sourceName || "").trim();
  const positionSourceName = String(position.positionSourceName || "").trim() || sourceName;
  const positionSourceId = String(position.positionSourceId || "").trim();
  const positionNoticeId = String(position.positionNoticeId || "").trim();
  const displaySourceName = mergedSourceCount > 1 ? positionSourceName : (positionSourceName || sourceName);
  const auxiliarySourceNames = collectUniqueText(
    mergedSources
      .filter((item) => {
        const itemSourceId = String(item.sourceId || "").trim();
        const itemNoticeId = String(item.noticeId || "").trim();
        if (positionSourceId && itemSourceId === positionSourceId) {
          return false;
        }
        if (positionNoticeId && itemNoticeId === positionNoticeId) {
          return false;
        }
        return true;
      })
      .map((item) => item.sourceName || item.sourceId)
  );

  if (!displaySourceName && !mergedSourceCount) {
    return {
      active: false,
      isAggregated: false,
      roleLabel: "",
      sourceName: "",
      summary: "",
      detail: "",
      auxiliarySourceNames: []
    };
  }

  return {
    active: true,
    isAggregated: mergedSourceCount > 1,
    roleLabel: mergedSourceCount > 1 ? "岗位主源" : "官方来源",
    sourceName: displaySourceName,
    summary: mergedSourceCount > 1
      ? `已聚合 ${mergedSourceCount} 个官方来源，岗位检索、岗位对比和相似岗位推荐以${displaySourceName || "岗位主源"}为准。`
      : `当前岗位来自单一官方来源${displaySourceName ? `：${displaySourceName}` : ""}。`,
    detail: auxiliarySourceNames.length
      ? `辅助来源：${auxiliarySourceNames.join("、")}，用于补充公告原文、时间节点和后续流程信息。`
      : "",
    auxiliarySourceNames
  };
}

function buildEmptySourceContextSummary() {
  return {
    active: false,
    aggregatedCount: 0,
    sourceCount: 0,
    headline: "",
    detail: "",
    items: []
  };
}

function buildSourceContextSummary(positions = []) {
  if (!Array.isArray(positions) || !positions.length) {
    return buildEmptySourceContextSummary();
  }

  const items = positions
    .map((position) => {
      const trace = buildPositionSourceTrace(position);
      if (!trace.active) {
        return null;
      }
      return {
        id: position.id,
        title: position.title || "未标记岗位",
        roleLabel: trace.roleLabel,
        sourceName: trace.sourceName,
        summary: trace.summary,
        detail: trace.detail,
        isAggregated: trace.isAggregated,
        auxiliarySourceNames: trace.auxiliarySourceNames
      };
    })
    .filter(Boolean);

  if (!items.length) {
    return buildEmptySourceContextSummary();
  }

  const aggregatedCount = items.filter((item) => item.isAggregated).length;
  const sourceCount = collectUniqueText(items.map((item) => item.sourceName)).length;

  return {
    active: true,
    aggregatedCount,
    sourceCount,
    headline: aggregatedCount
      ? `当前对比组涉及 ${sourceCount} 个核心官方来源`
      : `当前对比组来自 ${sourceCount} 个官方来源`,
    detail: aggregatedCount
      ? `其中 ${aggregatedCount} 个岗位来自聚合公告；岗位检索、岗位对比与推荐均以对应岗位主源为准。`
      : "当前对比组暂未命中聚合公告，岗位数据均来自单一官方来源。",
    items
  };
}

function buildNoticeContextSummary(positions = []) {
  if (!Array.isArray(positions) || !positions.length) {
    return buildEmptyNoticeContextSummary();
  }

  const noticeMap = new Map();
  const stageSet = new Set();
  let latestPublishedAt = "";

  positions.forEach((position) => {
    const noticeId = String(position.noticeId || "").trim();
    const noticeTitle = String(position.noticeTitle || "").trim() || "未标记公告";
    const stageLabel = String(position.noticeStageLabel || "").trim();
    const publishedAt = String(position.noticePublishedAt || "").trim();
    const area = String(position.noticeArea || "").trim();
    const key = noticeId || `${noticeTitle}::${stageLabel}::${publishedAt}`;

    if (!noticeMap.has(key)) {
      noticeMap.set(key, {
        noticeId,
        noticeTitle,
        stageLabel,
        publishedAt,
        area,
        count: 0
      });
    }

    const current = noticeMap.get(key);
    current.count += 1;
    if (!current.area && area) {
      current.area = area;
    }
    if (!current.stageLabel && stageLabel) {
      current.stageLabel = stageLabel;
    }
    if (!current.publishedAt && publishedAt) {
      current.publishedAt = publishedAt;
    }

    if (stageLabel) {
      stageSet.add(stageLabel);
    }
    if (publishedAt && (!latestPublishedAt || publishedAt > latestPublishedAt)) {
      latestPublishedAt = publishedAt;
    }
  });

  const noticeItems = Array.from(noticeMap.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return String(left.noticeTitle || "").localeCompare(String(right.noticeTitle || ""));
  });
  const noticeCount = noticeItems.length;
  const sameNotice = noticeCount === 1;
  const stageLabels = Array.from(stageSet);
  const headline = sameNotice
    ? "当前对比组来自同一公告"
    : `当前对比组覆盖 ${noticeCount} 条公告`;
  const detailParts = [];

  if (sameNotice && noticeItems[0]) {
    detailParts.push(noticeItems[0].noticeTitle);
  }
  if (stageLabels.length) {
    detailParts.push(`阶段：${stageLabels.join("、")}`);
  }
  if (latestPublishedAt) {
    detailParts.push(`最近发布时间：${latestPublishedAt}`);
  }

  return {
    active: true,
    sameNotice,
    noticeCount,
    stageLabels,
    latestPublishedAt,
    headline,
    detail: detailParts.join(" · "),
    items: noticeItems.map((item) => ({
      noticeId: item.noticeId,
      title: item.noticeTitle,
      stageLabel: item.stageLabel,
      publishedAt: item.publishedAt,
      area: item.area,
      count: item.count,
      summary: [
        item.stageLabel || "",
        item.publishedAt || "",
        item.area || "",
        `${item.count} 个岗位`
      ].filter(Boolean).join(" · ")
    }))
  };
}

function mapSourceEntryLabel(entry) {
  const labels = {
    home: "首页",
    messages: "消息提醒",
    profile: "个人中心",
    positions: "岗位列表",
    compare: "岗位对比页"
  };
  return labels[String(entry || "").trim()] || "";
}

function mapCompareActionLabel(action) {
  const labels = {
    create: "新建方案",
    reuse: "补充岗位",
    "open-existing": "打开已有方案"
  };
  return labels[String(action || "").trim()] || "";
}

function formatCompareContextSummary(context = {}, fallbackLabel = "") {
  if (!context || typeof context !== "object") {
    return "";
  }

  const parts = [];
  const sourceLabel = String(context.sourceLabel || "").trim();
  const entryLabel = mapSourceEntryLabel(context.sourceEntry);
  const sourceName = String(context.sourceName || "").trim();
  const actionLabel = mapCompareActionLabel(context.action);
  const addedCount = Number(context.addedCount || 0);
  const positionCount = Array.isArray(context.positionIds) ? context.positionIds.length : 0;

  if (sourceLabel) {
    parts.push(sourceLabel);
  } else if (fallbackLabel) {
    parts.push(fallbackLabel);
  }
  if (entryLabel) {
    parts.push(entryLabel);
  }
  if (sourceName) {
    parts.push(sourceName);
  }
  if (actionLabel) {
    parts.push(actionLabel);
  }
  if (addedCount > 0) {
    parts.push(`新增 ${addedCount} 个岗位`);
  } else if (positionCount > 0 && context.action === "open-existing") {
    parts.push(`命中 ${positionCount} 个岗位`);
  }
  if (context.actedAt) {
    parts.push(String(context.actedAt).replace("T", " ").slice(0, 16));
  }

  return parts.filter(Boolean).join(" · ");
}

function buildCompareShareText(payload = {}) {
  const group = payload.group || {};
  const positions = Array.isArray(payload.positions) ? payload.positions : [];
  const differenceSummary = payload.differenceSummary || { differentFields: [] };
  const noticeContextSummary = payload.noticeContextSummary || buildEmptyNoticeContextSummary();
  const sourceContextSummary = payload.sourceContextSummary || buildEmptySourceContextSummary();
  const decisionSummary = payload.decisionSummary || {};
  const eligibilitySummary = payload.eligibilitySummary || {};
  const decisionAlignmentSummary = payload.decisionAlignmentSummary || {};
  const actionPlanSummary = payload.actionPlanSummary || {};
  const sortMode = payload.sortMode || "manual";
  const sortLabelMap = {
    manual: "原顺序",
    rule: "规则分优先",
    eligibility: "个人匹配优先"
  };

  const lines = [
    `${group.name || "岗位"}对比摘要`,
    `查看顺序：${sortLabelMap[sortMode] || sortLabelMap.manual}`,
    `对比岗位：${positions.map((item) => `${item.title}（${item.agency}）`).join(" · ")}`,
    `规则建议：${decisionSummary.topTitle || "暂无"}${decisionSummary.topLabel ? ` · ${decisionSummary.topLabel}` : ""}${decisionSummary.topScoreLabel ? ` · ${decisionSummary.topScoreLabel}` : ""}`
  ];

  const positionNoticeSummaries = positions
    .map((item) => {
      const noticeParts = [
        item.noticeTitle || "",
        item.noticeStageLabel || "",
        item.noticePublishedAt || ""
      ].filter(Boolean);
      if (!noticeParts.length) {
        return "";
      }
      return `${item.title}：${noticeParts.join(" · ")}`;
    })
    .filter(Boolean);
  if (positionNoticeSummaries.length) {
    lines.push(`公告出处：${positionNoticeSummaries.join("；")}`);
  }
  if (noticeContextSummary.active) {
    const noticeSummaryLine = noticeContextSummary.sameNotice
      ? `公告聚合：同一公告 · ${noticeContextSummary.detail || `${noticeContextSummary.noticeCount} 条公告`}`
      : `公告聚合：${noticeContextSummary.noticeCount} 条公告${noticeContextSummary.stageLabels.length ? ` · 阶段 ${noticeContextSummary.stageLabels.join("、")}` : ""}${noticeContextSummary.latestPublishedAt ? ` · 最近发布时间 ${noticeContextSummary.latestPublishedAt}` : ""}`;
    lines.push(noticeSummaryLine);
  }
  if (sourceContextSummary.active) {
    lines.push(`来源说明：${sourceContextSummary.headline}${sourceContextSummary.detail ? ` · ${sourceContextSummary.detail}` : ""}`);
    if (Array.isArray(sourceContextSummary.items) && sourceContextSummary.items.length) {
      lines.push(`岗位来源：${sourceContextSummary.items.map((item) => `${item.title}：${item.roleLabel} ${item.sourceName}${item.auxiliarySourceNames && item.auxiliarySourceNames.length ? `；辅助来源 ${item.auxiliarySourceNames.join("、")}` : ""}`).join("；")}`);
    }
  }

  if (decisionSummary.lowestBarrierTitle) {
    lines.push(`限制相对最少：${decisionSummary.lowestBarrierTitle}`);
  }
  if (decisionSummary.strictestTitle) {
    lines.push(`限制相对更严：${decisionSummary.strictestTitle}`);
  }
  if (Array.isArray(decisionSummary.focusFields) && decisionSummary.focusFields.length) {
    lines.push(`优先关注字段：${decisionSummary.focusFields.join("、")}`);
  }

  const topDifferences = (differenceSummary.differentFields || []).slice(0, 3);
  if (topDifferences.length) {
    lines.push(`主要差异：${topDifferences.map((item) => `${item.label}=${item.summary}`).join("；")}`);
  }

  if (eligibilitySummary.active) {
    lines.push(`个人条件：${eligibilitySummary.profileSummary}`);
    lines.push(`匹配情况：完全匹配 ${eligibilitySummary.matchedCount} 个，存在不匹配 ${eligibilitySummary.blockedCount} 个`);
  }
  if (decisionAlignmentSummary.active) {
    lines.push(`联动判断：${decisionAlignmentSummary.headline}`);
    if (decisionAlignmentSummary.detail) {
      lines.push(`取舍提示：${decisionAlignmentSummary.detail}`);
    }
  }
  if (actionPlanSummary.headline) {
    lines.push(`下一步动作：${actionPlanSummary.headline}`);
    if (actionPlanSummary.detail) {
      lines.push(`执行建议：${actionPlanSummary.detail}`);
    }
  }
  if (Array.isArray(actionPlanSummary.items) && actionPlanSummary.items.length) {
    lines.push(`建议顺序：${actionPlanSummary.items.map((item) => `${item.label}=${item.summary}`).join("；")}`);
  }

  lines.push("提示：规则结论仅用于选岗初筛，最终以官方公告和资格审查为准。");
  return lines.join("\n");
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

function buildComparePageUrl(compareSuggestion = {}) {
  if (compareSuggestion && compareSuggestion.groupId) {
    return `/pages/compare/index?groupId=${compareSuggestion.groupId}`;
  }
  return "/pages/compare/index";
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

function buildCompareContext(group = null, basePosition = null, candidatePosition = null) {
  return {
    sourceType: "compare",
    sourceLabel: "岗位对比推荐",
    sourceEntry: "compare",
    sourceName: group && group.name ? group.name : ((basePosition && basePosition.title) || "岗位对比"),
    noticeId: (candidatePosition && candidatePosition.noticeId) || "",
    noticeTitle: (candidatePosition && candidatePosition.noticeTitle) || ""
  };
}

function enrichComparePosition(position) {
  return {
    ...position,
    freshGraduateOnlyLabel: position.freshGraduateOnly ? "仅限应届" : "不限",
    trustLabel: position.noticeTrust ? position.noticeTrust.trustLabel : "结构化状态未知",
    ...scorePosition(position)
  };
}

function enrichComparePositionWithProfile(position, personalProfile) {
  const enriched = {
    ...enrichComparePosition(position),
    ...evaluateEligibility(position, personalProfile)
  };
  return {
    ...enriched,
    nextAction: buildPositionNextAction(enriched)
  };
}

Page({
  data: {
    group: null,
    groups: [],
    currentGroupId: "",
    sortMode: "manual",
    positions: [],
    columns: [],
    personalProfile: { ...DEFAULT_PERSONAL_PROFILE },
    personalProfileSummary: "",
    eligibilitySummary: {
      active: false,
      profileSummary: "",
      matchedCount: 0,
      blockedCount: 0,
      bestFitTitle: "",
      bestFitAgency: "",
      bestFitLabel: "",
      bestFitReasons: [],
      blockingItems: []
    },
    draftGroupName: "",
    differenceSummary: {
      sharedFields: [],
      differentFields: [],
      stats: []
    },
    rowFocusMode: "all",
    rowFocusSummary: {
      totalCount: 0,
      differentCount: 0,
      barrierCount: 0,
      mismatchCount: 0
    },
    contextSummary: {
      originLabel: "",
      originSummary: "",
      lastActionLabel: "",
      lastActionSummary: ""
    },
    noticeContextSummary: buildEmptyNoticeContextSummary(),
    sourceContextSummary: buildEmptySourceContextSummary(),
    decisionAlignmentSummary: {
      active: false,
      headline: "",
      detail: "",
      tags: []
    },
    decisionSummary: {
      topTitle: "",
      topAgency: "",
      topLabel: "",
      topScoreLabel: "",
      topReasons: [],
      topCautions: [],
      focusFields: [],
      cautionCount: 0,
      lowestBarrierTitle: "",
      lowestBarrierAgency: "",
      lowestBarrierReasons: [],
      strictestTitle: "",
      strictestAgency: "",
      strictestReasons: [],
      cautionItems: [],
      helperText: ""
    },
    actionPlanSummary: {
      headline: "",
      detail: "",
      items: []
    },
    recommendedPositions: [],
    recommendationBaseId: "",
    recommendationContext: buildEmptyRecommendationContext(),
    lastCompareStatus: "",
    lastCompareTargetGroupId: "",
    lastCompareTargetGroupName: ""
  },

  onLoad(query) {
    this.groupId = query.groupId;
  },

  applyViewState(nextSortMode = this.data.sortMode, nextRowFocusMode = this.data.rowFocusMode) {
    const sortedPositions = sortComparePositions(this.comparePositions || [], nextSortMode);
    this.setData({
      sortMode: nextSortMode,
      rowFocusMode: nextRowFocusMode,
      positions: sortedPositions,
      columns: buildCompareColumns(sortedPositions, nextRowFocusMode)
    });
  },

  persistViewPreferences(nextSortMode, nextRowFocusMode) {
    const { group } = this.data;
    if (!group || !group.id) {
      return;
    }

    api.saveCompareGroupPreferences(group.id, {
      sortMode: nextSortMode,
      rowFocusMode: nextRowFocusMode
    }).then((nextGroup) => {
      const groups = this.data.groups.map((item) => (
        item.id === nextGroup.id ? nextGroup : item
      ));
      this.setData({
        group: nextGroup,
        groups
      });
    }).catch((error) => {
      wx.showToast({ title: error.message, icon: "none" });
    });
  },

  onShow() {
    Promise.all([
      api.listCompareGroups(),
      api.getPersonalProfile()
    ]).then(([groups, profilePayload]) => {
      const fallbackGroup = groups[0];
      const currentGroupId = this.groupId || this.data.currentGroupId || (fallbackGroup && fallbackGroup.id) || "";
      const personalProfile = normalizePersonalProfile(
        (profilePayload && profilePayload.profile) || DEFAULT_PERSONAL_PROFILE
      );

      this.setData({
        groups,
        currentGroupId,
        personalProfile,
        personalProfileSummary: buildPersonalProfileSummary(personalProfile)
      });

      if (!currentGroupId) {
        this.setData({
          group: null,
          sortMode: "manual",
          rowFocusMode: "all",
          positions: [],
          columns: [],
          eligibilitySummary: buildEligibilitySummary([], personalProfile),
          draftGroupName: "",
          differenceSummary: {
            sharedFields: [],
            differentFields: [],
            stats: []
          },
          rowFocusSummary: {
            totalCount: 0,
            differentCount: 0,
            barrierCount: 0,
            mismatchCount: 0
          },
          contextSummary: {
            originLabel: "",
            originSummary: "",
            lastActionLabel: "",
            lastActionSummary: ""
          },
          noticeContextSummary: buildEmptyNoticeContextSummary(),
          sourceContextSummary: buildEmptySourceContextSummary(),
          decisionAlignmentSummary: {
            active: false,
            headline: "",
            detail: "",
            tags: []
          },
          decisionSummary: {
            topTitle: "",
            topAgency: "",
            topLabel: "",
            topScoreLabel: "",
            topReasons: [],
            topCautions: [],
            focusFields: [],
            cautionCount: 0,
            lowestBarrierTitle: "",
            lowestBarrierAgency: "",
            lowestBarrierReasons: [],
            strictestTitle: "",
            strictestAgency: "",
            strictestReasons: [],
            cautionItems: [],
            helperText: ""
          },
          actionPlanSummary: {
            headline: "",
            detail: "",
            items: []
          },
          recommendedPositions: [],
          recommendationBaseId: "",
          recommendationContext: buildEmptyRecommendationContext()
        });
        return;
      }

      api.getCompareGroupDetail(currentGroupId).then(({ group, positions }) => {
        const mapped = positions.map((position) => enrichComparePositionWithProfile(position, personalProfile));
        const differenceSummary = buildDifferenceSummary(mapped);
        const rowFocusSummary = buildRowFocusSummary(mapped);
        const noticeContextSummary = buildNoticeContextSummary(mapped);
        const sourceContextSummary = buildSourceContextSummary(mapped);
        const sortMode = group && group.viewPreferences ? group.viewPreferences.sortMode : "manual";
        const rowFocusMode = group && group.viewPreferences ? group.viewPreferences.rowFocusMode : "all";
        const eligibilitySummary = buildEligibilitySummary(mapped, personalProfile);
        const decisionAlignmentSummary = buildDecisionAlignmentSummary(mapped, personalProfile);
        const decisionSummary = buildDecisionSummary(mapped, differenceSummary);
        const actionPlanSummary = buildActionPlanSummary(
          mapped,
          decisionSummary,
          eligibilitySummary,
          decisionAlignmentSummary
        );
        const recommendationBaseId = (
          this.data.recommendationBaseId &&
          mapped.some((item) => item.id === this.data.recommendationBaseId)
        )
          ? this.data.recommendationBaseId
          : ((mapped[0] && mapped[0].id) || "");
        const contextSummary = {
          originLabel: "最初来源",
          originSummary: formatCompareContextSummary(group && group.originContext, "手动新建"),
          lastActionLabel: "最近更新",
          lastActionSummary: formatCompareContextSummary(
            group && group.lastActionContext,
            group && group.originContext ? "沿用原方案" : "暂无更新记录"
          )
        };
        this.comparePositions = mapped;
        this.setData({
          group,
          eligibilitySummary,
          draftGroupName: group ? group.name : "",
          differenceSummary,
          rowFocusSummary,
          contextSummary,
          noticeContextSummary,
          sourceContextSummary,
          decisionAlignmentSummary,
          decisionSummary,
          actionPlanSummary,
          recommendationBaseId
        });
        this.applyViewState(sortMode, rowFocusMode);
        this.loadRecommendations(recommendationBaseId, mapped, groups, group, personalProfile);
        if (typeof api.touchCompareGroup === "function" && group && group.id) {
          api.touchCompareGroup(group.id).then((touchedGroup) => {
            if (!touchedGroup || !touchedGroup.id) {
              return;
            }
            this.setData({
              group: touchedGroup,
              groups: this.data.groups.map((item) => (
                item.id === touchedGroup.id ? touchedGroup : item
              ))
            });
          }).catch(() => {});
        }
      });
    });
  },

  loadRecommendations(positionId, comparePositions = this.comparePositions || [], compareGroups = this.data.groups || [], currentGroup = this.data.group, personalProfile = this.data.personalProfile) {
    if (!positionId) {
      this.setData({
        recommendationBaseId: "",
        recommendedPositions: [],
        recommendationContext: buildEmptyRecommendationContext()
      });
      return;
    }

    const basePosition = (comparePositions || []).find((item) => item.id === positionId) || null;
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
      const currentPositionIds = new Set(
        Array.isArray(currentGroup && currentGroup.positionIds) ? currentGroup.positionIds : []
      );
      const decoratedRecommendations = (recommendedPositions || [])
        .map((item) => enrichComparePositionWithProfile(item, personalProfile))
        .map((item) => decorateRecommendedPosition(basePosition, item))
        .map((item) => decoratePositionWithCompareSuggestion(item, compareGroups, currentGroup));
      const candidateRecommendations = decoratedRecommendations.filter((item) => item.id !== positionId);
      const externalRecommendations = candidateRecommendations.filter((item) => !currentPositionIds.has(item.id));
      this.setData({
        recommendationBaseId: positionId,
        recommendationContext,
        recommendedPositions: externalRecommendations.length ? externalRecommendations : candidateRecommendations
      });
    }).catch(() => {
      this.setData({
        recommendationBaseId: positionId,
        recommendationContext,
        recommendedPositions: []
      });
    });
  },

  changeGroup(event) {
    const { id } = event.currentTarget.dataset;
    this.groupId = id;
    this.setData({ currentGroupId: id });
    this.onShow();
  },

  changeRecommendationBase(event) {
    const { id } = event.currentTarget.dataset;
    if (!id || id === this.data.recommendationBaseId) {
      return;
    }
    this.loadRecommendations(id);
  },

  changeRowFocusMode(event) {
    const { mode } = event.currentTarget.dataset;
    const nextMode = ["all", "different", "barrier"].includes(mode) ? mode : "all";
    this.applyViewState(this.data.sortMode, nextMode);
    this.persistViewPreferences(this.data.sortMode, nextMode);
  },

  changeSortMode(event) {
    const { mode } = event.currentTarget.dataset;
    const nextMode = ["manual", "rule", "eligibility"].includes(mode) ? mode : "manual";
    this.applyViewState(nextMode, this.data.rowFocusMode);
    this.persistViewPreferences(nextMode, this.data.rowFocusMode);
  },

  copySummary() {
    const {
      group,
      positions,
      differenceSummary,
      noticeContextSummary,
      sourceContextSummary,
      decisionSummary,
      eligibilitySummary,
      decisionAlignmentSummary,
      actionPlanSummary,
      sortMode
    } = this.data;
    if (!group || !positions.length) {
      wx.showToast({ title: "当前没有可复制摘要", icon: "none" });
      return;
    }

    if (!wx.setClipboardData) {
      wx.showToast({ title: "当前环境不支持复制", icon: "none" });
      return;
    }

    wx.setClipboardData({
      data: buildCompareShareText({
        group,
        positions,
        differenceSummary,
        noticeContextSummary,
        sourceContextSummary,
        decisionSummary,
        eligibilitySummary,
        decisionAlignmentSummary,
        actionPlanSummary,
        sortMode
      }),
      success: () => {
        wx.showToast({ title: "已复制摘要", icon: "success" });
      }
    });
  },

  onGroupNameInput(event) {
    this.setData({ draftGroupName: event.detail.value });
  },

  saveGroupName() {
    const { group, draftGroupName } = this.data;
    if (!group) {
      return;
    }
    const nextName = draftGroupName.trim();
    if (!nextName) {
      wx.showToast({ title: "请输入方案名称", icon: "none" });
      return;
    }
    api.renameCompareGroup(group.id, nextName).then(() => {
      wx.showToast({ title: "已更新名称", icon: "success" });
      this.onShow();
    });
  },

  createGroup() {
    const { positions, group } = this.data;
    const examType = (group && group.examType) || (positions[0] && positions[0].examType) || "";
    if (!examType) {
      wx.showToast({ title: "当前没有可复用岗位", icon: "none" });
      return;
    }
    api.createCompareGroup("新的对比方案", examType)
      .then((nextGroup) => {
        this.groupId = nextGroup.id;
        this.onShow();
      })
      .catch((error) => {
        wx.showToast({ title: error.message, icon: "none" });
      });
  },

  deleteGroup() {
    const { group } = this.data;
    if (!group) {
      return;
    }
    api.deleteCompareGroup(group.id).then((groups) => {
      this.groupId = groups[0] ? groups[0].id : "";
      wx.showToast({ title: "已删除方案", icon: "success" });
      this.onShow();
    });
  },

  removeFromCompare(event) {
    const { id } = event.currentTarget.dataset;
    api.removePositionFromGroup(this.data.group.id, id).then(() => {
      this.onShow();
    });
  },

  addRecommendedToCompare(event) {
    const { id } = event.currentTarget.dataset;
    const candidatePosition = this.data.recommendedPositions.find((item) => item.id === id) || null;
    const basePosition = (this.comparePositions || []).find((item) => item.id === this.data.recommendationBaseId) || null;
    if (!candidatePosition) {
      wx.showToast({ title: "当前推荐岗位不存在", icon: "none" });
      return;
    }

    const compareSuggestion = candidatePosition.compareSuggestion || buildEmptyPositionCompareSuggestion();
    if (compareSuggestion.mode === "in-current-group" || compareSuggestion.mode === "open-existing") {
      wx.navigateTo({ url: buildComparePageUrl(compareSuggestion) });
      return;
    }

    if (compareSuggestion.mode === "review-needed") {
      wx.navigateTo({ url: buildComparePageUrl(compareSuggestion) });
      return;
    }

    executeQuickCompare(api, {
      name: candidatePosition.title || "推荐岗位",
      examType: candidatePosition.examType,
      noticeId: candidatePosition.noticeId || "",
      noticeTitle: candidatePosition.noticeTitle || "",
      currentPositionIds: [candidatePosition.id]
    }, {
      preferredGroupId: this.data.currentGroupId || "",
      compareContext: buildCompareContext(this.data.group, basePosition, candidatePosition)
    }).then((result) => {
      if (!result) {
        return;
      }
      if (result.status === "empty" || !result.group) {
        wx.showToast({ title: "当前没有可对比岗位", icon: "none" });
        return;
      }

      this.groupId = result.group.id;
      this.setData({
        currentGroupId: result.group.id,
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

  openPositions(event) {
    const { noticeId } = event.currentTarget.dataset;
    if (!noticeId) {
      return;
    }
    wx.navigateTo({ url: `/pages/positions/index?noticeId=${noticeId}` });
  },

  openNoticeDetail(event) {
    const { noticeId } = event.currentTarget.dataset;
    if (!noticeId) {
      return;
    }
    wx.navigateTo({ url: `/pages/notice-detail/index?id=${noticeId}` });
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
