import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { containsSensitiveData, containsSensitiveInference, hasText } from "./growth-framework-validator.mjs";

const modulePath = fileURLToPath(import.meta.url);

export const tenantArtifactPaths = Object.freeze([
  "tenant-config.json",
  "brand-pack.json",
  "business-pack.json",
  "product-truth.json",
  "role-mapping.json",
  "readiness.json",
  "risk-register.json",
  "privacy/consent-data-map.json",
  "channels/capability-matrix.json",
  "research/source-register.json",
  "research/interview-kit.json",
  "measurement/event-ownership-map.json",
  "journey/journey-map.json",
  "campaigns/experiment-brief.json",
  "learning/learning-note.json",
  "briefs/index.json",
  "content-drafts/index.json",
  "approvals/index.json",
  "onboarding-manifest.json",
  "README.md"
]);

const jsonArtifactPaths = tenantArtifactPaths.filter((relativePath) => relativePath.endsWith(".json"));

export const requiredCapabilities = Object.freeze([
  "workflow_orchestration",
  "content_research",
  "product_management",
  "content_authoring",
  "quality_assurance",
  "design_operations",
  "measurement_analysis",
  "security_privacy_review"
]);

const implementedWorkflowIds = ["W0_readiness", "W1_research_to_plan", "W2_content_factory", "W6_learning_to_product"];
const deferredWorkflowIds = ["W3_distribution_orchestration", "W4_controlled_publishing", "W5_paid_media"];
const requiredRiskIds = [
  "unsupported_claim",
  "cross_tenant_leak",
  "sensitive_or_personal_data",
  "unlicensed_or_misleading_creative",
  "unclear_or_nonconsensual_destination",
  "measurement_without_valid_definition",
  "unauthorized_external_execution"
];
const requiredManifestCheckIds = [
  "brand_pack_reviewed",
  "business_pack_reviewed",
  "role_mapping_reviewed",
  "product_truth_verified",
  "consent_and_data_map_reviewed",
  "channel_capability_reviewed",
  "research_boundary_reviewed",
  "measurement_definition_reviewed",
  "journey_map_reviewed",
  "risk_register_reviewed",
  "sprint_readiness_reviewed",
  "isolated_data_plane_confirmed",
  "human_approval_owner_assigned",
  "incident_owner_assigned"
];
const readyStatus = "ready_for_internal_drafts";
const allowedInternalClaimSurfaces = new Set(["internal_draft_only", "draft_internal", "qa_pass_pending_human"]);
const placeholderPattern = /__[A-Z0-9][A-Z0-9_]*__/;
const placeholderGlobalPattern = /__[A-Z0-9][A-Z0-9_]*__/g;
const tenantSlugPattern = /^[a-z][a-z0-9-]{1,62}$/;
const credentialPattern = /(?:\b(?:sk|pk|rk|ghp)_[a-z0-9_-]{12,}\b|(?:api[_-]?key|authorization|bearer|access[_-]?token|secret|password)\s*[:=]\s*["']?[a-z0-9._-]{8,})/i;

const createIssueCollector = () => {
  const errors = [];
  const warnings = [];
  const errorSet = new Set();
  const warningSet = new Set();
  return {
    errors,
    warnings,
    error(message) {
      if (!errorSet.has(message)) {
        errorSet.add(message);
        errors.push(message);
      }
    },
    warning(message) {
      if (!warningSet.has(message)) {
        warningSet.add(message);
        warnings.push(message);
      }
    }
  };
};

const requireReady = (collector, allowIncomplete, condition, message) => {
  if (condition) return;
  if (allowIncomplete) collector.warning(message);
  else collector.error(message);
};

const hasSymbolicLinkInArtifactPath = (tenantRoot, relativePath) => {
  let current = tenantRoot;
  for (const segment of relativePath.split(/[\\/]/)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) return current;
  }
  return null;
};

const readTextFile = (tenantRoot, relativePath, collector) => {
  const target = path.join(tenantRoot, relativePath);
  if (!fs.existsSync(target)) {
    collector.error(`${relativePath}: required scaffold artifact is missing.`);
    return null;
  }
  try {
    const symbolicLink = hasSymbolicLinkInArtifactPath(tenantRoot, relativePath);
    if (symbolicLink) {
      collector.error(`${relativePath}: symbolic links are not allowed in a tenant configuration partition (${symbolicLink}).`);
      return null;
    }
    if (!fs.lstatSync(target).isFile()) {
      collector.error(`${relativePath}: expected a file.`);
      return null;
    }
    return fs.readFileSync(target, "utf8");
  } catch (error) {
    collector.error(`${relativePath}: cannot be read (${error.message}).`);
    return null;
  }
};

const readJsonFile = (tenantRoot, relativePath, collector) => {
  const text = readTextFile(tenantRoot, relativePath, collector);
  if (text === null) return null;
  try {
    return { raw: text, value: JSON.parse(text) };
  } catch (error) {
    collector.error(`${relativePath}: cannot be parsed as JSON (${error.message}).`);
    return null;
  }
};

const stringifyPath = (segments) => segments.reduce((pointer, segment) => {
  if (typeof segment === "number") return `${pointer}[${segment}]`;
  return pointer ? `${pointer}.${segment}` : segment;
}, "");

const walkValue = (value, visit, segments = []) => {
  visit(value, segments);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkValue(item, visit, [...segments, index]));
  } else if (value !== null && typeof value === "object") {
    Object.entries(value).forEach(([key, child]) => walkValue(child, visit, [...segments, key]));
  }
};

const isIsoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

const isCurrentOrFutureDate = (value) => isIsoDate(value) && value >= new Date().toISOString().slice(0, 10);

const hasNonPlaceholderText = (value) => hasText(value) && !placeholderPattern.test(value);

const normalizedList = (value) => Array.isArray(value)
  ? value.filter(hasText).map((item) => item.trim().toLowerCase())
  : [];

