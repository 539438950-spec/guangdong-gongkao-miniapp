const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractNoticeLinks,
  selectPreferredNoticeLink,
  extractLatestNoticeLink,
  extractPublishedAt,
  extractArticleText,
  extractAttachments,
  extractRegistrationPeriod,
  extractWrittenExamAt
} = require("../src/adapters/ggfw-hrss-gwy");

test("extractNoticeLinks should collect ggfw notice candidates in order", () => {
  const html = `
    <ul>
      <li><a href="javascript:;" onclick="openLinkWindow('https://www.gdzz.gov.cn/tzgg/content/post_24510.html');">广东省2026年考试录用公务员资格审核和面试等事项公告</a><span>[2026-01-15]</span></li>
      <li><a href="javascript:;" onclick="openLinkWindow('https://www.gdzz.gov.cn/tzgg/content/post_24016.html');">广东省2026年考试录用公务员公告</a><span>[2025-10-19]</span></li>
    </ul>
  `;

  const links = extractNoticeLinks(html, "https://ggfw.hrss.gd.gov.cn/gwyks/anouns.do");

  assert.equal(links.length, 2);
  assert.equal(links[0].url, "https://www.gdzz.gov.cn/tzgg/content/post_24510.html");
  assert.equal(links[1].url, "https://www.gdzz.gov.cn/tzgg/content/post_24016.html");
});

test("selectPreferredNoticeLink should prefer main notice over later-stage tracking notice", () => {
  const links = [
    {
      url: "https://www.gdzz.gov.cn/tzgg/content/post_24510.html",
      title: "广东省2026年考试录用公务员资格审核和面试等事项公告",
      publishedDate: "2026-01-15"
    },
    {
      url: "https://www.gdzz.gov.cn/tzgg/content/post_24016.html",
      title: "广东省2026年考试录用公务员公告",
      publishedDate: "2025-10-19"
    }
  ];

  const link = selectPreferredNoticeLink(links);

  assert.equal(link.url, "https://www.gdzz.gov.cn/tzgg/content/post_24016.html");
  assert.equal(link.title, "广东省2026年考试录用公务员公告");
});

test("extractLatestNoticeLink should prefer main ggfw notice when a later-stage notice is newer", () => {
  const html = `
    <ul>
      <li><a href="javascript:;" onclick="openLinkWindow('https://www.gdzz.gov.cn/tzgg/content/post_24510.html');">广东省2026年考试录用公务员资格审核和面试等事项公告</a><span>[2026-01-15]</span></li>
      <li><a href="javascript:;" onclick="openLinkWindow('https://www.gdzz.gov.cn/tzgg/content/post_24016.html');">广东省2026年考试录用公务员公告</a><span>[2025-10-19]</span></li>
    </ul>
  `;

  const link = extractLatestNoticeLink(html, "https://ggfw.hrss.gd.gov.cn/gwyks/anouns.do");

  assert.equal(link.url, "https://www.gdzz.gov.cn/tzgg/content/post_24016.html");
  assert.equal(link.title, "广东省2026年考试录用公务员公告");
  assert.equal(link.publishedDate, "2025-10-19");
});

test("extractPublishedAt should prefer detail meta pub date", () => {
  const html = `
    <meta name="PubDate" content="2025-10-19 15:04">
    <span class="date">时间：2025-10-19 15:04:13</span>
  `;

  assert.equal(extractPublishedAt(html), "2025-10-19T15:04:00.000Z");
});

test("extractAttachments should collect official detail attachments", () => {
  const html = `
    <p><a href="/public/广东省2026年考试录用公务员公告附件.zip" target="_self">点击查看：附件1-5</a></p>
    <p><a href="/tzgg/content/post_24016.html">原文</a></p>
  `;

  const attachments = extractAttachments(
    html,
    "https://www.gdzz.gov.cn/tzgg/content/post_24016.html"
  );

  assert.equal(attachments.length, 1);
  assert.equal(
    attachments[0].url,
    "https://www.gdzz.gov.cn/public/%E5%B9%BF%E4%B8%9C%E7%9C%812026%E5%B9%B4%E8%80%83%E8%AF%95%E5%BD%95%E7%94%A8%E5%85%AC%E5%8A%A1%E5%91%98%E5%85%AC%E5%91%8A%E9%99%84%E4%BB%B6.zip"
  );
  assert.equal(attachments[0].name, "点击查看：附件1-5");
});

test("extractArticleText should preserve key content and parse time fields", () => {
  const html = `
    <div class="zw">
      <p><strong>四、报考程序</strong></p>
      <p>（一）报名时间</p>
      <p>2025年10月20日9︰00至24日16︰00。</p>
      <p>（一）笔试</p>
      <p>2．笔试时间</p>
      <p>2025年12月7日</p>
      <div class="fj"></div>
    </div>
    <div class="zwBottom"></div>
  `;

  const articleText = extractArticleText(html);
  const period = extractRegistrationPeriod(articleText);

  assert.match(articleText, /报名时间/);
  assert.equal(period.registrationStart, "2025年10月20日9:00");
  assert.equal(period.registrationEnd, "2025年10月24日16:00");
  assert.equal(extractWrittenExamAt(articleText), "2025年12月7日");
});
