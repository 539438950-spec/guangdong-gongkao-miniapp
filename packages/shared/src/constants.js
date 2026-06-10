const EXAM_TYPES = {
  GUANGDONG_PROVINCIAL: "guangdong-provincial",
  NATIONAL: "national"
};

const POSITION_COMPARE_LIMIT = 4;
const COMPARE_GROUP_LIMIT = 20;

const DEGREE_LEVELS = ["unknown", "associate", "bachelor", "master", "doctorate"];
const EDUCATION_LEVELS = ["unknown", "college", "undergraduate", "postgraduate"];
const POLITICAL_STATUSES = [
  "\u4e0d\u9650",
  "\u4e2d\u5171\u515a\u5458",
  "\u5171\u9752\u56e2\u5458",
  "\u6c11\u4e3b\u515a\u6d3e",
  "\u7fa4\u4f17"
];
const SERVICE_REQUIREMENTS = [
  "\u4e0d\u9650",
  "\u5e94\u5c4a",
  "2\u5e74\u4ee5\u4e0a\u57fa\u5c42\u5de5\u4f5c\u7ecf\u5386",
  "\u670d\u52a1\u57fa\u5c42\u9879\u76ee\u4eba\u5458"
];

module.exports = {
  EXAM_TYPES,
  POSITION_COMPARE_LIMIT,
  COMPARE_GROUP_LIMIT,
  DEGREE_LEVELS,
  EDUCATION_LEVELS,
  POLITICAL_STATUSES,
  SERVICE_REQUIREMENTS
};
