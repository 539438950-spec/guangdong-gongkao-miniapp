const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  createPosition,
  toEducationLevel,
  toDegreeLevel,
  normalizeServiceRequirement,
  normalizeMajorTags,
  extractMajorCodes
} = require("../../../../packages/shared/src");

function isWorkbookPath(filePath) {
  return /\.(xlsx?|xls)$/i.test(String(filePath || ""));
}

const POSITION_WORKBOOK_FIELDS = [
  "agency",
  "agencyCode",
  "title",
  "positionCode",
  "description",
  "positionType",
  "headcount",
  "educationRaw",
  "degreeRaw",
  "majorPostgraduate",
  "majorUndergraduate",
  "majorCollege",
  "serviceRequirement",
  "freshGraduateOnly",
  "politicalStatus",
  "notes",
  "examArea"
];

function getWorkbookPathsFromAnalysis(attachmentAnalysis) {
  const extracted = (attachmentAnalysis && attachmentAnalysis.extracted_files) || [];
  return extracted
    .map((item) => item && item.path)
    .filter(Boolean)
    .filter(isWorkbookPath);
}

function parsePositionWorkbooks(filePaths) {
  const workbookPaths = (filePaths || []).filter(isWorkbookPath);
  if (!workbookPaths.length) {
    return null;
  }

  const scriptPath = path.resolve(__dirname, "../..", "scripts", "parse_position_workbook.py");
  const result = spawnSync("python", [scriptPath, ...workbookPaths], {
    cwd: path.resolve(__dirname, "../../.."),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "position workbook parse failed");
  }

  return JSON.parse(result.stdout);
}

function summarizeWorkbookParse(workbookParse, attachmentAnalysis) {
  const selected = workbookParse && workbookParse.selected;
  const sheets = selected && Array.isArray(selected.sheets) ? selected.sheets : [];
  const matchedFieldCount = sheets.reduce((max, sheet) => {
    const fieldMap = sheet && sheet.fieldMap ? sheet.fieldMap : {};
    return Math.max(max, Object.keys(fieldMap).length);
  }, 0);
  const totalFieldCount = POSITION_WORKBOOK_FIELDS.length;
  const fieldCoveragePercent = totalFieldCount
    ? Math.round((matchedFieldCount / totalFieldCount) * 100)
    : 0;

  return {
    candidateWorkbookCount: Array.isArray(workbookParse && workbookParse.candidates)
      ? workbookParse.candidates.length
      : Array.isArray(attachmentAnalysis && attachmentAnalysis.candidate_files)
        ? attachmentAnalysis.candidate_files.length
        : 0,
    extractedWorkbookCount: Array.isArray(attachmentAnalysis && attachmentAnalysis.extracted_files)
      ? attachmentAnalysis.extracted_files.filter((item) => isWorkbookPath(item && item.path)).length
      : 0,
    parseErrorCount: Array.isArray(workbookParse && workbookParse.errors)
      ? workbookParse.errors.length
      : 0,
    matchedFieldCount,
    totalFieldCount,
    fieldCoveragePercent,
    sheetCount: sheets.length,
    sheetSummary: sheets
      .map((sheet) => `${sheet.name}:${sheet.rowCount}行/${Object.keys(sheet.fieldMap || {}).length}列`)
      .join("；"),
    workbookPath: selected && selected.path ? selected.path : "",
    workbookRowCount: selected && selected.totalRows ? selected.totalRows : 0
  };
}

function buildMajorRaw(row) {
  const segments = [
    row.majorPostgraduate ? `研究生:${row.majorPostgraduate}` : "",
    row.majorUndergraduate ? `本科:${row.majorUndergraduate}` : "",
    row.majorCollege ? `大专:${row.majorCollege}` : ""
  ].filter(Boolean);

  return segments.join("；") || "未注明";
}

function deriveServiceRequirement(raw) {
  const value = String(raw || "").trim();
  if (!value || value === "否" || value === "不要求") {
    return "不限";
  }
  if (value === "是") {
    return "2年以上基层工作经历";
  }
  return value;
}

function derivePoliticalStatus(raw) {
  const value = String(raw || "").trim();
  return value || "不限";
}

function extractPoliticalStatusFromNotes(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return "";
  }

  const patterns = [
    { pattern: /中共预备党员/g, value: "中共预备党员" },
    { pattern: /中共党员(?:（含预备党员）)?/g, value: "中共党员" },
    { pattern: /中国共产党党员/g, value: "中共党员" },
    { pattern: /共青团员/g, value: "共青团员" },
    { pattern: /民主党派(?:成员)?/g, value: "民主党派" }
  ];

  for (const item of patterns) {
    if (item.pattern.test(value)) {
      return item.value;
    }
  }

  return "";
}

