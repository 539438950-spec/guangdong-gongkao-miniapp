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

function toEducationRank(value) {
  const text = normalizeValue(value);
  if (text.includes("研究生") || text.includes("硕士") || text.includes("博士")) {
    return 3;
  }
  if (text.includes("本科")) {
    return 2;
  }
  if (text.includes("大专") || text.includes("专科")) {
    return 1;
  }
  return 0;
}

function toDegreeRank(value) {
  const text = normalizeValue(value);
  if (text.includes("博士")) {
    return 4;
  }
  if (text.includes("硕士")) {
    return 3;
  }
  if (text.includes("学士")) {
    return 2;
  }
  if (text.includes("大专") || text.includes("专科")) {
    return 1;
  }
  return 0;
}

function buildDeltaReasonEntries(basePosition = {}, candidatePosition = {}) {
  const reasons = [];
  const baseEducationRank = toEducationRank(basePosition.education);
  const candidateEducationRank = toEducationRank(candidatePosition.education);
  const baseDegreeRank = toDegreeRank(basePosition.degree);
  const candidateDegreeRank = toDegreeRank(candidatePosition.degree);

  if (candidateEducationRank && baseEducationRank && candidateEducationRank < baseEducationRank) {
    reasons.push({ label: "学历门槛更低", tone: "advantage" });
  } else if (candidateEducationRank && baseEducationRank && candidateEducationRank > baseEducationRank) {
    reasons.push({ label: "学历门槛更高", tone: "pressure" });
  }

  if (candidateDegreeRank && baseDegreeRank && candidateDegreeRank < baseDegreeRank) {
    reasons.push({ label: "学位门槛更低", tone: "advantage" });
  } else if (candidateDegreeRank && baseDegreeRank && candidateDegreeRank > baseDegreeRank) {
    reasons.push({ label: "学位门槛更高", tone: "pressure" });
  }

  if (candidatePosition.serviceRequirement !== basePosition.serviceRequirement) {
    if (isOpenRequirement(candidatePosition.serviceRequirement) && !isOpenRequirement(basePosition.serviceRequirement)) {
      reasons.push({ label: "基层经历限制更少", tone: "advantage" });
    } else if (!isOpenRequirement(candidatePosition.serviceRequirement) && isOpenRequirement(basePosition.serviceRequirement)) {
      reasons.push({ label: "基层经历要求更严", tone: "pressure" });
    }
  }

  if (Boolean(candidatePosition.freshGraduateOnly) !== Boolean(basePosition.freshGraduateOnly)) {
    if (candidatePosition.freshGraduateOnly) {
      reasons.push({ label: "应届限制更严", tone: "pressure" });
    } else {
      reasons.push({ label: "应届限制更少", tone: "advantage" });
    }
  }

  if (candidatePosition.politicalStatus !== basePosition.politicalStatus) {
    if (isOpenRequirement(candidatePosition.politicalStatus) && !isOpenRequirement(basePosition.politicalStatus)) {
      reasons.push({ label: "政治面貌限制更少", tone: "advantage" });
    } else if (!isOpenRequirement(candidatePosition.politicalStatus) && isOpenRequirement(basePosition.politicalStatus)) {
      reasons.push({ label: "政治面貌要求更严", tone: "pressure" });
    }
  }

  if (Number(candidatePosition.headcount || 0) > Number(basePosition.headcount || 0)) {
    reasons.push({ label: "招录人数更多", tone: "advantage" });
  } else if (Number(candidatePosition.headcount || 0) < Number(basePosition.headcount || 0)) {
    reasons.push({ label: "招录人数更少", tone: "pressure" });
  }

  const baseTrust = basePosition.noticeTrust ? basePosition.noticeTrust.parseQualityStatus : "";
  const candidateTrust = candidatePosition.noticeTrust ? candidatePosition.noticeTrust.parseQualityStatus : "";
  if (baseTrust !== candidateTrust) {
    if (candidateTrust === "healthy" && baseTrust !== "healthy") {
      reasons.push({ label: "结构化可信度更高", tone: "advantage" });
    } else if (baseTrust === "healthy" && candidateTrust !== "healthy") {
      reasons.push({ label: "结构化可信度更低", tone: "pressure" });
    }
  }

  return reasons.slice(0, 3);
}

