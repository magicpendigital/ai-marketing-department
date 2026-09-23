import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createCanvasWorkspaceStore,
  externalActionAuthority,
  withJobLock
} from "../packages/growth-canvas/server/workspace-store.mjs";

const modulePath = fileURLToPath(import.meta.url);
const attemptIdPattern = /^[a-z][a-z0-9-]{2,79}$/;
const minimumLeaseSeconds = 60;
const maximumLeaseSeconds = 24 * 60 * 60;

const valueFor = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
};

const asIsoDate = (value, label) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid date.`);
  return date;
};

const readRegularJson = (filePath) => {
  const entry = fs.lstatSync(filePath);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`Unsafe job record: ${filePath}`);
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

const sha256File = (filePath) => `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;

const assertDirectory = (directory, label) => {
  const entry = fs.lstatSync(directory);
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`${label} must be a real directory.`);
};

const copySafeTree = (source, destination) => {
  const sourceEntry = fs.lstatSync(source);
  if (sourceEntry.isSymbolicLink()) throw new Error(`Revision archive may not copy a symbolic link or junction: ${source}`);
  if (sourceEntry.isFile()) {
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    return;
  }
  if (!sourceEntry.isDirectory()) throw new Error(`Revision archive supports regular files and directories only: ${source}`);
  fs.mkdirSync(destination, { mode: 0o700 });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Revision archive may not copy a symbolic link or junction: ${path.join(source, entry.name)}`);
    copySafeTree(path.join(source, entry.name), path.join(destination, entry.name));
  }
};

const listArchiveFiles = (root, current = root) => {
  const records = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const candidate = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Revision archive contains a symbolic link or junction: ${candidate}`);
    if (entry.isDirectory()) records.push(...listArchiveFiles(root, candidate));
    else if (entry.isFile()) records.push({ path: path.relative(root, candidate).split(path.sep).join("/"), hash: sha256File(candidate), bytes: fs.statSync(candidate).size });
    else throw new Error(`Revision archive contains an unsupported entry: ${candidate}`);
  }
  return records.sort((left, right) => left.path.localeCompare(right.path));
};

const assertArchiveIntegrity = (archiveDirectory, manifest) => {
  if (!Array.isArray(manifest.records)) throw new Error("Attempt archive manifest records are invalid.");
  const actualRecords = listArchiveFiles(archiveDirectory).filter(({ path: relativePath }) => relativePath !== "archive-manifest.json");
  if (JSON.stringify(actualRecords) !== JSON.stringify(manifest.records)) {
    throw new Error("Attempt archive contents no longer match the committed archive manifest.");
  }
};

const ensureAttemptsDirectory = (jobDirectory) => {
  const attemptsDirectory = path.join(jobDirectory, "attempts");
  if (!fs.existsSync(attemptsDirectory)) fs.mkdirSync(attemptsDirectory, { mode: 0o700 });
  assertDirectory(attemptsDirectory, "Job attempts directory");
  return attemptsDirectory;
};

const activeAttemptRecordNames = ["claim.json", "run-receipt.json", "artifact-hashes.json", "deterministic-lint.json", "qa-verdict.json", "completion-lock.json"];

const cleanupCommittedAttempt = ({ jobDirectory, manifest, removeActiveArtifacts }) => {
  const archivedRecords = new Map((manifest.records || []).map((record) => [record.path, record]));
  const activeRecordPaths = [];
  for (const name of activeAttemptRecordNames) {
    const activePath = path.join(jobDirectory, name);
    if (!fs.existsSync(activePath)) continue;
    const archived = archivedRecords.get(name);
    const activeEntry = fs.lstatSync(activePath);
    if (!archived || !activeEntry.isFile() || activeEntry.isSymbolicLink() || archived.hash !== sha256File(activePath) || archived.bytes !== activeEntry.size) {
      throw new Error(`Active attempt record differs from the committed archive and will not be removed: ${name}`);
    }
    activeRecordPaths.push(activePath);
  }

  const artifactsDirectory = path.join(jobDirectory, "artifacts");
  if (removeActiveArtifacts && fs.existsSync(artifactsDirectory)) {
    assertDirectory(artifactsDirectory, "Active attempt artifacts directory");
    const activeArtifactRecords = listArchiveFiles(artifactsDirectory).map((record) => ({ ...record, path: `artifacts/${record.path}` }));
    const archivedArtifactRecords = (manifest.records || []).filter(({ path: relativePath }) => relativePath.startsWith("artifacts/"));
    if (JSON.stringify(activeArtifactRecords) !== JSON.stringify(archivedArtifactRecords)) {
      throw new Error("Active attempt artifact bytes differ from the committed archive and will not be removed.");
    }
  }

  for (const activePath of activeRecordPaths) fs.rmSync(activePath);
  if (removeActiveArtifacts && fs.existsSync(artifactsDirectory)) fs.rmSync(artifactsDirectory, { recursive: true });
};

