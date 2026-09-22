import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  containsSensitiveData,
  containsSensitiveInference,
  containsSensitiveTargeting,
  hasText,
  lintCandidate,
  validateContractInstance
} from "./growth-framework-validator.mjs";
import { validateGrowthTenant } from "./validate-growth-tenant.mjs";

const modulePath = fileURLToPath(import.meta.url);
const frameworkRoot = path.resolve(path.dirname(modulePath), "..");
const placeholderPattern = /__[A-Z0-9][A-Z0-9_-]*__/i;
const credentialPattern = /\b(?:api[_-]?key|access[_-]?token|secret|password|authorization)\s*[:=]\s*[^\s"',}]+/i;
const allowedLifecycleStates = new Set(["draft_internal", "qa_pass_pending_human"]);
const allowedAssetStatuses = new Set(["draft_internal", "reviewed_internal", "blocked"]);
const allowedApprovalStatuses = new Set(["not_submitted", "blocked"]);
const allowedInternalClaimSurfaces = new Set(["internal_draft_only", "draft_internal", "qa_pass_pending_human", "internal_draft"]);
const allowedInternalClaimStatuses = new Set(["internal_only", "verified_internal_only", "qa_pass_pending_human"]);
const reviewableAssetFields = [
  "id",
  "tenantId",
  "briefId",
  "version",
  "artifactKind",
  "status",
  "lifecycleState",
  "format",
  "claimRefs",
  "copy",
  "visualBrief",
  "destination",
  "measurement",
  "productionRecord"
];

const createCollector = () => {
  const errors = [];
  return {
    errors,
    error(message) {
      errors.push(message);
    }
  };
};

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const normalize = (value) => String(value || "").trim().toLowerCase();
const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "");
const isCurrentOrFutureDate = (value) => isIsoDate(value) && value >= new Date().toISOString().slice(0, 10);

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
};

/**
 * QA and approval records bind this reviewable projection. Their own fields are
 * intentionally excluded, avoiding a circular hash while invalidating any change
 * to the content, claim, destination, measurement, or production package.
 */
export const computeReviewableArtifactHash = (assetPackage) => {
  const projection = Object.fromEntries(reviewableAssetFields.map((field) => [field, assetPackage?.[field]]));
  const canonicalPayload = JSON.stringify(canonicalize(projection));
  return `sha256:${createHash("sha256").update(`growth-reviewable-asset-v1\n${canonicalPayload}`, "utf8").digest("hex")}`;
};

const walkStrings = (value, pointer = "$", output = []) => {
  if (typeof value === "string") {
    output.push({ pointer, value });
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, `${pointer}[${index}]`, output));
    return output;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) walkStrings(child, `${pointer}.${key}`, output);
  }
  return output;
};

const readJsonFile = (filePath, label, collector) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    collector.error(`${label}: cannot read valid JSON (${error.message}).`);
    return null;
  }
};

const listJsonArtifacts = (tenantRoot, relativeDirectory, collector) => {
  const directory = path.join(tenantRoot, relativeDirectory);
  if (!fs.existsSync(directory)) return [];
  if (fs.lstatSync(directory).isSymbolicLink()) {
    collector.error(`${relativeDirectory}: artifact directory may not be a symbolic link.`);
    return [];
  }
  if (!fs.lstatSync(directory).isDirectory()) {
    collector.error(`${relativeDirectory}: artifact path must be a directory.`);
    return [];
  }

  const records = [];
  const visit = (currentDirectory) => {
    for (const entry of fs.readdirSync(currentDirectory, { withFileTypes: true })) {
      const entryPath = path.join(currentDirectory, entry.name);
      const relativePath = path.relative(tenantRoot, entryPath).replaceAll(path.sep, "/");
      if (entry.isSymbolicLink()) {
        collector.error(`${relativePath}: artifact files may not be symbolic links.`);
      } else if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json") && entry.name.toLowerCase() !== "index.json") {
        const value = readJsonFile(entryPath, relativePath, collector);
        if (value !== null) records.push({ relativePath, value });
      }
    }
  };
  visit(directory);
  return records;
};

