const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildStepSlug,
  buildDeliveryManifest,
  renderManifestText,
  renderManifestOperatorQuickstart,
  buildDeliveryManifestArtifacts,
  renderWrittenManifestArtifactsText
} = require("../delivery-manifest-lib");

test("delivery manifest should build stable step slugs", () => {
  assert.equal(
    buildStepSlug({ order: 3, id: "frontend-stage-commit" }),
    "03-frontend-stage-commit"
  );
});

test("delivery manifest should attach exact files to grouped steps", () => {
  const manifest = buildDeliveryManifest({
    totalChanged: 4,
    smokeStatus: "required",
    baselineDecision: { include: true, reason: "ok" },
    steps: [
      { order: 1, id: "verify-smoke", title: "Verify smoke", commands: ["npm run mvp:smoke"], required: true },
      { order: 2, id: "frontend-stage-commit", title: "Frontend commit", commands: ["git add -- a", "git commit -m \"a\""], required: true, groupId: "frontend" }
    ]
  }, {
    groups: [
      {
        id: "frontend",
        files: ["apps/weapp/pages/compare/index.js", "apps/weapp/pages/positions/index.js"]
      }
    ]
  });

  assert.equal(manifest.steps[0].fileCount, 0);
  assert.equal(manifest.steps[1].fileCount, 2);
  assert.equal(manifest.steps[1].manifestFile, path.join("steps", "02-frontend-stage-commit.files.txt"));
});

