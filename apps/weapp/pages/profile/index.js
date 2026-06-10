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

const NOTICE_STAGE_FLOW_ORDER = {
  main: 10,
  registration: 20,
  "written-exam": 30,
  "qualification-review": 40,
  interview: 50,
  "physical-test": 60,
  final: 70,
  general: 999
};

const DEFAULT_PERSONAL_PROFILE = {
  education: "",
  degree: "",
  majorKeywords: "",
  politicalStatus: "",
  serviceExperience: "",
  freshGraduateStatus: ""
};
const OPEN_COMPARE_PAGE_MODES = new Set(["review-needed", "open-existing"]);

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function getNoticeTimelineSortValue(notice) {
  return NOTICE_STAGE_FLOW_ORDER[notice.noticeStageId] || NOTICE_STAGE_FLOW_ORDER.general;
}

function compareBatchNotice(left, right) {
  const stageDiff = getNoticeTimelineSortValue(left) - getNoticeTimelineSortValue(right);
  if (stageDiff !== 0) {
    return stageDiff;
  }

  const publishedDiff = String(left.publishedAt || "").localeCompare(String(right.publishedAt || ""));
  if (publishedDiff !== 0) {
    return publishedDiff;
  }

  return String(left.title || "").localeCompare(String(right.title || ""));
}

function buildFavoriteNoticeCards(favoriteNotices = [], notices = []) {
  const noticeMap = (notices || []).reduce((result, item) => {
    result[item.id] = item;
    return result;
  }, {});

  return (favoriteNotices || []).map((item) => {
    const source = noticeMap[item.id] || item;
    const batchKey = source.noticeBatch && source.noticeBatch.key;
    const timeline = batchKey
      ? notices
        .filter((notice) => notice.noticeBatch && notice.noticeBatch.key === batchKey)
        .slice()
        .sort(compareBatchNotice)
      : [source];
    const currentIndex = timeline.findIndex((notice) => notice.id === source.id);
    const latestNotice = timeline[timeline.length - 1] || source;
    const mainNotice = timeline.find((notice) => notice.noticeStageId === "main") || source;
    const compareNotice = source.hasStructuredPositions
      ? source
      : (mainNotice && mainNotice.hasStructuredPositions ? mainNotice : source);
    const hasLaterStage = currentIndex >= 0
      ? currentIndex < timeline.length - 1
      : latestNotice.id !== source.id;
    const noticeNextAction = buildNoticeNextAction(source, {
      noticeTrust: source.noticeTrust || null,
      noticeTimeline: timeline
    });
    const noticeCompareSuggestion = compareNotice.noticeCompareSuggestion || buildEmptyNoticeCompareSuggestion();
    const compareUsesFallbackNotice = Boolean(compareNotice.id && compareNotice.id !== source.id);

    return {
      ...source,
      latestNoticeId: latestNotice.id,
      latestNoticeTitle: latestNotice.title || "",
      latestStageLabel: latestNotice.noticeStageLabel || "公告",
      latestPublishedAt: latestNotice.publishedAt || "",
      currentStageLabel: source.noticeStageLabel || "公告",
      hasLaterStage,
      progressHint: source.noticeProgressHint || (
        hasLaterStage
          ? `本批已推进到${latestNotice.noticeStageLabel || "后续节点"}`
          : "当前收藏公告已是本批最新节点"
      ),
      progressDetail: source.noticeProgressDetail || (
        hasLaterStage
          ? `最新节点：${latestNotice.title || latestNotice.noticeStageLabel || "公告"}`
          : "后续节点会在官方发布后持续补齐"
      ),
      noticeNextAction,
      noticeNextActionSummary: buildNoticeNextActionSummary(source, {
        noticeTrust: source.noticeTrust || null,
        noticeTimeline: timeline
      }),
      noticeActionTagClass: noticeNextAction.tone === "warn" ? "tag-warn" : (noticeNextAction.tone === "ok" ? "tag-active" : ""),
      noticeCompareSuggestion,
      noticeCompareTagClass: noticeCompareSuggestion.mode === "review-needed"
        ? "tag-warn"
        : (noticeCompareSuggestion.actionLabel ? "tag-active" : ""),
      compareNoticeId: compareNotice.id || "",
      compareNoticeTitle: compareNotice.title || "",
      compareNoticeArea: compareNotice.area || source.area || "",
      compareNoticeStageLabel: compareNotice.noticeStageLabel || "公告",
      compareNoticeCandidateIds: Array.isArray(compareNotice.noticeCompareCandidateIds)
        ? compareNotice.noticeCompareCandidateIds.slice()
        : [],
      compareUsesFallbackNotice,
      compareSourceSummary: compareUsesFallbackNotice
        ? `岗位对比将回到${compareNotice.noticeStageLabel || "主公告"}：${compareNotice.title || "当前公告"}`
        : ""
    };
  });
}

function buildDraftHealthState(mode, baseUrl, presetName) {
  if (mode === "local") {
    return {
      status: "本地模式",
      message: "当前草稿将切回小程序内置 store，保存后立即生效。"
    };
  }

  if (!baseUrl) {
    return {
      status: "待完善",
      message: "远端模式还没有填写 API Base URL，保存前请先补全地址。"
    };
  }

  if (presetName) {
    return {
      status: "待保存",
      message: `已套用“${presetName}”预设，保存后建议立刻做一次连通性检测。`
    };
  }

  return {
    status: "待保存",
    message: "远端地址已修改但尚未保存，保存后可继续做健康检查。"
  };
}

function inferPresetId(presets, mode, baseUrl) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const matched = (presets || []).find(
    (item) => item.mode === mode && normalizeBaseUrl(item.baseUrl) === normalizedBaseUrl
  );
  return matched ? matched.id : "";
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
  return parts.length ? parts.join(" · ") : "尚未填写个人报考条件，岗位对比暂时无法自动标记不匹配项。";
}

