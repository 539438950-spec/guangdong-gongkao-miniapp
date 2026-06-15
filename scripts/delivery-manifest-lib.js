const path = require("node:path");

const { buildGitCommitCommand } = require("./delivery-stage-lib");
const { buildRevertAuditCommand } = require("./delivery-revert-lib");

function normalizeManifestPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function quoteForCmd(value) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

function quoteForShell(value) {
  return `'${String(value || "").replace(/'/g, `'\\''`)}'`;
}

function sanitizeStepId(stepId) {
  return String(stepId || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildStepSlug(step) {
  return `${String(step.order).padStart(2, "0")}-${sanitizeStepId(step.id)}`;
}

function buildStepFileManifest(group, step) {
  const files = Array.isArray(group && group.files) ? group.files.slice() : [];
  return {
    groupId: group.id,
    stepId: step.id,
    slug: buildStepSlug(step),
    count: files.length,
    files
  };
}

function buildSessionCommand(groupId) {
  return `node scripts/delivery-session.js --step ${groupId} --apply --write-audit`;
}

function buildExecuteCommand(groupId, options = {}) {
  const flags = [
    "node scripts/delivery-execute.js",
    `--step ${groupId}`
  ];

  if (options.mode === "stage") {
    flags.push("--stage-only");
  } else if (options.mode === "commit") {
    flags.push("--commit-only");
  }

  if (options.apply) {
    flags.push("--apply");
  }

  if (options.writeAudit !== false) {
    flags.push("--write-audit");
  }

  return flags.join(" ");
}

function buildSessionAuditAlias(step) {
  return buildStepSlug(step);
}

function buildSessionAuditFile(step) {
  return path.join("output", "delivery-session", `${buildSessionAuditAlias(step)}.json`);
}

function buildDeliveryManifest(deliveryPlan, stagePlan) {
  const groupsById = new Map(
    (stagePlan.groups || []).map((group) => [group.id, group])
  );

  const steps = (deliveryPlan.steps || []).map((step) => {
    const group = step.groupId ? groupsById.get(step.groupId) : null;
    const fileManifest = group ? buildStepFileManifest(group, step) : null;

    return {
      order: step.order,
      id: step.id,
      slug: buildStepSlug(step),
      title: step.title,
      required: step.required !== false,
      reason: step.reason || "",
      groupId: step.groupId || "",
      commands: Array.isArray(step.commands) ? step.commands.slice() : [],
      fileCount: fileManifest ? fileManifest.count : 0,
      files: fileManifest ? fileManifest.files : [],
      commitMessage: group ? buildGitCommitCommand(group.id).replace(/^git commit -m /, "").replace(/^"|"$/g, "") : "",
      manifestFile: fileManifest ? path.join("steps", `${fileManifest.slug}.files.txt`) : "",
      stageScript: group ? path.join("steps", `${fileManifest.slug}.stage.cmd`) : path.join("steps", `${buildStepSlug(step)}.cmd`),
      stageScriptSh: group ? path.join("steps", `${fileManifest.slug}.stage.sh`) : path.join("steps", `${buildStepSlug(step)}.sh`),
      commitScript: group ? path.join("steps", `${fileManifest.slug}.commit.cmd`) : "",
      commitScriptSh: group ? path.join("steps", `${fileManifest.slug}.commit.sh`) : "",
      executeDryRunScript: group ? path.join("steps", `${fileManifest.slug}.execute-dry-run.cmd`) : "",
      executeDryRunScriptSh: group ? path.join("steps", `${fileManifest.slug}.execute-dry-run.sh`) : "",
      executeApplyStageScript: group ? path.join("steps", `${fileManifest.slug}.execute-apply-stage.cmd`) : "",
      executeApplyStageScriptSh: group ? path.join("steps", `${fileManifest.slug}.execute-apply-stage.sh`) : "",
      executeApplyCommitScript: group ? path.join("steps", `${fileManifest.slug}.execute-apply-commit.cmd`) : "",
      executeApplyCommitScriptSh: group ? path.join("steps", `${fileManifest.slug}.execute-apply-commit.sh`) : "",
      sessionScript: group ? path.join("steps", `${fileManifest.slug}.session.cmd`) : "",
      sessionScriptSh: group ? path.join("steps", `${fileManifest.slug}.session.sh`) : "",
      sessionAuditAlias: group ? buildSessionAuditAlias(step) : "",
      sessionAuditFile: group ? buildSessionAuditFile(step) : "",
      revertScript: group ? path.join("steps", `${fileManifest.slug}.revert.cmd`) : "",
      revertScriptSh: group ? path.join("steps", `${fileManifest.slug}.revert.sh`) : ""
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    totalChanged: deliveryPlan.totalChanged,
    smokeStatus: deliveryPlan.smokeStatus,
    baselineDecision: deliveryPlan.baselineDecision,
    steps
  };
}

function buildCmdScript(lines, repoRoot) {
  return [
    "@echo off",
    "setlocal",
    `cd /d ${quoteForCmd(repoRoot)}`,
    ...lines,
    ""
  ].join("\r\n");
}

function buildShScript(lines, repoRoot) {
  return [
    "#!/usr/bin/env sh",
    "set -eu",
    `cd ${quoteForShell(normalizeManifestPath(repoRoot))}`,
    ...lines,
    ""
  ].join("\n");
}

function buildSequenceCmd(steps) {
  const lines = [
    "@echo off",
    "setlocal",
    "set SCRIPT_DIR=%~dp0"
  ];

  steps.forEach((step) => {
    lines.push(`REM ${step.order}. ${step.title}`);
    if (!step.required) {
      lines.push(`REM review: ${step.reason}`);
      return;
    }

    if (step.groupId) {
      lines.push(`call "%SCRIPT_DIR%${normalizeManifestPath(step.stageScript).replace(/\//g, "\\")}"`);
      lines.push(`call "%SCRIPT_DIR%${normalizeManifestPath(step.commitScript).replace(/\//g, "\\")}"`);
      return;
    }

    lines.push(`call "%SCRIPT_DIR%${normalizeManifestPath(step.stageScript).replace(/\//g, "\\")}"`);
  });

  lines.push("");
  return lines.join("\r\n");
}

function buildSequenceSh(steps) {
  const lines = [
    "#!/usr/bin/env sh",
    "set -eu",
    "SCRIPT_DIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)"
  ];

  steps.forEach((step) => {
    lines.push(`# ${step.order}. ${step.title}`);
    if (!step.required) {
      lines.push(`# review: ${step.reason}`);
      return;
    }

    if (step.groupId) {
      lines.push(`sh "$SCRIPT_DIR/${normalizeManifestPath(step.stageScriptSh)}"`);
      lines.push(`sh "$SCRIPT_DIR/${normalizeManifestPath(step.commitScriptSh)}"`);
      return;
    }

    lines.push(`sh "$SCRIPT_DIR/${normalizeManifestPath(step.stageScriptSh)}"`);
  });

  lines.push("");
  return lines.join("\n");
}