const sameNormalizedList = (left, right) => {
  const a = [...new Set(normalizedList(left))].sort();
  const b = [...new Set(normalizedList(right))].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

const containsPlaceholder = (value) => {
  const placeholders = [];
  walkValue(value, (child, segments) => {
    if (typeof child !== "string") return;
    for (const token of child.match(placeholderGlobalPattern) || []) placeholders.push(`${stringifyPath(segments)} contains ${token}`);
  });
  return placeholders;
};

const validateArtifactDataSafety = (artifacts, collector) => {
  for (const [relativePath, artifact] of Object.entries(artifacts)) {
    const raw = artifact.raw;
    if (containsSensitiveData(raw)) {
      collector.error(`${relativePath}: contains a personal-data pattern. Keep only tenant-owned, non-personal configuration and aggregate definitions here.`);
    }
    if (containsSensitiveInference(raw)) {
      collector.error(`${relativePath}: contains a sensitive-inference pattern. Remove it from the tenant configuration partition.`);
    }
    if (credentialPattern.test(raw)) {
      collector.error(`${relativePath}: contains a credential-like pattern. Move secrets to the tenant's separate secret store.`);
    }
  }
};

const validateTenantIds = (artifacts, collector) => {
  const tenantConfig = artifacts["tenant-config.json"]?.value;
  const tenantId = tenantConfig?.tenantId;
  if (!tenantSlugPattern.test(tenantId || "")) {
    collector.error("tenant-config.json.tenantId must be a lowercase hyphenated tenant identifier, 2–63 characters long.");
    return null;
  }
  for (const relativePath of jsonArtifactPaths) {
    const actual = artifacts[relativePath]?.value?.tenantId;
    if (actual !== tenantId) collector.error(`${relativePath}.tenantId must equal tenant-config.json.tenantId (${tenantId}).`);
  }
  return tenantId;
};

const validateIdentityBoundary = (artifacts, collector, allowIncomplete) => {
  const configBoundary = artifacts["tenant-config.json"].value.identityBoundary || {};
  const brandBoundary = artifacts["brand-pack.json"].value.identity || {};
  const readinessBoundary = artifacts["readiness.json"].value.identityBoundary || {};
  const ownTokens = configBoundary.ownBrandTokens;
  const foreignTokens = configBoundary.knownForeignBrandTokens;
  const allBoundaries = [
    ["tenant-config.json.identityBoundary", configBoundary.ownBrandTokens, configBoundary.knownForeignBrandTokens],
    ["brand-pack.json.identity", brandBoundary.brandTokens, brandBoundary.knownForeignBrandTokens],
    ["readiness.json.identityBoundary", readinessBoundary.ownBrandTokens, readinessBoundary.knownForeignBrandTokens]
  ];

  for (const [label, boundaryOwnTokens, boundaryForeignTokens] of allBoundaries) {
    requireReady(collector, allowIncomplete, Array.isArray(boundaryOwnTokens) && boundaryOwnTokens.every(hasNonPlaceholderText) && boundaryOwnTokens.length > 0, `${label}.ownBrandTokens needs at least one reviewed, non-placeholder tenant brand token before W0.`);
    requireReady(collector, allowIncomplete, Array.isArray(boundaryForeignTokens) && boundaryForeignTokens.every(hasNonPlaceholderText) && boundaryForeignTokens.length > 0, `${label}.knownForeignBrandTokens needs at least one reviewed foreign-token test value before W0.`);
  }

  if (!sameNormalizedList(ownTokens, brandBoundary.brandTokens) || !sameNormalizedList(ownTokens, readinessBoundary.ownBrandTokens)) {
    collector.error("Identity-boundary own brand tokens must match in tenant-config.json, brand-pack.json, and readiness.json.");
  }
  if (!sameNormalizedList(foreignTokens, brandBoundary.knownForeignBrandTokens) || !sameNormalizedList(foreignTokens, readinessBoundary.knownForeignBrandTokens)) {
    collector.error("Identity-boundary foreign tokens must match in tenant-config.json, brand-pack.json, and readiness.json.");
  }

  const normalizedOwnTokens = new Set(normalizedList(ownTokens));
  const normalizedForeignTokens = normalizedList(foreignTokens);
  if (normalizedForeignTokens.some((token) => normalizedOwnTokens.has(token))) {
    collector.error("Identity-boundary foreign tokens must not overlap the tenant's own brand tokens.");
  }

  const approvedDeclarations = new Set([
    "tenant-config.json.identityBoundary.knownForeignBrandTokens",
    "brand-pack.json.identity.knownForeignBrandTokens",
    "readiness.json.identityBoundary.knownForeignBrandTokens"
  ]);
  const foreignTokensToFind = normalizedForeignTokens.filter((token) => !placeholderPattern.test(token));
  if (foreignTokensToFind.length === 0) return;
  for (const [relativePath, artifact] of Object.entries(artifacts)) {
    walkValue(artifact.value, (child, segments) => {
      if (typeof child !== "string") return;
      const pointer = `${relativePath}.${stringifyPath(segments)}`;
      if (approvedDeclarations.has(pointer) || [...approvedDeclarations].some((declaration) => pointer.startsWith(`${declaration}[`))) return;
      const normalizedChild = child.toLowerCase();
      for (const foreignToken of foreignTokensToFind) {
        if (normalizedChild.includes(foreignToken)) {
          collector.error(`${pointer}: contains the declared foreign tenant token "${foreignToken}" outside an approved identity-boundary declaration.`);
        }
      }
    });
  }
};

const isForbiddenExecutionValue = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return /(?:forbidden|blocked|disabled|not_authorized|not-connected|not_connected|not_reviewed|none|internal_draft_only|draft_only)/.test(normalized);
};

const collectExecutionValues = (value) => Array.isArray(value) ? value.flatMap(collectExecutionValues) : [value];

const validateNoExternalExecution = (artifacts, collector) => {
  const executionKeys = new Set(["externalAction", "publishing", "paidSpend", "outreach", "accountConnection", "paidCampaign", "budgetCap"]);
  for (const [relativePath, artifact] of Object.entries(artifacts)) {
    walkValue(artifact.value, (child, segments) => {
      const key = segments.at(-1);
      const pointer = `${relativePath}.${stringifyPath(segments)}`;
      if (key === "allowedActions") {
        const values = collectExecutionValues(child);
        if (values.some((value) => value !== "internal_draft_only")) {
          collector.error(`${pointer}: only "internal_draft_only" is permitted while the tenant is in draft-only mode.`);
        }
      }
      if (key === "externalExecutionAuthority" && String(child || "").toLowerCase() !== "none") {
        collector.error(`${pointer}: must be "none" until a later execution gate.`);
      }
      if (executionKeys.has(key) && !collectExecutionValues(child).every(isForbiddenExecutionValue)) {
        collector.error(`${pointer}: external execution must remain forbidden, disabled, blocked, or not authorized in this template.`);
      }
      if (typeof key === "string" && /(?:external|publish|outreach|paid|account|channel|campaign|destination).*(?:allow|enable|authori[sz]|active|live)/i.test(key)) {
        const values = collectExecutionValues(child);
        if (values.some((value) => value === true || /(?:allow|enable|authori[sz]|active|live|connected|scheduled|published|sent|spend)/i.test(String(value)))) {
          collector.error(`${pointer}: declares an external execution allow/enabled state, which is outside the draft-only boundary.`);
        }
      }
    });
  }
};

