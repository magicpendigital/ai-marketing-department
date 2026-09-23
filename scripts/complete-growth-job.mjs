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
import { readGrowthJobClaim } from "./claim-growth-job.mjs";
import { verifyGrowthJobQaVerdict } from "./review-growth-job.mjs";

const modulePath = fileURLToPath(import.meta.url);
const safeIdPattern = /^[a-z][a-z0-9-]{2,79}$/;
const artifactReferencePattern = /^(?![A-Za-z]:)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const secretLikePattern = /(?:provider_api_key|oauth_token|subscription_token|authorization\s*:\s*bearer|\bsk-[a-z0-9_-]{12,})/i;
const receiptKeys = ["schemaVersion", "jobId", "tenantId", "workflowId", "attemptId", "agentRole", "outcome", "startedAt", "finishedAt", "artifactReferences", "qualityGateStatus", "handoffMode", "notes", "externalActionAuthority"];

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
  if (!isSameOrInside(resolved, safeWorkspace) || resolved === safeWorkspace) {
    throw new Error(`${label} must remain inside the private tenant workspace.`);
  }
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
  const physicalWorkspace = fs.realpathSync.native(safeWorkspace);
  if (!isSameOrInside(physical, physicalWorkspace)) throw new Error(`${label} escapes the private tenant workspace.`);
  return physical;
};

const readReceiptInput = ({ workspace, receipt, receiptPath }) => {
  if (receipt !== undefined && receiptPath !== undefined) throw new Error("Provide a receipt object or receipt path, not both.");
  if (receipt !== undefined) return structuredClone(receipt);
  if (!receiptPath) throw new Error("An agent run receipt is required.");
  return readRegularJson(assertRegularFileInsideWorkspace(workspace, receiptPath, "Receipt input"));
};

const assertExternalActionAuthority = (authority) => {
  if (!authority || typeof authority !== "object" || Array.isArray(authority)) throw new Error("Receipt externalActionAuthority is required.");
  const expectedKeys = Object.keys(externalActionAuthority);
  if (Object.keys(authority).length !== expectedKeys.length || expectedKeys.some((key) => authority[key] !== false)) {
    throw new Error("Agent receipt may not grant publishing, delivery, campaign, audience, or spend authority.");
  }
};

const completionFromQaVerdict = (receipt, qaVerdict) => {
  const expected = {
    pass: { outcome: "completed_for_review", status: "awaiting_owner_decision" },
    revise: { outcome: "revision_required", status: "revision_requested" },
    block: { outcome: "blocked", status: "blocked" }
  }[qaVerdict.verdict];
  if (!expected || receipt.outcome !== expected.outcome) throw new Error(`Lead-agent outcome must match the independent QA verdict ${qaVerdict.verdict}.`);
  if (receipt.qualityGateStatus !== "not_run") throw new Error("Lead-agent receipt cannot self-attest independent QA; qualityGateStatus must remain not_run.");
  const receiptReferences = [...receipt.artifactReferences].sort();
  const qaReferences = qaVerdict.artifactBindings.map(({ reference }) => reference).sort();
  if (canonicalJson(receiptReferences) !== canonicalJson(qaReferences)) throw new Error("Lead-agent receipt artifacts must exactly match the independently reviewed artifact bindings.");
  return expected.status;
};

