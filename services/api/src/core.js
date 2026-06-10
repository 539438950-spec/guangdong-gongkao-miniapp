const fs = require("node:fs");
const path = require("node:path");

const handlers = require("../../../apps/weapp/utils/api-handlers");
const store = require("../../../apps/weapp/utils/store");
const { applyReviewAction, resolveStaleReviewItems } = require("../../ingest/src/review-actions");
const {
  listPositionOverrides,
  upsertPositionOverride,
  deletePositionOverride
} = require("../../ingest/src/override-actions");
const {
  setSourceReleaseOverride,
  listPublishAudits
} = require("../../ingest/src/release-actions");

const READ_ACTIONS = new Set([
  "listNotices",
  "listSourceStates",
  "listReviewQueue",
  "listResolvedReviewQueue",
  "listAlertEvents",
  "getNoticeDetail",
  "listPositionsByNotice",
  "listCompareGroups",
  "getCompareGroupDetail",
  "getRecommendedPositions",
  "listSavedFilters",
  "getSavedFilter",
  "listSubscriptions",
  "getSubscription",
  "listMessages",
  "getPersonalProfile",
  "getProgressReminderSettings",
  "getNoticeProgressReminderSettings",
  "listFavoriteNotices",
  "listBrowsingHistory",
  "getDashboard",
  "listPositionOverrides",
  "listPublishAudits"
]);
const REMOTE_ONLY_ACTIONS = new Set([
  "listPositionOverrides",
  "savePositionOverride",
  "deletePositionOverride",
  "setSourceReleaseOverride",
  "listPublishAudits",
  "resolveStaleReviewItems"
]);

function defaultPaths() {
  return {
    userStateFile: path.resolve(__dirname, "../var/user-state.json"),
    snapshotTarget: path.resolve(__dirname, "../../../apps/weapp/data/ingested.js"),
    ingestStoreRoot: path.resolve(__dirname, "../../ingest/var"),
    positionOverridePath: path.resolve(__dirname, "../../ingest/var/position-overrides.json"),
    demoSnapshotTarget: path.resolve(__dirname, "../../../apps/weapp/data/demo.js")
  };
}

function createJsonHeaders(extraHeaders = {}) {
  return {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    ...extraHeaders
  };
}