const validateDataPlane = (artifacts, collector, allowIncomplete) => {
  const configPlane = artifacts["tenant-config.json"].value.dataPlane || {};
  const businessPlane = artifacts["business-pack.json"].value.dataPlane || {};
  const readinessPlane = artifacts["readiness.json"].value.dataPlane || {};
  const configExpected = {
    backend: "separate_project_required",
    analytics: "separate_property_required",
    senderDomain: "separate_domain_required",
    credentials: "separate_secret_store_required"
  };
  for (const [key, expected] of Object.entries(configExpected)) {
    requireReady(collector, allowIncomplete, configPlane[key] === expected, `tenant-config.json.dataPlane.${key} must be "${expected}" before W0.`);
  }
  const businessExpected = {
    backend: "separate_project_required",
    analytics: "separate_property_required",
    senderDomain: "separate_domain_required",
    credentialStore: "separate_secret_store_required",
    sharedDatabaseWithTenantColumn: "not_accepted"
  };
  for (const [key, expected] of Object.entries(businessExpected)) {
    requireReady(collector, allowIncomplete, businessPlane[key] === expected, `business-pack.json.dataPlane.${key} must be "${expected}" before W0.`);
  }
  requireReady(collector, allowIncomplete, /separate/i.test(readinessPlane.tenantRuntime || ""), "readiness.json.dataPlane.tenantRuntime must state that tenant runtime is separately controlled before W0.");
  requireReady(collector, allowIncomplete, /aggregate_deidentified/i.test(readinessPlane.crossTenantLearning || ""), "readiness.json.dataPlane.crossTenantLearning must restrict comparison to aggregate_deidentified LearningExport records.");
};

const validateConsentAndChannelBoundary = (artifacts, collector, allowIncomplete) => {
  const consentMap = artifacts["privacy/consent-data-map.json"].value;
  const capabilityMatrix = artifacts["channels/capability-matrix.json"].value;
  const requiredPermittedClasses = [
    "tenant_sanitized_configuration",
    "approved_public_research",
    "licensed_or_owned_asset_reference",
    "aggregate_deidentified_learning_export"
  ];
  const requiredProhibitedClasses = [
    "customer_identifier",
    "contact_detail",
    "private_conversation",
    "private_journal_or_note",
    "sensitive_personal_data",
    "sensitive_inference",
    "uploaded_image",
    "provider_or_oauth_secret",
    "raw_ad_platform_data",
    "prompt_or_trace_payload"
  ];
  requireReady(collector, allowIncomplete, consentMap.status === readyStatus && consentMap.isSynthetic === false, `privacy/consent-data-map.json must be ${readyStatus} with isSynthetic false.`);
  requireReady(collector, allowIncomplete, hasNonPlaceholderText(consentMap.ownerRole) && isIsoDate(consentMap.lastReviewedAt), "privacy/consent-data-map.json requires a reviewed privacy owner and YYYY-MM-DD review date.");
  requireReady(collector, allowIncomplete, requiredPermittedClasses.every((dataClass) => consentMap.permittedDataClasses?.includes(dataClass)), "privacy/consent-data-map.json must list the four permitted configuration, public research, licensed asset, and aggregate learning data classes.");
  requireReady(collector, allowIncomplete, requiredProhibitedClasses.every((dataClass) => consentMap.prohibitedDataClasses?.includes(dataClass)), "privacy/consent-data-map.json must prohibit identifiers, private content, sensitive data, images, secrets, raw ad data, and prompt/trace payloads.");
  requireReady(collector, allowIncomplete, consentMap.collectionBoundary?.sprint01Status === "no_customer_data_collection_authorized", "privacy/consent-data-map.json must keep Sprint 01 customer data collection unauthorized.");
  requireReady(collector, allowIncomplete, hasNonPlaceholderText(consentMap.collectionBoundary?.allowedPurpose) && Array.isArray(consentMap.collectionBoundary?.requiredBeforeAnyFutureCollection) && consentMap.collectionBoundary.requiredBeforeAnyFutureCollection.some((item) => /opt_out|withdrawal/i.test(item)), "privacy/consent-data-map.json must define a narrow internal purpose and a future opt-out or withdrawal route.");
  requireReady(collector, allowIncomplete, consentMap.retentionAndDeletion?.status === "owner_configured_no_collection" && hasNonPlaceholderText(consentMap.retentionAndDeletion?.policyReference) && hasNonPlaceholderText(consentMap.retentionAndDeletion?.deletionOwnerRole), "privacy/consent-data-map.json must assign retention/deletion ownership while keeping collection off.");
  requireReady(collector, allowIncomplete, /aggregate_deidentified/i.test(consentMap.crossTenantSharing || "") && consentMap.externalAction === "forbidden", "privacy/consent-data-map.json must keep cross-tenant sharing aggregate-only and external action forbidden.");

  requireReady(collector, allowIncomplete, capabilityMatrix.status === readyStatus && capabilityMatrix.isSynthetic === false, `channels/capability-matrix.json must be ${readyStatus} with isSynthetic false.`);
  requireReady(collector, allowIncomplete, Array.isArray(capabilityMatrix.channels) && capabilityMatrix.channels.length > 0, "channels/capability-matrix.json needs at least one disabled future-channel record.");
  for (const channel of capabilityMatrix.channels || []) {
    requireReady(collector, allowIncomplete, hasNonPlaceholderText(channel.id) && hasNonPlaceholderText(channel.type) && hasNonPlaceholderText(channel.ownerRole), "Each channel capability record needs a reviewed id, type, and owner role.");
    requireReady(collector, allowIncomplete, channel.status === "disabled" && Array.isArray(channel.allowedActions) && channel.allowedActions.length === 1 && channel.allowedActions[0] === "internal_draft_only" && channel.externalAction === "forbidden", "Each channel capability record must remain disabled, internal-draft-only, and forbidden from external action.");
    requireReady(collector, allowIncomplete, channel.preflightStatus === "prepared_for_later_gate" && hasNonPlaceholderText(channel.rollbackPlanReference) && hasNonPlaceholderText(channel.receiptPlanReference) && channel.destinationStatus === "not_connected", "Each channel capability record needs a later-gate preflight, rollback reference, receipt reference, and not_connected destination.");
  }
  requireReady(collector, allowIncomplete, Array.isArray(capabilityMatrix.globalRestrictions) && capabilityMatrix.globalRestrictions.length >= 2 && capabilityMatrix.externalAction === "forbidden", "channels/capability-matrix.json must retain global execution restrictions and forbid external action.");
};

