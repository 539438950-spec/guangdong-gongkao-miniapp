const test = require("node:test");
const assert = require("node:assert/strict");

function loadAppDefinition() {
  const modulePath = require.resolve("../app.js");
  delete require.cache[modulePath];

  let definition = null;
  const previousApp = global.App;
  global.App = (config) => {
    definition = config;
  };

  try {
    require("../app.js");
  } finally {
    global.App = previousApp;
  }

  return definition;
}

test.afterEach(() => {
  delete global.wx;
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