function mapCompareSourceEntryLabel(entry) {
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

function buildCompareContextText(context = {}, fallbackLabel = "") {
  if (!context || typeof context !== "object") {
    return "";
  }

  const parts = [];
  const sourceLabel = String(context.sourceLabel || "").trim();
  const entryLabel = mapCompareSourceEntryLabel(context.sourceEntry);
  const sourceName = String(context.sourceName || "").trim();
  const actionLabel = mapCompareActionLabel(context.action);

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

  return parts.filter(Boolean).join(" · ");
}

function buildCompareSummaryHeadline(compareSummary = {}) {
  if (!compareSummary || !compareSummary.positionCount) {
    return "";
  }

  const parts = [`${compareSummary.positionCount} 个岗位`];
  if (compareSummary.active) {
    parts.push(`可报 ${Number(compareSummary.matchedCount || 0)} 个`);
    parts.push(`待确认 ${Number(compareSummary.blockedCount || 0)} 个`);
  }
  if (Number(compareSummary.cautionCount || 0) > 0) {
    parts.push(`偏谨慎 ${Number(compareSummary.cautionCount || 0)} 个`);
  }
  return parts.join(" · ");
}

function buildCompareSummaryFocus(compareSummary = {}) {
  if (!compareSummary) {
    return {
      label: "",
      summary: ""
    };
  }

  if (compareSummary.active && compareSummary.bestFitTitle) {
    return {
      label: "最匹配岗位",
      summary: `${compareSummary.bestFitTitle} · ${compareSummary.bestFitLabel}${compareSummary.bestFitReason ? ` · ${compareSummary.bestFitReason}` : ""}`
    };
  }

  if (compareSummary.topTitle) {
    return {
      label: "优先岗位",
      summary: `${compareSummary.topTitle} · ${compareSummary.topLabel}${compareSummary.topReason ? ` · ${compareSummary.topReason}` : ""}`
    };
  }

  return {
    label: "",
    summary: ""
  };
}

function formatCompareUpdatedAt(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text.replace("T", " ").slice(0, 16);
}

function buildCompareGroupManagementState(group = {}, totalGroupCount = 0) {
  const positionCount = Number(group.positionCount || 0);
  const compareSummary = group.compareSummary || {};
  const matchedCount = Number(compareSummary.matchedCount || 0);
  const blockedCount = Number(compareSummary.blockedCount || 0);
  const cautionCount = Number(compareSummary.cautionCount || 0);
  const capacityLimit = 4;
  const remainingSlots = Math.max(0, capacityLimit - positionCount);
  const atGroupLimit = totalGroupCount >= 20;
  const managementTags = [
    {
      label: `${positionCount}/${capacityLimit} 岗位`,
      tone: positionCount === 0 || positionCount >= capacityLimit ? "warn" : "active"
    }
  ];

  if (compareSummary.active) {
    if (matchedCount > 0) {
      managementTags.push({
        label: `可报 ${matchedCount}`,
        tone: "active"
      });
    }
    if (blockedCount > 0) {
      managementTags.push({
        label: `待确认 ${blockedCount}`,
        tone: "warn"
      });
    }
    if (cautionCount > 0) {
      managementTags.push({
        label: `偏谨慎 ${cautionCount}`,
        tone: "warn"
      });
    }
  }
  if (group.isPinned) {
    managementTags.push({
      label: "已置顶",
      tone: "active"
    });
  }

  let managementLabel = "";
  let managementSummary = "";

  if (positionCount === 0) {
    managementLabel = "优先补位或删除";
    managementSummary = "当前还是空方案，后续命中岗位时会先占用这组，建议尽快补岗位或删除。";
  } else if (positionCount >= capacityLimit && atGroupLimit) {
    managementLabel = "优先整理容量";
    managementSummary = "当前已满 4/4 且方案数已到上限，后续新增岗位会先进入替换建议。";
  } else if (blockedCount > 0) {
    managementLabel = "优先核对可报性";
    managementSummary = `当前有 ${blockedCount} 个岗位待确认，建议先回到对比页核对学历、专业和基层经历。`;
  } else if (positionCount >= capacityLimit) {
    managementLabel = "容量已满";
    managementSummary = "当前已满 4/4，如要继续扩展同考试类型岗位，需要新建方案或替换现有岗位。";
  } else {
    managementLabel = "可继续复用";
    managementSummary = `还能再加入 ${remainingSlots} 个岗位，适合承接同考试类型的新命中或推荐岗位。`;
  }

  if (blockedCount > 0 && remainingSlots > 0 && positionCount > 0 && positionCount < capacityLimit) {
    managementSummary += ` 当前仍有 ${remainingSlots} 个空位可补充。`;
  }

  return {
    managementLabel,
    managementSummary,
    managementTags
  };
}

function buildCompareGroupCards(compareGroups = []) {
  const cards = (compareGroups || []).map((item) => {
    const originContext = item.originContext || null;
    const lastActionContext = item.lastActionContext || null;
    const positionCount = Array.isArray(item.positionIds) ? item.positionIds.length : 0;
    const originSummary = buildCompareContextText(originContext, "手动建组");
    const lastActionSummary = buildCompareContextText(
      lastActionContext,
      originSummary ? "沿用原方案" : "暂无更新记录"
    );
    const updatedAt = formatCompareUpdatedAt(
      (lastActionContext && lastActionContext.actedAt) ||
      (originContext && originContext.actedAt) ||
      ""
    );
    const compareSummary = item.compareSummary || null;
    const compareSummaryFocus = buildCompareSummaryFocus(compareSummary);

    return {
      ...item,
      positionCount,
      compareSummary,
      compareSummaryHeadline: buildCompareSummaryHeadline(compareSummary),
      compareSummaryFocusLabel: compareSummaryFocus.label,
      compareSummaryFocus: compareSummaryFocus.summary,
      originSummary,
      lastActionSummary,
      updatedAt,
      isPinned: Boolean(item.isPinned),
      lastUsedAt: String(item.lastUsedAt || "").trim(),
      pinnedAt: String(item.pinnedAt || "").trim(),
      sortTimestamp: Date.parse(
        String(item.lastUsedAt || "").trim() ||
        (lastActionContext && lastActionContext.actedAt) ||
        (originContext && originContext.actedAt) ||
        ""
      ) || 0
    };
  });

  return cards.map((item) => ({
    ...item,
    ...buildCompareGroupManagementState(item, cards.length)
  })).sort((left, right) => {
    if (Boolean(left.isPinned) !== Boolean(right.isPinned)) {
      return left.isPinned ? -1 : 1;
    }
    const pinnedGap = (Date.parse(String(right.pinnedAt || "")) || 0) - (Date.parse(String(left.pinnedAt || "")) || 0);
    if (pinnedGap !== 0) {
      return pinnedGap;
    }
    const timeGap = Number(right.sortTimestamp || 0) - Number(left.sortTimestamp || 0);
    if (timeGap !== 0) {
      return timeGap;
    }
    return String(left.name || "").localeCompare(String(right.name || ""));
  });
}

function mapCompareExamTypeLabel(examType) {
  const labels = {
    "guangdong-provincial": "广东省考",
    national: "国考"
  };
  return labels[String(examType || "").trim()] || "其他考试";
}

function buildCompareGroupSections(compareGroups = []) {
  const sectionMap = (compareGroups || []).reduce((result, item) => {
    const examType = String(item.examType || "").trim() || "unknown";
    if (!result[examType]) {
      result[examType] = {
        examType,
        title: mapCompareExamTypeLabel(examType),
        items: []
      };
    }
    result[examType].items.push(item);
    return result;
  }, {});

  return Object.values(sectionMap)
    .map((section) => ({
      ...section,
      summary: buildCompareGroupSectionSummary(section.items),
      items: section.items.slice().sort((left, right) => {
        if (Boolean(left.isPinned) !== Boolean(right.isPinned)) {
          return left.isPinned ? -1 : 1;
        }
        const pinnedGap = (Date.parse(String(right.pinnedAt || "")) || 0) - (Date.parse(String(left.pinnedAt || "")) || 0);
        if (pinnedGap !== 0) {
          return pinnedGap;
        }
        const timeGap = Number(right.sortTimestamp || 0) - Number(left.sortTimestamp || 0);
        if (timeGap !== 0) {
          return timeGap;
        }
        return String(left.name || "").localeCompare(String(right.name || ""));
      })
    }))
    .sort((left, right) => {
      const leftPinned = Boolean(left.items[0] && left.items[0].isPinned);
      const rightPinned = Boolean(right.items[0] && right.items[0].isPinned);
      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }
      const leftPinnedAt = Date.parse(String((left.items[0] && left.items[0].pinnedAt) || "")) || 0;
      const rightPinnedAt = Date.parse(String((right.items[0] && right.items[0].pinnedAt) || "")) || 0;
      if (rightPinnedAt !== leftPinnedAt) {
        return rightPinnedAt - leftPinnedAt;
      }
      const leftTime = Number((left.items[0] && left.items[0].sortTimestamp) || 0);
      const rightTime = Number((right.items[0] && right.items[0].sortTimestamp) || 0);
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }
      return String(left.title || "").localeCompare(String(right.title || ""));
    });
}

