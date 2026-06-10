function buildPositionNextAction(position = {}) {
  const mismatchReasons = Array.isArray(position.mismatchReasons) ? position.mismatchReasons : [];
  const cautionReasons = Array.isArray(position.cautionReasons) ? position.cautionReasons : [];
  const opportunityReasons = Array.isArray(position.opportunityReasons) ? position.opportunityReasons : [];
  const trustStatus = position.noticeTrust ? position.noticeTrust.parseQualityStatus : "";
  const trustSummary = position.noticeTrust ? position.noticeTrust.parseQualitySummary : "";

  if (mismatchReasons.length) {
    return {
      label: "先核对报考条件",
      detail: mismatchReasons.slice(0, 2).join("、"),
      tags: mismatchReasons.slice(0, 2),
      tone: "warn"
    };
  }

  if (trustStatus === "attachment-only") {
    return {
      label: "先回公告确认岗位表",
      detail: trustSummary || "当前只拿到公告和附件，岗位结构化结果还不稳定。",
      tags: ["仅公告未结构化"],
      tone: "warn"
    };
  }

  if (trustStatus === "warning") {
    return {
      label: "先核对原表字段",
      detail: trustSummary || "结构化结果需复核，建议先看原始岗位表。",
      tags: ["结构化需关注"],
      tone: "warn"
    };
  }

  if (cautionReasons.length) {
    return {
      label: "继续确认附加门槛",
      detail: cautionReasons.slice(0, 2).join("、"),
      tags: cautionReasons.slice(0, 2),
      tone: "neutral"
    };
  }

  return {
    label: "可优先保留",
    detail: opportunityReasons.slice(0, 2).join("、") || "当前没有明显硬门槛冲突，可继续保留。",
    tags: opportunityReasons.slice(0, 2),
    tone: "ok"
  };
}

function buildPositionNextActionSummary(position = {}) {
  const nextAction = buildPositionNextAction(position);
  if (!nextAction.label) {
    return "";
  }
  return nextAction.detail
    ? `${nextAction.label}：${nextAction.detail}`
    : nextAction.label;
}

module.exports = {
  buildPositionNextAction,
  buildPositionNextActionSummary
};
