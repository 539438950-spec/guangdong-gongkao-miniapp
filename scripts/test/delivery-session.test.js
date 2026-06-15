const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSessionGuard,
  buildRestoreHints,
  buildSessionAudit,
  recordSessionResult,
  recordSessionCommit,
  finalizeSessionAudit,
  buildSessionAuditArtifacts,
  renderSessionPlan
} = require("../delivery-session-lib");

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
      }
    ]
  };
}

function createEntries() {
  return [
    {
      order: 1,
      slug: "01-verify-smoke",
      kind: "verify",
      title: "Verify smoke",
      commands: ["npm run mvp:smoke"],
      fileCount: 0,
      files: []
    },
    {
      order: 2,
      slug: "02-frontend-stage-commit",
      kind: "stage",
      title: "Frontend commit",
      groupId: "frontend",
      commands: ["git add -- a b"],
      fileCount: 2,
      files: ["a", "b"]
    },
    {
      order: 2,
      slug: "02-frontend-stage-commit",
      kind: "commit",
      title: "Frontend commit",
      groupId: "frontend",
      commands: ["git commit -m \"a\""],
      fileCount: 2,
      files: ["a", "b"]
    }
  ];
}

test("delivery session should block commit apply when index already has staged files", () => {
  const guard = buildSessionGuard(createEntries(), {
    summary: { readyForReview: true }
  }, {
    apply: true,
    force: false,
    initialStagedFiles: ["already-staged.js"]
  });

  assert.equal(guard.canApply, false);
  assert.ok(guard.reasons.some((item) => item.includes("clean index")));
});

test("delivery session should allow forced apply and support restore hints", () => {
  const guard = buildSessionGuard(createEntries(), {
    summary: { readyForReview: false }
  }, {
    apply: true,
    force: true,
    initialStagedFiles: ["already-staged.js"]
  });

  assert.equal(guard.canApply, true);

  const hints = buildRestoreHints("output/delivery-session", "2026-06-11T13-30-00-000Z");
  assert.ok(hints.latestAudit.endsWith("output/delivery-session/latest.json"));
  assert.ok(hints.stampedAudit.endsWith("2026-06-11T13-30-00-000Z.json"));
  assert.ok(hints.restoreBefore.includes("--target before"));
  assert.ok(hints.revertAppliedCommits.includes("delivery-revert.js"));
});

test("delivery session should build audit artifacts and render plan", () => {
  const manifest = createManifest();
  const entries = createEntries();
  const audit = buildSessionAudit({
    apply: false,
    force: false,
    manifest,
    selectedSteps: [manifest.steps[0], manifest.steps[1]],
    entries,
    guard: { canApply: true, reasons: [] },
    checkResult: { summary: { readyForReview: true } },
    workspacePreflight: {
      selectedFileCount: 2,
      selectedFiles: ["a", "b"],
      changedFileCount: 2,
      changedFiles: ["a", "notes.md"],
      stagedFileCount: 0,
      stagedFiles: [],
      selectedChangedCount: 1,
      selectedChangedFiles: ["a"],
      selectedStagedCount: 0,
      selectedStagedFiles: [],
      outsideSelectedChangedCount: 1,
      outsideSelectedChangedFiles: ["notes.md"],
      outsideSelectedStagedCount: 0,
      outsideSelectedStagedFiles: []
    },
    generatedAt: "2026-06-11T13:30:00.000Z",
    status: "dry-run",
    headState: {
      beforeHead: "aaa111",
      afterHead: "aaa111"
    },
    indexState: {
      beforeTree: "tree1",
      afterTree: "tree1",
      beforeStagedFiles: [],
      afterStagedFiles: []
    },
    restoreHints: buildRestoreHints("output/delivery-session", "2026-06-11T13-30-00-000Z")
  });

  recordSessionResult(audit, {
    slug: "01-verify-smoke",
    kind: "verify",
    status: "ok"
  });
  recordSessionCommit(audit, {
    slug: "02-frontend-stage-commit",
    commit: "bbb222",
    subject: "feat: session"
  });
  finalizeSessionAudit(audit, { status: "applied" });

  assert.equal(audit.auditId, "2026-06-11T13-30-00-000Z");
  assert.equal(audit.results.length, 1);
  assert.equal(audit.commits.length, 1);
  assert.equal(audit.status, "applied");
  assert.equal(audit.workspacePreflight.outsideSelectedChangedCount, 1);

  const artifacts = buildSessionAuditArtifacts(audit, {
    outputDir: "output/delivery-session",
    auditAlias: "02-frontend-stage-commit"
  });
  assert.equal(artifacts.length, 3);
  assert.ok(artifacts[0].path.endsWith("2026-06-11T13-30-00-000Z.json"));
  assert.ok(artifacts[1].path.endsWith("latest.json"));
  assert.ok(artifacts[2].path.endsWith("02-frontend-stage-commit.json"));

  const text = renderSessionPlan(manifest, entries, {
    apply: false,
    force: false,
    initialStagedFiles: [],
    workspacePreflight: audit.workspacePreflight
  });
  assert.ok(text.includes("Delivery session plan"));
  assert.ok(text.includes("commitSteps: 1"));
  assert.ok(text.includes("Workspace preflight"));
  assert.ok(text.includes("outsideSelectedChangedFiles: 1"));
  assert.ok(text.includes("Frontend commit [commit]"));
});