function stripPoliticalStatusFromNotes(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return "";
  }

  return value
    .replace(/中国共产党党员/g, "")
    .replace(/中共党员(?:（含预备党员）)?/g, "")
    .replace(/中共预备党员/g, "")
    .replace(/共青团员/g, "")
    .replace(/民主党派(?:成员)?/g, "")
    .replace(/[；;，,、/]+/g, ";")
    .replace(/\s*;\s*/g, ";")
    .replace(/^;|;$/g, "")
    .trim();
}

function deriveNotes(row, politicalStatus) {
  const stripped = stripPoliticalStatusFromNotes(row.notes);
  if (stripped) {
    return stripped;
  }
  if (politicalStatus && politicalStatus !== "不限") {
    return "未注明";
  }
  const value = String(row.notes || "").trim();
  return value || "未注明";
}

function deriveFreshGraduateOnly(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return false;
  }
  if (/(否|不限|不限应届)/.test(value)) {
    return false;
  }
  return /(是|应届)/.test(value);
}

function mapParsedRowsToPositions({ source, notice, batchId, rows }) {
  return rows.map((row, index) => {
    const educationRaw = String(row.educationRaw || "").trim() || "未注明";
    const degreeRaw = String(row.degreeRaw || "").trim() || "未注明";
    const majorRaw = buildMajorRaw(row);
    const serviceRequirementRaw = deriveServiceRequirement(row.serviceRequirement);
    const examArea = String(row.examArea || "").trim() || notice.area;
    const directPoliticalStatus = derivePoliticalStatus(row.politicalStatus);
    const politicalStatus =
      directPoliticalStatus !== "不限"
        ? directPoliticalStatus
        : extractPoliticalStatusFromNotes(row.notes) || "不限";

    return createPosition({
      id: `${batchId}:row:${index + 1}`,
      sourceId: source.id,
      noticeId: notice.id,
      batchId,
      examType: source.examType,
      area: examArea,
      agency: String(row.agency || "").trim(),
      title: String(row.title || "").trim(),
      positionCode: String(row.positionCode || "").trim(),
      positionType: String(row.positionType || "").trim() || "综合管理类",
      headcount: Number(row.headcountValue || 0),
      educationRaw,
      educationLevel: toEducationLevel(educationRaw),
      degreeRaw,
      degreeLevel: toDegreeLevel(degreeRaw),
      majorRaw,
      majorTags: normalizeMajorTags(majorRaw),
      majorCodes: extractMajorCodes(majorRaw),
      serviceRequirement: normalizeServiceRequirement(serviceRequirementRaw),
      freshGraduateOnly: deriveFreshGraduateOnly(row.freshGraduateOnly),
      politicalStatus,
      notes: deriveNotes(row, politicalStatus),
      examArea,
      publishedAt: notice.publishedAt,
      sourceNoticeTitle: notice.title,
      sourceUrl: notice.url,
      normalizedReady: true
    });
  });
}

function buildBatchStateFromAttachment({ source, notice, batch, attachmentAnalysis }) {
  const workbookPaths = getWorkbookPathsFromAnalysis(attachmentAnalysis);
  if (!workbookPaths.length) {
    return {
      batch: {
        ...batch,
        parseStatus: "attachment-only",
        rowsTotal: 0,
        parseMetrics: summarizeWorkbookParse(null, attachmentAnalysis)
      },
      positions: [],
      workbookParse: null
    };
  }

  const workbookParse = parsePositionWorkbooks(workbookPaths);
  const selected = workbookParse && workbookParse.selected;
  if (!selected || !selected.totalRows) {
    return {
      batch: {
        ...batch,
        parseStatus: "attachment-only",
        rowsTotal: 0,
        parseMetrics: summarizeWorkbookParse(workbookParse, attachmentAnalysis),
        parseLog: [
          ...(batch.parseLog || []),
          "position workbook parse: no structured rows"
        ]
      },
      positions: [],
      workbookParse
    };
  }

  const positions = mapParsedRowsToPositions({
    source,
    notice,
    batchId: batch.id,
    rows: selected.rows
  });

  return {
    batch: {
      ...batch,
      parseStatus: "parsed",
      rowsTotal: positions.length,
      parseMetrics: summarizeWorkbookParse(workbookParse, attachmentAnalysis),
      parseLog: [
        ...(batch.parseLog || []),
        `position workbook: ${selected.path}`,
        `position sheets: ${selected.sheets.length}`,
        `position rows: ${positions.length}`
      ]
    },
    positions,
    workbookParse
  };
}

module.exports = {
  getWorkbookPathsFromAnalysis,
  parsePositionWorkbooks,
  mapParsedRowsToPositions,
  buildBatchStateFromAttachment,
  summarizeWorkbookParse,
  deriveFreshGraduateOnly,
  deriveServiceRequirement,
  extractPoliticalStatusFromNotes,
  stripPoliticalStatusFromNotes
};
