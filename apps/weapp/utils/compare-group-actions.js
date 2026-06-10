const COMPARE_LIMIT = 4;
const DEFAULT_GROUP_LIMIT = 20;

function buildCompareGroupName(record) {
  return `${record.name || "岗位"}对比`;
}

function pickComparePositionIds(record, options = {}) {
  const preferNew = Boolean(options.preferNew);
  const preferred = preferNew && Array.isArray(record.newPositionIds) && record.newPositionIds.length
    ? record.newPositionIds
    : Array.isArray(record.currentPositionIds)
      ? record.currentPositionIds
      : [];
  return Array.from(new Set(preferred.filter(Boolean))).slice(0, COMPARE_LIMIT);
}

function addPositionsSequentially(groupId, positionIds, addPosition) {
  return positionIds.reduce(
    (promise, positionId) => promise.then(() => addPosition(groupId, positionId)),
    Promise.resolve()
  );
}

function mergeGroupSnapshot(baseGroup, nextGroup) {
  if (nextGroup && nextGroup.id) {
    return {
      ...(baseGroup || {}),
      ...nextGroup
    };
  }
  return baseGroup || null;
}

function buildCompareActionContext(record = {}, options = {}, action, positionIds = [], addedCount = 0) {
  const context = options.compareContext || {};
  return {
    sourceType: context.sourceType || record.sourceType || "",
    sourceLabel: context.sourceLabel || record.sourceLabel || "",
    sourceEntry: context.sourceEntry || record.sourceEntry || "",
    sourceName: context.sourceName || record.sourceName || record.name || "",
    noticeId: context.noticeId || record.noticeId || "",
    noticeTitle: context.noticeTitle || record.noticeTitle || "",
    action,
    actedAt: new Date().toISOString(),
    positionIds,
    addedCount
  };
}

