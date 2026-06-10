const fs = require("node:fs");
const path = require("node:path");
const {
  toEducationLevel,
  toDegreeLevel,
  normalizeServiceRequirement,
  normalizeMajorTags,
  extractMajorCodes
} = require("../../../../packages/shared/src");

const FIELD_LABELS = {
  area: "地区",
  agency: "招录单位",
  title: "岗位名称",
  positionType: "职位类型",
  headcount: "招录人数",
  educationRaw: "学历要求",
  educationLevel: "学历标准值",
  degreeRaw: "学位要求",
  degreeLevel: "学位标准值",
  majorRaw: "专业要求",
  majorTags: "专业标签",
  majorCodes: "专业代码",
  serviceRequirement: "基层经历",
  freshGraduateOnly: "应届限制",
  politicalStatus: "政治面貌",
  notes: "其他要求",
  examArea: "考区",
  normalizedReady: "结构化状态"
};

const SUPPORTED_UPDATE_FIELDS = new Set(Object.keys(FIELD_LABELS));

function defaultPositionOverridePath() {
  return path.resolve(__dirname, "../../var/position-overrides.json");
}

function normalizeOverrideRule(rule = {}, index = 0) {
  return {
    id: String(rule.id || `position-override-${index + 1}`),
    sourceId: String(rule.sourceId || "").trim(),
    noticeId: String(rule.noticeId || "").trim(),
    positionId: String(rule.positionId || "").trim(),
    positionCode: String(rule.positionCode || "").trim(),
    examType: String(rule.examType || "").trim(),
    agencyIncludes: String(rule.agencyIncludes || "").trim(),
    titleIncludes: String(rule.titleIncludes || "").trim(),
    reason: String(rule.reason || "").trim(),
    updatedAt: String(rule.updatedAt || "").trim(),
    updates: rule.updates && typeof rule.updates === "object" ? rule.updates : {}
  };
}