function buildCompareGroupSectionSummary(items = []) {
  const reusableCount = items.filter((item) => item.positionCount > 0 && item.positionCount < 4).length;
  const fullCount = items.filter((item) => item.positionCount >= 4).length;
  const emptyCount = items.filter((item) => item.positionCount === 0).length;
  const blockedCount = items.filter((item) => Number((item.compareSummary || {}).blockedCount || 0) > 0).length;
  const parts = [];

  if (reusableCount > 0) {
    parts.push(`可复用 ${reusableCount}`);
  }
  if (fullCount > 0) {
    parts.push(`已满 ${fullCount}`);
  }
  if (emptyCount > 0) {
    parts.push(`空方案 ${emptyCount}`);
  }
  if (blockedCount > 0) {
    parts.push(`待确认 ${blockedCount}`);
  }

  return parts.join(" · ");
}

function buildSavedFilterCards(savedFilters = []) {
  return (savedFilters || []).map((item) => {
    const currentMatchCount = Number(item.currentMatchCount || 0);
    const previewPosition = item.currentPositionPreview && item.currentPositionPreview.length
      ? item.currentPositionPreview[0]
      : null;
    const managementTags = [
      {
        label: `命中 ${currentMatchCount}`,
        tone: currentMatchCount > 0 ? "active" : "warn"
      }
    ];
    let managementLabel = "";
    let managementSummary = "";

    if (currentMatchCount <= 0) {
      managementLabel = "建议调整筛选条件";
      managementSummary = "当前没有命中岗位，建议回到岗位页放宽地区、学历或专业条件。";
    } else if (currentMatchCount === 1) {
      managementLabel = "适合直接核对";
      managementSummary = `当前只命中 1 个岗位${previewPosition ? `：${previewPosition.title}` : ""}，可以直接核对报考条件或加入对比。`;
      managementTags.push({
        label: "直接核对",
        tone: "active"
      });
    } else if (currentMatchCount <= 4) {
      managementLabel = "适合直接进对比";
      managementSummary = `当前命中 ${currentMatchCount} 个岗位，已经可以直接带入对比，再结合个人条件做取舍。`;
      managementTags.push({
        label: "可直接对比",
        tone: "active"
      });
    } else {
      managementLabel = "建议先缩小范围";
      managementSummary = `当前命中 ${currentMatchCount} 个岗位，建议先回到岗位页继续收窄条件，再进入对比更高效。`;
      managementTags.push({
        label: "先缩小范围",
        tone: "warn"
      });
    }

    return {
      ...item,
      managementLabel,
      managementSummary,
      managementTags
    };
  });
}

