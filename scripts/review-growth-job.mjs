import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createCanvasWorkspaceStore,
  externalActionAuthority,
  withJobLock
} from "../packages/growth-canvas/server/workspace-store.mjs";
import {
  assertSafeWorkspace,
  isSameOrInside
} from "../packages/growth-canvas/server/security.mjs";
import {
  computeGrowthJobArtifactLint,
  deterministicLintFileName,
  hashDeterministicLintReceipt,
  verifyGrowthJobArtifactLint
} from "../packages/growth-core/job-artifact-lint.mjs";
import { readGrowthJobClaim } from "./claim-growth-job.mjs";

const modulePath = fileURLToPath(import.meta.url);
const frameworkRoot = path.resolve(path.dirname(modulePath), "..");
const qualityGates = JSON.parse(fs.readFileSync(path.join(frameworkRoot, "packages", "growth-core", "config", "quality-gates.json"), "utf8"));
const softDimensions = qualityGates.softDimensions;
const hardFailCodes = new Set(qualityGates.hardFailCodes);
const threshold = qualityGates.internalLibraryThreshold;
const hashPattern = /^sha256:[a-f0-9]{64}$/;
const artifactReferencePattern = /^(?![A-Za-z]:)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const secretLikePattern = /(?:provider_api_key|oauth_token|subscription_token|authorization\s*:\s*bearer|\bsk-[a-z0-9_-]{12,})/i;
const verdictKeys = ["schemaVersion", "jobId", "tenantId", "workflowId", "attemptId", "reviewerRole", "reviewerCapability", "subjectAgentRole", "reviewedAt", "verdict", "deterministicLintStatus", "artifactBindings", "hardFailureCodes", "softScores", "provenanceComplete", "rubricVersion", "notes", "handoffMode", "externalActionAuthority"];

const valueFor = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
};

const sha256 = (value) => `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
const canonicalJson = (value) => JSON.stringify(value);

const readRegularJson = (filePath) => {
  const entry = fs.lstatSync(filePath);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`Unsafe JSON record: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
};

const writeExclusiveJson = (filePath, value) => {
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
};

const assertRegularFileInsideWorkspace = (workspace, candidate, label) => {
  const safeWorkspace = assertSafeWorkspace(workspace);
  const resolved = path.resolve(candidate);
  if (!isSameOrInside(resolved, safeWorkspace) || resolved === safeWorkspace) throw new Error(`${label} must remain inside the private tenant workspace.`);
  const relative = path.relative(safeWorkspace, resolved);
  let current = safeWorkspace;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const entry = fs.lstatSync(current);
    if (entry.isSymbolicLink()) throw new Error(`${label} may not traverse a symbolic link or junction.`);
  }
  const entry = fs.lstatSync(resolved);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`${label} must be a regular file.`);
  const physical = fs.realpathSync.native(resolved);
  if (!isSameOrInside(physical, fs.realpathSync.native(safeWorkspace))) throw new Error(`${label} escapes the private tenant workspace.`);
  return physical;
};

const readVerdictInput = ({ workspace, verdict, verdictPath }) => {
  if (verdict !== undefined && verdictPath !== undefined) throw new Error("Provide a QA verdict object or verdict path, not both.");
  if (verdict !== undefined) return structuredClone(verdict);
  if (!verdictPath) throw new Error("An independent QA verdict is required.");
  return readRegularJson(assertRegularFileInsideWorkspace(workspace, verdictPath, "QA verdict input"));
};

const assertExternalActionAuthority = (authority) => {
  const expectedKeys = Object.keys(externalActionAuthority);
  if (!authority || typeof authority !== "object" || Array.isArray(authority) || Object.keys(authority).length !== expectedKeys.length || expectedKeys.some((key) => authority[key] !== false)) {
    throw new Error("Independent QA may not grant publishing, delivery, campaign, audience, or spend authority.");
  }
};

export const computeGrowthJobArtifactBindings = ({ workspace, references }) => {
  if (!Array.isArray(references) || references.length === 0 || new Set(references).size !== references.length) {
    throw new Error("Independent QA requires at least one unique artifact reference.");
  }
  return [...references].sort().map((reference) => {
    if (typeof reference !== "string" || reference.includes("\\") || !artifactReferencePattern.test(reference)) throw new Error("Independent QA contains an unsafe artifact reference.");
    const candidate = path.resolve(workspace, ...reference.split("/"));
    const filePath = assertRegularFileInsideWorkspace(workspace, candidate, `Artifact ${reference}`);
    const content = fs.readFileSync(filePath);
    return { reference, hash: sha256(content), bytes: content.length };
  });
};

