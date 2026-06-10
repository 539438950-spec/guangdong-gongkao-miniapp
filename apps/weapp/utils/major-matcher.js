const MAJOR_GROUPS = [
  {
    key: "法学",
    codes: ["A03", "A0301", "B03", "B0301", "B030101"],
    aliases: [
      "法学",
      "法学类",
      "法律",
      "法律（法学）",
      "法律（非法学）",
      "法学理论",
      "法律史",
      "宪法学与行政法学",
      "刑法学",
      "民商法学",
      "诉讼法学",
      "经济法学",
      "国际法学",
      "知识产权"
    ]
  },
  {
    key: "新闻传播",
    codes: ["A05", "A0503", "A050301", "A050302", "A050303", "B05", "B0503", "B050301"],
    aliases: [
      "新闻传播",
      "新闻传播学",
      "新闻传播学类",
      "新闻学",
      "传播学",
      "广告学",
      "网络与新媒体"
    ]
  },
  {
    key: "公共管理",
    codes: ["A12", "A1204", "A120401", "A120402", "A120403", "A120404", "A120405", "B12", "B1204", "B120402"],
    aliases: [
      "公共管理",
      "公共管理类",
      "行政管理",
      "公共事业管理",
      "社会保障",
      "土地资源管理",
      "教育经济与管理",
      "社会医学与卫生事业管理"
    ]
  },
  {
    key: "经济学",
    codes: ["A02", "A0201", "A0202", "B02", "B0201"],
    aliases: [
      "经济学",
      "经济学类",
      "理论经济学",
      "应用经济学",
      "财政学",
      "金融学",
      "国际经济与贸易",
      "经济金融类"
    ]
  },
  {
    key: "会计",
    codes: ["A120201", "A120206", "A020218", "B120203", "B120204", "B120207"],
    aliases: [
      "会计",
      "会计学",
      "会计硕士",
      "财务管理",
      "审计学",
      "审计硕士",
      "财政学类",
      "财会审计类"
    ]
  },
  {
    key: "计算机",
    codes: ["A08", "A0812", "B08", "B0809", "B080901", "B080902", "B080903", "B080904", "B080910", "B080914"],
    aliases: [
      "计算机",
      "计算机类",
      "计算机科学与技术",
      "软件工程",
      "网络工程",
      "信息安全",
      "数据科学与大数据技术",
      "人工智能",
      "物联网工程",
      "电子与计算机工程"
    ]
  },
  {
    key: "食品科学",
    codes: ["A0832", "B0827", "B082701", "B082702"],
    aliases: [
      "食品科学",
      "食品科学与工程",
      "食品科学与工程类",
      "食品质量与安全"
    ]
  }
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[：:]/g, ":")
    .replace(/[；;]/g, ";")
    .replace(/[，、]/g, ",");
}

function splitKeywords(value) {
  return String(value || "")
    .split(/[，,、；;（）()：:\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^AB0-9]/g, "");
}

function isMajorCode(value) {
  return /^[AB]\d{2,6}$/i.test(String(value || "").trim());
}

