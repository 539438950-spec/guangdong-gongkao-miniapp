const TRACKING_STAGE_IDS = new Set([
  "qualification-review",
  "interview",
  "physical-test",
  "final"
]);

function getTrustStatus(notice = {}, noticeTrust = null) {
  if (noticeTrust && noticeTrust.parseQualityStatus) {
    return noticeTrust.parseQualityStatus;
  }
  return notice.hasStructuredPositions ? "healthy" : "attachment-only";
}

function buildNoticeNextAction(notice = {}, options = {}) {
  const noticeTrust = options.noticeTrust || notice.noticeTrust || null;
  const trustStatus = getTrustStatus(notice, noticeTrust);
  const noticeTimeline = Array.isArray(options.noticeTimeline) ? options.noticeTimeline : [];
  const mainNotice = noticeTimeline.find((item) => item.noticeStageId === "main") || null;
  const currentStageLabel = notice.noticeStageLabel || "公告";
  const progressHint = notice.noticeProgressHint || "";

  if (TRACKING_STAGE_IDS.has(String(notice.noticeStageId || ""))) {
    return {
      label: "适合做进度追踪",
      detail: progressHint
        ? `${progressHint}，当前更适合跟进${currentStageLabel}进度。`
        : `当前属于${currentStageLabel}阶段，更适合追踪流程进展。`,
      tags: ["进度追踪", currentStageLabel],
      tone: "neutral",
      primaryActionType: mainNotice ? "notice" : "",
      primaryActionLabel: mainNotice ? "回看主公告" : "",
      primaryNoticeId: mainNotice ? mainNotice.id : ""
    };
  }

  if (notice.hasStructuredPositions) {
    if (trustStatus === "warning") {
      return {
        label: "先看岗位并核对原表",
        detail: "岗位已可筛选，但字段仍建议结合原始岗位表复核后再做对比。",
        tags: ["可筛岗", "先复核字段"],
        tone: "warn",
        primaryActionType: "positions",
        primaryActionLabel: "去看岗位并核对",
        primaryNoticeId: ""
      };
    }

    return {
      label: "先去筛选可报岗位",
      detail: "岗位表已结构化，可先按个人条件筛选，再进入岗位对比。",
      tags: ["可筛岗", "可对比"],
      tone: "ok",
      primaryActionType: "positions",
      primaryActionLabel: "去筛选岗位",
      primaryNoticeId: ""
    };
  }

  if (trustStatus === "attachment-only") {
    return {
      label: "先看公告和附件",
      detail: "岗位表还未稳定结构化，当前先确认报名时间、附件和报考范围。",
      tags: ["仅公告", "待结构化"],
      tone: "warn",
      primaryActionType: "",
      primaryActionLabel: "",
      primaryNoticeId: ""
    };
  }

  return {
    label: "先看公告原文",
    detail: "当前以公告信息为主，岗位能力会在结构化验证通过后开放。",
    tags: ["先看原文"],
    tone: "neutral",
    primaryActionType: "",
    primaryActionLabel: "",
    primaryNoticeId: ""
  };
}

function buildNoticeNextActionSummary(notice = {}, options = {}) {
  const nextAction = buildNoticeNextAction(notice, options);
  if (!nextAction.label) {
    return "";
  }
  return nextAction.detail
    ? `${nextAction.label}：${nextAction.detail}`
    : nextAction.label;
}

module.exports = {
  buildNoticeNextAction,
  buildNoticeNextActionSummary
};
