const test = require("node:test");
const assert = require("node:assert/strict");

const { explainMajorMatch, matchMajorKeywords } = require("../utils/major-matcher");

test("major matcher should match by grouped aliases and raw codes", () => {
  assert.equal(matchMajorKeywords("法学类、新闻传播学类", "法学"), true);
  assert.equal(matchMajorKeywords("研究生:法学(A0301)", "A03"), true);
  assert.equal(matchMajorKeywords("本科:计算机科学与技术(B080901)", "B0809"), true);
});

test("major matcher should reject unrelated majors", () => {
  assert.equal(matchMajorKeywords("研究生:公共管理(A1204)", "A0301"), false);
  assert.equal(matchMajorKeywords("经济学类、公共管理类", "法学,会计"), false);
});

test("major matcher should prefer structured major codes when provided", () => {
  assert.equal(
    matchMajorKeywords(
      {
        majorRequirement: "",
        majorCodes: ["B080901"]
      },
      "B0809"
    ),
    true
  );
  assert.equal(
    matchMajorKeywords(
      {
        majorRequirement: "unrelated text",
        majorCodes: ["A0301"]
      },
      "A03"
    ),
    true
  );
  assert.equal(
    matchMajorKeywords(
      {
        majorRequirement: "",
        majorCodes: ["A0301"]
      },
      "B0809"
    ),
    false
  );
});

test("major matcher should provide explanation summary for matched requirements", () => {
  const result = explainMajorMatch(
    {
      majorRequirement: "",
      majorCodes: ["A0301"]
    },
    "A03"
  );

  assert.equal(result.matched, true);
  assert.ok(result.reasons[0].includes("专业代码"));
  assert.equal(result.summary, result.reasons[0]);
});
