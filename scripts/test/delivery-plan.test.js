const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBaselineDecision,
  buildDeliveryPlan,
  renderDeliveryPlanText,
  buildDeliveryPlanArtifacts,
  renderWrittenPlanArtifactsText
} = require("../delivery-plan-lib");

test("delivery plan should include baseline group when baseline report is clean", () => {
  const decision = buildBaselineDecision({
    summary: {
      gitChanged: 5,
      "out-of-sync": 0,
      "missing-baseline": 0,
      "missing-runtime": 0
    }
  }, {
    id: "baseline",
    count: 5
  });

  assert.equal(decision.include, true);
});

test("delivery plan should mark baseline group for review when runtime drifts", () => {
  const deliveryPlan = buildDeliveryPlan({
    deliveryReport: { totalChanged: 10 },
    stagePlan: {
      groups: [
        { id: "frontend", label: "前端与页面链路", order: 1, count: 2, stageCommand: "git add -- a", commitCommand: "git commit -m \"a\"" },
        { id: "baseline", label: "显式基线", order: 2, count: 1, stageCommand: "git add -- b", commitCommand: "git commit -m \"b\"" }
      ]
    },
    baselineReport: {
      summary: {
        gitChanged: 1,
        "out-of-sync": 1,
        "missing-baseline": 0,
        "missing-runtime": 0
      }
    }
  });

  assert.equal(deliveryPlan.baselineDecision.include, false);
  assert.equal(deliveryPlan.groups.find((group) => group.id === "baseline").include, false);
  assert.ok(deliveryPlan.steps.some((step) => step.groupId === "baseline" && step.required === false));
});

test("delivery plan should render text and export artifacts", () => {
  const plan = buildDeliveryPlan({
    deliveryReport: { totalChanged: 4 },
    stagePlan: {
      groups: [
        { id: "frontend", label: "前端与页面链路", order: 1, count: 2, stageCommand: "git add -- a", commitCommand: "git commit -m \"a\"" },
        { id: "docs", label: "文档", order: 2, count: 1, stageCommand: "git add -- b", commitCommand: "git commit -m \"b\"" }
      ]
    },
    baselineReport: {
      summary: {
        gitChanged: 0,
        "out-of-sync": 0,
        "missing-baseline": 0,
        "missing-runtime": 0
      }
    }
  });

  const text = renderDeliveryPlanText(plan);
  assert.ok(text.includes("交付计划"));
  assert.ok(text.includes("smoke 状态"));
  assert.ok(text.includes("提交顺序"));

  const outputDir = path.join(os.tmpdir(), `delivery-plan-${Date.now()}`);
  const artifacts = buildDeliveryPlanArtifacts(plan, { outputDir });
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith("sequence.cmd")));
  assert.ok(artifacts.some((artifact) => artifact.path.endsWith("sequence.sh")));

  const artifactText = renderWrittenPlanArtifactsText(artifacts, outputDir);
  assert.ok(artifactText.includes("输出目录"));
  assert.ok(artifactText.includes("plan.json"));
});
