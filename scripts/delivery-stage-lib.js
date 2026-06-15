const path = require("node:path");

const {
  buildCommitGroups
} = require("./delivery-report-lib");

const DEFAULT_GROUP_ORDER = ["frontend", "platform", "docs", "baseline", "other"];

const DEFAULT_COMMIT_MESSAGES = {
  frontend: "feat(weapp): refine page flows and compare interactions",
  platform: "feat(platform): stabilize ingest, api, and delivery tooling",
  docs: "docs: update delivery and execution contracts",
  baseline: "chore(baseline): refresh published snapshot baseline",
  other: "chore: stage remaining repository changes"
};

function normalizeGroupIds(groupIds = []) {
  return Array.isArray(groupIds)
    ? groupIds.filter(Boolean)
    : [];
}

function quoteFile(file) {
  return `"${String(file || "").replace(/"/g, '\\"')}"`;
}

function buildGitAddCommand(files = []) {
  if (!Array.isArray(files) || files.length === 0) {
    return "";
  }
  return `git add -- ${files.map(quoteFile).join(" ")}`;
}

function buildGitCommitCommand(groupId, message) {
  const commitMessage = message || DEFAULT_COMMIT_MESSAGES[groupId] || DEFAULT_COMMIT_MESSAGES.other;
  return `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`;
}

function slugifyGroup(group) {
  return `${String(group.order).padStart(2, "0")}-${group.id}`;
}

function buildStagePlan(report, options = {}) {
  const requestedGroupIds = normalizeGroupIds(options.groupIds);
  const commitGroups = buildCommitGroups(report.changed || []);
  const filteredGroups = commitGroups
    .filter((group) => group.items.length > 0)
    .filter((group) => requestedGroupIds.length === 0 || requestedGroupIds.includes(group.id))
    .sort((left, right) => DEFAULT_GROUP_ORDER.indexOf(left.id) - DEFAULT_GROUP_ORDER.indexOf(right.id))
    .map((group, index) => ({
      id: group.id,
      label: group.label,
      order: index + 1,
      count: group.items.length,
      files: group.items.map((item) => item.file),
      stageCommand: buildGitAddCommand(group.items.map((item) => item.file)),
      commitCommand: buildGitCommitCommand(group.id, options.commitMessages && options.commitMessages[group.id])
    }));

  return {
    totalChanged: report.totalChanged || 0,
    selectedGroupIds: requestedGroupIds,
    groups: filteredGroups
  };
}

function renderStagePlanText(plan) {
  const lines = [
    "广东公考小程序交付编排",
    `工作区变更总数: ${plan.totalChanged}`,
    ""
  ];

  if (!plan.groups.length) {
    lines.push("当前没有符合条件的变更分组。");
    return `${lines.join("\n")}\n`;
  }

  lines.push("建议执行顺序");
  plan.groups.forEach((group) => {
    lines.push(`${group.order}. ${group.label} (${group.count})`);
    lines.push(`   stage: ${group.stageCommand}`);
    lines.push(`   commit: ${group.commitCommand}`);
  });
  lines.push("");
  lines.push("说明");
  lines.push("- 先执行 `npm run mvp:smoke`，确认主链路稳定。");
  lines.push("- `baseline` 组只在你确认要刷新提交基线时再提交。");
  lines.push("- 如果只想处理单组，使用 `node scripts/delivery-stage.js --group frontend`。");
  lines.push("- 如果要导出可执行工件，使用 `node scripts/delivery-stage.js --write`。");

  return `${lines.join("\n")}\n`;
}

function buildWindowsCommandFile(lines = []) {
  return [
    "@echo off",
    "setlocal",
    ...lines,
    ""
  ].join("\r\n");
}

function buildPosixCommandFile(lines = []) {
  return [
    "#!/usr/bin/env sh",
    "set -eu",
    ...lines,
    ""
  ].join("\n");
}

function buildStageArtifacts(plan, options = {}) {
  const outputDir = options.outputDir || "output/delivery-stage";
  const artifacts = [];

  artifacts.push({
    type: "json",
    path: path.join(outputDir, "plan.json"),
    content: `${JSON.stringify(plan, null, 2)}\n`
  });

  artifacts.push({
    type: "text",
    path: path.join(outputDir, "README.txt"),
    content: renderStagePlanText(plan)
  });

  plan.groups.forEach((group) => {
    const prefix = slugifyGroup(group);
    artifacts.push({
      type: "cmd",
      path: path.join(outputDir, `${prefix}.stage.cmd`),
      content: buildWindowsCommandFile([
        `REM ${group.label}`,
        group.stageCommand
      ])
    });
    artifacts.push({
      type: "cmd",
      path: path.join(outputDir, `${prefix}.commit.cmd`),
      content: buildWindowsCommandFile([
        `REM ${group.label}`,
        group.commitCommand
      ])
    });
    artifacts.push({
      type: "sh",
      path: path.join(outputDir, `${prefix}.stage.sh`),
      content: buildPosixCommandFile([group.stageCommand])
    });
    artifacts.push({
      type: "sh",
      path: path.join(outputDir, `${prefix}.commit.sh`),
      content: buildPosixCommandFile([group.commitCommand])
    });
  });

  return artifacts;
}

function renderWrittenArtifactsText(artifacts = [], outputDir = "") {
  const lines = [
    "广东公考小程序交付工件",
    outputDir ? `输出目录: ${outputDir}` : "",
    ""
  ].filter(Boolean);

  artifacts.forEach((artifact) => {
    lines.push(`- ${artifact.path}`);
  });

  return `${lines.join("\n")}\n`;
}

module.exports = {
  DEFAULT_GROUP_ORDER,
  DEFAULT_COMMIT_MESSAGES,
  buildGitAddCommand,
  buildGitCommitCommand,
  buildStagePlan,
  renderStagePlanText,
  buildStageArtifacts,
  renderWrittenArtifactsText
};
