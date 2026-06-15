const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parsePorcelain,
  classifyFile,
  deriveCommitGroup,
  buildDeliveryReport,
  renderTextReport
} = require("../delivery-report-lib");

test("delivery report should parse git porcelain and classify files", () => {
  const parsed = parsePorcelain([
    " M apps/weapp/pages/compare/index.js",
    " M README.md",
    " M apps/weapp/data/ingested.js",
    "?? services/runtime-paths.js"
  ].join("\n"));

  assert.equal(parsed.length, 4);
  assert.equal(classifyFile(parsed[0].file), "source");
  assert.equal(classifyFile(parsed[1].file), "docs");
  assert.equal(classifyFile(parsed[2].file), "baseline");
  assert.equal(classifyFile(parsed[3].file), "source");
});

test("delivery report should derive suggested commit groups", () => {
  assert.equal(deriveCommitGroup({ file: "apps/weapp/pages/compare/index.js" }), "frontend");
  assert.equal(deriveCommitGroup({ file: "services/api/src/core.js" }), "platform");
  assert.equal(deriveCommitGroup({ file: "docs/delivery-checklist.md" }), "docs");
  assert.equal(deriveCommitGroup({ file: "AGENTS.md" }), "docs");
  assert.equal(deriveCommitGroup({ file: "services/ingest/var/production/rsks-gd.json" }), "baseline");
});

test("delivery report should render text and json-friendly structure", () => {
  const report = buildDeliveryReport([
    { status: " M", file: "apps/weapp/pages/compare/index.js" },
    { status: " M", file: "README.md" },
    { status: " M", file: "apps/weapp/data/ingested.js" },
    { status: "??", file: "services/runtime-paths.js" }
  ]);

  assert.equal(report.totalChanged, 4);
  assert.equal(report.summary.source.length, 2);
  assert.equal(report.summary.docs.length, 1);
  assert.equal(report.summary.baseline.length, 1);
  assert.equal(report.commitGroups.find((group) => group.id === "frontend").items.length, 1);
  assert.equal(report.commitGroups.find((group) => group.id === "platform").items.length, 1);

  const text = renderTextReport(report);
  assert.ok(text.includes("广东公考小程序交付状态报告"));
  assert.ok(text.includes("建议提交分组"));
  assert.ok(text.includes("前端与页面链路: 1"));
  assert.ok(text.includes("显式基线: 1"));
});
