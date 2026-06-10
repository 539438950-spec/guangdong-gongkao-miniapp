const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractLatestNoticeLink,
  extractPublishedAt,
  extractArticleText,
  extractAttachments,
  extractRegistrationPeriod,
  extractRegistrationWindow,
  extractWrittenExamAt
} = require("../src/adapters/rsks-gwy");

test("extractLatestNoticeLink should locate latest rsks announcement link", () => {
  const html = `
    <a href="/wsbs/gwyks/2024/2024gdsk/content/post_4332288.html">广东省2024年考试录用公务员公告</a>
    <a href="/other.html">其他链接</a>
  `;

  const link = extractLatestNoticeLink(
    html,
    "https://rsks.gd.gov.cn/wsbs/gwyks/2024/2024gdsk/index.html"
  );

  assert.equal(
    link.url,
    "https://rsks.gd.gov.cn/wsbs/gwyks/2024/2024gdsk/content/post_4332288.html"
  );
  assert.equal(link.title, "广东省2024年考试录用公务员公告");
});

test("extractPublishedAt should read rsks publish date", () => {
  const html = `<div class="property"><span>发布时间：2024-01-15</span></div>`;
  assert.equal(extractPublishedAt(html), "2024-01-15T00:00:00.000Z");
});

test("extractAttachments should collect attachment links", () => {
  const html = `
    <a href="https://rsks.gd.gov.cn/attachment/0/540/540764/4332288.zip">点击查看：附件1-5</a>
    <a href="https://example.com/readme.txt">文本说明</a>
  `;
  const attachments = extractAttachments(
    html,
    "https://rsks.gd.gov.cn/wsbs/gwyks/2024/2024gdsk/content/post_4332288.html"
  );

  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].name, "点击查看：附件1-5");
});

test("extractArticleText and time fields should parse core rsks content", () => {
  const html = `
    <div class="conTxt">
      <div id="fontzoom">
        <p>（一）报名时间</p>
        <p>2025年1月8日9︰00至14日16︰00。</p>
        <p>2.笔试时间</p>
        <p>2025年3月15日</p>
      </div>
    </div>
  `;

  const articleText = extractArticleText(html);
  const period = extractRegistrationPeriod(articleText);

  assert.match(articleText, /报名时间/);
  assert.equal(period.registrationStart, "2025年1月8日9:00");
  assert.equal(period.registrationEnd, "2025年1月14日16:00");
  assert.equal(
    extractRegistrationWindow(articleText),
    "2025年1月8日9:00至2025年1月14日16:00"
  );
  assert.equal(extractWrittenExamAt(articleText), "2025年3月15日");
});
