const {
  POSITION_COMPARE_LIMIT,
  COMPARE_GROUP_LIMIT
} = require("./constants");
const { extractMajorCodes } = require("./normalize");

function assertCompareGroup(groups, candidate) {
  if (groups.length >= COMPARE_GROUP_LIMIT) {
    throw new Error("compare group limit exceeded");
  }
  return candidate;
}

function assertComparePositions(basePosition, positions) {
  if (positions.length > POSITION_COMPARE_LIMIT) {
    throw new Error("compare position limit exceeded");
  }
  const invalid = positions.find((position) => position.examType !== basePosition.examType);
  if (invalid) {
    throw new Error("cross exam type compare is not allowed");
  }
}

function intersectCount(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
}

function normalizeCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^AB0-9]/g, "");
}

function isCodePrefixMatch(left, right) {
  const normalizedLeft = normalizeCode(left);
  const normalizedRight = normalizeCode(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(normalizedRight) ||
    normalizedRight.startsWith(normalizedLeft)
  );
}

function listMajorCodes(position) {
  const directCodes = Array.isArray(position && position.majorCodes)
    ? position.majorCodes.map(normalizeCode).filter(Boolean)
    : [];
  if (directCodes.length) {
    return Array.from(new Set(directCodes));
  }
  return extractMajorCodes(
    (position && (position.majorRaw || position.major)) || ""
  );
}

function intersectMajorCodeCount(left, right) {
  const rightCodes = Array.isArray(right) ? right : [];
  return (Array.isArray(left) ? left : []).filter((code, index, source) => (
    source.indexOf(code) === index &&
    rightCodes.some((candidateCode) => isCodePrefixMatch(code, candidateCode))
  )).length;
}

function scoreSimilarity(base, candidate) {
  if (base.examType !== candidate.examType || base.id === candidate.id) {
    return { score: -1, reasons: [] };
  }

  let score = 0;
  const reasons = [];

  const majorCodeOverlap = intersectMajorCodeCount(
    listMajorCodes(base),
    listMajorCodes(candidate)
  );
  const majorTagOverlap = intersectCount(base.majorTags || [], candidate.majorTags || []);
  if (majorCodeOverlap > 0) {
    score += 45 + majorCodeOverlap * 6;
    reasons.push("\u4e13\u4e1a\u91cd\u5408");
  } else if (majorTagOverlap > 0) {
    score += 40 + majorTagOverlap * 5;
    reasons.push("\u4e13\u4e1a\u91cd\u5408");
  }
  if (base.educationLevel === candidate.educationLevel) {
    score += 20;
    reasons.push("\u5b66\u5386\u4e00\u81f4");
  }
  if (base.degreeLevel === candidate.degreeLevel) {
    score += 15;
    reasons.push("\u5b66\u4f4d\u4e00\u81f4");
  }
  if (base.serviceRequirement === candidate.serviceRequirement) {
    score += 10;
    reasons.push("\u57fa\u5c42\u7ecf\u5386\u8981\u6c42\u4e00\u81f4");
  }
  if (base.freshGraduateOnly === candidate.freshGraduateOnly) {
    score += 10;
    reasons.push("\u5e94\u5c4a\u9650\u5236\u4e00\u81f4");
  }
  if (base.politicalStatus === candidate.politicalStatus) {
    score += 5;
    reasons.push("\u653f\u6cbb\u9762\u8c8c\u8981\u6c42\u4e00\u81f4");
  }
  if (base.area === candidate.area) {
    score += 5;
    reasons.push("\u5730\u533a\u4e00\u81f4");
  }
  if (base.positionType === candidate.positionType) {
    score += 5;
    reasons.push("\u804c\u4f4d\u7c7b\u578b\u4e00\u81f4");
  }
  if (String(base.notes || "") === String(candidate.notes || "")) {
    score += 3;
    reasons.push("\u5176\u4ed6\u8981\u6c42\u63a5\u8fd1");
  }

  return {
    score,
    reasons
  };
}

function recommendSimilarPositions(base, candidates, limit = 10) {
  return candidates
    .map((candidate) => ({
      position: candidate,
      ...scoreSimilarity(base, candidate)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => ({
      id: item.position.id,
      score: item.score,
      reasons: item.reasons,
      title: item.position.title,
      agency: item.position.agency
    }));
}

module.exports = {
  assertCompareGroup,
  assertComparePositions,
  scoreSimilarity,
  recommendSimilarPositions
};
