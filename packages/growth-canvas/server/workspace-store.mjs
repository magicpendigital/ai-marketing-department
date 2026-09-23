import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { prepareGrowthJob } from "../../../scripts/prepare-growth-job.mjs";
import { validateGrowthTenant } from "../../../scripts/validate-growth-tenant.mjs";
import {
  deterministicLintFileName,
  verifyGrowthJobArtifactLint
} from "../../growth-core/job-artifact-lint.mjs";
import {
  CanvasHttpError,
  assertSafeExistingDirectory,
  assertSafeWorkspace,
  ensureSafeDirectory,
  isSameOrInside,
  resolveInsideWorkspace
} from "./security.mjs";

const jobIdPattern = /^[a-z][a-z0-9-]{2,79}$/;
const artifactReferencePattern = /^(?![A-Za-z]:)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const sha256 = (value) => `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
const nowIso = () => new Date().toISOString();
const externalActionAuthority = Object.freeze({
  publish: false,
  send: false,
  schedule: false,
  createCampaign: false,
  uploadAudience: false,
  spend: false
});
const allowedJobStatuses = new Set([
  "ready_for_agent",
  "in_progress",
  "awaiting_owner_decision",
  "accepted_internal",
  "revision_requested",
  "blocked",
  "cancelled",
  "failed"
]);
const windowsDeviceNamePattern = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const qualityDimensions = Object.freeze([
  "jtbd_audience_relevance",
  "specific_differentiated_value",
  "proof_claim_precision",
  "brand_locale_editorial_quality",
  "clarity_cta_destination_fit",
  "platform_visual_accessibility_fit",
  "trust_emotional_safety",
  "experiment_measurement_quality",
  "operational_traceability_reuse"
]);
const maximumPreviewBytes = 32 * 1024;
const maximumTotalPreviewBytes = 128 * 1024;
const maximumContentRecordPreviewBytes = 512 * 1024;
const maximumContentRecordTotalPreviewBytes = 2 * 1024 * 1024;
const previewableExtensions = new Map([
  [".json", "application/json"],
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"]
]);
const sensitivePreviewPattern = /(?:provider_api_key|oauth_token|subscription_token|authorization\s*:\s*bearer|\bsk-[a-z0-9_-]{12,})/i;
const ownerDecisionBoundary = "procedural_local_user_action_not_authenticated";
const defaultJobLockTimeoutMs = 5_000;
const defaultJobLockStaleMs = 120_000;
const jobLockPollMs = 20;
const lockWaitArray = new Int32Array(new SharedArrayBuffer(4));
const heldJobLocks = new Map();

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const readOptionalJson = (filePath, workspace) => {
  try {
    if (workspace) {
      const relative = path.relative(workspace, filePath);
      if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error("JSON path must remain inside the selected workspace.");
      }
      let current = workspace;
      for (const component of relative.split(path.sep)) {
        current = path.join(current, component);
        const componentEntry = fs.lstatSync(current);
        if (componentEntry.isSymbolicLink()) throw new Error(`JSON path contains a symbolic link or junction: ${current}`);
      }
    }
    const entry = fs.lstatSync(filePath);
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`Unsafe JSON file: ${filePath}`);
    return readJson(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

const writeAtomicJson = (filePath, value) => {
  const directory = path.dirname(filePath);
  const tempPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  const descriptor = fs.openSync(tempPath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try {
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // Preserve the original atomic-rename failure.
    }
    throw error;
  }
};

const objectOrEmpty = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const humanizeIdentifier = (value) => String(value || "")
  .replaceAll(/[_-]+/g, " ")
  .replaceAll(/\b\w/g, (letter) => letter.toUpperCase())
  .trim();
const displayText = (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
const quoteCommandArgument = (value) => `"${String(value).replaceAll('"', '\\"')}"`;
const recommendedAttemptId = (jobId, stateVersion, excluded = new Set()) => {
  let sequence = Math.max(1, Number.isInteger(stateVersion) ? stateVersion : 1);
  while (true) {
    const suffix = `attempt-${sequence}`;
    const candidate = `${jobId.slice(0, 79 - suffix.length).replace(/-+$/g, "")}-${suffix}`;
    if (!excluded.has(candidate)) return candidate;
    sequence += 1;
  }
};
const preferredCoreCapabilities = ["quality_assurance", "content_authoring", "content_research", "workflow_orchestration"];
const friendlyCapabilityLabels = Object.freeze({
  quality_assurance: "Quality reviewer",
  content_authoring: "Content studio",
  content_research: "Research specialist",
  workflow_orchestration: "Workflow coordinator"
});
const friendlyRoleLabels = Object.freeze({
  content_studio: "Content studio",
  brief_expander: "Brief specialist",
  locale_editor: "Locale editor",
  visual_accessibility_brief_checker: "Visual and accessibility reviewer"
});
const friendlyRoleLabel = (id, capability) => friendlyCapabilityLabels[capability] || friendlyRoleLabels[id] || humanizeIdentifier(id);
const friendlyJobStatus = (status) => ({
  ready_for_agent: "Ready",
  in_progress: "Working",
  awaiting_owner_decision: "Awaiting owner",
  accepted_internal: "Complete",
  revision_requested: "Revision needed",
  blocked: "Blocked",
  cancelled: "Cancelled",
  failed: "Failed"
})[status] || humanizeIdentifier(status || "Ready");
const teamStateForJob = (status) => ({
  ready_for_agent: "ready",
  in_progress: "working",
  awaiting_owner_decision: "review_pending",
  accepted_internal: "complete",
  revision_requested: "working",
  blocked: "blocked",
  cancelled: "blocked",
  failed: "blocked"
})[status] || "ready";
const checklistStateForJob = (status) => status === "accepted_internal"
  ? "passed"
  : ["revision_requested", "blocked", "cancelled", "failed"].includes(status)
    ? "blocked"
    : "pending";
const initialsFor = (value) => {
  const words = humanizeIdentifier(value).split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((word) => word[0]).join("") || "AI").toUpperCase();
};

const assertJobId = (jobId) => {
  if (!jobIdPattern.test(jobId || "") || windowsDeviceNamePattern.test(jobId)) {
    throw new CanvasHttpError(400, "invalid_job_id", "Job id must use 3–80 lowercase letters, digits, or hyphens and start with a letter.");
  }
};

const assertString = (value, label, { required = false, maxLength } = {}) => {
  if (value === undefined && !required) return "";
  if (typeof value !== "string" || (required && value.trim() === "")) {
    throw new CanvasHttpError(400, "invalid_field", `${label} must be${required ? " a non-empty" : ""} text value.`);
  }
  const normalized = value.trim();
  if (maxLength && normalized.length > maxLength) {
    throw new CanvasHttpError(400, "invalid_field", `${label} must be at most ${maxLength} characters.`);
  }
  return normalized;
};

const assertExactObjectKeys = (value, allowedKeys, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CanvasHttpError(409, "invalid_local_record", `${label} must be a JSON object.`);
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new CanvasHttpError(409, "invalid_local_record", `${label} has unsupported fields: ${unknown.join(", ")}.`);
};

const assertNoExternalAuthority = (authority, label) => {
  assertExactObjectKeys(authority, Object.keys(externalActionAuthority), `${label} externalActionAuthority`);
  if (Object.keys(externalActionAuthority).some((action) => authority[action] !== false)) {
    throw new CanvasHttpError(409, "external_authority_rejected", `${label} may not grant publishing, delivery, campaign, audience, or spend authority.`);
  }
};

const assertStateShape = (state, manifest) => {
  assertExactObjectKeys(
    state,
    ["schemaVersion", "jobId", "tenantId", "workflowId", "manifestHash", "stateVersion", "status", "title", "campaignSummary", "managerTaskDescription", "handoffMode", "createdAt", "updatedAt", "ownerDecision", "cancellation", "externalActionAuthority"],
    "Job state"
  );
  if (state.jobId !== manifest.jobId || state.tenantId !== manifest.tenantId || state.workflowId !== manifest.workflowId) {
    throw new Error("Job state identity does not match its immutable manifest.");
  }
  if (!Number.isInteger(state.stateVersion) || state.stateVersion < 1) throw new Error("Job stateVersion is invalid.");
  if (typeof state.manifestHash !== "string") throw new Error("Job state is missing its manifest binding.");
  if (!allowedJobStatuses.has(state.status)) throw new Error("Job state status is invalid.");
  if (state.handoffMode !== "manual_coding_agent") throw new Error("Job state must retain the manual Coding Agent handoff.");
  if (state.ownerDecision && state.ownerDecision.actorRole !== "owner") throw new Error("The procedural local decision must retain the owner role label.");
  if (state.cancellation && state.cancellation.actorRole !== "owner") throw new Error("The procedural local cancellation must retain the owner role label.");
  assertNoExternalAuthority(state.externalActionAuthority, "Job state");
};

const assertManifestShape = (manifest, jobId, tenantId) => {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("Job manifest is not a JSON object.");
  if (manifest.jobId !== jobId || manifest.tenantId !== tenantId || manifest.workflowId !== "W2_content_factory") {
    throw new Error("Job manifest identity does not match its tenant-scoped directory.");
  }
  if (manifest.mode !== "draft_only" || manifest.adapterMode !== "coding_agent_handoff") {
    throw new Error("Canvas work orders must remain draft-only Coding Agent handoffs.");
  }
  if (manifest.handoff?.credentialPolicy !== "framework_accepts_no_provider_credentials" || manifest.handoff?.requiresUserInitiation !== true) {
    throw new Error("Canvas work order handoff policy is invalid.");
  }
};

const assertRunReceipt = (receipt, manifest, workspace) => {
  if (!receipt) return;
  assertExactObjectKeys(
    receipt,
    ["schemaVersion", "jobId", "tenantId", "workflowId", "attemptId", "agentRole", "outcome", "startedAt", "finishedAt", "artifactReferences", "qualityGateStatus", "handoffMode", "notes", "externalActionAuthority"],
    "Agent run receipt"
  );
  if (receipt.jobId !== manifest.jobId || receipt.tenantId !== manifest.tenantId || receipt.workflowId !== manifest.workflowId) {
    throw new Error("Agent run receipt identity does not match its immutable manifest.");
  }
  if (receipt.schemaVersion !== "1.0.0" || !jobIdPattern.test(receipt.attemptId || "")) throw new Error("Agent run receipt version or attempt id is invalid.");
  if (typeof receipt.agentRole !== "string" || receipt.agentRole.trim() === "" || receipt.agentRole.length > 100) throw new Error("Agent run receipt role is invalid.");
  if (!["completed_for_review", "revision_required", "blocked", "failed", "cancelled"].includes(receipt.outcome)) throw new Error("Agent run receipt outcome is invalid.");
  if (receipt.qualityGateStatus !== "not_run") throw new Error("Lead-agent run receipt cannot self-attest independent QA.");
  const startedAt = Date.parse(receipt.startedAt);
  const finishedAt = Date.parse(receipt.finishedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt) throw new Error("Agent run receipt timestamps are invalid.");
  if (receipt.handoffMode !== "manual_coding_agent") throw new Error("Agent run receipt has an unsupported handoff mode.");
  if (receipt.notes !== undefined && (typeof receipt.notes !== "string" || receipt.notes.length > 4000)) throw new Error("Agent run receipt notes are invalid.");
  assertNoExternalAuthority(receipt.externalActionAuthority, "Agent run receipt");
  if (!Array.isArray(receipt.artifactReferences)) throw new Error("Agent run receipt must list tenant-relative artifact references.");
  if (new Set(receipt.artifactReferences).size !== receipt.artifactReferences.length) throw new Error("Agent run receipt artifact references must be unique.");
  for (const reference of receipt.artifactReferences) {
    if (typeof reference !== "string" || reference.includes("\0") || reference.includes("\\") || !artifactReferencePattern.test(reference) || path.isAbsolute(reference)) {
      throw new Error("Agent run receipt contains an unsafe artifact reference.");
    }
    resolveInsideWorkspace(workspace, reference);
  }
};

const readRequiredJobJson = ({ workspace, jobDirectory, fileName, code, label }) => {
  const value = readOptionalJson(path.join(jobDirectory, fileName), workspace);
  if (!value) throw new CanvasHttpError(409, code, `${label} is required before an owner decision.`);
  return value;
};

const assertSafeArtifactFile = ({ workspace, reference }) => {
  if (typeof reference !== "string" || reference === "" || reference.includes("\0") || reference.includes("\\") || reference.split("/").includes("..") || path.isAbsolute(reference)) {
    throw new CanvasHttpError(409, "artifact_path_rejected", "Review artifact reference is not a safe tenant-relative path.");
  }
  const candidate = resolveInsideWorkspace(workspace, ...reference.split("/"));
  const relative = path.relative(workspace, candidate);
  let current = workspace;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    let entry;
    try {
      entry = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
        throw new CanvasHttpError(409, "artifact_missing", `Review artifact is missing: ${reference}.`);
      }
      throw error;
    }
    if (entry.isSymbolicLink()) throw new CanvasHttpError(409, "artifact_path_rejected", `Review artifact traverses a link or junction: ${reference}.`);
  }
  const entry = fs.lstatSync(candidate);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new CanvasHttpError(409, "artifact_path_rejected", `Review artifact must be a regular file: ${reference}.`);
  const physical = fs.realpathSync.native(candidate);
  const physicalWorkspace = fs.realpathSync.native(workspace);
  if (!isSameOrInside(physical, physicalWorkspace)) throw new CanvasHttpError(409, "artifact_path_rejected", `Review artifact escapes the tenant workspace: ${reference}.`);
  return physical;
};

const hashArtifactFile = (filePath, { captureLimit = 0 } = {}) => {
  const descriptor = fs.openSync(filePath, "r");
  const hash = crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const captured = [];
  let bytes = 0;
  let initial;
  let final;
  try {
    initial = fs.fstatSync(descriptor, { bigint: true });
    const capture = captureLimit > 0 && initial.size <= BigInt(captureLimit);
    while (true) {
      const count = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      bytes += count;
      hash.update(buffer.subarray(0, count));
      if (capture) captured.push(Buffer.from(buffer.subarray(0, count)));
    }
    final = fs.fstatSync(descriptor, { bigint: true });
  } finally {
    fs.closeSync(descriptor);
  }
  if (initial.size !== final.size || initial.mtimeNs !== final.mtimeNs || BigInt(bytes) !== final.size) {
    throw new CanvasHttpError(409, "artifact_changed_during_review", "An artifact changed while its integrity was being verified.");
  }
  return { hash: `sha256:${hash.digest("hex")}`, bytes, previewBuffer: captured.length > 0 || bytes === 0 && captureLimit > 0 ? Buffer.concat(captured) : null };
};

const artifactPreview = ({
  buffer,
  reference,
  bytes,
  remainingBytes,
  previewByteLimit = maximumPreviewBytes,
  totalPreviewByteLimit = maximumTotalPreviewBytes
}) => {
  const mediaType = previewableExtensions.get(path.extname(reference).toLowerCase());
  if (!mediaType) return { status: "refused_binary", mediaType: "application/octet-stream", bytes };
  if (bytes > previewByteLimit) return { status: "refused_oversize", mediaType, bytes, maximumBytes: previewByteLimit };
  if (bytes > remainingBytes) return { status: "refused_total_limit", mediaType, bytes, maximumTotalBytes: totalPreviewByteLimit };
  if (!Buffer.isBuffer(buffer) || buffer.length !== bytes) {
    throw new CanvasHttpError(409, "artifact_changed_during_review", "The verified artifact snapshot is unavailable for preview.");
  }
  let content;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return { status: "refused_binary", mediaType: "application/octet-stream", bytes };
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(content)) return { status: "refused_binary", mediaType: "application/octet-stream", bytes };
  if (sensitivePreviewPattern.test(content)) return { status: "refused_sensitive_content", mediaType, bytes };
  if (path.extname(reference).toLowerCase() === ".json") {
    try {
      JSON.parse(content);
    } catch {
      return { status: "refused_invalid_json", mediaType, bytes };
    }
  }
  return { status: "available", mediaType, bytes, content };
};

const assertExactKeysForRecord = (value, keys, label, code = "decision_evidence_invalid") => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CanvasHttpError(409, code, `${label} must be a JSON object.`);
  const expected = new Set(keys);
  const actualKeys = Object.keys(value);
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  const unknown = actualKeys.filter((key) => !expected.has(key));
  if (missing.length > 0 || unknown.length > 0) throw new CanvasHttpError(409, code, `${label} shape is invalid.`);
};

const assertArtifactBindingArray = (bindings, label) => {
  if (!Array.isArray(bindings) || bindings.length === 0) throw new CanvasHttpError(409, "decision_integrity_invalid", `${label} must bind at least one artifact.`);
  const seen = new Set();
  for (const binding of bindings) {
    assertExactKeysForRecord(binding, ["reference", "hash", "bytes"], `${label} artifact binding`, "decision_integrity_invalid");
    if (typeof binding.reference !== "string" || seen.has(binding.reference)) throw new CanvasHttpError(409, "decision_integrity_invalid", `${label} artifact references must be unique strings.`);
    seen.add(binding.reference);
    if (!/^sha256:[a-f0-9]{64}$/.test(binding.hash || "") || !Number.isInteger(binding.bytes) || binding.bytes < 0) {
      throw new CanvasHttpError(409, "decision_integrity_invalid", `${label} artifact hash or size is invalid.`);
    }
  }
};

const eventHashInput = (event) => {
  const { eventHash, ...hashInput } = event;
  return JSON.stringify(hashInput);
};

const readEvents = (eventsPath) => {
  if (!fs.existsSync(eventsPath)) return [];
  const entry = fs.lstatSync(eventsPath);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("Job event log must be a regular file.");
  const lines = fs.readFileSync(eventsPath, "utf8").split(/\r?\n/).filter(Boolean);
  const events = [];
  let previousEventHash = null;
  for (const line of lines) {
    const event = JSON.parse(line);
    if (event.previousEventHash !== previousEventHash || event.eventHash !== sha256(eventHashInput(event))) {
      throw new Error("Job event log integrity check failed.");
    }
    events.push(event);
    previousEventHash = event.eventHash;
  }
  return events;
};

const appendEvent = (eventsPath, { jobId, eventType, actorRole, payload }) => {
  const existing = readEvents(eventsPath);
  const event = {
    schemaVersion: "1.0.0",
    eventId: crypto.randomUUID(),
    jobId,
    eventType,
    actorRole,
    occurredAt: nowIso(),
    previousEventHash: existing.at(-1)?.eventHash || null,
    payload
  };
  event.eventHash = sha256(eventHashInput(event));
  fs.appendFileSync(eventsPath, `${JSON.stringify(event)}\n`, { encoding: "utf8", flag: "a", mode: 0o600 });
  return event;
};

const safeRemoveNewJobDirectory = (jobDirectory, jobsDirectory) => {
  const relative = path.relative(jobsDirectory, jobDirectory);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return;
  try {
    fs.rmSync(jobDirectory, { recursive: true, force: true });
  } catch {
    // The original creation failure remains the actionable error.
  }
};

const assertLockDuration = (value, label, { minimum, maximum }) => {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum} milliseconds.`);
  }
};

const processIsAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
};

const lockStatIdentity = (entry) => `${entry.dev}:${entry.ino}:${entry.birthtimeMs}`;

const tryReapStaleJobLock = ({ workspace, lockDirectory, staleMs }) => {
  const entry = fs.lstatSync(lockDirectory);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new CanvasHttpError(409, "unsafe_job_lock", "Job lock path must be a private regular directory.");
  }
  const ownerPath = path.join(lockDirectory, "owner.json");
  let owner = null;
  try {
    owner = readOptionalJson(ownerPath, workspace);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const acquiredAt = Date.parse(owner?.acquiredAt || "");
  const ageMs = Date.now() - (Number.isFinite(acquiredAt) ? acquiredAt : entry.mtimeMs);
  if (ageMs <= staleMs) return false;
  if (owner && (owner.hostname !== os.hostname() || processIsAlive(owner.pid))) return false;

  const observedIdentity = lockStatIdentity(entry);
  const observedToken = typeof owner?.token === "string" ? owner.token : null;
  const tombstone = `${lockDirectory}.stale-${process.pid}-${crypto.randomUUID()}`;
  try {
    fs.renameSync(lockDirectory, tombstone);
  } catch (error) {
    if (["ENOENT", "EACCES", "EPERM"].includes(error?.code)) return false;
    throw error;
  }

  const movedEntry = fs.lstatSync(tombstone);
  let movedOwner = null;
  try {
    movedOwner = readOptionalJson(path.join(tombstone, "owner.json"), workspace);
  } catch {
    movedOwner = null;
  }
  if (lockStatIdentity(movedEntry) !== observedIdentity || (observedToken && movedOwner?.token !== observedToken)) {
    if (!fs.existsSync(lockDirectory)) fs.renameSync(tombstone, lockDirectory);
    else throw new CanvasHttpError(423, "job_lock_changed", "Job lock changed during stale-lock recovery; retry the operation.");
    return false;
  }
  fs.rmSync(tombstone, { recursive: true, force: true });
  return true;
};