const unwrapRecords = (file, collectionKeys, label, collector) => {
  if (Array.isArray(file.value)) return file.value.map((value, index) => ({ value, label: `${file.relativePath}[${index}]`, relativePath: file.relativePath }));
  if (isPlainObject(file.value)) {
    for (const key of collectionKeys) {
      if (Object.hasOwn(file.value, key)) {
        if (!Array.isArray(file.value[key])) {
          collector.error(`${file.relativePath}.${key}: ${label} collection must be an array.`);
          return [];
        }
        return file.value[key].map((value, index) => ({ value, label: `${file.relativePath}.${key}[${index}]`, relativePath: file.relativePath }));
      }
    }
  }
  return [{ value: file.value, label: file.relativePath, relativePath: file.relativePath }];
};

const unwrapApprovalRecords = (file, collector) => {
  if (Array.isArray(file.value)) {
    return file.value.map((value, index) => ({ value, label: `${file.relativePath}[${index}]`, relativePath: file.relativePath }));
  }
  if (!isPlainObject(file.value)) return [{ value: file.value, label: file.relativePath, relativePath: file.relativePath }];
  const records = [];
  let usedCollection = false;
  for (const key of ["qaVerdicts", "qa", "records", "approvals"]) {
    if (!Object.hasOwn(file.value, key)) continue;
    usedCollection = true;
    if (!Array.isArray(file.value[key])) {
      collector.error(`${file.relativePath}.${key}: approval collection must be an array.`);
      continue;
    }
    records.push(...file.value[key].map((value, index) => ({ value, label: `${file.relativePath}.${key}[${index}]`, relativePath: file.relativePath })));
  }
  return usedCollection ? records : [{ value: file.value, label: file.relativePath, relativePath: file.relativePath }];
};

const readTenantJson = (tenantRoot, relativePath, collector) => {
  const target = path.join(tenantRoot, relativePath);
  if (!fs.existsSync(target)) {
    collector.error(`${relativePath}: required to validate non-empty W1/W2 artifacts.`);
    return null;
  }
  if (fs.lstatSync(target).isSymbolicLink()) {
    collector.error(`${relativePath}: tenant context file may not be a symbolic link.`);
    return null;
  }
  return readJsonFile(target, relativePath, collector);
};

const validateNoPlaceholdersOrSensitiveMaterial = (record, collector) => {
  const textEntries = walkStrings(record.value);
  const placeholders = textEntries.filter((entry) => placeholderPattern.test(entry.value));
  if (placeholders.length > 0) {
    collector.error(`${record.label}: contains unresolved placeholder at ${placeholders[0].pointer}.`);
  }
  const serialized = JSON.stringify(record.value);
  if (containsSensitiveData(serialized) || containsSensitiveInference(serialized)) {
    collector.error(`${record.label}: contains personal data or sensitive-inference material.`);
  }
  if (containsSensitiveTargeting(serialized)) {
    collector.error(`${record.label}: contains sensitive targeting.`);
  }
  if (credentialPattern.test(serialized)) {
    collector.error(`${record.label}: contains a credential-like value.`);
  }
};

const addContractErrors = (contractPath, record, collector) => {
  for (const error of validateContractInstance(frameworkRoot, contractPath, record.value, record.label)) {
    collector.error(error);
  }
};

const loadQualityGateContract = (collector) => {
  const config = readJsonFile(path.join(frameworkRoot, "packages/growth-core/config/quality-gates.json"), "growth-core/config/quality-gates.json", collector);
  const dimensions = Array.isArray(config?.softDimensions) ? config.softDimensions.filter(hasText) : [];
  const threshold = config?.internalLibraryThreshold || {};
  if (dimensions.length !== 9 || new Set(dimensions).size !== dimensions.length) {
    collector.error("growth-core/config/quality-gates.json must define exactly nine unique soft-score dimensions.");
  }
  if (!Number.isFinite(threshold.minimumDimensionScore) || !Number.isFinite(threshold.minimumMeanScore) || threshold.hardFailuresAllowed !== 0) {
    collector.error("growth-core/config/quality-gates.json must define numeric zero-hard-failure internal thresholds.");
  }
  return { dimensions, threshold };
};

const sameCanonicalValue = (left, right) => JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));

