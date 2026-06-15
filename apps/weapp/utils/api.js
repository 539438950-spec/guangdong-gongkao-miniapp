const handlers = require("./api-handlers");

const API_MODE_STORAGE_KEY = "gongkao-api-mode";
const API_BASE_URL_STORAGE_KEY = "gongkao-api-base-url";
const API_HEALTH_DIAGNOSTICS_STORAGE_KEY = "gongkao-api-health-diagnostics";
const REMOTE_ONLY_ACTIONS = new Set([
  "listPositionOverrides",
  "savePositionOverride",
  "deletePositionOverride",
  "setSourceReleaseOverride",
  "listPublishAudits",
  "resolveStaleReviewItems"
]);
const CONNECTION_PRESETS = [
  {
    id: "local-store",
    name: "本地 Store",
    mode: "local",
    baseUrl: "",
    badge: "离线",
    description: "直接读取小程序内置快照数据，不依赖远端 API。"
  },
  {
    id: "local-dev",
    name: "本机开发",
    mode: "remote",
    baseUrl: "http://127.0.0.1:3100",
    badge: "开发",
    description: "适合开发者工具或模拟器联调本机 Node API 服务。"
  },
  {
    id: "lan-debug",
    name: "局域网联调",
    mode: "remote",
    baseUrl: "http://192.168.1.10:3100",
    badge: "真机",
    description: "适合真机调试，请替换成电脑在同一局域网内的实际 IP。"
  },
  {
    id: "cloud-prod",
    name: "云端环境",
    mode: "remote",
    baseUrl: "https://api.example.com/gongkao",
    badge: "上线",
    description: "适合连接已部署的 API 网关、云函数或后端服务。"
  }
];

function cloneValue(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

let runtimeConfig = {
  override: false,
  mode: "local",
  baseUrl: "",
  sourceType: "saved"
};
let runtimeHealthDiagnostics = null;

function hasWxRequest() {
  return typeof wx !== "undefined" && typeof wx.request === "function";
}

function hasWxStorage() {
  return typeof wx !== "undefined" && typeof wx.getStorageSync === "function";
}

function getAppConfig() {
  if (typeof getApp !== "function") {
    return {};
  }
  try {
    const app = getApp();
    return (app && app.globalData) || {};
  } catch (_error) {
    return {};
  }
}

function normalizeMode(mode) {
  return mode === "remote" ? "remote" : "local";
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/$/, "");
}

function isLoopbackBaseUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(normalized);
}

function isProjectDefaultLoopbackRuntime(config = {}) {
  return config.mode === "remote"
    && config.sourceType === "project-default"
    && isLoopbackBaseUrl(config.baseUrl);
}

function normalizeDiagnostics(input) {
  if (!input) {
    return null;
  }
  return {
    status: input.status === "failure" ? "failure" : "success",
    statusLabel: input.status === "failure" ? "最近失败" : "最近成功",
    baseUrl: normalizeBaseUrl(input.baseUrl),
    checkedAt: String(input.checkedAt || ""),
    message: String(input.message || ""),
    userStateFile: String(input.userStateFile || "")
  };
}

function mapConfigSourceLabel(sourceType) {
  if (sourceType === "saved") {
    return "用户保存";
  }
  if (sourceType === "project-default") {
    return "项目默认";
  }
  if (sourceType === "test") {
    return "测试覆盖";
  }
  return "运行时";
}

