import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  containsSensitiveData,
  containsSensitiveInference,
  containsSensitiveTargeting,
  hasText,
  lintCandidate,
  validateContractInstance
} from "../../scripts/growth-framework-validator.mjs";

const modulePath = fileURLToPath(import.meta.url);
const frameworkRoot = path.resolve(path.dirname(modulePath), "../..");
const artifactReferencePattern = /^(?![A-Za-z]:)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const credentialPattern = /(?:provider_api_key|oauth_token|subscription_token|authorization\s*:\s*bearer|\bsk-[a-z0-9_-]{12,}|\b(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*[^\s"',}]+)/i;
const placeholderPattern = /__[A-Z0-9][A-Z0-9_-]*__/i;
const internalClaimStatuses = new Set(["internal_only", "verified_internal_only", "qa_pass_pending_human"]);
const internalClaimSurfaces = new Set(["internal_draft_only", "draft_internal", "qa_pass_pending_human", "internal_draft"]);
const internalArtifactStatuses = new Set(["draft_internal", "reviewed_internal", "blocked"]);
const internalLifecycleStates = new Set(["draft_internal", "qa_pass_pending_human", "human_reviewed_internal", "blocked"]);
const disabledExternalAuthority = Object.freeze({ publish: false, send: false, schedule: false, createCampaign: false, uploadAudience: false, spend: false });

export const deterministicLintFileName = "deterministic-lint.json";
export const deterministicLintValidatorVersion = "growth_job_artifact_lint_1";

const sha256 = (buffer) => `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`;
const canonicalJson = (value) => JSON.stringify(value);
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const assertSafeWorkspace = (workspace) => {
  const resolved = path.resolve(workspace || "");
  const entry = fs.lstatSync(resolved);
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error("Deterministic lint requires a regular private tenant workspace directory.");
  return fs.realpathSync.native(resolved);
};

const readBoundFile = (workspace, reference) => {
  if (typeof reference !== "string" || reference.includes("\\") || !artifactReferencePattern.test(reference)) {
    throw new Error(`Deterministic lint contains an unsafe artifact reference: ${reference}.`);
  }
  const root = assertSafeWorkspace(workspace);
  const candidate = path.resolve(root, ...reference.split("/"));
  const relative = path.relative(root, candidate);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Deterministic lint artifact escapes the tenant workspace: ${reference}.`);
  }
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const entry = fs.lstatSync(current);
    if (entry.isSymbolicLink()) throw new Error(`Deterministic lint artifact traverses a symbolic link or junction: ${reference}.`);
  }
  const entry = fs.lstatSync(candidate);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`Deterministic lint artifact must be a regular file: ${reference}.`);
  const physical = fs.realpathSync.native(candidate);
  if (path.relative(root, physical).startsWith("..")) throw new Error(`Deterministic lint artifact escapes the physical tenant workspace: ${reference}.`);
  const buffer = fs.readFileSync(physical);
  return { reference, buffer, hash: sha256(buffer), bytes: buffer.length };
};

const readContextJson = (workspace, reference) => {
  const bound = readBoundFile(workspace, reference);
  let value;
  try {
    value = JSON.parse(bound.buffer.toString("utf8"));
  } catch (error) {
    throw new Error(`${reference} must be valid JSON for deterministic lint (${error.message}).`);
  }
  return { ...bound, value };
};

const collectCopyText = (value, output = []) => {
  if (Array.isArray(value)) {
    for (const item of value) collectCopyText(item, output);
    return output;
  }
  if (!isPlainObject(value)) return output;
  for (const [key, child] of Object.entries(value)) {
    if (["headline", "body", "caption", "cta", "altText"].includes(key) && hasText(child)) output.push(child);
    else collectCopyText(child, output);
  }
  return output;
};

const collectClaims = (productTruth) => {
  const claims = new Map();
  for (const feature of productTruth?.features || []) {
    const evidence = new Map((feature.evidence || []).map((item) => [item.id, item]));
    for (const claim of feature.claims || []) claims.set(claim.id, { claim, feature, evidence });
  }
  return claims;
};

const isCurrentOrFutureDate = (value, evaluatedAt) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && value >= evaluatedAt.slice(0, 10);

const hasDisabledExternalAuthority = (authority) => isPlainObject(authority)
  && Object.keys(disabledExternalAuthority).every((key) => authority[key] === false)
  && Object.keys(authority).length === Object.keys(disabledExternalAuthority).length;

const lintConceptPackage = ({ value, reference, manifest, tenant, evaluatedAt }) => {
  const errors = validateContractInstance(frameworkRoot, "schemas/asset-package.schema.json", value, reference);
  const hardFailures = new Set();
  if (errors.length > 0) hardFailures.add("artifact_contract_invalid");
  if (value.tenantId !== manifest.tenantId || value.artifactKind !== manifest.outputArtifactType) {
    errors.push(`${reference}: tenantId and artifactKind must match the work order.`);
    hardFailures.add("artifact_contract_invalid");
  }
  if (!internalArtifactStatuses.has(value.status) || !internalLifecycleStates.has(value.lifecycleState)) {
    errors.push(`${reference}: status and lifecycleState must remain inside the internal review boundary.`);
    hardFailures.add("artifact_contract_invalid");
  }
  if (!["not_submitted", "blocked"].includes(value.approval?.status) || value.externalReadiness?.status !== "blocked") {
    errors.push(`${reference}: approval and external readiness must remain blocked or not submitted.`);
    hardFailures.add("artifact_contract_invalid");
  }
  if (!hasDisabledExternalAuthority(value.externalReadiness?.externalActionAuthority)) {
    errors.push(`${reference}: externalActionAuthority must explicitly disable every external action.`);
    hardFailures.add("artifact_contract_invalid");
  }

  const requiredLocales = tenant.brandPack?.audienceLanguage?.requiredContentLocales || tenant.brandPack?.audienceLanguage?.supportedLocales || [];
  const copyLocales = Object.keys(value.copy || {});
  const missingCopyField = requiredLocales.some((locale) => ["headline", "body", "caption", "cta", "altText"].some((field) => !hasText(value.copy?.[locale]?.[field])));
  const claims = collectClaims(tenant.productTruth);
  let evidenceExpired = false;
  for (const claimRef of value.claimRefs || []) {
    const entry = claims.get(claimRef);
    if (!entry || !internalClaimStatuses.has(entry.claim?.status) || !Array.isArray(entry.claim?.allowedSurfaces) || entry.claim.allowedSurfaces.some((surface) => !internalClaimSurfaces.has(surface))) {
      hardFailures.add("claim_not_ready");
      errors.push(`${reference}: claim ${claimRef} is missing or not approved for an internal-draft surface.`);
      continue;
    }
    if (!isCurrentOrFutureDate(entry.claim.expiresAt, evaluatedAt)) evidenceExpired = true;
    for (const evidenceRef of entry.claim.evidenceRefs || []) {
      const evidence = entry.evidence.get(evidenceRef);
      if (!evidence || !isCurrentOrFutureDate(evidence.expiresAt, evaluatedAt)) evidenceExpired = true;
    }
  }
  if (!Array.isArray(value.claimRefs) || value.claimRefs.length === 0) {
    hardFailures.add("claim_not_ready");
    errors.push(`${reference}: at least one current ProductTruth claim is required.`);
  }

  const copyText = collectCopyText(value).join("\n");
  for (const feature of tenant.productTruth?.features || []) {
    for (const phrase of feature.prohibitedClaims || []) {
      if (hasText(phrase) && copyText.toLowerCase().includes(phrase.toLowerCase())) hardFailures.add("claim_not_ready");
    }
  }
  for (const code of lintCandidate({
    text: copyText,
    surface: "internal_draft",
    claimStatus: "internal_only",
    evidenceVerified: true,
    rightsStatus: value.visualBrief?.rightsStatus,
    provenanceStatus: value.visualBrief?.provenanceStatus,
    destinationWorking: ["internal_review", "internal_only"].includes(value.destination?.status),
    requiredLocales,
    copyLocales,
    accessibilityIssue: missingCopyField || value.visualBrief?.accessibility?.altTextProvided !== true,
    evidenceExpired,
    approvalStale: false,
    duplicateExecutionIntent: false,
    knownForeignBrandTokens: tenant.brandPack?.identity?.knownForeignBrandTokens || [],
    unsupportedCommercialClaim: false
  })) hardFailures.add(code);
  return { errors, hardFailures: [...hardFailures] };
};

export const computeGrowthJobArtifactLint = ({ workspace, manifest, attemptId, references, evaluatedAt }) => {
  if (!manifest || manifest.workflowId !== "W2_content_factory" || manifest.outputArtifactType !== "concept_copy_package") {
    throw new Error("Deterministic job artifact lint currently supports W2 concept_copy_package work orders only.");
  }
  const timestamp = evaluatedAt || new Date().toISOString();
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error("Deterministic lint evaluatedAt must be an ISO date-time.");
  const brandPack = readContextJson(workspace, "brand-pack.json");
  const productTruth = readContextJson(workspace, "product-truth.json");
  const roleMapping = readContextJson(workspace, "role-mapping.json");
  const contextBindings = [brandPack, productTruth, roleMapping].map(({ reference, hash, bytes }) => ({ reference, hash, bytes }));
  const files = [...new Set(references || [])].sort().map((reference) => readBoundFile(workspace, reference));
  if (files.length === 0) throw new Error("Deterministic lint requires at least one artifact reference.");
  const errors = [];
  const hardFailures = new Set();
  let primaryArtifactCount = 0;
  const workLogs = [];
  for (const file of files) {
    const extension = path.extname(file.reference).toLowerCase();
    if ([".json", ".txt", ".md", ".csv"].includes(extension)) {
      const text = file.buffer.toString("utf8");
      if (credentialPattern.test(text) || placeholderPattern.test(text) || containsSensitiveData(text) || containsSensitiveInference(text) || containsSensitiveTargeting(text)) {
        hardFailures.add("sensitive_data_leak");
        errors.push(`${file.reference}: contains a credential, unresolved placeholder, personal data, or sensitive-inference material.`);
      }
      if (extension === ".json") {
        let value;
        try {
          value = JSON.parse(text);
        } catch (error) {
          hardFailures.add("artifact_contract_invalid");
          errors.push(`${file.reference}: malformed JSON (${error.message}).`);
          continue;
        }
        if (value?.artifactKind === manifest.outputArtifactType) {
          primaryArtifactCount += 1;
          const result = lintConceptPackage({
            value,
            reference: file.reference,
            manifest,
            evaluatedAt: timestamp,
            tenant: { brandPack: brandPack.value, productTruth: productTruth.value, roleMapping: roleMapping.value }
          });
          for (const error of result.errors) errors.push(error);
          for (const code of result.hardFailures) hardFailures.add(code);
        }
        if (value?.artifactKind === "agent_work_log") {
          workLogs.push({ reference: file.reference, value });
          const workLogErrors = validateContractInstance(frameworkRoot, "schemas/agent-work-log.schema.json", value, file.reference);
          if (workLogErrors.length > 0) {
            hardFailures.add("artifact_contract_invalid");
            errors.push(...workLogErrors);
          }
          if (value.jobId !== manifest.jobId || value.tenantId !== manifest.tenantId || value.workflowId !== manifest.workflowId || value.attemptId !== attemptId) {
            hardFailures.add("artifact_contract_invalid");
            errors.push(`${file.reference}: work-log identity must match the work order and active attempt.`);
          }
        }
      }
    }
  }
  if (primaryArtifactCount === 0) {
    hardFailures.add("artifact_contract_invalid");
    errors.push("The exact artifact set does not contain a concept_copy_package matching the work order.");
  }
  const targetChannels = Array.isArray(manifest.targetChannels) ? manifest.targetChannels : [];
  if (targetChannels.length > 0) {
    if (workLogs.length !== 1) {
      hardFailures.add("artifact_contract_invalid");
      errors.push("Channel-assigned W2 work requires exactly one agent_work_log artifact for manager review.");
    } else {
      const { reference, value } = workLogs[0];
      const steps = Array.isArray(value.steps) ? value.steps : [];
      const assignedSubagents = new Set(manifest.subagentTemplateIds || []);
      const requiredStageWorkers = [
        ["W2.2", "brief_expander"],
        ["W2.3", "locale_editor"],
        ["W2.4", "visual_accessibility_brief_checker"]
      ];
      if (steps.some((step) => step.channelId && !targetChannels.includes(step.channelId))) {
        hardFailures.add("artifact_contract_invalid");
        errors.push(`${reference}: work log contains a channel that was not assigned to this task.`);
      }
      for (const channelId of targetChannels) {
        for (const [stepId, specialistId] of requiredStageWorkers) {
          const expectedWorkerId = assignedSubagents.has(specialistId) ? specialistId : "content_studio";
          const expectedWorkerType = expectedWorkerId === "content_studio" ? "lead_agent" : "sub_agent";
          const step = steps.find((item) => item.stepId === stepId && item.channelId === channelId);
          if (!step || step.status !== "complete" || step.workerId !== expectedWorkerId || step.workerType !== expectedWorkerType) {
            hardFailures.add("artifact_contract_invalid");
            errors.push(`${reference}: ${stepId} needs a completed result for ${channelId} from ${expectedWorkerId}.`);
            continue;
          }
          const outputReferences = Array.isArray(step.outputReferences) ? step.outputReferences : [];
          if (outputReferences.length === 0 || outputReferences.some((item) => !files.some((file) => file.reference === item))) {
            hardFailures.add("artifact_contract_invalid");
            errors.push(`${reference}: ${stepId} for ${channelId} must point to output artifacts included in the reviewed set.`);
          }
        }
      }
    }
  }
  const artifactBindings = files.map(({ reference, hash, bytes }) => ({ reference, hash, bytes }));
  return {
    schemaVersion: "1.0.0",
    validatorVersion: deterministicLintValidatorVersion,
    jobId: manifest.jobId,
    tenantId: manifest.tenantId,
    workflowId: manifest.workflowId,
    attemptId,
    evaluatedAt: timestamp,
    status: hardFailures.size === 0 ? "passed" : "blocked",
    artifactBindings,
    contextBindings,
    hardFailureCodes: [...hardFailures].sort(),
    errors: [...new Set(errors)].slice(0, 100)
  };
};

export const verifyGrowthJobArtifactLint = ({ workspace, manifest, attemptId, references, receipt }) => {
  if (!isPlainObject(receipt)) throw new Error("Deterministic lint receipt is required.");
  const expectedKeys = ["schemaVersion", "validatorVersion", "jobId", "tenantId", "workflowId", "attemptId", "evaluatedAt", "status", "artifactBindings", "contextBindings", "hardFailureCodes", "errors"];
  if (Object.keys(receipt).length !== expectedKeys.length || expectedKeys.some((key) => !(key in receipt))) throw new Error("Deterministic lint receipt shape is invalid.");
  const recomputed = computeGrowthJobArtifactLint({ workspace, manifest, attemptId, references, evaluatedAt: receipt.evaluatedAt });
  if (canonicalJson(recomputed) !== canonicalJson(receipt)) throw new Error("Deterministic lint receipt is stale or does not match the exact artifact and tenant-context bytes.");
  return recomputed;
};

export const hashDeterministicLintReceipt = (receipt) => sha256(Buffer.from(canonicalJson(receipt), "utf8"));
