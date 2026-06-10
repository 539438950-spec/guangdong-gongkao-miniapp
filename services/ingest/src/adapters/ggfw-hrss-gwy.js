const https = require("node:https");
const dns = require("node:dns");
const path = require("node:path");
const { SourceAdapter } = require("../core/adapter-base");
const { downloadAttachment, analyzeAttachment } = require("../core/attachment-tools");
const { buildCompositeStructureMeta } = require("../core/source-structure");
const { buildBatchStateFromAttachment } = require("../core/position-workbook");
const {
  createNotice,
  createPositionBatch,
  buildNoticeDedupKey,
  classifyNoticeStage,
  shouldExpectPositionWorkbookForNotice
} = require("../../../../packages/shared/src");

const REQUEST_TIMEOUT_MS = 12000;
const MAX_RETRIES = 3;
const ATTACHMENT_PATTERN = /\.(zip|rar|xlsx|xls|pdf|doc|docx)(\?.*)?$/i;

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
          resolve(Buffer.concat(chunks).toString("utf8"));
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

function extractNoticeLinks(indexHtml, baseUrl) {
  const pattern = /<li>\s*<a[^>]*onclick="openLinkWindow\('([^']+)'\);"[^>]*>([\s\S]*?)<\/a>\s*<span>\[([0-9]{4}-[0-9]{2}-[0-9]{2})\]<\/span>\s*<\/li>/gi;
  const matches = [...String(indexHtml || "").matchAll(pattern)];
  if (!matches.length) {
    return [];
  }

  return matches.map((match) => ({
    url: absolutize(baseUrl, match[1]),
    title: stripTags(match[2]),
    publishedDate: match[3]
  }));
}

function selectPreferredNoticeLink(links) {
  const items = Array.isArray(links) ? links : [];
  if (!items.length) {
    return null;
  }

  const preferred = items.find((item) => shouldExpectPositionWorkbookForNotice({
    title: item.title,
    noticeStageId: classifyNoticeStage({
      title: item.title
    }).id
  }));

  return preferred || items[0];
}

function extractLatestNoticeLink(indexHtml, baseUrl) {
  return selectPreferredNoticeLink(extractNoticeLinks(indexHtml, baseUrl));
}

function extractPublishedAt(detailHtml, fallbackDate = "") {
  const metaMatch = String(detailHtml || "").match(
    /<meta\s+name="PubDate"\s+content="([0-9]{4}-[0-9]{2}-[0-9]{2})(?:\s+([0-9]{2}:[0-9]{2})(?::[0-9]{2})?)?"/i
  );
  if (metaMatch) {
    const timePart = metaMatch[2] || "00:00";
    return `${metaMatch[1]}T${timePart}:00.000Z`;
  }

  const dateMatch = String(detailHtml || "").match(
    /<span class="date">[^0-9]*([0-9]{4}-[0-9]{2}-[0-9]{2})(?:\s+([0-9]{2}:[0-9]{2})(?::[0-9]{2})?)?<\/span>/i
  );
  if (dateMatch) {
    const timePart = dateMatch[2] || "00:00";
    return `${dateMatch[1]}T${timePart}:00.000Z`;
  }

  return fallbackDate ? `${fallbackDate}T00:00:00.000Z` : null;
}

function extractArticleHtml(detailHtml) {
  const match = String(detailHtml || "").match(
    /<div class="zw">([\s\S]*?)<div class="zwBottom">/i
  );
  return match ? match[1] : String(detailHtml || "");
}

function extractArticleText(detailHtml) {
  return stripTags(extractArticleHtml(detailHtml));
}

function extractSummary(articleText) {
  return String(articleText || "").slice(0, 160);
}

function extractAttachments(detailHtml, detailUrl) {
  const matches = [...String(detailHtml || "").matchAll(/href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  return dedupeAttachments(
    matches
      .map((match) => ({
        url: absolutize(detailUrl, match[1]),
        name: stripTags(match[2]) || match[1].split("/").pop()
      }))
      .filter((item) => ATTACHMENT_PATTERN.test(item.url))
  );
}

function normalizeTimeText(input) {
  return String(input || "")
    .replace(/[︰﹕：]/g, ":")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, "");
}

function extractRegistrationPeriod(articleText) {
  const normalized = normalizeTimeText(articleText);
  const match = normalized.match(
    /报名时间[\s\S]{0,80}?(\d{4})年(\d{1,2})月(\d{1,2})日(\d{1,2}:\d{2})至(?:(\d{4})年)?(?:(\d{1,2})月)?(\d{1,2})日(\d{1,2}:\d{2})/
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

function extractWrittenExamAt(articleText) {
  const normalized = normalizeTimeText(articleText);
  const match = normalized.match(/笔试时间[\s\S]{0,40}?(\d{4}年\d{1,2}月\d{1,2}日)/);
  return match ? match[1] : null;
}

class GgfwHrssGwyAdapter extends SourceAdapter {
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

    throw new Error("no ggfw announcement link found");
  }

  async parse(payload) {
    const articleText = extractArticleText(payload.detailHtml);
    const publishedAt = extractPublishedAt(payload.detailHtml, payload.latestLink.publishedDate);
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
  extractNoticeLinks,
  selectPreferredNoticeLink,
  GgfwHrssGwyAdapter,
  extractLatestNoticeLink,
  extractPublishedAt,
  extractArticleText,
  extractAttachments,
  extractRegistrationPeriod,
  extractWrittenExamAt
};