function getResolvedConnectionPresets() {
  const presets = CONNECTION_PRESETS.map((preset) => ({ ...preset }));
  const appConfig = getAppConfig();
  const appDefaultMode = normalizeMode(appConfig.apiDefaultMode);
  const appDefaultBaseUrl = normalizeBaseUrl(appConfig.apiDefaultBaseUrl);
  const appDefaultLabel = String(appConfig.apiDefaultLabel || "").trim();
  const localDevPreset = presets.find((item) => item.id === "local-dev");

  if (localDevPreset && appDefaultMode === "remote" && isLoopbackBaseUrl(appDefaultBaseUrl)) {
    localDevPreset.baseUrl = appDefaultBaseUrl;
    localDevPreset.name = "本机开发";
    localDevPreset.description = "跟随最近一次本机 Demo / 开发态 API 地址，适合微信开发者工具直接联调。";
  }

  if (!appDefaultLabel && appDefaultMode === "local" && !appDefaultBaseUrl) {
    return presets;
  }

  const appPreset = {
    id: "project-default",
    name: appDefaultLabel || (appDefaultMode === "remote" ? "项目默认" : "本地默认"),
    mode: appDefaultMode,
    baseUrl: appDefaultBaseUrl,
    badge: "项目",
    description: appDefaultMode === "remote"
      ? "来自 apps/weapp/env.js 的默认远端连接配置，可直接用于真机联调或云端网关。"
      : "来自 apps/weapp/env.js 的默认本地连接配置。"
  };

  const duplicatedIndex = presets.findIndex((item) => {
    if (item.id === "local-dev" && isLoopbackBaseUrl(appPreset.baseUrl)) {
      return false;
    }
    return item.mode === appPreset.mode && item.baseUrl === appPreset.baseUrl;
  });
  if (duplicatedIndex >= 0) {
    presets.splice(duplicatedIndex, 1);
  }

  presets.unshift(appPreset);
  return presets;
}

