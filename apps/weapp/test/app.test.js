const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const APP_MODULE_PATH = require.resolve("../app.js");
const APP_ENV_RUNTIME_PATH = path.resolve(process.cwd(), ".tmp", "weapp-app-test-env.runtime.js");

function clearOptionalModuleCache(filePath) {
  try {
    const resolved = require.resolve(filePath);
    delete require.cache[resolved];
  } catch (_error) {
    // ignore optional modules that do not exist
  }
}

function loadAppDefinition() {
  delete require.cache[APP_MODULE_PATH];
  clearOptionalModuleCache(APP_ENV_RUNTIME_PATH);

  let definition = null;
  const previousApp = global.App;
  global.App = (config) => {
    definition = config;
  };

  try {
    require(APP_MODULE_PATH);
  } finally {
    global.App = previousApp;
  }

  return definition;
}

test.afterEach(() => {
  delete global.wx;
  delete process.env.GONGKAO_WEAPP_RUNTIME_ENV_PATH;
  if (fs.existsSync(APP_ENV_RUNTIME_PATH)) {
    fs.rmSync(APP_ENV_RUNTIME_PATH, { force: true });
  }
  delete require.cache[APP_MODULE_PATH];
  clearOptionalModuleCache(APP_ENV_RUNTIME_PATH);
});

test("app should fall back to env defaults when runtime storage is empty", () => {
  global.wx = {
    getStorageSync(key) {
      if (key === "gongkao-api-mode") {
        return "";
      }
      if (key === "gongkao-api-base-url") {
        return "";
      }
      return "";
    }
  };

  const app = loadAppDefinition();
  const context = {
    globalData: {
      ...app.globalData,
      apiDefaultMode: "remote",
      apiDefaultBaseUrl: "https://gateway.example.com/gongkao"
    }
  };

  app.onLaunch.call(context);

  assert.equal(context.globalData.apiMode, "remote");
  assert.equal(context.globalData.apiBaseUrl, "https://gateway.example.com/gongkao");
  assert.equal(context.globalData.apiConfigSource, "project-default");
});

test("app should prefer stored runtime config over env defaults", () => {
  global.wx = {
    getStorageSync(key) {
      if (key === "gongkao-api-mode") {
        return "remote";
      }
      if (key === "gongkao-api-base-url") {
        return "https://stored.example.com/gongkao/";
      }
      return "";
    }
  };

  const app = loadAppDefinition();
  const context = {
    globalData: {
      ...app.globalData,
      apiDefaultMode: "local",
      apiDefaultBaseUrl: ""
    }
  };

  app.onLaunch.call(context);

  assert.equal(context.globalData.apiMode, "remote");
  assert.equal(context.globalData.apiBaseUrl, "https://stored.example.com/gongkao");
  assert.equal(context.globalData.apiConfigSource, "saved");
});

test("app should prefer generated runtime env defaults before static env defaults", () => {
  fs.mkdirSync(path.dirname(APP_ENV_RUNTIME_PATH), { recursive: true });
  fs.writeFileSync(APP_ENV_RUNTIME_PATH, [
    "module.exports = {",
    "  apiMode: \"remote\",",
    "  apiBaseUrl: \"http://127.0.0.1:53492\",",
    "  apiDefaultLabel: \"最近一次本机 Demo\"",
    "};",
    ""
  ].join("\n"), "utf8");
  process.env.GONGKAO_WEAPP_RUNTIME_ENV_PATH = APP_ENV_RUNTIME_PATH;

  global.wx = {
    getStorageSync() {
      return "";
    }
  };

  const app = loadAppDefinition();
  const context = {
    globalData: {
      ...app.globalData
    }
  };

  app.onLaunch.call(context);

  assert.equal(context.globalData.apiDefaultMode, "remote");
  assert.equal(context.globalData.apiDefaultBaseUrl, "http://127.0.0.1:53492");
  assert.equal(context.globalData.apiBaseUrl, "http://127.0.0.1:53492");
  assert.equal(context.globalData.apiConfigSource, "project-default");
});
