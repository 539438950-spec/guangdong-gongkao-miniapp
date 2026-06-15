const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  baselineSeedPaths,
  localRuntimePaths
} = require("../services/runtime-paths");
const {
  collectDeliveryReport
} = require("./delivery-report-lib");

function hashFile(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return "";
  }
  return crypto.createHash("sha1").update(fs.readFileSync(filePath)).digest("hex");
}

function listFilesRecursive(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const entries = [];

  function walk(currentDir, prefix = "") {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const relative = prefix ? path.join(prefix, entry.name) : entry.name;
      const absolute = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute, relative);
      } else {
        entries.push(relative);
      }
    }
  }

  walk(rootDir);
  return entries.sort((left, right) => left.localeCompare(right));
}

function normalizeRelative(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function isSameFileContent(leftPath, rightPath) {
  if (!fs.existsSync(leftPath) || !fs.existsSync(rightPath)) {
    return false;
  }
  const leftStat = fs.statSync(leftPath);
  const rightStat = fs.statSync(rightPath);
  if (!leftStat.isFile() || !rightStat.isFile()) {
    return false;
  }
  if (leftStat.size !== rightStat.size) {
    return false;
  }
  return hashFile(leftPath) === hashFile(rightPath);
}

function createFileItem(kind, baselinePath, runtimePath, changedFiles) {
  const baselineExists = fs.existsSync(baselinePath);
  const runtimeExists = fs.existsSync(runtimePath);
  const sameContent = baselineExists && runtimeExists ? isSameFileContent(baselinePath, runtimePath) : false;
  const relativeBaseline = normalizeRelative(path.relative(process.cwd(), baselinePath));

  let status = "synced";
  if (!baselineExists) {
    status = "missing-baseline";
  } else if (!runtimeExists) {
    status = "missing-runtime";
  } else if (!sameContent) {
    status = "out-of-sync";
  }

  return {
    kind,
    baselinePath,
    runtimePath,
    gitChanged: changedFiles.has(relativeBaseline),
    baselineExists,
    runtimeExists,
    sameContent,
    status
  };
}

function createDirectoryItems(kind, baselineDir, runtimeDir, changedFiles) {
  const baselineFiles = listFilesRecursive(baselineDir);
  const runtimeFiles = listFilesRecursive(runtimeDir);
  const union = new Set([...baselineFiles, ...runtimeFiles]);

  return Array.from(union)
    .sort((left, right) => left.localeCompare(right))
    .map((relativePath) => createFileItem(
      kind,
      path.join(baselineDir, relativePath),
      path.join(runtimeDir, relativePath),
      changedFiles
    ));
}

function summarizeItems(items = []) {
  return items.reduce((acc, item) => {
    acc.total += 1;
    if (item.gitChanged) {
      acc.gitChanged += 1;
    }
    acc[item.status] += 1;
    return acc;
  }, {
    total: 0,
    gitChanged: 0,
    synced: 0,
    "out-of-sync": 0,
    "missing-baseline": 0,
    "missing-runtime": 0
  });
}

function buildRecommendations(summary) {
  const lines = [];
  if (summary["out-of-sync"] > 0) {
    lines.push("当前存在提交基线与 runtime 不一致的文件，提交前应先判断是否需要 refresh-baseline。");
  }
  if (summary["missing-runtime"] > 0) {
    lines.push("部分 runtime 文件缺失，先跑 demo/start 或 refresh-baseline 前置链路补齐 runtime。");
  }
  if (summary["missing-baseline"] > 0) {
    lines.push("部分提交基线文件缺失，先确认这些文件是否应该被纳入仓库基线。");
  }
  if (summary.gitChanged > 0 && summary["out-of-sync"] === 0) {
    lines.push("当前显式基线改动与 runtime 一致，可以按预期提交 baseline 组。");
  }
  if (lines.length === 0) {
    lines.push("当前提交基线与 runtime 一致，未发现额外基线风险。");
  }
  return lines;
}

function buildBaselineReport(options = {}) {
  const baseline = options.baselinePaths || baselineSeedPaths();
  const runtime = {
    ...localRuntimePaths(),
    ...(options.runtimePaths || {})
  };
  const report = options.deliveryReport || collectDeliveryReport();
  const changedFiles = new Set((report.summary.baseline || []).map((item) => normalizeRelative(item.file)));

  const items = [
    createFileItem("snapshot", baseline.snapshotTarget, runtime.snapshotTarget, changedFiles),
    createFileItem(
      "source-states",
      path.join(baseline.ingestStoreRoot, "source-states.json"),
      path.join(runtime.ingestStoreRoot, "source-states.json"),
      changedFiles
    ),
    createFileItem("position-overrides", baseline.positionOverridePath, runtime.positionOverridePath, changedFiles),
    ...createDirectoryItems(
      "production",
      path.join(baseline.ingestStoreRoot, "production"),
      path.join(runtime.ingestStoreRoot, "production"),
      changedFiles
    )
  ];

  const summary = summarizeItems(items);

  return {
    baseline,
    runtime,
    items,
    summary,
    recommendations: buildRecommendations(summary)
  };
}

function renderBaselineReportText(report) {
  const lines = [
    "广东公考小程序基线差异报告",
    `基线文件: ${report.summary.total}`,
    `git 已改动: ${report.summary.gitChanged}`,
    `同步: ${report.summary.synced}`,
    `漂移: ${report.summary["out-of-sync"]}`,
    `缺失 baseline: ${report.summary["missing-baseline"]}`,
    `缺失 runtime: ${report.summary["missing-runtime"]}`,
    ""
  ];

  lines.push("文件状态");
  report.items.forEach((item) => {
    const changedTag = item.gitChanged ? " git-changed" : "";
    lines.push(`- [${item.status}] ${normalizeRelative(path.relative(process.cwd(), item.baselinePath))}${changedTag}`);
  });
  lines.push("");
  lines.push("建议");
  report.recommendations.forEach((line) => {
    lines.push(`- ${line}`);
  });

  return `${lines.join("\n")}\n`;
}

module.exports = {
  listFilesRecursive,
  isSameFileContent,
  buildBaselineReport,
  renderBaselineReportText
};