function buildRuntimeConfig(mode, baseUrl, sourceType) {
  const normalized = {
    mode: normalizeMode(mode),
    baseUrl: normalizeBaseUrl(baseUrl)
  };
  const activePreset = getResolvedConnectionPresets().find(
    (preset) => preset.mode === normalized.mode && preset.baseUrl === normalized.baseUrl
  );

  return {
    ...normalized,
    usingRemote: normalized.mode === "remote" && Boolean(normalized.baseUrl),
    healthUrl: normalized.baseUrl ? `${normalized.baseUrl}/health` : "",
    activePresetId: activePreset ? activePreset.id : "",
    sourceType: sourceType || "saved",
    sourceLabel: mapConfigSourceLabel(sourceType || "saved")
  };
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function readStoredRuntimeConfig() {
  if (!hasWxStorage()) {
    return {
      mode: "",
      baseUrl: ""
    };
  }

  try {
    return {
      mode: String(wx.getStorageSync(API_MODE_STORAGE_KEY) || ""),
      baseUrl: normalizeBaseUrl(wx.getStorageSync(API_BASE_URL_STORAGE_KEY) || "")
    };
  } catch (_error) {
    return {
      mode: "",
      baseUrl: ""
    };
  }
}

function readStoredHealthDiagnostics() {
  if (!hasWxStorage()) {
    return null;
  }
  try {
    return normalizeDiagnostics(wx.getStorageSync(API_HEALTH_DIAGNOSTICS_STORAGE_KEY));
  } catch (_error) {
    return null;
  }
}

function clearStoredRuntimeConfig() {
  if (!hasWxStorage()) {
    return;
  }
  try {
    if (typeof wx.removeStorageSync === "function") {
      wx.removeStorageSync(API_MODE_STORAGE_KEY);
      wx.removeStorageSync(API_BASE_URL_STORAGE_KEY);
      return;
    }
    wx.setStorageSync(API_MODE_STORAGE_KEY, "");
    wx.setStorageSync(API_BASE_URL_STORAGE_KEY, "");
  } catch (_error) {
    // Ignore storage failures in local preview mode.
  }
}

function writeStoredHealthDiagnostics(nextDiagnostics) {
  if (!hasWxStorage()) {
    return;
  }
  try {
    wx.setStorageSync(API_HEALTH_DIAGNOSTICS_STORAGE_KEY, nextDiagnostics || "");
  } catch (_error) {
    // Ignore storage failures in local preview mode.
  }
}

function writeStoredRuntimeConfig(nextConfig) {
  if (!hasWxStorage()) {
    return;
  }
  try {
    wx.setStorageSync(API_MODE_STORAGE_KEY, nextConfig.mode);
    wx.setStorageSync(API_BASE_URL_STORAGE_KEY, nextConfig.baseUrl);
  } catch (_error) {
    // Ignore storage failures in local preview mode.
  }
}

function writeAppRuntimeConfig(nextConfig) {
  const appConfig = getAppConfig();
  if (!appConfig) {
    return;
  }
  appConfig.apiMode = nextConfig.mode;
  appConfig.apiBaseUrl = nextConfig.baseUrl;
  appConfig.apiConfigSource = nextConfig.sourceType || "saved";
}

function writeAppHealthDiagnostics(nextDiagnostics) {
  const appConfig = getAppConfig();
  if (!appConfig) {
    return;
  }
  appConfig.apiHealthDiagnostics = nextDiagnostics || null;
}

function getProjectDefaultRuntimeConfig() {
  const appConfig = getAppConfig();
  return buildRuntimeConfig(
    appConfig.apiDefaultMode || "local",
    appConfig.apiDefaultBaseUrl || "",
    "project-default"
  );
}

function getRuntimeConfig() {
  let mode = runtimeConfig.override ? runtimeConfig.mode : "";
  let baseUrl = runtimeConfig.override ? runtimeConfig.baseUrl : "";
  let sourceType = runtimeConfig.override ? runtimeConfig.sourceType : "";

  if (!mode && !baseUrl) {
    const appConfig = getAppConfig();
    mode = String(appConfig.apiMode || "");
    baseUrl = normalizeBaseUrl(appConfig.apiBaseUrl || "");
    sourceType = String(appConfig.apiConfigSource || "");
  }

  if (!mode && !baseUrl) {
    const stored = readStoredRuntimeConfig();
    mode = stored.mode;
    baseUrl = stored.baseUrl;
    sourceType = "saved";
  }

  return buildRuntimeConfig(mode, baseUrl, sourceType || "project-default");
}

function getConnectionDiagnosticsLegacy(inputConfig) {
  const config = inputConfig || getRuntimeConfig();
  let diagnostics = runtimeHealthDiagnostics;

  if (!diagnostics) {
    const appConfig = getAppConfig();
    diagnostics = normalizeDiagnostics(appConfig.apiHealthDiagnostics);
  }

  if (!diagnostics) {
    diagnostics = readStoredHealthDiagnostics();
  }

  if (!diagnostics) {
    return {
      status: "idle",
      statusLabel: "尚未检测",
      baseUrl: "",
      checkedAt: "",
      message: config.mode === "remote"
        ? "当前还没有保存的健康检查结果。"
        : "本地模式不需要远端健康检查。",
      userStateFile: "",
      isForCurrentConfig: false
    };
  }

  return {
    ...diagnostics,
    isForCurrentConfig: config.mode === "remote" && diagnostics.baseUrl === config.baseUrl
  };
}

function getConnectionDiagnostics(inputConfig) {
  const config = inputConfig || getRuntimeConfig();
  let diagnostics = runtimeHealthDiagnostics;

  if (!diagnostics) {
    const appConfig = getAppConfig();
    diagnostics = normalizeDiagnostics(appConfig.apiHealthDiagnostics);
  }

  if (!diagnostics) {
    diagnostics = readStoredHealthDiagnostics();
  }

  if (!diagnostics) {
    return {
      status: "idle",
      statusLabel: "尚未检测",
      scopeLabel: "无记录",
      baseUrl: "",
      checkedAt: "",
      message: config.mode === "remote"
        ? "当前还没有保存的健康检查结果。"
        : "本地模式不需要远端健康检查。",
      userStateFile: "",
      isForCurrentConfig: false
    };
  }

  const isForCurrentConfig = config.mode === "remote" && diagnostics.baseUrl === config.baseUrl;
  const scopeLabel = isForCurrentConfig ? "当前连接" : "历史记录";
  const statusLabelMap = {
    success: isForCurrentConfig ? "当前连接正常" : "历史连接曾正常",
    failure: isForCurrentConfig ? "当前连接异常" : "历史连接曾失败",
    idle: isForCurrentConfig ? "当前连接未检测" : "历史连接无检测"
  };

  return {
    ...diagnostics,
    statusLabel: statusLabelMap[diagnostics.status] || diagnostics.statusLabel || "最近检测",
    scopeLabel,
    isForCurrentConfig
  };
}

function persistHealthDiagnostics(nextDiagnostics) {
  const normalized = normalizeDiagnostics(nextDiagnostics);
  runtimeHealthDiagnostics = normalized;
  writeAppHealthDiagnostics(normalized);
  writeStoredHealthDiagnostics(normalized);
  return normalized;
}

function shouldUseRemote() {
  return getRuntimeConfig().usingRemote;
}

function listConnectionPresets() {
  return cloneValue(getResolvedConnectionPresets());
}

function getConnectionPreset(presetId) {
  const preset = getResolvedConnectionPresets().find((item) => item.id === presetId);
  return cloneValue(preset || null);
}

function getConnectionSummary(input) {
  const config = input
    ? buildRuntimeConfig(input.mode, input.baseUrl, input.sourceType)
    : getRuntimeConfig();
  const preset = config.activePresetId ? getConnectionPreset(config.activePresetId) : null;

  if (config.mode === "local") {
    return {
      modeLabel: "本地 Store",
      endpointLabel: "不经过远端 API",
      healthLabel: "无需检测",
      presetLabel: preset ? preset.name : "本地模式",
      sourceLabel: config.sourceLabel,
      hint: "当前直接读取小程序内置数据，适合离线演示和开发阶段自测。",
      canTestHealth: false,
      isConfigured: true
    };
  }

  if (!config.baseUrl) {
    return {
      modeLabel: "远端 API",
      endpointLabel: "未配置",
      healthLabel: "无法检测",
      presetLabel: "待完善",
      sourceLabel: config.sourceLabel,
      hint: "远端模式必须填写 Base URL，保存后才能真正切换到后端数据链路。",
      canTestHealth: false,
      isConfigured: false
    };
  }

  return {
    modeLabel: "远端 API",
    endpointLabel: config.baseUrl,
    healthLabel: config.healthUrl,
    presetLabel: preset ? preset.name : "自定义远端",
    sourceLabel: config.sourceLabel,
    hint: preset
      ? `当前连接使用“${preset.name}”预设，可继续做连通性检测。`
      : "当前连接使用自定义远端地址，建议先做一次连通性检测。",
    canTestHealth: true,
    isConfigured: true
  };
}

function validateRuntimeConfig(input = {}) {
  const config = buildRuntimeConfig(input.mode, input.baseUrl);

  if (config.mode === "remote" && !config.baseUrl) {
    return {
      ok: false,
      errorMessage: "远端模式必须填写 API Base URL"
    };
  }

  if (config.mode === "remote" && config.baseUrl && !isHttpUrl(config.baseUrl)) {
    return {
      ok: false,
      errorMessage: "API Base URL 必须以 http:// 或 https:// 开头"
    };
  }

  return {
    ok: true,
    config
  };
}

function sendWxRequest(baseUrl, pathname, method, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl.replace(/\/$/, "")}${pathname}`,
      method,
      data,
      header: {
        "content-type": "application/json"
      },
      success(response) {
        const payload = response.data || {};
        if (response.statusCode >= 400 || payload.ok === false) {
          reject(new Error(payload.error || `request failed: ${response.statusCode}`));
          return;
        }
        resolve(payload.data);
      },
      fail(error) {
        reject(new Error(error.errMsg || "request failed"));
      }
    });
  });
}

function sendNodeRequest(baseUrl, pathname, method, data) {
  const target = `${baseUrl.replace(/\/$/, "")}${pathname}`;
  const body = data === undefined ? undefined : JSON.stringify(data);
  if (typeof fetch !== "function") {
    return Promise.reject(new Error("fetch is not available in the current runtime"));
  }
  return fetch(target, {
    method,
    headers: {
      "content-type": "application/json"
    },
    body
  }).then(async (response) => {
    const payload = await response.json();
    if (response.status >= 400 || payload.ok === false) {
      throw new Error(payload.error || `request failed: ${response.status}`);
    }
    return payload.data;
  }).catch((error) => {
    const causeMessage = error && error.cause && error.cause.message
      ? String(error.cause.message)
      : "";
    const causeCode = error && error.cause && error.cause.code
      ? String(error.cause.code)
      : "";
    const originalMessage = error && error.message ? String(error.message) : "";
    const normalizedMessage = causeCode
      || causeMessage
      || originalMessage
      || "request failed";
    throw new Error(
      /request failed|ECONNREFUSED|connect/i.test(normalizedMessage)
        ? normalizedMessage
        : `request failed: ${normalizedMessage}`
    );
  });
}

function requestJson(baseUrl, pathname, method, data) {
  if (hasWxRequest()) {
    return sendWxRequest(baseUrl, pathname, method, data);
  }
  return sendNodeRequest(baseUrl, pathname, method, data);
}

function callRemote(action, args) {
  const { baseUrl } = getRuntimeConfig();
  if (!baseUrl) {
    return Promise.reject(new Error("remote api base url is not configured"));
  }
  return requestJson(baseUrl, "/rpc", "POST", { action, args });
}

function callLocal(action, args) {
  return Promise.resolve(cloneValue(handlers[action](...args)));
}

function callAction(action, args = []) {
  const config = getRuntimeConfig();
  if (config.usingRemote) {
    return callRemote(action, args).catch((error) => {
      const message = error && error.message ? String(error.message) : "";
      const canFallbackToLocal = !REMOTE_ONLY_ACTIONS.has(action)
        && isProjectDefaultLoopbackRuntime(config)
        && /request failed|ECONNREFUSED|connect/i.test(message);

      if (!canFallbackToLocal) {
        throw error;
      }

      return callLocal(action, args);
    });
  }
  if (!handlers[action]) {
    if (REMOTE_ONLY_ACTIONS.has(action)) {
      return Promise.reject(new Error(`api action requires remote mode: ${action}`));
    }
    return Promise.reject(new Error(`unknown api action: ${action}`));
  }
  return callLocal(action, args);
}

function listNotices() {
  return callAction("listNotices");
}

function listSourceStates() {
  return callAction("listSourceStates");
}

function listReviewQueue() {
  return callAction("listReviewQueue");
}

function listResolvedReviewQueue() {
  return callAction("listResolvedReviewQueue");
}

function listAlertEvents() {
  return callAction("listAlertEvents");
}

function getNoticeDetail(id) {
  return callAction("getNoticeDetail", [id]);
}

function listPositionsByNotice(noticeId, compareGroupId) {
  return callAction("listPositionsByNotice", [noticeId, compareGroupId]);
}

function listCompareGroups() {
  return callAction("listCompareGroups");
}

function getCompareGroupDetail(groupId) {
  return callAction("getCompareGroupDetail", [groupId]);
}

function getRecommendedPositions(positionId, limit) {
  return callAction("getRecommendedPositions", [positionId, limit]);
}

function createCompareGroup(name, examType, options) {
  return callAction("createCompareGroup", [name, examType, options]);
}

function renameCompareGroup(groupId, name) {
  return callAction("renameCompareGroup", [groupId, name]);
}

function saveCompareGroupPreferences(groupId, preferences) {
  return callAction("saveCompareGroupPreferences", [groupId, preferences]);
}

function setCompareGroupPinned(groupId, pinned, pinnedAt) {
  return callAction("setCompareGroupPinned", [groupId, pinned, pinnedAt]);
}

function deleteCompareGroup(groupId) {
  return callAction("deleteCompareGroup", [groupId]);
}

function recordCompareGroupAction(groupId, context) {
  return callAction("recordCompareGroupAction", [groupId, context]);
}

function touchCompareGroup(groupId, touchedAt) {
  return callAction("touchCompareGroup", [groupId, touchedAt]);
}

function addPositionToGroup(groupId, positionId, context) {
  return callAction("addPositionToGroup", [groupId, positionId, context]);
}

function removePositionFromGroup(groupId, positionId) {
  return callAction("removePositionFromGroup", [groupId, positionId]);
}

function listSavedFilters() {
  return callAction("listSavedFilters");
}

function getSavedFilter(savedFilterId) {
  return callAction("getSavedFilter", [savedFilterId]);
}

function saveFilterScheme(input) {
  return callAction("saveFilterScheme", [input]);
}

function saveSavedFilterViewPreferences(savedFilterId, viewPreferences) {
  return callAction("saveSavedFilterViewPreferences", [savedFilterId, viewPreferences]);
}

function deleteSavedFilter(savedFilterId) {
  return callAction("deleteSavedFilter", [savedFilterId]);
}

function listSubscriptions() {
  return callAction("listSubscriptions");
}

function getSubscription(subscriptionId) {
  return callAction("getSubscription", [subscriptionId]);
}

function createSubscription(input) {
  return callAction("createSubscription", [input]);
}

function saveSubscriptionViewPreferences(subscriptionId, viewPreferences) {
  return callAction("saveSubscriptionViewPreferences", [subscriptionId, viewPreferences]);
}

function markSubscriptionSeen(subscriptionId) {
  return callAction("markSubscriptionSeen", [subscriptionId]);
}

function deleteSubscription(subscriptionId) {
  return callAction("deleteSubscription", [subscriptionId]);
}

function listMessages() {
  return callAction("listMessages");
}

function markMessageRead(messageId) {
  return callAction("markMessageRead", [messageId]);
}

function getPersonalProfile() {
  return callAction("getPersonalProfile");
}

function savePersonalProfile(input) {
  return callAction("savePersonalProfile", [input]);
}

function getProgressReminderSettings() {
  return callAction("getProgressReminderSettings");
}

function saveProgressReminderSettings(input) {
  return callAction("saveProgressReminderSettings", [input]);
}

function getNoticeProgressReminderSettings(noticeId) {
  return callAction("getNoticeProgressReminderSettings", [noticeId]);
}

function saveNoticeProgressReminderSettings(noticeId, input) {
  return callAction("saveNoticeProgressReminderSettings", [noticeId, input]);
}

function resolveReviewItem(reviewId, resolutionNote) {
  return callAction("resolveReviewItem", [reviewId, resolutionNote]);
}

function reopenReviewItem(reviewId) {
  return callAction("reopenReviewItem", [reviewId]);
}

function resolveStaleReviewItems(input) {
  return callAction("resolveStaleReviewItems", [input || {}]);
}

function listPositionOverrides() {
  return callAction("listPositionOverrides");
}

function savePositionOverride(input) {
  return callAction("savePositionOverride", [input]);
}

function deletePositionOverride(ruleId) {
  return callAction("deletePositionOverride", [ruleId]);
}

function setSourceReleaseOverride(input) {
  return callAction("setSourceReleaseOverride", [input]);
}

function listPublishAudits(sourceId) {
  return callAction("listPublishAudits", [sourceId]);
}

function toggleFavoriteNotice(noticeId) {
  return callAction("toggleFavoriteNotice", [noticeId]);
}

function listFavoriteNotices() {
  return callAction("listFavoriteNotices");
}

function listBrowsingHistory() {
  return callAction("listBrowsingHistory");
}

function getDashboard() {
  return callAction("getDashboard");
}

function saveRuntimeConfig(input = {}) {
  const validation = validateRuntimeConfig(input);
  if (!validation.ok) {
    return Promise.reject(new Error(validation.errorMessage));
  }
  const nextConfig = validation.config;

  runtimeConfig = {
    override: true,
    mode: nextConfig.mode,
    baseUrl: nextConfig.baseUrl,
    sourceType: "saved"
  };
  const persistedConfig = {
    ...nextConfig,
    sourceType: "saved"
  };
  writeAppRuntimeConfig(persistedConfig);
  writeStoredRuntimeConfig(persistedConfig);
  return Promise.resolve(buildRuntimeConfig(nextConfig.mode, nextConfig.baseUrl, "saved"));
}

function resetRuntimeConfig() {
  const projectDefaultConfig = getProjectDefaultRuntimeConfig();
  runtimeConfig = {
    override: true,
    mode: projectDefaultConfig.mode,
    baseUrl: projectDefaultConfig.baseUrl,
    sourceType: "project-default"
  };
  clearStoredRuntimeConfig();
  writeAppRuntimeConfig(projectDefaultConfig);
  return Promise.resolve(projectDefaultConfig);
}

function testRemoteHealth(baseUrl) {
  const targetBaseUrl = normalizeBaseUrl(baseUrl || getRuntimeConfig().baseUrl);
  if (!targetBaseUrl) {
    return Promise.reject(new Error("remote api base url is not configured"));
  }
  return requestJson(targetBaseUrl, "/health", "GET").then((payload) => {
    const diagnostics = persistHealthDiagnostics({
      status: "success",
      baseUrl: targetBaseUrl,
      checkedAt: new Date().toISOString(),
      message: `健康检查通过：${targetBaseUrl}`,
      userStateFile: payload ? payload.userStateFile : ""
    });
    return {
      baseUrl: targetBaseUrl,
      status: payload && payload.status ? payload.status : "ok",
      userStateFile: payload ? payload.userStateFile : "",
      checkedAt: diagnostics.checkedAt,
      diagnostics
    };
  }).catch((error) => {
    const diagnostics = persistHealthDiagnostics({
      status: "failure",
      baseUrl: targetBaseUrl,
      checkedAt: new Date().toISOString(),
      message: error.message
    });
    error.diagnostics = diagnostics;
    throw error;
  });
}

function setRuntimeConfigForTests(nextConfig = {}) {
  runtimeConfig = {
    override: true,
    mode: normalizeMode(nextConfig.mode),
    baseUrl: normalizeBaseUrl(nextConfig.baseUrl),
    sourceType: nextConfig.sourceType || "test"
  };
  runtimeHealthDiagnostics = normalizeDiagnostics(nextConfig.healthDiagnostics || null);
}

module.exports = {
  listNotices,
  listSourceStates,
  listReviewQueue,
  listResolvedReviewQueue,
  listAlertEvents,
  getNoticeDetail,
  listPositionsByNotice,
  listCompareGroups,
  getCompareGroupDetail,
  getRecommendedPositions,
  createCompareGroup,
  renameCompareGroup,
  saveCompareGroupPreferences,
  setCompareGroupPinned,
  deleteCompareGroup,
  recordCompareGroupAction,
  touchCompareGroup,
  addPositionToGroup,
  removePositionFromGroup,
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
  getPersonalProfile,
  savePersonalProfile,
  getProgressReminderSettings,
  saveProgressReminderSettings,
  getNoticeProgressReminderSettings,
  saveNoticeProgressReminderSettings,
  resolveReviewItem,
  reopenReviewItem,
  resolveStaleReviewItems,
  listPositionOverrides,
  savePositionOverride,
  deletePositionOverride,
  setSourceReleaseOverride,
  listPublishAudits,
  toggleFavoriteNotice,
  listFavoriteNotices,
  listBrowsingHistory,
  getDashboard,
  getRuntimeConfig,
  getConnectionDiagnostics,
  listConnectionPresets,
  getConnectionPreset,
  getConnectionSummary,
  validateRuntimeConfig,
  saveRuntimeConfig,
  resetRuntimeConfig,
  testRemoteHealth,
  setRuntimeConfigForTests
};