function normalizeUsageTimestamp(value = "") {
  const parsed = Date.parse(String(value || "").trim());
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function sortCompatibleGroups(groups = []) {
  return (groups || []).slice().sort((left, right) => {
    if (Boolean(left && left.isPinned) !== Boolean(right && right.isPinned)) {
      return left && left.isPinned ? -1 : 1;
    }

    const rightUsedAt = normalizeUsageTimestamp(right && right.lastUsedAt);
    const leftUsedAt = normalizeUsageTimestamp(left && left.lastUsedAt);
    const usageGap = String(rightUsedAt || "").localeCompare(String(leftUsedAt || ""));
    if (usageGap !== 0) {
      return usageGap;
    }

    const sizeGap = Number(((right && right.positionIds) || []).length) - Number(((left && left.positionIds) || []).length);
    if (sizeGap !== 0) {
      return sizeGap;
    }

    return String((left && left.name) || "").localeCompare(String((right && right.name) || ""));
  });
}

function orderCompatibleGroups(groups = [], preferredGroupId = "") {
  if (!preferredGroupId) {
    return groups.slice();
  }

  const preferredGroup = groups.find((group) => group.id === preferredGroupId) || null;
  if (!preferredGroup) {
    return groups.slice();
  }

  return [preferredGroup].concat(groups.filter((group) => group.id !== preferredGroupId));
}

function buildGroupPlan(group, normalizedIds = []) {
  const currentIds = Array.isArray(group.positionIds) ? group.positionIds : [];

  if (normalizedIds.length && normalizedIds.every((positionId) => currentIds.includes(positionId))) {
    return {
      mode: "open-existing",
      group,
      nextIds: []
    };
  }

  const availableSlots = COMPARE_LIMIT - currentIds.length;
  if (availableSlots <= 0) {
    return null;
  }

  const nextIds = normalizedIds
    .filter((positionId) => !currentIds.includes(positionId))
    .slice(0, availableSlots);

  if (!nextIds.length) {
    return null;
  }

  return {
    mode: "reuse",
    group,
    nextIds
  };
}

function resolveCompareGroupPlan(groups = [], examType, candidateIds = [], options = {}) {
  const normalizedIds = Array.from(new Set((candidateIds || []).filter(Boolean)));
  const compatibleGroups = orderCompatibleGroups(
    sortCompatibleGroups(
      (groups || []).filter((group) => group && group.examType === examType)
    ),
    options.preferredGroupId
  );

  if (options.preferredGroupId && compatibleGroups.length && compatibleGroups[0].id === options.preferredGroupId) {
    const preferredPlan = buildGroupPlan(compatibleGroups[0], normalizedIds);
    if (preferredPlan) {
      return preferredPlan;
    }
  }

  for (const group of compatibleGroups) {
    const plan = buildGroupPlan(group, normalizedIds);
    if (plan && plan.mode === "open-existing") {
      return plan;
    }
  }

  for (const group of compatibleGroups) {
    if (options.preferredGroupId && group.id === options.preferredGroupId) {
      continue;
    }
    const plan = buildGroupPlan(group, normalizedIds);
    if (plan && plan.mode === "reuse") {
      return plan;
    }
  }

  return {
    mode: "create",
    group: null,
    nextIds: normalizedIds.slice(0, COMPARE_LIMIT)
  };
}

function describeComparePlan(groups = [], examType, candidateIds = [], options = {}) {
  const normalizedIds = Array.from(new Set((candidateIds || []).filter(Boolean)));
  const compatibleGroups = sortCompatibleGroups(
    (groups || []).filter((group) => group && group.examType === examType)
  );
  const plan = normalizedIds.length
    ? resolveCompareGroupPlan(compatibleGroups, examType, normalizedIds, options)
    : null;
  const maxGroupCount = Number(options.maxGroupCount || DEFAULT_GROUP_LIMIT);
  const groupLimitReached = Number((groups || []).length) >= maxGroupCount;

  if (!normalizedIds.length) {
    return {
      mode: "empty",
      ready: false,
      hint: "当前没有可对比岗位",
      actionLabel: "暂无可对比岗位",
      group: null,
      groupId: "",
      groupName: "",
      nextCount: 0,
      candidateCount: 0,
      compatibleGroupCount: compatibleGroups.length
    };
  }

  if (plan && plan.mode === "open-existing") {
    return {
      mode: "open-existing",
      ready: true,
      hint: `新增命中已在对比方案：${plan.group.name}`,
      actionLabel: "直接查看对比方案",
      group: plan.group,
      groupId: plan.group.id,
      groupName: plan.group.name,
      nextCount: 0,
      candidateCount: normalizedIds.length,
      compatibleGroupCount: compatibleGroups.length
    };
  }

  if (plan && plan.mode === "reuse") {
    return {
      mode: "reuse",
      ready: true,
      hint: `可直接放入对比方案：${plan.group.name}`,
      actionLabel: "直接对比新增命中",
      group: plan.group,
      groupId: plan.group.id,
      groupName: plan.group.name,
      nextCount: plan.nextIds.length,
      candidateCount: normalizedIds.length,
      compatibleGroupCount: compatibleGroups.length
    };
  }

  if (groupLimitReached) {
    return {
      mode: "review-needed",
      ready: false,
      hint: `对比方案已达 ${maxGroupCount} 组上限，建议先整理现有方案`,
      actionLabel: "先去整理对比方案",
      group: compatibleGroups[0] || null,
      groupId: compatibleGroups[0] ? compatibleGroups[0].id : "",
      groupName: compatibleGroups[0] ? compatibleGroups[0].name : "",
      nextCount: 0,
      candidateCount: normalizedIds.length,
      compatibleGroupCount: compatibleGroups.length
    };
  }

  return {
    mode: compatibleGroups.length ? "create-new" : "create-first",
    ready: true,
    hint: compatibleGroups.length
      ? `现有 ${compatibleGroups.length} 个同考试方案已放满，可直接新建对比方案`
      : "还没有同考试对比方案，可直接新建",
    actionLabel: "新建对比方案",
    group: null,
    groupId: "",
    groupName: "",
    nextCount: normalizedIds.length,
    candidateCount: normalizedIds.length,
    compatibleGroupCount: compatibleGroups.length
  };
}

function executeQuickCompare(api, record, options = {}) {
  const positionIds = pickComparePositionIds(record, options);
  if (!positionIds.length) {
    return Promise.resolve({
      status: "empty",
      group: null,
      addedCount: 0,
      positionCount: 0
    });
  }

  return api.listCompareGroups().then((groups) => {
    const plan = resolveCompareGroupPlan(groups, record.examType, positionIds, options);

    if (plan.mode === "open-existing") {
      const nextContext = buildCompareActionContext(record, options, "open-existing", positionIds, 0);
      const markExisting = typeof api.recordCompareGroupAction === "function"
        ? api.recordCompareGroupAction(plan.group.id, nextContext)
        : Promise.resolve(plan.group);
      return Promise.resolve(markExisting).then((group) => ({
        status: "existing",
        group: mergeGroupSnapshot(plan.group, group),
        addedCount: 0,
        positionCount: positionIds.length
      }));
    }

    if (plan.mode === "reuse") {
      const nextContext = buildCompareActionContext(
        record,
        options,
        "reuse",
        positionIds,
        plan.nextIds.length
      );
      return addPositionsSequentially(
        plan.group.id,
        plan.nextIds,
        (groupId, positionId) => api.addPositionToGroup(groupId, positionId, nextContext)
      ).then((group) => ({
        status: "reused",
        group: mergeGroupSnapshot(plan.group, group),
        addedCount: plan.nextIds.length,
        positionCount: positionIds.length
      }));
    }

    const nextContext = buildCompareActionContext(
      record,
      options,
      "create",
      positionIds,
      plan.nextIds.length
    );
    return api.createCompareGroup(buildCompareGroupName(record), record.examType, {
      originContext: nextContext,
      lastActionContext: nextContext
    })
      .then((group) =>
        addPositionsSequentially(
          group.id,
          plan.nextIds,
          (groupId, positionId) => api.addPositionToGroup(groupId, positionId, nextContext)
        ).then((nextGroup) => ({
          status: "created",
          group: mergeGroupSnapshot(group, nextGroup),
          addedCount: plan.nextIds.length,
          positionCount: positionIds.length
        }))
      );
  });
}

function buildQuickCompareToastTitle(result = {}) {
  if (result.status === "existing") {
    return "已打开已有对比方案";
  }
  if (result.status === "reused" && Number(result.addedCount || 0) > 0) {
    return `已补充 ${result.addedCount} 个岗位`;
  }
  if (Number(result.addedCount || 0) >= COMPARE_LIMIT) {
    return "已取前4个岗位对比";
  }
  return "已加入岗位对比";
}

module.exports = {
  COMPARE_LIMIT,
  DEFAULT_GROUP_LIMIT,
  buildCompareGroupName,
  pickComparePositionIds,
  addPositionsSequentially,
  sortCompatibleGroups,
  resolveCompareGroupPlan,
  describeComparePlan,
  executeQuickCompare,
  buildQuickCompareToastTitle
};