const validateBrandAndBusiness = (artifacts, collector, allowIncomplete) => {
  const brand = artifacts["brand-pack.json"].value;
  const business = artifacts["business-pack.json"].value;
  const readiness = artifacts["readiness.json"].value;
  requireReady(collector, allowIncomplete, brand.status === readyStatus, `brand-pack.json.status must be "${readyStatus}" after the tenant brand owner reviews it.`);
  requireReady(collector, allowIncomplete, brand.isSynthetic === false, "brand-pack.json.isSynthetic must be false after real tenant facts are reviewed.");
  requireReady(collector, allowIncomplete, hasNonPlaceholderText(brand.brandPackVersion), "brand-pack.json.brandPackVersion must be a reviewed version.");
  requireReady(collector, allowIncomplete, hasNonPlaceholderText(brand.identity?.productName) && hasNonPlaceholderText(brand.identity?.tagline), "brand-pack.json requires a reviewed productName and tagline.");
  requireReady(collector, allowIncomplete, Array.isArray(brand.voice?.qualities) && brand.voice.qualities.length >= 3 && brand.voice.qualities.every(hasNonPlaceholderText), "brand-pack.json.voice.qualities must contain three reviewed voice qualities.");
  requireReady(collector, allowIncomplete, hasNonPlaceholderText(brand.audienceLanguage?.primaryLocale) && Array.isArray(brand.audienceLanguage?.supportedLocales) && brand.audienceLanguage.supportedLocales.every(hasNonPlaceholderText), "brand-pack.json.audienceLanguage must define reviewed locales.");
  requireReady(collector, allowIncomplete, Array.isArray(brand.audienceLanguage?.requiredContentLocales) && brand.audienceLanguage.requiredContentLocales.length > 0 && brand.audienceLanguage.requiredContentLocales.every(hasNonPlaceholderText), "brand-pack.json.audienceLanguage.requiredContentLocales must define the locales required for claim copy.");
  requireReady(collector, allowIncomplete, brand.publicCopyBoundary?.requiresHumanApproval === true, "brand-pack.json.publicCopyBoundary.requiresHumanApproval must remain true.");

  requireReady(collector, allowIncomplete, business.status === readyStatus, `business-pack.json.status must be "${readyStatus}" after owner review.`);
  requireReady(collector, allowIncomplete, business.isSynthetic === false, "business-pack.json.isSynthetic must be false after real tenant facts are reviewed.");
  requireReady(collector, allowIncomplete, business.brandPackVersion === brand.brandPackVersion, "business-pack.json.brandPackVersion must match brand-pack.json.brandPackVersion.");
  for (const field of ["category", "targetMarket", "primaryLocale", "valueHypothesis"]) {
    requireReady(collector, allowIncomplete, hasNonPlaceholderText(business.businessContext?.[field]), `business-pack.json.businessContext.${field} requires a reviewed tenant value.`);
  }
  requireReady(collector, allowIncomplete, hasNonPlaceholderText(business.activationEvent?.id) && hasNonPlaceholderText(business.activationEvent?.definition), "business-pack.json.activationEvent requires a reviewed definition.");
  requireReady(collector, allowIncomplete, ["definition_reviewed_no_collection", "definition_only_verified"].includes(business.activationEvent?.status), "business-pack.json.activationEvent.status must be a reviewed definition-only state; it must not assert live collection.");
  requireReady(collector, allowIncomplete, hasNonPlaceholderText(business.approvalAuthority?.role) && business.approvalAuthority?.status === "assigned", "business-pack.json.approvalAuthority requires an assigned human owner.");
  requireReady(collector, allowIncomplete, hasNonPlaceholderText(business.incidentResponse?.role) && business.incidentResponse?.status === "assigned", "business-pack.json.incidentResponse requires an assigned incident owner.");
  const channelCapabilities = business.channelCapabilities;
  requireReady(collector, allowIncomplete, Array.isArray(channelCapabilities) && channelCapabilities.length > 0, "business-pack.json.channelCapabilities needs at least one disabled internal-draft channel record.");
  for (const capability of channelCapabilities || []) {
    requireReady(collector, allowIncomplete, hasNonPlaceholderText(capability.channel) && capability.status === "disabled" && capability.externalAction === "forbidden", "business-pack.json.channelCapabilities must remain disabled and forbidden in W0/B1.");
  }
  const destinations = business.destinations;
  requireReady(collector, allowIncomplete, Array.isArray(destinations) && destinations.length > 0, "business-pack.json.destinations needs a future, not-connected destination record.");
  for (const destination of destinations || []) {
    requireReady(collector, allowIncomplete, hasNonPlaceholderText(destination.id) && destination.status === "not_connected" && destination.externalAction === "forbidden", "business-pack.json.destinations must remain not_connected and forbidden in W0/B1.");
  }

  requireReady(collector, allowIncomplete, readiness.status === readyStatus, `readiness.json.status must be "${readyStatus}" after the tenant lead completes readiness review.`);
  requireReady(collector, allowIncomplete, readiness.isSynthetic === false, "readiness.json.isSynthetic must be false after the tenant boundary is reviewed.");
  requireReady(collector, allowIncomplete, readiness.mode === "draft_only" && readiness.externalAction === "forbidden", "readiness.json must keep mode draft_only and externalAction forbidden.");
  requireReady(collector, allowIncomplete, JSON.stringify(readiness.implementedWorkflowIds || []) === JSON.stringify(implementedWorkflowIds), "readiness.json.implementedWorkflowIds must cover W0, W1, W2 and W6 only.");
  requireReady(collector, allowIncomplete, JSON.stringify(readiness.deferredWorkflowIds || []) === JSON.stringify(deferredWorkflowIds), "readiness.json.deferredWorkflowIds must keep W3, W4 and W5 deferred.");
  requireReady(collector, allowIncomplete, readiness.externalReadiness?.status === "blocked", "readiness.json.externalReadiness.status must remain blocked for this draft-only framework.");
};