function buildSubscriptionCards(subscriptions = []) {
  return (subscriptions || []).map((item) => {
    const currentMatchCount = Number(item.currentMatchCount || 0);
    const newMatchCount = Number(item.newMatchCount || 0);
    const compareReady = Boolean(item.compareReady);
    const managementTags = [];

    if (currentMatchCount > 0) {
      managementTags.push({
        label: `命中 ${currentMatchCount}`,
        tone: "active"
      });
    }
    if (newMatchCount > 0) {
      managementTags.push({
        label: `新增 ${newMatchCount}`,
        tone: "active"
      });
    } else {
      managementTags.push({
        label: "当前无新增",
        tone: "warn"
      });
    }
    if (compareReady) {
      managementTags.push({
        label: "可直接对比",
        tone: "active"
      });
    } else if (item.compareHint) {
      managementTags.push({
        label: "需整理方案",
        tone: "warn"
      });
    }

    let managementLabel = "";
    let managementSummary = "";

    if (newMatchCount > 0 && compareReady) {
      managementLabel = "优先处理新增命中";
      managementSummary = item.decisionSummary || `当前有 ${newMatchCount} 个新增岗位，建议优先处理。`;
    } else if (newMatchCount > 0) {
      managementLabel = "先回看新增命中";
      managementSummary = item.compareHint || item.nextActionSummary || `当前有 ${newMatchCount} 个新增岗位，建议先回看。`;
    } else if (currentMatchCount > 0) {
      managementLabel = "当前无新增";
      managementSummary = `订阅规则仍命中 ${currentMatchCount} 个岗位，可以按需回到岗位页复查历史结果。`;
    } else {
      managementLabel = "建议调整订阅条件";
      managementSummary = "当前没有命中岗位，建议回到岗位页调整地区、专业或学历条件。";
    }

    return {
      ...item,
      managementLabel,
      managementSummary,
      managementTags
    };
  });
}

function buildCompareExamTypeOptions(notices = [], compareGroups = []) {
  const knownOrder = ["guangdong-provincial", "national"];
  const seen = new Set();
  const options = [];

  const pushExamType = (examType) => {
    const normalized = String(examType || "").trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    options.push({
      examType: normalized,
      label: mapCompareExamTypeLabel(normalized)
    });
  };

  knownOrder.forEach(pushExamType);
  (notices || []).forEach((item) => pushExamType(item && item.examType));
  (compareGroups || []).forEach((item) => pushExamType(item && item.examType));

  return options;
}

function buildNewCompareGroupName(examType) {
  return `${mapCompareExamTypeLabel(examType)}方案`;
}

function buildCompareHealthSummary(stats = {}) {
  const compareGroupCount = Number(stats.compareGroupCount || 0);
  const compareGroupLimit = Number(stats.compareGroupLimit || 20);
  const reusableCompareGroupCount = Number(stats.reusableCompareGroupCount || 0);
  const reviewNeededCompareGroupCount = Number(stats.reviewNeededCompareGroupCount || 0);
  const pinnedCompareGroupCount = Number(stats.pinnedCompareGroupCount || 0);
  const remainingCompareGroupCount = Math.max(0, Number(stats.remainingCompareGroupCount || 0));
  const emptyCompareGroupCount = Number(stats.emptyCompareGroupCount || 0);
  const fullCompareGroupCount = Number(stats.fullCompareGroupCount || 0);

  if (!compareGroupCount) {
    return "还没有保存的对比方案，建议先按广东省考或国考各建一组，后续岗位命中可直接复用。";
  }

  const parts = [`已保存 ${compareGroupCount}/${compareGroupLimit} 组方案`];
  if (reusableCompareGroupCount > 0) {
    parts.push(`${reusableCompareGroupCount} 组还能继续加岗位`);
  }
  if (pinnedCompareGroupCount > 0) {
    parts.push(`${pinnedCompareGroupCount} 组已置顶`);
  }
  if (reviewNeededCompareGroupCount > 0) {
    parts.push(`${reviewNeededCompareGroupCount} 组建议整理`);
  } else if (remainingCompareGroupCount > 0) {
    parts.push(`还能新建 ${remainingCompareGroupCount} 组`);
  }

  let detail = "";
  if (emptyCompareGroupCount > 0) {
    detail = `${emptyCompareGroupCount} 个空方案建议优先补岗位或删除，避免后续推荐命中时还要先清理。`;
  } else if (reviewNeededCompareGroupCount > 0 && fullCompareGroupCount > 0) {
    detail = `当前已接近方案上限，满额方案有 ${fullCompareGroupCount} 组，后续新增岗位前建议先整理。`;
  } else if (reusableCompareGroupCount > 0) {
    detail = "当前还有可复用方案，订阅命中或岗位推荐可以直接加入已有对比。";
  } else {
    detail = "当前方案结构稳定，后续新增岗位时可继续按考试类型新建分组。";
  }

  return `${parts.join(" · ")}。${detail}`;
}

function buildCompareHealthTags(stats = {}) {
  const tags = [];
  const reusableCompareGroupCount = Number(stats.reusableCompareGroupCount || 0);
  const reviewNeededCompareGroupCount = Number(stats.reviewNeededCompareGroupCount || 0);
  const pinnedCompareGroupCount = Number(stats.pinnedCompareGroupCount || 0);
  const remainingCompareGroupCount = Math.max(0, Number(stats.remainingCompareGroupCount || 0));

  if (reusableCompareGroupCount > 0) {
    tags.push(`可复用 ${reusableCompareGroupCount}`);
  }
  if (reviewNeededCompareGroupCount > 0) {
    tags.push(`待整理 ${reviewNeededCompareGroupCount}`);
  }
  if (pinnedCompareGroupCount > 0) {
    tags.push(`已置顶 ${pinnedCompareGroupCount}`);
  }
  if (remainingCompareGroupCount > 0) {
    tags.push(`剩余 ${remainingCompareGroupCount}`);
  }

  return tags;
}

function buildCompareGroupHealth(stats = {}) {
  return {
    summary: buildCompareHealthSummary(stats),
    tags: buildCompareHealthTags(stats)
  };
}

