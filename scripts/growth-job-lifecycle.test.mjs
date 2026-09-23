import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { createCanvasWorkspaceStore, externalActionAuthority } from "../packages/growth-canvas/server/workspace-store.mjs";
import { materializeSyntheticReadyTenant } from "./growth-tenant-demo.mjs";
import { initializeGrowthTenant } from "./init-growth-tenant.mjs";
import { claimGrowthJob } from "./claim-growth-job.mjs";
import { completeGrowthJob } from "./complete-growth-job.mjs";
import { validateContractInstance } from "./growth-framework-validator.mjs";
import { serializeSyntheticConceptPackage } from "./growth-job-test-fixtures.mjs";
import { computeGrowthJobArtifactBindings, reviewGrowthJob } from "./review-growth-job.mjs";

const sourceRoot = process.cwd();
const claimTime = "2030-01-01T00:00:00.000Z";

const createReadyWorkspace = () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "growth-job-lifecycle-"));
  initializeGrowthTenant({ workspaceRoot: sourceRoot, tenantId: "example-ai", outputRoot: workspace });
  materializeSyntheticReadyTenant({ tenantRoot: workspace, tenantId: "example-ai" });
  return workspace;
};

const withWorkspace = (callback) => {
  const workspace = createReadyWorkspace();
  try {
    callback({ workspace, store: createCanvasWorkspaceStore({ workspace }) });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
};

const runProcess = (args) => new Promise((resolve) => {
  const child = spawn(process.execPath, args, { cwd: sourceRoot, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("close", (status) => resolve({ status, stdout, stderr }));
});

const createJob = (store, jobId) => store.createW2Job({
  jobId,
  title: `Internal content job ${jobId}`,
  campaignSummary: "Synthetic tenant-only lifecycle test.",
  managerTaskDescription: "Prepare an internal draft, run independent QA, and stop for owner review."
});

const claimJob = (workspace, jobId, attemptId = `${jobId}-attempt`) => claimGrowthJob({
  workspace,
  jobId,
  attemptId,
  leaseSeconds: 3600,
  now: new Date(claimTime)
});

const receiptFor = ({ jobId, attemptId, outcome = "completed_for_review", artifactReferences = [] }) => ({
  schemaVersion: "1.0.0",
  jobId,
  tenantId: "example-ai",
  workflowId: "W2_content_factory",
  attemptId,
  agentRole: "content_studio",
  outcome,
  startedAt: "2030-01-01T00:01:00.000Z",
  finishedAt: "2030-01-01T00:02:00.000Z",
  artifactReferences,
  qualityGateStatus: "not_run",
  handoffMode: "manual_coding_agent",
  notes: "Internal draft only. Human review is still required.",
  externalActionAuthority: { ...externalActionAuthority }
});

const passingScores = Object.freeze({
  jtbd_audience_relevance: 4,
  specific_differentiated_value: 4,
  proof_claim_precision: 4,
  brand_locale_editorial_quality: 4,
  clarity_cta_destination_fit: 4,
  platform_visual_accessibility_fit: 4,
  trust_emotional_safety: 4,
  experiment_measurement_quality: 4,
  operational_traceability_reuse: 4
});

const qaVerdictFor = ({ workspace, jobId, attemptId, artifactReferences, verdict = "pass" }) => ({
  schemaVersion: "1.0.0",
  jobId,
  tenantId: "example-ai",
  workflowId: "W2_content_factory",
  attemptId,
  reviewerRole: "tenant-independent-qa",
  reviewerCapability: "quality_assurance",
  subjectAgentRole: "content_studio",
  reviewedAt: "2030-01-01T00:01:30.000Z",
  verdict,
  deterministicLintStatus: { pass: "passed", revise: "repair_required", block: "blocked" }[verdict],
  artifactBindings: computeGrowthJobArtifactBindings({ workspace, references: artifactReferences }),
  hardFailureCodes: verdict === "block" ? ["claim_not_ready"] : [],
  softScores: verdict === "revise" ? { ...passingScores, proof_claim_precision: 2 } : { ...passingScores },
  provenanceComplete: verdict !== "block",
  rubricVersion: "growth_core_1",
  notes: `Independent ${verdict} verdict for the exact tenant-scoped artifact bytes.`,
  handoffMode: "manual_coding_agent",
  externalActionAuthority: { ...externalActionAuthority }
});

const independentlyReview = ({ workspace, jobId, attemptId, artifactReferences, verdict = "pass" }) => reviewGrowthJob({
  workspace,
  jobId,
  verdict: qaVerdictFor({ workspace, jobId, attemptId, artifactReferences, verdict })
});

const writeArtifact = (workspace, jobId, name = "draft.json", content = "{\"draft\":true}\n") => {
  const directory = path.join(workspace, "operations", "jobs", jobId, "artifacts");
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, name);
  fs.writeFileSync(filePath, content, "utf8");
  return `operations/jobs/${jobId}/artifacts/${name}`;
};

const writeConceptArtifact = (workspace, jobId, name = "concept-package.json", options = {}) => writeArtifact(
  workspace,
  jobId,
  name,
  serializeSyntheticConceptPackage({ tenantRoot: workspace, jobId, ...options })
);

test("claim is exclusive, moves only a ready job to in_progress, and is idempotent for the same attempt", () => {
  withWorkspace(({ workspace, store }) => {
    const jobId = "claim-content-001";
    createJob(store, jobId);
    const first = claimJob(workspace, jobId, "claim-content-attempt");

    assert.equal(first.idempotent, false);
    assert.equal(first.job.state.status, "in_progress");
    assert.equal(first.claim.attemptId, "claim-content-attempt");
    assert.equal(first.claim.agentRole, "content_studio");
    assert.equal(first.claim.claimedAt, claimTime);
    assert.equal(first.claim.leaseExpiresAt, "2030-01-01T01:00:00.000Z");
    assert.deepEqual(first.claim.externalActionAuthority, externalActionAuthority);
    assert.equal("providerApiKey" in first.claim, false);
    assert.equal("ownerDecision" in first.claim, false);

    const repeated = claimJob(workspace, jobId, "claim-content-attempt");
    assert.equal(repeated.idempotent, true);
    assert.equal(repeated.job.state.stateVersion, first.job.state.stateVersion);
    assert.throws(() => claimJob(workspace, jobId, "second-agent-attempt"), /already claimed/i);

    const claimRecord = JSON.parse(fs.readFileSync(path.join(workspace, "operations", "jobs", jobId, "claim.json"), "utf8"));
    assert.equal(claimRecord.attemptId, "claim-content-attempt");
    assert.equal(store.readJob(jobId).state.ownerDecision, undefined);
  });
});

test("claim rejects invalid leases and any state other than ready_for_agent", () => {
  withWorkspace(({ workspace, store }) => {
    const jobId = "claim-guard-001";
    createJob(store, jobId);
    assert.throws(() => claimGrowthJob({ workspace, jobId, attemptId: "lease-too-short", leaseSeconds: 10 }), /Lease must be an integer/i);
    claimJob(workspace, jobId, "valid-claim-attempt");
    assert.throws(() => claimJob(workspace, jobId, "another-claim-attempt"), /already claimed/i);
  });
});

test("claim idempotency recovers an exclusive claim record left before the state transition", () => {
  withWorkspace(({ workspace, store }) => {
    const jobId = "claim-recovery-001";
    const attemptId = "claim-recovery-attempt";
    const created = createJob(store, jobId);
    const claim = {
      schemaVersion: "1.0.0",
      jobId,
      tenantId: created.manifest.tenantId,
      workflowId: created.manifest.workflowId,
      attemptId,
      agentRole: created.manifest.assignedAgentRole,
      status: "active",
      claimedAt: claimTime,
      leaseExpiresAt: "2030-01-01T01:00:00.000Z",
      handoffMode: "manual_coding_agent",
      credentialPolicy: "framework_accepts_no_provider_credentials",
      externalActionAuthority: { ...externalActionAuthority }
    };
    fs.writeFileSync(path.join(workspace, "operations", "jobs", jobId, "claim.json"), `${JSON.stringify(claim, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });

    const recovered = claimJob(workspace, jobId, attemptId);
    assert.equal(recovered.idempotent, true);
    assert.equal(recovered.job.state.status, "in_progress");
    assert.equal(recovered.claim.attemptId, attemptId);
  });
});

test("an expired claim is reclaimed only by a distinct attempt with an integrity-bound archive and audit event", () => {
  withWorkspace(({ workspace, store }) => {
    const jobId = "expired-reclaim-001";
    const expiredAttemptId = "expired-reclaim-old";
    const freshAttemptId = "expired-reclaim-fresh";
    createJob(store, jobId);
    claimGrowthJob({ workspace, jobId, attemptId: expiredAttemptId, leaseSeconds: 60, now: new Date("2020-01-01T00:00:00.000Z") });
    writeArtifact(workspace, jobId, "unfinished.json", "{\"attempt\":\"expired\"}\n");

    assert.throws(
      () => claimGrowthJob({ workspace, jobId, attemptId: expiredAttemptId, leaseSeconds: 3600, now: new Date(claimTime) }),
      /distinct new attempt id|never silently renewed/i
    );
    const reclaimed = claimGrowthJob({ workspace, jobId, attemptId: freshAttemptId, leaseSeconds: 3600, now: new Date(claimTime) });
    assert.equal(reclaimed.idempotent, false);
    assert.equal(reclaimed.reclaimed, true);
    assert.equal(reclaimed.claim.attemptId, freshAttemptId);
    assert.equal(reclaimed.claim.claimedAt, claimTime);
    assert.equal(reclaimed.claim.leaseExpiresAt, "2030-01-01T01:00:00.000Z");
    assert.equal(reclaimed.job.state.status, "in_progress");
    assert.equal(reclaimed.job.state.ownerDecision, undefined);
    assert.equal(reclaimed.recovery.previousAttemptId, expiredAttemptId);

    const jobRoot = path.join(workspace, "operations", "jobs", jobId);
    const archiveRoot = path.join(jobRoot, "attempts", expiredAttemptId);
    const archiveManifest = JSON.parse(fs.readFileSync(path.join(archiveRoot, "archive-manifest.json"), "utf8"));
    assert.equal(archiveManifest.archiveReason, "expired_lease_reclaim");
    assert.equal(archiveManifest.supersededByAttemptId, freshAttemptId);
    assert.equal(archiveManifest.previousLeaseExpiresAt, "2020-01-01T00:01:00.000Z");
    assert.equal(archiveManifest.archivedFromStatus, "in_progress");
    assert.equal(archiveManifest.archivedAt, claimTime);
    assert.deepEqual(archiveManifest.externalActionAuthority, externalActionAuthority);
    for (const relativePath of ["claim.json", "state-before-reclaim.json", "artifacts/unfinished.json"]) {
      const archivedPath = path.join(archiveRoot, ...relativePath.split("/"));
      const record = archiveManifest.records.find(({ path: recordedPath }) => recordedPath === relativePath);
      assert.ok(record, `${relativePath} must be integrity-bound by the archive manifest`);
      const bytes = fs.readFileSync(archivedPath);
      assert.equal(record.bytes, bytes.length);
      assert.equal(record.hash, `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`);
    }
    assert.equal(fs.readFileSync(path.join(archiveRoot, "artifacts", "unfinished.json"), "utf8"), "{\"attempt\":\"expired\"}\n");
    assert.equal(fs.existsSync(path.join(jobRoot, "artifacts")), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(jobRoot, "claim.json"), "utf8")).attemptId, freshAttemptId);

    const reclaimEvents = reclaimed.job.events.filter(({ eventType }) => eventType === "agent.expired_claim_reclaimed");
    assert.equal(reclaimEvents.length, 1);
    assert.equal(reclaimEvents[0].payload.previousAttemptId, expiredAttemptId);
    assert.equal(reclaimEvents[0].payload.supersededByAttemptId, freshAttemptId);
    assert.equal(reclaimEvents[0].payload.previousLeaseExpiresAt, "2020-01-01T00:01:00.000Z");
    assert.equal(reclaimEvents[0].payload.archiveRelativePath, `operations/jobs/${jobId}/attempts/${expiredAttemptId}`);
    assert.deepEqual(reclaimEvents[0].payload.externalActionAuthority, externalActionAuthority);

    const repeated = claimGrowthJob({ workspace, jobId, attemptId: freshAttemptId, leaseSeconds: 3600, now: new Date("2030-01-01T00:10:00.000Z") });
    assert.equal(repeated.idempotent, true);
    assert.equal(repeated.reclaimed, true);
    assert.equal(repeated.job.state.stateVersion, reclaimed.job.state.stateVersion);
    assert.throws(
      () => claimGrowthJob({ workspace, jobId, attemptId: "non-expired-intruder", leaseSeconds: 3600, now: new Date("2030-01-01T00:10:00.000Z") }),
      /already claimed/i
    );

    const newArtifact = writeConceptArtifact(workspace, jobId, "replacement.json", {
      copyByLocale: { "en-US": { body: "Fresh replacement draft for internal review." } }
    });
    independentlyReview({ workspace, jobId, attemptId: freshAttemptId, artifactReferences: [newArtifact] });
    const completed = completeGrowthJob({ workspace, jobId, receipt: receiptFor({ jobId, attemptId: freshAttemptId, artifactReferences: [newArtifact] }) });
    assert.equal(completed.job.state.status, "awaiting_owner_decision");
    assert.equal(fs.readFileSync(path.join(archiveRoot, "artifacts", "unfinished.json"), "utf8"), "{\"attempt\":\"expired\"}\n");
  });
});

test("passed QA completion persists a receipt and artifact hash, then stops at owner decision", () => {
  withWorkspace(({ workspace, store }) => {
    const jobId = "complete-content-001";
    const attemptId = "complete-content-attempt";
    createJob(store, jobId);
    claimJob(workspace, jobId, attemptId);
    const artifactReference = writeConceptArtifact(workspace, jobId, "copy-package.json");
    const qa = independentlyReview({ workspace, jobId, attemptId, artifactReferences: [artifactReference] });
    const receipt = receiptFor({ jobId, attemptId, artifactReferences: [artifactReference] });

    const completed = completeGrowthJob({ workspace, jobId, receipt });
    assert.equal(completed.idempotent, false);
    assert.equal(completed.job.state.status, "awaiting_owner_decision");
    assert.equal(completed.job.state.ownerDecision, undefined);
    assert.equal(completed.receipt.qualityGateStatus, "not_run");
    assert.equal(qa.verdict.reviewerRole, "tenant-independent-qa");
    assert.notEqual(qa.verdict.reviewerRole, completed.receipt.agentRole);
    assert.deepEqual(validateContractInstance(sourceRoot, "schemas/independent-qa-verdict.schema.json", qa.verdict, "independent QA verdict"), []);
    assert.deepEqual(validateContractInstance(sourceRoot, "schemas/agent-run-receipt.schema.json", completed.receipt, "lead receipt"), []);
    assert.equal(completed.artifactHashes.artifacts.length, 1);
    assert.equal(completed.artifactHashes.artifacts[0].reference, artifactReference);
    assert.equal(completed.artifactHashes.artifacts[0].hash, `sha256:${crypto.createHash("sha256").update(fs.readFileSync(path.join(workspace, ...artifactReference.split("/")))).digest("hex")}`);

    const persistedReceipt = JSON.parse(fs.readFileSync(path.join(workspace, "operations", "jobs", jobId, "run-receipt.json"), "utf8"));
    assert.deepEqual(persistedReceipt, receipt);
    const repeated = completeGrowthJob({ workspace, jobId, receipt });
    assert.equal(repeated.idempotent, true);
    assert.equal(repeated.job.state.status, "awaiting_owner_decision");
    assert.throws(() => completeGrowthJob({ workspace, jobId, receipt: { ...receipt, notes: "Different completion." } }), /different run receipt/i);
    assert.equal(store.readJob(jobId).state.ownerDecision, undefined);
  });
});

test("completion maps repair and blocked QA to bounded non-owner states", () => {
  withWorkspace(({ workspace, store }) => {
    const revisionJobId = "revision-content-001";
    const revisionAttemptId = "revision-content-attempt";
    createJob(store, revisionJobId);
    claimJob(workspace, revisionJobId, revisionAttemptId);
    const revisionArtifact = writeArtifact(workspace, revisionJobId, "revision-draft.json");
    independentlyReview({ workspace, jobId: revisionJobId, attemptId: revisionAttemptId, artifactReferences: [revisionArtifact], verdict: "revise" });
    const revisionReceipt = receiptFor({
      jobId: revisionJobId,
      attemptId: revisionAttemptId,
      outcome: "revision_required",
      artifactReferences: [revisionArtifact]
    });
    assert.equal(completeGrowthJob({ workspace, jobId: revisionJobId, receipt: revisionReceipt }).job.state.status, "revision_requested");

    const blockedJobId = "blocked-content-001";
    const blockedAttemptId = "blocked-content-attempt";
    createJob(store, blockedJobId);
    claimJob(workspace, blockedJobId, blockedAttemptId);
    const blockedArtifact = writeArtifact(workspace, blockedJobId, "blocked-draft.json");
    independentlyReview({ workspace, jobId: blockedJobId, attemptId: blockedAttemptId, artifactReferences: [blockedArtifact], verdict: "block" });
    const blockedReceipt = receiptFor({
      jobId: blockedJobId,
      attemptId: blockedAttemptId,
      outcome: "blocked",
      artifactReferences: [blockedArtifact]
    });
    const blocked = completeGrowthJob({ workspace, jobId: blockedJobId, receipt: blockedReceipt });
    assert.equal(blocked.job.state.status, "blocked");
    assert.equal(blocked.job.state.ownerDecision, undefined);
  });
});

test("completion rejects an unclaimed job, owner-decision fields, credentials, path escape, and expired lease", () => {
  withWorkspace(({ workspace, store }) => {
    const unclaimedJobId = "unclaimed-content-001";
    createJob(store, unclaimedJobId);
    const unclaimedReceipt = receiptFor({ jobId: unclaimedJobId, attemptId: "unclaimed-attempt", artifactReferences: ["safe.json"] });
    assert.throws(() => completeGrowthJob({ workspace, jobId: unclaimedJobId, receipt: unclaimedReceipt }), /only from in_progress/i);

    const jobId = "receipt-guard-001";
    const attemptId = "receipt-guard-attempt";
    createJob(store, jobId);
    claimJob(workspace, jobId, attemptId);
    const artifactReference = writeConceptArtifact(workspace, jobId);
    const valid = receiptFor({ jobId, attemptId, artifactReferences: [artifactReference] });
    assert.throws(() => completeGrowthJob({ workspace, jobId, receipt: { ...valid, ownerDecision: { decision: "accept" } } }), /unsupported fields.*cannot write an owner decision/i);
    assert.throws(() => completeGrowthJob({ workspace, jobId, receipt: { ...valid, notes: "provider_api_key=secret" } }), /may not contain provider or subscription credentials/i);
    assert.throws(() => completeGrowthJob({ workspace, jobId, receipt: { ...valid, artifactReferences: ["../outside.json"] } }), /unsafe artifact reference/i);
    assert.throws(() => completeGrowthJob({ workspace, jobId, receipt: { ...valid, finishedAt: "2030-01-01T02:00:00.000Z" } }), /inside the active claim lease/i);
    assert.throws(() => completeGrowthJob({ workspace, jobId, receipt: { ...valid, qualityGateStatus: "passed" } }), /cannot self-attest independent QA/i);
    assert.throws(() => completeGrowthJob({ workspace, jobId, receipt: valid }), /qa-verdict\.json|JSON record|ENOENT/i);

    const fractionalScoreVerdict = qaVerdictFor({ workspace, jobId, attemptId, artifactReferences: [artifactReference] });
    fractionalScoreVerdict.softScores.proof_claim_precision = 3.5;
    assert.throws(() => reviewGrowthJob({ workspace, jobId, verdict: fractionalScoreVerdict }), /score from 1 to 5/i);

    independentlyReview({ workspace, jobId, attemptId, artifactReferences: [artifactReference] });
    const completed = completeGrowthJob({ workspace, jobId, receipt: valid });
    assert.equal(completed.job.state.status, "awaiting_owner_decision");

    const expiredJobId = "expired-claim-guard-001";
    const expiredAttemptId = "expired-claim-attempt";
    createJob(store, expiredJobId);
    claimGrowthJob({ workspace, jobId: expiredJobId, attemptId: expiredAttemptId, leaseSeconds: 60, now: new Date("2020-01-01T00:00:00.000Z") });
    const expiredArtifact = writeArtifact(workspace, expiredJobId, "expired.json");
    const expiredVerdict = qaVerdictFor({ workspace, jobId: expiredJobId, attemptId: expiredAttemptId, artifactReferences: [expiredArtifact] });
    assert.throws(() => reviewGrowthJob({ workspace, jobId: expiredJobId, verdict: expiredVerdict }), /expired claim lease/i);
    assert.throws(() => completeGrowthJob({ workspace, jobId: expiredJobId, receipt: receiptFor({ jobId: expiredJobId, attemptId: expiredAttemptId, artifactReferences: [expiredArtifact] }) }), /claim lease expires/i);
  });
});

test("independent QA rejects self-review and completion rejects an artifact changed after review", () => {
  withWorkspace(({ workspace, store }) => {
    const selfReviewJobId = "self-review-guard-001";
    const selfReviewAttemptId = "self-review-attempt";
    createJob(store, selfReviewJobId);
    claimJob(workspace, selfReviewJobId, selfReviewAttemptId);
    const selfReviewArtifact = writeArtifact(workspace, selfReviewJobId, "self-review.json");
    const roleMappingPath = path.join(workspace, "role-mapping.json");
    const roleMapping = JSON.parse(fs.readFileSync(roleMappingPath, "utf8"));
    roleMapping.frameworkRoleMappings.quality_assurance = "content_studio";
    fs.writeFileSync(roleMappingPath, `${JSON.stringify(roleMapping, null, 2)}\n`, "utf8");
    const selfVerdict = {
      ...qaVerdictFor({ workspace, jobId: selfReviewJobId, attemptId: selfReviewAttemptId, artifactReferences: [selfReviewArtifact] }),
      reviewerRole: "content_studio"
    };
    assert.throws(() => reviewGrowthJob({ workspace, jobId: selfReviewJobId, verdict: selfVerdict }), /reviewer must differ from the work-order lead agent/i);

    const staleJobId = "stale-review-guard-001";
    const staleAttemptId = "stale-review-attempt";
    roleMapping.frameworkRoleMappings.quality_assurance = "tenant-independent-qa";
    fs.writeFileSync(roleMappingPath, `${JSON.stringify(roleMapping, null, 2)}\n`, "utf8");
    createJob(store, staleJobId);
    claimJob(workspace, staleJobId, staleAttemptId);
    const staleArtifact = writeConceptArtifact(workspace, staleJobId, "stale-copy.json", {
      copyByLocale: { "en-US": { body: "Before review content." } }
    });
    independentlyReview({ workspace, jobId: staleJobId, attemptId: staleAttemptId, artifactReferences: [staleArtifact] });
    fs.writeFileSync(path.join(workspace, ...staleArtifact.split("/")), "changed-after-review\n", "utf8");
    const staleReceipt = receiptFor({ jobId: staleJobId, attemptId: staleAttemptId, artifactReferences: [staleArtifact] });
    assert.throws(() => completeGrowthJob({ workspace, jobId: staleJobId, receipt: staleReceipt }), /artifact binding is stale|changed after independent QA/i);
    assert.equal(store.readJob(staleJobId).state.status, "in_progress");
  });
});

test("passing QA cannot bypass malformed JSON or deterministic hard failures", () => {
  withWorkspace(({ workspace, store }) => {
    const malformedJobId = "malformed-lint-guard-001";
    const malformedAttemptId = "malformed-lint-attempt";
    createJob(store, malformedJobId);
    claimJob(workspace, malformedJobId, malformedAttemptId);
    const malformedArtifact = writeArtifact(workspace, malformedJobId, "malformed.json", "{\"artifactKind\":\"concept_copy_package\"");
    assert.throws(
      () => independentlyReview({ workspace, jobId: malformedJobId, attemptId: malformedAttemptId, artifactReferences: [malformedArtifact] }),
      /framework-computed deterministic lint pass.*malformed JSON/i
    );
    assert.equal(store.readJob(malformedJobId).state.status, "in_progress");
    assert.equal(fs.existsSync(path.join(workspace, "operations", "jobs", malformedJobId, "qa-verdict.json")), false);

    const hardFailJobId = "hard-fail-lint-guard-001";
    const hardFailAttemptId = "hard-fail-lint-attempt";
    createJob(store, hardFailJobId);
    claimJob(workspace, hardFailJobId, hardFailAttemptId);
    const hardFailArtifact = writeConceptArtifact(workspace, hardFailJobId, "hard-fail.json", {
      copyByLocale: {
        "en-US": { body: "This plan will definitely determine the outcome." }
      }
    });
    assert.throws(
      () => independentlyReview({ workspace, jobId: hardFailJobId, attemptId: hardFailAttemptId, artifactReferences: [hardFailArtifact] }),
      /framework-computed deterministic lint pass/i
    );
    assert.equal(store.readJob(hardFailJobId).state.status, "in_progress");
    assert.equal(fs.existsSync(path.join(workspace, "operations", "jobs", hardFailJobId, "qa-verdict.json")), false);
  });
});

test("revision retry archives the prior attempt and starts a distinct independently reviewed attempt", () => {
  withWorkspace(({ workspace, store }) => {
    const jobId = "revision-retry-001";
    const firstAttemptId = "revision-retry-first";
    const secondAttemptId = "revision-retry-second";
    createJob(store, jobId);
    claimJob(workspace, jobId, firstAttemptId);
    const firstAttemptContent = serializeSyntheticConceptPackage({
      tenantRoot: workspace,
      jobId,
      copyByLocale: { "en-US": { body: "First attempt content." } }
    });
    const artifactReference = writeArtifact(workspace, jobId, "retry-copy.json", firstAttemptContent);
    independentlyReview({ workspace, jobId, attemptId: firstAttemptId, artifactReferences: [artifactReference] });
    completeGrowthJob({ workspace, jobId, receipt: receiptFor({ jobId, attemptId: firstAttemptId, artifactReferences: [artifactReference] }) });
    const revised = store.recordOwnerDecision(jobId, { decision: "revise", reason: "Strengthen proof and specificity.", actorRole: "owner" });
    assert.equal(revised.state.status, "revision_requested");

    const secondClaim = claimJob(workspace, jobId, secondAttemptId);
    assert.equal(secondClaim.job.state.status, "in_progress");
    assert.equal(secondClaim.job.state.ownerDecision, undefined);
    assert.equal(secondClaim.claim.attemptId, secondAttemptId);
    const archiveRoot = path.join(workspace, "operations", "jobs", jobId, "attempts", firstAttemptId);
    for (const relativePath of ["claim.json", "run-receipt.json", "artifact-hashes.json", "deterministic-lint.json", "qa-verdict.json", "completion-lock.json", "state-before-retry.json", "archive-manifest.json", "artifacts/retry-copy.json"]) {
      assert.equal(fs.existsSync(path.join(archiveRoot, ...relativePath.split("/"))), true, `${relativePath} should be archived`);
    }
    const jobRoot = path.join(workspace, "operations", "jobs", jobId);
    assert.equal(fs.existsSync(path.join(jobRoot, "run-receipt.json")), false);
    assert.equal(fs.existsSync(path.join(jobRoot, "qa-verdict.json")), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(jobRoot, "claim.json"), "utf8")).attemptId, secondAttemptId);

    fs.writeFileSync(path.join(workspace, ...artifactReference.split("/")), serializeSyntheticConceptPackage({
      tenantRoot: workspace,
      jobId,
      copyByLocale: { "en-US": { body: "Second attempt improved for internal review." } },
      packageOverrides: { version: "1.0.1" }
    }), "utf8");
    independentlyReview({ workspace, jobId, attemptId: secondAttemptId, artifactReferences: [artifactReference] });
    const secondCompletion = completeGrowthJob({ workspace, jobId, receipt: receiptFor({ jobId, attemptId: secondAttemptId, artifactReferences: [artifactReference] }) });
    assert.equal(secondCompletion.job.state.status, "awaiting_owner_decision");
    assert.equal(fs.readFileSync(path.join(archiveRoot, "artifacts", "retry-copy.json"), "utf8"), firstAttemptContent);

    store.recordOwnerDecision(jobId, { decision: "revise", reason: "One final evidence pass.", actorRole: "owner" });
    const thirdAttemptId = "revision-retry-third";
    claimJob(workspace, jobId, thirdAttemptId);
    const statePath = path.join(jobRoot, "state.json");
    const interruptedState = JSON.parse(fs.readFileSync(statePath, "utf8"));
    interruptedState.status = "revision_requested";
    fs.writeFileSync(statePath, `${JSON.stringify(interruptedState, null, 2)}\n`, "utf8");
    const recoveredThirdClaim = claimJob(workspace, jobId, thirdAttemptId);
    assert.equal(recoveredThirdClaim.idempotent, true);
    assert.equal(recoveredThirdClaim.job.state.status, "in_progress");
    assert.equal(recoveredThirdClaim.claim.attemptId, thirdAttemptId);
  });
});

test("claim and complete command-line entry points run the bounded happy path", () => {
  withWorkspace(({ workspace, store }) => {
    const jobId = "cli-content-001";
    const attemptId = "cli-content-attempt";
    createJob(store, jobId);
    const claimRun = spawnSync(process.execPath, [
      path.join(sourceRoot, "scripts", "claim-growth-job.mjs"),
      "--workspace", workspace,
      "--job-id", jobId,
      "--attempt-id", attemptId,
      "--lease-seconds", "3600"
    ], { cwd: sourceRoot, encoding: "utf8" });
    assert.equal(claimRun.status, 0, claimRun.stderr);
    assert.equal(JSON.parse(claimRun.stdout).status, "in_progress");

    const claim = JSON.parse(fs.readFileSync(path.join(workspace, "operations", "jobs", jobId, "claim.json"), "utf8"));
    const startedAt = new Date(Date.parse(claim.claimedAt) + 1000).toISOString();
    const finishedAt = new Date(Date.parse(claim.claimedAt) + 2000).toISOString();
    const artifactReference = writeConceptArtifact(workspace, jobId, "cli-draft.json");
    const qaVerdict = {
      ...qaVerdictFor({ workspace, jobId, attemptId, artifactReferences: [artifactReference] }),
      reviewedAt: new Date(Date.parse(claim.claimedAt) + 1500).toISOString()
    };
    const verdictPath = path.join(workspace, "operations", "jobs", jobId, "qa-verdict-candidate.json");
    fs.writeFileSync(verdictPath, `${JSON.stringify(qaVerdict, null, 2)}\n`, "utf8");
    const reviewRun = spawnSync(process.execPath, [
      path.join(sourceRoot, "scripts", "review-growth-job.mjs"),
      "--workspace", workspace,
      "--job-id", jobId,
      "--verdict", verdictPath
    ], { cwd: sourceRoot, encoding: "utf8" });
    assert.equal(reviewRun.status, 0, reviewRun.stderr);
    assert.equal(JSON.parse(reviewRun.stdout).reviewerRole, "tenant-independent-qa");
    const receipt = {
      ...receiptFor({ jobId, attemptId, artifactReferences: [artifactReference] }),
      startedAt,
      finishedAt
    };
    const receiptPath = path.join(workspace, "operations", "jobs", jobId, "receipt-candidate.json");
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

    const completeRun = spawnSync(process.execPath, [
      path.join(sourceRoot, "scripts", "complete-growth-job.mjs"),
      "--workspace", workspace,
      "--job-id", jobId,
      "--receipt", receiptPath
    ], { cwd: sourceRoot, encoding: "utf8" });
    assert.equal(completeRun.status, 0, completeRun.stderr);
    assert.equal(JSON.parse(completeRun.stdout).status, "awaiting_owner_decision");
    assert.equal(store.readJob(jobId).state.ownerDecision, undefined);
  });
});

test("cross-process lock serializes competing claims without duplicate attempt state", async () => {
  const workspace = createReadyWorkspace();
  try {
    const store = createCanvasWorkspaceStore({ workspace });
    const jobId = "concurrent-claim-001";
    createJob(store, jobId);
    const baseArgs = [path.join(sourceRoot, "scripts", "claim-growth-job.mjs"), "--workspace", workspace, "--job-id", jobId, "--lease-seconds", "3600"];
    const [first, second] = await Promise.all([
      runProcess([...baseArgs, "--attempt-id", "concurrent-first-attempt"]),
      runProcess([...baseArgs, "--attempt-id", "concurrent-second-attempt"])
    ]);
    assert.deepEqual([first.status, second.status].sort(), [0, 1]);
    const job = store.readJob(jobId, { includeEvents: true });
    const claim = JSON.parse(fs.readFileSync(path.join(workspace, "operations", "jobs", jobId, "claim.json"), "utf8"));
    assert.equal(job.state.status, "in_progress");
    assert.ok(["concurrent-first-attempt", "concurrent-second-attempt"].includes(claim.attemptId));
    assert.equal(job.events.filter(({ eventType }) => eventType === "agent.claimed").length, 1);
    assert.equal(fs.existsSync(path.join(workspace, "operations", "jobs", jobId, ".growth-job.lock")), false);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("cross-process lock permits exactly one distinct reclaim of an expired attempt", async () => {
  const workspace = createReadyWorkspace();
  try {
    const store = createCanvasWorkspaceStore({ workspace });
    const jobId = "concurrent-reclaim-001";
    const expiredAttemptId = "concurrent-reclaim-old";
    createJob(store, jobId);
    claimGrowthJob({ workspace, jobId, attemptId: expiredAttemptId, leaseSeconds: 60, now: new Date("2020-01-01T00:00:00.000Z") });
    writeArtifact(workspace, jobId, "unfinished.json", "expired-concurrent-attempt\n");

    const baseArgs = [path.join(sourceRoot, "scripts", "claim-growth-job.mjs"), "--workspace", workspace, "--job-id", jobId, "--lease-seconds", "3600"];
    const [first, second] = await Promise.all([
      runProcess([...baseArgs, "--attempt-id", "concurrent-reclaim-first"]),
      runProcess([...baseArgs, "--attempt-id", "concurrent-reclaim-second"])
    ]);
    assert.deepEqual([first.status, second.status].sort(), [0, 1]);
    const winner = first.status === 0 ? JSON.parse(first.stdout) : JSON.parse(second.stdout);
    assert.equal(winner.reclaimed, true);
    assert.equal(winner.previousAttemptId, expiredAttemptId);
    assert.ok(["concurrent-reclaim-first", "concurrent-reclaim-second"].includes(winner.attemptId));

    const finalJob = store.readJob(jobId, { includeEvents: true });
    const activeClaim = JSON.parse(fs.readFileSync(path.join(workspace, "operations", "jobs", jobId, "claim.json"), "utf8"));
    assert.equal(finalJob.state.status, "in_progress");
    assert.equal(activeClaim.attemptId, winner.attemptId);
    assert.equal(finalJob.events.filter(({ eventType }) => eventType === "agent.expired_claim_reclaimed").length, 1);
    assert.equal(finalJob.events.filter(({ eventType }) => eventType === "agent.claimed").length, 1);
    const archiveRoot = path.join(workspace, "operations", "jobs", jobId, "attempts", expiredAttemptId);
    assert.equal(fs.readFileSync(path.join(archiveRoot, "artifacts", "unfinished.json"), "utf8"), "expired-concurrent-attempt\n");
    assert.equal(fs.existsSync(path.join(workspace, "operations", "jobs", jobId, ".growth-job.lock")), false);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("cross-process cancel and completion cannot interleave partial lifecycle records", async () => {
  const workspace = createReadyWorkspace();
  try {
    const store = createCanvasWorkspaceStore({ workspace });
    const jobId = "cancel-complete-race-001";
    const attemptId = "cancel-complete-attempt";
    createJob(store, jobId);
    claimJob(workspace, jobId, attemptId);
    const artifactReference = writeConceptArtifact(workspace, jobId, "race-copy.json");
    independentlyReview({ workspace, jobId, attemptId, artifactReferences: [artifactReference] });
    const receipt = receiptFor({ jobId, attemptId, artifactReferences: [artifactReference] });
    const receiptPath = path.join(workspace, "operations", "jobs", jobId, "race-receipt.json");
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

    const storeModuleUrl = pathToFileURL(path.join(sourceRoot, "packages", "growth-canvas", "server", "workspace-store.mjs")).href;
    const cancelCode = `import { createCanvasWorkspaceStore, withJobLock } from ${JSON.stringify(storeModuleUrl)}; const [workspace, jobId] = process.argv.slice(1); try { const store = createCanvasWorkspaceStore({ workspace }); const result = withJobLock({ workspace, jobId }, () => store.cancelJob(jobId, { reason: "Concurrent owner cancellation test.", actorRole: "owner" })); console.log(JSON.stringify({ status: result.state.status })); } catch (error) { console.error(error.message); process.exitCode = 1; }`;
    const [completionRun, cancellationRun] = await Promise.all([
      runProcess([path.join(sourceRoot, "scripts", "complete-growth-job.mjs"), "--workspace", workspace, "--job-id", jobId, "--receipt", receiptPath]),
      runProcess(["--input-type=module", "--eval", cancelCode, workspace, jobId])
    ]);
    assert.ok(completionRun.status === 0 || cancellationRun.status === 0);
    const finalJob = store.readJob(jobId, { includeEvents: true });
    assert.ok(["awaiting_owner_decision", "cancelled"].includes(finalJob.state.status));
    const receiptExists = fs.existsSync(path.join(workspace, "operations", "jobs", jobId, "run-receipt.json"));
    const hashesExist = fs.existsSync(path.join(workspace, "operations", "jobs", jobId, "artifact-hashes.json"));
    assert.equal(receiptExists, hashesExist);
    if (receiptExists) assert.equal(JSON.parse(fs.readFileSync(path.join(workspace, "operations", "jobs", jobId, "run-receipt.json"), "utf8")).attemptId, attemptId);
    assert.equal(fs.existsSync(path.join(workspace, "operations", "jobs", jobId, ".growth-job.lock")), false);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
