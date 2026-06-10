const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { analyzeAttachment } = require("../src/core/attachment-tools");

test("analyzeAttachment should identify candidate workbook files inside zip", () => {
  const rootDir = path.resolve(process.cwd(), ".tmp", `attachment-tools-${Date.now()}`);
  fs.mkdirSync(rootDir, { recursive: true });
  const archivePath = path.join(rootDir, "attachment.zip");

  const python = `
import zipfile
with zipfile.ZipFile(r"${archivePath.replace(/\\/g, "\\\\")}", "w") as zf:
    zf.writestr("附件1/广东省2025年考试录用公务员职位表.xlsx", "fake-xlsx")
    zf.writestr("说明.txt", "readme")
`;
  const create = spawnSync("python", ["-c", python], { encoding: "utf8" });
  assert.equal(create.status, 0, create.stderr);

  const result = analyzeAttachment(archivePath);

  assert.equal(result.kind, "zip");
  assert.ok(result.candidate_files.some((item) => item.name.endsWith(".xlsx")));
  assert.ok(result.candidate_files.some((item) => item.score > 0));
  assert.ok(result.extracted_files.some((item) => item.path.endsWith(".xlsx")));
});

test("analyzeAttachment should repair mojibake zip entry names before scoring candidates", () => {
  const rootDir = path.resolve(process.cwd(), ".tmp", `attachment-tools-mojibake-${Date.now()}`);
  fs.mkdirSync(rootDir, { recursive: true });
  const archivePath = path.join(rootDir, "attachment-mojibake.zip");

  const python = `
import zipfile
name = "附件1-2/广东省2026年考试录用公务员职位表.xlsx"
mojibake = name.encode("gbk").decode("cp437")
with zipfile.ZipFile(r"${archivePath.replace(/\\/g, "\\\\")}", "w") as zf:
    zf.writestr(mojibake, "fake-xlsx")
`;
  const create = spawnSync("python", ["-c", python], { encoding: "utf8" });
  assert.equal(create.status, 0, create.stderr);

  const result = analyzeAttachment(archivePath);

  assert.equal(result.kind, "zip");
  assert.ok(result.entries.some((item) => item.name.includes("广东省2026年考试录用公务员职位表.xlsx")));
  assert.ok(result.candidate_files.some((item) => item.name.includes("职位表.xlsx")));
  assert.ok(result.candidate_files.some((item) => item.score > 0));
  assert.ok(result.extracted_files.some((item) => item.name.includes("职位表.xlsx")));
});
