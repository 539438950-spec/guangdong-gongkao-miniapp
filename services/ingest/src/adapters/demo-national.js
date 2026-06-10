const {
  createNotice,
  createPositionBatch,
  createPosition,
  buildNoticeDedupKey,
  toEducationLevel,
  toDegreeLevel,
  normalizeServiceRequirement,
  normalizeMajorTags,
  extractMajorCodes
} = require("../../../../packages/shared/src");
const { SourceAdapter } = require("../core/adapter-base");

class DemoNationalAdapter extends SourceAdapter {
  async fetch() {
    return {
      fetchedAt: new Date().toISOString(),
      responseDigest: "demo-national-digest",
      notice: {
        title: "2026年度国家公务员考试公告",
        url: "https://bm.scs.gov.cn/demo/2026-national",
        publishedAt: "2026-10-14T00:00:00.000Z",
        registrationStart: "2026年10月15日08:00至10月24日18:00",
        writtenExamAt: "2026年11月29日",
        summary: "面向国考考生的公告演示数据。",
        attachments: [
          {
            name: "职位表.xlsx",
            url: "https://bm.scs.gov.cn/demo/2026-national-positions.xlsx"
          }
        ]
      },
      positions: [
        {
          agency: "海关总署广东分署",
          title: "综合业务一级主任科员以下",
          positionCode: "130110001",
          positionType: "综合管理类",
          headcount: 2,
          educationRaw: "本科以上",
          degreeRaw: "学士以上",
          majorRaw: "法学类、经济学类",
          serviceRequirement: "不限",
          freshGraduateOnly: false,
          politicalStatus: "不限",
          notes: "需通过体能测评",
          examArea: "广州"
        },
        {
          agency: "广州海关",
          title: "财务管理一级主任科员以下",
          positionCode: "130110002",
          positionType: "综合管理类",
          headcount: 1,
          educationRaw: "研究生",
          degreeRaw: "硕士",
          majorRaw: "财政学类、会计学类",
          serviceRequirement: "应届",
          freshGraduateOnly: true,
          politicalStatus: "不限",
          notes: "限2026届毕业生",
          examArea: "广州"
        }
      ]
    };
  }

  async parse(payload) {
    const notice = createNotice({
      id: buildNoticeDedupKey({
        sourceId: this.source.id,
        title: payload.notice.title,
        url: payload.notice.url,
        publishedAt: payload.notice.publishedAt
      }),
      sourceId: this.source.id,
      examType: this.source.examType,
      area: "全国/广东岗位",
      title: payload.notice.title,
      url: payload.notice.url,
      publishedAt: payload.notice.publishedAt,
      registrationStart: payload.notice.registrationStart,
      writtenExamAt: payload.notice.writtenExamAt,
      summary: payload.notice.summary,
      attachments: payload.notice.attachments,
      contentHash: payload.responseDigest
    });

    const batch = createPositionBatch({
      id: `${notice.id}:batch:1`,
      noticeId: notice.id,
      sourceId: this.source.id,
      attachmentUrl: payload.notice.attachments[0].url,
      version: 1,
      parseStatus: "parsed",
      parseLog: ["loaded demo attachment", "mapped 2 rows"],
      rowsTotal: payload.positions.length
    });

    const positions = payload.positions.map((item, index) =>
      createPosition({
        id: `${batch.id}:row:${index + 1}`,
        noticeId: notice.id,
        batchId: batch.id,
        examType: this.source.examType,
        area: item.examArea,
        agency: item.agency,
        title: item.title,
        positionCode: item.positionCode,
        positionType: item.positionType,
        headcount: item.headcount,
        educationRaw: item.educationRaw,
        educationLevel: toEducationLevel(item.educationRaw),
        degreeRaw: item.degreeRaw,
        degreeLevel: toDegreeLevel(item.degreeRaw),
        majorRaw: item.majorRaw,
        majorTags: normalizeMajorTags(item.majorRaw),
        majorCodes: extractMajorCodes(item.majorRaw),
        serviceRequirement: normalizeServiceRequirement(item.serviceRequirement),
        freshGraduateOnly: item.freshGraduateOnly,
        politicalStatus: item.politicalStatus,
        notes: item.notes,
        examArea: item.examArea,
        publishedAt: notice.publishedAt,
        sourceNoticeTitle: notice.title,
        sourceUrl: notice.url,
        normalizedReady: true
      })
    );

    return {
      notice,
      batch,
      positions
    };
  }
}

module.exports = {
  DemoNationalAdapter
};