export const withJobLock = (
  { workspace, jobId, timeoutMs = defaultJobLockTimeoutMs, staleMs = defaultJobLockStaleMs },
  callback
) => {
  if (typeof callback !== "function") throw new TypeError("withJobLock requires a synchronous callback.");
  assertLockDuration(timeoutMs, "Job lock timeout", { minimum: 0, maximum: 60_000 });
  assertLockDuration(staleMs, "Job lock stale threshold", { minimum: 1_000, maximum: 3_600_000 });
  assertJobId(jobId);
  const safeWorkspace = assertSafeWorkspace(workspace);
  const jobDirectory = resolveInsideWorkspace(safeWorkspace, "operations", "jobs", jobId);
  assertSafeExistingDirectory(safeWorkspace, jobDirectory);
  const key = `${process.platform === "win32" ? safeWorkspace.toLowerCase() : safeWorkspace}\0${jobId}`;
  const nested = heldJobLocks.get(key);
  if (nested) {
    nested.depth += 1;
    try {
      const result = callback();
      if (result && typeof result.then === "function") throw new TypeError("withJobLock callbacks must be synchronous.");
      return result;
    } finally {
      nested.depth -= 1;
    }
  }

  const lockDirectory = path.join(jobDirectory, ".growth-job.lock");
  const deadline = Date.now() + timeoutMs;
  const token = crypto.randomUUID();
  while (true) {
    try {
      fs.mkdirSync(lockDirectory, { mode: 0o700 });
      try {
        writeAtomicJson(path.join(lockDirectory, "owner.json"), {
          schemaVersion: "1.0.0",
          token,
          pid: process.pid,
          hostname: os.hostname(),
          acquiredAt: nowIso()
        });
      } catch (error) {
        fs.rmSync(lockDirectory, { recursive: true, force: true });
        throw error;
      }
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (tryReapStaleJobLock({ workspace: safeWorkspace, lockDirectory, staleMs })) continue;
      if (Date.now() >= deadline) {
        throw new CanvasHttpError(423, "job_locked", `Job ${jobId} is being changed by another local process; retry shortly.`);
      }
      Atomics.wait(lockWaitArray, 0, 0, Math.min(jobLockPollMs, Math.max(1, deadline - Date.now())));
    }
  }

  const held = { depth: 1, token, lockDirectory };
  heldJobLocks.set(key, held);
  let callbackError = null;
  try {
    const result = callback();
    if (result && typeof result.then === "function") throw new TypeError("withJobLock callbacks must be synchronous.");
    return result;
  } catch (error) {
    callbackError = error;
    throw error;
  } finally {
    heldJobLocks.delete(key);
    try {
      const owner = readOptionalJson(path.join(lockDirectory, "owner.json"), safeWorkspace);
      if (owner?.token === token) fs.rmSync(lockDirectory, { recursive: true, force: true });
    } catch (error) {
      if (!callbackError) throw error;
    }
  }
};

