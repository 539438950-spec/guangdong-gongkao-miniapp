const fs = require("node:fs");
const path = require("node:path");

function decodeBody(body, isBase64Encoded) {
  if (!body) {
    return "";
  }
  if (isBase64Encoded) {
    return Buffer.from(body, "base64").toString("utf8");
  }
  return String(body);
}

function getPathFromEvent(event) {
  return event.path || event.rawPath || (event.requestContext && event.requestContext.http && event.requestContext.http.path) || "/";
}

function getMethodFromEvent(event) {
  return event.httpMethod || (event.requestContext && event.requestContext.http && event.requestContext.http.method) || "GET";
}

function copyPathIfMissing(sourcePath, targetPath) {
  if (fs.existsSync(targetPath) || !fs.existsSync(sourcePath)) {
    return;
  }

  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.mkdirSync(targetPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath)) {
      copyPathIfMissing(path.join(sourcePath, entry), path.join(targetPath, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function buildCloudRuntimeOptions(options = {}) {
  const { packagedBaselinePaths } = require("./core");
  const packagedDefaults = packagedBaselinePaths();
  const runtimeRoot = options.runtimeRoot || path.join(
    process.env.TMPDIR || process.env.TEMP || "/tmp",
    "gongkao-api-runtime"
  );

  const runtimeOptions = {
    ...options,
    userStateFile: options.userStateFile || path.join(runtimeRoot, "services/api/var/user-state.json"),
    snapshotTarget: options.snapshotTarget || path.join(runtimeRoot, "apps/weapp/data/ingested.js"),
    demoSnapshotTarget: options.demoSnapshotTarget || path.join(runtimeRoot, "apps/weapp/data/demo.js"),
    ingestStoreRoot: options.ingestStoreRoot || path.join(runtimeRoot, "services/ingest/var"),
    positionOverridePath: options.positionOverridePath || path.join(runtimeRoot, "services/ingest/var/position-overrides.json")
  };

  copyPathIfMissing(packagedDefaults.snapshotTarget, runtimeOptions.snapshotTarget);
  copyPathIfMissing(packagedDefaults.demoSnapshotTarget, runtimeOptions.demoSnapshotTarget);
  copyPathIfMissing(
    path.join(packagedDefaults.ingestStoreRoot, "source-states.json"),
    path.join(runtimeOptions.ingestStoreRoot, "source-states.json")
  );
  copyPathIfMissing(packagedDefaults.positionOverridePath, runtimeOptions.positionOverridePath);
  ["production", "review", "alerts"].forEach((segment) => {
    copyPathIfMissing(
      path.join(packagedDefaults.ingestStoreRoot, segment),
      path.join(runtimeOptions.ingestStoreRoot, segment)
    );
  });

  return runtimeOptions;
}

async function cloudFunctionHandler(event = {}, context = {}, options = {}) {
  const { handleApiRequest } = require("./core");
  const runtimeOptions = buildCloudRuntimeOptions(options);
  const result = await handleApiRequest(
    {
      method: getMethodFromEvent(event),
      pathname: getPathFromEvent(event),
      bodyText: decodeBody(event.body, event.isBase64Encoded)
    },
    runtimeOptions
  );

  return {
    statusCode: result.statusCode,
    headers: result.headers,
    body: JSON.stringify(result.payload),
    isBase64Encoded: false
  };
}

function createCloudHandler(options = {}) {
  return (event, context) => cloudFunctionHandler(event, context, options);
}

module.exports = {
  buildCloudRuntimeOptions,
  cloudFunctionHandler,
  createCloudHandler
};
