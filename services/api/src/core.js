const fs = require("node:fs");
const path = require("node:path");

const handlers = require("../../../apps/weapp/utils/api-handlers");
const store = require("../../../apps/weapp/utils/store");
const {
  baselineSeedPaths,
  ensureLocalRuntimeSeed,
  localRuntimePaths
} = require("../../runtime-paths");
const { buildDemoPage, buildDemoPageData } = require("./demo-page");
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
const seedSnapshotCache = new Map();
let activeRuntimeState = {
  runtimeKey: "",
  seedVersion: "",
  userStateVersion: -1
};

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
  return localRuntimePaths();
}

function packagedBaselinePaths() {
  return baselineSeedPaths();
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

function createHtmlHeaders(extraHeaders = {}) {
  return {
    "content-type": "text/html; charset=utf-8",
    "access-control-allow-origin": "*",
    ...extraHeaders
  };
}

function loadUserState(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getFileVersion(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return Number(stat.mtimeMs || 0);
  } catch (_error) {
    return 0;
  }
}

function buildSeedSnapshotCacheKey(ingestedPath, demoPath) {
  return `${ingestedPath}::${demoPath}`;
}

function loadSeedSnapshotModules(ingestedPath, demoPath) {
  const cacheEntryKey = buildSeedSnapshotCacheKey(ingestedPath, demoPath);
  const versionKey = `${getFileVersion(ingestedPath)}:${getFileVersion(demoPath)}`;
  const cached = seedSnapshotCache.get(cacheEntryKey);
  if (cached && cached.versionKey === versionKey) {
    return cached.snapshot;
  }

  let ingested = null;
  let demo = null;

  if (fs.existsSync(ingestedPath)) {
    delete require.cache[require.resolve(ingestedPath)];
    ingested = require(ingestedPath);
  }
  if (fs.existsSync(demoPath)) {
    delete require.cache[require.resolve(demoPath)];
    demo = require(demoPath);
  }

  const seed = ingested && ingested.notices && ingested.notices.length ? ingested : (demo || ingested);
  if (!seed) {
    throw new Error(`seed snapshot not found: ${ingestedPath}`);
  }
  const snapshot = {
    seed,
    seedVersion: seed.updatedAt || "demo"
  };

  seedSnapshotCache.set(cacheEntryKey, {
    versionKey,
    snapshot
  });
  return snapshot;
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
    return loadSeedSnapshotModules(ingestedPath, demoPath);
  };
}

function normalizeOptions(options = {}) {
  const defaults = defaultPaths();
  const shouldBootstrapLocalRuntime = [
    "userStateFile",
    "snapshotTarget",
    "ingestStoreRoot",
    "positionOverridePath",
    "demoSnapshotTarget"
  ].every((key) => !options[key] || options[key] === defaults[key]);
  const runtimeDefaults = shouldBootstrapLocalRuntime ? ensureLocalRuntimeSeed(defaults) : defaults;
  return {
    userStateFile: options.userStateFile || runtimeDefaults.userStateFile,
    snapshotTarget: options.snapshotTarget || runtimeDefaults.snapshotTarget,
    ingestStoreRoot: options.ingestStoreRoot || runtimeDefaults.ingestStoreRoot,
    positionOverridePath: options.positionOverridePath || runtimeDefaults.positionOverridePath,
    demoSnapshotTarget: options.demoSnapshotTarget || runtimeDefaults.demoSnapshotTarget,
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

function buildRuntimeStateKey(options) {
  return [
    options.snapshotTarget || "",
    options.demoSnapshotTarget || "",
    options.userStateFile || ""
  ].join("::");
}

function syncRuntimeState(options) {
  const seedLoader = createSeedSnapshotLoader(options);
  const snapshot = seedLoader();
  const runtimeKey = buildRuntimeStateKey(options);
  const userStateVersion = getFileVersion(options.userStateFile);
  const shouldRefreshSeedLoader = (
    activeRuntimeState.runtimeKey !== runtimeKey ||
    activeRuntimeState.seedVersion !== snapshot.seedVersion
  );

  if (shouldRefreshSeedLoader) {
    store.__setSeedSnapshotLoaderForTests(seedLoader, {
      rebuild: false
    });
  }

  if (shouldRefreshSeedLoader || activeRuntimeState.userStateVersion !== userStateVersion) {
    hydrateUserState(options.userStateFile);
  }

  activeRuntimeState = {
    runtimeKey,
    seedVersion: snapshot.seedVersion,
    userStateVersion
  };
  return snapshot;
}

function syncRuntimeStateAfterPersist(options) {
  activeRuntimeState = {
    runtimeKey: buildRuntimeStateKey(options),
    seedVersion: createSeedSnapshotLoader(options)().seedVersion,
    userStateVersion: getFileVersion(options.userStateFile)
  };
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

  syncRuntimeState(options);
  const data = await invokeAction(action, args, options);
  if (!READ_ACTIONS.has(action)) {
    persistUserState(options.userStateFile);
    syncRuntimeStateAfterPersist(options);
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
  syncRuntimeState(options);
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

function buildDemoPayload(options) {
  const seedLoader = createSeedSnapshotLoader(options);
  const { seed } = seedLoader();
  const userState = loadUserState(options.userStateFile);
  const pageData = buildDemoPageData(seed, userState);

  return {
    statusCode: 200,
    payload: buildDemoPage({
      ...pageData,
      baseUrl: options.baseUrl || ""
    })
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

    if (method === "GET" && (pathname === "/demo" || pathname === "/")) {
      const result = buildDemoPayload(options);
      return {
        ...result,
        headers: createHtmlHeaders()
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
  packagedBaselinePaths,
  createJsonHeaders,
  createHtmlHeaders,
  loadUserState,
  persistUserState,
  hydrateUserState,
  createSeedSnapshotLoader,
  normalizeOptions,
  normalizeRoutePath,
  buildDemoPayload,
  handleApiRequest
};
