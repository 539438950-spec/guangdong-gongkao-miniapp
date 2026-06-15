const STORAGE_KEY = "gongkao-miniapp-state";
const COMPARE_LIMIT = 4;
const GROUP_LIMIT = 20;
let seedSnapshotLoaderOverride = null;
let nodeSeedSnapshotCache = null;
let runtimeSeedModeOverride = "";
const { explainMajorMatch } = require("./major-matcher");
const { describeComparePlan } = require("./compare-group-actions");
const { buildPositionNextActionSummary } = require("./position-action-guidance");
const {
  normalizeGateChecks,
  buildGateCheckSummary,
  buildSourceGateChecks,
  buildReviewGateChecks,
  buildSourcePublishGate,
  buildSourceRiskSummary,
  buildReviewPriority,
  buildReviewResolutionSuggestion,
  buildReviewReleaseImpact
} = require("./source-ops-guidance");

const DEFAULT_PROGRESS_REMINDER_SETTINGS = {
  qualificationReview: true,
  interview: true,
  final: true
};

const DEFAULT_PERSONAL_PROFILE = {
  education: "",
  degree: "",
  majorKeywords: "",
  politicalStatus: "",
  serviceExperience: "",
  freshGraduateStatus: ""
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isNodeRuntime() {
  return typeof process !== "undefined" && process.release && process.release.name === "node";
}

function getNodeRequire() {
  if (!isNodeRuntime()) {
    return null;
  }

  try {
    return eval("require");
  } catch (_error) {
    return null;
  }
}

function clearNodeSeedSnapshotCache() {
  nodeSeedSnapshotCache = null;
}

function loadDemoSeedSnapshot() {
  const demo = require("../data/demo");
  return {
    seed: demo,
    seedVersion: demo.updatedAt || "demo"
  };
}

function resolveSeedRuntimeMode() {
  if (runtimeSeedModeOverride === "demo") {
    return "demo";
  }
  if (runtimeSeedModeOverride === "ingested") {
    return "ingested";
  }
  return isNodeRuntime() ? "ingested" : "demo";
}

function getNodeFileVersion(fs, filePath) {
  try {
    const stat = fs.statSync(filePath);
    return Number(stat.mtimeMs || 0);
  } catch (_error) {
    return 0;
  }
}

// Cache large seed snapshots in Node, but invalidate when source files change.
function loadNodeSeedSnapshot() {
  const nodeRequire = getNodeRequire();
  if (!nodeRequire) {
    return null;
  }

  try {
    const fs = nodeRequire("node:fs");
    const path = nodeRequire("node:path");
    const demoPath = path.resolve(__dirname, "../data/demo.js");
    const ingestedPath = path.resolve(__dirname, "../data/ingested.js");
    const cacheKey = [
      getNodeFileVersion(fs, demoPath),
      getNodeFileVersion(fs, ingestedPath)
    ].join(":");

    if (nodeSeedSnapshotCache && nodeSeedSnapshotCache.cacheKey === cacheKey) {
      return nodeSeedSnapshotCache.snapshot;
    }

    const demoModuleId = nodeRequire.resolve("../data/demo");
    const ingestedModuleId = nodeRequire.resolve("../data/ingested");
    delete nodeRequire.cache[demoModuleId];
    delete nodeRequire.cache[ingestedModuleId];

    const demo = nodeRequire("../data/demo");
    const ingested = nodeRequire("../data/ingested");
    const seed = ingested.notices && ingested.notices.length ? ingested : demo;
    const snapshot = {
      seed,
      seedVersion: seed.updatedAt || "demo"
    };

    nodeSeedSnapshotCache = {
      cacheKey,
      snapshot
    };
    return snapshot;
  } catch (_error) {
    return null;
  }
}

function loadSeedSnapshot() {
  if (typeof seedSnapshotLoaderOverride === "function") {
    const loaded = seedSnapshotLoaderOverride();
    if (loaded && loaded.seed) {
      return loaded;
    }
  }

  if (resolveSeedRuntimeMode() === "ingested" && isNodeRuntime()) {
    const snapshot = loadNodeSeedSnapshot();
    if (snapshot && snapshot.seed) {
      return snapshot;
    }
  }

  return loadDemoSeedSnapshot();
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

function tokenizeMajor(raw) {
  return String(raw || "")
    .split(/[，,、；;（）()：:\s]+/)
    .map((item) => item.trim())
    .filter((item) => item && item !== "本科" && item !== "研究生" && item !== "专业硕士");
}

function intersectCount(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
}

function scorePositionSimilarity(base, candidate) {
  if (!base || !candidate || base.id === candidate.id || base.examType !== candidate.examType) {
    return { score: -1, reasons: [] };
  }

  let score = 0;
  const reasons = [];
  const majorOverlap = intersectCount(tokenizeMajor(base.major), tokenizeMajor(candidate.major));

  if (majorOverlap > 0) {
    score += 40 + majorOverlap * 5;
    reasons.push("专业重合");
  }
  if (base.education === candidate.education) {
    score += 20;
    reasons.push("学历一致");
  }
  if (base.degree === candidate.degree) {
    score += 15;
    reasons.push("学位一致");
  }
  if (base.serviceRequirement === candidate.serviceRequirement) {
    score += 10;
    reasons.push("基层经历一致");
  }
  if (Boolean(base.freshGraduateOnly) === Boolean(candidate.freshGraduateOnly)) {
    score += 10;
    reasons.push("应届限制一致");
  }
  if (base.politicalStatus === candidate.politicalStatus) {
    score += 5;
    reasons.push("政治面貌一致");
  }
  if (base.area === candidate.area) {
    score += 5;
    reasons.push("地区一致");
  }
  if (base.positionType === candidate.positionType) {
    score += 5;
    reasons.push("职位类型一致");
  }
  if (String(base.notes || "") === String(candidate.notes || "")) {
    score += 3;
    reasons.push("其他要求接近");
  }

  return { score, reasons };
}

function buildFilterSummary(filters = {}) {
  const parts = [];
  if (filters.keyword) parts.push(`关键词:${filters.keyword}`);
  if (filters.selectedArea) parts.push(`地区:${filters.selectedArea}`);
  if (filters.selectedEducation) parts.push(`学历:${filters.selectedEducation}`);
  if (filters.selectedServiceRequirement) parts.push(`基层经历:${filters.selectedServiceRequirement}`);
  if (filters.selectedPoliticalStatus) parts.push(`政治面貌:${filters.selectedPoliticalStatus}`);
  if (filters.freshGraduateMode === "only") parts.push("仅限应届");
  if (filters.freshGraduateMode === "exclude") parts.push("排除限应届");
  return parts.length ? parts.join(" · ") : "默认筛选";
}

function matchesFilters(position, filters = {}) {
  if (filters.selectedArea && position.area !== filters.selectedArea) return false;
  if (filters.selectedEducation && position.education !== filters.selectedEducation) return false;
  if (
    filters.selectedServiceRequirement &&
    position.serviceRequirement !== filters.selectedServiceRequirement
  ) {
    return false;
  }
  if (
    filters.selectedPoliticalStatus &&
    position.politicalStatus !== filters.selectedPoliticalStatus
  ) {
    return false;
  }
  if (filters.freshGraduateMode === "only" && !position.freshGraduateOnly) return false;
  if (filters.freshGraduateMode === "exclude" && position.freshGraduateOnly) return false;
  if (!matchKeyword(position, filters.keyword)) return false;
  return true;
}

function normalizeReviewItem(item) {
  const priority = item.priority || buildReviewPriority(item);
  const gateChecks = buildReviewGateChecks(item);
  return {
    ...item,
    status: item.status || "pending",
    resolutionNote: item.resolutionNote || "",
    resolvedAt: item.resolvedAt || "",
    updatedAt: item.updatedAt || item.createdAt || "",
    candidateVersionId: item.candidateVersionId || "",
    candidateVersionLabel: item.candidateVersionLabel || "",
    candidateVersionCreatedAt: item.candidateVersionCreatedAt || item.createdAt || "",
    rollbackToVersionId: item.rollbackToVersionId || "",
    rollbackToVersionLabel: item.rollbackToVersionLabel || "",
    gateChecks,
    gateCheckSummary: buildGateCheckSummary(gateChecks),
    priority,
    resolutionSuggestion: item.resolutionSuggestion || buildReviewResolutionSuggestion(item),
    releaseImpact: item.releaseImpact || buildReviewReleaseImpact(item)
  };
}

function normalizeSourceState(item) {
  const fallbackStableVersionLabel = item.lastPublishedAt
    ? `${item.lastPublishedAt} 稳定快照`
    : "";
  const inferredGateFailureReason = item.gateFailureReason || (
    item.lastRollback
      ? (item.lastErrorSummary || item.parseQualitySummary || "最新结果未通过发布闸门")
      : (
        Number(item.pendingReviewCount || 0) > 0
          ? (item.parseQualitySummary || "存在待复核记录，当前不应直接替换前台版本")
          : (
            Number(item.consecutiveFailureCount || 0) > 0
              ? (item.lastErrorSummary || "来源近期存在连续失败，恢复稳定前不应发布")
              : ""
          )
      )
  );
  const inferredRollbackReason = item.rollbackReason || (
    item.lastRollback
      ? (item.lastErrorSummary || inferredGateFailureReason || "最新结果未通过发布闸门，已回退到上一稳定版本")
      : ""
  );
  const gateChecks = buildSourceGateChecks(item);
  const gateCheckSummary = buildGateCheckSummary(gateChecks);
  const normalized = {
    ...item,
    lastSuccessfulFetchedAt: item.lastSuccessfulFetchedAt || item.lastFetchedAt || "",
    candidateVersionId: item.candidateVersionId || "",
    candidateVersionLabel: item.candidateVersionLabel || "",
    candidateVersionCreatedAt: item.candidateVersionCreatedAt || item.lastRunFinishedAt || item.lastFetchedAt || "",
    stableVersionId: item.stableVersionId || item.lastPublishedVersionId || "",
    stableVersionLabel: item.stableVersionLabel || item.lastPublishedVersionLabel || fallbackStableVersionLabel,
    stableVersionUpdatedAt: item.stableVersionUpdatedAt || item.lastPublishedAt || "",
    lastPublishedVersionId: item.lastPublishedVersionId || item.stableVersionId || "",
    lastPublishedVersionLabel: item.lastPublishedVersionLabel || item.stableVersionLabel || fallbackStableVersionLabel,
    rollbackToVersionId: item.rollbackToVersionId || item.stableVersionId || "",
    rollbackToVersionLabel: item.rollbackToVersionLabel || item.stableVersionLabel || fallbackStableVersionLabel,
    gateFailureReason: inferredGateFailureReason,
    rollbackReason: inferredRollbackReason,
    gateChecks,
    gateCheckSummary
  };
  const publishGate = item.publishGate || buildSourcePublishGate(normalized);
  const riskSummary = item.riskSummary || buildSourceRiskSummary(normalized);
  return {
    ...normalized,
    publishGate,
    publishGateStatus: item.publishGateStatus || publishGate.status || "",
    publishGateLabel: item.publishGateLabel || publishGate.label || "",
    publishGateDetail: item.publishGateDetail || publishGate.detail || "",
    publishGateTone: item.publishGateTone || publishGate.tone || "",
    publishGateFocus: item.publishGateFocus || publishGate.focus || "",
    riskSummary,
    releaseMode: item.releaseMode || (publishGate.status === "healthy" ? "positions-open" : "notice-only")
  };
}

function normalizeAlertEvent(item) {
  return {
    ...item,
    status: item.status || "active",
    closedAt: item.closedAt || "",
    updatedAt: item.updatedAt || item.createdAt || ""
  };
}

function normalizePublishAudit(item) {
  return {
    ...item,
    eventType: item.eventType || "",
    summary: item.summary || "",
    detail: item.detail || "",
    releaseMode: item.releaseMode || "",
    releaseOverrideMode: item.releaseOverrideMode || "",
    reason: item.reason || "",
    operator: item.operator || "",
    updatedAt: item.updatedAt || item.createdAt || ""
  };
}

function normalizeProgressReminderSettings(input = {}) {
  return {
    qualificationReview: input.qualificationReview !== false,
    interview: input.interview !== false,
    final: input.final !== false
  };
}

function normalizePersonalProfile(input = {}) {
  const serviceExperience = ["", "has", "none"].includes(String(input.serviceExperience || ""))
    ? String(input.serviceExperience || "")
    : "";
  const freshGraduateStatus = ["", "fresh", "non-fresh"].includes(String(input.freshGraduateStatus || ""))
    ? String(input.freshGraduateStatus || "")
    : "";

  return {
    education: String(input.education || "").trim(),
    degree: String(input.degree || "").trim(),
    majorKeywords: String(input.majorKeywords || "").trim(),
    politicalStatus: String(input.politicalStatus || "").trim(),
    serviceExperience,
    freshGraduateStatus
  };
}

function hasPersonalProfile(input = {}) {
  const normalized = normalizePersonalProfile(input);
  return Boolean(
    normalized.education ||
    normalized.degree ||
    normalized.majorKeywords ||
    normalized.politicalStatus ||
    normalized.serviceExperience ||
    normalized.freshGraduateStatus
  );
}

function normalizeEligibilityValue(value) {
  if (value === undefined || value === null || value === "") {
    return "未注明";
  }
  return String(value);
}

function isOpenEligibilityRequirement(value) {
  const text = normalizeEligibilityValue(value);
  return text === "不限" || text === "未注明";
}

function includesEligibilityKeyword(text, keyword) {
  return String(text || "").toLowerCase().includes(String(keyword || "").toLowerCase());
}

function evaluatePositionForPersonalProfile(position, profile = {}) {
  const normalizedProfile = normalizePersonalProfile(profile);
  if (!hasPersonalProfile(normalizedProfile)) {
    return {
      active: false,
      mismatchCount: 0,
      mismatchReasons: [],
      majorMatchSummary: "",
      isFullyMatched: true
    };
  }

  const mismatchReasons = [];
  const education = normalizeEligibilityValue(position.education);
  const degree = normalizeEligibilityValue(position.degree);
  const major = normalizeEligibilityValue(position.major);
  const politicalStatus = normalizeEligibilityValue(position.politicalStatus);
  const hasMajorRequirement = !isOpenEligibilityRequirement(major) || (
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
    !isOpenEligibilityRequirement(education) &&
    !includesEligibilityKeyword(education, normalizedProfile.education)
  ) {
    mismatchReasons.push("学历要求不匹配");
  }
  if (
    normalizedProfile.degree &&
    !isOpenEligibilityRequirement(degree) &&
    !includesEligibilityKeyword(degree, normalizedProfile.degree)
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
    !isOpenEligibilityRequirement(politicalStatus) &&
    !includesEligibilityKeyword(politicalStatus, normalizedProfile.politicalStatus)
  ) {
    mismatchReasons.push("政治面貌要求不匹配");
  }
  if (
    normalizedProfile.serviceExperience === "none" &&
    !isOpenEligibilityRequirement(position.serviceRequirement)
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
    active: true,
    mismatchCount: mismatchReasons.length,
    mismatchReasons,
    majorMatchSummary: majorMatchResult.summary || "",
    isFullyMatched: mismatchReasons.length === 0
  };
}

function normalizeProgressReminderSettingOverrides(input = {}) {
  const result = {};
  if (Object.prototype.hasOwnProperty.call(input, "qualificationReview")) {
    result.qualificationReview = input.qualificationReview !== false;
  }
  if (Object.prototype.hasOwnProperty.call(input, "interview")) {
    result.interview = input.interview !== false;
  }
  if (Object.prototype.hasOwnProperty.call(input, "final")) {
    result.final = input.final !== false;
  }
  return result;
}

function normalizeNoticeProgressReminderOverrides(input = {}) {
  return Object.keys(input || {}).reduce((result, noticeId) => {
    const overrides = normalizeProgressReminderSettingOverrides(input[noticeId] || {});
    if (Object.keys(overrides).length) {
      result[noticeId] = overrides;
    }
    return result;
  }, {});
}

function buildSeedState(previousState = {}) {
  const { seed, seedVersion } = loadSeedSnapshot();
  const reviewQueue = [
    ...(seed.reviewQueue || []).map((item) => ({
      ...item,
      status: item.status || "pending"
    })),
    ...(seed.resolvedReviewQueue || []).map((item) => ({
      ...item,
      status: "resolved"
    }))
  ];
  return {
    notices: clone(seed.notices),
    positions: clone(seed.positions),
    compareGroups: clone(previousState.compareGroups || seed.compareGroups || []),
    sourceStates: clone(seed.sourceStates || []).map(normalizeSourceState),
    reviewQueue: clone(reviewQueue).map(normalizeReviewItem),
    alertEvents: clone(seed.alertEvents || []),
    publishAudits: clone(seed.publishAudits || []).map(normalizePublishAudit),
    favorites: clone(previousState.favorites || []),
    subscriptions: clone(previousState.subscriptions || []),
    savedFilters: clone(previousState.savedFilters || []),
    personalProfile: normalizePersonalProfile(
      previousState.personalProfile || DEFAULT_PERSONAL_PROFILE
    ),
    progressReminderSettings: normalizeProgressReminderSettings(
      previousState.progressReminderSettings || DEFAULT_PROGRESS_REMINDER_SETTINGS
    ),
    noticeProgressReminderOverrides: normalizeNoticeProgressReminderOverrides(
      previousState.noticeProgressReminderOverrides || {}
    ),
    browsingHistory: clone(previousState.browsingHistory || []),
    messageReadIds: clone(previousState.messageReadIds || []),
    _seedVersion: seedVersion
  };
}

let state = buildSeedState();

function buildPersistedUserState(snapshot = state) {
  return {
    compareGroups: clone(snapshot.compareGroups || []),
    favorites: clone(snapshot.favorites || []),
    subscriptions: clone(snapshot.subscriptions || []),
    savedFilters: clone(snapshot.savedFilters || []),
    personalProfile: normalizePersonalProfile(
      snapshot.personalProfile || DEFAULT_PERSONAL_PROFILE
    ),
    progressReminderSettings: normalizeProgressReminderSettings(
      snapshot.progressReminderSettings || DEFAULT_PROGRESS_REMINDER_SETTINGS
    ),
    noticeProgressReminderOverrides: normalizeNoticeProgressReminderOverrides(
      snapshot.noticeProgressReminderOverrides || {}
    ),
    browsingHistory: clone(snapshot.browsingHistory || []),
    messageReadIds: clone(snapshot.messageReadIds || [])
  };
}

function hasWxStorage() {
  return typeof wx !== "undefined" && typeof wx.getStorageSync === "function";
}

function loadState() {
  const { seedVersion } = loadSeedSnapshot();
  if (!hasWxStorage()) {
    return state;
  }

  try {
    const stored = wx.getStorageSync(STORAGE_KEY);
    if (stored && typeof stored === "object") {
      state = stored._seedVersion !== seedVersion
        ? buildSeedState(stored)
        : {
            ...state,
            ...stored
          };
    }
  } catch (_error) {
    return state;
  }

  return state;
}

function persistState() {
  if (!hasWxStorage()) {
    return;
  }

  try {
    wx.setStorageSync(STORAGE_KEY, state);
  } catch (_error) {
    // Ignore local quota errors in demo mode.
  }
}

function ensureLoaded() {
  const { seedVersion } = loadSeedSnapshot();
  if (state._seedVersion !== seedVersion) {
    state = buildSeedState(state);
    persistState();
  }
  return loadState();
}

function getNoticeById(id) {
  ensureLoaded();
  return state.notices.find((item) => item.id === id) || null;
}

function listNotices() {
  ensureLoaded();
  return clone(state.notices);
}

function listSourceStates() {
  ensureLoaded();
  return clone(state.sourceStates).map(normalizeSourceState);
}

function listReviewQueue() {
  ensureLoaded();
  return clone(
    state.reviewQueue
      .map(normalizeReviewItem)
      .filter((item) => item.status !== "resolved")
  );
}

function listResolvedReviewQueue() {
  ensureLoaded();
  return clone(
    state.reviewQueue
      .map(normalizeReviewItem)
      .filter((item) => item.status === "resolved")
      .sort((left, right) => String(right.resolvedAt || "").localeCompare(String(left.resolvedAt || "")))
  );
}

function listAlertEvents() {
  ensureLoaded();
  return clone(
    state.alertEvents
      .map(normalizeAlertEvent)
      .filter((item) => item.status !== "resolved")
  );
}

function listPublishAudits() {
  ensureLoaded();
  return clone(
    (state.publishAudits || [])
      .map(normalizePublishAudit)
      .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
  );
}

function listFavoriteNoticeIds() {
  ensureLoaded();
  return clone(state.favorites);
}

function listFavoriteNotices() {
  ensureLoaded();
  return clone(
    state.favorites
      .map((noticeId) => state.notices.find((item) => item.id === noticeId))
      .filter(Boolean)
  );
}

function isFavoriteNotice(noticeId) {
  ensureLoaded();
  return state.favorites.includes(noticeId);
}

function getProgressReminderSettings() {
  ensureLoaded();
  return clone(normalizeProgressReminderSettings(state.progressReminderSettings));
}

function getPersonalProfile() {
  ensureLoaded();
  return clone(normalizePersonalProfile(state.personalProfile || DEFAULT_PERSONAL_PROFILE));
}

function savePersonalProfile(input = {}) {
  ensureLoaded();
  state.personalProfile = normalizePersonalProfile({
    ...state.personalProfile,
    ...input
  });
  persistState();
  return getPersonalProfile();
}

function saveProgressReminderSettings(input = {}) {
  ensureLoaded();
  state.progressReminderSettings = normalizeProgressReminderSettings({
    ...state.progressReminderSettings,
    ...input
  });
  persistState();
  return getProgressReminderSettings();
}

function getNoticeProgressReminderSettings(noticeId) {
  ensureLoaded();
  const base = getProgressReminderSettings();
  const overrides = normalizeProgressReminderSettingOverrides(
    (state.noticeProgressReminderOverrides || {})[noticeId] || {}
  );
  return clone({
    ...base,
    ...overrides
  });
}

function saveNoticeProgressReminderSettings(noticeId, input = {}) {
  ensureLoaded();
  if (!noticeId) {
    throw new Error("公告不存在");
  }

  const globalSettings = getProgressReminderSettings();
  const currentOverrides = normalizeProgressReminderSettingOverrides(
    (state.noticeProgressReminderOverrides || {})[noticeId] || {}
  );
  const nextOverrides = {
    ...currentOverrides,
    ...normalizeProgressReminderSettingOverrides(input)
  };

  Object.keys(nextOverrides).forEach((key) => {
    if (nextOverrides[key] === globalSettings[key]) {
      delete nextOverrides[key];
    }
  });

  state.noticeProgressReminderOverrides = {
    ...(state.noticeProgressReminderOverrides || {})
  };

  if (Object.keys(nextOverrides).length) {
    state.noticeProgressReminderOverrides[noticeId] = nextOverrides;
  } else {
    delete state.noticeProgressReminderOverrides[noticeId];
  }

  persistState();
  return getNoticeProgressReminderSettings(noticeId);
}

function getProgressReminderOptions() {
  return [
    { id: "qualificationReview", stageId: "qualification-review", label: "资格审核" },
    { id: "interview", stageId: "interview", label: "面试" },
    { id: "final", stageId: "final", label: "录用" }
  ];
}

function listPositions() {
  ensureLoaded();
  return clone(state.positions);
}

function getPositionsByNoticeId(noticeId) {
  ensureLoaded();
  return clone(state.positions.filter((item) => item.noticeId === noticeId));
}

function getPositionById(id) {
  ensureLoaded();
  return clone(state.positions.find((item) => item.id === id) || null);
}

function recommendPositions(positionId, limit = 6) {
  ensureLoaded();
  const base = state.positions.find((item) => item.id === positionId);
  if (!base) {
    return [];
  }

  return state.positions
    .map((candidate) => ({
      position: candidate,
      ...scorePositionSimilarity(base, candidate)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => ({
      ...clone(item.position),
      score: item.score,
      reasons: item.reasons
    }));
}

function listCompareGroups() {
  ensureLoaded();
  return state.compareGroups.map(normalizeCompareGroup);
}

function buildCompareGroupMetrics(compareGroups = []) {
  const groups = (compareGroups || []).map(normalizeCompareGroup).filter(Boolean);
  const compareGroupCount = groups.length;
  const pinnedCompareGroupCount = groups.filter((item) => item.isPinned).length;
  const fullCompareGroupCount = groups.filter(
    (item) => Array.isArray(item.positionIds) && item.positionIds.length >= COMPARE_LIMIT
  ).length;
  const emptyCompareGroupCount = groups.filter(
    (item) => !Array.isArray(item.positionIds) || item.positionIds.length === 0
  ).length;
  const reusableCompareGroupCount = groups.filter((item) => {
    const positionCount = Array.isArray(item.positionIds) ? item.positionIds.length : 0;
    return positionCount > 0 && positionCount < COMPARE_LIMIT;
  }).length;
  const activeCompareGroupCount = groups.filter((item) => (
    Boolean(item.lastUsedAt) ||
    Boolean(item.lastActionContext) ||
    Boolean(item.originContext)
  )).length;
  const remainingCompareGroupCount = Math.max(0, GROUP_LIMIT - compareGroupCount);
  const reviewNeededCompareGroupCount = emptyCompareGroupCount +
    (compareGroupCount >= GROUP_LIMIT ? fullCompareGroupCount : 0);

  return {
    compareGroupCount,
    compareGroupLimit: GROUP_LIMIT,
    compareGroupCapacityLimit: COMPARE_LIMIT,
    pinnedCompareGroupCount,
    fullCompareGroupCount,
    emptyCompareGroupCount,
    reusableCompareGroupCount,
    activeCompareGroupCount,
    remainingCompareGroupCount,
    reviewNeededCompareGroupCount
  };
}

function getCompareGroup(groupId) {
  ensureLoaded();
  return normalizeCompareGroup(
    state.compareGroups.find((item) => item.id === groupId) || state.compareGroups[0] || null
  );
}

function getComparePositions(groupId) {
  const group = getCompareGroup(groupId);
  if (!group) {
    return [];
  }
  return group.positionIds.map((positionId) => getPositionById(positionId)).filter(Boolean);
}

function getCompareStatus(positionId, groupId) {
  const group = getCompareGroup(groupId);
  if (!group) {
    return false;
  }
  return group.positionIds.includes(positionId);
}

function normalizeCompareGroupPreferences(preferences = {}) {
  const sortMode = ["manual", "rule", "eligibility", "trust"].includes(preferences.sortMode)
    ? preferences.sortMode
    : "manual";
  const rowFocusMode = ["all", "different", "barrier"].includes(preferences.rowFocusMode)
    ? preferences.rowFocusMode
    : "all";
  return {
    sortMode,
    rowFocusMode
  };
}

function normalizeCompareGroupContext(context = {}) {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return null;
  }

  const normalized = {
    sourceType: String(context.sourceType || "").trim(),
    sourceLabel: String(context.sourceLabel || "").trim(),
    sourceEntry: String(context.sourceEntry || "").trim(),
    sourceName: String(context.sourceName || "").trim(),
    noticeId: String(context.noticeId || "").trim(),
    noticeTitle: String(context.noticeTitle || "").trim(),
    action: String(context.action || "").trim(),
    actedAt: String(context.actedAt || new Date().toISOString()).trim(),
    positionIds: Array.isArray(context.positionIds)
      ? Array.from(new Set(context.positionIds.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, COMPARE_LIMIT)
      : [],
    addedCount: Number.isFinite(Number(context.addedCount)) ? Number(context.addedCount) : 0
  };

  const hasValue = normalized.sourceType ||
    normalized.sourceLabel ||
    normalized.sourceEntry ||
    normalized.sourceName ||
    normalized.noticeId ||
    normalized.noticeTitle ||
    normalized.action ||
    normalized.positionIds.length ||
    normalized.addedCount;

  return hasValue ? normalized : null;
}

function normalizeCompareGroupTimestamp(value = "") {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    return "";
  }
  return new Date(parsed).toISOString();
}

function resolveCompareGroupUsageTimestamp(value = "", fallbackValue = "") {
  return normalizeCompareGroupTimestamp(value) ||
    normalizeCompareGroupTimestamp(fallbackValue) ||
    new Date().toISOString();
}

function normalizeCompareGroup(group) {
  if (!group) {
    return null;
  }
  return {
    ...clone(group),
    viewPreferences: normalizeCompareGroupPreferences(group.viewPreferences),
    originContext: normalizeCompareGroupContext(group.originContext),
    lastActionContext: normalizeCompareGroupContext(group.lastActionContext),
    isPinned: Boolean(group.isPinned),
    pinnedAt: normalizeCompareGroupTimestamp(group.pinnedAt),
    lastUsedAt: normalizeCompareGroupTimestamp(group.lastUsedAt)
  };
}

function createCompareGroup(name, examType, options = {}) {
  ensureLoaded();
  if (state.compareGroups.length >= GROUP_LIMIT) {
    throw new Error("对比组数量已达到上限");
  }

  const originContext = normalizeCompareGroupContext(options.originContext);
  const lastActionContext = normalizeCompareGroupContext(options.lastActionContext) || originContext;
  const initialUsedAt = resolveCompareGroupUsageTimestamp(
    options.lastUsedAt,
    lastActionContext && lastActionContext.actedAt
  );
  const initialPinned = Boolean(options.isPinned);

  const group = {
    id: `cg-${Date.now()}`,
    name: name || "新的对比方案",
    examType,
    positionIds: [],
    viewPreferences: normalizeCompareGroupPreferences(),
    originContext,
    lastActionContext,
    isPinned: initialPinned,
    pinnedAt: initialPinned
      ? resolveCompareGroupUsageTimestamp(options.pinnedAt, initialUsedAt)
      : "",
    lastUsedAt: initialUsedAt
  };

  state.compareGroups.push(group);
  persistState();
  return normalizeCompareGroup(group);
}

function renameCompareGroup(groupId, name) {
  ensureLoaded();
  const group = state.compareGroups.find((item) => item.id === groupId);
  if (!group) {
    throw new Error("对比组不存在");
  }

  group.name = name || group.name;
  persistState();
  return normalizeCompareGroup(group);
}

function saveCompareGroupPreferences(groupId, preferences = {}) {
  ensureLoaded();
  const group = state.compareGroups.find((item) => item.id === groupId);
  if (!group) {
    throw new Error("对比组不存在");
  }

  group.viewPreferences = normalizeCompareGroupPreferences({
    ...(group.viewPreferences || {}),
    ...preferences
  });
  persistState();
  return normalizeCompareGroup(group);
}

function setCompareGroupPinned(groupId, pinned, pinnedAt = "") {
  ensureLoaded();
  const group = state.compareGroups.find((item) => item.id === groupId);
  if (!group) {
    throw new Error("对比组不存在");
  }

  const nextPinned = Boolean(pinned);
  group.isPinned = nextPinned;
  group.pinnedAt = nextPinned
    ? resolveCompareGroupUsageTimestamp(pinnedAt, group.lastUsedAt)
    : "";
  persistState();
  return normalizeCompareGroup(group);
}

function deleteCompareGroup(groupId) {
  ensureLoaded();
  state.compareGroups = state.compareGroups.filter((item) => item.id !== groupId);
  if (!state.compareGroups.length) {
    const { seed } = loadSeedSnapshot();
    state.compareGroups = clone(seed.compareGroups || []);
  }
  persistState();
  return listCompareGroups();
}

function recordCompareGroupAction(groupId, context = {}) {
  ensureLoaded();
  const group = state.compareGroups.find((item) => item.id === groupId);
  if (!group) {
    throw new Error("对比组不存在");
  }

  const normalizedContext = normalizeCompareGroupContext(context);
  if (!normalizedContext) {
    return normalizeCompareGroup(group);
  }

  group.lastActionContext = normalizedContext;
  group.lastUsedAt = resolveCompareGroupUsageTimestamp(
    normalizedContext && normalizedContext.actedAt,
    group.lastUsedAt
  );
  persistState();
  return normalizeCompareGroup(group);
}

function touchCompareGroup(groupId, touchedAt = "") {
  ensureLoaded();
  const group = state.compareGroups.find((item) => item.id === groupId);
  if (!group) {
    throw new Error("对比组不存在");
  }

  group.lastUsedAt = resolveCompareGroupUsageTimestamp(touchedAt, group.lastUsedAt);
  persistState();
  return normalizeCompareGroup(group);
}

function addPositionToCompareGroup(groupId, positionId, context = {}) {
  ensureLoaded();
  const group = state.compareGroups.find((item) => item.id === groupId);
  const position = state.positions.find((item) => item.id === positionId);
  const normalizedContext = normalizeCompareGroupContext(context);

  if (!group || !position) {
    throw new Error("岗位或对比组不存在");
  }
  if (group.examType !== position.examType) {
    throw new Error("不能跨考试类型对比");
  }
  if (group.positionIds.includes(positionId)) {
    if (normalizedContext) {
      group.lastActionContext = normalizedContext;
      group.lastUsedAt = resolveCompareGroupUsageTimestamp(
        normalizedContext && normalizedContext.actedAt,
        group.lastUsedAt
      );
      persistState();
    }
    return normalizeCompareGroup(group);
  }
  if (group.positionIds.length >= COMPARE_LIMIT) {
    throw new Error("单个对比组最多添加 4 个岗位");
  }

  group.positionIds.push(positionId);
  if (normalizedContext) {
    group.lastActionContext = normalizedContext;
    group.lastUsedAt = resolveCompareGroupUsageTimestamp(
      normalizedContext && normalizedContext.actedAt,
      group.lastUsedAt
    );
  }
  persistState();
  return normalizeCompareGroup(group);
}

function removePositionFromCompareGroup(groupId, positionId) {
  ensureLoaded();
  const group = state.compareGroups.find((item) => item.id === groupId);
  if (!group) {
    throw new Error("对比组不存在");
  }

  group.positionIds = group.positionIds.filter((item) => item !== positionId);
  persistState();
  return normalizeCompareGroup(group);
}

function buildFilterRecord(prefix, input, matchPositionIds = []) {
  const timestamp = Date.now();
  return {
    id: `${prefix}-${timestamp}`,
    noticeId: input.noticeId,
    noticeTitle: input.noticeTitle,
    examType: input.examType,
    name: input.name,
    filters: clone(input.filters || {}),
    summary: buildFilterSummary(input.filters),
    resultCount: input.resultCount || matchPositionIds.length,
    baselinePositionIds: clone(matchPositionIds),
    seenPositionIds: clone(matchPositionIds),
    viewPreferences: normalizeListViewPreferences(input.viewPreferences),
    createdAt: new Date(timestamp).toISOString(),
    updatedAt: new Date(timestamp).toISOString()
  };
}

function normalizeListViewPreferences(preferences = {}) {
  return {
    sortMode: ["manual", "eligibility", "compare"].includes(preferences.sortMode)
      ? preferences.sortMode
      : "manual"
  };
}

function getMatchedPositionsByRecord(record) {
  return state.positions
    .filter((item) => item.noticeId === record.noticeId)
    .filter((item) => matchesFilters(item, record.filters));
}

function decorateFilterRecord(record) {
  const matchedPositions = getMatchedPositionsByRecord(record);
  const currentPositionIds = matchedPositions.map((item) => item.id);
  const currentPositionPreview = matchedPositions.slice(0, 3).map((item) => ({
    id: item.id,
    title: item.title,
    area: item.area || "",
    agency: item.agency || ""
  }));
  return {
    ...clone(record),
    viewPreferences: normalizeListViewPreferences(record.viewPreferences),
    currentMatchCount: matchedPositions.length,
    currentPositionIds,
    currentPositionPreview
  };
}

function decorateSubscriptionRecord(record) {
  const matchedPositions = getMatchedPositionsByRecord(record);
  const currentPositionIds = matchedPositions.map((item) => item.id);
  const seenSet = new Set(record.seenPositionIds || []);
  const newPositions = matchedPositions.filter((item) => !seenSet.has(item.id));
  const newPositionIds = newPositions.map((item) => item.id);
  const newPositionPreview = newPositions.slice(0, 3).map((item) => ({
    id: item.id,
    title: item.title,
    area: item.area || "",
    agency: item.agency || ""
  }));
  const insights = buildSubscriptionInsights({
    ...clone(record),
    currentPositionIds,
    newPositionIds,
    newMatchCount: newPositionIds.length
  });
  return {
    ...clone(record),
    viewPreferences: normalizeListViewPreferences(record.viewPreferences),
    currentMatchCount: currentPositionIds.length,
    newMatchCount: newPositionIds.length,
    currentPositionIds,
    newPositionIds,
    newPositionPreview,
    eligibleNewMatchCount: insights.eligibleCount,
    cautionNewMatchCount: insights.cautionCount,
    decisionSummary: insights.decisionSummary,
    bestMatchSummary: insights.bestMatchSummary,
    nextActionSummary: insights.nextActionSummary,
    compareSuggestion: insights.compareSuggestion,
    compareHint: insights.compareHint,
    compareReady: insights.compareReady,
    compareActionLabel: insights.compareActionLabel
  };
}

function buildSubscriptionInsights(record) {
  const profile = getPersonalProfile();
  const newPositions = state.positions.filter((item) => (record.newPositionIds || []).includes(item.id));
  const evaluated = newPositions.map((item) => ({
    ...item,
    ...evaluatePositionForPersonalProfile(item, profile)
  }));
  const active = hasPersonalProfile(profile);
  const eligibleCount = active ? evaluated.filter((item) => item.isFullyMatched).length : 0;
  const cautionCount = active ? evaluated.filter((item) => item.mismatchCount > 0).length : 0;
  const bestMatch = active
    ? evaluated.slice().sort((left, right) => {
      const mismatchGap = Number(left.mismatchCount || 0) - Number(right.mismatchCount || 0);
      if (mismatchGap !== 0) {
        return mismatchGap;
      }
      return Number(right.headcount || 0) - Number(left.headcount || 0);
    })[0]
    : null;
  const compareSuggestion = describeComparePlan(
    state.compareGroups,
    record.examType,
    record.newPositionIds || [],
    {
      maxGroupCount: GROUP_LIMIT
    }
  );
  const nextActionSummary = bestMatch
    ? `${bestMatch.title} · ${buildPositionNextActionSummary(bestMatch)}`
    : compareSuggestion.hint;

  return {
    active,
    eligibleCount,
    cautionCount,
    compareSuggestion,
    nextActionSummary,
    decisionSummary: active
      ? `新增 ${record.newMatchCount} 个岗位 · 可报 ${eligibleCount} 个 · 待确认 ${cautionCount} 个`
      : `新增 ${record.newMatchCount} 个岗位`,
    bestMatchSummary: bestMatch
      ? `${bestMatch.title} · ${bestMatch.mismatchCount ? `${bestMatch.mismatchCount} 项待确认` : "当前最匹配"}${bestMatch.majorMatchSummary ? ` · ${bestMatch.majorMatchSummary}` : ""}`
      : "",
    compareHint: compareSuggestion.hint,
    compareReady: compareSuggestion.ready,
    compareActionLabel: compareSuggestion.actionLabel
  };
}

function isMessageRead(messageId) {
  return state.messageReadIds.includes(messageId);
}

function buildSubscriptionMessages() {
  return state.subscriptions
    .map(decorateSubscriptionRecord)
    .filter((record) => record.newMatchCount > 0)
    .map((record) => {
      const batchKey = record.newPositionIds.slice().sort().join("|");
      const id = `subscription:${record.id}:${batchKey}`;
      return {
        id,
        type: "subscription",
        typeLabel: "订阅提醒",
        priority: 3,
        title: `${record.name} 有 ${record.newMatchCount} 个新增岗位`,
        summary: record.decisionSummary,
        createdAt: record.updatedAt || record.createdAt,
        actionLabel: "查看命中岗位",
        noticeId: record.noticeId,
        subscriptionId: record.id,
        newPositionPreview: record.newPositionPreview,
        compareSuggestion: record.compareSuggestion,
        bestMatchSummary: record.bestMatchSummary,
        nextActionSummary: record.nextActionSummary,
        compareHint: record.compareHint,
        compareReady: record.compareReady,
        compareActionLabel: record.compareActionLabel,
        read: isMessageRead(id)
      };
    });
}

function buildFavoriteMessages() {
  return state.favorites
    .map((noticeId) => state.notices.find((item) => item.id === noticeId))
    .filter((notice) => notice && notice.hasStructuredPositions)
    .map((notice) => {
      const id = `favorite-ready:${notice.id}:${notice.positionCount}`;
      return {
        id,
        type: "favorite-ready",
        typeLabel: "收藏动态",
        priority: 2,
        title: "收藏公告已支持岗位查看",
        summary: `${notice.title} · 已解析 ${notice.positionCount} 个岗位`,
        createdAt: notice.publishedAt,
        actionLabel: "打开岗位列表",
        noticeId: notice.id,
        read: isMessageRead(id)
      };
    });
}

function buildHistoryMessages() {
  return state.browsingHistory.slice(0, 5).map((entry) => {
    const id = `history:${entry.id}:${entry.viewedAt || ""}`;
    return {
      id,
      type: "history",
      typeLabel: "继续查看",
      priority: 1,
      title: `继续查看：${entry.title}`,
      summary: entry.type === "notice" ? "最近浏览的公告" : "最近浏览记录",
      createdAt: entry.viewedAt,
      actionLabel: "继续查看",
      noticeId: entry.noticeId || "",
      read: isMessageRead(id)
    };
  });
}

function mapAlertTypeLabel(type) {
  if (type === "run-failed") return "运行告警";
  if (type === "rollback") return "回退告警";
  if (type === "structure-change") return "结构告警";
  if (type === "review-queued") return "复核提醒";
  if (type === "sla-overdue") return "时效告警";
  if (type === "sla-warning") return "时效预警";
  return "数据告警";
}

function getSourceName(sourceId) {
  const source = state.sourceStates.find((item) => item.sourceId === sourceId);
  return (source && source.sourceName) || sourceId;
}

function syncPendingReviewCounts() {
  const pendingCounts = state.reviewQueue
    .map(normalizeReviewItem)
    .filter((item) => item.status !== "resolved")
    .reduce((result, item) => {
      result[item.sourceId] = (result[item.sourceId] || 0) + 1;
      return result;
    }, {});

  state.sourceStates = state.sourceStates.map((item) => ({
    ...normalizeSourceState(item),
    pendingReviewCount: pendingCounts[item.sourceId] || 0
  })).map(normalizeSourceState);
}

function closeReviewAlertsForSource(sourceId) {
  const hasPending = state.reviewQueue
    .map(normalizeReviewItem)
    .some((item) => item.sourceId === sourceId && item.status !== "resolved");
  if (hasPending) {
    return;
  }

  const now = new Date().toISOString();
  state.alertEvents = state.alertEvents.map((item) => {
    const next = normalizeAlertEvent(item);
    if (next.sourceId === sourceId && next.type === "review-queued" && next.status !== "resolved") {
      return {
        ...next,
        status: "resolved",
        closedAt: now,
        updatedAt: now
      };
    }
    return next;
  });
}

function ensureReviewAlertForSource(sourceId) {
  const pendingCount = state.reviewQueue
    .map(normalizeReviewItem)
    .filter((item) => item.sourceId === sourceId && item.status !== "resolved").length;
  if (!pendingCount) {
    return;
  }

  const active = state.alertEvents
    .map(normalizeAlertEvent)
    .find((item) => item.sourceId === sourceId && item.type === "review-queued" && item.status !== "resolved");
  if (active) {
    return;
  }

  const now = new Date().toISOString();
  state.alertEvents = [
    {
      id: `alert-review-${sourceId}-${Date.now()}`,
      sourceId,
      sourceName: getSourceName(sourceId),
      type: "review-queued",
      severity: "medium",
      createdAt: now,
      updatedAt: now,
      summary: `${getSourceName(sourceId)} 有待复核记录`,
      details: `当前待复核 ${pendingCount} 条。`,
      status: "active",
      closedAt: ""
    },
    ...state.alertEvents
  ];
}

function mapAlertAction(alert) {
  if (alert.type === "review-queued") {
    return {
      actionLabel: "打开复核中心",
      pageUrl: `/pages/review-center/index?sourceId=${encodeURIComponent(alert.sourceId || "")}`
    };
  }

  const focusMap = {
    "run-failed": "run",
    rollback: "run",
    "structure-change": "structure",
    "sla-overdue": "sla",
    "sla-warning": "sla"
  };
  const focus = focusMap[alert.type] || "alert";

  return {
    actionLabel: "查看来源状态",
    pageUrl: `/pages/source-status/index?sourceId=${encodeURIComponent(alert.sourceId || "")}&focus=${focus}`
  };
}

function buildAlertMessages() {
  return state.alertEvents
    .map(normalizeAlertEvent)
    .filter((alert) => alert.status !== "resolved")
    .map((alert) => {
      const id = `alert:${alert.id}`;
      const { actionLabel, pageUrl } = mapAlertAction(alert);
      const priorityMap = {
        high: 4,
        medium: 3,
      low: 2
    };

    return {
      id,
      type: "source-alert",
      typeLabel: mapAlertTypeLabel(alert.type),
      priority: priorityMap[alert.severity] || 2,
      title: alert.summary || "数据源告警",
      summary: alert.details || `${alert.sourceName || alert.sourceId} 需要处理`,
      createdAt: alert.createdAt,
      actionLabel,
      pageUrl,
      sourceId: alert.sourceId,
      read: isMessageRead(id)
    };
    });
}

function listMessages() {
  ensureLoaded();
  return [
    ...buildAlertMessages(),
    ...buildSubscriptionMessages(),
    ...buildFavoriteMessages(),
    ...buildHistoryMessages()
  ]
    .sort((left, right) => {
      if (left.read !== right.read) {
        return left.read ? 1 : -1;
      }
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
    })
    .map((item) => clone(item));
}

function markMessageRead(messageId) {
  ensureLoaded();
  if (!state.messageReadIds.includes(messageId)) {
    state.messageReadIds.push(messageId);
    persistState();
  }
  return {
    messageId,
    unreadCount: getUnreadMessageCount()
  };
}

function getUnreadMessageCount() {
  return listMessages().filter((item) => !item.read).length;
}

function listSavedFilters() {
  ensureLoaded();
  return state.savedFilters.map(decorateFilterRecord);
}

function getSavedFilter(savedFilterId) {
  ensureLoaded();
  const record = state.savedFilters.find((item) => item.id === savedFilterId);
  return record ? decorateFilterRecord(record) : null;
}

function saveFilterScheme(input) {
  ensureLoaded();
  const matchedPositions = state.positions
    .filter((item) => item.noticeId === input.noticeId)
    .filter((item) => matchesFilters(item, input.filters));
  const next = buildFilterRecord(
    "sf",
    {
      ...input,
      name: input.name || `${input.noticeTitle || "岗位"}筛选方案`
    },
    matchedPositions.map((item) => item.id)
  );
  state.savedFilters = [next, ...state.savedFilters].slice(0, 30);
  persistState();
  return decorateFilterRecord(next);
}

function saveSavedFilterViewPreferences(savedFilterId, viewPreferences = {}) {
  ensureLoaded();
  const record = state.savedFilters.find((item) => item.id === savedFilterId);
  if (!record) {
    throw new Error("绛涢€夋柟妗堜笉瀛樺湪");
  }

  record.viewPreferences = normalizeListViewPreferences({
    ...(record.viewPreferences || {}),
    ...viewPreferences
  });
  record.updatedAt = new Date().toISOString();
  persistState();
  return decorateFilterRecord(record);
}

function deleteSavedFilter(savedFilterId) {
  ensureLoaded();
  state.savedFilters = state.savedFilters.filter((item) => item.id !== savedFilterId);
  persistState();
  return listSavedFilters();
}

function listSubscriptions() {
  ensureLoaded();
  return state.subscriptions.map(decorateSubscriptionRecord);
}

function getSubscription(subscriptionId) {
  ensureLoaded();
  const record = state.subscriptions.find((item) => item.id === subscriptionId);
  return record ? decorateSubscriptionRecord(record) : null;
}

function createSubscription(input) {
  ensureLoaded();
  const matchedPositions = state.positions
    .filter((item) => item.noticeId === input.noticeId)
    .filter((item) => matchesFilters(item, input.filters));
  const next = buildFilterRecord(
    "sub",
    {
      ...input,
      name: input.name || `${input.noticeTitle || "岗位"}筛选订阅`
    },
    matchedPositions.map((item) => item.id)
  );
  state.subscriptions = [next, ...state.subscriptions].slice(0, 30);
  persistState();
  return decorateSubscriptionRecord(next);
}

function saveSubscriptionViewPreferences(subscriptionId, viewPreferences = {}) {
  ensureLoaded();
  const record = state.subscriptions.find((item) => item.id === subscriptionId);
  if (!record) {
    throw new Error("subscription not found");
  }

  record.viewPreferences = normalizeListViewPreferences({
    ...(record.viewPreferences || {}),
    ...viewPreferences
  });
  record.updatedAt = new Date().toISOString();
  persistState();
  return decorateSubscriptionRecord(record);
}

function markSubscriptionSeen(subscriptionId) {
  ensureLoaded();
  const record = state.subscriptions.find((item) => item.id === subscriptionId);
  if (!record) {
    return null;
  }
  const matchedPositions = getMatchedPositionsByRecord(record);
  record.seenPositionIds = matchedPositions.map((item) => item.id);
  record.updatedAt = new Date().toISOString();
  persistState();
  return decorateSubscriptionRecord(record);
}

function deleteSubscription(subscriptionId) {
  ensureLoaded();
  state.subscriptions = state.subscriptions.filter((item) => item.id !== subscriptionId);
  persistState();
  return listSubscriptions();
}

function toggleFavorite(noticeId) {
  ensureLoaded();
  if (state.favorites.includes(noticeId)) {
    state.favorites = state.favorites.filter((item) => item !== noticeId);
    if (state.noticeProgressReminderOverrides) {
      delete state.noticeProgressReminderOverrides[noticeId];
    }
  } else {
    state.favorites.push(noticeId);
  }
  persistState();
  return clone(state.favorites);
}

function recordBrowse(item) {
  ensureLoaded();
  const next = {
    ...item,
    viewedAt: item.viewedAt || new Date().toISOString()
  };
  state.browsingHistory = [next, ...state.browsingHistory.filter((entry) => entry.id !== item.id)].slice(0, 20);
  persistState();
}

function listBrowsingHistory() {
  ensureLoaded();
  return clone(state.browsingHistory);
}

function resolveReviewItem(reviewId, resolutionNote = "") {
  ensureLoaded();
  const now = new Date().toISOString();
  let resolved = null;

  state.reviewQueue = state.reviewQueue.map((item) => {
    const next = normalizeReviewItem(item);
    if (next.id !== reviewId) {
      return next;
    }
    resolved = {
      ...next,
      status: "resolved",
      resolutionNote: resolutionNote || next.resolutionNote || "",
      resolvedAt: now,
      updatedAt: now
    };
    return resolved;
  });

  if (!resolved) {
    throw new Error("复核记录不存在");
  }

  syncPendingReviewCounts();
  closeReviewAlertsForSource(resolved.sourceId);
  persistState();
  return clone(resolved);
}

function reopenReviewItem(reviewId) {
  ensureLoaded();
  const now = new Date().toISOString();
  let reopened = null;

  state.reviewQueue = state.reviewQueue.map((item) => {
    const next = normalizeReviewItem(item);
    if (next.id !== reviewId) {
      return next;
    }
    reopened = {
      ...next,
      status: "pending",
      resolvedAt: "",
      updatedAt: now
    };
    return reopened;
  });

  if (!reopened) {
    throw new Error("复核记录不存在");
  }

  syncPendingReviewCounts();
  ensureReviewAlertForSource(reopened.sourceId);
  persistState();
  return clone(reopened);
}

function getDashboardStats() {
  ensureLoaded();
  const compareGroupMetrics = buildCompareGroupMetrics(state.compareGroups);
  const subscriptionNewHitCount = state.subscriptions
    .map(decorateSubscriptionRecord)
    .reduce((sum, item) => sum + item.newMatchCount, 0);
  const unreadMessageCount = getUnreadMessageCount();
  const sourceAlertCount = state.sourceStates.filter(
    (item) =>
      Number(item.consecutiveFailureCount || 0) > 0 ||
      Number(item.pendingReviewCount || 0) > 0 ||
      Boolean(item.structureAlert) ||
      Boolean(item.fetchOverdue) ||
      Boolean(item.publishOverdue)
  ).length;
  const overdueSourceCount = state.sourceStates.filter(
    (item) => Boolean(item.fetchOverdue) || Boolean(item.publishOverdue)
  ).length;
  const pendingReviewTotal = state.reviewQueue
    .map(normalizeReviewItem)
    .filter((item) => item.status !== "resolved").length;
  const resolvedReviewTotal = state.reviewQueue
    .map(normalizeReviewItem)
    .filter((item) => item.status === "resolved").length;
  const alertEventCount = state.alertEvents
    .map(normalizeAlertEvent)
    .filter((item) => item.status !== "resolved").length;

  return {
    noticeCount: state.notices.length,
    compareGroupCount: compareGroupMetrics.compareGroupCount,
    compareGroupLimit: compareGroupMetrics.compareGroupLimit,
    compareGroupCapacityLimit: compareGroupMetrics.compareGroupCapacityLimit,
    pinnedCompareGroupCount: compareGroupMetrics.pinnedCompareGroupCount,
    fullCompareGroupCount: compareGroupMetrics.fullCompareGroupCount,
    emptyCompareGroupCount: compareGroupMetrics.emptyCompareGroupCount,
    reusableCompareGroupCount: compareGroupMetrics.reusableCompareGroupCount,
    activeCompareGroupCount: compareGroupMetrics.activeCompareGroupCount,
    remainingCompareGroupCount: compareGroupMetrics.remainingCompareGroupCount,
    reviewNeededCompareGroupCount: compareGroupMetrics.reviewNeededCompareGroupCount,
    sourceCount: state.sourceStates.length,
    sourceAlertCount,
    overdueSourceCount,
    pendingReviewTotal,
    resolvedReviewTotal,
    alertEventCount,
    favoriteCount: state.favorites.length,
    subscriptionCount: state.subscriptions.length,
    subscriptionNewHitCount,
    unreadMessageCount,
    savedFilterCount: state.savedFilters.length,
    historyCount: state.browsingHistory.length
  };
}

function __resetStateForTests() {
  seedSnapshotLoaderOverride = null;
  clearNodeSeedSnapshotCache();
  runtimeSeedModeOverride = "";
  state = buildSeedState();
}

function __setSeedSnapshotLoaderForTests(loader, options = {}) {
  seedSnapshotLoaderOverride = typeof loader === "function" ? loader : null;
  clearNodeSeedSnapshotCache();
  if (options && options.rebuild === false) {
    return;
  }
  state = buildSeedState(buildPersistedUserState(state));
}

function __setRuntimeSeedModeForTests(mode, options = {}) {
  runtimeSeedModeOverride = mode === "demo" ? "demo" : (mode === "ingested" ? "ingested" : "");
  clearNodeSeedSnapshotCache();
  if (options && options.rebuild === false) {
    return;
  }
  state = buildSeedState(buildPersistedUserState(state));
}

function __exportUserStateForServer() {
  ensureLoaded();
  return buildPersistedUserState(state);
}

function __hydrateUserStateForServer(snapshot = {}) {
  state = buildSeedState(snapshot || {});
  return clone(state);
}

function __setPositionsForTests(nextPositions) {
  ensureLoaded();
  state.positions = clone(nextPositions);
}

function __setSourceStatesForTests(nextSourceStates) {
  ensureLoaded();
  state.sourceStates = clone(nextSourceStates).map(normalizeSourceState);
}

function __setReviewQueueForTests(nextReviewQueue) {
  ensureLoaded();
  state.reviewQueue = clone(nextReviewQueue).map(normalizeReviewItem);
}

function __setAlertEventsForTests(nextAlertEvents) {
  ensureLoaded();
  state.alertEvents = clone(nextAlertEvents);
}

function __setPublishAuditsForTests(nextPublishAudits) {
  ensureLoaded();
  state.publishAudits = clone(nextPublishAudits).map(normalizePublishAudit);
}

module.exports = {
  loadState,
  listNotices,
  listSourceStates,
  listReviewQueue,
  listResolvedReviewQueue,
  listAlertEvents,
  listPublishAudits,
  listFavoriteNoticeIds,
  listFavoriteNotices,
  isFavoriteNotice,
  isMessageRead,
  getPersonalProfile,
  savePersonalProfile,
  getProgressReminderSettings,
  getProgressReminderOptions,
  saveProgressReminderSettings,
  getNoticeProgressReminderSettings,
  saveNoticeProgressReminderSettings,
  getNoticeById,
  listPositions,
  getPositionsByNoticeId,
  getPositionById,
  recommendPositions,
  listCompareGroups,
  getCompareGroup,
  getComparePositions,
  getCompareStatus,
  createCompareGroup,
  renameCompareGroup,
  saveCompareGroupPreferences,
  setCompareGroupPinned,
  deleteCompareGroup,
  recordCompareGroupAction,
  touchCompareGroup,
  addPositionToCompareGroup,
  removePositionFromCompareGroup,
  listSavedFilters,
  getSavedFilter,
  saveFilterScheme,
  saveSavedFilterViewPreferences,
  deleteSavedFilter,
  listSubscriptions,
  getSubscription,
  createSubscription,
  saveSubscriptionViewPreferences,
  markSubscriptionSeen,
  deleteSubscription,
  listMessages,
  markMessageRead,
  resolveReviewItem,
  reopenReviewItem,
  toggleFavorite,
  recordBrowse,
  listBrowsingHistory,
  getDashboardStats,
  __exportUserStateForServer,
  __hydrateUserStateForServer,
  __setSeedSnapshotLoaderForTests,
  __setRuntimeSeedModeForTests,
  __resetStateForTests,
  __setPositionsForTests,
  __setSourceStatesForTests,
  __setReviewQueueForTests,
  __setAlertEventsForTests
  ,
  __setPublishAuditsForTests
};
