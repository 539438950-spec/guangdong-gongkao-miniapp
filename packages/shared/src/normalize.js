const { EDUCATION_LEVELS, DEGREE_LEVELS } = require("./constants");

function normalizeTitle(title) {
  return String(title || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[\u3010\u3011\[\]\uff08\uff09()]/g, "")
    .toLowerCase();
}

function buildNoticeDedupKey(notice) {
  return [
    notice.sourceId,
    notice.url,
    normalizeTitle(notice.title),
    notice.publishedAt
  ].join("|");
}

function toEducationLevel(raw) {
  const value = String(raw || "");
  if (
    value.includes("\u7814\u7a76\u751f") ||
    value.includes("\u7855\u58eb") ||
    value.includes("\u535a\u58eb")
  ) {
    return "postgraduate";
  }
  if (value.includes("\u672c\u79d1")) {
    return "undergraduate";
  }
  if (value.includes("\u5927\u4e13") || value.includes("\u4e13\u79d1")) {
    return "college";
  }
  return EDUCATION_LEVELS[0];
}

function toDegreeLevel(raw) {
  const value = String(raw || "");
  if (value.includes("\u535a\u58eb")) return "doctorate";
  if (value.includes("\u7855\u58eb")) return "master";
  if (value.includes("\u5b66\u58eb")) return "bachelor";
  if (value.includes("\u4e13\u79d1") || value.includes("\u5927\u4e13")) return "associate";
  return DEGREE_LEVELS[0];
}

function normalizeServiceRequirement(raw) {
  const value = String(raw || "").trim();
  if (
    !value ||
    value === "\u4e0d\u9650" ||
    value === "\u5426" ||
    value === "\u4e0d\u8981\u6c42"
  ) {
    return "\u4e0d\u9650";
  }
  if (value.includes("\u5e94\u5c4a")) return "\u5e94\u5c4a";
  if (value.includes("\u57fa\u5c42") && value.includes("2")) {
    return "2\u5e74\u4ee5\u4e0a\u57fa\u5c42\u5de5\u4f5c\u7ecf\u5386";
  }
  if (value.includes("\u670d\u52a1\u57fa\u5c42") || value.includes("\u9879\u76ee\u4eba\u5458")) {
    return "\u670d\u52a1\u57fa\u5c42\u9879\u76ee\u4eba\u5458";
  }
  return value;
}

function normalizeMajorTags(raw) {
  return String(raw || "")
    .split(/[\uff1b;\u3001\uff0c,\s]+/)
    .map((item) => item.trim())
    .map((item) =>
      item.replace(
        /^(\u7814\u7a76\u751f|\u672c\u79d1|\u5927\u4e13|\u4e13\u79d1):/,
        ""
      )
    )
    .filter(Boolean);
}

function extractMajorCodes(raw) {
  return Array.from(
    new Set(
      (String(raw || "").match(/[AB]\d{2,6}/gi) || [])
        .map((item) => String(item || "").toUpperCase().replace(/[^AB0-9]/g, ""))
        .filter(Boolean)
    )
  );
}

module.exports = {
  normalizeTitle,
  buildNoticeDedupKey,
  toEducationLevel,
  toDegreeLevel,
  normalizeServiceRequirement,
  normalizeMajorTags,
  extractMajorCodes
};
