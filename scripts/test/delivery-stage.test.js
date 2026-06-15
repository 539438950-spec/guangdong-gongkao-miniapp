const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildGitAddCommand,
  buildGitCommitCommand,
  buildStagePlan,
  renderStagePlanText,
  buildStageArtifacts,
  renderWrittenArtifactsText
} = require("../delivery-stage-lib");

test("delivery stage should build git commands with quoted files", () => {
  assert.equal(
    buildGitAddCommand(["apps/weapp/pages/compare/index.js", "README.md"]),
    'git add -- "apps/weapp/pages/compare/index.js" "README.md"'
  );
  assert.equal(
    buildGitCommitCommand("frontend"),
    'git commit -m "feat(weapp): refine page flows and compare interactions"'
  );
});

test("delivery stage should build ordered groups and support filters", () => {
  const report = {
    totalChanged: 5,
    changed: [
      { status: " M", file: "services/api/src/core.js" },
      { status: " M", file: "apps/weapp/pages/compare/index.js" },
      { status: " M", file: "README.md" },
      { status: " M", file: "apps/weapp/data/ingested.js" },
      { status: "??", file: "scripts/delivery-stage.js" }
    ]
  };

  const fullPlan = buildStagePlan(report);
  assert.deepEqual(fullPlan.groups.map((group) => group.id), ["frontend", "platform", "docs", "baseline"]);
  assert.equal(fullPlan.groups[0].stageCommand, 'git add -- "apps/weapp/pages/compare/index.js"');

  const filteredPlan = buildStagePlan(report, { groupIds: ["platform", "docs"] });
  assert.deepEqual(filteredPlan.groups.map((group) => group.id), ["platform", "docs"]);
});

test("delivery stage should render text guidance", () => {
  const plan = {
    totalChanged: 2,
    groups: [
      {
        id: "frontend",
        label: "前端与页面链路",
        order: 1,
        count: 2,
        files: ["apps/weapp/pages/compare/index.js", "apps/weapp/pages/positions/index.js"],
        stageCommand: 'git add -- "apps/weapp/pages/compare/index.js" "apps/weapp/pages/positions/index.js"',
        commitCommand: 'git commit -m "feat(weapp): refine page flows and compare interactions"'
      }
    ]
  };

  const text = renderStagePlanText(plan);
  assert.ok(text.includes("广东公考小程序交付编排"));
  assert.ok(text.includes("建议执行顺序"));
  assert.ok(text.includes("stage: git add --"));
  assert.ok(text.includes("--group frontend"));
  assert.ok(text.includes("--write"));
});

test("delivery stage should build exportable artifacts for each commit group", () => {
  const plan = {
    totalChanged: 2,
    groups: [
      {
        id: "frontend",
        label: "前端与页面链路",
        order: 1,
        count: 1,
        files: ["apps/weapp/pages/compare/index.js"],
        stageCommand: 'git add -- "apps/weapp/pages/compare/index.js"',
        commitCommand: 'git commit -m "feat(weapp): refine page flows and compare interactions"'
      },
      {
        id: "docs",
        label: "文档",
        order: 2,
        count: 1,
        files: ["README.md"],
        stageCommand: 'git add -- "README.md"',
        commitCommand: 'git commit -m "docs: update delivery and execution contracts"'
      }
    ]
  };

  const outputDir = path.join(os.tmpdir(), `delivery-stage-${Date.now()}`);
  const artifacts = buildStageArtifacts(plan, { outputDir });

  assert.equal(artifacts[0].path, path.join(outputDir, "plan.json"));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith("01-frontend.stage.cmd")));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith("02-docs.commit.sh")));

  const text = renderWrittenArtifactsText(artifacts, outputDir);
  assert.ok(text.includes("输出目录"));
  assert.ok(text.includes("plan.json"));
});
