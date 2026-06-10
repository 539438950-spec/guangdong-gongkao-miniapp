const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const dns = require("node:dns");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;

function sanitizeSegment(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .slice(0, 120);
}

function buildArtifactDirName(noticeId) {
  const hash = crypto.createHash("sha1").update(String(noticeId || "")).digest("hex").slice(0, 16);
  const ascii = String(noticeId || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return ascii ? `${ascii}_${hash}` : hash;
}

function requestBuffer(url, headers = {}, attempt = 1) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        family: 4,
        lookup(hostname, options, callback) {
          return dns.lookup(hostname, { ...options, family: 4 }, callback);
        },
        headers: {
          "user-agent": "Mozilla/5.0 Codex Miniapp Ingest/0.1",
          accept: "*/*",
          ...headers
        }
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          response.resume();
          reject(new Error(`download failed: ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
      }
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("download timeout"));
    });

    request.on("error", (error) => {
      if (attempt < MAX_RETRIES) {
        resolve(requestBuffer(url, headers, attempt + 1));
        return;
      }
      reject(error);
    });
  });
}

async function downloadAttachment({ url, noticeId, referer, artifactsRoot }) {
  const fileName = path.basename(new URL(url).pathname);
  const artifactDir = path.join(artifactsRoot, buildArtifactDirName(noticeId));
  fs.mkdirSync(artifactDir, { recursive: true });

  const targetPath = path.join(artifactDir, sanitizeSegment(fileName));
  const body = await requestBuffer(url, referer ? { referer } : {});
  fs.writeFileSync(targetPath, body);

  return {
    path: targetPath,
    size: body.length
  };
}

function analyzeAttachment(localPath) {
  const scriptPath = path.resolve(__dirname, "../..", "scripts", "analyze_attachment.py");
  const extractDir = path.join(path.dirname(localPath), "extracted");
  fs.mkdirSync(extractDir, { recursive: true });

  const result = spawnSync("python", [scriptPath, localPath, extractDir], {
    cwd: path.resolve(__dirname, "../../.."),
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "attachment analysis failed");
  }

  return JSON.parse(result.stdout);
}

module.exports = {
  downloadAttachment,
  analyzeAttachment,
  buildArtifactDirName
};