const validateQualityScores = ({ softScores, label, qualityGate, collector }) => {
  if (!isPlainObject(softScores)) {
    collector.error(`${label}: softScores must be an object with the full quality rubric.`);
    return;
  }
  const expected = new Set(qualityGate.dimensions);
  const received = Object.keys(softScores);
  const missing = qualityGate.dimensions.filter((dimension) => !Object.hasOwn(softScores, dimension));
  const unexpected = received.filter((dimension) => !expected.has(dimension));
  if (missing.length > 0) collector.error(`${label}: missing quality rubric dimensions ${missing.join(", ")}.`);
  if (unexpected.length > 0) collector.error(`${label}: contains unknown quality rubric dimensions ${unexpected.join(", ")}.`);
  const scores = qualityGate.dimensions.map((dimension) => softScores[dimension]);
  if (scores.some((score) => !Number.isFinite(score))) {
    collector.error(`${label}: every quality rubric dimension must have a numeric score.`);
    return;
  }
  const { minimumDimensionScore, minimumMeanScore } = qualityGate.threshold;
  const belowMinimum = qualityGate.dimensions.filter((dimension) => softScores[dimension] < minimumDimensionScore);
  if (belowMinimum.length > 0) {
    collector.error(`${label}: quality rubric dimension(s) below ${minimumDimensionScore}: ${belowMinimum.join(", ")}.`);
  }
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  if (mean < minimumMeanScore) {
    collector.error(`${label}: quality rubric mean ${mean.toFixed(2)} is below ${minimumMeanScore}.`);
  }
};

const collectClaimIndex = (productTruth, collector) => {
  const claims = new Map();
  for (const feature of productTruth.features || []) {
    const evidence = new Map((feature.evidence || []).map((item) => [item.id, item]));
    for (const claim of feature.claims || []) {
      if (claims.has(claim.id)) {
        collector.error(`product-truth.json: duplicate claim id ${claim.id}.`);
        continue;
      }
      claims.set(claim.id, { claim, feature, evidence });
    }
  }
  return claims;
};

const validateClaimReferences = (claimRefs, label, claimIndex, collector) => {
  if (!Array.isArray(claimRefs)) return;
  for (const claimRef of claimRefs) {
    const entry = claimIndex.get(claimRef);
    if (!entry) {
      collector.error(`${label}: unsupported claim ref ${claimRef}.`);
      continue;
    }
    const { claim, evidence } = entry;
    if (!isCurrentOrFutureDate(claim.expiresAt)) {
      collector.error(`${label}: claim ${claimRef} has expired or invalid ProductTruth expiry.`);
    }
    if (!allowedInternalClaimStatuses.has(claim.status)) {
      collector.error(`${label}: claim ${claimRef} is not in an internal-only reviewed status.`);
    }
    if (!Array.isArray(claim.evidenceRefs) || claim.evidenceRefs.length === 0) {
      collector.error(`${label}: claim ${claimRef} has no linked ProductTruth evidence.`);
    }
    for (const evidenceRef of claim.evidenceRefs || []) {
      const evidenceItem = evidence.get(evidenceRef);
      if (!evidenceItem) {
        collector.error(`${label}: claim ${claimRef} links missing evidence ${evidenceRef}.`);
      } else if (!isCurrentOrFutureDate(evidenceItem.expiresAt)) {
        collector.error(`${label}: claim ${claimRef} links expired evidence ${evidenceRef}.`);
      }
    }
    if (!Array.isArray(claim.allowedSurfaces) || claim.allowedSurfaces.some((surface) => !allowedInternalClaimSurfaces.has(surface))) {
      collector.error(`${label}: claim ${claimRef} is not bounded to an internal-draft surface.`);
    }
  }
};

const validateProductTruthCopyBoundary = (asset, claimIndex, collector) => {
  const copyText = Object.values(asset.value?.copy || {})
    .flatMap((localeCopy) => Object.values(localeCopy || {}))
    .filter(hasText)
    .join("\n")
    .toLowerCase();
  const prohibitedPhrases = new Set();
  for (const claimRef of asset.value?.claimRefs || []) {
    for (const phrase of claimIndex.get(claimRef)?.feature?.prohibitedClaims || []) {
      if (hasText(phrase)) prohibitedPhrases.add(phrase);
    }
  }
  for (const phrase of prohibitedPhrases) {
    if (copyText.includes(phrase.toLowerCase())) {
      collector.error(`${asset.label}: copy uses ProductTruth-prohibited wording "${phrase}".`);
    }
  }
};

