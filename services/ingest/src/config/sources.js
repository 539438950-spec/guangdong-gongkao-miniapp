const { EXAM_TYPES, createSource } = require("../../../../packages/shared/src");

function getSources() {
  return [
    createSource({
      id: "rsks-gd",
      name: "广东人事考试网",
      baseUrl: "https://rsks.gd.gov.cn/",
      examType: EXAM_TYPES.GUANGDONG_PROVINCIAL,
      scheduleMinutes: 30,
      publishSlaMinutes: 60,
      indexUrls: [
        "https://rsks.gd.gov.cn/wsbs/gwyks/2026/2026gdsk/index.html",
        "https://rsks.gd.gov.cn/wsbs/gwyks/2025/2025gdsk/index.html",
        "https://rsks.gd.gov.cn/wsbs/gwyks/2024/2024gdsk/index.html"
      ],
      metadata: {
        mode: "official",
        modeLabel: "官方"
      }
    }),
    createSource({
      id: "ggfw-hrss-gd",
      name: "广东省公务员考试录用管理系统",
      baseUrl: "https://ggfw.hrss.gd.gov.cn/",
      examType: EXAM_TYPES.GUANGDONG_PROVINCIAL,
      scheduleMinutes: 30,
      publishSlaMinutes: 60,
      indexUrls: [
        "https://ggfw.hrss.gd.gov.cn/gwyks/anouns.do"
      ],
      metadata: {
        mode: "official",
        modeLabel: "官方"
      }
    }),
    createSource({
      id: "national-bm",
      name: "国家公务员局专题",
      baseUrl: "https://bm.scs.gov.cn/",
      examType: EXAM_TYPES.NATIONAL,
      scheduleMinutes: 30,
      publishSlaMinutes: 60,
      metadata: {
        mode: "demo",
        modeLabel: "演示",
        modeNote: "当前环境无法直连国考官方站点，暂用演示数据占位。"
      }
    })
  ];
}

module.exports = {
  getSources
};