function buildSessionSequenceCmd(steps) {
  const lines = [
    "@echo off",
    "setlocal",
    "set SCRIPT_DIR=%~dp0"
  ];

  steps.forEach((step) => {
    lines.push(`REM ${step.order}. ${step.title}`);
    if (!step.required) {
      lines.push(`REM review: ${step.reason}`);
      return;
    }

    if (step.groupId) {
      lines.push(`call "%SCRIPT_DIR%${normalizeManifestPath(step.sessionScript).replace(/\//g, "\\")}"`);
      return;
    }

    lines.push(`call "%SCRIPT_DIR%${normalizeManifestPath(step.stageScript).replace(/\//g, "\\")}"`);
  });

  lines.push("");
  return lines.join("\r\n");
}

function buildSessionSequenceSh(steps) {
  const lines = [
    "#!/usr/bin/env sh",
    "set -eu",
    "SCRIPT_DIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)"
  ];

  steps.forEach((step) => {
    lines.push(`# ${step.order}. ${step.title}`);
    if (!step.required) {
      lines.push(`# review: ${step.reason}`);
      return;
    }

    if (step.groupId) {
      lines.push(`sh "$SCRIPT_DIR/${normalizeManifestPath(step.sessionScriptSh)}"`);
      return;
    }

    lines.push(`sh "$SCRIPT_DIR/${normalizeManifestPath(step.stageScriptSh)}"`);
  });

  lines.push("");
  return lines.join("\n");
}