const roleEquals = (left, right) => normalize(left) !== "" && normalize(left) === normalize(right);

const statusImpliesExternalExecution = (value) => /(?:allowed|enabled|published|scheduled|sent|live|executed|external_candidate|approved_execution_envelope)/i.test(String(value || ""));

const validateBriefs = ({ briefs, tenantId, claimIndex, collector }) => {
  const briefIds = new Map();
  for (const brief of briefs) {
    validateNoPlaceholdersOrSensitiveMaterial(brief, collector);
    addContractErrors("schemas/content-brief.schema.json", brief, collector);
    if (brief.value?.tenantId !== tenantId) collector.error(`${brief.label}: tenantId must match tenant ProductTruth.`);
    if (briefIds.has(brief.value?.id)) collector.error(`${brief.label}: duplicate brief id ${brief.value?.id}.`);
    if (hasText(brief.value?.id)) briefIds.set(brief.value.id, brief.value);
    validateClaimReferences(brief.value?.claimRefs, brief.label, claimIndex, collector);
    if (!Array.isArray(brief.value?.guardrails) || !brief.value.guardrails.some((guardrail) => /draft.?only|no.?external/i.test(guardrail))) {
      collector.error(`${brief.label}: requires a draft-only or no-external-action guardrail.`);
    }
  }
  return briefIds;
};

const validateAssetQa = (asset, roleMapping, qualityGate, collector) => {
  const qa = asset.value?.qa || {};
  const source = asset.value?.productionRecord?.source;
  const mappings = roleMapping?.frameworkRoleMappings || {};
  if (!hasText(source)) collector.error(`${asset.label}.productionRecord.source: requires an authoring role or source identifier.`);
  if (!hasText(qa.reviewerRole)) collector.error(`${asset.label}.qa.reviewerRole: requires an independent QA role.`);
  if (roleEquals(source, qa.reviewerRole)) collector.error(`${asset.label}: authoring source and QA reviewer role must be separate.`);
  if (hasText(mappings.content_authoring) && !roleEquals(source, mappings.content_authoring)) {
    collector.error(`${asset.label}: productionRecord.source must match role-mapping.json content_authoring.`);
  }
  if (hasText(mappings.quality_assurance) && !roleEquals(qa.reviewerRole, mappings.quality_assurance)) {
    collector.error(`${asset.label}: qa.reviewerRole must match role-mapping.json quality_assurance.`);
  }
  if (asset.value?.lifecycleState === "qa_pass_pending_human") {
    if (qa.automatedVerdict !== "pass" || !/^pass/.test(String(qa.independentQaStatus || "")) || (qa.hardFailureCodes || []).length > 0) {
      collector.error(`${asset.label}: qa_pass_pending_human requires a clean automated and independent QA pass.`);
    }
    validateQualityScores({ softScores: qa.softScores, label: `${asset.label}.qa.softScores`, qualityGate, collector });
  }
};