export class CanvasWorkspaceStore {
  constructor({ workspace }) {
    this.workspace = assertSafeWorkspace(workspace);
    const tenantConfigPath = resolveInsideWorkspace(this.workspace, "tenant-config.json");
    const tenantConfig = readOptionalJson(tenantConfigPath, this.workspace);
    if (!tenantConfig?.tenantId || !/^[a-z][a-z0-9-]{1,62}$/.test(tenantConfig.tenantId)) {
      throw new Error("Canvas workspace must contain a valid tenant-config.json.");
    }
    this.tenantId = tenantConfig.tenantId;
    this.operationsDirectory = ensureSafeDirectory(this.workspace, "operations");
    this.jobsDirectory = ensureSafeDirectory(this.workspace, "operations", "jobs");
  }

  registry() {
    return {
      schemaVersion: "1.0.0",
      workspaceId: this.tenantId,
      tenantId: this.tenantId,
      workspaceRoot: this.workspace,
      topology: "single_tenant_per_process",
      handoffMode: "manual_coding_agent",
      ownerDecisionBoundary,
      externalActionAuthority
    };
  }

  readiness({ allowIncomplete = true } = {}) {
    const result = validateGrowthTenant(this.workspace, { allowIncomplete });
    return {
      readyForInternalDrafts: result.summary?.readyForInternalDrafts === true && result.errors.length === 0,
      status: result.summary?.readyForInternalDrafts === true && result.errors.length === 0 ? "ready_for_internal_drafts" : "blocked",
      errorCount: result.errors.length,
      blockers: result.errors.slice(0, 50)
    };
  }

  tenantOverview() {
    const brandPack = readOptionalJson(resolveInsideWorkspace(this.workspace, "brand-pack.json"), this.workspace);
    const experimentBrief = readOptionalJson(resolveInsideWorkspace(this.workspace, "campaigns", "experiment-brief.json"), this.workspace);
    const roleMapping = readOptionalJson(resolveInsideWorkspace(this.workspace, "role-mapping.json"), this.workspace);
    const businessPack = readOptionalJson(resolveInsideWorkspace(this.workspace, "business-pack.json"), this.workspace);
    const nestedExperiment = objectOrEmpty(experimentBrief?.experiment);
    const legacyExperiment = objectOrEmpty(experimentBrief);
    const experiment = Object.keys(nestedExperiment).length > 0 ? nestedExperiment : legacyExperiment;
    const execution = objectOrEmpty(experimentBrief?.execution || experiment.execution);
    const businessContext = objectOrEmpty(businessPack?.businessContext);
    return {
      tenantId: this.tenantId,
      productName: brandPack?.identity?.productName || this.tenantId,
      campaign: experimentBrief
        ? {
            id: experiment.id || experiment.experimentId || legacyExperiment.experimentId || null,
            status: experimentBrief.status || experiment.status || "internal_draft",
            hypothesis: experiment.hypothesis || null,
            jtbd: experiment.jtbd || null,
            displayTitle: displayText(experiment.displayTitle),
            displaySubtitle: displayText(experiment.displaySubtitle),
            audienceSummary: displayText(experiment.audienceSummary),
            goalSummary: displayText(experiment.goalSummary),
            channelsSummary: displayText(experiment.channelsSummary),
            primaryMetric: experiment.primaryMetric || experiment.measurement?.primaryMetric || null,
            denominator: experiment.denominator || experiment.measurement?.denominator || null,
            formats: Array.isArray(experiment.formats) ? experiment.formats : [],
            destinationId: experiment.destinationId || null,
            guardrails: Array.isArray(experiment.guardrails) ? experiment.guardrails : [],
            channel: execution.channel || null,
            executionStatus: execution.status || "disabled"
          }
        : null,
      business: {
        category: businessContext.category || null,
        targetMarket: businessContext.targetMarket || null,
        primaryLocale: businessContext.primaryLocale || null,
        approvalOwner: businessPack?.approvalAuthority?.role || roleMapping?.humanApprovalAuthority || null
      },
      roleMappings: roleMapping?.frameworkRoleMappings || {}
    };
  }

