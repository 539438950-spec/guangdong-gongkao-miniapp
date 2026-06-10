const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

const {
  parsePositionWorkbooks,
  mapParsedRowsToPositions,
  deriveFreshGraduateOnly,
  deriveServiceRequirement,
  extractPoliticalStatusFromNotes,
  stripPoliticalStatusFromNotes
} = require("../src/core/position-workbook");

test("deriveFreshGraduateOnly should recognize affirmative and negative values", () => {
  assert.equal(deriveFreshGraduateOnly("是"), true);
  assert.equal(deriveFreshGraduateOnly("限应届毕业生报考"), true);
  assert.equal(deriveFreshGraduateOnly("否"), false);
  assert.equal(deriveFreshGraduateOnly("不限"), false);
});

test("mapParsedRowsToPositions should extract structured major codes", () => {
  const positions = mapParsedRowsToPositions({
    source: {
      examType: "guangdong-provincial"
    },
    notice: {
      id: "notice-major-codes",
      title: "major-code-test",
      url: "https://rsks.gd.gov.cn/example-2",
      area: "guangdong",
      publishedAt: "2025-01-07T00:00:00.000Z"
    },
    batchId: "batch-major-codes",
    rows: [
      {
        agency: "demo-agency",
        title: "demo-title",
        positionCode: "10101002",
        positionType: "demo-type",
        headcountValue: 1,
        educationRaw: "undergraduate",
        degreeRaw: "bachelor",
        majorPostgraduate: "Law(A0301)",
        majorUndergraduate: "Law(B0301),IP(B030102)",
        majorCollege: "",
        serviceRequirement: "",
        freshGraduateOnly: "",
        politicalStatus: "",
        notes: "",
        examArea: "guangzhou"
      }
    ]
  });

  assert.deepEqual(positions[0].majorCodes, ["A0301", "B0301", "B030102"]);
});

test("deriveServiceRequirement should map simple values", () => {
  assert.equal(deriveServiceRequirement("是"), "2年以上基层工作经历");
  assert.equal(deriveServiceRequirement("否"), "不限");
  assert.equal(deriveServiceRequirement(""), "不限");
});

test("political status should be extracted from notes", () => {
  assert.equal(extractPoliticalStatusFromNotes("中共党员"), "中共党员");
  assert.equal(extractPoliticalStatusFromNotes("中共党员；需开展心理素质测评"), "中共党员");
  assert.equal(stripPoliticalStatusFromNotes("中共党员；需开展心理素质测评"), "需开展心理素质测评");
  assert.equal(stripPoliticalStatusFromNotes("共青团员"), "");
});

test("mapParsedRowsToPositions should normalize rsks workbook rows", () => {
  const positions = mapParsedRowsToPositions({
    source: {
      examType: "guangdong-provincial"
    },
    notice: {
      id: "notice-1",
      title: "广东省2025年考试录用公务员公告",
      url: "https://rsks.gd.gov.cn/example",
      area: "广东",
      publishedAt: "2025-01-07T00:00:00.000Z"
    },
    batchId: "batch-1",
    rows: [
      {
        agency: "广州市人民政府办公厅",
        title: "一级主任科员以下",
        positionCode: "10101001",
        positionType: "综合管理类",
        headcountValue: 2,
        educationRaw: "本科以上",
        degreeRaw: "学士以上",
        majorPostgraduate: "",
        majorUndergraduate: "法学类",
        majorCollege: "",
        serviceRequirement: "是",
        freshGraduateOnly: "否",
        politicalStatus: "",
        notes: "中共党员；需要加班",
        examArea: "广州"
      }
    ]
  });

  assert.equal(positions.length, 1);
  assert.equal(positions[0].agency, "广州市人民政府办公厅");
  assert.equal(positions[0].serviceRequirement, "2年以上基层工作经历");
  assert.equal(positions[0].freshGraduateOnly, false);
  assert.equal(positions[0].majorRaw, "本科:法学类");
  assert.equal(positions[0].area, "广州");
  assert.equal(positions[0].politicalStatus, "中共党员");
  assert.equal(positions[0].notes, "需要加班");
});

test("parsePositionWorkbooks should parse a generated xlsx workbook", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gongkao-position-"));
  const workbookPath = path.join(tempDir, "positions.xlsx");
  const normalizedWorkbookPath = workbookPath.replace(/\\/g, "\\\\");
  const python = [
    "from openpyxl import Workbook",
    "wb = Workbook()",
    "ws = wb.active",
    "ws.title = '县以上机关'",
    "ws.append(['招考单位','单位代码','招考职位','职位代码','职位简介','职位类型','录用人数','学历','学位','研究生专业 名称及代码','本科专业 名称及代码','大专专业 名称及代码','是否要求2年以上基层工作经历','是否限应届毕业生报考','其他要求','考区'])",
    "ws.append(['广东省财政厅','1001','一级主任科员以下','2001','从事财政工作','综合管理类',2,'本科以上','学士以上','','财政学类','','否','否','有基层一线值班要求','广州'])",
    `wb.save(r'${normalizedWorkbookPath}')`
  ].join("\n");
  const result = spawnSync("python", ["-"], {
    input: python,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const parsed = parsePositionWorkbooks([workbookPath]);

  assert.ok(parsed.selected);
  assert.equal(parsed.selected.totalRows, 1);
  assert.equal(parsed.selected.sheets[0].name, "县以上机关");
  assert.equal(parsed.selected.rows[0].agency, "广东省财政厅");
  assert.equal(parsed.selected.rows[0].positionCode, "2001");
});