const validateAssets = ({ assets, tenantId, claimIndex, briefIds, requiredLocales, foreignTokens, roleMapping, qualityGate, collector }) => {
  const assetIds = new Map();
  for (const asset of assets) {
    validateNoPlaceholdersOrSensitiveMaterial(asset, collector);
    addContractErrors("schemas/asset-package.schema.json", asset, collector);
    const value = asset.value || {};
    if (value.tenantId !== tenantId) collector.error(`${asset.label}: tenantId must match tenant ProductTruth.`);
    if (assetIds.has(value.id)) collector.error(`${asset.label}: duplicate asset id ${value.id}.`);
    if (!briefIds.has(value.briefId)) {
      collector.error(`${asset.label}: briefId ${value.briefId || "unknown"} does not resolve to a validated Content Brief.`);
    } else {
      const briefClaimRefs = new Set(briefIds.get(value.briefId).claimRefs || []);
      for (const claimRef of value.claimRefs || []) {
        if (!briefClaimRefs.has(claimRef)) collector.error(`${asset.label}: claim ${claimRef} is not approved by brief ${value.briefId}.`);
      }
    }
    validateClaimReferences(value.claimRefs, asset.label, claimIndex, collector);
    validateProductTruthCopyBoundary(asset, claimIndex, collector);
    if (!allowedLifecycleStates.has(value.lifecycleState)) {
      collector.error(`${asset.label}: lifecycle must stay no later than qa_pass_pending_human.`);
    }
    if (!allowedAssetStatuses.has(value.status)) {
      collector.error(`${asset.label}: status is outside the internal-draft lifecycle.`);
    }
    if (value.externalReadiness?.status !== "blocked") {
      collector.error(`${asset.label}: externalReadiness.status must remain blocked.`);
    }
    if (!allowedApprovalStatuses.has(value.approval?.status)) {
      collector.error(`${asset.label}: approval.status may only be not_submitted or blocked in W1/W2.`);
    }
    if (statusImpliesExternalExecution(value.destination?.status) || statusImpliesExternalExecution(value.approval?.targetChannel)) {
      collector.error(`${asset.label}: destination or target channel implies external execution.`);
    }
    const copy = isPlainObject(value.copy) ? value.copy : {};
    for (const locale of requiredLocales) {
      if (!isPlainObject(copy[locale])) {
        collector.error(`${asset.label}: missing required locale ${locale}.`);
        continue;
      }
      for (const field of ["headline", "body", "caption", "cta", "altText"]) {
        if (!hasText(copy[locale][field])) collector.error(`${asset.label}.copy.${locale}.${field}: must be non-empty.`);
      }
    }
    const copyText = JSON.stringify(value);
    const lintCodes = lintCandidate({
      text: copyText,
      surface: "internal_draft",
      claimStatus: "internal_only",
      evidenceVerified: true,
      rightsStatus: value.visualBrief?.rightsStatus,
      provenanceStatus: value.visualBrief?.provenanceStatus,
      destinationWorking: ["internal_review", "internal_only"].includes(value.destination?.status),
      requiredLocales,
      copyLocales: Object.keys(copy),
      accessibilityIssue: value.visualBrief?.accessibility?.altTextProvided === false,
      evidenceExpired: false,
      approvalStale: false,
      duplicateExecutionIntent: false,
      knownForeignBrandTokens: foreignTokens,
      unsupportedCommercialClaim: false
    });
    if (lintCodes.length > 0) collector.error(`${asset.label}: lintCandidate blocked ${lintCodes.join(", ")}.`);
    const computedHash = computeReviewableArtifactHash(value);
    if (hasText(value.approval?.artifactHash) && value.approval.artifactHash !== computedHash) {
      collector.error(`${asset.label}: approval.artifactHash must equal the canonical reviewable asset hash.`);
    }
    if (value.lifecycleState === "qa_pass_pending_human" && !hasText(value.approval?.artifactHash)) {
      collector.error(`${asset.label}: qa_pass_pending_human requires a canonical approval.artifactHash.`);
    }
    validateAssetQa(asset, roleMapping, qualityGate, collector);
    if (hasText(value.id)) assetIds.set(value.id, { record: asset, value, computedHash });
  }
  return { assetIds };
};