function buildExecuteDryRunSequenceCmd(steps) {
  const lines = [
    "@echo off",
    "setlocal",
    "set SCRIPT_DIR=%~dp0"
  ];

  steps.forEach((step) => {
    lines.push(`REM ${step.order}. ${step.title}`);
    if (!step.required) {
      lines.push(`REM review: ${step.reason}`);
      return;
    }

    if (step.groupId) {
      lines.push(`call "%SCRIPT_DIR%${normalizeManifestPath(step.executeDryRunScript).replace(/\//g, "\\")}"`);
      return;
    }

    lines.push(`call "%SCRIPT_DIR%${normalizeManifestPath(step.stageScript).replace(/\//g, "\\")}"`);
  });

  lines.push("");
  return lines.join("\r\n");
}

function buildExecuteDryRunSequenceSh(steps) {
  const lines = [
    "#!/usr/bin/env sh",
    "set -eu",
    "SCRIPT_DIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)"
  ];

  steps.forEach((step) => {
    lines.push(`# ${step.order}. ${step.title}`);
    if (!step.required) {
      lines.push(`# review: ${step.reason}`);
      return;
    }

    if (step.groupId) {
      lines.push(`sh "$SCRIPT_DIR/${normalizeManifestPath(step.executeDryRunScriptSh)}"`);
      return;
    }

    lines.push(`sh "$SCRIPT_DIR/${normalizeManifestPath(step.stageScriptSh)}"`);
  });

  lines.push("");
  return lines.join("\n");
}

function buildRevertSequenceCmd(steps) {
  const lines = [
    "@echo off",
    "setlocal",
    "set SCRIPT_DIR=%~dp0"
  ];

  steps.slice().reverse().forEach((step) => {
    if (!step.groupId) {
      return;
    }
    lines.push(`REM ${step.order}. ${step.title}`);
    if (!step.required) {
      lines.push(`REM review: ${step.reason}`);
      return;
    }
    lines.push(`call "%SCRIPT_DIR%${normalizeManifestPath(step.revertScript).replace(/\//g, "\\")}"`);
  });

  lines.push("");
  return lines.join("\r\n");
}

function buildRevertSequenceSh(steps) {
  const lines = [
    "#!/usr/bin/env sh",
    "set -eu",
    "SCRIPT_DIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)"
  ];

  steps.slice().reverse().forEach((step) => {
    if (!step.groupId) {
      return;
    }
    lines.push(`# ${step.order}. ${step.title}`);
    if (!step.required) {
      lines.push(`# review: ${step.reason}`);
      return;
    }
    lines.push(`sh "$SCRIPT_DIR/${normalizeManifestPath(step.revertScriptSh)}"`);
  });

  lines.push("");
  return lines.join("\n");
}

function renderManifestText(manifest) {
  const lines = [
    "交付步骤清单",
    `totalChanged: ${manifest.totalChanged}`,
    `smokeStatus: ${manifest.smokeStatus}`,
    `baseline: ${manifest.baselineDecision.include ? "include" : "review"}`,
    ""
  ];

  lines.push("步骤");
  manifest.steps.forEach((step) => {
    const suffix = step.required ? "" : " [review]";
    lines.push(`${step.order}. ${step.title}${suffix}`);
    lines.push(`   script: ${normalizeManifestPath(step.stageScript)}`);
    if (step.commitScript) {
      lines.push(`   commit: ${normalizeManifestPath(step.commitScript)}`);
      lines.push(`   executeDryRun: ${normalizeManifestPath(step.executeDryRunScript)}`);
      lines.push(`   executeApplyStage: ${normalizeManifestPath(step.executeApplyStageScript)}`);
      lines.push(`   executeApplyCommit: ${normalizeManifestPath(step.executeApplyCommitScript)}`);
      lines.push(`   session: ${normalizeManifestPath(step.sessionScript)}`);
      lines.push(`   revert: ${normalizeManifestPath(step.revertScript)}`);
      lines.push(`   sessionAudit: ${normalizeManifestPath(step.sessionAuditFile)}`);
    }
    if (step.manifestFile) {
      lines.push(`   files: ${normalizeManifestPath(step.manifestFile)} (${step.fileCount})`);
    }
  });
  lines.push("");
  lines.push("快速入口");
  lines.push("- 先看 OPERATOR.txt：最短演示 / dry-run / apply / revert 路径。");
  lines.push("- 需要核对精确文件边界时，再看 steps/*.files.txt。");
  lines.push("");
  lines.push("执行入口");
  lines.push("- `sequence.cmd` / `sequence.sh`：原始 stage + commit 顺序。");
  lines.push("- `sequence-execute-dry-run.cmd` / `sequence-execute-dry-run.sh`：带审计的 execute dry-run 顺序。");
  lines.push("- `sequence-session.cmd` / `sequence-session.sh`：带审计的 delivery-session 顺序。");
  lines.push("- `sequence-revert.cmd` / `sequence-revert.sh`：按分组逆序回退提交会话。");
  lines.push("- `OPERATOR.txt`：给人直接看的最短执行路径。");

  return `${lines.join("\n")}\n`;
}