const validateRoleMapping = (artifacts, collector, allowIncomplete) => {
  const roleMapping = artifacts["role-mapping.json"].value;
  const business = artifacts["business-pack.json"].value;
  const approvals = artifacts["approvals/index.json"].value;
  const mappings = roleMapping.frameworkRoleMappings || {};
  requireReady(collector, allowIncomplete, roleMapping.status === readyStatus && roleMapping.isSynthetic === false, `role-mapping.json must be reviewed and marked ${readyStatus} with isSynthetic false.`);
  for (const capability of requiredCapabilities) {
    requireReady(collector, allowIncomplete, hasNonPlaceholderText(mappings[capability]), `role-mapping.json.frameworkRoleMappings.${capability} requires a distinct, reviewed tenant role or agent id.`);
  }
  if (hasText(mappings.content_authoring) && mappings.content_authoring === mappings.quality_assurance) {
    collector.error("role-mapping.json must keep content_authoring and quality_assurance assigned to different roles or agents.");
  }
  if (roleMapping.externalExecutionAuthority !== "none") {
    collector.error("role-mapping.json.externalExecutionAuthority must remain " + '"none"' + " in this draft-only framework.");
  }
  requireReady(collector, allowIncomplete, hasNonPlaceholderText(roleMapping.humanApprovalAuthority), "role-mapping.json.humanApprovalAuthority requires an assigned human role.");
  requireReady(collector, allowIncomplete, approvals.approvalOwner === roleMapping.humanApprovalAuthority, "approvals/index.json.approvalOwner must match role-mapping.json.humanApprovalAuthority.");
  requireReady(collector, allowIncomplete, business.approvalAuthority?.role === roleMapping.humanApprovalAuthority, "business-pack.json.approvalAuthority.role must match role-mapping.json.humanApprovalAuthority.");
};

const validateProductTruth = (artifacts, collector, allowIncomplete) => {
  const productTruth = artifacts["product-truth.json"].value;
  const brand = artifacts["brand-pack.json"].value;
  const requiredContentLocales = brand.audienceLanguage?.requiredContentLocales || [];
  requireReady(collector, allowIncomplete, productTruth.status === readyStatus, `product-truth.json.status must be "${readyStatus}" after evidence review.`);
  requireReady(collector, allowIncomplete, productTruth.brandPackVersion === brand.brandPackVersion, "product-truth.json.brandPackVersion must match brand-pack.json.brandPackVersion.");
  requireReady(collector, allowIncomplete, isIsoDate(productTruth.lastReviewedAt), "product-truth.json.lastReviewedAt must be a valid YYYY-MM-DD review date.");
  requireReady(collector, allowIncomplete, Array.isArray(productTruth.features) && productTruth.features.length > 0, "product-truth.json requires at least one evidence-bound feature before W0.");
  for (const feature of productTruth.features || []) {
    requireReady(collector, allowIncomplete, hasNonPlaceholderText(feature.id) && ["verified", "ready_for_W0"].includes(feature.status), `product-truth feature ${feature.id || "unknown"} must have a reviewed id and verified status.`);
    requireReady(collector, allowIncomplete, Array.isArray(feature.platforms) && feature.platforms.length > 0 && feature.platforms.every(hasNonPlaceholderText), `product-truth feature ${feature.id || "unknown"} requires a reviewed platform list.`);
    requireReady(collector, allowIncomplete, Array.isArray(feature.evidence) && feature.evidence.length > 0, `product-truth feature ${feature.id || "unknown"} requires current evidence.`);
    const evidenceIds = new Set();
    for (const evidence of feature.evidence || []) {
      requireReady(collector, allowIncomplete, hasNonPlaceholderText(evidence.id) && hasNonPlaceholderText(evidence.type) && hasNonPlaceholderText(evidence.reference) && isCurrentOrFutureDate(evidence.expiresAt), `product-truth evidence for feature ${feature.id || "unknown"} needs id, type, reviewable reference, and a current expiry date.`);
      if (hasText(evidence.id)) evidenceIds.add(evidence.id);
    }
    requireReady(collector, allowIncomplete, Array.isArray(feature.claims) && feature.claims.length > 0, `product-truth feature ${feature.id || "unknown"} requires at least one bounded internal claim.`);
    for (const claim of feature.claims || []) {
      const safeSurfaces = Array.isArray(claim.allowedSurfaces) && claim.allowedSurfaces.length > 0 && claim.allowedSurfaces.every((surface) => allowedInternalClaimSurfaces.has(surface));
      if (!safeSurfaces) collector.error(`product-truth claim ${claim.id || "unknown"}: allowedSurfaces may contain only internal_draft_only, draft_internal, or qa_pass_pending_human.`);
      const refs = Array.isArray(claim.evidenceRefs) ? claim.evidenceRefs : [];
      if (refs.some((reference) => !evidenceIds.has(reference))) {
        collector.error(`product-truth claim ${claim.id || "unknown"}: every evidenceRefs value must link to evidence on the same feature.`);
      }
      requireReady(collector, allowIncomplete, hasNonPlaceholderText(claim.id) && ["internal_only", "verified_internal_only", "qa_pass_pending_human"].includes(claim.status) && refs.length > 0 && isCurrentOrFutureDate(claim.expiresAt), `product-truth claim ${claim.id || "unknown"} needs an internal-only reviewed status, linked evidence, and a current expiry date.`);
      requireReady(collector, allowIncomplete, requiredContentLocales.every((locale) => hasNonPlaceholderText(claim.copy?.[locale])), `product-truth claim ${claim.id || "unknown"} requires reviewed copy for every brand-pack.json.audienceLanguage.requiredContentLocales locale.`);
    }
  }
};