  managerPresentation(jobs = this.listJobs()) {
    const tenant = this.tenantOverview();
    const readiness = this.readiness({ allowIncomplete: true });
    const activeJob = jobs.find((job) => job.state.status === "awaiting_owner_decision")
      || jobs.find((job) => !["accepted_internal", "blocked", "cancelled", "failed"].includes(job.state.status))
      || jobs[0]
      || null;
    const campaign = tenant.campaign || {};
    let qaVerdict = null;
    if (activeJob) {
      qaVerdict = readOptionalJson(path.join(this.jobDirectory(activeJob.jobId), "qa-verdict.json"), this.workspace);
    }
    const qaPassed = qaVerdict?.verdict === "pass" && qaVerdict?.deterministicLintStatus === "passed";
    const gate = (id, label, detail, passed, blocked = false) => ({ id, label, detail, state: passed ? "passed" : blocked ? "blocked" : "pending" });
    const gates = [
      gate("readiness", "Tenant readiness and ProductTruth passed", "Required tenant evidence and operating boundaries validate locally.", readiness.readyForInternalDrafts, !readiness.readyForInternalDrafts),
      gate("experiment", "Campaign experiment has a hypothesis and primary metric", "The internal campaign brief names what will be tested and measured.", Boolean(campaign.id && campaign.hypothesis && campaign.primaryMetric)),
      gate("boundary", "External execution remains disabled", "Publishing, delivery, audience upload and spend remain disabled.", true),
      gate("work_order", "Tenant-scoped W2 work order is prepared", "A bounded work order exists inside this tenant workspace.", Boolean(activeJob)),
      gate("independent_qa", "Independent quality review passed", "A tenant-mapped quality reviewer checked the bound artifacts.", qaPassed, activeJob?.state?.status === "blocked"),
      gate("owner_decision", "Local owner decision accepted the internal candidate", "A same-origin local user completed the procedural decision step.", activeJob?.state?.status === "accepted_internal", ["revision_requested", "blocked"].includes(activeJob?.state?.status))
    ];
    const passedGates = gates.filter((item) => item.state === "passed");
    const score = Math.round((passedGates.length / gates.length) * 100);
    const checklistLabels = activeJob?.manifest?.managerReview?.checklist?.length
      ? [...activeJob.manifest.managerReview.checklist]
      : [
          "Confirm the tenant identity, owner and business boundary",
          "Review evidence-bound ProductTruth and prohibited claims",
          "Confirm the campaign hypothesis, metric and destination",
          "Create a W2 internal work order before content production"
        ];
    const checklistState = activeJob ? checklistStateForJob(activeJob.state.status) : readiness.readyForInternalDrafts ? "pending" : "blocked";
    const checklist = checklistLabels.map((label, index) => ({
      id: `manager_check_${index + 1}`,
      label,
      detail: activeJob ? `Review requirement for work order ${activeJob.jobId}.` : "Required before the first internal content work order is accepted.",
      state: checklistState
    }));

    let roles = [];
    if (activeJob) {
      const lead = {
        id: activeJob.manifest.assignedAgentRole,
        label: friendlyRoleLabel(activeJob.manifest.assignedAgentRole),
        status: friendlyJobStatus(activeJob.state.status),
        state: teamStateForJob(activeJob.state.status),
        detail: `Leads internal production for ${activeJob.jobId}.`
      };
      const subagents = (activeJob.manifest.subagentTemplateIds || []).map((subagentId) => ({
        id: subagentId,
        label: friendlyRoleLabel(subagentId),
        status: friendlyJobStatus(activeJob.state.status),
        state: teamStateForJob(activeJob.state.status),
        detail: `Supports the bounded work order ${activeJob.jobId}.`
      }));
      const qualityRole = tenant.roleMappings.quality_assurance
        ? {
            id: tenant.roleMappings.quality_assurance,
            label: friendlyRoleLabel(tenant.roleMappings.quality_assurance, "quality_assurance"),
            status: qaPassed ? "Complete" : "Review pending",
            state: qaPassed ? "complete" : "review_pending",
            detail: "Reviews the draft independently before the owner decision."
          }
        : null;
      const subagentSlots = qualityRole ? 2 : 3;
      roles = [lead, ...subagents.slice(0, subagentSlots), ...(qualityRole ? [qualityRole] : [])];
    } else {
      for (const capability of preferredCoreCapabilities) {
        const role = tenant.roleMappings[capability];
        if (!role) continue;
        roles.push({
          id: role,
          label: friendlyRoleLabel(role, capability),
          status: "Ready",
          state: "ready",
          detail: `${friendlyCapabilityLabels[capability]} is available for the next internal work order.`
        });
      }
    }
    const seenRoles = new Set();
    const team = roles
      .filter(({ id }) => {
        if (typeof id !== "string" || id.trim() === "" || seenRoles.has(id)) return false;
        seenRoles.add(id);
        return true;
      })
      .slice(0, 4)
      .map(({ id, label, status, state, detail }) => ({
        id,
        initials: initialsFor(label || id),
        role: label || friendlyRoleLabel(id),
        time: status || "Ready",
        state: state || "ready",
        detail
      }));

    const campaignView = {
      id: campaign.id || `${this.tenantId}-internal-campaign`,
      period: humanizeIdentifier(campaign.status || "internal draft"),
      title: campaign.displayTitle || campaign.hypothesis || `${tenant.productName} internal campaign`,
      subtitle: campaign.displaySubtitle || campaign.jtbd || tenant.business.category || "Internal draft planning workspace",
      audience: campaign.audienceSummary || tenant.business.targetMarket || "Owner review required",
      goal: campaign.goalSummary || campaign.primaryMetric || "Primary metric pending owner review",
      channels: campaign.channelsSummary || campaign.destinationId || campaign.channel || "No destination connected",
      formats: campaign.formats || [],
      destinationId: campaign.destinationId || null,
      qualityScore: score,
      qualityChecks: passedGates.map((item) => item.label),
      qualityGates: gates.map(({ id, label, detail, state }) => ({ id, label, detail, state }))
    };
    const managerDecision = activeJob?.manifest?.managerReview?.decisionRequired || "owner_reviews_readiness_before_w2";
    const jobStatus = activeJob?.state?.status || "";
    const contentComplete = ["awaiting_owner_decision", "accepted_internal", "revision_requested", "blocked"].includes(jobStatus);
    const qaComplete = qaPassed;
    const workflow = [
      {
        id: "readiness",
        label: "Readiness",
        state: readiness.readyForInternalDrafts ? "complete" : "current",
        date: readiness.readyForInternalDrafts ? "Ready" : `${readiness.errorCount} blocker(s)`
      },
      {
        id: "campaign",
        label: "Campaign brief",
        state: campaign.id && campaign.hypothesis ? "complete" : readiness.readyForInternalDrafts ? "current" : "pending",
        date: campaign.id && campaign.hypothesis ? "Defined" : "Pending"
      },
      {
        id: "creation",
        label: "Content production",
        state: contentComplete ? "complete" : activeJob ? "current" : "pending",
        date: activeJob ? humanizeIdentifier(jobStatus) : "No work order"
      },
      {
        id: "quality",
        label: "Independent QA",
        state: qaComplete ? "complete" : activeJob && ["in_progress", "revision_requested"].includes(jobStatus) ? "current" : "pending",
        date: qaPassed ? "Passed" : "Pending"
      },
      {
        id: "approval",
        label: "Owner decision",
        state: jobStatus === "accepted_internal" ? "complete" : jobStatus === "awaiting_owner_decision" ? "current" : "pending",
        date: jobStatus === "awaiting_owner_decision" ? "Decision required" : jobStatus === "accepted_internal" ? "Accepted internally" : "Pending"
      }
    ];
    return {
      organization: {
        id: tenant.tenantId,
        name: tenant.productName,
        owner: humanizeIdentifier(tenant.business.approvalOwner || "Business owner"),
        initials: initialsFor(tenant.business.approvalOwner || tenant.productName),
        runtimeLabel: "Local single-tenant Canvas"
      },
      campaign: campaignView,
      summary: {
        tenantId: tenant.tenantId,
        campaignId: campaignView.id,
        activeJobId: activeJob?.jobId || null,
        status: activeJob?.state?.status || readiness.status,
        managerDecisionRequired: managerDecision,
        nextAction: activeJob?.handoff?.nextAction || (readiness.readyForInternalDrafts ? "Create a bounded W2 internal work order." : "Resolve readiness blockers before creating content."),
        draftOnly: true
      },
      quality: {
        score,
        basis: "local_gate_completion_not_conversion_or_content_performance",
        scoreBasis: "local_gate_completion",
        gates: gates.map(({ id, label, detail, state }) => ({ id, label, detail, state })),
        passed: passedGates.map((item) => item.id),
        pending: gates.filter((item) => item.state === "pending").map((item) => item.id),
        blocked: gates.filter((item) => item.state === "blocked").map((item) => item.id),
        totalGateCount: gates.length
      },
      checklist,
      team,
      workflow,
      currentTask: activeJob
        ? {
            id: activeJob.jobId,
            jobId: activeJob.jobId,
            status: activeJob.state.status,
            title: activeJob.state.title,
            description: activeJob.state.managerTaskDescription
          }
        : {
            id: `${tenant.tenantId}-readiness-task`,
            status: readiness.readyForInternalDrafts ? "readiness_ready" : "readiness_blocked",
            title: readiness.readyForInternalDrafts ? "Create the first internal W2 work order" : "Resolve tenant readiness blockers",
            description: readiness.readyForInternalDrafts ? "The tenant boundary and campaign brief are ready for a bounded Coding Agent handoff." : "Complete the missing owner and evidence inputs before content production.",
            points: [
              { label: "Campaign hypothesis", value: campaignView.title },
              { label: "Manager decision", value: managerDecision },
              { label: "Quality status", value: `${passedGates.length}/${gates.length} local gates passed; this is not a conversion or content-performance score.` },
              { label: "Execution boundary", value: "Publishing, delivery, audience upload and spend remain disabled." }
            ],
            preview: {
              type: "Internal campaign brief",
              title: campaignView.title,
              description: campaignView.subtitle,
              count: "Review campaign brief"
            }
          },
      activity: activeJob
        ? [{
            time: activeJob.state.updatedAt,
            title: humanizeIdentifier(activeJob.state.status),
            detail: `Internal work order ${activeJob.jobId}; external actions remain disabled.`
          }]
        : []
    };
  }

  jobDirectory(jobId) {
    assertJobId(jobId);
    return resolveInsideWorkspace(this.workspace, "operations", "jobs", jobId);
  }

  createW2Job({ jobId, title, campaignSummary, managerTaskDescription }) {
    assertJobId(jobId);
    const normalizedTitle = assertString(title, "title", { required: true, maxLength: 120 });
    const normalizedSummary = assertString(campaignSummary, "campaignSummary", { maxLength: 1000 });
    const normalizedDescription = assertString(managerTaskDescription, "managerTaskDescription", { required: true, maxLength: 2000 });
    const readiness = this.readiness({ allowIncomplete: false });
    if (!readiness.readyForInternalDrafts) {
      throw new CanvasHttpError(409, "tenant_not_ready", "Tenant readiness must pass before a W2 job can be created.");
    }

    const jobDirectory = this.jobDirectory(jobId);
    try {
      fs.mkdirSync(jobDirectory, { mode: 0o700 });
    } catch (error) {
      if (error?.code === "EEXIST") throw new CanvasHttpError(409, "duplicate_job", `Job already exists: ${jobId}.`);
      throw error;
    }

    try {
      assertSafeExistingDirectory(this.workspace, jobDirectory);
      const manifestPath = path.join(jobDirectory, "manifest.json");
      const manifest = prepareGrowthJob({
        tenantRoot: this.workspace,
        workflowId: "W2_content_factory",
        outputPath: manifestPath,
        jobId,
        adapterMode: "coding_agent_handoff"
      });
      const manifestText = fs.readFileSync(manifestPath, "utf8");
      const createdAt = nowIso();
      const state = {
        schemaVersion: "1.0.0",
        jobId,
        tenantId: this.tenantId,
        workflowId: "W2_content_factory",
        manifestHash: sha256(manifestText),
        stateVersion: 1,
        status: "ready_for_agent",
        title: normalizedTitle,
        campaignSummary: normalizedSummary,
        managerTaskDescription: normalizedDescription,
        handoffMode: "manual_coding_agent",
        createdAt,
        updatedAt: createdAt,
        externalActionAuthority
      };
      writeAtomicJson(path.join(jobDirectory, "state.json"), state);
      appendEvent(path.join(jobDirectory, "events.ndjson"), {
        jobId,
        eventType: "job.created",
        actorRole: "owner",
        payload: { status: state.status, workflowId: state.workflowId, handoffMode: state.handoffMode }
      });
      return this.readJob(jobId, { includeEvents: true });
    } catch (error) {
      safeRemoveNewJobDirectory(jobDirectory, this.jobsDirectory);
      if (error instanceof CanvasHttpError) throw error;
      if (/not ready for an internal job/i.test(error.message || "")) {
        throw new CanvasHttpError(409, "tenant_not_ready", "Tenant readiness must pass before a W2 job can be created.");
      }
      throw error;
    }
  }

