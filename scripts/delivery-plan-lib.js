const path = require("node:path");

function buildBaselineDecision(baselineReport, baselineGroup) {
  if (!baselineGroup || baselineGroup.count === 0) {
    return {
      include: false,
      reason: "当前没有需要提交的显式基线改动。"
    };
  }

  if (baselineReport.summary["out-of-sync"] > 0) {
    return {
      include: false,
      reason: "显式基线与 runtime 存在漂移，当前不建议直接提交 baseline 组。"
    };
  }

  if (baselineReport.summary["missing-baseline"] > 0 || baselineReport.summary["missing-runtime"] > 0) {
    return {
      include: false,
      reason: "显式基线或 runtime 存在缺失，当前不建议直接提交 baseline 组。"
    };
  }

  if (baselineReport.summary.gitChanged === 0) {
    return {
      include: false,
      reason: "当前没有 git 级别的显式基线改动。"
    };
  }

  return {
    include: true,
    reason: "显式基线改动与 runtime 同步，可以按预期纳入提交序列。"
  };
}

function buildPlanSteps(stagePlan, baselineDecision, options = {}) {
  const smokeStatus = options.smokeStatus || "required";
  const steps = [
    {
      order: 1,
      id: "verify-smoke",
      title: "运行主链路验收",
      commands: ["npm run mvp:smoke"],
      required: true,
      reason: smokeStatus === "passed"
        ? "当前计划默认仍保留 smoke 作为提交前闸门。"
        : "提交前必须确认主链路、API、页面回归全部通过。"
    },
    {
      order: 2,
      id: "verify-baseline",
      title: "检查显式基线与 runtime 同步状态",
      commands: ["node scripts/baseline-report.js"],
      required: true,
      reason: baselineDecision.reason
    }
  ];

  let order = steps.length + 1;
  stagePlan.groups.forEach((group) => {
    const include = group.id !== "baseline" || baselineDecision.include;
    const reason = group.id === "baseline"
      ? baselineDecision.reason
      : "当前分组属于建议提交序列。";

    steps.push({
      order,
      id: `${group.id}-stage-commit`,
      title: `${group.label} 提交`,
      commands: [group.stageCommand, group.commitCommand],
      required: include,
      reason,
      groupId: group.id
    });
    order += 1;
  });

  return steps;
}

function buildDeliveryPlan(options = {}) {
  const deliveryReport = options.deliveryReport;
  const stagePlan = options.stagePlan;
  const baselineReport = options.baselineReport;
  const smokeStatus = options.smokeStatus || "required";
  const baselineGroup = stagePlan.groups.find((group) => group.id === "baseline");
  const baselineDecision = buildBaselineDecision(baselineReport, baselineGroup);
  const steps = buildPlanSteps(stagePlan, baselineDecision, { smokeStatus });

  return {
    totalChanged: deliveryReport.totalChanged,
    smokeStatus,
    baselineDecision,
    groups: stagePlan.groups.map((group) => ({
      ...group,
      include: group.id !== "baseline" || baselineDecision.include
    })),
    steps
  };
}

function renderDeliveryPlanText(plan) {
  const lines = [
    "广东公考小程序交付计划",
    `工作区变更总数: ${plan.totalChanged}`,
    `smoke 状态: ${plan.smokeStatus}`,
    `baseline 决策: ${plan.baselineDecision.include ? "include" : "review"}`,
    `baseline 说明: ${plan.baselineDecision.reason}`,
    ""
  ];

  lines.push("提交顺序");
  plan.steps.forEach((step) => {
    lines.push(`${step.order}. ${step.title}${step.required ? "" : " [review]"}`);
    step.commands.forEach((command) => {
      lines.push(`   ${command}`);
    });
  });

  return `${lines.join("\n")}\n`;
}

function renderSequenceCmd(plan) {
  const lines = ["@echo off", "setlocal"];
  plan.steps.forEach((step) => {
    lines.push(`REM ${step.order}. ${step.title}`);
    if (!step.required) {
      lines.push(`REM skipped: ${step.reason}`);
      step.commands.forEach((command) => {
        lines.push(`REM ${command}`);
      });
      return;
    }
    step.commands.forEach((command) => {
      lines.push(command);
    });
  });
  lines.push("");
  return lines.join("\r\n");
}

function renderSequenceSh(plan) {
  const lines = ["#!/usr/bin/env sh", "set -eu"];
  plan.steps.forEach((step) => {
    lines.push(`# ${step.order}. ${step.title}`);
    if (!step.required) {
      lines.push(`# skipped: ${step.reason}`);
      step.commands.forEach((command) => {
        lines.push(`# ${command}`);
      });
      return;
    }
    step.commands.forEach((command) => {
      lines.push(command);
    });
  });
  lines.push("");
  return lines.join("\n");
}

function buildDeliveryPlanArtifacts(plan, options = {}) {
  const outputDir = options.outputDir || path.join("output", "delivery-plan");
  return [
    {
      path: path.join(outputDir, "plan.json"),
      content: `${JSON.stringify(plan, null, 2)}\n`
    },
    {
      path: path.join(outputDir, "README.txt"),
      content: renderDeliveryPlanText(plan)
    },
    {
      path: path.join(outputDir, "sequence.cmd"),
      content: renderSequenceCmd(plan)
    },
    {
      path: path.join(outputDir, "sequence.sh"),
      content: renderSequenceSh(plan)
    }
  ];
}

function renderWrittenPlanArtifactsText(artifacts = [], outputDir = "") {
  const lines = [
    "广东公考小程序交付计划工件",
    outputDir ? `输出目录: ${outputDir}` : "",
    ""
  ].filter(Boolean);

  artifacts.forEach((artifact) => {
    lines.push(`- ${artifact.path}`);
  });

  return `${lines.join("\n")}\n`;
}

module.exports = {
  buildBaselineDecision,
  buildPlanSteps,
  buildDeliveryPlan,
  renderDeliveryPlanText,
  buildDeliveryPlanArtifacts,
  renderWrittenPlanArtifactsText
};
