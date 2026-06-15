const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const FILES_TO_COPY = [
  "services/runtime-paths.js",
  "services/api/src/cloud-function.js",
  "services/api/src/cloud.js",
  "services/api/src/core.js",
  "apps/weapp/utils/api-handlers.js",
  "apps/weapp/utils/store.js",
  "apps/weapp/data/demo.js",
  "apps/weapp/data/ingested.js",
  "services/ingest/src/review-actions.js",
  "services/ingest/src/storage/file-store.js",
  "services/ingest/src/storage/memory-store.js",
  "services/ingest/src/publish/export-weapp-snapshot.js",
  "services/ingest/src/publish/source-state.js",
  "services/ingest/var/source-states.json"
];

const DIRECTORIES_TO_COPY = [
  "services/ingest/var/production",
  "services/ingest/var/review",
  "services/ingest/var/alerts"
];

function ensureCleanDir(targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
}

function copyFile(rootDir, relativePath, targetDir) {
  const sourcePath = path.join(rootDir, relativePath);
  const targetPath = path.join(targetDir, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function copyDirectory(rootDir, relativePath, targetDir) {
  const sourcePath = path.join(rootDir, relativePath);
  const targetPath = path.join(targetDir, relativePath);
  fs.mkdirSync(targetPath, { recursive: true });

  for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
    const nextRelativePath = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(rootDir, nextRelativePath, targetDir);
      continue;
    }
    copyFile(rootDir, nextRelativePath, targetDir);
  }
}

function writeFunctionScaffold(functionRoot) {
  fs.mkdirSync(functionRoot, { recursive: true });
  fs.writeFileSync(
    path.join(functionRoot, "index.js"),
    [
      "try {",
      "  exports.main = require('./runtime/services/api/src/cloud-function').main;",
      "} catch (error) {",
      "  throw new Error(\"cloud runtime not prepared, run `npm run cloud:sync` first: \" + error.message);",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(functionRoot, "package.json"),
    `${JSON.stringify({
      name: "gongkao-api-cloudfunction",
      version: "0.1.0",
      private: true,
      main: "index.js"
    }, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(functionRoot, "config.json"),
    `${JSON.stringify({ permissions: { openapi: [] } }, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(functionRoot, "README.md"),
    [
      "# gongkao-api cloud function",
      "",
      "Run `npm run cloud:sync` in the repo root before deploying this function.",
      "The generated runtime mirror will be written into `runtime/`."
    ].join("\n"),
    "utf8"
  );
}

function syncCloudFunctionPackage(options = {}) {
  const rootDir = options.rootDir || ROOT;
  const functionRoot = options.functionRoot || path.join(rootDir, "cloudfunctions", "gongkao-api");
  const runtimeRoot = path.join(functionRoot, "runtime");

  writeFunctionScaffold(functionRoot);
  ensureCleanDir(runtimeRoot);

  FILES_TO_COPY.forEach((relativePath) => {
    copyFile(rootDir, relativePath, runtimeRoot);
  });
  DIRECTORIES_TO_COPY.forEach((relativePath) => {
    copyDirectory(rootDir, relativePath, runtimeRoot);
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    files: FILES_TO_COPY,
    directories: DIRECTORIES_TO_COPY
  };
  fs.writeFileSync(
    path.join(functionRoot, "runtime-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  return {
    functionRoot,
    runtimeRoot,
    manifest
  };
}

if (require.main === module) {
  const result = syncCloudFunctionPackage();
  console.log(`[cloud-sync] function root: ${result.functionRoot}`);
  console.log(`[cloud-sync] runtime root: ${result.runtimeRoot}`);
  console.log(`[cloud-sync] copied ${result.manifest.files.length} files and ${result.manifest.directories.length} directories`);
}

module.exports = {
  syncCloudFunctionPackage
};