const validateVerdict = ({ verdict, job, claim, roleMappings }) => {
  if (!verdict || typeof verdict !== "object" || Array.isArray(verdict)) throw new Error("Independent QA verdict must be a JSON object.");
  const unknownKeys = Object.keys(verdict).filter((key) => !verdictKeys.includes(key));
  const missingKeys = verdictKeys.filter((key) => !(key in verdict));
  if (unknownKeys.length > 0 || missingKeys.length > 0) throw new Error(`Independent QA verdict shape is invalid${unknownKeys.length ? `; unsupported fields: ${unknownKeys.join(", ")}` : ""}${missingKeys.length ? `; missing fields: ${missingKeys.join(", ")}` : ""}.`);
  if (verdict.schemaVersion !== "1.0.0" || verdict.rubricVersion !== "growth_core_1") throw new Error("Independent QA verdict version is invalid.");
  if (verdict.jobId !== job.manifest.jobId || verdict.tenantId !== job.manifest.tenantId || verdict.workflowId !== job.manifest.workflowId || verdict.attemptId !== claim.attemptId) {
    throw new Error("Independent QA verdict is not bound to the active work order and claim attempt.");
  }
  const mappedReviewerRole = roleMappings?.quality_assurance;
  if (typeof mappedReviewerRole !== "string" || mappedReviewerRole.trim() === "") throw new Error("Tenant role mapping must assign quality_assurance before independent QA.");
  if (verdict.reviewerCapability !== "quality_assurance" || verdict.reviewerRole !== mappedReviewerRole) throw new Error("Independent QA reviewer must match the tenant quality_assurance role mapping.");
  if (verdict.subjectAgentRole !== claim.agentRole || verdict.subjectAgentRole !== job.manifest.assignedAgentRole) throw new Error("Independent QA subject role must match the claimed lead-agent role.");
  if (verdict.reviewerRole === verdict.subjectAgentRole) throw new Error("Independent QA reviewer must differ from the work-order lead agent.");
  if (!["pass", "revise", "block"].includes(verdict.verdict) || !["passed", "repair_required", "blocked"].includes(verdict.deterministicLintStatus)) throw new Error("Independent QA verdict or deterministic lint status is invalid.");
  if (verdict.handoffMode !== "manual_coding_agent") throw new Error("Independent QA verdict must retain the manual Coding Agent handoff mode.");
  if (typeof verdict.notes !== "string" || verdict.notes.trim() === "" || verdict.notes.length > 4000) throw new Error("Independent QA notes are required and must be at most 4000 characters.");
  if (typeof verdict.provenanceComplete !== "boolean") throw new Error("Independent QA provenanceComplete must be boolean.");
  assertExternalActionAuthority(verdict.externalActionAuthority);
  if (secretLikePattern.test(JSON.stringify(verdict))) throw new Error("Independent QA verdict may not contain provider or subscription credentials.");

  const reviewedAt = Date.parse(verdict.reviewedAt);
  if (!Number.isFinite(reviewedAt) || reviewedAt < Date.parse(claim.claimedAt) || reviewedAt > Date.parse(claim.leaseExpiresAt)) throw new Error("Independent QA review must occur inside the active claim lease.");
  if (!Array.isArray(verdict.hardFailureCodes) || new Set(verdict.hardFailureCodes).size !== verdict.hardFailureCodes.length || verdict.hardFailureCodes.some((code) => !hardFailCodes.has(code))) throw new Error("Independent QA hardFailureCodes are invalid.");
  if (!verdict.softScores || typeof verdict.softScores !== "object" || Array.isArray(verdict.softScores) || Object.keys(verdict.softScores).length !== softDimensions.length || softDimensions.some((dimension) => !Number.isInteger(verdict.softScores[dimension]) || verdict.softScores[dimension] < 1 || verdict.softScores[dimension] > 5)) {
    throw new Error("Independent QA softScores must contain every quality dimension with a score from 1 to 5.");
  }

  if (!Array.isArray(verdict.artifactBindings) || verdict.artifactBindings.length === 0) throw new Error("Independent QA must bind at least one artifact.");
  const references = verdict.artifactBindings.map((binding) => binding?.reference);
  if (new Set(references).size !== references.length || verdict.artifactBindings.some((binding) => !binding || typeof binding !== "object" || Object.keys(binding).length !== 3 || !hashPattern.test(binding.hash || "") || !Number.isInteger(binding.bytes) || binding.bytes < 0)) {
    throw new Error("Independent QA artifact bindings are invalid.");
  }
  const actualBindings = computeGrowthJobArtifactBindings({ workspace: job.workspace || job.handoff?.workspace || "", references });
  const declaredByReference = new Map(verdict.artifactBindings.map((binding) => [binding.reference, binding]));
  for (const actual of actualBindings) {
    const declared = declaredByReference.get(actual.reference);
    if (!declared || declared.hash !== actual.hash || declared.bytes !== actual.bytes) throw new Error(`Independent QA artifact binding is stale or incorrect: ${actual.reference}.`);
  }

  const scores = softDimensions.map((dimension) => verdict.softScores[dimension]);
  const meanScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  if (verdict.verdict === "pass") {
    if (verdict.deterministicLintStatus !== "passed" || verdict.hardFailureCodes.length !== 0 || verdict.provenanceComplete !== true || Math.min(...scores) < threshold.minimumDimensionScore || meanScore < threshold.minimumMeanScore) {
      throw new Error("A passing independent QA verdict must satisfy deterministic lint, zero hard failures, provenance, and every configured soft-score threshold.");
    }
  }
  if (verdict.verdict === "revise" && verdict.deterministicLintStatus !== "repair_required") throw new Error("A revise verdict requires deterministicLintStatus repair_required.");
  if (verdict.verdict === "block" && verdict.deterministicLintStatus !== "blocked") throw new Error("A block verdict requires deterministicLintStatus blocked.");

  return { ...verdict, artifactBindings: actualBindings };
};