const validateResearchAndMeasurement = (artifacts, collector, allowIncomplete) => {
  const sourceRegister = artifacts["research/source-register.json"].value;
  const interviewKit = artifacts["research/interview-kit.json"].value;
  const eventMap = artifacts["measurement/event-ownership-map.json"].value;
  requireReady(collector, allowIncomplete, sourceRegister.status === "reviewed_for_internal_research" && sourceRegister.isSynthetic === false, "research/source-register.json must be reviewed_for_internal_research with isSynthetic false.");
  requireReady(collector, allowIncomplete, Array.isArray(sourceRegister.sources) && sourceRegister.sources.length >= 3, "research/source-register.json needs at least three reviewed sources.");
  for (const source of sourceRegister.sources || []) {
    requireReady(collector, allowIncomplete, hasNonPlaceholderText(source.id) && hasNonPlaceholderText(source.type) && hasNonPlaceholderText(source.reference) && source.reviewStatus === "approved_for_internal_research", "Each research source needs a reviewed id, type, private reference, and approved_for_internal_research status.");
  }
  requireReady(collector, allowIncomplete, Array.isArray(sourceRegister.prohibitedInputs) && sourceRegister.prohibitedInputs.length >= 5 && sourceRegister.externalAction === "forbidden", "research/source-register.json must retain prohibited inputs and forbid external action.");

  requireReady(collector, allowIncomplete, interviewKit.status === "ready_for_internal_research" && interviewKit.isSynthetic === false, "research/interview-kit.json must be ready_for_internal_research with isSynthetic false.");
  requireReady(collector, allowIncomplete, interviewKit.minimumParticipantAge >= 18, "research/interview-kit.json.minimumParticipantAge must be at least 18.");
  requireReady(collector, allowIncomplete, interviewKit.participantTarget?.minimum >= 1 && interviewKit.participantTarget?.maximum >= interviewKit.participantTarget?.minimum && hasNonPlaceholderText(interviewKit.participantTarget?.market) && hasNonPlaceholderText(interviewKit.participantTarget?.primaryLocale), "research/interview-kit.json requires a bounded, reviewed participant target.");
  requireReady(collector, allowIncomplete, Array.isArray(interviewKit.consentBoundary) && interviewKit.consentBoundary.length >= 3 && Array.isArray(interviewKit.questions) && interviewKit.questions.length >= 5 && /^forbidden/.test(interviewKit.externalAction || ""), "research/interview-kit.json must retain consent questions and forbid outreach until a later gate.");

  requireReady(collector, allowIncomplete, eventMap.status === "definition_reviewed_no_collection" && eventMap.isSynthetic === false, "measurement/event-ownership-map.json must be definition_reviewed_no_collection with isSynthetic false.");
  requireReady(collector, allowIncomplete, Array.isArray(eventMap.events) && eventMap.events.length >= 5, "measurement/event-ownership-map.json needs at least five aggregate event definitions.");
  for (const event of eventMap.events || []) {
    requireReady(collector, allowIncomplete, hasNonPlaceholderText(event.id) && hasNonPlaceholderText(event.ownerRole) && hasNonPlaceholderText(event.purpose) && ["aggregate_only", "consent_scoped_aggregate"].includes(event.dataClass) && event.state === "definition_reviewed_no_collection", "Each measurement event must be owned, aggregate-only, and definition_reviewed_no_collection.");
  }
  requireReady(collector, allowIncomplete, Array.isArray(eventMap.forbiddenDimensions) && eventMap.forbiddenDimensions.length >= 5 && eventMap.crossTenantSharing === "aggregate_deidentified_learning_export_only" && eventMap.externalAction === "forbidden", "measurement/event-ownership-map.json must keep its privacy boundary and external-action restriction.");
};

const validateJourneyMap = (artifacts, collector, allowIncomplete) => {
  const journeyMap = artifacts["journey/journey-map.json"].value;
  const eventMap = artifacts["measurement/event-ownership-map.json"].value;
  const eventIds = new Set((eventMap.events || []).map((event) => event.id));
  requireReady(collector, allowIncomplete, journeyMap.status === readyStatus && journeyMap.isSynthetic === false, `journey/journey-map.json must be ${readyStatus} with isSynthetic false.`);
  requireReady(collector, allowIncomplete, hasNonPlaceholderText(journeyMap.ownerRole) && isIsoDate(journeyMap.lastReviewedAt), "journey/journey-map.json requires a reviewed ownerRole and YYYY-MM-DD review date.");
  requireReady(collector, allowIncomplete, Array.isArray(journeyMap.stages) && journeyMap.stages.length >= 1, "journey/journey-map.json requires at least one privacy-safe draft-only journey stage.");
  const stageIds = new Set();
  for (const stage of journeyMap.stages || []) {
    if (stageIds.has(stage.id)) collector.error(`journey/journey-map.json has a duplicate stage id: ${stage.id || "unknown"}.`);
    stageIds.add(stage.id);
    requireReady(collector, allowIncomplete, hasNonPlaceholderText(stage.id) && hasNonPlaceholderText(stage.entryCondition) && hasNonPlaceholderText(stage.intendedValueMoment) && hasNonPlaceholderText(stage.dropOffHypothesis) && hasNonPlaceholderText(stage.decisionUse), `journey/journey-map.json stage ${stage.id || "unknown"} requires reviewed entry, value-moment, drop-off, and decision-use hypotheses.`);
    const eventRefs = Array.isArray(stage.eventRefs) ? stage.eventRefs : [];
    if (eventRefs.length === 0 || eventRefs.some((eventRef) => !eventIds.has(eventRef))) {
      collector.error(`journey/journey-map.json stage ${stage.id || "unknown"}.eventRefs must link only to defined aggregate measurement events.`);
    }
    requireReady(collector, allowIncomplete, Array.isArray(stage.guardrails) && stage.guardrails.includes("aggregate_only") && stage.guardrails.includes("no_sensitive_targeting") && stage.guardrails.includes("no_external_action_without_later_gate"), `journey/journey-map.json stage ${stage.id || "unknown"} must retain aggregate_only, no_sensitive_targeting, and no_external_action_without_later_gate guardrails.`);
  }
  requireReady(collector, allowIncomplete, /aggregate/i.test(journeyMap.measurementBoundary || "") && /measurement\/event-ownership-map\.json/i.test(journeyMap.measurementBoundary || "") && journeyMap.externalAction === "forbidden", "journey/journey-map.json must use only aggregate measurement definitions and forbid external action.");
};

