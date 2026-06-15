const fs = require("node:fs");
const path = require("node:path");

const PREVIEW_UPLOAD_LIMIT_KB = 2048;

function resolveWeappBundleAuditPaths(repoRoot = path.resolve(__dirname, "..")) {
  return {
    repoRoot,
    projectDir: path.join(repoRoot, "apps", "weapp"),
    projectConfigPath: path.join(repoRoot, "apps", "weapp", "project.config.json"),
    outputDir: path.join(repoRoot, "output", "weapp-bundle"),
    latestPath: path.join(repoRoot, "output", "weapp-bundle", "latest.json"),
    readmePath: path.join(repoRoot, "output", "weapp-bundle", "README.txt")
  };
}

function readWeappProjectConfig(projectConfigPath) {
  return JSON.parse(fs.readFileSync(projectConfigPath, "utf8"));
}

function normalizeRuleValue(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
}

function normalizePackIgnoreRules(ignore = []) {
  return Array.isArray(ignore)
    ? ignore
      .map((rule) => ({
        type: String(rule && rule.type || "").trim(),
        value: normalizeRuleValue(rule && rule.value)
      }))
      .filter((rule) => rule.type && rule.value)
    : [];
}

function matchesIgnoreRule(relPath, rule) {
  const normalizedPath = normalizeRuleValue(relPath);
  if (!normalizedPath) {
    return false;
  }
  if (rule.type === "file") {
    return normalizedPath === rule.value;
  }
  if (rule.type === "folder") {
    return normalizedPath === rule.value || normalizedPath.startsWith(`${rule.value}/`);
  }
  if (rule.type === "suffix") {
    return normalizedPath.endsWith(rule.value);
  }
  if (rule.type === "prefix") {
    return normalizedPath.startsWith(rule.value);
  }
  return false;
}

function classifyIgnoredFile(relPath, rules = []) {
  const matchedRule = rules.find((rule) => matchesIgnoreRule(relPath, rule)) || null;
  return {
    ignored: Boolean(matchedRule),
    matchedRule
  };
}

function collectWeappProjectFiles(projectDir, rules = []) {
  const files = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      const relPath = normalizeRuleValue(path.relative(projectDir, fullPath));
      const size = fs.statSync(fullPath).size;
      const ignoredState = classifyIgnoredFile(relPath, rules);
      files.push({
        relPath,
        fullPath,
        size,
        sizeKB: Number((size / 1024).toFixed(2)),
        ignored: ignoredState.ignored,
        matchedRule: ignoredState.matchedRule
      });
    }
  }

  walk(projectDir);
  return files.sort((left, right) => right.size - left.size);
}

function summarizeDirectorySizes(files = []) {
  const buckets = new Map();
  files.forEach((file) => {
    const head = file.relPath.split("/")[0] || ".";
    const next = buckets.get(head) || {
      directory: head,
      includedSize: 0,
      ignoredSize: 0
    };
    if (file.ignored) {
      next.ignoredSize += file.size;
    } else {
      next.includedSize += file.size;
    }
    buckets.set(head, next);
  });

  return Array.from(buckets.values())
    .map((item) => ({
      directory: item.directory,
      includedSizeKB: Number((item.includedSize / 1024).toFixed(2)),
      ignoredSizeKB: Number((item.ignoredSize / 1024).toFixed(2))
    }))
    .sort((left, right) => right.includedSizeKB - left.includedSizeKB);
}