  readJob(jobId, { includeEvents = false } = {}) {
    const jobDirectory = this.jobDirectory(jobId);
    try {
      assertSafeExistingDirectory(this.workspace, jobDirectory);
    } catch (error) {
      if (error?.code === "ENOENT" || !fs.existsSync(jobDirectory)) {
        throw new CanvasHttpError(404, "job_not_found", `Unknown job: ${jobId}.`);
      }
      throw error;
    }
    const manifestPath = path.join(jobDirectory, "manifest.json");
    const statePath = path.join(jobDirectory, "state.json");
    const manifestEntry = fs.lstatSync(manifestPath);
    const stateEntry = fs.lstatSync(statePath);
    if (!manifestEntry.isFile() || manifestEntry.isSymbolicLink() || !stateEntry.isFile() || stateEntry.isSymbolicLink()) {
      throw new Error("Job manifest and state must be regular files.");
    }
    const manifestText = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(manifestText);
    assertManifestShape(manifest, jobId, this.tenantId);
    const state = readJson(statePath);
    assertStateShape(state, manifest);
    if (state.manifestHash !== sha256(manifestText)) {
      throw new CanvasHttpError(409, "manifest_integrity_failure", `Immutable manifest changed for job ${jobId}.`);
    }
    const eventsPath = path.join(jobDirectory, "events.ndjson");
    const receipt = readOptionalJson(path.join(jobDirectory, "run-receipt.json"), this.workspace);
    const persistedClaim = readOptionalJson(path.join(jobDirectory, "claim.json"), this.workspace);
    try {
      assertRunReceipt(receipt, manifest, this.workspace);
    } catch (error) {
      if (error instanceof CanvasHttpError) throw error;
      throw new CanvasHttpError(409, "invalid_run_receipt", "Persisted Coding Agent run receipt is invalid or unsafe.");
    }
    const claimIdentityMatches = persistedClaim
      && persistedClaim.jobId === jobId
      && persistedClaim.tenantId === this.tenantId
      && persistedClaim.workflowId === manifest.workflowId
      && jobIdPattern.test(persistedClaim.attemptId || "")
      && Number.isFinite(Date.parse(persistedClaim.leaseExpiresAt));
    const claimLeaseExpired = Boolean(claimIdentityMatches && Date.now() > Date.parse(persistedClaim.leaseExpiresAt));
    const requiresDistinctAttempt = state.status === "revision_requested" || (state.status === "in_progress" && claimLeaseExpired);
    const excludedAttemptIds = new Set(claimIdentityMatches ? [persistedClaim.attemptId] : []);
    const proposedAttemptId = recommendedAttemptId(jobId, state.stateVersion, excludedAttemptIds);
    const attemptId = claimIdentityMatches && state.status === "in_progress" && !claimLeaseExpired
      ? persistedClaim.attemptId
      : proposedAttemptId;
    const qaInputPath = path.join(jobDirectory, "qa-verdict-input.json");
    const receiptInputPath = path.join(jobDirectory, "agent-run-receipt-input.json");
    const commonCommand = `--workspace ${quoteCommandArgument(this.workspace)} --job-id ${jobId}`;
    const lifecycleCommands = [
      {
        id: "claim",
        label: "Claim the work order",
        command: `node scripts/claim-growth-job.mjs ${commonCommand} --attempt-id ${attemptId}`
      },
      {
        id: "independent_qa",
        label: "Record independent QA",
        command: `node scripts/review-growth-job.mjs ${commonCommand} --verdict ${quoteCommandArgument(qaInputPath)}`
      },
      {
        id: "complete",
        label: "Submit the lead receipt",
        command: `node scripts/complete-growth-job.mjs ${commonCommand} --receipt ${quoteCommandArgument(receiptInputPath)}`
      }
    ];
    const handoffPrompt = [
      `Execute the tenant-scoped W2 work order ${jobId} through its local filesystem lifecycle.`,
      "First read AGENTS.md, docs/AGENT_TASK_ROUTER.md, docs/PLAN_QC_PROTOCOL.md, and the immutable manifest path below.",
      `Run the claim command before creating artifacts. Create only internal artifacts inside ${this.workspace}; do not publish, send, schedule, upload audiences, create campaigns, or spend.`,
      "Use the manifest's assigned lead and sub-agent roles. Delegate quality review to the tenant-mapped quality_assurance role, which must differ from the assigned lead.",
      `Have that independent reviewer write ${qaInputPath}, then run the independent QA command. The lead must write ${receiptInputPath} with qualityGateStatus set to not_run, then run the completion command.`,
      "Stop when the job reaches awaiting_owner_decision so the manager can inspect the verified review bundle. This handoff does not provide an automatic queue, login, unattended authentication, or provider credentials."
    ].join("\n\n");
    return {
      jobId,
      manifest,
      state,
      receipt,
      handoff: {
        mode: "manual_coding_agent",
        userInitiationRequired: true,
        credentialInputRequested: false,
        automaticQueue: false,
        loginHandled: false,
        manifestPath,
        qaInputPath,
        receiptInputPath,
        prompt: handoffPrompt,
        lifecycleCommands,
        claimLease: claimIdentityMatches
          ? {
              attemptId: persistedClaim.attemptId,
              claimedAt: persistedClaim.claimedAt,
              leaseExpiresAt: persistedClaim.leaseExpiresAt,
              status: claimLeaseExpired ? "expired" : "active"
            }
          : null,
        leaseRecovery: {
          available: Boolean(state.status === "in_progress" && claimLeaseExpired),
          requiresDistinctAttemptId: requiresDistinctAttempt,
          previousAttemptId: state.status === "in_progress" && claimLeaseExpired ? persistedClaim.attemptId : null,
          recommendedAttemptId: attemptId,
          command: lifecycleCommands[0].command
        },
        nextAction: state.status === "in_progress" && claimLeaseExpired
          ? `The prior lease expired. Run the claim command with the distinct recommended attempt id ${attemptId}; the old attempt will be archived before work resumes.`
          : `Copy the handoff prompt to your Coding Agent, run the three local lifecycle commands, and stop for manager review.`
      },
      ...(includeEvents ? { events: readEvents(eventsPath) } : {})
    };
  }