const jobWithWorkspace = (store, job) => ({ ...job, workspace: store.workspace });

const computeVerifiedLint = ({ store, job, claim, verdict }) => {
  const receipt = computeGrowthJobArtifactLint({
    workspace: store.workspace,
    manifest: job.manifest,
    attemptId: claim.attemptId,
    references: verdict.artifactBindings.map((binding) => binding.reference),
    evaluatedAt: verdict.reviewedAt
  });
  if (JSON.stringify(receipt.artifactBindings) !== JSON.stringify(verdict.artifactBindings)) {
    throw new Error("Deterministic lint artifact bindings differ from the independent QA verdict.");
  }
  if (verdict.verdict === "pass" && (receipt.status !== "passed" || receipt.hardFailureCodes.length > 0)) {
    throw new Error(`A passing independent QA verdict requires a framework-computed deterministic lint pass${receipt.errors.length ? `: ${receipt.errors[0]}` : "."}`);
  }
  return receipt;
};

const readAndVerifyLint = ({ store, job, claim, verdict }) => {
  const lintPath = path.join(store.jobDirectory(job.manifest.jobId), deterministicLintFileName);
  const receipt = readRegularJson(lintPath);
  const verified = verifyGrowthJobArtifactLint({
    workspace: store.workspace,
    manifest: job.manifest,
    attemptId: claim.attemptId,
    references: verdict.artifactBindings.map((binding) => binding.reference),
    receipt
  });
  if (JSON.stringify(verified.artifactBindings) !== JSON.stringify(verdict.artifactBindings)) {
    throw new Error("Deterministic lint receipt is not bound to the independent QA artifact hashes.");
  }
  if (verdict.verdict === "pass" && (verified.status !== "passed" || verified.hardFailureCodes.length > 0)) {
    throw new Error("A passing independent QA verdict is not backed by a clean deterministic lint receipt.");
  }
  return { lintPath, lintReceipt: verified, lintReceiptHash: hashDeterministicLintReceipt(verified) };
};

export const verifyGrowthJobQaVerdict = ({ workspace, jobId, allowedStatuses = ["in_progress", "awaiting_owner_decision"] }) => {
  const store = createCanvasWorkspaceStore({ workspace });
  const job = store.readJob(jobId);
  if (!allowedStatuses.includes(job.state.status)) throw new Error(`Independent QA verdict cannot be used while job status is ${job.state.status}.`);
  const claim = readGrowthJobClaim({ workspace: store.workspace, jobId });
  const verdictPath = path.join(store.jobDirectory(jobId), "qa-verdict.json");
  const verdict = validateVerdict({ verdict: readRegularJson(verdictPath), job: jobWithWorkspace(store, job), claim, roleMappings: store.tenantOverview().roleMappings });
  const lint = readAndVerifyLint({ store, job, claim, verdict });
  return { store, job, claim, verdict, verdictPath, verdictHash: sha256(canonicalJson(verdict)), ...lint };
};

export const readGrowthJobQaVerdict = ({ workspace, jobId }) => verifyGrowthJobQaVerdict({ workspace, jobId }).verdict;