function buildWeappBundleAudit(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const files = Array.isArray(options.files) ? options.files : [];
  const rules = Array.isArray(options.rules) ? options.rules : [];
  const projectConfig = options.projectConfig || {};
  const includedFiles = files.filter((file) => !file.ignored);
  const ignoredFiles = files.filter((file) => file.ignored);
  const includedSize = includedFiles.reduce((sum, file) => sum + file.size, 0);
  const ignoredSize = ignoredFiles.reduce((sum, file) => sum + file.size, 0);
  const totalSize = includedSize + ignoredSize;
  const thresholdStatus = includedSize / 1024 <= PREVIEW_UPLOAD_LIMIT_KB ? "within-limit" : "over-limit";

  return {
    generatedAt,
    statusId: String(generatedAt).replace(/[:.]/g, "-"),
    project: {
      appId: String(projectConfig.appid || ""),
      projectName: String(projectConfig.projectname || ""),
      miniprogramRoot: String(projectConfig.miniprogramRoot || "./")
    },
    limits: {
      previewUploadLimitKB: PREVIEW_UPLOAD_LIMIT_KB
    },
    summary: {
      fileCount: files.length,
      includedFileCount: includedFiles.length,
      ignoredFileCount: ignoredFiles.length,
      totalSizeKB: Number((totalSize / 1024).toFixed(2)),
      includedSizeKB: Number((includedSize / 1024).toFixed(2)),
      ignoredSizeKB: Number((ignoredSize / 1024).toFixed(2)),
      thresholdStatus
    },
    ignoreRules: rules,
    largestIncludedFiles: includedFiles.slice(0, 20).map((file) => ({
      relPath: file.relPath,
      sizeKB: file.sizeKB
    })),
    largestIgnoredFiles: ignoredFiles.slice(0, 20).map((file) => ({
      relPath: file.relPath,
      sizeKB: file.sizeKB,
      matchedRule: file.matchedRule
    })),
    directorySummary: summarizeDirectorySizes(files)
  };
}

function renderWeappBundleAuditReadme(audit = {}) {
  const lines = [
    "WeApp Bundle Audit",
    `generatedAt: ${audit.generatedAt || ""}`,
    `projectName: ${audit.project ? audit.project.projectName : ""}`,
    `appId: ${audit.project ? audit.project.appId : ""}`,
    `includedSizeKB: ${audit.summary ? audit.summary.includedSizeKB : 0}`,
    `ignoredSizeKB: ${audit.summary ? audit.summary.ignoredSizeKB : 0}`,
    `previewUploadLimitKB: ${audit.limits ? audit.limits.previewUploadLimitKB : PREVIEW_UPLOAD_LIMIT_KB}`,
    `thresholdStatus: ${audit.summary ? audit.summary.thresholdStatus : "unknown"}`,
    "",
    "Ignore rules"
  ];

  (audit.ignoreRules || []).forEach((rule) => {
    lines.push(`- ${rule.type}: ${rule.value}`);
  });

  lines.push("");
  lines.push("Largest included files");
  (audit.largestIncludedFiles || []).slice(0, 10).forEach((file) => {
    lines.push(`- ${file.relPath}: ${file.sizeKB}KB`);
  });

  lines.push("");
  lines.push("Largest ignored files");
  (audit.largestIgnoredFiles || []).slice(0, 10).forEach((file) => {
    lines.push(`- ${file.relPath}: ${file.sizeKB}KB`);
  });

  return `${lines.join("\n")}\n`;
}

function buildWeappBundleAuditArtifacts(audit, outputDir) {
  return [
    {
      path: path.join(outputDir, `${audit.statusId}.json`),
      content: `${JSON.stringify(audit, null, 2)}\n`
    },
    {
      path: path.join(outputDir, "latest.json"),
      content: `${JSON.stringify(audit, null, 2)}\n`
    },
    {
      path: path.join(outputDir, "README.txt"),
      content: renderWeappBundleAuditReadme(audit)
    }
  ];
}

function writeWeappBundleAuditArtifacts(artifacts = []) {
  artifacts.forEach((artifact) => {
    fs.mkdirSync(path.dirname(artifact.path), { recursive: true });
    fs.writeFileSync(artifact.path, artifact.content, "utf8");
  });
}

module.exports = {
  PREVIEW_UPLOAD_LIMIT_KB,
  resolveWeappBundleAuditPaths,
  readWeappProjectConfig,
  normalizePackIgnoreRules,
  classifyIgnoredFile,
  collectWeappProjectFiles,
  buildWeappBundleAudit,
  renderWeappBundleAuditReadme,
  buildWeappBundleAuditArtifacts,
  writeWeappBundleAuditArtifacts
};