const validateExperimentAndLearning = (artifacts, collector, allowIncomplete) => {
  const experimentBrief = artifacts["campaigns/experiment-brief.json"].value;
  const eventMap = artifacts["measurement/event-ownership-map.json"].value;
  const productTruth = artifacts["product-truth.json"].value;
  const learning = artifacts["learning/learning-note.json"].value;
  const claimIds = new Set((productTruth.features || []).flatMap((feature) => (feature.claims || []).map((claim) => claim.id)));
  const eventIds = new Set((eventMap.events || []).map((event) => event.id));
  const experiment = experimentBrief.experiment || {};
  requireReady(collector, allowIncomplete, experimentBrief.status === readyStatus && experimentBrief.isSynthetic === false, `campaigns/experiment-brief.json must be ${readyStatus} with isSynthetic false.`);
  requireReady(collector, allowIncomplete, hasNonPlaceholderText(experiment.id) && hasNonPlaceholderText(experiment.hypothesis) && hasNonPlaceholderText(experiment.jtbd), "campaigns/experiment-brief.json requires a reviewed internal hypothesis and JTBD statement.");
  if (!Array.isArray(experiment.claimRefs) || experiment.claimRefs.some((claimRef) => !claimIds.has(claimRef))) {
    collector.error("campaigns/experiment-brief.json.experiment.claimRefs must link only to current ProductTruth claims.");
  }
  if (!eventIds.has(experiment.primaryMetric) || !eventIds.has(experiment.denominator)) {
    collector.error("campaigns/experiment-brief.json metrics must link to defined aggregate events.");
  }
  requireReady(collector, allowIncomplete, Array.isArray(experiment.guardrails) && experiment.guardrails.includes("draft_only_no_external_action") && experiment.nextGate === "qa_pass_pending_human", "campaigns/experiment-brief.json must retain draft-only guardrails and qa_pass_pending_human as its next gate.");
  const execution = experimentBrief.execution || {};
  requireReady(collector, allowIncomplete, execution.status === "disabled" && execution.publishing === "forbidden" && execution.paidSpend === "forbidden" && execution.outreach === "forbidden" && execution.accountConnection === "forbidden", "campaigns/experiment-brief.json.execution must remain disabled and forbidden.");

  requireReady(collector, allowIncomplete, learning.status === readyStatus && learning.isSynthetic === false, `learning/learning-note.json must be ${readyStatus} with isSynthetic false.`);
  requireReady(collector, allowIncomplete, learning.dataSource === "none" && Array.isArray(learning.currentHypotheses) && learning.currentHypotheses.length >= 2, "learning/learning-note.json must use no raw data and retain internal hypotheses only.");
  requireReady(collector, allowIncomplete, /aggregate_deidentified/i.test(learning.comparisonRule || "") && Array.isArray(learning.prohibitedLearningInputs) && learning.prohibitedLearningInputs.length >= 5 && learning.externalAction === "forbidden", "learning/learning-note.json must restrict comparison to aggregate de-identified learning and forbid external action.");
};

const validateRegistries = (artifacts, collector, allowIncomplete) => {
  const briefs = artifacts["briefs/index.json"].value;
  const content = artifacts["content-drafts/index.json"].value;
  const approvals = artifacts["approvals/index.json"].value;
  for (const [relativePath, registry, entriesKey] of [
    ["briefs/index.json", briefs, "briefs"],
    ["content-drafts/index.json", content, "artifacts"],
    ["approvals/index.json", approvals, "records"]
  ]) {
    requireReady(collector, allowIncomplete, registry.status === readyStatus && registry.isSynthetic === false, `${relativePath} must be a reviewed draft-only registry before W0.`);
    if (!Array.isArray(registry[entriesKey])) collector.error(`${relativePath}.${entriesKey} must be an array.`);
    const ids = new Set();
    for (const entry of registry[entriesKey] || []) {
      if (!entry || typeof entry !== "object" || !hasNonPlaceholderText(entry.id)) {
        collector.error(`${relativePath}.${entriesKey} entries require a non-placeholder id.`);
        continue;
      }
      if (ids.has(entry.id)) collector.error(`${relativePath}.${entriesKey} has a duplicate id: ${entry.id}.`);
      ids.add(entry.id);
    }
    if (registry.externalAction !== "forbidden") collector.error(`${relativePath}.externalAction must remain "forbidden" in this draft-only framework.`);
  }
};

const validateRiskAndManifest = (artifacts, collector, allowIncomplete) => {
  const riskRegister = artifacts["risk-register.json"].value;
  const manifest = artifacts["onboarding-manifest.json"].value;
  requireReady(collector, allowIncomplete, riskRegister.status === readyStatus && riskRegister.isSynthetic === false, `risk-register.json must be ${readyStatus} with isSynthetic false after owner review.`);
  const riskIds = new Set((riskRegister.risks || []).map((risk) => risk.id));
  for (const requiredRiskId of requiredRiskIds) {
    requireReady(collector, allowIncomplete, riskIds.has(requiredRiskId), `risk-register.json must include the ${requiredRiskId} risk.`);
  }
  for (const risk of riskRegister.risks || []) {
    requireReady(collector, allowIncomplete, hasNonPlaceholderText(risk.id) && hasNonPlaceholderText(risk.trigger) && hasNonPlaceholderText(risk.ownerRole) && hasNonPlaceholderText(risk.mitigation), `risk-register.json risk ${risk.id || "unknown"} needs a trigger, owner, and mitigation.`);
  }
  if (riskRegister.externalAction !== "forbidden") collector.error("risk-register.json.externalAction must remain " + '"forbidden"' + ".");

  requireReady(collector, allowIncomplete, manifest.status === readyStatus && manifest.isSynthetic === false, `onboarding-manifest.json must be ${readyStatus} with isSynthetic false after all owner checks.`);
  const checks = manifest.requiredBeforeW0Pass;
  requireReady(collector, allowIncomplete, Array.isArray(checks) && checks.length >= requiredManifestCheckIds.length, "onboarding-manifest.json must include every required W0 check.");
  const checkIds = new Set();
  for (const check of checks || []) {
    if (checkIds.has(check.id)) collector.error(`onboarding-manifest.json has a duplicate W0 check id: ${check.id || "unknown"}.`);
    checkIds.add(check.id);
    requireReady(collector, allowIncomplete, hasNonPlaceholderText(check.id) && hasNonPlaceholderText(check.ownerRole) && hasNonPlaceholderText(check.evidence) && check.status === "complete", `onboarding-manifest.json check ${check.id || "unknown"} needs owner, evidence, and status "complete" before W0.`);
  }
  for (const requiredCheckId of requiredManifestCheckIds) {
    requireReady(collector, allowIncomplete, checkIds.has(requiredCheckId), `onboarding-manifest.json must include the ${requiredCheckId} check.`);
  }
  requireReady(collector, allowIncomplete, /no external action/i.test(manifest.sprint01Restriction || "") && /aggregate_deidentified/i.test(manifest.crossTenantBoundary || ""), "onboarding-manifest.json must preserve the Sprint 01 no-external-action and aggregate-only cross-tenant boundaries.");
};

