const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseStepTokens,
  findManifestStep,
  selectManifestSteps,
  buildExecutionEntries,
  parseGitStatusShort,
  buildWorkspacePreflight,
  buildApplyGuard,
  buildCommitOnlyPreflight,
  parseGitNameOnly,
  verifyStageTransition,
  buildExecutionAudit,
  recordAuditResult,
  finalizeExecutionAudit,
  buildAuditArtifacts,
  renderExecutionPlan
} = require("../delivery-execute-lib");

function createManifest() {
  return {
    smokeStatus: "required",
    baselineDecision: { include: true, reason: "ok" },
    steps: [
      {
        order: 1,
        id: "verify-smoke",
        slug: "01-verify-smoke",
        title: "Verify smoke",
        required: true,
        groupId: "",
        commands: ["npm run mvp:smoke"],
        fileCount: 0,
        files: []
      },
      {
        order: 2,
        id: "frontend-stage-commit",
        slug: "02-frontend-stage-commit",
        title: "Frontend commit",
        required: true,
        groupId: "frontend",
        commands: ["git add -- a", "git commit -m \"a\""],
        fileCount: 2,
        files: ["a", "b"]
      },
      {
        order: 3,
        id: "baseline-stage-commit",
        slug: "03-baseline-stage-commit",
        title: "Baseline commit",
        required: false,
        groupId: "baseline",
        commands: ["git add -- c", "git commit -m \"c\""],
        fileCount: 1,
        files: ["c"]
      }
    ]
  };
}

test("delivery execute should parse step tokens and find steps by id slug group or order", () => {
  const manifest = createManifest();

  assert.deepEqual(parseStepTokens("frontend, 02-frontend-stage-commit ,3"), [
    "frontend",
    "02-frontend-stage-commit",
    "3"
  ]);
  assert.equal(findManifestStep(manifest, "frontend").slug, "02-frontend-stage-commit");
  assert.equal(findManifestStep(manifest, "verify-smoke").order, 1);
  assert.equal(findManifestStep(manifest, "2").groupId, "frontend");
});

test("delivery execute should select required steps by token or all-required", () => {
  const manifest = createManifest();

  const selectedByToken = selectManifestSteps(manifest, { step: "frontend,baseline" });
  assert.deepEqual(selectedByToken.map((step) => step.slug), ["02-frontend-stage-commit"]);

  const selectedWithReview = selectManifestSteps(manifest, { step: "baseline", includeReview: true });
  assert.deepEqual(selectedWithReview.map((step) => step.slug), ["03-baseline-stage-commit"]);

  const allRequired = selectManifestSteps(manifest, { allRequired: true });
  assert.deepEqual(allRequired.map((step) => step.slug), ["01-verify-smoke", "02-frontend-stage-commit"]);
});

test("delivery execute should split grouped steps into stage and commit entries", () => {
  const manifest = createManifest();
  const steps = selectManifestSteps(manifest, { allRequired: true });

  const entries = buildExecutionEntries(steps, { mode: "all" });
  assert.deepEqual(entries.map((entry) => `${entry.slug}:${entry.kind}`), [
    "01-verify-smoke:verify",
    "02-frontend-stage-commit:stage",
    "02-frontend-stage-commit:commit"
  ]);

  const stageOnly = buildExecutionEntries(steps, { mode: "stage" });
  assert.deepEqual(stageOnly.map((entry) => entry.kind), ["verify", "stage"]);
});

test("delivery execute should render readable execution plan", () => {
  const manifest = createManifest();
  const steps = selectManifestSteps(manifest, { allRequired: true });
  const entries = buildExecutionEntries(steps, { mode: "all" });
  const workspacePreflight = buildWorkspacePreflight(entries, {
    changedFiles: ["a", "notes.md"],
    stagedFiles: ["a"]
  });
  const text = renderExecutionPlan(manifest, entries, {
    apply: false,
    mode: "all",
    workspacePreflight
  });

  assert.ok(text.includes("Delivery execute plan"));
  assert.ok(text.includes("apply: false"));
  assert.ok(text.includes("force: false"));
  assert.ok(text.includes("Workspace preflight"));
  assert.ok(text.includes("outsideSelectedChangedFiles: 1"));
  assert.ok(text.includes("Frontend commit [stage]"));
  assert.ok(text.includes("git commit -m"));
});

test("delivery execute should parse git status output and build workspace preflight", () => {
  const parsed = parseGitStatusShort(" M a.js\r\n?? notes.md\r\nR  old.js -> renamed.js\r\n");
  assert.deepEqual(parsed, [
    { status: " M", file: "a.js" },
    { status: "??", file: "notes.md" },
    { status: "R ", file: "renamed.js" }
  ]);

  const manifest = createManifest();
  const steps = selectManifestSteps(manifest, { step: "frontend" });
  const entries = buildExecutionEntries(steps, { mode: "all" });
  const preflight = buildWorkspacePreflight(entries, {
    changedFiles: ["a", "notes.md"],
    stagedFiles: ["b", "notes.md"]
  });

  assert.equal(preflight.selectedFileCount, 2);
  assert.equal(preflight.selectedChangedCount, 1);
  assert.equal(preflight.selectedStagedCount, 1);
  assert.deepEqual(preflight.outsideSelectedChangedFiles, ["notes.md"]);
  assert.deepEqual(preflight.outsideSelectedStagedFiles, ["notes.md"]);
});