  listJobs() {
    const entries = fs.readdirSync(this.jobsDirectory, { withFileTypes: true });
    const jobs = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw new Error(`Unsafe entry in operations/jobs: ${entry.name}`);
      }
      assertJobId(entry.name);
      const job = this.readJob(entry.name);
      jobs.push(job);
    }
    jobs.sort((left, right) => right.state.createdAt.localeCompare(left.state.createdAt));
    return jobs;
  }

  updateState(jobId, updater, event) {
    return withJobLock({ workspace: this.workspace, jobId }, () => {
      const current = this.readJob(jobId);
      const next = updater(structuredClone(current.state));
      next.stateVersion = current.state.stateVersion + 1;
      next.updatedAt = nowIso();
      assertStateShape(next, current.manifest);
      const jobDirectory = this.jobDirectory(jobId);
      writeAtomicJson(path.join(jobDirectory, "state.json"), next);
      appendEvent(path.join(jobDirectory, "events.ndjson"), {
        jobId,
        eventType: event.eventType,
        actorRole: event.actorRole,
        payload: event.payload(next)
      });
      return this.readJob(jobId, { includeEvents: true });
    });
  }

  verifyOwnerDecisionEvidence(jobId, {
    includePreviews = false,
    allowedStatuses = ["awaiting_owner_decision"],
    previewByteLimit = maximumPreviewBytes,
    totalPreviewByteLimit = maximumTotalPreviewBytes
  } = {}) {
    const job = this.readJob(jobId);
    if (!allowedStatuses.includes(job.state.status)) {
      throw new CanvasHttpError(409, "decision_not_ready", "The local decision step is available only after completion and independent QA submit the job for review.");
    }
    const receipt = job.receipt;
    if (!receipt || receipt.outcome !== "completed_for_review" || receipt.qualityGateStatus !== "not_run" || receipt.artifactReferences.length === 0) {
      throw new CanvasHttpError(409, "decision_receipt_required", "A persisted Coding Agent completion receipt with artifact references and no self-attested QA is required.");
    }

    const jobDirectory = this.jobDirectory(jobId);
    const claim = readRequiredJobJson({
      workspace: this.workspace,
      jobDirectory,
      fileName: "claim.json",
      code: "decision_claim_required",
      label: "The Coding Agent claim"
    });
    if (claim.jobId !== jobId || claim.tenantId !== this.tenantId || claim.workflowId !== job.manifest.workflowId || claim.attemptId !== receipt.attemptId || claim.agentRole !== job.manifest.assignedAgentRole) {
      throw new CanvasHttpError(409, "decision_claim_invalid", "Coding Agent claim does not match the work order and run receipt.");
    }

    const qaVerdict = readRequiredJobJson({
      workspace: this.workspace,
      jobDirectory,
      fileName: "qa-verdict.json",
      code: "decision_qa_required",
      label: "The independent QA verdict"
    });
    assertExactKeysForRecord(qaVerdict, [
      "schemaVersion", "jobId", "tenantId", "workflowId", "attemptId", "reviewerRole", "reviewerCapability", "subjectAgentRole", "reviewedAt", "verdict", "deterministicLintStatus", "artifactBindings", "hardFailureCodes", "softScores", "provenanceComplete", "rubricVersion", "notes", "handoffMode", "externalActionAuthority"
    ], "Independent QA verdict", "decision_qa_invalid");
    if (qaVerdict.schemaVersion !== "1.0.0" || qaVerdict.jobId !== jobId || qaVerdict.tenantId !== this.tenantId || qaVerdict.workflowId !== job.manifest.workflowId || qaVerdict.attemptId !== receipt.attemptId) {
      throw new CanvasHttpError(409, "decision_qa_invalid", "Independent QA verdict identity does not match the work order and receipt.");
    }
    const qualityRole = this.tenantOverview().roleMappings.quality_assurance;
    if (!qualityRole || qaVerdict.reviewerCapability !== "quality_assurance" || qaVerdict.reviewerRole !== qualityRole) {
      throw new CanvasHttpError(409, "decision_reviewer_invalid", "Independent QA reviewer must match the tenant quality_assurance role mapping.");
    }
    if (qaVerdict.reviewerRole === job.manifest.assignedAgentRole || qaVerdict.reviewerRole === receipt.agentRole || qaVerdict.subjectAgentRole !== job.manifest.assignedAgentRole) {
      throw new CanvasHttpError(409, "decision_reviewer_not_independent", "Independent QA reviewer must differ from the assigned content lead.");
    }
    if (qaVerdict.verdict !== "pass" || qaVerdict.deterministicLintStatus !== "passed" || qaVerdict.provenanceComplete !== true || !Array.isArray(qaVerdict.hardFailureCodes) || qaVerdict.hardFailureCodes.length > 0) {
      throw new CanvasHttpError(409, "decision_qa_not_passed", "Owner decision requires a clean independent QA pass with lint, provenance and no hard failures.");
    }
    if (qaVerdict.rubricVersion !== job.manifest.qualityGateVersion || qaVerdict.handoffMode !== "manual_coding_agent" || !Number.isFinite(Date.parse(qaVerdict.reviewedAt))) {
      throw new CanvasHttpError(409, "decision_qa_invalid", "Independent QA rubric, handoff mode or timestamp is invalid.");
    }
    if (typeof qaVerdict.notes !== "string" || qaVerdict.notes.length > 4000) {
      throw new CanvasHttpError(409, "decision_qa_invalid", "Independent QA notes must be bounded text.");
    }
    assertNoExternalAuthority(qaVerdict.externalActionAuthority, "Independent QA verdict");
    assertExactKeysForRecord(qaVerdict.softScores, qualityDimensions, "Independent QA soft scores", "decision_qa_invalid");
    const scores = qualityDimensions.map((dimension) => qaVerdict.softScores[dimension]);
    if (scores.some((score) => !Number.isFinite(score) || score < 3 || score > 5) || scores.reduce((sum, score) => sum + score, 0) / scores.length < 3.25) {
      throw new CanvasHttpError(409, "decision_qa_not_passed", "Independent QA scores do not meet the internal quality threshold.");
    }
    assertArtifactBindingArray(qaVerdict.artifactBindings, "Independent QA verdict");

    const integrity = readRequiredJobJson({
      workspace: this.workspace,
      jobDirectory,
      fileName: "artifact-hashes.json",
      code: "decision_integrity_required",
      label: "The artifact integrity record"
    });
    assertExactKeysForRecord(integrity, ["schemaVersion", "jobId", "tenantId", "attemptId", "algorithm", "artifacts"], "Artifact integrity record", "decision_integrity_invalid");
    if (integrity.schemaVersion !== "1.0.0" || integrity.jobId !== jobId || integrity.tenantId !== this.tenantId || integrity.attemptId !== receipt.attemptId || integrity.algorithm !== "sha256") {
      throw new CanvasHttpError(409, "decision_integrity_invalid", "Artifact integrity record identity or algorithm is invalid.");
    }
    assertArtifactBindingArray(integrity.artifacts, "Artifact integrity record");
    if (JSON.stringify(qaVerdict.artifactBindings) !== JSON.stringify(integrity.artifacts)) {
      throw new CanvasHttpError(409, "decision_integrity_mismatch", "Independent QA bindings do not match the completion integrity record.");
    }
    if (JSON.stringify(receipt.artifactReferences) !== JSON.stringify(integrity.artifacts.map((artifact) => artifact.reference))) {
      throw new CanvasHttpError(409, "decision_integrity_mismatch", "Run receipt references do not exactly match the verified artifacts.");
    }

    const lintReceipt = readRequiredJobJson({
      workspace: this.workspace,
      jobDirectory,
      fileName: deterministicLintFileName,
      code: "decision_lint_required",
      label: "The framework-computed deterministic lint receipt"
    });
    let verifiedLint;
    try {
      verifiedLint = verifyGrowthJobArtifactLint({
        workspace: this.workspace,
        manifest: job.manifest,
        attemptId: receipt.attemptId,
        references: receipt.artifactReferences,
        receipt: lintReceipt
      });
    } catch (error) {
      throw new CanvasHttpError(409, "decision_lint_invalid", error.message);
    }
    if (verifiedLint.status !== "passed" || verifiedLint.hardFailureCodes.length > 0 || JSON.stringify(verifiedLint.artifactBindings) !== JSON.stringify(integrity.artifacts)) {
      throw new CanvasHttpError(409, "decision_lint_not_passed", "Owner decision requires a current framework-computed deterministic lint pass bound to the exact artifact hashes.");
    }

    let previewBytes = 0;
    const artifacts = integrity.artifacts.map((expected) => {
      const filePath = assertSafeArtifactFile({ workspace: this.workspace, reference: expected.reference });
      const captureLimit = includePreviews && previewableExtensions.has(path.extname(expected.reference).toLowerCase())
        ? Math.max(1, Math.min(previewByteLimit, totalPreviewByteLimit - previewBytes))
        : 0;
      const current = hashArtifactFile(filePath, { captureLimit });
      if (current.hash !== expected.hash || current.bytes !== expected.bytes) {
        throw new CanvasHttpError(409, "artifact_integrity_failure", `Artifact changed after independent QA: ${expected.reference}.`);
      }
      let preview = { status: "not_requested", bytes: current.bytes };
      if (includePreviews) {
        preview = artifactPreview({
          buffer: current.previewBuffer,
          reference: expected.reference,
          bytes: current.bytes,
          remainingBytes: totalPreviewByteLimit - previewBytes,
          previewByteLimit,
          totalPreviewByteLimit
        });
        if (preview.status === "available") previewBytes += current.bytes;
      }
      return { reference: expected.reference, hash: current.hash, bytes: current.bytes, preview };
    });
    const verifiedAt = nowIso();
    return {
      schemaVersion: "1.0.0",
      jobId,
      tenantId: this.tenantId,
      workflowId: job.manifest.workflowId,
      recordStatus: job.state.status,
      readyForOwnerDecision: job.state.status === "awaiting_owner_decision",
      verification: {
        receipt: "verified",
        independentQa: "verified",
        deterministicLint: "verified",
        reviewerSeparation: "verified",
        artifactIntegrity: "verified",
        verifiedAt
      },
      receipt: {
        attemptId: receipt.attemptId,
        agentRole: receipt.agentRole,
        outcome: receipt.outcome,
        qualityGateStatus: receipt.qualityGateStatus,
        startedAt: receipt.startedAt,
        finishedAt: receipt.finishedAt,
        artifactReferences: [...receipt.artifactReferences]
      },
      qa: {
        attemptId: qaVerdict.attemptId,
        reviewerRole: qaVerdict.reviewerRole,
        reviewerCapability: qaVerdict.reviewerCapability,
        subjectAgentRole: qaVerdict.subjectAgentRole,
        reviewedAt: qaVerdict.reviewedAt,
        verdict: qaVerdict.verdict,
        deterministicLintStatus: qaVerdict.deterministicLintStatus,
        hardFailureCodes: [...qaVerdict.hardFailureCodes],
        softScores: { ...qaVerdict.softScores },
        provenanceComplete: qaVerdict.provenanceComplete,
        rubricVersion: qaVerdict.rubricVersion,
        notes: qaVerdict.notes
      },
      deterministicLint: {
        validatorVersion: verifiedLint.validatorVersion,
        evaluatedAt: verifiedLint.evaluatedAt,
        status: verifiedLint.status,
        hardFailureCodes: [...verifiedLint.hardFailureCodes],
        contextBindings: verifiedLint.contextBindings.map((binding) => ({ ...binding }))
      },
      artifacts,
      evidence: {
        inputArtifactReferences: [...job.manifest.inputArtifactReferences],
        allowedDataClasses: [...job.manifest.allowedDataClasses],
        qualityGateVersion: job.manifest.qualityGateVersion,
        hardStop: job.manifest.hardStop
      },
      checklist: [...job.manifest.managerReview.checklist],
      externalActionAuthority
    };
  }

  readReviewBundle(jobId) {
    return this.verifyOwnerDecisionEvidence(jobId, { includePreviews: true });
  }

  readContentRecord(jobId) {
    const job = this.readJob(jobId, { includeEvents: true });
    const review = this.verifyOwnerDecisionEvidence(jobId, {
      includePreviews: true,
      allowedStatuses: ["awaiting_owner_decision", "accepted_internal", "revision_requested"],
      previewByteLimit: maximumContentRecordPreviewBytes,
      totalPreviewByteLimit: maximumContentRecordTotalPreviewBytes
    });
    const versionsByAttempt = new Map();
    const ensureVersion = (attemptId, occurredAt) => {
      if (!attemptId) return null;
      if (!versionsByAttempt.has(attemptId)) {
        versionsByAttempt.set(attemptId, {
          attemptId,
          startedAt: occurredAt || null,
          completedAt: null,
          qaVerdict: null,
          qaReviewedAt: null,
          ownerDecision: null,
          ownerDecisionReason: null,
          ownerDecidedAt: null,
          isCurrent: attemptId === review.receipt.attemptId
        });
      }
      return versionsByAttempt.get(attemptId);
    };
    const decisionHistory = [];
    const activity = [];
    for (const event of job.events || []) {
      const payload = objectOrEmpty(event.payload);
      const attemptId = payload.attemptId || payload.receiptAttemptId || null;
      const version = ensureVersion(attemptId, event.occurredAt);
      if (version && ["agent.completed", "agent.failed", "agent.cancelled"].includes(event.eventType)) version.completedAt = event.occurredAt;
      if (version && event.eventType === "qa.verdict_recorded") {
        version.qaVerdict = payload.verdict || null;
        version.qaReviewedAt = event.occurredAt;
      }
      if (event.eventType === "owner.decision_recorded") {
        if (version) {
          version.ownerDecision = payload.decision || null;
          version.ownerDecisionReason = payload.reason || null;
          version.ownerDecidedAt = event.occurredAt;
        }
        decisionHistory.push({
          decision: payload.decision || null,
          reason: payload.reason || null,
          status: payload.status || null,
          attemptId,
          actorRole: event.actorRole,
          decidedAt: event.occurredAt
        });
      }
      activity.push({
        eventType: event.eventType,
        actorRole: event.actorRole,
        occurredAt: event.occurredAt,
        attemptId,
        status: payload.status || null
      });
    }
    ensureVersion(review.receipt.attemptId, review.receipt.startedAt);
    const versions = [...versionsByAttempt.values()]
      .sort((left, right) => String(left.startedAt || "").localeCompare(String(right.startedAt || "")))
      .map((version, index) => ({ ...version, number: index + 1 }));
    return {
      schemaVersion: "1.0.0",
      jobId,
      recordStatus: job.state.status,
      title: job.state.title,
      campaignSummary: job.state.campaignSummary,
      managerTaskDescription: job.state.managerTaskDescription,
      createdAt: job.state.createdAt,
      updatedAt: job.state.updatedAt,
      ownerDecision: job.state.ownerDecision || null,
      review,
      versions,
      decisionHistory: decisionHistory.reverse(),
      activity: activity.reverse(),
      externalActionAuthority
    };
  }

  recordOwnerDecision(jobId, { decision, reason }) {
    if (!["accept", "revise", "block"].includes(decision)) {
      throw new CanvasHttpError(400, "invalid_decision", "Decision must be accept, revise, or block.");
    }
    const normalizedReason = assertString(reason, "reason", { required: true, maxLength: 2000 });
    const nextStatus = { accept: "accepted_internal", revise: "revision_requested", block: "blocked" }[decision];
    return withJobLock({ workspace: this.workspace, jobId }, () => {
      const verified = this.verifyOwnerDecisionEvidence(jobId, { includePreviews: false });
      return this.updateState(
        jobId,
        (state) => {
          if (state.status !== "awaiting_owner_decision") {
            throw new CanvasHttpError(409, "decision_not_ready", "The local decision step is available only after independent QA submits the job for review.");
          }
          const decidedAt = nowIso();
          return {
            ...state,
            status: nextStatus,
            ownerDecision: { decision, reason: normalizedReason, actorRole: "owner", decidedAt }
          };
        },
        {
          eventType: "owner.decision_recorded",
          actorRole: "owner",
          payload: (state) => ({
            decision,
            reason: normalizedReason,
            status: state.status,
            ownerDecisionBoundary,
            evidenceVerifiedAt: verified.verification.verifiedAt,
            receiptAttemptId: verified.receipt.attemptId,
            qaReviewerRole: verified.qa.reviewerRole,
            qaReviewedAt: verified.qa.reviewedAt,
            artifactHashes: verified.artifacts.map(({ reference, hash, bytes }) => ({ reference, hash, bytes }))
          })
        }
      );
    });
  }

  cancelJob(jobId, { reason }) {
    const normalizedReason = assertString(reason, "reason", { required: true, maxLength: 2000 });
    return withJobLock({ workspace: this.workspace, jobId }, () => this.updateState(
      jobId,
      (state) => {
        if (["accepted_internal", "blocked", "cancelled", "failed"].includes(state.status)) {
          throw new CanvasHttpError(409, "terminal_job", `Job cannot be cancelled from ${state.status}.`);
        }
        const cancelledAt = nowIso();
        return {
          ...state,
          status: "cancelled",
          cancellation: { reason: normalizedReason, actorRole: "owner", cancelledAt }
        };
      },
      {
        eventType: "job.cancelled",
        actorRole: "owner",
        payload: (state) => ({ reason: normalizedReason, status: state.status, ownerDecisionBoundary })
      }
    ));
  }
}

export const createCanvasWorkspaceStore = (options) => new CanvasWorkspaceStore(options);
export { externalActionAuthority, ownerDecisionBoundary, writeAtomicJson };