function extractMajorCodes(text) {
  return Array.from(
    new Set(
      (String(text || "").match(/[AB]\d{2,6}/gi) || []).map(normalizeCode).filter(Boolean)
    )
  );
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

function findMajorGroup(keyword) {
  const normalizedKeyword = normalizeText(keyword);
  const normalizedCode = normalizeCode(keyword);
  if (!normalizedKeyword && !normalizedCode) {
    return null;
  }

  return MAJOR_GROUPS.find((group) => (
    (group.aliases || []).some((alias) => {
      const normalizedAlias = normalizeText(alias);
      return (
        normalizedAlias.includes(normalizedKeyword) ||
        normalizedKeyword.includes(normalizedAlias)
      );
    }) ||
    (group.codes || []).some((code) => isCodePrefixMatch(code, normalizedCode))
  )) || null;
}

function expandKeyword(keyword) {
  const normalizedKeyword = normalizeText(keyword);
  const normalizedCode = normalizeCode(keyword);
  if (!normalizedKeyword && !normalizedCode) {
    return {
      textVariants: [],
      codeVariants: []
    };
  }

  const matchedGroup = findMajorGroup(keyword);

  if (!matchedGroup) {
    return {
      textVariants: normalizedKeyword ? [normalizedKeyword] : [],
      codeVariants: normalizedCode ? [normalizedCode] : []
    };
  }

  return {
    textVariants: Array.from(
      new Set((matchedGroup.aliases || []).map((alias) => normalizeText(alias)).concat(normalizedKeyword ? [normalizedKeyword] : []))
    ),
    codeVariants: Array.from(
      new Set((matchedGroup.codes || []).map((code) => normalizeCode(code)).concat(normalizedCode ? [normalizedCode] : []))
    )
  };
}

function normalizeRequirementInput(input) {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return {
      majorRequirement: String(
        input.majorRequirement !== undefined
          ? input.majorRequirement
          : input.major !== undefined
            ? input.major
            : ""
      ),
      majorCodes: Array.isArray(input.majorCodes)
        ? Array.from(new Set(input.majorCodes.map(normalizeCode).filter(Boolean)))
        : []
    };
  }

  return {
    majorRequirement: String(input || ""),
    majorCodes: []
  };
}

function buildTextMatchReason(keyword) {
  return `\u4e13\u4e1a\u540d\u79f0\u547d\u4e2d\uff1a${keyword}`;
}

function buildCodeMatchReason(requirementCode, keywordCode) {
  const normalizedRequirementCode = normalizeCode(requirementCode);
  const normalizedKeywordCode = normalizeCode(keywordCode);
  if (normalizedRequirementCode === normalizedKeywordCode) {
    return `\u4e13\u4e1a\u4ee3\u7801\u4e00\u81f4\uff1a${normalizedRequirementCode}`;
  }
  return `\u4e13\u4e1a\u4ee3\u7801\u524d\u7f00\u547d\u4e2d\uff1a${normalizedRequirementCode}`;
}

function explainMajorMatch(requirementInput, keywordInput) {
  const { majorRequirement, majorCodes } = normalizeRequirementInput(requirementInput);
  const normalizedRequirement = normalizeText(majorRequirement);
  const requirementCodes = majorCodes.length ? majorCodes : extractMajorCodes(majorRequirement);
  const keywords = splitKeywords(keywordInput);

  if (!keywords.length) {
    return {
      matched: true,
      reasons: [],
      summary: ""
    };
  }
  if (!normalizedRequirement && !requirementCodes.length) {
    return {
      matched: false,
      reasons: [],
      summary: ""
    };
  }

  const reasons = [];

  const matched = keywords.some((keyword) => {
    const expanded = expandKeyword(keyword);
    const textMatched = expanded.textVariants.some((variant) => variant && normalizedRequirement.includes(variant));
    if (textMatched) {
      reasons.push(buildTextMatchReason(keyword));
      return true;
    }

    const matchedCode = expanded.codeVariants
      .map((code) => ({
        code,
        requirementCode: requirementCodes.find((requirementCode) => isCodePrefixMatch(requirementCode, code))
      }))
      .find((item) => item.requirementCode);

    if (matchedCode) {
      reasons.push(buildCodeMatchReason(matchedCode.requirementCode, matchedCode.code));
      return true;
    }

    return false;
  });

  return {
    matched,
    reasons,
    summary: matched ? reasons.slice(0, 2).join(" · ") : ""
  };
}

function matchMajorKeywords(requirementInput, keywordInput) {
  return explainMajorMatch(requirementInput, keywordInput).matched;
}

module.exports = {
  MAJOR_GROUPS,
  splitKeywords,
  extractMajorCodes,
  explainMajorMatch,
  matchMajorKeywords
};