test("delivery execute should block mutating apply when delivery check is not ready", () => {
  const manifest = createManifest();
  const steps = selectManifestSteps(manifest, { step: "frontend" });
  const entries = buildExecutionEntries(steps, { mode: "all" });

  const blocked = buildApplyGuard(entries, {
    summary: { readyForReview: false }
  }, {
    apply: true,
    force: false
  });
  assert.equal(blocked.canApply, false);
  assert.ok(blocked.reasons.some((item) => item.includes("readyForReview")));

  const forced = buildApplyGuard(entries, {
    summary: { readyForReview: false }
  }, {
    apply: true,
    force: true
  });
  assert.equal(forced.canApply, true);
});

test("delivery execute should guard commit-only apply against missing or unrelated staged files", () => {
  const manifest = createManifest();
  const steps = selectManifestSteps(manifest, { step: "frontend" });
  const entries = buildExecutionEntries(steps, { mode: "commit" });

  const blocked = buildCommitOnlyPreflight(entries, ["a", "extra.js"], {
    apply: true,
    force: false,
    mode: "commit"
  });
  assert.equal(blocked.enabled, true);
  assert.equal(blocked.canApply, false);
  assert.deepEqual(blocked.missingFiles, ["b"]);
  assert.deepEqual(blocked.unexpectedFiles, ["extra.js"]);

  const forced = buildCommitOnlyPreflight(entries, ["a", "extra.js"], {
    apply: true,
    force: true,
    mode: "commit"
  });
  assert.equal(forced.canApply, true);
});

test("delivery execute should parse staged file output and verify stage transitions", () => {
  assert.deepEqual(parseGitNameOnly("a.js\r\nb.js\r\n"), ["a.js", "b.js"]);

  const verification = verifyStageTransition(
    ["already-staged.js"],
    ["already-staged.js", "a.js", "b.js"],
    ["a.js", "b.js"]
  );
  assert.equal(verification.ok, true);

  const failed = verifyStageTransition(
    [],
    ["a.js", "extra.js"],
    ["a.js", "b.js"]
  );
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.missing, ["b.js"]);
  assert.deepEqual(failed.unexpectedIntroduced, ["extra.js"]);
});

test("delivery execute should build and export execution audit artifacts", () => {
  const manifest = createManifest();
  const steps = selectManifestSteps(manifest, { step: "frontend" });
  const entries = buildExecutionEntries(steps, { mode: "stage" });
  const audit = buildExecutionAudit({
    apply: false,
    force: false,
    mode: "stage",
    manifest,
    selectedSteps: steps,
    entries,
    guard: { canApply: true },
    checkResult: null,
    workspacePreflight: {
      selectedFileCount: 2,
      selectedFiles: ["a", "b"],
      changedFileCount: 2,
      changedFiles: ["a", "notes.md"],
      stagedFileCount: 1,
      stagedFiles: ["a"],
      selectedChangedCount: 1,
      selectedChangedFiles: ["a"],
      selectedStagedCount: 1,
      selectedStagedFiles: ["a"],
      outsideSelectedChangedCount: 1,
      outsideSelectedChangedFiles: ["notes.md"],
      outsideSelectedStagedCount: 0,
      outsideSelectedStagedFiles: []
    },
    generatedAt: "2026-06-11T12:00:00.000Z",
    status: "dry-run",
    indexState: {
      beforeTree: "aaa111",
      afterTree: "bbb222",
      beforeStagedFiles: ["a"],
      afterStagedFiles: ["a", "b"]
    }
  });

  recordAuditResult(audit, {
    slug: "02-frontend-stage-commit",
    kind: "stage",
    status: "ok"
  });
  finalizeExecutionAudit(audit, { status: "applied" });

  assert.equal(audit.auditId, "2026-06-11T12-00-00-000Z");
  assert.equal(audit.results.length, 1);
  assert.equal(audit.status, "applied");
  assert.equal(audit.workspacePreflight.outsideSelectedChangedCount, 1);
  assert.equal(audit.indexState.beforeTree, "aaa111");

  const artifacts = buildAuditArtifacts(audit, { outputDir: "output/delivery-execute" });
  assert.equal(artifacts.length, 2);
  assert.ok(artifacts[0].path.endsWith("2026-06-11T12-00-00-000Z.json"));
  assert.ok(artifacts[1].path.endsWith("latest.json"));
});