const validateStandaloneReviews = ({ reviewRecords, tenantId, assetIds, roleMapping, qualityGate, collector }) => {
  const qaByAssetId = new Map();
  const mappings = roleMapping?.frameworkRoleMappings || {};
  for (const review of reviewRecords) {
    validateNoPlaceholdersOrSensitiveMaterial(review, collector);
    const value = review.value || {};
    const isQaVerdict = Object.hasOwn(value, "rubricVersion") || Object.hasOwn(value, "verdict");
    if (isQaVerdict) {
      addContractErrors("schemas/qa-verdict.schema.json", review, collector);
      const assetId = value.artifactId;
      if (!hasText(assetId) || !assetIds.has(assetId)) {
        collector.error(`${review.label}: QA verdict artifactId must resolve to an existing asset id.`);
        continue;
      }
      const assetEntry = assetIds.get(assetId);
      const asset = assetEntry.value;
      if (value.tenantId !== tenantId) collector.error(`${review.label}: QA verdict tenantId must match tenant ProductTruth.`);
      if (value.artifactVersion !== asset.version) collector.error(`${review.label}: QA verdict artifactVersion must match asset ${assetId}.`);
      if (value.artifactHash !== assetEntry.computedHash || asset.approval?.artifactHash !== assetEntry.computedHash) {
        collector.error(`${review.label}: QA verdict artifactHash must match the canonical asset hash.`);
      }
      if (value.verdict !== "pass" || (value.hardFailureCodes || []).length > 0) {
        collector.error(`${review.label}: QA verdict must be a clean pass for internal QA progression.`);
      }
      if (roleEquals(asset.productionRecord?.source, value.reviewerRole)) {
        collector.error(`${review.label}: authoring source and QA reviewer role must be separate.`);
      }
      if (hasText(mappings.quality_assurance) && !roleEquals(value.reviewerRole, mappings.quality_assurance)) {
        collector.error(`${review.label}: QA verdict reviewerRole must match role-mapping.json quality_assurance.`);
      }
      if (!isIsoDate(value.reviewedAt)) collector.error(`${review.label}: QA verdict reviewedAt must be a YYYY-MM-DD date.`);
      if (value.verdict === "pass") {
        validateQualityScores({ softScores: value.softScores, label: `${review.label}.softScores`, qualityGate, collector });
        if (!sameCanonicalValue(value.softScores, asset.qa?.softScores)) {
          collector.error(`${review.label}: QA verdict softScores must match the bound asset QA scores.`);
        }
      }
      if (qaByAssetId.has(assetId)) collector.error(`${review.label}: duplicate standalone QA verdict for asset ${assetId}.`);
      qaByAssetId.set(assetId, value);
      continue;
    }

    addContractErrors("schemas/approval-record.schema.json", review, collector);
    if (value.tenantId !== tenantId) collector.error(`${review.label}: tenantId must match tenant ProductTruth.`);
    const assetEntry = assetIds.get(value.artifactId);
    if (!hasText(value.artifactId) || !assetEntry) {
      collector.error(`${review.label}: approval record artifactId must resolve to an existing asset id.`);
    } else {
      if (value.artifactVersion !== assetEntry.value.version) collector.error(`${review.label}: approval record artifactVersion must match asset ${value.artifactId}.`);
      if (value.artifactHash !== assetEntry.computedHash || assetEntry.value.approval?.artifactHash !== assetEntry.computedHash) {
        collector.error(`${review.label}: approval record artifactHash must match the canonical asset hash.`);
      }
    }
    if (!allowedApprovalStatuses.has(value.status)) {
      collector.error(`${review.label}: approval record cannot approve or execute an artifact in W1/W2.`);
    }
    if (statusImpliesExternalExecution(value.targetChannel)) {
      collector.error(`${review.label}: target channel implies external execution.`);
    }
    if (!isCurrentOrFutureDate(value.expiry)) {
      collector.error(`${review.label}: expiry must be a current or future YYYY-MM-DD date.`);
    }
  }
  for (const [assetId, asset] of assetIds) {
    if (asset.value.lifecycleState === "qa_pass_pending_human" && !qaByAssetId.has(assetId)) {
      collector.error(`${asset.record.label}: qa_pass_pending_human requires a standalone <asset-id>.qa.json verdict.`);
    }
  }
};

const getRequiredLocales = (brandPack, collector) => {
  const language = brandPack?.audienceLanguage || {};
  const candidates = Array.isArray(language.requiredContentLocales) && language.requiredContentLocales.length > 0
    ? language.requiredContentLocales
    : language.supportedLocales;
  const locales = [...new Set((candidates || []).filter(hasText))];
  if (locales.length === 0) collector.error("brand-pack.json.audienceLanguage requires requiredContentLocales or supportedLocales for artifact QA.");
  return locales;
};

const getForeignTokens = (brandPack, tenantConfig) => [...new Set([
  ...(brandPack?.identity?.knownForeignBrandTokens || []),
  ...(tenantConfig?.identityBoundary?.knownForeignBrandTokens || [])
].filter(hasText))];

