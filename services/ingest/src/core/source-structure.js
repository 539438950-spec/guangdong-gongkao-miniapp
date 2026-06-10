const crypto = require("node:crypto");

function sha1(input) {
  return crypto.createHash("sha1").update(String(input || "")).digest("hex");
}

function normalizeTokenPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractStructureToken(tagName, attrs) {
  const tag = normalizeTokenPart(tagName);
  if (!tag) {
    return "";
  }

  const idMatch = String(attrs || "").match(/\sid=["']([^"']+)["']/i);
  const classMatch = String(attrs || "").match(/\sclass=["']([^"']+)["']/i);
  const idPart = idMatch ? normalizeTokenPart(idMatch[1]) : "";
  const classParts = classMatch
    ? classMatch[1]
      .split(/\s+/)
      .map(normalizeTokenPart)
      .filter(Boolean)
      .sort()
      .slice(0, 4)
    : [];

  return [
    tag,
    idPart ? `#${idPart}` : "",
    classParts.length ? `.${classParts.join(".")}` : ""
  ].join("");
}

function buildHtmlPartStructureMeta(html, label) {
  const input = String(html || "");
  const counts = new Map();
  const sequence = [];
  const tagMatches = input.matchAll(/<([a-zA-Z0-9]+)([^>]*)>/g);

  for (const match of tagMatches) {
    const token = extractStructureToken(match[1], match[2]);
    if (!token) {
      continue;
    }
    counts.set(token, (counts.get(token) || 0) + 1);
    if (sequence.length < 160) {
      sequence.push(token);
    }
  }

  const ranked = Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12);
  const summary = ranked
    .slice(0, 6)
    .map(([token, count]) => `${token}:${count}`)
    .join(" | ");
  const signature = [
    `label=${label || "part"}`,
    `top=${ranked.map(([token, count]) => `${token}:${count}`).join(",")}`,
    `seq=${sequence.join(">")}`,
    `links=${(input.match(/<a\b/gi) || []).length}`,
    `tables=${(input.match(/<table\b/gi) || []).length}`,
    `lists=${(input.match(/<(ul|ol)\b/gi) || []).length}`,
    `forms=${(input.match(/<form\b/gi) || []).length}`
  ].join(";");

  return {
    label: label || "part",
    fingerprint: sha1(signature),
    summary: summary || "no-structure-token"
  };
}

function buildCompositeStructureMeta(parts) {
  const normalizedParts = (parts || [])
    .filter((item) => item && item.html)
    .map((item) => buildHtmlPartStructureMeta(item.html, item.label));

  if (!normalizedParts.length) {
    return null;
  }

  const fingerprint = sha1(
    normalizedParts.map((item) => `${item.label}:${item.fingerprint}`).join("|")
  );
  const summary = normalizedParts
    .map((item) => `${item.label}[${item.summary}]`)
    .join(" ; ");

  return {
    fingerprint,
    summary,
    parts: normalizedParts
  };
}

module.exports = {
  buildCompositeStructureMeta
};