test("delivery manifest should render and export runnable artifacts", () => {
  const manifest = {
    totalChanged: 3,
    smokeStatus: "required",
    baselineDecision: { include: false, reason: "review baseline" },
    steps: [
      {
        order: 1,
        id: "verify-smoke",
        slug: "01-verify-smoke",
        title: "Verify smoke",
        required: true,
        reason: "",
        groupId: "",
        commands: ["npm run mvp:smoke"],
        fileCount: 0,
        files: [],
        commitMessage: "",
        manifestFile: "",
        stageScript: path.join("steps", "01-verify-smoke.cmd"),
        stageScriptSh: path.join("steps", "01-verify-smoke.sh"),
        commitScript: "",
        commitScriptSh: ""
      },
      {
        order: 2,
        id: "frontend-stage-commit",
        slug: "02-frontend-stage-commit",
        title: "Frontend commit",
        required: true,
        reason: "",
        groupId: "frontend",
        commands: [],
        fileCount: 1,
        files: ["apps/weapp/pages/compare/index.js"],
        commitMessage: "feat(weapp): refine page flows and compare interactions",
        manifestFile: path.join("steps", "02-frontend-stage-commit.files.txt"),
        stageScript: path.join("steps", "02-frontend-stage-commit.stage.cmd"),
        stageScriptSh: path.join("steps", "02-frontend-stage-commit.stage.sh"),
        commitScript: path.join("steps", "02-frontend-stage-commit.commit.cmd"),
        commitScriptSh: path.join("steps", "02-frontend-stage-commit.commit.sh"),
        executeDryRunScript: path.join("steps", "02-frontend-stage-commit.execute-dry-run.cmd"),
        executeDryRunScriptSh: path.join("steps", "02-frontend-stage-commit.execute-dry-run.sh"),
        executeApplyStageScript: path.join("steps", "02-frontend-stage-commit.execute-apply-stage.cmd"),
        executeApplyStageScriptSh: path.join("steps", "02-frontend-stage-commit.execute-apply-stage.sh"),
        executeApplyCommitScript: path.join("steps", "02-frontend-stage-commit.execute-apply-commit.cmd"),
        executeApplyCommitScriptSh: path.join("steps", "02-frontend-stage-commit.execute-apply-commit.sh"),
        sessionScript: path.join("steps", "02-frontend-stage-commit.session.cmd"),
        sessionScriptSh: path.join("steps", "02-frontend-stage-commit.session.sh"),
        sessionAuditAlias: "02-frontend-stage-commit",
        sessionAuditFile: path.join("output", "delivery-session", "02-frontend-stage-commit.json"),
        revertScript: path.join("steps", "02-frontend-stage-commit.revert.cmd"),
        revertScriptSh: path.join("steps", "02-frontend-stage-commit.revert.sh")
      }
    ]
  };

  const text = renderManifestText(manifest);
  const operator = renderManifestOperatorQuickstart(manifest);
  assert.ok(text.includes("交付步骤清单"));
  assert.ok(text.includes("步骤"));
  assert.ok(text.includes("快速入口"));
  assert.ok(text.includes("执行入口"));
  assert.ok(text.includes("sequence.cmd"));
  assert.ok(text.includes("sequence-execute-dry-run.cmd"));
  assert.ok(text.includes("sequence-session.cmd"));
  assert.ok(text.includes("sequence-revert.cmd"));
  assert.ok(text.includes("先看 OPERATOR.txt"));
  assert.ok(text.includes("steps/*.files.txt"));
  assert.ok(text.includes("executeDryRun: steps/02-frontend-stage-commit.execute-dry-run.cmd"));
  assert.ok(text.includes("executeApplyStage: steps/02-frontend-stage-commit.execute-apply-stage.cmd"));
  assert.ok(text.includes("executeApplyCommit: steps/02-frontend-stage-commit.execute-apply-commit.cmd"));
  assert.ok(text.includes("session: steps/02-frontend-stage-commit.session.cmd"));
  assert.ok(text.includes("revert: steps/02-frontend-stage-commit.revert.cmd"));
  assert.ok(operator.includes("交付操作快速入口"));
  assert.ok(operator.includes("整体路径"));
  assert.ok(operator.includes("单组示例"));
  assert.ok(operator.includes("sequence-execute-dry-run.cmd"));
  assert.ok(operator.includes("steps/02-frontend-stage-commit.execute-apply-stage.cmd"));

  const outputDir = path.join(os.tmpdir(), `delivery-manifest-${Date.now()}`);
  const repoRoot = path.join(os.tmpdir(), `delivery-manifest-repo-${Date.now()}`);
  const artifacts = buildDeliveryManifestArtifacts(manifest, { outputDir, repoRoot });

  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("steps", "01-verify-smoke.cmd"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith("OPERATOR.txt")));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("steps", "02-frontend-stage-commit.files.txt"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith("sequence.cmd")));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("steps", "02-frontend-stage-commit.execute-dry-run.cmd"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("steps", "02-frontend-stage-commit.execute-apply-stage.cmd"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("steps", "02-frontend-stage-commit.execute-apply-commit.cmd"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith("sequence-execute-dry-run.cmd")));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("steps", "02-frontend-stage-commit.session.cmd"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith("sequence-session.cmd")));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith(path.join("steps", "02-frontend-stage-commit.revert.cmd"))));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith("sequence-revert.cmd")));

  const cmdSequence = artifacts.find((artifact) => artifact.path.endsWith("sequence.cmd")).content;
  assert.ok(cmdSequence.includes("call \"%SCRIPT_DIR%steps\\01-verify-smoke.cmd\""));
  const cmdExecuteDryRunSequence = artifacts.find((artifact) => artifact.path.endsWith("sequence-execute-dry-run.cmd")).content;
  assert.ok(cmdExecuteDryRunSequence.includes("call \"%SCRIPT_DIR%steps\\02-frontend-stage-commit.execute-dry-run.cmd\""));
  const executeDryRunScript = artifacts.find((artifact) => artifact.path.endsWith(path.join("steps", "02-frontend-stage-commit.execute-dry-run.cmd"))).content;
  assert.ok(executeDryRunScript.includes("node scripts/delivery-execute.js --step frontend --write-audit"));
  const executeApplyStageScript = artifacts.find((artifact) => artifact.path.endsWith(path.join("steps", "02-frontend-stage-commit.execute-apply-stage.cmd"))).content;
  assert.ok(executeApplyStageScript.includes("node scripts/delivery-execute.js --step frontend --stage-only --apply --write-audit"));
  const executeApplyCommitScript = artifacts.find((artifact) => artifact.path.endsWith(path.join("steps", "02-frontend-stage-commit.execute-apply-commit.cmd"))).content;
  assert.ok(executeApplyCommitScript.includes("node scripts/delivery-execute.js --step frontend --commit-only --apply --write-audit"));
  const cmdSessionSequence = artifacts.find((artifact) => artifact.path.endsWith("sequence-session.cmd")).content;
  assert.ok(cmdSessionSequence.includes("call \"%SCRIPT_DIR%steps\\02-frontend-stage-commit.session.cmd\""));
  const sessionScript = artifacts.find((artifact) => artifact.path.endsWith(path.join("steps", "02-frontend-stage-commit.session.cmd"))).content;
  assert.ok(sessionScript.includes("node scripts/delivery-session.js --step frontend --apply --write-audit --audit-alias 02-frontend-stage-commit"));
  const revertScript = artifacts.find((artifact) => artifact.path.endsWith(path.join("steps", "02-frontend-stage-commit.revert.cmd"))).content;
  assert.ok(revertScript.includes("node scripts/delivery-revert.js --audit output/delivery-session/02-frontend-stage-commit.json --apply"));
  const cmdRevertSequence = artifacts.find((artifact) => artifact.path.endsWith("sequence-revert.cmd")).content;
  assert.ok(cmdRevertSequence.includes("call \"%SCRIPT_DIR%steps\\02-frontend-stage-commit.revert.cmd\""));

  const written = renderWrittenManifestArtifactsText(artifacts, outputDir);
  assert.ok(written.includes("输出目录"));
  assert.ok(written.includes("manifest.json"));
});
