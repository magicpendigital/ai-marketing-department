import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveCanvasOptions, startCanvasServer } from "../packages/growth-canvas/server/index.mjs";
import { createCanvasWorkspaceStore, externalActionAuthority, withJobLock } from "../packages/growth-canvas/server/workspace-store.mjs";
import { claimGrowthJob } from "./claim-growth-job.mjs";
import { completeGrowthJob } from "./complete-growth-job.mjs";
import { materializeSyntheticReadyTenant } from "./growth-tenant-demo.mjs";
import { serializeSyntheticConceptPackage } from "./growth-job-test-fixtures.mjs";
import { initializeGrowthTenant } from "./init-growth-tenant.mjs";
import { computeGrowthJobArtifactBindings, reviewGrowthJob } from "./review-growth-job.mjs";

const frameworkRoot = process.cwd();
const temporaryRoots = new Set();

const createTenant = ({ tenantId = "canvas-test", ready = true } = {}) => {
  const tenantRoot = fs.mkdtempSync(path.join(os.tmpdir(), "growth-canvas-backend-"));
  temporaryRoots.add(tenantRoot);
  initializeGrowthTenant({ workspaceRoot: frameworkRoot, tenantId, outputRoot: tenantRoot });
  if (ready) materializeSyntheticReadyTenant({ tenantRoot, tenantId });
  return tenantRoot;
};

const removeTemporaryRoot = (root) => {
  const resolved = path.resolve(root);
  const tempRoot = path.resolve(os.tmpdir());
  const relative = path.relative(tempRoot, resolved);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Refusing to remove test path outside temporary storage: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
  temporaryRoots.delete(root);
};

test.afterEach(() => {
  for (const root of [...temporaryRoots]) removeTemporaryRoot(root);
});

const withServer = async (tenantRoot, callback, options = {}) => {
  const runtime = await startCanvasServer({ workspace: tenantRoot, port: 0, accessCapability: "test-access-capability", mutationNonce: "test-mutation-nonce", ...options });
  try {
    await callback(runtime);
  } finally {
    await runtime.close();
  }
};