function loadUserState(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function persistUserState(filePath) {
  const snapshot = store.__exportUserStateForServer();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}

function hydrateUserState(filePath) {
  const snapshot = loadUserState(filePath);
  store.__hydrateUserStateForServer(snapshot);
}

function createSeedSnapshotLoader(options) {
  return () => {
    const ingestedPath = options.snapshotTarget || defaultPaths().snapshotTarget;
    const demoPath = options.demoSnapshotTarget || defaultPaths().demoSnapshotTarget;

    delete require.cache[require.resolve(ingestedPath)];
    delete require.cache[require.resolve(demoPath)];

    const ingested = require(ingestedPath);
    const demo = require(demoPath);
    const seed = ingested.notices && ingested.notices.length ? ingested : demo;
    return {
      seed,
      seedVersion: seed.updatedAt || "demo"
    };
  };
}

function normalizeOptions(options = {}) {
  const defaults = defaultPaths();
  return {
    userStateFile: options.userStateFile || defaults.userStateFile,
    snapshotTarget: options.snapshotTarget || defaults.snapshotTarget,
    ingestStoreRoot: options.ingestStoreRoot || defaults.ingestStoreRoot,
    positionOverridePath: options.positionOverridePath || defaults.positionOverridePath,
    demoSnapshotTarget: options.demoSnapshotTarget || defaults.demoSnapshotTarget,
    routeBasePath: String(options.routeBasePath || "").trim()
  };
}

function normalizeRoutePath(pathname, routeBasePath) {
  const normalizedPath = String(pathname || "/").trim() || "/";
  const normalizedBase = String(routeBasePath || "").trim().replace(/\/$/, "");

  if (!normalizedBase || normalizedBase === "/") {
    return normalizedPath;
  }

  if (normalizedPath === normalizedBase) {
    return "/";
  }

  if (normalizedPath.startsWith(`${normalizedBase}/`)) {
    return normalizedPath.slice(normalizedBase.length) || "/";
  }

  return normalizedPath;
}

async function invokeAction(action, args, options) {
  if (action === "resolveReviewItem") {
    const result = await applyReviewAction({
      action: "resolve",
      reviewId: args[0],
      note: args[1] || "",
      storeRoot: options.ingestStoreRoot,
      snapshotTarget: options.snapshotTarget,
      now: new Date()
    });
    return result.result;
  }

  if (action === "reopenReviewItem") {
    const result = await applyReviewAction({
      action: "reopen",
      reviewId: args[0],
      storeRoot: options.ingestStoreRoot,
      snapshotTarget: options.snapshotTarget,
      now: new Date()
    });
    return result.result;
  }

  if (action === "resolveStaleReviewItems") {
    return resolveStaleReviewItems({
      sourceId: (args[0] && args[0].sourceId) || "",
      note: (args[0] && args[0].note) || "",
      storeRoot: options.ingestStoreRoot,
      snapshotTarget: options.snapshotTarget,
      now: new Date()
    });
  }

  if (action === "listPositionOverrides") {
    return listPositionOverrides({
      positionOverridePath: options.positionOverridePath
    });
  }

  if (action === "savePositionOverride") {
    return upsertPositionOverride(args[0] || {}, {
      storeRoot: options.ingestStoreRoot,
      snapshotTarget: options.snapshotTarget,
      positionOverridePath: options.positionOverridePath,
      now: new Date().toISOString()
    });
  }

  if (action === "deletePositionOverride") {
    return deletePositionOverride(args[0], {
      storeRoot: options.ingestStoreRoot,
      snapshotTarget: options.snapshotTarget,
      positionOverridePath: options.positionOverridePath,
      now: new Date().toISOString()
    });
  }

  if (action === "setSourceReleaseOverride") {
    return setSourceReleaseOverride(args[0] || {}, {
      storeRoot: options.ingestStoreRoot,
      snapshotTarget: options.snapshotTarget,
      now: new Date().toISOString()
    });
  }

  if (action === "listPublishAudits") {
    return listPublishAudits({
      storeRoot: options.ingestStoreRoot,
      sourceId: args[0] || ""
    });
  }

  return handlers[action](...args);
}

async function handleRpcBody(body, options) {
  const action = body.action;
  const args = Array.isArray(body.args) ? body.args : [];

  if (!action || (typeof handlers[action] !== "function" && !REMOTE_ONLY_ACTIONS.has(action))) {
    return {
      statusCode: 404,
      payload: {
        ok: false,
        error: "unknown api action"
      }
    };
  }

  store.__setSeedSnapshotLoaderForTests(createSeedSnapshotLoader(options));
  hydrateUserState(options.userStateFile);
  const data = await invokeAction(action, args, options);
  if (!READ_ACTIONS.has(action)) {
    persistUserState(options.userStateFile);
  }

  return {
    statusCode: 200,
    payload: {
      ok: true,
      data
    }
  };
}

function buildHealthPayload(options) {
  hydrateUserState(options.userStateFile);
  return {
    statusCode: 200,
    payload: {
      ok: true,
      data: {
        status: "ok",
        userStateFile: options.userStateFile
      }
    }
  };
}

async function handleApiRequest(input, runtimeOptions = {}) {
  const options = normalizeOptions(runtimeOptions);
  const method = String(input.method || "GET").toUpperCase();
  const pathname = normalizeRoutePath(input.pathname || "/", options.routeBasePath);
  const rawBody = input.bodyText || "";

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: createJsonHeaders(),
      payload: { ok: true }
    };
  }

  try {
    if (method === "GET" && pathname === "/health") {
      const result = buildHealthPayload(options);
      return {
        ...result,
        headers: createJsonHeaders()
      };
    }

    if (method === "POST" && pathname === "/rpc") {
      const parsedBody = rawBody ? JSON.parse(rawBody) : {};
      const result = await handleRpcBody(parsedBody, options);
      return {
        ...result,
        headers: createJsonHeaders()
      };
    }

    return {
      statusCode: 404,
      headers: createJsonHeaders(),
      payload: {
        ok: false,
        error: "not found"
      }
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: createJsonHeaders(),
      payload: {
        ok: false,
        error: error.message
      }
    };
  }
}

module.exports = {
  READ_ACTIONS,
  defaultPaths,
  createJsonHeaders,
  loadUserState,
  persistUserState,
  hydrateUserState,
  createSeedSnapshotLoader,
  normalizeOptions,
  normalizeRoutePath,
  handleApiRequest
};