const archiveAttempt = ({
  store,
  job,
  claim,
  archiveReason = "revision_retry",
  supersededByAttemptId = null,
  archivedAt = new Date(),
  removeActiveArtifacts = false
}) => {
  const jobDirectory = store.jobDirectory(job.jobId);
  const attemptsDirectory = ensureAttemptsDirectory(jobDirectory);
  const archiveDirectory = path.join(attemptsDirectory, claim.attemptId);
  if (fs.existsSync(archiveDirectory)) {
    assertDirectory(archiveDirectory, "Attempt archive");
    const manifest = readRegularJson(path.join(archiveDirectory, "archive-manifest.json"));
    if (manifest.attemptId !== claim.attemptId || manifest.jobId !== job.jobId) throw new Error("Existing attempt archive identity is invalid.");
    if (manifest.archiveReason && manifest.archiveReason !== archiveReason) throw new Error("Existing attempt archive reason is invalid for this recovery path.");
    if (supersededByAttemptId && manifest.supersededByAttemptId && manifest.supersededByAttemptId !== supersededByAttemptId) {
      throw new Error(`Expired attempt recovery is already assigned to ${manifest.supersededByAttemptId}.`);
    }
    assertArchiveIntegrity(archiveDirectory, manifest);
    cleanupCommittedAttempt({ jobDirectory, manifest, removeActiveArtifacts });
    return {
      previousAttemptId: claim.attemptId,
      archiveRelativePath: `operations/jobs/${job.jobId}/attempts/${claim.attemptId}`,
      archiveReason: manifest.archiveReason || archiveReason,
      previousLeaseExpiresAt: manifest.previousLeaseExpiresAt || claim.leaseExpiresAt,
      supersededByAttemptId: manifest.supersededByAttemptId || supersededByAttemptId
    };
  }

  const temporaryDirectory = path.join(attemptsDirectory, `.archive-${claim.attemptId}-${crypto.randomUUID()}`);
  fs.mkdirSync(temporaryDirectory, { mode: 0o700 });
  try {
    for (const name of activeAttemptRecordNames) {
      const source = path.join(jobDirectory, name);
      if (fs.existsSync(source)) copySafeTree(source, path.join(temporaryDirectory, name));
    }
    const artifactsDirectory = path.join(jobDirectory, "artifacts");
    if (fs.existsSync(artifactsDirectory)) copySafeTree(artifactsDirectory, path.join(temporaryDirectory, "artifacts"));
    const stateSnapshotName = archiveReason === "expired_lease_reclaim" ? "state-before-reclaim.json" : "state-before-retry.json";
    writeExclusiveJson(path.join(temporaryDirectory, stateSnapshotName), job.state);
    const archiveManifest = {
      schemaVersion: "1.0.0",
      jobId: job.jobId,
      tenantId: job.manifest.tenantId,
      workflowId: job.manifest.workflowId,
      attemptId: claim.attemptId,
      archiveReason,
      supersededByAttemptId,
      previousLeaseExpiresAt: claim.leaseExpiresAt,
      archivedFromStatus: job.state.status,
      archivedStateVersion: job.state.stateVersion,
      archivedAt: asIsoDate(archivedAt, "Archive time").toISOString(),
      records: listArchiveFiles(temporaryDirectory),
      externalActionAuthority
    };
    writeExclusiveJson(path.join(temporaryDirectory, "archive-manifest.json"), archiveManifest);
    fs.renameSync(temporaryDirectory, archiveDirectory);
  } catch (error) {
    if (fs.existsSync(temporaryDirectory)) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
  const committedManifest = readRegularJson(path.join(archiveDirectory, "archive-manifest.json"));
  assertArchiveIntegrity(archiveDirectory, committedManifest);
  cleanupCommittedAttempt({ jobDirectory, manifest: committedManifest, removeActiveArtifacts });
  return {
    previousAttemptId: claim.attemptId,
    archiveRelativePath: `operations/jobs/${job.jobId}/attempts/${claim.attemptId}`,
    archiveReason,
    previousLeaseExpiresAt: claim.leaseExpiresAt,
    supersededByAttemptId
  };
};

const listCommittedAttemptArchives = (jobDirectory, jobId) => {
  const attemptsDirectory = path.join(jobDirectory, "attempts");
  if (!fs.existsSync(attemptsDirectory)) return [];
  assertDirectory(attemptsDirectory, "Job attempts directory");
  return fs.readdirSync(attemptsDirectory, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith(".")).map((entry) => {
    const manifest = readRegularJson(path.join(attemptsDirectory, entry.name, "archive-manifest.json"));
    if (manifest.jobId !== jobId || manifest.attemptId !== entry.name) throw new Error("Attempt archive identity is invalid.");
    assertArchiveIntegrity(path.join(attemptsDirectory, entry.name), manifest);
    return {
      attemptId: entry.name,
      manifest,
      archiveDirectory: path.join(attemptsDirectory, entry.name),
      archivedAt: Date.parse(manifest.archivedAt || ""),
      archivedStateVersion: Number.isInteger(manifest.archivedStateVersion) ? manifest.archivedStateVersion : -1
    };
  }).sort((left, right) => right.archivedStateVersion - left.archivedStateVersion || right.archivedAt - left.archivedAt || right.attemptId.localeCompare(left.attemptId));
};

const recoverArchivedRevision = (jobDirectory, jobId) => {
  const attempts = listCommittedAttemptArchives(jobDirectory, jobId).filter(({ manifest }) => !manifest.archiveReason || manifest.archiveReason === "revision_retry");
  if (attempts.length === 0 || !Number.isFinite(attempts[0].archivedAt)) throw new Error(`Job ${jobId} has no completed attempt archive to retry.`);
  const previousAttemptId = attempts[0].attemptId;
  return { previousAttemptId, archiveRelativePath: `operations/jobs/${jobId}/attempts/${previousAttemptId}` };
};

const recoverArchivedExpiredClaim = ({ jobDirectory, jobId, attemptId, now }) => {
  const attempts = listCommittedAttemptArchives(jobDirectory, jobId).filter(({ manifest }) => manifest.archiveReason === "expired_lease_reclaim");
  if (attempts.length === 0) throw new Error(`Job ${jobId} has no committed expired-claim archive to recover.`);
  const latest = attempts[0];
  if (latest.manifest.supersededByAttemptId !== attemptId) {
    throw new Error(`Expired attempt recovery is already assigned to ${latest.manifest.supersededByAttemptId || "another attempt"}.`);
  }
  if (latest.attemptId === attemptId) throw new Error("An expired claim may be reclaimed only with a distinct new attempt id.");
  const previousLeaseExpiresAt = Date.parse(latest.manifest.previousLeaseExpiresAt || "");
  if (!Number.isFinite(previousLeaseExpiresAt) || now.getTime() <= previousLeaseExpiresAt) {
    throw new Error("Committed expired-claim archive does not contain an expired prior lease.");
  }
  return {
    previousAttemptId: latest.attemptId,
    archiveRelativePath: `operations/jobs/${jobId}/attempts/${latest.attemptId}`,
    archiveReason: "expired_lease_reclaim",
    previousLeaseExpiresAt: latest.manifest.previousLeaseExpiresAt,
    supersededByAttemptId: attemptId
  };
};

const assertClaimShape = (claim, job) => {
  const exactKeys = ["schemaVersion", "jobId", "tenantId", "workflowId", "attemptId", "agentRole", "status", "claimedAt", "leaseExpiresAt", "handoffMode", "credentialPolicy", "externalActionAuthority"];
  if (!claim || typeof claim !== "object" || Array.isArray(claim)) throw new Error("Job claim must be a JSON object.");
  const unknownKeys = Object.keys(claim).filter((key) => !exactKeys.includes(key));
  const missingKeys = exactKeys.filter((key) => !(key in claim));
  if (unknownKeys.length > 0 || missingKeys.length > 0) throw new Error("Job claim shape is invalid.");
  if (claim.schemaVersion !== "1.0.0" || claim.status !== "active") throw new Error("Job claim version or status is invalid.");
  if (claim.jobId !== job.manifest.jobId || claim.tenantId !== job.manifest.tenantId || claim.workflowId !== job.manifest.workflowId) {
    throw new Error("Job claim identity does not match the immutable manifest.");
  }
  if (!attemptIdPattern.test(claim.attemptId || "")) throw new Error("Job claim attempt id is invalid.");
  if (claim.agentRole !== job.manifest.assignedAgentRole) throw new Error("Job claim agent role does not match the assigned work-order role.");
  if (claim.handoffMode !== "manual_coding_agent" || claim.credentialPolicy !== "framework_accepts_no_provider_credentials") {
    throw new Error("Job claim handoff boundary is invalid.");
  }
  const authorityKeys = Object.keys(externalActionAuthority);
  if (!claim.externalActionAuthority || typeof claim.externalActionAuthority !== "object" || Array.isArray(claim.externalActionAuthority) || Object.keys(claim.externalActionAuthority).length !== authorityKeys.length || authorityKeys.some((key) => claim.externalActionAuthority[key] !== false)) {
    throw new Error("Job claim may not grant external action authority.");
  }
  const claimedAt = Date.parse(claim.claimedAt);
  const leaseExpiresAt = Date.parse(claim.leaseExpiresAt);
  if (!Number.isFinite(claimedAt) || !Number.isFinite(leaseExpiresAt) || leaseExpiresAt <= claimedAt) {
    throw new Error("Job claim lease is invalid.");
  }
  return claim;
};

export const readGrowthJobClaim = ({ workspace, jobId }) => {
  const store = createCanvasWorkspaceStore({ workspace });
  const job = store.readJob(jobId);
  const claimPath = path.join(store.jobDirectory(jobId), "claim.json");
  return assertClaimShape(readRegularJson(claimPath), job);
};

const transitionToInProgress = ({ store, jobId, claim, agentRole, expectedStatus = "ready_for_agent", retryContext = null, reclaimContext = null }) => store.updateState(
  jobId,
  (state) => {
    if (state.status !== expectedStatus) {
      throw new Error(`Job ${jobId} can be claimed only from ${expectedStatus}; current status is ${state.status}.`);
    }
    if (expectedStatus === "revision_requested") {
      const { ownerDecision, ...stateWithoutPriorDecision } = state;
      return { ...stateWithoutPriorDecision, status: "in_progress" };
    }
    return { ...state, status: "in_progress" };
  },
  {
    eventType: reclaimContext ? "agent.expired_claim_reclaimed" : retryContext ? "agent.revision_claimed" : "agent.claimed",
    actorRole: agentRole,
    payload: (state) => ({
      status: state.status,
      attemptId: claim.attemptId,
      leaseExpiresAt: claim.leaseExpiresAt,
      handoffMode: claim.handoffMode,
      ...(retryContext || {}),
      ...(reclaimContext ? {
        recoveryReason: "expired_claim_lease",
        previousAttemptId: reclaimContext.previousAttemptId,
        previousLeaseExpiresAt: reclaimContext.previousLeaseExpiresAt,
        archiveRelativePath: reclaimContext.archiveRelativePath,
        supersededByAttemptId: claim.attemptId
      } : {}),
      externalActionAuthority
    })
  }
);

const claimGrowthJobUnlocked = ({ workspace, jobId, attemptId = `attempt-${crypto.randomUUID()}`, leaseSeconds = 60 * 60, now = new Date() }) => {
  if (!attemptIdPattern.test(attemptId || "")) throw new Error("Attempt id must use 3–80 lowercase letters, digits, or hyphens and start with a letter.");
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < minimumLeaseSeconds || leaseSeconds > maximumLeaseSeconds) {
    throw new Error(`Lease must be an integer from ${minimumLeaseSeconds} to ${maximumLeaseSeconds} seconds.`);
  }

  const claimedAtDate = asIsoDate(now, "Claim time");
  const store = createCanvasWorkspaceStore({ workspace });
  const current = store.readJob(jobId, { includeEvents: true });
  const claimPath = path.join(store.jobDirectory(jobId), "claim.json");

  let retryContext = null;
  let reclaimContext = null;
  if (current.state.status === "revision_requested") {
    if (fs.existsSync(claimPath)) {
      const previousClaim = assertClaimShape(readRegularJson(claimPath), current);
      const hasCompletedAttemptRecords = activeAttemptRecordNames.slice(1).some((name) => fs.existsSync(path.join(store.jobDirectory(jobId), name)));
      if (!hasCompletedAttemptRecords) {
        const archivedRevision = recoverArchivedRevision(store.jobDirectory(jobId), jobId);
        if (archivedRevision.previousAttemptId !== previousClaim.attemptId) {
          if (previousClaim.attemptId !== attemptId) throw new Error(`Job ${jobId} is already claimed by attempt ${previousClaim.attemptId}.`);
          const recovered = transitionToInProgress({ store, jobId, claim: previousClaim, agentRole: previousClaim.agentRole, expectedStatus: "revision_requested", retryContext: archivedRevision });
          return { job: recovered, claim: previousClaim, idempotent: true };
        }
      }
      if (previousClaim.attemptId === attemptId) throw new Error("A revision retry requires a new attempt id.");
      retryContext = archiveAttempt({ store, job: current, claim: previousClaim, supersededByAttemptId: attemptId, archivedAt: claimedAtDate });
    } else {
      retryContext = recoverArchivedRevision(store.jobDirectory(jobId), jobId);
      if (retryContext.previousAttemptId === attemptId) throw new Error("A revision retry requires a new attempt id.");
    }
  }

  if (fs.existsSync(claimPath)) {
    const existing = assertClaimShape(readRegularJson(claimPath), current);
    const leaseExpired = claimedAtDate.getTime() > Date.parse(existing.leaseExpiresAt);
    if (leaseExpired && ["ready_for_agent", "in_progress"].includes(current.state.status)) {
      if (existing.attemptId === attemptId) {
        throw new Error("An expired claim may be reclaimed only with a distinct new attempt id; the expired attempt is never silently renewed.");
      }
      reclaimContext = archiveAttempt({
        store,
        job: current,
        claim: existing,
        archiveReason: "expired_lease_reclaim",
        supersededByAttemptId: attemptId,
        archivedAt: claimedAtDate,
        removeActiveArtifacts: true
      });
    } else {
      if (existing.attemptId === attemptId && current.state.status === "in_progress") {
        const hasReclaimEvent = current.events.some((event) => event.eventType === "agent.expired_claim_reclaimed" && event.payload?.attemptId === attemptId);
        const recoveryArchive = listCommittedAttemptArchives(store.jobDirectory(jobId), jobId).find(({ manifest }) => manifest.archiveReason === "expired_lease_reclaim" && manifest.supersededByAttemptId === attemptId);
        if (recoveryArchive && !hasReclaimEvent) {
          reclaimContext = recoverArchivedExpiredClaim({ jobDirectory: store.jobDirectory(jobId), jobId, attemptId, now: claimedAtDate });
          const recovered = transitionToInProgress({ store, jobId, claim: existing, agentRole: existing.agentRole, expectedStatus: "in_progress", reclaimContext });
          return { job: recovered, claim: existing, idempotent: true, reclaimed: true, recovery: reclaimContext };
        }
        return { job: current, claim: existing, idempotent: true, reclaimed: hasReclaimEvent };
      }
      if (existing.attemptId === attemptId && current.state.status === "ready_for_agent") {
        const recovered = transitionToInProgress({ store, jobId, claim: existing, agentRole: existing.agentRole });
        return { job: recovered, claim: existing, idempotent: true, reclaimed: false };
      }
      throw new Error(`Job ${jobId} is already claimed by attempt ${existing.attemptId}.`);
    }
  }

  if (!fs.existsSync(claimPath) && current.state.status === "in_progress" && !reclaimContext) {
    reclaimContext = recoverArchivedExpiredClaim({ jobDirectory: store.jobDirectory(jobId), jobId, attemptId, now: claimedAtDate });
  }
  if (!["ready_for_agent", "revision_requested"].includes(current.state.status) && !(current.state.status === "in_progress" && reclaimContext)) {
    throw new Error(`Job ${jobId} can be claimed only from ready_for_agent, revision_requested, or an expired in_progress claim; current status is ${current.state.status}.`);
  }

  const leaseExpiresAtDate = new Date(claimedAtDate.getTime() + leaseSeconds * 1000);
  const claim = {
    schemaVersion: "1.0.0",
    jobId,
    tenantId: current.manifest.tenantId,
    workflowId: current.manifest.workflowId,
    attemptId,
    agentRole: current.manifest.assignedAgentRole,
    status: "active",
    claimedAt: claimedAtDate.toISOString(),
    leaseExpiresAt: leaseExpiresAtDate.toISOString(),
    handoffMode: "manual_coding_agent",
    credentialPolicy: "framework_accepts_no_provider_credentials",
    externalActionAuthority
  };

  try {
    writeExclusiveJson(claimPath, claim);
  } catch (error) {
    if (error?.code === "EEXIST") {
      const existing = assertClaimShape(readRegularJson(claimPath), store.readJob(jobId));
      const latest = store.readJob(jobId);
      if (existing.attemptId === attemptId && latest.state.status === "in_progress") {
        if (claimedAtDate.getTime() > Date.parse(existing.leaseExpiresAt)) throw new Error("An expired claim may not be returned as an idempotent success.");
        return { job: latest, claim: existing, idempotent: true, reclaimed: Boolean(reclaimContext), ...(reclaimContext ? { recovery: reclaimContext } : {}) };
      }
      if (existing.attemptId === attemptId && latest.state.status === "ready_for_agent") {
        const recovered = transitionToInProgress({ store, jobId, claim: existing, agentRole: existing.agentRole });
        return { job: recovered, claim: existing, idempotent: true };
      }
      throw new Error(`Job ${jobId} already has an active claim.`);
    }
    throw error;
  }

  try {
    const job = transitionToInProgress({ store, jobId, claim, agentRole: current.manifest.assignedAgentRole, expectedStatus: current.state.status, retryContext, reclaimContext });
    return { job, claim, idempotent: false, reclaimed: Boolean(reclaimContext), ...(reclaimContext ? { recovery: reclaimContext } : {}) };
  } catch (error) {
    try {
      const persisted = readRegularJson(claimPath);
      const latest = store.readJob(jobId);
      if (persisted.attemptId === attemptId && latest.state.status === "in_progress") {
        return { job: latest, claim: persisted, idempotent: true, reclaimed: Boolean(reclaimContext), ...(reclaimContext ? { recovery: reclaimContext } : {}) };
      }
      if (persisted.attemptId === attemptId) fs.rmSync(claimPath, { force: true });
    } catch {
      // Keep the original state-transition error as the actionable result.
    }
    throw error;
  }
};

