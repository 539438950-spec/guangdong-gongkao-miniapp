const https = require("node:https");
const dns = require("node:dns");
const path = require("node:path");
const { TextDecoder } = require("node:util");
const { SourceAdapter } = require("../core/adapter-base");
const { downloadAttachment, analyzeAttachment } = require("../core/attachment-tools");
const { buildCompositeStructureMeta } = require("../core/source-structure");
const { buildBatchStateFromAttachment } = require("../core/position-workbook");
const {
  createNotice,
  createPositionBatch,
  buildNoticeDedupKey
} = require("../../../../packages/shared/src");

const NOTICE_TITLE_PATTERN = /广东省\d{4}年考试录用公务员公告/;
const ATTACHMENT_PATTERN = /\.(zip|rar|xlsx|xls|pdf|doc|docx)(\?.*)?$/i;
const REQUEST_TIMEOUT_MS = 12000;
const MAX_RETRIES = 3;
const GB18030_DECODER = new TextDecoder("gb18030");

function decodeHtml(input) {
  return String(input || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&ensp;|&emsp;/gi, " ")
    .replace(/&gt;/gi, ">")
    .replace(/&lt;/gi, "<")
    .replace(/&amp;/gi, "&")
    .replace(/&#12288;/g, " ")
    .replace(/&#x3000;/gi, " ");
}

function stripTags(input) {
  return decodeHtml(String(input || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absolutize(baseUrl, href) {
  if (!href) {
    return "";
  }
  return new URL(href, baseUrl).toString();
}

function dedupeAttachments(attachments) {
  const seen = new Set();
  return attachments.filter((item) => {
    if (!item.url || seen.has(item.url)) {
      return false;
    }
    seen.add(item.url);
    return true;
  });
}

function decodePageBuffer(buffer) {
  const utf8Text = buffer.toString("utf8");
  if (
    utf8Text.includes("广东省") ||
    utf8Text.includes("公务员") ||
    utf8Text.includes("发布时间") ||
    /charset="?utf-?8/i.test(utf8Text)
  ) {
    return utf8Text;
  }

  const gbText = GB18030_DECODER.decode(buffer);
  if (gbText.includes("广东省") || gbText.includes("公务员") || gbText.includes("发布时间")) {
    return gbText;
  }

  return gbText || utf8Text;
}

function requestText(url, attempt = 1) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        family: 4,
        lookup(hostname, options, callback) {
          return dns.lookup(hostname, { ...options, family: 4 }, callback);
        },
        headers: {
          "user-agent": "Mozilla/5.0 Codex Miniapp Ingest/0.1"
        }
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          response.resume();
          reject(new Error(`request failed: ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => {
          chunks.push(chunk);
        });
        response.on("end", () => {
          resolve(decodePageBuffer(Buffer.concat(chunks)));
        });
      }
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("request timeout"));
    });

    request.on("error", (error) => {
      if (attempt < MAX_RETRIES) {
        resolve(requestText(url, attempt + 1));
        return;
      }
      reject(error);
    });
  });
}

function extractLatestNoticeLink(indexHtml, baseUrl) {
  const matches = [...indexHtml.matchAll(/href="([^"]*post_[^"]+\.html)"[^>]*>(.*?)<\/a>/gi)];
  const links = matches
    .map((match) => ({
      url: absolutize(baseUrl, match[1]),
      title: stripTags(match[2])
    }))
    .filter((item) => NOTICE_TITLE_PATTERN.test(item.title));

  return links[0] || null;
}

function extractPublishedAt(detailHtml) {
  const match = detailHtml.match(/发布时间[：:\s]*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
  return match ? `${match[1]}T00:00:00.000Z` : null;
}

function extractArticleText(detailHtml) {
  const primary =
    detailHtml.match(/<div id="fontzoom"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ||
    detailHtml.match(/<div class="conTxt"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);

  return stripTags(primary ? primary[1] : detailHtml);
}

function extractSummary(articleText) {
  return articleText.slice(0, 160);
}

function extractAttachments(detailHtml, detailUrl) {
  const matches = [...detailHtml.matchAll(/href="([^"]+)"[^>]*>(.*?)<\/a>/gi)];
  return dedupeAttachments(
    matches
      .map((match) => ({
        url: absolutize(detailUrl, match[1]),
        name: stripTags(match[2]) || match[1].split("/").pop()
      }))
      .filter((item) => ATTACHMENT_PATTERN.test(item.url))
  );
}

function normalizeTimePunctuation(value) {
  return String(value || "")
    .replace(/[︰：]/g, ":")
    .replace(/\s+/g, "");
}

function extractRegistrationPeriod(articleText) {
  const normalized = normalizeTimePunctuation(articleText);
  const match = normalized.match(
    /报名时间[\s\S]{0,80}?([0-9]{4})年([0-9]{1,2})月([0-9]{1,2})日([0-9]{1,2}:[0-9]{2})至(?:(?:([0-9]{4})年)?(?:([0-9]{1,2})月)?)?([0-9]{1,2})日([0-9]{1,2}:[0-9]{2})/
  );

  if (!match) {
    return {
      registrationStart: null,
      registrationEnd: null
    };
  }

  const startYear = match[1];
  const startMonth = match[2];
  const startDay = match[3];
  const startTime = match[4];
  const endYear = match[5] || startYear;
  const endMonth = match[6] || startMonth;
  const endDay = match[7];
  const endTime = match[8];

  return {
    registrationStart: `${startYear}年${startMonth}月${startDay}日${startTime}`,
    registrationEnd: `${endYear}年${endMonth}月${endDay}日${endTime}`
  };
}

function extractRegistrationWindow(articleText) {
  const period = extractRegistrationPeriod(articleText);
  if (!period.registrationStart || !period.registrationEnd) {
    return null;
  }
  return `${period.registrationStart}至${period.registrationEnd}`;
}

function extractWrittenExamAt(articleText) {
  const normalized = normalizeTimePunctuation(articleText);
  const match = normalized.match(
    /笔试时间[\s\S]{0,40}?([0-9]{4}年[0-9]{1,2}月[0-9]{1,2}日)/
  );
  return match ? match[1] : null;
}

class RsksGwyAdapter extends SourceAdapter {
  async fetch() {
    for (const indexUrl of this.source.indexUrls || []) {
      try {
        const indexHtml = await requestText(indexUrl);
        const latestLink = extractLatestNoticeLink(indexHtml, indexUrl);

        if (!latestLink) {
          continue;
        }

        const detailHtml = await requestText(latestLink.url);

        return {
          fetchedAt: new Date().toISOString(),
          responseDigest: `${indexUrl}#${latestLink.url}`,
          indexUrl,
          latestLink,
          detailHtml,
          sourceStructure: buildCompositeStructureMeta([
            { label: "index", html: indexHtml },
            { label: "detail", html: detailHtml }
          ])
        };
      } catch (_error) {
        continue;
      }
    }

    throw new Error("no rsks announcement link found");
  }

  async parse(payload) {
    const articleText = extractArticleText(payload.detailHtml);
    const publishedAt = extractPublishedAt(payload.detailHtml);
    const attachments = extractAttachments(payload.detailHtml, payload.latestLink.url);
    const registrationPeriod = extractRegistrationPeriod(articleText);
    const writtenExamAt = extractWrittenExamAt(articleText);
    let attachmentAnalysis = null;

    const notice = createNotice({
      id: buildNoticeDedupKey({
        sourceId: this.source.id,
        title: payload.latestLink.title,
        url: payload.latestLink.url,
        publishedAt
      }),
      sourceId: this.source.id,
      examType: this.source.examType,
      area: "广东",
      title: payload.latestLink.title,
      url: payload.latestLink.url,
      publishedAt,
      registrationStart: registrationPeriod.registrationStart,
      registrationEnd: registrationPeriod.registrationEnd,
      writtenExamAt,
      summary: extractSummary(articleText),
      attachments,
      contentHash: payload.responseDigest
    });

    if (attachments[0]) {
      try {
        const artifactsRoot = path.resolve(__dirname, "../../var/artifacts");
        const downloaded = await downloadAttachment({
          url: attachments[0].url,
          noticeId: notice.id,
          referer: payload.latestLink.url,
          artifactsRoot
        });
        attachmentAnalysis = analyzeAttachment(downloaded.path);
      } catch (error) {
        attachmentAnalysis = {
          error: error.message,
          candidate_files: [],
          extracted_files: []
        };
      }
    }

    let batch = createPositionBatch({
      id: `${notice.id}:batch:1`,
      noticeId: notice.id,
      sourceId: this.source.id,
      attachmentUrl: attachments[0] ? attachments[0].url : payload.latestLink.url,
      version: 1,
      parseStatus: "attachment-only",
      parseLog: [
        `resolved index: ${payload.indexUrl}`,
        `resolved detail: ${payload.latestLink.url}`,
        `attachments: ${attachments.length}`,
        attachmentAnalysis && attachmentAnalysis.candidate_files
          ? `candidate files: ${attachmentAnalysis.candidate_files.length}`
          : "candidate files: 0",
        attachmentAnalysis && attachmentAnalysis.extracted_files
          ? `extracted files: ${attachmentAnalysis.extracted_files.length}`
          : "extracted files: 0",
        attachmentAnalysis && attachmentAnalysis.error
          ? `attachment analysis error: ${attachmentAnalysis.error}`
          : "attachment analysis: ok"
      ],
      rowsTotal: 0
    });
    batch.attachmentAnalysis = attachmentAnalysis;

    const parsedState = buildBatchStateFromAttachment({
      source: this.source,
      notice,
      batch,
      attachmentAnalysis
    });
    batch = {
      ...parsedState.batch,
      attachmentAnalysis
    };

    return {
      notice,
      batch,
      positions: parsedState.positions
    };
  }
}

module.exports = {
  RsksGwyAdapter,
  extractLatestNoticeLink,
  extractPublishedAt,
  extractArticleText,
  extractAttachments,
  extractRegistrationPeriod,
  extractRegistrationWindow,
  extractWrittenExamAt
};
