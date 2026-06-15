const appEnv = require("./env");

function loadOptionalModule(defaultPath) {
  try {
    if (typeof process !== "undefined" && process && process.env && process.env.GONGKAO_WEAPP_RUNTIME_ENV_PATH) {
      return require(process.env.GONGKAO_WEAPP_RUNTIME_ENV_PATH);
    }
  } catch (_error) {
    // Ignore runtime-path override lookup failures and fall back to the default path.
  }

  try {
    return require(defaultPath);
  } catch (_error) {
    return {};
  }
}

let appRuntimeEnv = {};
appRuntimeEnv = loadOptionalModule("./env.runtime");

let appLocalEnv = {};
try {
  appLocalEnv = require("./env.local");
} catch (_error) {
  appLocalEnv = {};
}

const resolvedEnv = {
  ...appEnv,
  ...appRuntimeEnv,
  ...appLocalEnv
};

function normalizeMode(mode) {
  return mode === "remote" ? "remote" : "local";
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/$/, "");
}

App({
  globalData: {
    compareSelections: [],
    apiMode: normalizeMode(resolvedEnv.apiMode),
    apiBaseUrl: normalizeBaseUrl(resolvedEnv.apiBaseUrl),
    apiDefaultMode: normalizeMode(resolvedEnv.apiMode),
    apiDefaultBaseUrl: normalizeBaseUrl(resolvedEnv.apiBaseUrl),
    apiDefaultLabel: String(resolvedEnv.apiDefaultLabel || "项目默认").trim(),
    apiConfigSource: "project-default"
  },

  onLaunch() {
    if (typeof wx === "undefined" || typeof wx.getStorageSync !== "function") {
      return;
    }

    try {
      const storedMode = String(wx.getStorageSync("gongkao-api-mode") || "").trim();
      const storedBaseUrl = normalizeBaseUrl(wx.getStorageSync("gongkao-api-base-url") || "");

      this.globalData.apiMode = storedMode
        ? normalizeMode(storedMode)
        : this.globalData.apiDefaultMode;
      this.globalData.apiBaseUrl = storedBaseUrl || this.globalData.apiDefaultBaseUrl;
      this.globalData.apiConfigSource = (storedMode || storedBaseUrl) ? "saved" : "project-default";
    } catch (_error) {
      this.globalData.apiMode = this.globalData.apiDefaultMode;
      this.globalData.apiBaseUrl = this.globalData.apiDefaultBaseUrl;
      this.globalData.apiConfigSource = "project-default";
    }
  }
});