export const claimGrowthJob = (options) => withJobLock(
  { workspace: options.workspace, jobId: options.jobId },
  () => claimGrowthJobUnlocked(options)
);

const runAsCli = () => {
  const workspace = valueFor("--workspace") || process.env.GROWTH_CANVAS_WORKSPACE;
  const jobId = valueFor("--job-id");
  const attemptId = valueFor("--attempt-id") || undefined;
  const leaseText = valueFor("--lease-seconds");
  const leaseSeconds = leaseText === null ? undefined : Number(leaseText);
  if (!workspace || !jobId) {
    console.error("Use --workspace <private-tenant-directory> --job-id <job-id> [--attempt-id <safe-id>] [--lease-seconds 60..86400].");
    process.exit(1);
  }
  try {
    const result = claimGrowthJob({ workspace, jobId, attemptId, ...(leaseSeconds === undefined ? {} : { leaseSeconds }) });
    console.log(JSON.stringify({
      jobId,
      attemptId: result.claim.attemptId,
      status: result.job.state.status,
      leaseExpiresAt: result.claim.leaseExpiresAt,
      idempotent: result.idempotent,
      reclaimed: result.reclaimed === true,
      ...(result.recovery ? {
        previousAttemptId: result.recovery.previousAttemptId,
        archiveRelativePath: result.recovery.archiveRelativePath
      } : {})
    }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
};

if (path.resolve(process.argv[1] || "") === path.resolve(modulePath)) runAsCli();