const api = async (runtime, pathname, { method = "GET", body, origin = runtime.baseUrl, nonce = runtime.mutationNonce, capability = runtime.accessCapability } = {}) => {
  const headers = { Accept: "application/json", ...(capability ? { "X-Canvas-Capability": capability } : {}) };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers.Origin = origin;
    headers["X-Canvas-Nonce"] = nonce;
  }
  const response = await fetch(`${runtime.baseUrl}${pathname}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, body: await response.json() };
};

const apiMedia = async (runtime, pathname, { capability = runtime.accessCapability } = {}) => {
  const response = await fetch(`${runtime.baseUrl}${pathname}`, {
    headers: { ...(capability ? { "X-Canvas-Capability": capability } : {}), Accept: "image/*, video/*" }
  });
  const contentType = response.headers.get("content-type");
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, contentType, body, ...(contentType?.includes("application/json") ? { error: JSON.parse(body.toString("utf8")) } : {}) };
};

const jobInput = (jobId = "launch-concept-001") => ({
  jobId,
  workflowId: "W2_content_factory",
  title: "First launch concept",
  campaignSummary: "Prepare an internal concept for owner review.",
  managerTaskDescription: "Create three bounded concepts, run deterministic lint and independent QA, then stop for a human decision."
});

const passingSoftScores = () => ({
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

const runReviewedLifecycle = ({ tenantRoot, store, jobId, artifacts }) => {
  const claimedAt = new Date(Date.now() - 1_000);
  const attemptId = `${jobId}-attempt`;
  claimGrowthJob({ workspace: tenantRoot, jobId, attemptId, leaseSeconds: 3600, now: claimedAt });
  const artifactDirectory = path.join(tenantRoot, "operations", "jobs", jobId, "artifacts");
  fs.mkdirSync(artifactDirectory, { recursive: true });
  const fixtureArtifacts = [
    {
      name: "concept-package.json",
      content: serializeSyntheticConceptPackage({ tenantRoot, jobId })
    },
    ...artifacts
  ];
  const references = fixtureArtifacts.map(({ name, content }) => {
    const filePath = path.join(artifactDirectory, name);
    fs.writeFileSync(filePath, content);
    return `operations/jobs/${jobId}/artifacts/${name}`;
  });
  const artifactBindings = computeGrowthJobArtifactBindings({ workspace: tenantRoot, references });
  const reviewedAt = new Date(claimedAt.getTime() + 1_000).toISOString();
  const verdict = {
    schemaVersion: "1.0.0",
    jobId,
    tenantId: store.tenantId,
    workflowId: "W2_content_factory",
    attemptId,
    reviewerRole: "tenant-independent-qa",
    reviewerCapability: "quality_assurance",
    subjectAgentRole: "content_studio",
    reviewedAt,
    verdict: "pass",
    deterministicLintStatus: "passed",
    artifactBindings,
    hardFailureCodes: [],
    softScores: passingSoftScores(),
    provenanceComplete: true,
    rubricVersion: "growth_core_1",
    notes: "Independent review passed the internal rubric and remains pending owner decision.",
    handoffMode: "manual_coding_agent",
    externalActionAuthority: { ...externalActionAuthority }
  };
  reviewGrowthJob({ workspace: tenantRoot, jobId, verdict });
  const receipt = {
    schemaVersion: "1.0.0",
    jobId,
    tenantId: store.tenantId,
    workflowId: "W2_content_factory",
    attemptId,
    agentRole: "content_studio",
    outcome: "completed_for_review",
    startedAt: new Date(claimedAt.getTime() + 250).toISOString(),
    finishedAt: new Date(claimedAt.getTime() + 1_250).toISOString(),
    artifactReferences: artifactBindings.map((binding) => binding.reference),
    qualityGateStatus: "not_run",
    handoffMode: "manual_coding_agent",
    notes: "Internal artifacts are ready for owner review.",
    externalActionAuthority: { ...externalActionAuthority }
  };
  const completed = completeGrowthJob({ workspace: tenantRoot, jobId, receipt });
  return { attemptId, artifactBindings, references, verdict, receipt, completed };
};

const runMutationChild = ({ tenantRoot, jobId, reason }) => new Promise((resolve, reject) => {
  const source = [
    "import { createCanvasWorkspaceStore } from './packages/growth-canvas/server/workspace-store.mjs';",
    "const store = createCanvasWorkspaceStore({ workspace: process.env.TEST_TENANT_ROOT });",
    "try {",
    "  const result = store.cancelJob(process.env.TEST_JOB_ID, { reason: process.env.TEST_REASON });",
    "  console.log(JSON.stringify({ outcome: 'cancelled', status: result.state.status }));",
    "} catch (error) {",
    "  if (error?.code === 'terminal_job') console.log(JSON.stringify({ outcome: 'terminal_rejected', code: error.code }));",
    "  else { console.error(error?.stack || error?.message || String(error)); process.exitCode = 1; }",
    "}"
  ].join("\n");
  const child = spawn(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: frameworkRoot,
    env: { ...process.env, TEST_TENANT_ROOT: tenantRoot, TEST_JOB_ID: jobId, TEST_REASON: reason },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.once("error", reject);
  child.once("close", (code) => {
    if (code !== 0) reject(new Error(`Mutation child failed (${code}): ${stderr || stdout}`));
    else resolve(JSON.parse(stdout.trim()));
  });
});

test("Canvas resolves exactly one workspace and refuses non-loopback binding", () => {
  const tenantA = createTenant({ tenantId: "tenant-a" });
  const tenantB = createTenant({ tenantId: "tenant-b" });
  assert.throws(
    () => resolveCanvasOptions({ argv: ["--workspace", tenantA, "--workspace", tenantB], env: {} }),
    /exactly one --workspace/i
  );
  assert.throws(
    () => resolveCanvasOptions({ argv: ["--workspace", tenantA, "--host", "0.0.0.0"], env: {} }),
    /loopback/i
  );
  assert.equal(resolveCanvasOptions({ argv: [], env: { GROWTH_CANVAS_WORKSPACE: tenantA, GROWTH_CANVAS_PORT: "0" } }).workspace, tenantA);
  assert.equal(resolveCanvasOptions({ argv: ["--workspace", tenantA, "--static", "dist/client"], env: {} }).staticRoot, "dist/client");
  assert.equal(
    resolveCanvasOptions({ argv: ["--workspace", "tenant-workspaces/example"], env: { INIT_CWD: frameworkRoot } }).workspace,
    path.resolve(frameworkRoot, "tenant-workspaces/example")
  );
});

test("Canvas rejects a symlink or junction workspace", (context) => {
  const tenantRoot = createTenant({ tenantId: "linked-tenant" });
  const linkRoot = `${tenantRoot}-link`;
  try {
    fs.symlinkSync(tenantRoot, linkRoot, process.platform === "win32" ? "junction" : "dir");
    temporaryRoots.add(linkRoot);
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      context.skip(`Filesystem cannot create a test link: ${error.code}`);
      return;
    }
    throw error;
  }
  assert.throws(() => createCanvasWorkspaceStore({ workspace: linkRoot }), /symbolic link|junction/i);
});

test("Canvas blocks path traversal and cross-tenant fields", async () => {
  const tenantRoot = createTenant({ tenantId: "isolated-tenant" });
  await withServer(tenantRoot, async (runtime) => {
    const traversal = await api(runtime, "/api/jobs", {
      method: "POST",
      body: jobInput("../../outside-job")
    });
    assert.equal(traversal.status, 400);
    assert.equal(traversal.body.error.code, "invalid_job_id");

    const encodedTraversal = await api(runtime, "/api/jobs/%2e%2e%2ftenant-config.json");
    assert.equal(encodedTraversal.status, 400);
    assert.equal(encodedTraversal.body.error.code, "invalid_job_id");

    const crossTenant = await api(runtime, "/api/jobs", {
      method: "POST",
      body: { ...jobInput("safe-job-001"), tenantId: "another-tenant" }
    });
    assert.equal(crossTenant.status, 400);
    assert.equal(crossTenant.body.error.code, "unknown_fields");
    assert.equal(fs.existsSync(path.join(path.dirname(tenantRoot), "outside-job")), false);
  });
});

test("Canvas requires readiness, same-origin and the mutation nonce", async () => {
  const tenantRoot = createTenant({ tenantId: "not-ready", ready: false });
  await withServer(tenantRoot, async (runtime) => {
    const wrongOrigin = await api(runtime, "/api/jobs", {
      method: "POST",
      body: jobInput("blocked-job-001"),
      origin: "https://example.invalid"
    });
    assert.equal(wrongOrigin.status, 403);
    assert.equal(wrongOrigin.body.error.code, "origin_rejected");

    const wrongNonce = await api(runtime, "/api/jobs", {
      method: "POST",
      body: jobInput("blocked-job-001"),
      nonce: "wrong"
    });
    assert.equal(wrongNonce.status, 403);
    assert.equal(wrongNonce.body.error.code, "nonce_rejected");

    const notReady = await api(runtime, "/api/jobs", {
      method: "POST",
      body: jobInput("blocked-job-001")
    });
    assert.equal(notReady.status, 409);
    assert.equal(notReady.body.error.code, "tenant_not_ready");
    assert.equal(fs.existsSync(path.join(tenantRoot, "operations", "jobs", "blocked-job-001")), false);
  });
});

test("Canvas creates one immutable W2 work order and rejects a duplicate", async () => {
  const tenantRoot = createTenant({ tenantId: "ready-tenant" });
  await withServer(tenantRoot, async (runtime) => {
    const created = await api(runtime, "/api/jobs", { method: "POST", body: jobInput() });
    assert.equal(created.status, 201);
    assert.equal(created.body.manifest.workflowId, "W2_content_factory");
    assert.equal(created.body.manifest.adapterMode, "coding_agent_handoff");
    assert.equal(created.body.manifest.mode, "draft_only");
    assert.equal(created.body.state.status, "ready_for_agent");
    assert.equal(created.body.handoff.mode, "manual_coding_agent");
    assert.equal(created.body.handoff.credentialInputRequested, false);
    assert.equal(created.body.handoff.automaticQueue, false);
    assert.equal(created.body.handoff.loginHandled, false);
    assert.match(created.body.handoff.prompt, /read AGENTS\.md/i);
    assert.match(created.body.handoff.prompt, /qualityGateStatus set to not_run/i);
    assert.match(created.body.handoff.prompt, /does not provide an automatic queue, login/i);
    assert.deepEqual(created.body.handoff.lifecycleCommands.map(({ id }) => id), ["claim", "independent_qa", "complete"]);
    assert.match(created.body.handoff.lifecycleCommands[0].command, /claim-growth-job\.mjs/);
    assert.match(created.body.handoff.lifecycleCommands[1].command, /review-growth-job\.mjs/);
    assert.match(created.body.handoff.lifecycleCommands[2].command, /complete-growth-job\.mjs/);
    assert.deepEqual(created.body.state.externalActionAuthority, {
      publish: false,
      send: false,
      schedule: false,
      createCampaign: false,
      uploadAudience: false,
      spend: false
    });

    const manifestPath = path.join(tenantRoot, "operations", "jobs", "launch-concept-001", "manifest.json");
    const originalManifest = fs.readFileSync(manifestPath, "utf8");
    assert.match(originalManifest, /cannot invoke a provider/);

    const duplicate = await api(runtime, "/api/jobs", { method: "POST", body: jobInput() });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, "duplicate_job");
    assert.equal(fs.readFileSync(manifestPath, "utf8"), originalManifest);

    const fetched = await api(runtime, "/api/jobs/launch-concept-001");
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.events.length, 1);
    assert.equal(fetched.body.events[0].eventType, "job.created");
  });
});

test("Bootstrap reads the nested experiment and derives manager-facing fallbacks", async () => {
  const tenantRoot = createTenant({ tenantId: "manager-view-tenant" });
  const experimentPath = path.join(tenantRoot, "campaigns", "experiment-brief.json");
  const experimentBrief = JSON.parse(fs.readFileSync(experimentPath, "utf8"));
  Object.assign(experimentBrief.experiment, {
    displayTitle: "First-value clarity campaign",
    displaySubtitle: "Help a new user understand the first useful step.",
    audienceSummary: "People evaluating a guided planning product",
    goalSummary: "Validate whether the first-value invitation is understood",
    channelsSummary: "Internal concept review only"
  });
  fs.writeFileSync(experimentPath, `${JSON.stringify(experimentBrief, null, 2)}\n`, "utf8");
  await withServer(tenantRoot, async (runtime) => {
    const initial = await api(runtime, "/api/bootstrap");
    assert.equal(initial.status, 200);
    assert.equal(initial.body.tenant.campaign.id, "manager-view-tenant_first_value_hypothesis");
    assert.equal(initial.body.tenant.campaign.hypothesis, "A specific evidence-bound invitation may clarify the first value more than generic AI wording.");
    assert.equal(initial.body.tenant.campaign.primaryMetric, "manager-view-tenant_approved_cta_click");
    assert.deepEqual(initial.body.tenant.campaign.formats, ["static"]);
    assert.equal(initial.body.tenant.campaign.destinationId, "manager-view-tenant_future_destination");
    assert.equal(initial.body.tenant.campaign.displayTitle, "First-value clarity campaign");
    assert.equal(initial.body.campaign.title, "First-value clarity campaign");
    assert.equal(initial.body.campaign.subtitle, "Help a new user understand the first useful step.");
    assert.equal(initial.body.campaign.audience, "People evaluating a guided planning product");
    assert.equal(initial.body.campaign.goal, "Validate whether the first-value invitation is understood");
    assert.equal(initial.body.campaign.channels, "Internal concept review only");
    assert.equal(initial.body.organization.name, "Sample Planning AI");
    assert.equal(initial.body.summary.tenantId, "manager-view-tenant");
    assert.equal(initial.body.summary.draftOnly, true);
    assert.equal(initial.body.quality.basis, "local_gate_completion_not_conversion_or_content_performance");
    assert.equal(initial.body.quality.scoreBasis, "local_gate_completion");
    assert.equal(initial.body.ownerDecisionBoundary, "procedural_local_user_action_not_authenticated");
    assert.equal(initial.body.workspace.ownerDecisionBoundary, "procedural_local_user_action_not_authenticated");
    assert.ok(initial.body.quality.gates.every((item) => ["passed", "pending", "blocked"].includes(item.state) && item.label && item.detail));
    assert.equal(initial.body.campaign.qualityScore, initial.body.quality.score);
    assert.ok(initial.body.checklist.length >= 4);
    assert.ok(initial.body.checklist.every((item) => item.id && item.label && item.detail && ["passed", "pending", "blocked"].includes(item.state)));
    assert.ok(initial.body.team.some((member) => member.id === "tenant-content-author"));
    assert.equal(initial.body.team.length, 4);
    assert.deepEqual(initial.body.team.map((member) => member.role), ["Quality reviewer", "Content studio", "Research specialist", "Workflow coordinator"]);
    assert.ok(initial.body.team.every((member) => member.time === "Ready"));
    assert.ok(initial.body.team.every((member) => member.state === "ready"));
    assert.equal(initial.body.workflow[0].id, "readiness");
    assert.equal(initial.body.workflow[0].state, "complete");
    assert.doesNotMatch(JSON.stringify(initial.body), /Aurora House|autumn-calm/i);

    const created = await api(runtime, "/api/jobs", { method: "POST", body: jobInput("manager-view-job") });
    assert.equal(created.status, 201);
    const withJob = await api(runtime, "/api/bootstrap");
    assert.equal(withJob.body.summary.activeJobId, "manager-view-job");
    assert.deepEqual(withJob.body.checklist.map(({ label }) => label), created.body.manifest.managerReview.checklist);
    assert.ok(withJob.body.checklist.every((item) => item.state === "pending"));
    assert.ok(withJob.body.team.some((member) => member.id === "content_studio"));
    assert.ok(withJob.body.team.some((member) => member.id === "brief_expander"));
    assert.equal(withJob.body.team.length, 4);
    assert.equal(withJob.body.team[0].role, "Content studio");
    assert.ok(withJob.body.team.some((member) => member.role === "Quality reviewer"));
    assert.ok(withJob.body.team.every((member) => ["ready", "working", "review_pending", "complete", "blocked"].includes(member.state)));
    assert.ok(withJob.body.quality.passed.includes("work_order"));
    assert.equal(withJob.body.currentTask.jobId, "manager-view-job");
    assert.equal(withJob.body.workflow.find((stage) => stage.id === "creation").state, "current");
    assert.equal(withJob.body.activity.length, 1);
  });
});

test("Private API requires the unguessable per-process Canvas access capability", async () => {
  const tenantRoot = createTenant({ tenantId: "capability-protected-tenant" });
  await withServer(tenantRoot, async (runtime) => {
    const missing = await api(runtime, "/api/bootstrap", { capability: "" });
    assert.equal(missing.status, 401);
    assert.equal(missing.body.error.code, "access_capability_rejected");
    assert.doesNotMatch(JSON.stringify(missing.body), /capability-protected-tenant/);

    const wrong = await api(runtime, "/api/jobs", { capability: "wrong-access-capability" });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error.code, "access_capability_rejected");

    const authorized = await api(runtime, "/api/bootstrap");
    assert.equal(authorized.status, 200);
    assert.equal(authorized.body.tenant.tenantId, "capability-protected-tenant");

    const unauthorizedMutation = await api(runtime, "/api/jobs", {
      method: "POST",
      body: jobInput("unauthorized-capability-job"),
      capability: "wrong-access-capability"
    });
    assert.equal(unauthorizedMutation.status, 401);
    assert.equal(unauthorizedMutation.body.error.code, "access_capability_rejected");
    assert.equal(fs.existsSync(path.join(tenantRoot, "operations", "jobs", "unauthorized-capability-job")), false);
  });
});

test("Tenant campaign parsing tolerates the legacy flat experiment shape", () => {
  const tenantRoot = createTenant({ tenantId: "legacy-campaign-tenant" });
  const experimentPath = path.join(tenantRoot, "campaigns", "experiment-brief.json");
  const brief = JSON.parse(fs.readFileSync(experimentPath, "utf8"));
  const flat = { ...brief, ...brief.experiment };
  delete flat.experiment;
  fs.writeFileSync(experimentPath, `${JSON.stringify(flat, null, 2)}\n`, "utf8");
  const store = createCanvasWorkspaceStore({ workspace: tenantRoot });
  const overview = store.tenantOverview();
  assert.equal(overview.campaign.id, "legacy-campaign-tenant_first_value_hypothesis");
  assert.equal(overview.campaign.primaryMetric, "legacy-campaign-tenant_approved_cta_click");
  assert.deepEqual(overview.campaign.formats, ["static"]);
  assert.equal(overview.campaign.destinationId, "legacy-campaign-tenant_future_destination");
});

test("Canvas detects a changed immutable manifest", async () => {
  const tenantRoot = createTenant({ tenantId: "integrity-tenant" });
  await withServer(tenantRoot, async (runtime) => {
    const created = await api(runtime, "/api/jobs", { method: "POST", body: jobInput("integrity-job-001") });
    assert.equal(created.status, 201);
    const manifestPath = path.join(tenantRoot, "operations", "jobs", "integrity-job-001", "manifest.json");
    fs.appendFileSync(manifestPath, " \n", "utf8");
    const fetched = await api(runtime, "/api/jobs/integrity-job-001");
    assert.equal(fetched.status, 409);
    assert.equal(fetched.body.error.code, "manifest_integrity_failure");
  });
});

test("Canvas exposes a manager-safe recovery command when the active claim lease expired", async () => {
  const tenantRoot = createTenant({ tenantId: "expired-handoff-tenant" });
  await withServer(tenantRoot, async (runtime) => {
    const jobId = "expired-handoff-job";
    assert.equal((await api(runtime, "/api/jobs", { method: "POST", body: jobInput(jobId) })).status, 201);
    claimGrowthJob({ workspace: tenantRoot, jobId, attemptId: "expired-handoff-old", leaseSeconds: 60, now: new Date("2020-01-01T00:00:00.000Z") });
    const artifactDirectory = path.join(tenantRoot, "operations", "jobs", jobId, "artifacts");
    fs.mkdirSync(artifactDirectory, { recursive: true });
    fs.writeFileSync(path.join(artifactDirectory, "unfinished.txt"), "unfinished expired work\n", "utf8");

    const expired = await api(runtime, `/api/jobs/${jobId}`);
    assert.equal(expired.status, 200);
    assert.equal(expired.body.state.status, "in_progress");
    assert.equal(expired.body.handoff.claimLease.status, "expired");
    assert.equal(expired.body.handoff.claimLease.attemptId, "expired-handoff-old");
    assert.equal(expired.body.handoff.leaseRecovery.available, true);
    assert.equal(expired.body.handoff.leaseRecovery.requiresDistinctAttemptId, true);
    assert.notEqual(expired.body.handoff.leaseRecovery.recommendedAttemptId, "expired-handoff-old");
    assert.match(expired.body.handoff.leaseRecovery.command, /claim-growth-job\.mjs/);
    assert.match(expired.body.handoff.nextAction, /prior lease expired/i);
    assert.doesNotMatch(JSON.stringify(expired.body.handoff), /provider_api_key|oauth_token/i);

    const freshAttemptId = expired.body.handoff.leaseRecovery.recommendedAttemptId;
    const reclaimed = claimGrowthJob({ workspace: tenantRoot, jobId, attemptId: freshAttemptId, leaseSeconds: 3600, now: new Date() });
    assert.equal(reclaimed.reclaimed, true);
    const after = await api(runtime, `/api/jobs/${jobId}`);
    assert.equal(after.status, 200);
    assert.equal(after.body.handoff.claimLease.status, "active");
    assert.equal(after.body.handoff.claimLease.attemptId, freshAttemptId);
    assert.equal(after.body.handoff.leaseRecovery.available, false);
    assert.equal(after.body.events.filter(({ eventType }) => eventType === "agent.expired_claim_reclaimed").length, 1);
    assert.equal(
      fs.readFileSync(path.join(tenantRoot, "operations", "jobs", jobId, "attempts", "expired-handoff-old", "artifacts", "unfinished.txt"), "utf8"),
      "unfinished expired work\n"
    );
  });
});

test("Local decision rejects identity claims and a state-only readiness tamper", async () => {
  const tenantRoot = createTenant({ tenantId: "owner-decision-tenant" });
  await withServer(tenantRoot, async (runtime) => {
    const created = await api(runtime, "/api/jobs", { method: "POST", body: jobInput("review-job-001") });
    assert.equal(created.status, 201);

    const earlyDecision = await api(runtime, "/api/jobs/review-job-001/owner-decision", {
      method: "POST",
      body: { decision: "accept", reason: "Looks ready." }
    });
    assert.equal(earlyDecision.status, 409);
    assert.equal(earlyDecision.body.error.code, "decision_not_ready");

    const identityClaim = await api(runtime, "/api/jobs/review-job-001/owner-decision", {
      method: "POST",
      body: { decision: "accept", reason: "The browser cannot assert an authenticated role.", actorRole: "owner" }
    });
    assert.equal(identityClaim.status, 400);
    assert.equal(identityClaim.body.error.code, "unknown_fields");

    const statePath = path.join(tenantRoot, "operations", "jobs", "review-job-001", "state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    state.stateVersion += 1;
    state.status = "awaiting_owner_decision";
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    const tamperedDecision = await api(runtime, "/api/jobs/review-job-001/decision", {
      method: "POST",
      body: { decision: "accept", reason: "A state edit cannot replace lifecycle evidence." }
    });
    assert.equal(tamperedDecision.status, 409);
    assert.equal(tamperedDecision.body.error.code, "decision_receipt_required");
  });
});

test("Verified lifecycle exposes a safe review bundle and binds the local decision to artifact hashes", async () => {
  const tenantRoot = createTenant({ tenantId: "verified-review-tenant" });
  const store = createCanvasWorkspaceStore({ workspace: tenantRoot });
  await withServer(tenantRoot, async (runtime) => {
    const jobId = "verified-review-job";
    assert.equal((await api(runtime, "/api/jobs", { method: "POST", body: jobInput(jobId) })).status, 201);
    const lifecycle = runReviewedLifecycle({
      tenantRoot,
      store,
      jobId,
      artifacts: [
        { name: "concept.json", content: `${JSON.stringify({ title: "Internal concept", action: "manager review" }, null, 2)}\n` },
        { name: "long-notes.txt", content: "x".repeat(33 * 1024) },
        { name: "visual.png", content: Buffer.from([0, 1, 2, 3, 255, 0, 128]) }
      ]
    });
    assert.equal(lifecycle.completed.job.state.status, "awaiting_owner_decision");
    assert.equal(lifecycle.receipt.qualityGateStatus, "not_run");

    const bundle = await api(runtime, `/api/jobs/${jobId}/review-bundle`);
    assert.equal(bundle.status, 200);
    assert.equal(bundle.body.readyForOwnerDecision, true);
    assert.equal(bundle.body.verification.receipt, "verified");
    assert.equal(bundle.body.verification.independentQa, "verified");
    assert.equal(bundle.body.verification.reviewerSeparation, "verified");
    assert.equal(bundle.body.verification.artifactIntegrity, "verified");
    assert.equal(bundle.body.receipt.qualityGateStatus, "not_run");
    assert.equal(bundle.body.qa.reviewerRole, "tenant-independent-qa");
    assert.equal(bundle.body.qa.subjectAgentRole, "content_studio");
    assert.equal(bundle.body.qa.verdict, "pass");
    assert.deepEqual(bundle.body.checklist, lifecycle.completed.job.manifest.managerReview.checklist);
    const previews = new Map(bundle.body.artifacts.map((artifact) => [path.basename(artifact.reference), artifact.preview]));
    assert.equal(previews.get("concept.json").status, "available");
    assert.match(previews.get("concept.json").content, /Internal concept/);
    assert.equal(previews.get("long-notes.txt").status, "refused_oversize");
    assert.equal(Object.hasOwn(previews.get("long-notes.txt"), "content"), false);
    assert.equal(previews.get("visual.png").status, "refused_binary");
    assert.equal(Object.hasOwn(previews.get("visual.png"), "content"), false);

    const accepted = await api(runtime, `/api/jobs/${jobId}/decision`, {
      method: "POST",
      body: { decision: "accept", reason: "The verified internal candidate meets the review checklist." }
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.state.status, "accepted_internal");
    assert.equal(accepted.body.state.ownerDecision.actorRole, "owner");
    const decisionEvent = accepted.body.events.at(-1);
    assert.equal(decisionEvent.eventType, "owner.decision_recorded");
    assert.equal(decisionEvent.payload.ownerDecisionBoundary, "procedural_local_user_action_not_authenticated");
    assert.equal(decisionEvent.payload.qaReviewerRole, "tenant-independent-qa");
    assert.deepEqual(decisionEvent.payload.artifactHashes, lifecycle.artifactBindings);

    const strictBundleAfterDecision = await api(runtime, `/api/jobs/${jobId}/review-bundle`);
    assert.equal(strictBundleAfterDecision.status, 409, "the decision endpoint keeps its awaiting-owner-only review gate");
    assert.equal(strictBundleAfterDecision.body.error.code, "decision_not_ready");

    const contentRecord = await api(runtime, `/api/jobs/${jobId}/content-record`);
    assert.equal(contentRecord.status, 200);
    assert.equal(contentRecord.body.recordStatus, "accepted_internal");
    assert.equal(contentRecord.body.review.readyForOwnerDecision, false);
    assert.equal(contentRecord.body.review.verification.artifactIntegrity, "verified");
    const contentPreviews = new Map(contentRecord.body.review.artifacts.map((artifact) => [path.basename(artifact.reference), artifact.preview]));
    assert.match(contentPreviews.get("concept.json").content, /Internal concept/);
    assert.equal(contentPreviews.get("long-notes.txt").status, "available", "the full Content workspace supports larger bounded text artifacts than the compact review card");
    assert.equal(contentPreviews.get("long-notes.txt").content.length, 33 * 1024);
    assert.equal(contentPreviews.get("visual.png").status, "refused_binary");
    assert.equal(contentRecord.body.versions.length, 1);
    assert.equal(contentRecord.body.versions[0].attemptId, lifecycle.attemptId);
    assert.equal(contentRecord.body.versions[0].ownerDecision, "accept");
    assert.equal(contentRecord.body.decisionHistory[0].reason, "The verified internal candidate meets the review checklist.");
  });
});

test("Content record keeps a revision-requested draft readable with its decision reason", async () => {
  const tenantRoot = createTenant({ tenantId: "revision-content-tenant" });
  const store = createCanvasWorkspaceStore({ workspace: tenantRoot });
  await withServer(tenantRoot, async (runtime) => {
    const jobId = "revision-content-job";
    assert.equal((await api(runtime, "/api/jobs", { method: "POST", body: jobInput(jobId) })).status, 201);
    runReviewedLifecycle({
      tenantRoot,
      store,
      jobId,
      artifacts: [{ name: "draft.json", content: `${JSON.stringify({ copy: { vi: { headline: "Bản cần sửa", body: "Nội dung đầy đủ" } } }, null, 2)}\n` }]
    });
    const revised = await api(runtime, `/api/jobs/${jobId}/decision`, {
      method: "POST",
      body: { decision: "revise", reason: "Làm rõ lợi ích trong câu mở đầu." }
    });
    assert.equal(revised.status, 200);
    assert.equal(revised.body.state.status, "revision_requested");

    const contentRecord = await api(runtime, `/api/jobs/${jobId}/content-record`);
    assert.equal(contentRecord.status, 200);
    assert.equal(contentRecord.body.recordStatus, "revision_requested");
    assert.equal(contentRecord.body.ownerDecision.decision, "revise");
    const draftArtifact = contentRecord.body.review.artifacts.find(({ reference }) => path.basename(reference) === "draft.json");
    assert.match(draftArtifact.preview.content, /Nội dung đầy đủ/);
    assert.equal(contentRecord.body.decisionHistory[0].decision, "revise");
  });
});

test("Content media preview serves only hash-verified, declared image and video artifacts", async () => {
  const tenantRoot = createTenant({ tenantId: "verified-media-preview-tenant" });
  const store = createCanvasWorkspaceStore({ workspace: tenantRoot });
  await withServer(tenantRoot, async (runtime) => {
    const jobId = "verified-media-preview-job";
    assert.equal((await api(runtime, "/api/jobs", { method: "POST", body: jobInput(jobId) })).status, 201);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/eewAAAAASUVORK5CYII=", "base64");
    const lifecycle = runReviewedLifecycle({
      tenantRoot,
      store,
      jobId,
      artifacts: [
        { name: "approved-visual.png", content: png },
        { name: "spoofed-visual.png", content: Buffer.from("not really a PNG", "utf8") }
      ]
    });

    const visualRef = lifecycle.references.find((reference) => reference.endsWith("approved-visual.png"));
    const spoofRef = lifecycle.references.find((reference) => reference.endsWith("spoofed-visual.png"));
    const preview = await apiMedia(runtime, `/api/jobs/${jobId}/media-preview?reference=${encodeURIComponent(visualRef)}`);
    assert.equal(preview.status, 200);
    assert.equal(preview.contentType, "image/png");
    assert.deepEqual(preview.body, png);
    assert.equal(preview.body.length, png.length);

    const unlisted = await apiMedia(runtime, `/api/jobs/${jobId}/media-preview?reference=${encodeURIComponent("content-drafts/not-in-the-reviewed-job.jpg")}`);
    assert.equal(unlisted.status, 404);
    assert.equal(unlisted.error.error.code, "media_artifact_not_found");

    const spoofed = await apiMedia(runtime, `/api/jobs/${jobId}/media-preview?reference=${encodeURIComponent(spoofRef)}`);
    assert.equal(spoofed.status, 415);
    assert.equal(spoofed.error.error.code, "media_signature_rejected");

    const unauthenticated = await apiMedia(runtime, `/api/jobs/${jobId}/media-preview?reference=${encodeURIComponent(visualRef)}`, { capability: "" });
    assert.equal(unauthenticated.status, 401);

    fs.appendFileSync(path.join(tenantRoot, visualRef), Buffer.from([0x00]));
    const tampered = await apiMedia(runtime, `/api/jobs/${jobId}/media-preview?reference=${encodeURIComponent(visualRef)}`);
    assert.equal(tampered.status, 409);
    assert.equal(tampered.error.error.code, "decision_lint_invalid");
  });
});

test("Local decision rejects post-QA artifact changes and an invalid QA reviewer", async () => {
  const tenantRoot = createTenant({ tenantId: "tamper-review-tenant" });
  const store = createCanvasWorkspaceStore({ workspace: tenantRoot });
  await withServer(tenantRoot, async (runtime) => {
    const artifactJobId = "artifact-tamper-job";
    assert.equal((await api(runtime, "/api/jobs", { method: "POST", body: jobInput(artifactJobId) })).status, 201);
    const artifactLifecycle = runReviewedLifecycle({
      tenantRoot,
      store,
      jobId: artifactJobId,
      artifacts: [{ name: "concept.json", content: `${JSON.stringify({ title: "Bound concept" })}\n` }]
    });
    fs.appendFileSync(path.join(tenantRoot, artifactLifecycle.references[0]), "tampered", "utf8");
    const changedBundle = await api(runtime, `/api/jobs/${artifactJobId}/review-bundle`);
    assert.equal(changedBundle.status, 409);
    assert.equal(changedBundle.body.error.code, "decision_lint_invalid");
    const changedDecision = await api(runtime, `/api/jobs/${artifactJobId}/decision`, {
      method: "POST",
      body: { decision: "accept", reason: "This must not accept changed evidence." }
    });
    assert.equal(changedDecision.status, 409);
    assert.equal(changedDecision.body.error.code, "decision_lint_invalid");
    assert.equal(store.readJob(artifactJobId).state.status, "awaiting_owner_decision");

    const reviewerJobId = "reviewer-tamper-job";
    assert.equal((await api(runtime, "/api/jobs", { method: "POST", body: jobInput(reviewerJobId) })).status, 201);
    runReviewedLifecycle({
      tenantRoot,
      store,
      jobId: reviewerJobId,
      artifacts: [{ name: "concept.json", content: `${JSON.stringify({ title: "Reviewed concept" })}\n` }]
    });
    const verdictPath = path.join(tenantRoot, "operations", "jobs", reviewerJobId, "qa-verdict.json");
    const verdict = JSON.parse(fs.readFileSync(verdictPath, "utf8"));
    verdict.reviewerRole = "content_studio";
    fs.writeFileSync(verdictPath, `${JSON.stringify(verdict, null, 2)}\n`, "utf8");
    const invalidReviewer = await api(runtime, `/api/jobs/${reviewerJobId}/decision`, {
      method: "POST",
      body: { decision: "accept", reason: "The lead cannot serve as its own independent reviewer." }
    });
    assert.equal(invalidReviewer.status, 409);
    assert.equal(invalidReviewer.body.error.code, "decision_reviewer_invalid");
  });
});

test("Review bundle refuses a persisted traversal reference without reading outside data", async () => {
  const tenantRoot = createTenant({ tenantId: "review-traversal-tenant" });
  const store = createCanvasWorkspaceStore({ workspace: tenantRoot });
  await withServer(tenantRoot, async (runtime) => {
    const jobId = "review-traversal-job";
    assert.equal((await api(runtime, "/api/jobs", { method: "POST", body: jobInput(jobId) })).status, 201);
    runReviewedLifecycle({
      tenantRoot,
      store,
      jobId,
      artifacts: [{ name: "concept.json", content: `${JSON.stringify({ title: "Safe concept" })}\n` }]
    });
    const outsidePath = path.join(path.dirname(tenantRoot), `${path.basename(tenantRoot)}-outside-secret.txt`);
    temporaryRoots.add(outsidePath);
    fs.writeFileSync(outsidePath, "outside-secret-must-not-be-read", "utf8");
    const receiptPath = path.join(tenantRoot, "operations", "jobs", jobId, "run-receipt.json");
    const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
    receipt.artifactReferences = ["../outside-secret.txt"];
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    const response = await api(runtime, `/api/jobs/${jobId}/review-bundle`);
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, "invalid_run_receipt");
    assert.doesNotMatch(JSON.stringify(response.body), /outside-secret-must-not-be-read/);
  });
});

test("One loopback server safely serves the built UI and JSON API", async () => {
  const tenantRoot = createTenant({ tenantId: "static-ui-tenant" });
  const container = fs.mkdtempSync(path.join(os.tmpdir(), "growth-canvas-static-"));
  temporaryRoots.add(container);
  const staticRoot = path.join(container, "client");
  fs.mkdirSync(path.join(staticRoot, "assets"), { recursive: true });
  fs.writeFileSync(path.join(staticRoot, "index.html"), "<!doctype html><title>Local Canvas</title><main id=\"root\"></main>", "utf8");
  fs.writeFileSync(path.join(staticRoot, "assets", "app.js"), "globalThis.canvasLoaded = true;", "utf8");
  fs.writeFileSync(path.join(container, "secret.txt"), "must-not-be-served", "utf8");

  await withServer(tenantRoot, async (runtime) => {
    const indexResponse = await fetch(`${runtime.baseUrl}/`, { headers: { Accept: "text/html" } });
    assert.equal(indexResponse.status, 200);
    assert.match(indexResponse.headers.get("content-type"), /^text\/html/);
    assert.match(indexResponse.headers.get("content-security-policy"), /connect-src 'self'/);
    assert.match(await indexResponse.text(), /Local Canvas/);

    const assetResponse = await fetch(`${runtime.baseUrl}/assets/app.js`);
    assert.equal(assetResponse.status, 200);
    assert.match(assetResponse.headers.get("content-type"), /^text\/javascript/);
    assert.match(await assetResponse.text(), /canvasLoaded/);

    const clientRoute = await fetch(`${runtime.baseUrl}/campaign/review`, { headers: { Accept: "text/html" } });
    assert.equal(clientRoute.status, 200);
    assert.match(await clientRoute.text(), /Local Canvas/);

    const apiHealth = await api(runtime, "/api/health");
    assert.equal(apiHealth.status, 200);
    assert.equal(apiHealth.body.service, "growth-canvas-local-control");
    const unknownApi = await api(runtime, "/api/not-a-client-route");
    assert.equal(unknownApi.status, 404);
    assert.equal(unknownApi.body.error.code, "endpoint_not_found");

    const traversal = await fetch(`${runtime.baseUrl}/%2e%2e%2fsecret.txt`, { headers: { Accept: "text/plain" } });
    assert.equal(traversal.status, 400);
    assert.doesNotMatch(await traversal.text(), /must-not-be-served/);
  }, { staticRoot });
});

test("Owner cancellation is atomic and appended to the event history", async () => {
  const tenantRoot = createTenant({ tenantId: "cancel-tenant" });
  await withServer(tenantRoot, async (runtime) => {
    const created = await api(runtime, "/api/jobs", { method: "POST", body: jobInput("cancel-job-001") });
    assert.equal(created.status, 201);

    const identityClaim = await api(runtime, "/api/jobs/cancel-job-001/cancel", {
      method: "POST",
      body: { reason: "The browser may not claim an authenticated role.", actorRole: "owner" }
    });
    assert.equal(identityClaim.status, 400);
    assert.equal(identityClaim.body.error.code, "unknown_fields");

    const cancelled = await api(runtime, "/api/jobs/cancel-job-001/cancel", {
      method: "POST",
      body: { reason: "The local user stopped this internal draft before execution." }
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.state.status, "cancelled");
    assert.equal(cancelled.body.state.cancellation.actorRole, "owner");
    assert.deepEqual(cancelled.body.events.map((event) => event.eventType), ["job.created", "job.cancelled"]);
    assert.equal(cancelled.body.events[1].previousEventHash, cancelled.body.events[0].eventHash);
    assert.equal(cancelled.body.events[1].payload.ownerDecisionBoundary, "procedural_local_user_action_not_authenticated");
  });
});

test("Cross-process mutations serialize state CAS and append exactly one terminal event", async () => {
  const tenantRoot = createTenant({ tenantId: "concurrent-mutation-tenant" });
  const store = createCanvasWorkspaceStore({ workspace: tenantRoot });
  const jobId = "concurrent-cancel-job";
  store.createW2Job(jobInput(jobId));

  const outcomes = await Promise.all([
    runMutationChild({ tenantRoot, jobId, reason: "Concurrent local cancellation A." }),
    runMutationChild({ tenantRoot, jobId, reason: "Concurrent local cancellation B." })
  ]);
  assert.deepEqual(outcomes.map(({ outcome }) => outcome).sort(), ["cancelled", "terminal_rejected"]);
  const finalJob = store.readJob(jobId, { includeEvents: true });
  assert.equal(finalJob.state.status, "cancelled");
  assert.equal(finalJob.state.stateVersion, 2);
  assert.deepEqual(finalJob.events.map(({ eventType }) => eventType), ["job.created", "job.cancelled"]);
  assert.equal(finalJob.events[1].previousEventHash, finalJob.events[0].eventHash);

  const staleJobId = "stale-lock-job";
  store.createW2Job(jobInput(staleJobId));
  const lockDirectory = path.join(tenantRoot, "operations", "jobs", staleJobId, ".growth-job.lock");
  fs.mkdirSync(lockDirectory);
  fs.writeFileSync(path.join(lockDirectory, "owner.json"), `${JSON.stringify({
    schemaVersion: "1.0.0",
    token: "stale-lock-token",
    pid: 2147483647,
    hostname: os.hostname(),
    acquiredAt: new Date(Date.now() - 5_000).toISOString()
  }, null, 2)}\n`, "utf8");
  const lockedResult = withJobLock({ workspace: tenantRoot, jobId: staleJobId, timeoutMs: 500, staleMs: 1_000 }, () => "recovered");
  assert.equal(lockedResult, "recovered");
  assert.equal(fs.existsSync(lockDirectory), false);
});

test("Canvas exposes no route or authority for publishing, sending or spend", async () => {
  const tenantRoot = createTenant({ tenantId: "draft-only-tenant" });
  await withServer(tenantRoot, async (runtime) => {
    const bootstrap = await api(runtime, "/api/bootstrap");
    assert.equal(bootstrap.status, 200);
    assert.equal(bootstrap.body.runtimeCapabilities.defaultHandoffMode, "manual_coding_agent");
    assert.equal(bootstrap.body.runtimeCapabilities.codingAgent.credentialsInspected, false);
    assert.equal(bootstrap.body.runtimeCapabilities.codingAgent.unattendedExecutionEnabled, false);
    assert.equal(bootstrap.body.runtimeCapabilities.credentialPolicy.customerProviderCredential, "not_requested");
    assert.deepEqual(bootstrap.body.runtimeCapabilities.externalActionAuthority, {
      publish: false,
      send: false,
      schedule: false,
      createCampaign: false,
      uploadAudience: false,
      spend: false
    });

    const publish = await api(runtime, "/api/publish", {
      method: "POST",
      body: { jobId: "anything", actorRole: "owner" }
    });
    assert.equal(publish.status, 404);
    assert.equal(publish.body.error.code, "endpoint_not_found");

    const injectedAction = await api(runtime, "/api/jobs", {
      method: "POST",
      body: { ...jobInput("no-external-job"), publish: true, spend: 100 }
    });
    assert.equal(injectedAction.status, 400);
    assert.equal(injectedAction.body.error.code, "unknown_fields");

    const receiptJob = await api(runtime, "/api/jobs", {
      method: "POST",
      body: jobInput("receipt-boundary-job")
    });
    assert.equal(receiptJob.status, 201);
    const receiptPath = path.join(tenantRoot, "operations", "jobs", "receipt-boundary-job", "run-receipt.json");
    const receipt = {
      schemaVersion: "1.0.0",
      jobId: "receipt-boundary-job",
      tenantId: "draft-only-tenant",
      workflowId: "W2_content_factory",
      attemptId: "attempt-001",
      agentRole: "content_studio",
      outcome: "completed_for_review",
      startedAt: "2026-09-23T01:00:00.000Z",
      finishedAt: "2026-09-23T01:05:00.000Z",
      artifactReferences: ["content-drafts/asset-001.json"],
      qualityGateStatus: "not_run",
      handoffMode: "manual_coding_agent",
      externalActionAuthority: {
        publish: true,
        send: false,
        schedule: false,
        createCampaign: false,
        uploadAudience: false,
        spend: false
      }
    };
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    const unsafeReceipt = await api(runtime, "/api/jobs/receipt-boundary-job");
    assert.equal(unsafeReceipt.status, 409);
    assert.equal(unsafeReceipt.body.error.code, "external_authority_rejected");

    receipt.externalActionAuthority.publish = false;
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    const safeReceipt = await api(runtime, "/api/jobs/receipt-boundary-job");
    assert.equal(safeReceipt.status, 200);
    assert.equal(safeReceipt.body.receipt.outcome, "completed_for_review");
  });
});