const validateReadinessMarkers = (artifacts, collector, allowIncomplete) => {
  const placeholderLocations = [];
  for (const [relativePath, artifact] of Object.entries(artifacts)) {
    placeholderLocations.push(...containsPlaceholder(artifact.value).map((location) => `${relativePath}.${location}`));
  }
  requireReady(collector, allowIncomplete, placeholderLocations.length === 0, `Replace all scaffold placeholders before W0. Found: ${placeholderLocations.slice(0, 5).join("; ")}${placeholderLocations.length > 5 ? `; and ${placeholderLocations.length - 5} more` : ""}`);
  for (const [relativePath, artifact] of Object.entries(artifacts)) {
    requireReady(collector, allowIncomplete, artifact.value.isSynthetic === false, `${relativePath}.isSynthetic must be false after the real tenant artifact is reviewed.`);
  }
};

export const validateGrowthTenant = (tenantRoot, { allowIncomplete = false } = {}) => {
  const collector = createIssueCollector();
  const resolvedRoot = path.resolve(tenantRoot || "");
  if (!tenantRoot) {
    collector.error("Tenant validation requires a tenant root directory.");
    return { errors: collector.errors, warnings: collector.warnings, summary: { state: "blocked", externalExecution: "forbidden" } };
  }
  if (!fs.existsSync(resolvedRoot)) {
    collector.error(`Tenant root does not exist: ${resolvedRoot}`);
    return { errors: collector.errors, warnings: collector.warnings, summary: { state: "blocked", externalExecution: "forbidden" } };
  }
  if (fs.lstatSync(resolvedRoot).isSymbolicLink()) {
    collector.error(`Tenant root may not be a symbolic link: ${resolvedRoot}`);
    return { errors: collector.errors, warnings: collector.warnings, summary: { state: "blocked", externalExecution: "forbidden" } };
  }
  if (!fs.lstatSync(resolvedRoot).isDirectory()) {
    collector.error(`Tenant root must be a directory: ${resolvedRoot}`);
    return { errors: collector.errors, warnings: collector.warnings, summary: { state: "blocked", externalExecution: "forbidden" } };
  }

  const artifacts = {};
  for (const relativePath of jsonArtifactPaths) {
    const parsed = readJsonFile(resolvedRoot, relativePath, collector);
    if (parsed) artifacts[relativePath] = parsed;
  }
  const readme = readTextFile(resolvedRoot, "README.md", collector);
  if (readme !== null) {
    if (containsSensitiveData(readme) || containsSensitiveInference(readme) || credentialPattern.test(readme)) {
      collector.error("README.md: contains a personal, sensitive-inference, or credential-like pattern.");
    }
    if (!/draft[ _-]?(?:only|internal)/i.test(readme) || !/external/i.test(readme)) {
      collector.error("README.md must explain the draft-only external-action boundary.");
    }
  }
  if (Object.keys(artifacts).length !== jsonArtifactPaths.length) {
    return {
      errors: collector.errors,
      warnings: collector.warnings,
      summary: { tenantRoot: resolvedRoot, state: "blocked", externalExecution: "forbidden" }
    };
  }

  const tenantId = validateTenantIds(artifacts, collector);
  validateArtifactDataSafety(artifacts, collector);
  validateNoExternalExecution(artifacts, collector);
  validateIdentityBoundary(artifacts, collector, allowIncomplete);
  validateDataPlane(artifacts, collector, allowIncomplete);
  validateConsentAndChannelBoundary(artifacts, collector, allowIncomplete);
  validateReadinessMarkers(artifacts, collector, allowIncomplete);
  validateBrandAndBusiness(artifacts, collector, allowIncomplete);
  validateRoleMapping(artifacts, collector, allowIncomplete);
  validateProductTruth(artifacts, collector, allowIncomplete);
  validateResearchAndMeasurement(artifacts, collector, allowIncomplete);
  validateJourneyMap(artifacts, collector, allowIncomplete);
  validateExperimentAndLearning(artifacts, collector, allowIncomplete);
  validateRegistries(artifacts, collector, allowIncomplete);
  validateRiskAndManifest(artifacts, collector, allowIncomplete);

  const state = collector.errors.length > 0 ? "blocked" : collector.warnings.length > 0 ? "incomplete" : readyStatus;
  return {
    errors: collector.errors,
    warnings: collector.warnings,
    summary: {
      tenantRoot: resolvedRoot,
      tenantId,
      state,
      readyForInternalDrafts: state === readyStatus,
      mode: "draft_only",
      externalExecution: "forbidden"
    }
  };
};

const runAsCli = () => {
  const rootIndex = process.argv.indexOf("--tenant-root");
  const tenantRoot = rootIndex >= 0 ? process.argv[rootIndex + 1] : null;
  const allowIncomplete = process.argv.includes("--allow-incomplete");
  const result = validateGrowthTenant(tenantRoot, { allowIncomplete });
  for (const warning of result.warnings) console.log(`INCOMPLETE: ${warning}`);
  for (const error of result.errors) console.error(`BLOCKED: ${error}`);
  if (result.errors.length === 0) {
    console.log(`Tenant ${result.summary.tenantId || "configuration"}: ${result.summary.state}; draft-only boundary remains enforced.`);
  }
  process.exitCode = result.errors.length > 0 ? 1 : 0;
};

if (path.resolve(process.argv[1] || "") === path.resolve(modulePath)) runAsCli();