function deriveCompareGroupHealthStats(compareGroups = []) {
  const groups = compareGroups || [];
  const compareGroupCount = groups.length;
  const pinnedCompareGroupCount = groups.filter((item) => item.isPinned).length;
  const fullCompareGroupCount = groups.filter((item) => item.positionCount >= 4).length;
  const emptyCompareGroupCount = groups.filter((item) => item.positionCount === 0).length;
  const reusableCompareGroupCount = groups.filter(
    (item) => item.positionCount > 0 && item.positionCount < 4
  ).length;
  const activeCompareGroupCount = groups.filter(
    (item) => item.lastUsedAt || item.lastActionContext || item.originContext
  ).length;
  const remainingCompareGroupCount = Math.max(0, 20 - compareGroupCount);

  return {
    compareGroupCount,
    compareGroupLimit: 20,
    compareGroupCapacityLimit: 4,
    pinnedCompareGroupCount,
    fullCompareGroupCount,
    emptyCompareGroupCount,
    reusableCompareGroupCount,
    activeCompareGroupCount,
    remainingCompareGroupCount,
    reviewNeededCompareGroupCount: emptyCompareGroupCount + (
      compareGroupCount >= 20 ? fullCompareGroupCount : 0
    )
  };
}

function updateCompareGroupStat(stats = [], compareGroupCount = 0) {
  return (stats || []).map((item) => (
    item.label === "对比组"
      ? { ...item, value: compareGroupCount }
      : item
  ));
}