function renderManifestOperatorQuickstart(manifest) {
  const groupedSteps = (manifest.steps || []).filter((step) => step.groupId);
  const firstGroupStep = groupedSteps[0] || null;
  const lines = [
    "交付操作快速入口",
    "",
    "整体路径",
    "- 查看完整交付顺序：README.txt",
    "- 审计 dry-run 全部分组：sequence-execute-dry-run.cmd / sequence-execute-dry-run.sh",
    "- 审计 apply 全部分组：sequence-session.cmd / sequence-session.sh",
    "- 原始 stage + commit 顺序：sequence.cmd / sequence.sh",
    "- 回退已审计提交会话：sequence-revert.cmd / sequence-revert.sh",
    ""
  ];

  if (firstGroupStep) {
    lines.push("单组示例");
    lines.push(`- 单组 dry-run：${normalizeManifestPath(firstGroupStep.executeDryRunScript)}`);
    lines.push(`- 单组 apply stage：${normalizeManifestPath(firstGroupStep.executeApplyStageScript)}`);
    lines.push(`- 单组 apply commit：${normalizeManifestPath(firstGroupStep.executeApplyCommitScript)}`);
    lines.push(`- 单组审计会话：${normalizeManifestPath(firstGroupStep.sessionScript)}`);
    lines.push(`- 单组会话回退：${normalizeManifestPath(firstGroupStep.revertScript)}`);
    lines.push("");
  }

  lines.push("文件定位");
  lines.push("- 每组精确文件清单在 steps/*.files.txt");
  lines.push("- session apply 之后的审计别名会写到 output/delivery-session/*.json");

  return `${lines.join("\n")}\n`;
}