const validateReceipt = ({ receipt, job, claim }) => {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) throw new Error("Agent run receipt must be a JSON object.");
  const unknownKeys = Object.keys(receipt).filter((key) => !receiptKeys.includes(key));
  const requiredKeys = receiptKeys.filter((key) => key !== "notes");
  const missingKeys = requiredKeys.filter((key) => !(key in receipt));
  if (unknownKeys.length > 0) throw new Error(`Agent run receipt contains unsupported fields: ${unknownKeys.join(", ")}. Agents cannot write an owner decision.`);
  if (missingKeys.length > 0) throw new Error(`Agent run receipt is missing required fields: ${missingKeys.join(", ")}.`);
  if (receipt.schemaVersion !== "1.0.0") throw new Error("Agent run receipt schemaVersion must be 1.0.0.");
  if (receipt.jobId !== job.manifest.jobId || receipt.tenantId !== job.manifest.tenantId || receipt.workflowId !== job.manifest.workflowId) {
    throw new Error("Agent run receipt identity does not match the immutable work order.");
  }
  if (!safeIdPattern.test(receipt.attemptId || "") || receipt.attemptId !== claim.attemptId) throw new Error("Agent run receipt attempt does not match the active claim.");
  if (receipt.agentRole !== claim.agentRole || receipt.agentRole !== job.manifest.assignedAgentRole) throw new Error("Agent run receipt role does not match the claimed role.");
  if (receipt.handoffMode !== "manual_coding_agent") throw new Error("Agent run receipt must retain the manual Coding Agent handoff mode.");
  if (!["completed_for_review", "revision_required", "blocked"].includes(receipt.outcome)) throw new Error("Lead-agent completion outcome must be completed_for_review, revision_required, or blocked.");
  if (receipt.qualityGateStatus !== "not_run") throw new Error("Lead-agent receipt cannot self-attest independent QA; qualityGateStatus must remain not_run.");
  if (receipt.notes !== undefined && (typeof receipt.notes !== "string" || receipt.notes.length > 4000)) throw new Error("Agent run receipt notes must be text up to 4000 characters.");
  if (!Array.isArray(receipt.artifactReferences) || new Set(receipt.artifactReferences).size !== receipt.artifactReferences.length) {
    throw new Error("Agent run receipt artifact references must be a unique array.");
  }
  for (const reference of receipt.artifactReferences) {
    if (typeof reference !== "string" || reference.includes("\\") || !artifactReferencePattern.test(reference)) {
      throw new Error("Agent run receipt contains an unsafe artifact reference.");
    }
  }
  assertExternalActionAuthority(receipt.externalActionAuthority);
  if (secretLikePattern.test(JSON.stringify(receipt))) throw new Error("Agent run receipt may not contain provider or subscription credentials.");

  if (typeof receipt.startedAt !== "string" || typeof receipt.finishedAt !== "string") throw new Error("Agent run receipt timestamps must be ISO date-time strings.");
  const startedAt = Date.parse(receipt.startedAt);
  const finishedAt = Date.parse(receipt.finishedAt);
  const claimedAt = Date.parse(claim.claimedAt);
  const leaseExpiresAt = Date.parse(claim.leaseExpiresAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt) throw new Error("Agent run receipt timestamps are invalid.");
  if (startedAt < claimedAt || finishedAt > leaseExpiresAt) throw new Error("Agent run receipt must remain inside the active claim lease.");

  return { ...receipt, artifactReferences: [...receipt.artifactReferences].sort() };
};

const hashArtifacts = ({ workspace, jobId, tenantId, attemptId, references }) => ({
  schemaVersion: "1.0.0",
  jobId,
  tenantId,
  attemptId,
  algorithm: "sha256",
  artifacts: [...references].sort().map((reference) => {
    const candidate = path.resolve(workspace, ...reference.split("/"));
    const filePath = assertRegularFileInsideWorkspace(workspace, candidate, `Artifact ${reference}`);
    const content = fs.readFileSync(filePath);
    return { reference, hash: sha256(content), bytes: content.length };
  })
});

const ensureSameJson = (filePath, expected, label) => {
  if (!fs.existsSync(filePath)) {
    writeExclusiveJson(filePath, expected);
    return false;
  }
  const current = readRegularJson(filePath);
  if (canonicalJson(current) !== canonicalJson(expected)) throw new Error(`${label} already exists with different content.`);
  return true;
};

const postCompletionStatuses = new Set(["awaiting_owner_decision", "accepted_internal", "revision_requested", "blocked", "failed"]);

