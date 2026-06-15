const cp = require("node:child_process");
const path = require("node:path");

function repoRoot() {
  return path.resolve(__dirname, "..");
}

function runGit(args, options = {}) {
  return cp.execFileSync("git", args, {
    cwd: options.cwd || repoRoot(),
    encoding: "utf8"
  });
}

function parsePorcelain(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2),
      file: line.slice(3)
    }));
}

function normalizeFile(file) {
  return String(file || "").replace(/\\/g, "/");
}

function classifyFile(file) {
  const normalized = normalizeFile(file);

  if (
    normalized === "apps/weapp/data/ingested.js" ||
    normalized === "services/ingest/var/source-states.json" ||
    normalized === "services/ingest/var/position-overrides.json" ||
    normalized.startsWith("services/ingest/var/production/")
  ) {
    return "baseline";
  }

  if (
    normalized.startsWith("docs/") ||
    normalized === "README.md" ||
    normalized === "AGENTS.md"
  ) {
    return "docs";
  }

  if (
    normalized.startsWith("apps/") ||
    normalized.startsWith("services/") ||
    normalized.startsWith("packages/") ||
    normalized.startsWith("scripts/") ||
    normalized === "package.json" ||
    normalized === ".gitignore"
  ) {
    return "source";
  }

  return "other";
}

function summarize(items) {
  return items.reduce((acc, item) => {
    const bucket = classifyFile(item.file);
    acc[bucket].push(item);
    return acc;
  }, {
    source: [],
    docs: [],
    baseline: [],
    other: []
  });
}

function sortItems(items = []) {
  return items.slice().sort((left, right) => String(left.file).localeCompare(String(right.file)));
}

function deriveCommitGroup(item) {
  const normalized = normalizeFile(item.file);
  const bucket = classifyFile(normalized);

  if (bucket === "docs") {
    return "docs";
  }
  if (bucket === "baseline") {
    return "baseline";
  }
  if (normalized.startsWith("apps/weapp/")) {
    return "frontend";
  }
  if (
    normalized.startsWith("services/") ||
    normalized.startsWith("scripts/") ||
    normalized === "package.json" ||
    normalized === ".gitignore"
  ) {
    return "platform";
  }
  return "other";
}

function buildCommitGroups(items = []) {
  const groups = {
    frontend: [],
    platform: [],
    docs: [],
    baseline: [],
    other: []
  };

  items.forEach((item) => {
    groups[deriveCommitGroup(item)].push(item);
  });

  const labels = {
    frontend: "前端与页面链路",
    platform: "采集/API/脚本与工程化",
    docs: "文档",
    baseline: "显式基线",
    other: "其他"
  };

  return Object.keys(groups).map((id) => ({
    id,
    label: labels[id],
    items: sortItems(groups[id])
  }));
}

function buildDeliveryReport(items) {
  const changed = sortItems(items);
  const summary = summarize(changed);
  const commitGroups = buildCommitGroups(changed);
  return {
    changed,
    totalChanged: changed.length,
    summary: {
      source: sortItems(summary.source),
      docs: sortItems(summary.docs),
      baseline: sortItems(summary.baseline),
      other: sortItems(summary.other)
    },
    commitGroups
  };
}

function collectDeliveryReport(options = {}) {
  const changed = parsePorcelain(runGit(["status", "--short", "--untracked-files=all"], options));
  return buildDeliveryReport(changed);
}

function renderTextReport(report) {
  const lines = [
    "广东公考小程序交付状态报告",
    `工作区改动总数: ${report.totalChanged}`,
    ""
  ];

  const bucketSpecs = [
    ["源码/测试/脚本", report.summary.source],
    ["文档", report.summary.docs],
    ["显式基线", report.summary.baseline],
    ["其他", report.summary.other]
  ];

  bucketSpecs.forEach(([title, items]) => {
    lines.push(`${title}: ${items.length}`);
    items.forEach((item) => {
      lines.push(`- [${item.status}] ${item.file}`);
    });
    lines.push("");
  });

  lines.push("建议提交分组");
  report.commitGroups
    .filter((group) => group.items.length > 0)
    .forEach((group) => {
      lines.push(`- ${group.label}: ${group.items.length}`);
    });
  lines.push("");
  lines.push("建议");
  lines.push("- 先跑 `C:\\Program Files\\nodejs\\npm.cmd run mvp:smoke`。");
  lines.push("- 如需把当前 runtime 状态变成提交基线，再跑 `node scripts/refresh-baseline.js`。");
  lines.push("- 提交前优先确认 `显式基线` 这一组是否真的是本轮要更新的内容。");

  return `${lines.join("\n")}\n`;
}

module.exports = {
  runGit,
  parsePorcelain,
  classifyFile,
  summarize,
  deriveCommitGroup,
  buildCommitGroups,
  buildDeliveryReport,
  collectDeliveryReport,
  renderTextReport
};