function buildDeliveryManifestArtifacts(manifest, options = {}) {
  const repoRoot = options.repoRoot || path.resolve(__dirname, "..");
  const outputDir = options.outputDir || path.join(repoRoot, "output", "delivery-manifest");
  const artifacts = [
    {
      path: path.join(outputDir, "manifest.json"),
      content: `${JSON.stringify(manifest, null, 2)}\n`
    },
    {
      path: path.join(outputDir, "README.txt"),
      content: renderManifestText(manifest)
    },
    {
      path: path.join(outputDir, "OPERATOR.txt"),
      content: renderManifestOperatorQuickstart(manifest)
    }
  ];

  manifest.steps.forEach((step) => {
    if (step.groupId) {
      artifacts.push({
        path: path.join(outputDir, step.manifestFile),
        content: `${step.files.join("\n")}\n`
      });
      artifacts.push({
        path: path.join(outputDir, step.stageScript),
        content: buildCmdScript([`git add -- ${step.files.map((file) => quoteForCmd(file)).join(" ")}`], repoRoot)
      });
      artifacts.push({
        path: path.join(outputDir, step.stageScriptSh),
        content: buildShScript([`git add -- ${step.files.map((file) => quoteForShell(normalizeManifestPath(file))).join(" ")}`], repoRoot)
      });
      artifacts.push({
        path: path.join(outputDir, step.commitScript),
        content: buildCmdScript([`git commit -m ${quoteForCmd(step.commitMessage)}`], repoRoot)
      });
      artifacts.push({
        path: path.join(outputDir, step.commitScriptSh),
        content: buildShScript([`git commit -m ${quoteForShell(step.commitMessage)}`], repoRoot)
      });
      artifacts.push({
        path: path.join(outputDir, step.executeDryRunScript),
        content: buildCmdScript([buildExecuteCommand(step.groupId, { apply: false })], repoRoot)
      });
      artifacts.push({
        path: path.join(outputDir, step.executeDryRunScriptSh),
        content: buildShScript([buildExecuteCommand(step.groupId, { apply: false })], repoRoot)
      });
      artifacts.push({
        path: path.join(outputDir, step.executeApplyStageScript),
        content: buildCmdScript([buildExecuteCommand(step.groupId, { mode: "stage", apply: true })], repoRoot)
      });
      artifacts.push({
        path: path.join(outputDir, step.executeApplyStageScriptSh),
        content: buildShScript([buildExecuteCommand(step.groupId, { mode: "stage", apply: true })], repoRoot)
      });
      artifacts.push({
        path: path.join(outputDir, step.executeApplyCommitScript),
        content: buildCmdScript([buildExecuteCommand(step.groupId, { mode: "commit", apply: true })], repoRoot)
      });
      artifacts.push({
        path: path.join(outputDir, step.executeApplyCommitScriptSh),
        content: buildShScript([buildExecuteCommand(step.groupId, { mode: "commit", apply: true })], repoRoot)
      });
      artifacts.push({
        path: path.join(outputDir, step.sessionScript),
        content: buildCmdScript([`${buildSessionCommand(step.groupId)} --audit-alias ${step.sessionAuditAlias}`], repoRoot)
      });
      artifacts.push({
        path: path.join(outputDir, step.sessionScriptSh),
        content: buildShScript([`${buildSessionCommand(step.groupId)} --audit-alias ${step.sessionAuditAlias}`], repoRoot)
      });
      artifacts.push({
        path: path.join(outputDir, step.revertScript),
        content: buildCmdScript([buildRevertAuditCommand(normalizeManifestPath(step.sessionAuditFile))], repoRoot)
      });
      artifacts.push({
        path: path.join(outputDir, step.revertScriptSh),
        content: buildShScript([buildRevertAuditCommand(normalizeManifestPath(step.sessionAuditFile))], repoRoot)
      });
      return;
    }

    artifacts.push({
      path: path.join(outputDir, step.stageScript),
      content: buildCmdScript(step.commands, repoRoot)
    });
    artifacts.push({
      path: path.join(outputDir, step.stageScriptSh),
      content: buildShScript(step.commands, repoRoot)
    });
  });

  artifacts.push({
    path: path.join(outputDir, "sequence.cmd"),
    content: buildSequenceCmd(manifest.steps)
  });
  artifacts.push({
    path: path.join(outputDir, "sequence.sh"),
    content: buildSequenceSh(manifest.steps)
  });
  artifacts.push({
    path: path.join(outputDir, "sequence-session.cmd"),
    content: buildSessionSequenceCmd(manifest.steps)
  });
  artifacts.push({
    path: path.join(outputDir, "sequence-session.sh"),
    content: buildSessionSequenceSh(manifest.steps)
  });
  artifacts.push({
    path: path.join(outputDir, "sequence-execute-dry-run.cmd"),
    content: buildExecuteDryRunSequenceCmd(manifest.steps)
  });
  artifacts.push({
    path: path.join(outputDir, "sequence-execute-dry-run.sh"),
    content: buildExecuteDryRunSequenceSh(manifest.steps)
  });
  artifacts.push({
    path: path.join(outputDir, "sequence-revert.cmd"),
    content: buildRevertSequenceCmd(manifest.steps)
  });
  artifacts.push({
    path: path.join(outputDir, "sequence-revert.sh"),
    content: buildRevertSequenceSh(manifest.steps)
  });

  return artifacts;
}

function renderWrittenManifestArtifactsText(artifacts = [], outputDir = "") {
  const lines = [
    "交付步骤工件",
    outputDir ? `输出目录: ${normalizeManifestPath(outputDir)}` : "",
    ""
  ].filter(Boolean);

  artifacts.forEach((artifact) => {
    lines.push(`- ${normalizeManifestPath(artifact.path)}`);
  });

  return `${lines.join("\n")}\n`;
}

module.exports = {
  buildStepSlug,
  buildDeliveryManifest,
  renderManifestText,
  renderManifestOperatorQuickstart,
  buildDeliveryManifestArtifacts,
  renderWrittenManifestArtifactsText
};