const completeGrowthJobUnlocked = ({ workspace, jobId, receipt, receiptPath }) => {
  const store = createCanvasWorkspaceStore({ workspace });
  const current = store.readJob(jobId);
  if (current.state.status !== "in_progress" && !postCompletionStatuses.has(current.state.status)) {
    throw new Error(`Job ${jobId} can be completed only from in_progress; current status is ${current.state.status}.`);
  }
  const claim = readGrowthJobClaim({ workspace: store.workspace, jobId });
  if (current.state.status === "in_progress" && Date.now() > Date.parse(claim.leaseExpiresAt)) throw new Error(`Job ${jobId} cannot complete after its claim lease expires.`);
  const candidateReceipt = readReceiptInput({ workspace: store.workspace, receipt, receiptPath });
  const normalizedReceipt = validateReceipt({ receipt: candidateReceipt, job: current, claim });
  const qaReview = verifyGrowthJobQaVerdict({ workspace: store.workspace, jobId, allowedStatuses: ["in_progress", "awaiting_owner_decision", "revision_requested", "blocked"] });
  const desiredStatus = completionFromQaVerdict(normalizedReceipt, qaReview.verdict);
  const jobDirectory = store.jobDirectory(jobId);
  const finalReceiptPath = path.join(jobDirectory, "run-receipt.json");
  const artifactHashesPath = path.join(jobDirectory, "artifact-hashes.json");
  const completionLockPath = path.join(jobDirectory, "completion-lock.json");
  const artifactHashes = hashArtifacts({
    workspace: store.workspace,
    jobId,
    tenantId: current.manifest.tenantId,
    attemptId: claim.attemptId,
    references: normalizedReceipt.artifactReferences
  });
  if (canonicalJson(artifactHashes.artifacts) !== canonicalJson(qaReview.verdict.artifactBindings)) {
    throw new Error("Artifact content changed after independent QA; completion requires a new QA verdict bound to the current SHA-256 values.");
  }

  if (fs.existsSync(finalReceiptPath)) {
    const persistedReceipt = readRegularJson(finalReceiptPath);
    if (canonicalJson(persistedReceipt) !== canonicalJson(normalizedReceipt)) throw new Error(`Job ${jobId} already has a different run receipt.`);
    ensureSameJson(artifactHashesPath, artifactHashes, "Artifact hash record");
    const latest = store.readJob(jobId, { includeEvents: true });
    if (latest.state.status === "in_progress") {
      const resumed = store.updateState(
        jobId,
        (state) => {
          if (state.status !== "in_progress") throw new Error(`Job ${jobId} completion can resume only from in_progress.`);
          return { ...state, status: desiredStatus };
        },
        {
          eventType: "agent.completion_recovered",
          actorRole: claim.agentRole,
          payload: (state) => ({ status: state.status, attemptId: claim.attemptId, receiptHash: sha256(canonicalJson(normalizedReceipt)), artifactCount: artifactHashes.artifacts.length })
        }
      );
      return { job: resumed, receipt: normalizedReceipt, artifactHashes, idempotent: true };
    }
    if (postCompletionStatuses.has(latest.state.status)) {
      return { job: latest, receipt: normalizedReceipt, artifactHashes, idempotent: true };
    }
    throw new Error(`Job ${jobId} cannot complete from ${latest.state.status}.`);
  }

  if (current.state.status !== "in_progress") {
    throw new Error(`Job ${jobId} can be completed only from in_progress; current status is ${current.state.status}.`);
  }

  const completionLock = {
    schemaVersion: "1.0.0",
    jobId,
    tenantId: current.manifest.tenantId,
    attemptId: claim.attemptId,
    receiptHash: sha256(canonicalJson(normalizedReceipt)),
    qaVerdictHash: qaReview.verdictHash,
    deterministicLintReceiptHash: qaReview.lintReceiptHash,
    externalActionAuthority
  };
  try {
    writeExclusiveJson(completionLockPath, completionLock);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`Job ${jobId} completion is already in progress.`);
    throw error;
  }

  ensureSameJson(artifactHashesPath, artifactHashes, "Artifact hash record");
  writeExclusiveJson(finalReceiptPath, normalizedReceipt);
  const finalBindings = hashArtifacts({ workspace: store.workspace, jobId, tenantId: current.manifest.tenantId, attemptId: claim.attemptId, references: normalizedReceipt.artifactReferences }).artifacts;
  if (canonicalJson(finalBindings) !== canonicalJson(qaReview.verdict.artifactBindings)) {
    throw new Error("Artifact content changed while completion was being recorded; owner review remains blocked.");
  }
  const job = store.updateState(
    jobId,
    (state) => {
      if (state.status !== "in_progress") throw new Error(`Job ${jobId} can be completed only from in_progress; current status is ${state.status}.`);
      if (state.ownerDecision) throw new Error("Coding Agent completion may not create or overwrite an owner decision.");
      return { ...state, status: desiredStatus };
    },
    {
      eventType: "agent.completed",
      actorRole: claim.agentRole,
      payload: (state) => ({
        status: state.status,
        attemptId: claim.attemptId,
        outcome: normalizedReceipt.outcome,
        independentQaVerdict: qaReview.verdict.verdict,
        independentQaReviewerRole: qaReview.verdict.reviewerRole,
        qaVerdictHash: qaReview.verdictHash,
        deterministicLintReceiptHash: qaReview.lintReceiptHash,
        receiptHash: completionLock.receiptHash,
        artifactCount: artifactHashes.artifacts.length,
        externalActionAuthority
      })
    }
  );
  return { job, receipt: normalizedReceipt, artifactHashes, idempotent: false };
};

export const completeGrowthJob = (options) => withJobLock(
  { workspace: options.workspace, jobId: options.jobId },
  () => completeGrowthJobUnlocked(options)
);

const runAsCli = () => {
  const workspace = valueFor("--workspace") || process.env.GROWTH_CANVAS_WORKSPACE;
  const jobId = valueFor("--job-id");
  const receiptPath = valueFor("--receipt");
  if (!workspace || !jobId || !receiptPath) {
    console.error("Use --workspace <private-tenant-directory> --job-id <job-id> --receipt <tenant-scoped-agent-run-receipt.json>.");
    process.exit(1);
  }
  try {
    const result = completeGrowthJob({ workspace, jobId, receiptPath });
    console.log(JSON.stringify({ jobId, attemptId: result.receipt.attemptId, status: result.job.state.status, leadQualityGateStatus: result.receipt.qualityGateStatus, idempotent: result.idempotent }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
};

if (path.resolve(process.argv[1] || "") === path.resolve(modulePath)) runAsCli();