const reviewGrowthJobUnlocked = ({ workspace, jobId, verdict, verdictPath }) => {
  const store = createCanvasWorkspaceStore({ workspace });
  const current = store.readJob(jobId);
  if (current.state.status !== "in_progress") throw new Error(`Independent QA can write a verdict only while job ${jobId} is in_progress.`);
  const claim = readGrowthJobClaim({ workspace: store.workspace, jobId });
  if (Date.now() > Date.parse(claim.leaseExpiresAt)) throw new Error(`Independent QA cannot use the expired claim lease for job ${jobId}.`);
  const normalizedVerdict = validateVerdict({ verdict: readVerdictInput({ workspace: store.workspace, verdict, verdictPath }), job: jobWithWorkspace(store, current), claim, roleMappings: store.tenantOverview().roleMappings });
  const outputPath = path.join(store.jobDirectory(jobId), "qa-verdict.json");
  const lintPath = path.join(store.jobDirectory(jobId), deterministicLintFileName);
  if (fs.existsSync(outputPath)) {
    const existing = validateVerdict({ verdict: readRegularJson(outputPath), job: jobWithWorkspace(store, current), claim, roleMappings: store.tenantOverview().roleMappings });
    if (canonicalJson(existing) !== canonicalJson(normalizedVerdict)) throw new Error(`Job ${jobId} already has a different independent QA verdict for attempt ${claim.attemptId}.`);
    const lint = readAndVerifyLint({ store, job: current, claim, verdict: existing });
    const verdictHash = sha256(canonicalJson(existing));
    const currentWithEvents = store.readJob(jobId, { includeEvents: true });
    const hasAuditEvent = currentWithEvents.events.some((event) => event.eventType === "qa.verdict_recorded" && event.payload?.attemptId === claim.attemptId && event.payload?.verdictHash === verdictHash);
    const auditedJob = hasAuditEvent ? currentWithEvents : store.updateState(
      jobId,
      (state) => {
        if (state.status !== "in_progress") throw new Error(`Independent QA can write a verdict only while job ${jobId} is in_progress.`);
        return state;
      },
      {
        eventType: "qa.verdict_recorded",
        actorRole: existing.reviewerRole,
        payload: (state) => ({ status: state.status, attemptId: claim.attemptId, verdict: existing.verdict, reviewerCapability: existing.reviewerCapability, verdictHash, deterministicLintReceiptHash: lint.lintReceiptHash, artifactCount: existing.artifactBindings.length, externalActionAuthority })
      }
    );
    return { job: auditedJob, claim, verdict: existing, verdictPath: outputPath, verdictHash, ...lint, idempotent: true };
  }
  let lintReceipt = computeVerifiedLint({ store, job: current, claim, verdict: normalizedVerdict });
  if (fs.existsSync(lintPath)) {
    const recovered = readAndVerifyLint({ store, job: current, claim, verdict: normalizedVerdict });
    if (canonicalJson(recovered.lintReceipt) !== canonicalJson(lintReceipt)) throw new Error(`Job ${jobId} already has a different deterministic lint receipt for attempt ${claim.attemptId}.`);
    lintReceipt = recovered.lintReceipt;
  } else {
    writeExclusiveJson(lintPath, lintReceipt);
  }
  writeExclusiveJson(outputPath, normalizedVerdict);
  const lintReceiptHash = hashDeterministicLintReceipt(lintReceipt);
  const reviewedJob = store.updateState(
    jobId,
    (state) => {
      if (state.status !== "in_progress") throw new Error(`Independent QA can write a verdict only while job ${jobId} is in_progress.`);
      return state;
    },
    {
      eventType: "qa.verdict_recorded",
      actorRole: normalizedVerdict.reviewerRole,
      payload: (state) => ({ status: state.status, attemptId: claim.attemptId, verdict: normalizedVerdict.verdict, reviewerCapability: normalizedVerdict.reviewerCapability, verdictHash: sha256(canonicalJson(normalizedVerdict)), deterministicLintReceiptHash: lintReceiptHash, artifactCount: normalizedVerdict.artifactBindings.length, externalActionAuthority })
    }
  );
  return { job: reviewedJob, claim, verdict: normalizedVerdict, verdictPath: outputPath, verdictHash: sha256(canonicalJson(normalizedVerdict)), lintPath, lintReceipt, lintReceiptHash, idempotent: false };
};

export const reviewGrowthJob = (options) => withJobLock(
  { workspace: options.workspace, jobId: options.jobId },
  () => reviewGrowthJobUnlocked(options)
);

const runAsCli = () => {
  const workspace = valueFor("--workspace") || process.env.GROWTH_CANVAS_WORKSPACE;
  const jobId = valueFor("--job-id");
  const verdictPath = valueFor("--verdict");
  if (!workspace || !jobId || !verdictPath) {
    console.error("Use --workspace <private-tenant-directory> --job-id <job-id> --verdict <tenant-scoped-independent-qa-verdict.json>.");
    process.exit(1);
  }
  try {
    const result = reviewGrowthJob({ workspace, jobId, verdictPath });
    console.log(JSON.stringify({ jobId, attemptId: result.claim.attemptId, verdict: result.verdict.verdict, reviewerRole: result.verdict.reviewerRole, artifactCount: result.verdict.artifactBindings.length, idempotent: result.idempotent }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
};

if (path.resolve(process.argv[1] || "") === path.resolve(modulePath)) runAsCli();