Page({
  data: {
    stats: [
      { label: "收藏", value: 0 },
      { label: "订阅", value: 0 },
      { label: "对比组", value: 0 }
    ],
    compareGroups: [],
    compareGroupSections: [],
    compareGroupExamTypeOptions: [],
    compareGroupHealth: {
      summary: "",
      tags: []
    },
    savedFilters: [],
    subscriptions: [],
    favoriteNotices: [],
    browsingHistory: [],
    personalProfile: { ...DEFAULT_PERSONAL_PROFILE },
    personalProfileSummary: "",
    apiConfig: {
      mode: "local",
      baseUrl: "",
      usingRemote: false,
      healthUrl: "",
      activePresetId: ""
    },
    connectionSummary: {
      modeLabel: "本地 Store",
      endpointLabel: "不经过远端 API",
      healthLabel: "无需检测",
      presetLabel: "本地模式",
      sourceLabel: "项目默认",
      hint: ""
    },
    connectionDiagnostics: {
      status: "idle",
      statusLabel: "尚未检测",
      scopeLabel: "无记录",
      baseUrl: "",
      checkedAt: "",
      message: "",
      userStateFile: "",
      isForCurrentConfig: false
    },
    connectionPresets: [],
    selectedPresetId: "local-store",
    apiBaseUrlDraft: "",
    apiHealthStatus: "",
    apiHealthMessage: "",
    editingCompareGroupId: "",
    compareGroupNameDraft: ""
  },

  onShow() {
    Promise.all([
      api.getDashboard(),
      Promise.resolve(api.getRuntimeConfig())
    ]).then(([payload, apiConfig]) => {
      const presets = api.listConnectionPresets();
      const summary = api.getConnectionSummary(apiConfig);
      const diagnostics = api.getConnectionDiagnostics(apiConfig);
      const compareGroups = buildCompareGroupCards(payload.compareGroups);
      const compareGroupExamTypeOptions = buildCompareExamTypeOptions(payload.notices, compareGroups);
      const compareGroupHealth = buildCompareGroupHealth({
        ...payload.stats,
        ...deriveCompareGroupHealthStats(compareGroups)
      });

      this.setData({
        stats: [
          { label: "收藏", value: payload.stats.favoriteCount },
          { label: "订阅", value: payload.stats.subscriptionCount },
          { label: "对比组", value: payload.stats.compareGroupCount }
        ],
        compareGroups,
        compareGroupSections: buildCompareGroupSections(compareGroups),
        compareGroupExamTypeOptions,
        compareGroupHealth,
        savedFilters: buildSavedFilterCards(payload.savedFilters),
        subscriptions: buildSubscriptionCards(payload.subscriptions),
        favoriteNotices: buildFavoriteNoticeCards(payload.favoriteNotices, payload.notices),
        browsingHistory: payload.browsingHistory,
        personalProfile: normalizePersonalProfile(payload.personalProfile || DEFAULT_PERSONAL_PROFILE),
        personalProfileSummary: buildPersonalProfileSummary(payload.personalProfile || DEFAULT_PERSONAL_PROFILE),
        apiConfig,
        connectionSummary: summary,
        connectionDiagnostics: diagnostics,
        connectionPresets: presets,
        selectedPresetId: apiConfig.activePresetId || inferPresetId(presets, apiConfig.mode, apiConfig.baseUrl),
        apiBaseUrlDraft: apiConfig.baseUrl,
        apiHealthStatus: apiConfig.mode === "local" ? "本地模式" : "待检测",
        apiHealthMessage: apiConfig.mode === "local"
          ? "当前直接读取小程序内置 store 数据。"
          : "当前生效连接已保存，建议继续执行一次连通性检测。"
      });
    });
  },

  onPersonalProfileInput(event) {
    const { field } = event.currentTarget.dataset;
    if (!field) {
      return;
    }
    const personalProfile = normalizePersonalProfile({
      ...this.data.personalProfile,
      [field]: event.detail.value
    });
    this.setData({
      personalProfile,
      personalProfileSummary: buildPersonalProfileSummary(personalProfile)
    });
  },

  toggleServiceExperience(event) {
    const { value } = event.currentTarget.dataset;
    const nextValue = this.data.personalProfile.serviceExperience === value ? "" : value;
    const personalProfile = normalizePersonalProfile({
      ...this.data.personalProfile,
      serviceExperience: nextValue
    });
    this.setData({
      personalProfile,
      personalProfileSummary: buildPersonalProfileSummary(personalProfile)
    });
  },

  toggleFreshGraduateStatus(event) {
    const { value } = event.currentTarget.dataset;
    const nextValue = this.data.personalProfile.freshGraduateStatus === value ? "" : value;
    const personalProfile = normalizePersonalProfile({
      ...this.data.personalProfile,
      freshGraduateStatus: nextValue
    });
    this.setData({
      personalProfile,
      personalProfileSummary: buildPersonalProfileSummary(personalProfile)
    });
  },

  savePersonalProfile() {
    api.savePersonalProfile(this.data.personalProfile).then((payload) => {
      const personalProfile = normalizePersonalProfile(payload.profile || DEFAULT_PERSONAL_PROFILE);
      this.setData({
        personalProfile,
        personalProfileSummary: buildPersonalProfileSummary(personalProfile)
      });
      wx.showToast({ title: "已保存个人条件", icon: "success" });
    });
  },

  useLocalApi() {
    const nextMode = "local";
    const nextBaseUrl = this.data.apiBaseUrlDraft;
    const healthState = buildDraftHealthState(nextMode, nextBaseUrl, "本地 Store");

    this.setData({
      apiConfig: {
        ...this.data.apiConfig,
        mode: nextMode
      },
      selectedPresetId: inferPresetId(this.data.connectionPresets, nextMode, nextBaseUrl) || "local-store",
      apiHealthStatus: healthState.status,
      apiHealthMessage: healthState.message
    });
  },

  useRemoteApi() {
    const nextMode = "remote";
    const nextBaseUrl = this.data.apiBaseUrlDraft;
    const matchedPresetId = inferPresetId(this.data.connectionPresets, nextMode, nextBaseUrl);
    const matchedPreset = matchedPresetId ? api.getConnectionPreset(matchedPresetId) : null;
    const healthState = buildDraftHealthState(
      nextMode,
      nextBaseUrl,
      matchedPreset ? matchedPreset.name : ""
    );

    this.setData({
      apiConfig: {
        ...this.data.apiConfig,
        mode: nextMode
      },
      selectedPresetId: matchedPresetId,
      apiHealthStatus: healthState.status,
      apiHealthMessage: healthState.message
    });
  },

  applyConnectionPreset(event) {
    const presetId = event.currentTarget.dataset.id;
    const preset = api.getConnectionPreset(presetId);
    if (!preset) {
      return;
    }

    const healthState = buildDraftHealthState(preset.mode, preset.baseUrl, preset.name);
    this.setData({
      apiConfig: {
        ...this.data.apiConfig,
        mode: preset.mode
      },
      apiBaseUrlDraft: preset.baseUrl,
      selectedPresetId: preset.id,
      apiHealthStatus: healthState.status,
      apiHealthMessage: healthState.message
    });
  },

  onApiBaseUrlInput(event) {
    const nextBaseUrl = event.detail.value;
    const nextMode = this.data.apiConfig.mode;
    const matchedPresetId = inferPresetId(this.data.connectionPresets, nextMode, nextBaseUrl);
    const matchedPreset = matchedPresetId ? api.getConnectionPreset(matchedPresetId) : null;
    const healthState = buildDraftHealthState(
      nextMode,
      nextBaseUrl,
      matchedPreset ? matchedPreset.name : ""
    );

    this.setData({
      apiBaseUrlDraft: nextBaseUrl,
      selectedPresetId: matchedPresetId,
      apiHealthStatus: healthState.status,
      apiHealthMessage: healthState.message
    });
  },

  saveApiConfig() {
    const nextMode = this.data.apiConfig.mode;
    const nextBaseUrl = this.data.apiBaseUrlDraft;

    api.saveRuntimeConfig({
      mode: nextMode,
      baseUrl: nextBaseUrl
    }).then((apiConfig) => {
      const summary = api.getConnectionSummary(apiConfig);
      const diagnostics = api.getConnectionDiagnostics(apiConfig);
      this.setData({
        apiConfig,
        connectionSummary: summary,
        connectionDiagnostics: diagnostics,
        selectedPresetId: apiConfig.activePresetId || inferPresetId(this.data.connectionPresets, apiConfig.mode, apiConfig.baseUrl),
        apiBaseUrlDraft: apiConfig.baseUrl,
        apiHealthStatus: apiConfig.mode === "local" ? "本地模式" : "待检测",
        apiHealthMessage: apiConfig.mode === "local"
          ? "已切回小程序内置 store。"
          : "远端配置已保存，建议立刻执行一次连通性检测。"
      });
      wx.showToast({ title: "已保存连接配置", icon: "success" });
    }).catch((error) => {
      this.setData({
        apiHealthStatus: "配置无效",
        apiHealthMessage: error.message
      });
      wx.showToast({ title: "配置无效", icon: "none" });
    });
  },

  resetApiConfig() {
    api.resetRuntimeConfig().then((apiConfig) => {
      const summary = api.getConnectionSummary(apiConfig);
      const diagnostics = api.getConnectionDiagnostics(apiConfig);
      this.setData({
        apiConfig,
        connectionSummary: summary,
        connectionDiagnostics: diagnostics,
        selectedPresetId: apiConfig.activePresetId || inferPresetId(this.data.connectionPresets, apiConfig.mode, apiConfig.baseUrl),
        apiBaseUrlDraft: apiConfig.baseUrl,
        apiHealthStatus: apiConfig.mode === "local" ? "本地模式" : "待检测",
        apiHealthMessage: apiConfig.mode === "local"
          ? "已恢复到项目默认本地连接。"
          : "已恢复到项目默认远端连接，建议立刻执行一次连通性检测。"
      });
      wx.showToast({ title: "已重置", icon: "success" });
    });
  },

  checkApiHealth() {
    if (this.data.apiConfig.mode !== "remote") {
      this.setData({
        apiHealthStatus: "本地模式",
        apiHealthMessage: "本地 Store 模式不需要做远端连接检测。"
      });
      return;
    }

    api.testRemoteHealth(this.data.apiBaseUrlDraft).then((result) => {
      this.setData({
        apiHealthStatus: "连接成功",
        apiHealthMessage: `健康检查通过：${result.baseUrl}`,
        connectionDiagnostics: result.diagnostics || api.getConnectionDiagnostics()
      });
      wx.showToast({ title: "连接正常", icon: "success" });
    }).catch((error) => {
      this.setData({
        apiHealthStatus: "连接失败",
        apiHealthMessage: error.message,
        connectionDiagnostics: error.diagnostics || api.getConnectionDiagnostics()
      });
      wx.showToast({ title: "连接失败", icon: "none" });
    });
  },

  openSavedFilter(event) {
    const { noticeId, id } = event.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/positions/index?noticeId=${noticeId}&savedFilterId=${id}` });
  },

  quickCompareSavedFilter(event) {
    const { id } = event.currentTarget.dataset;
    api.getSavedFilter(id).then((savedFilter) => {
      if (!savedFilter) {
        wx.showToast({ title: "筛选方案不存在", icon: "none" });
        return null;
      }

      return executeQuickCompare(api, savedFilter, {
        compareContext: {
          sourceType: "saved-filter",
          sourceLabel: "筛选方案",
          sourceEntry: "profile",
          sourceName: savedFilter.name || "",
          noticeId: savedFilter.noticeId || "",
          noticeTitle: savedFilter.noticeTitle || ""
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

      wx.showToast({
        title: buildQuickCompareToastTitle(result),
        icon: "success"
      });
      wx.navigateTo({ url: `/pages/compare/index?groupId=${result.group.id}` });
    }).catch((error) => {
      wx.showToast({ title: error.message, icon: "none" });
    });
  },

  deleteSavedFilter(event) {
    const { id } = event.currentTarget.dataset;
    api.deleteSavedFilter(id).then(() => {
      this.onShow();
    });
  },

  openSubscription(event) {
    const { noticeId, id } = event.currentTarget.dataset;
    api.getSubscription(id).then((subscription) => {
      const targetUrl = buildSubscriptionPositionsUrl(
        noticeId,
        id,
        subscription && Array.isArray(subscription.newPositionIds) ? subscription.newPositionIds : []
      );
      return api.markSubscriptionSeen(id).then(() => {
        wx.navigateTo({ url: targetUrl });
      });
    });
  },

  quickCompareSubscription(event) {
    const { id } = event.currentTarget.dataset;
    let subscriptionId = id;
    api.getSubscription(id).then((subscription) => {
      if (!subscription) {
        wx.showToast({ title: "订阅方案不存在", icon: "none" });
        return null;
      }
      subscriptionId = subscription.id || id;

      return executeQuickCompare(api, subscription, {
        preferNew: true,
        compareContext: {
          sourceType: "subscription",
          sourceLabel: "订阅命中",
          sourceEntry: "profile",
          sourceName: subscription.name || "",
          noticeId: subscription.noticeId || "",
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

      api.markSubscriptionSeen(subscriptionId).then(() => {
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

  deleteSubscription(event) {
    const { id } = event.currentTarget.dataset;
    api.deleteSubscription(id).then(() => {
      this.onShow();
    });
  },

  createCompareGroupByExamType(event) {
    const { examType } = event.currentTarget.dataset;
    const normalizedExamType = String(examType || "").trim();
    if (!normalizedExamType) {
      wx.showToast({ title: "请选择考试类型", icon: "none" });
      return;
    }

    const name = buildNewCompareGroupName(normalizedExamType);
    const latestKnownTimestamp = Math.max(
      Date.now(),
      ...(this.data.compareGroups || []).map((item) => Number(item.sortTimestamp || 0) + 1000)
    );
    const originContext = {
      sourceType: "profile",
      sourceLabel: "手动建组",
      sourceEntry: "profile",
      sourceName: name,
      action: "create",
      actedAt: new Date(latestKnownTimestamp).toISOString(),
      positionIds: [],
      addedCount: 0
    };

    api.createCompareGroup(name, normalizedExamType, {
      originContext,
      lastActionContext: originContext
    }).then((group) => {
      const nextGroups = buildCompareGroupCards([group].concat(this.data.compareGroups || []));
      this.setData({
        compareGroups: nextGroups,
        compareGroupSections: buildCompareGroupSections(nextGroups),
        compareGroupExamTypeOptions: buildCompareExamTypeOptions([], nextGroups),
        stats: updateCompareGroupStat(this.data.stats, nextGroups.length),
        compareGroupHealth: buildCompareGroupHealth(deriveCompareGroupHealthStats(nextGroups)),
        editingCompareGroupId: group.id,
        compareGroupNameDraft: group.name || name
      });
      wx.showToast({ title: "已新建方案", icon: "success" });
    }).catch((error) => {
      wx.showToast({ title: error.message, icon: "none" });
    });
  },

  startRenameCompareGroup(event) {
    const { id } = event.currentTarget.dataset;
    const target = this.data.compareGroups.find((item) => item.id === id);
    if (!target) {
      return;
    }
    this.setData({
      editingCompareGroupId: id,
      compareGroupNameDraft: target.name || ""
    });
  },

  onCompareGroupNameInput(event) {
    this.setData({
      compareGroupNameDraft: String((event.detail && event.detail.value) || "")
    });
  },

  cancelRenameCompareGroup() {
    this.setData({
      editingCompareGroupId: "",
      compareGroupNameDraft: ""
    });
  },

  toggleCompareGroupPinned(event) {
    const { id } = event.currentTarget.dataset;
    const target = this.data.compareGroups.find((item) => item.id === id);
    if (!target) {
      return;
    }

    const nextPinned = !target.isPinned;
    api.setCompareGroupPinned(id, nextPinned).then((group) => {
      const nextGroups = buildCompareGroupCards(this.data.compareGroups.map((item) => (
        item.id === id ? { ...item, ...group } : item
      )));
      this.setData({
        compareGroups: nextGroups,
        compareGroupSections: buildCompareGroupSections(nextGroups),
        compareGroupHealth: buildCompareGroupHealth(deriveCompareGroupHealthStats(nextGroups))
      });
      wx.showToast({
        title: nextPinned ? "已置顶方案" : "已取消置顶",
        icon: "success"
      });
    }).catch((error) => {
      wx.showToast({ title: error.message, icon: "none" });
    });
  },

  saveCompareGroupName() {
    const { editingCompareGroupId, compareGroupNameDraft, compareGroups } = this.data;
    if (!editingCompareGroupId) {
      return;
    }

    const nextName = compareGroupNameDraft.trim();
    if (!nextName) {
      wx.showToast({ title: "请输入方案名称", icon: "none" });
      return;
    }

    api.renameCompareGroup(editingCompareGroupId, nextName).then((group) => {
      const nextGroups = buildCompareGroupCards(compareGroups.map((item) => (
        item.id === editingCompareGroupId
          ? { ...item, ...group, name: group.name || nextName }
          : item
      )));
      this.setData({
        compareGroups: nextGroups,
        compareGroupSections: buildCompareGroupSections(nextGroups),
        compareGroupHealth: buildCompareGroupHealth(deriveCompareGroupHealthStats(nextGroups)),
        editingCompareGroupId: "",
        compareGroupNameDraft: ""
      });
      wx.showToast({ title: "已更新名称", icon: "success" });
    }).catch((error) => {
      wx.showToast({ title: error.message, icon: "none" });
    });
  },

  deleteCompareGroup(event) {
    const { id } = event.currentTarget.dataset;
    if (!id) {
      return;
    }

    api.deleteCompareGroup(id).then((groups) => {
      const nextGroups = buildCompareGroupCards(groups || []);
      this.setData({
        compareGroups: nextGroups,
        compareGroupSections: buildCompareGroupSections(nextGroups),
        stats: updateCompareGroupStat(this.data.stats, nextGroups.length),
        compareGroupHealth: buildCompareGroupHealth(deriveCompareGroupHealthStats(nextGroups)),
        editingCompareGroupId: this.data.editingCompareGroupId === id ? "" : this.data.editingCompareGroupId,
        compareGroupNameDraft: this.data.editingCompareGroupId === id ? "" : this.data.compareGroupNameDraft
      });
      wx.showToast({ title: "已删除方案", icon: "success" });
    }).catch((error) => {
      wx.showToast({ title: error.message, icon: "none" });
    });
  },

  openCompareGroup(event) {
    const { id } = event.currentTarget.dataset;
    if (typeof api.touchCompareGroup !== "function") {
      wx.navigateTo({ url: `/pages/compare/index?groupId=${id}` });
      return;
    }
    api.touchCompareGroup(id).then((group) => {
      const nextGroups = buildCompareGroupCards(this.data.compareGroups.map((item) => (
        item.id === id ? { ...item, ...group } : item
      )));
      this.setData({
        compareGroups: nextGroups,
        compareGroupSections: buildCompareGroupSections(nextGroups),
        compareGroupHealth: buildCompareGroupHealth(deriveCompareGroupHealthStats(nextGroups))
      });
    }).catch(() => {}).finally(() => {
      wx.navigateTo({ url: `/pages/compare/index?groupId=${id}` });
    });
  },

  openFavoriteNotice(event) {
    const { id } = event.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/notice-detail/index?id=${id}` });
  },

  openFavoriteLatestNotice(event) {
    const { id, latestId } = event.currentTarget.dataset;
    const targetId = latestId || id;
    if (!targetId) {
      return;
    }
    wx.navigateTo({ url: `/pages/notice-detail/index?id=${targetId}` });
  },

  quickCompareFavoriteNotice(event) {
    const { id } = event.currentTarget.dataset;
    const favoriteNotice = (this.data.favoriteNotices || []).find((item) => item.id === id) || null;
    const noticeCompareSuggestion = favoriteNotice
      ? favoriteNotice.noticeCompareSuggestion
      : buildEmptyNoticeCompareSuggestion();

    if (!favoriteNotice || !noticeCompareSuggestion || !noticeCompareSuggestion.mode) {
      wx.showToast({ title: "当前公告暂无可对比岗位", icon: "none" });
      return;
    }

    if (OPEN_COMPARE_PAGE_MODES.has(noticeCompareSuggestion.mode)) {
      wx.navigateTo({ url: buildComparePageUrl(noticeCompareSuggestion) });
      return;
    }

    const compareNotice = {
      id: favoriteNotice.compareNoticeId || favoriteNotice.id,
      title: favoriteNotice.compareNoticeTitle || favoriteNotice.title || "",
      area: favoriteNotice.compareNoticeArea || favoriteNotice.area || "",
      examType: favoriteNotice.examType || ""
    };
    const compareRecord = buildNoticeCompareRecord(compareNotice, favoriteNotice.compareNoticeCandidateIds || []);
    if (!compareRecord.currentPositionIds.length) {
      wx.showToast({ title: "当前公告暂无可对比岗位", icon: "none" });
      return;
    }

    executeQuickCompare(api, compareRecord, {
      compareContext: buildNoticeCompareContext(compareNotice, {
        sourceLabel: "收藏公告",
        sourceEntry: "profile"
      })
    }).then((result) => {
      if (!result || result.status === "empty" || !result.group) {
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
  },

  cancelFavoriteNotice(event) {
    const { id } = event.currentTarget.dataset;
    if (!id) {
      return;
    }
    api.toggleFavoriteNotice(id).then(() => {
      wx.showToast({ title: "已取消收藏", icon: "success" });
      this.onShow();
    });
  },

  openHistoryNotice(event) {
    const { noticeId } = event.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/notice-detail/index?id=${noticeId}` });
  },

  openMessages() {
    wx.navigateTo({ url: "/pages/messages/index" });
  }
});