function persistPositionOverrideRules(filePath = defaultPositionOverridePath(), rules = []) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ rules: (rules || []).map((item, index) => normalizeOverrideRule(item, index)) }, null, 2)}\n`,
    "utf8"
  );
}

function loadPositionOverrideRules(filePath = defaultPositionOverridePath()) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const rules = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.rules)
      ? payload.rules
      : [];

  return rules.map((item, index) => normalizeOverrideRule(item, index));
}

function normalizeOverrideValue(field, value) {
  if (field === "headcount") {
    return Number(value || 0);
  }
  if (field === "freshGraduateOnly" || field === "normalizedReady") {
    return Boolean(value);
  }
  if (field === "majorTags" || field === "majorCodes" || field === "correctedFields") {
    return Array.isArray(value)
      ? value.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
  }
  return typeof value === "string" ? value.trim() : value;
}

function areEqualValues(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftList = Array.isArray(left) ? left : [];
    const rightList = Array.isArray(right) ? right : [];
    return JSON.stringify(leftList) === JSON.stringify(rightList);
  }
  return left === right;
}

function matchesOverrideRule(position = {}, rule = {}) {
  if (rule.sourceId && String(position.sourceId || "").trim() !== rule.sourceId) {
    return false;
  }
  if (rule.noticeId && String(position.noticeId || "").trim() !== rule.noticeId) {
    return false;
  }
  if (rule.positionId && String(position.id || "").trim() !== rule.positionId) {
    return false;
  }
  if (rule.positionCode && String(position.positionCode || "").trim() !== rule.positionCode) {
    return false;
  }
  if (rule.examType && String(position.examType || "").trim() !== rule.examType) {
    return false;
  }
  if (rule.agencyIncludes && !String(position.agency || "").includes(rule.agencyIncludes)) {
    return false;
  }
  if (rule.titleIncludes && !String(position.title || "").includes(rule.titleIncludes)) {
    return false;
  }
  return true;
}

function buildCorrectionSummary(correctedFields = []) {
  const uniqueLabels = Array.from(new Set(
    (correctedFields || []).map((field) => FIELD_LABELS[field] || field).filter(Boolean)
  ));
  if (!uniqueLabels.length) {
    return "";
  }
  if (uniqueLabels.length === 1) {
    return `${uniqueLabels[0]}已人工纠错`;
  }
  if (uniqueLabels.length === 2) {
    return `${uniqueLabels.join("、")}已人工纠错`;
  }
  return `${uniqueLabels.slice(0, 2).join("、")}等 ${uniqueLabels.length} 项已人工纠错`;
}

function applyDerivedFields(position, updatedFields) {
  const next = { ...position };

  if (updatedFields.has("educationRaw") && !updatedFields.has("educationLevel")) {
    next.educationLevel = toEducationLevel(next.educationRaw);
  }
  if (updatedFields.has("degreeRaw") && !updatedFields.has("degreeLevel")) {
    next.degreeLevel = toDegreeLevel(next.degreeRaw);
  }
  if (updatedFields.has("majorRaw")) {
    if (!updatedFields.has("majorTags")) {
      next.majorTags = normalizeMajorTags(next.majorRaw);
    }
    if (!updatedFields.has("majorCodes")) {
      next.majorCodes = extractMajorCodes(next.majorRaw);
    }
  }
  if (updatedFields.has("serviceRequirement")) {
    next.serviceRequirement = normalizeServiceRequirement(next.serviceRequirement);
  }

  return next;
}

function resetPositionCorrections(position = {}) {
  const correctionLog = Array.isArray(position.correctionLog) ? position.correctionLog.slice() : [];
  if (!correctionLog.length) {
    return {
      ...position,
      hasManualCorrections: false,
      correctedFields: Array.isArray(position.correctedFields) ? position.correctedFields : [],
      correctionSummary: position.correctionSummary || "",
      correctionLog: []
    };
  }

  const updatedFields = new Set();
  const next = {
    ...position
  };

  correctionLog.slice().reverse().forEach((entry) => {
    const fields = Array.isArray(entry && entry.fields) ? entry.fields.slice().reverse() : [];
    fields.forEach((fieldChange) => {
      if (!fieldChange || !SUPPORTED_UPDATE_FIELDS.has(fieldChange.field)) {
        return;
      }
      next[fieldChange.field] = fieldChange.from;
      updatedFields.add(fieldChange.field);
    });
  });

  const reverted = applyDerivedFields(next, updatedFields);
  return {
    ...reverted,
    hasManualCorrections: false,
    correctedFields: [],
    correctionSummary: "",
    correctionLog: []
  };
}

function applySingleOverrideRule(position = {}, rule = {}) {
  if (!matchesOverrideRule(position, rule)) {
    return {
      position,
      applied: false,
      appliedFields: []
    };
  }

  const updatedFields = new Set();
  const fieldChanges = [];
  let next = { ...position };

  for (const [field, rawValue] of Object.entries(rule.updates || {})) {
    if (!SUPPORTED_UPDATE_FIELDS.has(field)) {
      continue;
    }

    const previousValue = next[field];
    const nextValue = normalizeOverrideValue(field, rawValue);
    if (areEqualValues(previousValue, nextValue)) {
      continue;
    }

    next[field] = nextValue;
    updatedFields.add(field);
    fieldChanges.push({
      field,
      label: FIELD_LABELS[field] || field,
      from: previousValue,
      to: nextValue
    });
  }

  if (!fieldChanges.length) {
    return {
      position,
      applied: false,
      appliedFields: []
    };
  }

  next = applyDerivedFields(next, updatedFields);

  const correctedFields = Array.from(new Set([
    ...(Array.isArray(position.correctedFields) ? position.correctedFields : []),
    ...fieldChanges.map((item) => item.field)
  ]));

  return {
    applied: true,
    appliedFields: fieldChanges.map((item) => item.field),
    position: {
      ...next,
      hasManualCorrections: true,
      correctedFields,
      correctionSummary: buildCorrectionSummary(correctedFields),
      correctionLog: [
        ...(Array.isArray(position.correctionLog) ? position.correctionLog : []),
        {
          ruleId: rule.id,
          reason: rule.reason || "",
          updatedAt: rule.updatedAt || "",
          fields: fieldChanges
        }
      ]
    }
  };
}

function applyPositionOverrideRules(positions = [], rules = []) {
  const normalizedRules = Array.isArray(rules) ? rules : [];
  const appliedRuleIds = new Set();
  let correctedPositionCount = 0;
  let correctedFieldCount = 0;

  const nextPositions = (positions || []).map((item) => {
    let next = item;
    let appliedForPosition = false;

    normalizedRules.forEach((rule) => {
      const result = applySingleOverrideRule(next, rule);
      if (!result.applied) {
        return;
      }
      next = result.position;
      appliedForPosition = true;
      correctedFieldCount += result.appliedFields.length;
      appliedRuleIds.add(rule.id);
    });

    if (appliedForPosition) {
      correctedPositionCount += 1;
    }

    return next;
  });

  return {
    positions: nextPositions,
    stats: {
      correctedPositionCount,
      correctedFieldCount,
      appliedRuleCount: appliedRuleIds.size,
      appliedRuleIds: Array.from(appliedRuleIds)
    }
  };
}

module.exports = {
  FIELD_LABELS,
  SUPPORTED_UPDATE_FIELDS,
  defaultPositionOverridePath,
  normalizeOverrideRule,
  loadPositionOverrideRules,
  persistPositionOverrideRules,
  matchesOverrideRule,
  buildCorrectionSummary,
  resetPositionCorrections,
  applyPositionOverrideRules
};