export const validateGrowthTenantArtifacts = (tenantRoot) => {
  const collector = createCollector();
  if (!tenantRoot) {
    collector.error("Artifact validation requires --tenant-root <directory>.");
    return { errors: collector.errors, summary: { state: "blocked", externalExecution: "forbidden" } };
  }
  const resolvedTenantRoot = path.resolve(tenantRoot);
  if (!fs.existsSync(resolvedTenantRoot) || fs.lstatSync(resolvedTenantRoot).isSymbolicLink() || !fs.lstatSync(resolvedTenantRoot).isDirectory()) {
    collector.error(`Tenant root must be an existing non-symbolic-link directory: ${resolvedTenantRoot}`);
    return { errors: collector.errors, summary: { tenantRoot: resolvedTenantRoot, state: "blocked", externalExecution: "forbidden" } };
  }

  const briefFiles = listJsonArtifacts(resolvedTenantRoot, "briefs", collector);
  const assetFiles = listJsonArtifacts(resolvedTenantRoot, "content-drafts", collector);
  const approvalFiles = listJsonArtifacts(resolvedTenantRoot, "approvals", collector);
  const briefs = briefFiles.flatMap((file) => unwrapRecords(file, ["briefs"], "brief", collector));
  const assets = assetFiles.flatMap((file) => unwrapRecords(file, ["assetPackages", "artifacts"], "asset package", collector));
  const reviewRecords = approvalFiles.flatMap((file) => unwrapApprovalRecords(file, collector));
  const artifactCount = briefs.length + assets.length + reviewRecords.length;

  if (artifactCount === 0) {
    return {
      errors: collector.errors,
      summary: {
        tenantRoot: resolvedTenantRoot,
        state: collector.errors.length === 0 ? "no_artifacts_yet" : "blocked",
        artifactCount: 0,
        externalExecution: "forbidden"
      }
    };
  }

  const w0Result = validateGrowthTenant(resolvedTenantRoot);
  if (w0Result.summary.state !== "ready_for_internal_drafts" || w0Result.errors.length > 0) {
    collector.error(`W0 prerequisite did not pass; tenant state is ${w0Result.summary.state || "blocked"}.`);
    for (const error of w0Result.errors) collector.error(`W0 prerequisite: ${error}`);
  }

  const brandPack = readTenantJson(resolvedTenantRoot, "brand-pack.json", collector);
  const productTruth = readTenantJson(resolvedTenantRoot, "product-truth.json", collector);
  const tenantConfig = readTenantJson(resolvedTenantRoot, "tenant-config.json", collector);
  const roleMapping = readTenantJson(resolvedTenantRoot, "role-mapping.json", collector);
  const qualityGate = loadQualityGateContract(collector);
  if (!brandPack || !productTruth || !tenantConfig || !roleMapping) {
    return {
      errors: collector.errors,
      summary: { tenantRoot: resolvedTenantRoot, state: "blocked", artifactCount, externalExecution: "forbidden" }
    };
  }

  const tenantId = productTruth.tenantId;
  if (!hasText(tenantId)) collector.error("product-truth.json.tenantId must be a non-empty tenant id.");
  if (brandPack.tenantId !== tenantId || tenantConfig.tenantId !== tenantId) {
    collector.error("brand-pack.json, product-truth.json, and tenant-config.json must use the same tenantId.");
  }
  const requiredLocales = getRequiredLocales(brandPack, collector);
  const foreignTokens = getForeignTokens(brandPack, tenantConfig);
  const claimIndex = collectClaimIndex(productTruth, collector);
  const briefIds = validateBriefs({ briefs, tenantId, claimIndex, collector });
  const { assetIds } = validateAssets({ assets, tenantId, claimIndex, briefIds, requiredLocales, foreignTokens, roleMapping, qualityGate, collector });
  validateStandaloneReviews({ reviewRecords, tenantId, assetIds, roleMapping, qualityGate, collector });

  return {
    errors: collector.errors,
    summary: {
      tenantRoot: resolvedTenantRoot,
      tenantId,
      state: collector.errors.length === 0 ? "qa_ready_internal" : "blocked",
      artifactCount,
      briefs: briefs.length,
      assets: assets.length,
      reviews: reviewRecords.length,
      requiredLocales,
      w0State: w0Result.summary.state,
      externalExecution: "forbidden"
    }
  };
};

const runAsCli = () => {
  const rootIndex = process.argv.indexOf("--tenant-root");
  const result = validateGrowthTenantArtifacts(rootIndex >= 0 ? process.argv[rootIndex + 1] : null);
  for (const error of result.errors) console.error(`BLOCKED: ${error}`);
  if (result.errors.length === 0) {
    console.log(`Tenant artifacts: ${result.summary.state}; external execution remains forbidden.`);
  }
  process.exitCode = result.errors.length > 0 ? 1 : 0;
};

if (path.resolve(process.argv[1] || "") === path.resolve(modulePath)) runAsCli();
