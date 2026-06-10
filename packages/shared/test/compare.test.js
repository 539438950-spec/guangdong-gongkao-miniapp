const test = require("node:test");
const assert = require("node:assert/strict");

const {
  EXAM_TYPES,
  assertComparePositions,
  recommendSimilarPositions,
  buildNoticeDedupKey
} = require("../src");

function createPosition(overrides = {}) {
  return {
    id: overrides.id || "p-default",
    examType: overrides.examType || EXAM_TYPES.GUANGDONG_PROVINCIAL,
    agency: overrides.agency || "demo-agency",
    title: overrides.title || "demo-position",
    positionType: overrides.positionType || "admin",
    area: overrides.area || "guangzhou",
    educationLevel: overrides.educationLevel || "undergraduate",
    degreeLevel: overrides.degreeLevel || "bachelor",
    majorTags: overrides.majorTags || ["law"],
    majorCodes: overrides.majorCodes || [],
    serviceRequirement: overrides.serviceRequirement || "none",
    freshGraduateOnly: Boolean(overrides.freshGraduateOnly),
    politicalStatus: overrides.politicalStatus || "none",
    notes: overrides.notes || "n/a"
  };
}

test("buildNoticeDedupKey should be stable for normalized titles", () => {
  const left = buildNoticeDedupKey({
    sourceId: "rsks-gd",
    url: "https://rsks.gd.gov.cn/demo",
    title: "[Demo] 2026 Notice",
    publishedAt: "2026-01-08"
  });
  const right = buildNoticeDedupKey({
    sourceId: "rsks-gd",
    url: "https://rsks.gd.gov.cn/demo",
    title: "(demo) 2026   notice",
    publishedAt: "2026-01-08"
  });

  assert.equal(left, right);
});

test("assertComparePositions should block cross exam compare", () => {
  const base = createPosition({ id: "p1" });
  const other = createPosition({
    id: "p2",
    examType: EXAM_TYPES.NATIONAL
  });

  assert.throws(() => assertComparePositions(base, [base, other]), /cross exam type/);
});

test("recommendSimilarPositions should prioritize major and education overlap", () => {
  const base = createPosition({
    id: "p1",
    majorTags: ["law", "journalism"]
  });
  const best = createPosition({
    id: "p2",
    majorTags: ["law", "journalism"],
    area: "guangzhou"
  });
  const weaker = createPosition({
    id: "p3",
    majorTags: ["economics"],
    degreeLevel: "master",
    area: "shenzhen"
  });

  const results = recommendSimilarPositions(base, [best, weaker]);

  assert.equal(results[0].id, "p2");
  assert.match(results[0].reasons.join(","), /专业重合/);
  assert.ok(results[0].score > results[1].score);
});

test("recommendSimilarPositions should use structured major codes when tags differ", () => {
  const base = createPosition({
    id: "p-code-1",
    majorTags: ["base-tag"],
    majorCodes: ["B0809"]
  });
  const best = createPosition({
    id: "p-code-2",
    majorTags: ["other-tag"],
    majorCodes: ["B080901"]
  });
  const weaker = createPosition({
    id: "p-code-3",
    majorTags: ["other-tag"],
    majorCodes: ["A0301"],
    area: "shenzhen"
  });

  const results = recommendSimilarPositions(base, [best, weaker]);

  assert.equal(results[0].id, "p-code-2");
  assert.match(results[0].reasons.join(","), /专业重合/);
  assert.ok(results[0].score > results[1].score);
});