function buildRequirementDeltaReasons(basePosition = {}, candidatePosition = {}) {
  return buildDeltaReasonEntries(basePosition, candidatePosition).map((item) => item.label);
}

function buildMatchReasonEntries(candidatePosition = {}) {
  return (Array.isArray(candidatePosition && candidatePosition.reasons)
    ? candidatePosition.reasons
    : []
  ).slice(0, 3).map((label) => ({
    label,
    tone: "match"
  }));
}

function buildReviewReasonEntries(candidatePosition = {}) {
  return (Array.isArray(candidatePosition && candidatePosition.mismatchReasons)
    ? candidatePosition.mismatchReasons
    : []
  ).slice(0, 2).map((label) => ({
    label,
    tone: "review"
  }));
}

function buildRecommendationProfileHint(basePosition = {}, candidatePosition = {}) {
  if (!candidatePosition || !candidatePosition.eligibilityActive) {
    return "";
  }

  const baseMismatchCount = Number((basePosition && basePosition.mismatchCount) || 0);
  const candidateMismatchCount = Number(candidatePosition.mismatchCount || 0);
  const mismatchGap = candidateMismatchCount - baseMismatchCount;

  if (mismatchGap < 0) {
    return `对你更友好：少 ${Math.abs(mismatchGap)} 项待确认`;
  }
  if (mismatchGap > 0) {
    return `对你更严格：多 ${mismatchGap} 项待确认`;
  }
  if (candidateMismatchCount === 0) {
    return "和当前基准一样可报";
  }
  return `和当前基准接近：同为 ${candidateMismatchCount} 项待确认`;
}

function buildRecommendationReasonSummary(basePosition = {}, candidatePosition = {}) {
  const parts = [];
  const reasons = buildMatchReasonEntries(candidatePosition).map((item) => item.label);
  const deltaReasons = buildDeltaReasonEntries(basePosition, candidatePosition).map((item) => item.label);
  const baseTitle = (basePosition && basePosition.title) || "当前基准岗位";

  if (reasons.length) {
    parts.push(`和${baseTitle}相似：${reasons.join("、")}`);
  }
  if (deltaReasons.length) {
    parts.push(`和基准相比：${deltaReasons.join("、")}`);
  }
  if (candidatePosition && candidatePosition.majorMatchSummary) {
    parts.push(`对你的专业：${candidatePosition.majorMatchSummary}`);
  }
  if (candidatePosition && candidatePosition.mismatchReasons && candidatePosition.mismatchReasons.length) {
    parts.push(`待确认：${candidatePosition.mismatchReasons.slice(0, 2).join("、")}`);
  }

  return parts.join("；");
}

function decorateRecommendedPosition(basePosition = {}, candidatePosition = {}) {
  const nextActionSummary = candidatePosition && candidatePosition.nextAction
    ? `${candidatePosition.nextAction.label} · ${candidatePosition.nextAction.detail}`
    : String((candidatePosition && candidatePosition.nextActionSummary) || "");
  const matchReasonEntries = buildMatchReasonEntries(candidatePosition);
  const deltaReasonEntries = buildDeltaReasonEntries(basePosition, candidatePosition);
  const reviewReasonEntries = buildReviewReasonEntries(candidatePosition);

  return {
    ...candidatePosition,
    profileHint: buildRecommendationProfileHint(basePosition, candidatePosition),
    reasonSummary: buildRecommendationReasonSummary(basePosition, candidatePosition),
    nextActionSummary,
    matchReasonEntries,
    deltaReasonEntries,
    reviewReasonEntries
  };
}

module.exports = {
  buildDeltaReasonEntries,
  buildRequirementDeltaReasons,
  buildMatchReasonEntries,
  buildRecommendationProfileHint,
  buildRecommendationReasonSummary,
  buildReviewReasonEntries,
  decorateRecommendedPosition
};
