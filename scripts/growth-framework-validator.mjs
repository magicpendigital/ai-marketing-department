import fs from "node:fs";
import path from "node:path";

export const requiredSoftDimensions = [
  "jtbd_audience_relevance",
  "specific_differentiated_value",
  "proof_claim_precision",
  "brand_locale_editorial_quality",
  "clarity_cta_destination_fit",
  "platform_visual_accessibility_fit",
  "trust_emotional_safety",
  "experiment_measurement_quality",
  "operational_traceability_reuse"
];

export const hasText = (value) => typeof value === "string" && value.trim().length > 0;

export const containsSensitiveData = (value) => {
  const text = String(value || "");
  return [
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /(?:\+?84|0)(?:[ .-]?\d){8,10}\b/,
    /\b(?:0?[1-9]|[12]\d|3[01])[-/](?:0?[1-9]|1[0-2])[-/](?:19|20)\d{2}\b/,
    /(?:ngày sinh|birth date).{0,28}\d/i,
    /(?:đoạn chat riêng tư|private chat|raw journal|nhật ký riêng tư|face upload)/i
  ].some((pattern) => pattern.test(text));
};

export const containsSensitiveInference = (value) => {
  const text = String(value || "");
  return [
    /\b(?:anxiety|depression|mental health|health condition|relationship hardship|recent breakup|religion|political belief)\b/i,
    /(?:trầm cảm|sức khỏe tâm thần|tình trạng sức khỏe|khó khăn trong quan hệ|vừa chia tay|tôn giáo|niềm tin chính trị)/i
  ].some((pattern) => pattern.test(text));
};

export const containsSensitiveTargeting = (value) => {
  const text = String(value || "");
  return [
    /\b(?:target|targeting|audience|segment|retarget)\b[\s\S]{0,100}\b(?:anxiety|depression|mental health|health condition|recent breakup|religion|political belief)\b/i,
    /(?:nhắm\s*đến|nhắm mục tiêu|đối tượng|target)[\s\S]{0,100}(?:trầm cảm|sức khỏe tâm thần|tình trạng sức khỏe|vừa chia tay|tôn giáo|niềm tin chính trị)/i
  ].some((pattern) => pattern.test(text));
};

export const lintCandidate = (candidate) => {
  const codes = new Set();
  const text = String(candidate.text || "").toLowerCase();
  const externalSurface = ["public_organic", "paid", "private_channel_test"].includes(candidate.surface);

  if (externalSurface && (candidate.claimStatus !== "released" || candidate.evidenceVerified !== true)) {
    codes.add("claim_not_ready");
  }
  if (/(biết chắc|will definitely|guarantee your fate|định mệnh đã được quyết định)/i.test(text)) {
    codes.add("deterministic_prediction");
  }
  if (/(chữa|cure|heal every wound|diagnos|anxiety|trầm cảm|legal advice|lời khuyên tài chính|financial advice)/i.test(text)) {
    codes.add("sensitive_advice_or_guarantee");
  }
  if (/(aristotle thật|real aristotle|chuyên gia chính thức|official expert)/i.test(text)) {
    codes.add("persona_impersonation");
  }
  if (["unknown", "unlicensed"].includes(candidate.rightsStatus)) {
    codes.add("unlicensed_or_unknown_rights");
  }
  if (["missing", "mock", "stale"].includes(candidate.provenanceStatus) || candidate.destinationWorking === false) {
    codes.add("destination_or_provenance_missing");
  }
  if (candidate.containsSensitiveData === true || candidate.sensitiveTargeting === true || containsSensitiveData(text) || containsSensitiveInference(text) || containsSensitiveTargeting(text)) {
    codes.add("sensitive_data_leak");
  }
  const requiredLocales = Array.isArray(candidate.requiredLocales) ? candidate.requiredLocales.filter(hasText) : [];
  const copyLocales = Array.isArray(candidate.copyLocales) ? candidate.copyLocales.filter(hasText) : [];
  const missingRequiredLocale = requiredLocales.length > 0 && requiredLocales.some((locale) => !copyLocales.includes(locale));
  const missingLegacyFixedLocaleCoverage = requiredLocales.length === 0 && (candidate.hasVi !== true || candidate.hasEn !== true);
  if (missingRequiredLocale || missingLegacyFixedLocaleCoverage || candidate.accessibilityIssue === true) {
    codes.add("locale_or_accessibility_failure");
  }
  if (candidate.evidenceExpired === true) {
    codes.add("claim_evidence_expired");
  }
  if (candidate.approvalStale === true) {
    codes.add("approval_stale");
  }
  if (candidate.duplicateExecutionIntent === true) {
    codes.add("duplicate_execution_intent");
  }
  const foreignTokens = [candidate.foreignBrandToken, ...(candidate.knownForeignBrandTokens || [])]
    .filter(hasText)
    .map((token) => token.toLowerCase());
  if (foreignTokens.some((token) => text.includes(token))) {
    codes.add("cross_tenant_leak");
  }
  if (candidate.unsupportedCommercialClaim === true) {
    codes.add("claim_not_ready");
  }
  return [...codes];
};

const readJson = (workspaceRoot, relativePath, errors) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8"));
  } catch (error) {
    errors.push(`${relativePath}: cannot read valid JSON (${error.message})`);
    return null;
  }
};

const matchesType = (value, type) => {
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "null") return value === null;
  return typeof value === type;
};

const unsafeJsonPointerSegments = new Set(["__proto__", "prototype", "constructor"]);

const resolveLocalJsonPointer = (rootSchema, reference) => {
  if (typeof reference !== "string" || reference.length === 0 || reference.length > 2048) {
    return { error: "must be a non-empty local JSON Pointer" };
  }
  if (reference !== "#" && !reference.startsWith("#/")) {
    return { error: "must use a local JSON Pointer beginning with #/" };
  }

  let decodedPointer;
  try {
    decodedPointer = decodeURIComponent(reference.slice(1));
  } catch {
    return { error: "contains invalid URI escaping" };
  }
  if (decodedPointer === "") return { target: rootSchema, canonical: "#" };

  const rawSegments = decodedPointer.slice(1).split("/");
  if (rawSegments.length > 128) return { error: "exceeds the local JSON Pointer depth limit" };

  const segments = [];
  for (const rawSegment of rawSegments) {
    if (/~(?:[^01]|$)/.test(rawSegment)) return { error: "contains invalid JSON Pointer escaping" };
    const segment = rawSegment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (unsafeJsonPointerSegments.has(segment)) return { error: "contains an unsafe JSON Pointer segment" };
    segments.push(segment);
  }

  let target = rootSchema;
  for (const segment of segments) {
    if ((target === null || typeof target !== "object") || !Object.hasOwn(target, segment)) {
      return { error: "does not resolve inside the root schema" };
    }
    target = target[segment];
  }
  if (target === null || (typeof target !== "object" && typeof target !== "boolean")) {
    return { error: "does not resolve to a schema" };
  }

  return { target, canonical: `#/${segments.map((segment) => segment.replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}` };
};

const addReferenceError = (pointer, reference, reason, errors, context) => {
  const printableReference = typeof reference === "string" ? reference.slice(0, 160) : String(reference);
  const message = `${pointer}: schema reference ${JSON.stringify(printableReference)} ${reason}`;
  if (!errors.includes(message)) errors.push(message);
  if (context.fatalErrors !== errors && !context.fatalErrors.includes(message)) context.fatalErrors.push(message);
};

const validateSchemaValue = (schema, value, pointer, errors, context) => {
  if (schema === false) {
    errors.push(`${pointer}: is forbidden by the contract`);
    return;
  }
  if (schema === true || !schema || typeof schema !== "object") return;
  if (Object.hasOwn(schema, "$ref")) {
    const resolution = resolveLocalJsonPointer(context.rootSchema, schema.$ref);
    if (resolution.error) {
      addReferenceError(pointer, schema.$ref, resolution.error, errors, context);
      return;
    }
    if (context.activeRefs.has(resolution.canonical) || context.activeRefTargets.has(resolution.target)) {
      addReferenceError(pointer, schema.$ref, "forms a schema reference cycle", errors, context);
      return;
    }
    context.activeRefs.add(resolution.canonical);
    context.activeRefTargets.add(resolution.target);
    try {
      validateSchemaValue(resolution.target, value, pointer, errors, context);
    } finally {
      context.activeRefs.delete(resolution.canonical);
      context.activeRefTargets.delete(resolution.target);
    }
  }
  const allowedTypes = schema.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : [];
  if (allowedTypes.length && !allowedTypes.some((type) => matchesType(value, type))) {
    errors.push(`${pointer}: expected ${allowedTypes.join(" or ")}`);
    return;
  }
  if (Object.hasOwn(schema, "const") && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    errors.push(`${pointer}: must equal the contract constant`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) {
    errors.push(`${pointer}: is not an allowed contract value`);
  }
  if (typeof value === "string" && hasText(schema.pattern) && !(new RegExp(schema.pattern).test(value))) {
    errors.push(`${pointer}: does not match the contract pattern`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) errors.push(`${pointer}: requires at least ${schema.minItems} item(s)`);
    value.forEach((item, index) => validateSchemaValue(schema.items, item, `${pointer}[${index}]`, errors, context));
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    if (typeof schema.minProperties === "number" && Object.keys(value).length < schema.minProperties) {
      errors.push(`${pointer}: requires at least ${schema.minProperties} property/properties`);
    }
    for (const requiredKey of schema.required || []) {
      if (!Object.hasOwn(value, requiredKey)) errors.push(`${pointer}: missing required field ${requiredKey}`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(schema.properties || {}, key)) errors.push(`${pointer}: contains disallowed field ${key}`);
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (Object.hasOwn(value, key)) validateSchemaValue(childSchema, value[key], `${pointer}.${key}`, errors, context);
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      for (const [key, childValue] of Object.entries(value)) {
        if (!Object.hasOwn(schema.properties || {}, key)) validateSchemaValue(schema.additionalProperties, childValue, `${pointer}.${key}`, errors, context);
      }
    }
  }
  for (const childSchema of schema.allOf || []) {
    validateSchemaValue(childSchema, value, pointer, errors, context);
  }
  if (schema.if && typeof schema.if === "object") {
    const conditionErrors = [];
    validateSchemaValue(schema.if, value, pointer, conditionErrors, context);
    const branch = conditionErrors.length === 0 ? schema.then : schema.else;
    if (branch !== undefined) validateSchemaValue(branch, value, pointer, errors, context);
  }
};

export const validateContractInstance = (workspaceRoot, contractRelativePath, value, label = "contract instance") => {
  const errors = [];
  const schema = readJson(workspaceRoot, path.join("packages/growth-contracts", contractRelativePath), errors);
  if (schema) {
    validateSchemaValue(schema, value, label, errors, {
      rootSchema: schema,
      activeRefs: new Set(),
      activeRefTargets: new Set(),
      fatalErrors: errors
    });
  }
  return errors;
};

const validateContracts = (workspaceRoot, errors) => {
  const index = readJson(workspaceRoot, "packages/growth-contracts/contract-index.json", errors);
  if (!index) return;
  const requiredContracts = [
    "schemas/product-truth.schema.json",
    "schemas/content-brief.schema.json",
    "schemas/asset-package.schema.json",
    "schemas/qa-verdict.schema.json",
    "schemas/approval-record.schema.json",
    "schemas/execution-receipt.schema.json",
    "schemas/learning-export.schema.json",
    "schemas/agent-work-order.schema.json",
    "schemas/agent-job-state.schema.json",
    "schemas/agent-run-receipt.schema.json",
    "schemas/agent-work-log.schema.json",
    "schemas/independent-qa-verdict.schema.json",
    "schemas/canvas-workspace-registry.schema.json"
  ];
  if (!Array.isArray(index.contracts) || index.contracts.length !== requiredContracts.length || requiredContracts.some((contract) => !index.contracts.includes(contract))) {
    errors.push("contract index must list the thirteen portable framework and Canvas schemas");
    return;
  }
  for (const relativePath of index.contracts) {
    const schema = readJson(workspaceRoot, path.join("packages/growth-contracts", relativePath), errors);
    if (!schema) continue;
    if (!hasText(schema.title) || schema.type !== "object" || !Array.isArray(schema.required)) {
      errors.push(`contract schema ${relativePath} is incomplete`);
    }
  }
  const requiredRuntimeContracts = ["../growth-core/config/agent-runner-contract.json", "../growth-core/config/local-agent-bridge.json"];
  if (!Array.isArray(index.runtimeContracts) || requiredRuntimeContracts.some((contract) => !index.runtimeContracts.includes(contract))) {
    errors.push("contract index must list the runner and local Coding Agent bridge contracts");
  }
};

const validateCore = (workspaceRoot, errors) => {
  const catalog = readJson(workspaceRoot, "packages/growth-core/config/growth-agent-catalog.json", errors);
  const workflows = readJson(workspaceRoot, "packages/growth-core/config/growth-workflows-b0-b1.json", errors);
  const qualityGates = readJson(workspaceRoot, "packages/growth-core/config/quality-gates.json", errors);
  const metrics = readJson(workspaceRoot, "packages/growth-core/config/metric-contract.json", errors);
  const stateMachine = readJson(workspaceRoot, "packages/growth-core/config/approval-state-machine.json", errors);
  const skillsCatalog = readJson(workspaceRoot, "packages/growth-core/config/skills-catalog.json", errors);
  const agentTopology = readJson(workspaceRoot, "packages/growth-core/config/agent-team-topology.json", errors);
  const subworkflows = readJson(workspaceRoot, "packages/growth-core/config/workflow-subworkflows-b0-b1.json", errors);
  const onboardingPolicy = readJson(workspaceRoot, "packages/growth-core/config/tenant-onboarding-policy.json", errors);
  const runnerContract = readJson(workspaceRoot, "packages/growth-core/config/agent-runner-contract.json", errors);
  const localAgentBridge = readJson(workspaceRoot, "packages/growth-core/config/local-agent-bridge.json", errors);
  const exportManifest = readJson(workspaceRoot, "packages/growth-core/export-manifest.json", errors);
  const exportRootPackage = readJson(workspaceRoot, "packages/growth-core/export-root-package.json", errors);
  if (!catalog || !workflows || !qualityGates || !metrics || !stateMachine || !skillsCatalog || !agentTopology || !subworkflows || !onboardingPolicy || !runnerContract || !localAgentBridge || !exportManifest || !exportRootPackage) return;

  if (catalog.mode !== "draft_only" || !Array.isArray(catalog.agents) || catalog.agents.length !== 8) {
    errors.push("portable agent catalog must have exactly eight draft-only roles");
  }
  if (!catalog.forbiddenDataClasses?.includes("raw_private_chat") || !catalog.forbiddenDataClasses?.includes("provider_secret")) {
    errors.push("portable agent catalog must forbid private content and provider secrets");
  }
  for (const agent of catalog.agents || []) {
    for (const field of ["id", "purpose", "requiredCapability", "humanGate", "stopCondition"]) {
      if (!hasText(agent[field])) errors.push(`portable agent ${agent.id || "unknown"} requires ${field}`);
    }
  }

  if (workflows.mode !== "draft_only" || workflows.externalAction !== "forbidden") {
    errors.push("portable B0/B1 workflows must forbid external actions");
  }
  const expectedWorkflowIds = ["W0_readiness", "W1_research_to_plan", "W2_content_factory", "W6_learning_to_product"];
  const workflowIds = (workflows.workflows || []).map((workflow) => workflow.id);
  if (workflowIds.length !== expectedWorkflowIds.length || workflowIds.some((id, index) => id !== expectedWorkflowIds[index])) {
    errors.push("portable Sprint 01 must contain W0, W1, W2 and W6 only");
  }

  if (qualityGates.internalLibraryThreshold?.hardFailuresAllowed !== 0 || qualityGates.softDimensions?.length !== requiredSoftDimensions.length) {
    errors.push("portable quality gates must preserve zero hard failures and nine soft dimensions");
  }
  if (!metrics.forbiddenMarketingDimensions?.includes("raw_chat") || !metrics.forbiddenMarketingDimensions?.includes("birth_data")) {
    errors.push("portable metric contract must forbid sensitive marketing dimensions");
  }
  if (stateMachine.sprint01Restriction !== "No Sprint 01 artifact may transition beyond qa_pass_pending_human.") {
    errors.push("portable approval state machine must block Sprint 01 external transitions");
  }
  const agentIds = new Set((catalog.agents || []).map((agent) => agent.id));
  const ownerAgentByCapability = {
    workflow_orchestration: "growth_orchestrator",
    content_research: "research_jtbd",
    product_management: "positioning_experiment",
    content_authoring: "content_studio",
    quality_assurance: "independent_qa",
    design_operations: "distribution_planner",
    measurement_analysis: "journey_measurement"
  };
  const skillIds = new Set();
  if (skillsCatalog.mode !== "draft_only" || !Array.isArray(skillsCatalog.skills) || skillsCatalog.skills.length !== 8) {
    errors.push("portable skills catalog must define eight draft-only skills");
  }
  for (const skill of skillsCatalog.skills || []) {
    if (!hasText(skill.id) || skillIds.has(skill.id)) errors.push(`portable skill has a duplicate or missing id ${skill.id || "unknown"}`);
    skillIds.add(skill.id);
    if (!agentIds.has(ownerAgentByCapability[skill.ownerCapability])) {
      errors.push(`portable skill ${skill.id || "unknown"} has an unmapped owner capability`);
    }
    if (!Array.isArray(skill.workflowIds) || skill.workflowIds.length === 0 || !hasText(skill.stopCondition) || !hasText(skill.humanGate)) {
      errors.push(`portable skill ${skill.id || "unknown"} requires workflow scope, human gate and stop condition`);
    }
  }
  if (agentTopology.mode !== "draft_only" || agentTopology.orchestrator !== "growth_orchestrator" || !Array.isArray(agentTopology.cells) || agentTopology.cells.length !== 5) {
    errors.push("portable agent topology must define five draft-only cells led by the orchestrator");
  }
  for (const cell of agentTopology.cells || []) {
    if (!agentIds.has(cell.leadAgent) || !Array.isArray(cell.subagentTemplates) || cell.subagentTemplates.length < 2 || !hasText(cell.humanGate)) {
      errors.push(`portable topology cell ${cell.id || "unknown"} is incomplete`);
    }
  }
  const subworkflowIds = (subworkflows.subworkflows || []).map((workflow) => workflow.workflowId);
  if (subworkflows.mode !== "draft_only" || subworkflowIds.length !== expectedWorkflowIds.length || subworkflowIds.some((id, index) => id !== expectedWorkflowIds[index])) {
    errors.push("portable subworkflows must cover W0, W1, W2 and W6 in the declared order");
  }
  for (const workflow of subworkflows.subworkflows || []) {
    if (!Array.isArray(workflow.inputs) || workflow.inputs.length === 0 || !hasText(workflow.output) || !Array.isArray(workflow.allowedStateTransitions) || workflow.allowedStateTransitions.length < 2 || !hasText(workflow.failureState) || !hasText(workflow.idempotencyRule) || !Array.isArray(workflow.stages) || workflow.stages.length < 4 || !hasText(workflow.humanGate)) {
      errors.push(`portable subworkflow ${workflow.workflowId || "unknown"} is incomplete`);
    }
    for (const stage of workflow.stages || []) {
      if (!hasText(stage.id) || !Array.isArray(stage.inputs) || stage.inputs.length === 0 || !hasText(stage.output) || !hasText(stage.failureState) || !hasText(stage.idempotencyKey)) {
        errors.push(`portable subworkflow stage ${stage.id || "unknown"} is incomplete`);
      }
    }
  }
  const deferredIds = (subworkflows.deferredExecutionWorkflows || []).map((workflow) => workflow.workflowId);
  if (deferredIds.join(",") !== "W3_distribution_orchestration,W4_controlled_publishing,W5_paid_media") {
    errors.push("portable subworkflows must keep W3, W4 and W5 deferred");
  }
  if (onboardingPolicy.initialMode !== "draft_only" || !Array.isArray(onboardingPolicy.requiredSetupFiles) || onboardingPolicy.requiredSetupFiles.length !== 19 || !onboardingPolicy.prohibitedUntilExecutionGates?.includes("paid_spend")) {
    errors.push("portable tenant onboarding policy must require the full draft-only setup and block paid spend");
  }
  if (runnerContract.defaultAdapterMode !== "disabled" || runnerContract.implementationStatus !== "contract_only_no_provider_adapter_included" || !Array.isArray(runnerContract.permittedAdapterModes) || !runnerContract.permittedAdapterModes.includes("mock") || !Array.isArray(runnerContract.requiredJobFields) || runnerContract.requiredJobFields.length < 6 || !runnerContract.forbiddenJobInputs?.includes("provider_api_key") || !runnerContract.forbiddenJobInputs?.includes("customer_identifier")) {
    errors.push("portable runner contract must remain disabled by default and protect credentials and personal data");
  }
  if (!runnerContract.permittedAdapterModes?.includes("coding_agent_handoff") || localAgentBridge.defaultAdapterMode !== "coding_agent_handoff" || localAgentBridge.executionBoundary?.frameworkRequiresProviderApiKey !== false || localAgentBridge.executionBoundary?.frameworkAcceptsProviderApiKey !== false || localAgentBridge.executionBoundary?.frameworkStoresProviderCredential !== false || localAgentBridge.executionBoundary?.userInitiatedAgentSessionRequired !== true || localAgentBridge.executionBoundary?.headlessSubscriptionAuthentication !== "not_implemented_or_promised") {
    errors.push("local Coding Agent bridge must remain user-initiated, no-key, credential-free, and honest about headless authentication");
  }
  if (exportManifest.exportMode !== "allow_list_only" || exportManifest.nonIncludedPathsAreExcluded !== true) {
    errors.push("portable export manifest must enforce allow-list-only extraction");
  }
  const requiredExportPaths = [
    "packages/growth-contracts",
    "packages/growth-core",
    "packages/growth-fixtures",
    "packages/growth-canvas",
    "package-lock.json",
    "scripts/growth-framework-validator.mjs",
    "scripts/validate-growth-framework.mjs",
    "scripts/growth-framework.test.mjs",
    "scripts/export-growth-framework.mjs",
    "scripts/init-growth-tenant.mjs",
    "scripts/validate-growth-tenant.mjs",
    "scripts/growth-tenant-demo.mjs",
    "scripts/validate-growth-tenant-demo.mjs",
    "scripts/growth-tenant-onboarding.test.mjs",
    "scripts/prepare-growth-job.mjs",
    "scripts/growth-job-preparation.test.mjs",
    "scripts/claim-growth-job.mjs",
    "scripts/review-growth-job.mjs",
    "scripts/complete-growth-job.mjs",
    "scripts/growth-job-test-fixtures.mjs",
    "scripts/growth-job-lifecycle.test.mjs",
    "scripts/growth-canvas-contracts.test.mjs",
    "scripts/growth-canvas-backend.test.mjs",
    "scripts/media-supervisor-contracts.test.mjs",
    "scripts/validate-growth-tenant-artifacts.mjs",
    "scripts/growth-tenant-artifacts.test.mjs",
    "scripts/growth-two-tenant-demo.mjs",
    "scripts/growth-two-tenant-demo.test.mjs",
    "scripts/validate-growth-tenant-learning-export.mjs",
    "scripts/compare-growth-tenant-learning-exports.mjs",
    "scripts/growth-tenant-learning-demo.mjs",
    "scripts/growth-tenant-learning-export.test.mjs"
  ];
  for (const requiredPath of requiredExportPaths) {
    if (!exportManifest.include?.includes(requiredPath)) errors.push(`portable export manifest must include ${requiredPath}`);
  }
  const portablePackageRoots = new Set([
    "packages/growth-contracts",
    "packages/growth-core",
    "packages/growth-fixtures",
    "packages/growth-canvas"
  ]);
  const includesNonPortablePath = exportManifest.include?.some((relativePath) => {
    const normalizedPath = String(relativePath || "").replaceAll("\\", "/");
    const pathSegments = normalizedPath.split("/");
    const packageRoot = pathSegments.slice(0, 2).join("/");
    const nonFrameworkPackage = normalizedPath.startsWith("packages/") && !portablePackageRoots.has(packageRoot);
    const applicationRoot = /^(?:apps|supabase|assets|design)(?:\/|$)/i.test(normalizedPath);
    const privateDataPath = /(?:^|\/)(?:tenant-workspaces|private|customer-data)(?:\/|$)/i.test(normalizedPath);
    return nonFrameworkPackage || applicationRoot || privateDataPath;
  });
  if (includesNonPortablePath) {
    errors.push("portable export manifest includes a non-framework package or private/application path");
  }
  if (!exportManifest.neverExport?.includes("customer_data") || !exportManifest.neverExport?.includes("provider_or_oauth_secret")) {
    errors.push("portable export manifest must block customer data and secrets");
  }
  if (exportRootPackage.engines?.node !== ">=22 <23" || exportRootPackage.scripts?.validate !== "node scripts/validate-growth-framework.mjs" || exportRootPackage.scripts?.test !== "node --test scripts/growth-framework.test.mjs scripts/growth-tenant-onboarding.test.mjs scripts/growth-tenant-artifacts.test.mjs scripts/growth-job-preparation.test.mjs scripts/growth-two-tenant-demo.test.mjs scripts/growth-tenant-learning-export.test.mjs scripts/growth-canvas-contracts.test.mjs scripts/growth-canvas-backend.test.mjs scripts/growth-job-lifecycle.test.mjs scripts/media-supervisor-contracts.test.mjs" || exportRootPackage.scripts?.["canvas:build"] !== "npm run build --workspace growth-canvas" || exportRootPackage.scripts?.["canvas:start"] !== "npm run start --workspace growth-canvas --" || exportRootPackage.scripts?.["canvas:test"] !== "node --test scripts/growth-canvas-contracts.test.mjs scripts/growth-canvas-backend.test.mjs scripts/growth-job-lifecycle.test.mjs && npm run test:sites --workspace growth-canvas" || exportRootPackage.scripts?.["tenant:init"] !== "node scripts/init-growth-tenant.mjs" || exportRootPackage.scripts?.["tenant:validate"] !== "node scripts/validate-growth-tenant.mjs" || exportRootPackage.scripts?.["tenant:demo:validate"] !== "node scripts/validate-growth-tenant-demo.mjs" || exportRootPackage.scripts?.["tenant:artifact:validate"] !== "node scripts/validate-growth-tenant-artifacts.mjs" || exportRootPackage.scripts?.["tenant:job:prepare"] !== "node scripts/prepare-growth-job.mjs" || exportRootPackage.scripts?.["tenant:job:claim"] !== "node scripts/claim-growth-job.mjs" || exportRootPackage.scripts?.["tenant:job:review"] !== "node scripts/review-growth-job.mjs" || exportRootPackage.scripts?.["tenant:job:complete"] !== "node scripts/complete-growth-job.mjs" || exportRootPackage.scripts?.["tenant:two:validate"] !== "node scripts/growth-two-tenant-demo.mjs" || exportRootPackage.scripts?.["tenant:learning:validate"] !== "node scripts/validate-growth-tenant-learning-export.mjs" || exportRootPackage.scripts?.["tenant:learning:compare"] !== "node scripts/compare-growth-tenant-learning-exports.mjs" || exportRootPackage.scripts?.["tenant:learning:demo"] !== "node scripts/growth-tenant-learning-demo.mjs") {
    errors.push("portable export root package must expose framework validation and tests");
  }
};

const validateTemplate = (workspaceRoot, errors) => {
  const config = readJson(workspaceRoot, "packages/growth-fixtures/tenant-template/tenant-config.json", errors);
  const businessPack = readJson(workspaceRoot, "packages/growth-fixtures/tenant-template/business-pack.json", errors);
  const productTruth = readJson(workspaceRoot, "packages/growth-fixtures/tenant-template/product-truth.json", errors);
  if (config && businessPack && productTruth) {
    if (config.tenantId !== "ai-business-template" || config.isSynthetic !== true) {
      errors.push("portable second-tenant fixture must be explicitly synthetic");
    }
    if (businessPack.status !== "incomplete_by_design" || productTruth.status !== "not_onboarded") {
      errors.push("portable second-tenant fixture must not invent business facts or ProductTruth");
    }
    if (!Array.isArray(config.requiredBeforeWorkflow) || config.requiredBeforeWorkflow.length < 8) {
      errors.push("portable second-tenant fixture needs a complete onboarding checklist");
    }
    if (!Array.isArray(config.identityBoundary?.ownBrandTokens) || !Array.isArray(config.identityBoundary?.knownForeignBrandTokens)) {
      errors.push("portable second-tenant fixture needs an identity-boundary onboarding field");
    }
  }

  const scaffoldFiles = [
    "tenant-config.json",
    "brand-pack.json",
    "business-pack.json",
    "product-truth.json",
    "role-mapping.json",
    "readiness.json",
    "risk-register.json",
    "onboarding-manifest.json",
    "privacy/consent-data-map.json",
    "channels/capability-matrix.json",
    "journey/journey-map.json",
    "research/source-register.json",
    "research/interview-kit.json",
    "measurement/event-ownership-map.json",
    "campaigns/experiment-brief.json",
    "learning/learning-note.json",
    "briefs/index.json",
    "content-drafts/index.json",
    "approvals/index.json"
  ];
  const scaffold = new Map(scaffoldFiles.map((relativePath) => [relativePath, readJson(workspaceRoot, path.join("packages/growth-fixtures/tenant-template/scaffold", relativePath), errors)]));
  const scaffoldConfig = scaffold.get("tenant-config.json");
  const scaffoldManifest = scaffold.get("onboarding-manifest.json");
  const scaffoldRoleMapping = scaffold.get("role-mapping.json");
  const scaffoldReadiness = scaffold.get("readiness.json");
  const scaffoldRiskRegister = scaffold.get("risk-register.json");
  if (scaffoldConfig && (scaffoldConfig.isSynthetic !== true || scaffoldConfig.status !== "synthetic_onboarding_template" || !Array.isArray(scaffoldConfig.requiredBeforeWorkflow) || scaffoldConfig.requiredBeforeWorkflow.length < 10)) {
    errors.push("portable tenant scaffold must be explicitly synthetic and carry a complete onboarding checklist");
  }
  if (scaffoldManifest && (!Array.isArray(scaffoldManifest.requiredBeforeW0Pass) || scaffoldManifest.requiredBeforeW0Pass.length < 14 || scaffoldManifest.sprint01Restriction?.includes("external action") !== true)) {
    errors.push("portable tenant scaffold must include the full W0 review manifest and draft-only restriction");
  }
  if (scaffoldRoleMapping && (scaffoldRoleMapping.externalExecutionAuthority !== "none" || Object.keys(scaffoldRoleMapping.frameworkRoleMappings || {}).length !== 8)) {
    errors.push("portable tenant scaffold must map eight roles and forbid external execution");
  }
  if (scaffoldReadiness && (scaffoldReadiness.mode !== "draft_only" || scaffoldReadiness.externalAction !== "forbidden" || scaffoldReadiness.deferredWorkflowIds?.join(",") !== "W3_distribution_orchestration,W4_controlled_publishing,W5_paid_media")) {
    errors.push("portable tenant scaffold must keep execution workflows deferred");
  }
  if (scaffoldRiskRegister && (!Array.isArray(scaffoldRiskRegister.risks) || scaffoldRiskRegister.risks.length < 7 || scaffoldRiskRegister.externalAction !== "forbidden")) {
    errors.push("portable tenant scaffold must include the mandatory risk controls");
  }
};

const validateRepositoryStarter = (workspaceRoot, errors) => {
  const nestedStarter = path.join(workspaceRoot, "packages", "growth-core", "repository-template");
  const starterRoot = fs.existsSync(nestedStarter) ? nestedStarter : workspaceRoot;
  const requiredFiles = [
    ".gitignore",
    "CODEOWNERS",
    "CONTRIBUTING.md",
    "LICENSE_DECISION.md",
    "SECURITY.md",
    "AGENTS.md",
    "README.md",
    ".github/pull_request_template.md",
    ".github/workflows/framework-quality.yml",
    "docs/START_HERE.md",
    "docs/TENANT_ONBOARDING.md",
    "docs/OPERATING_MODEL.md",
    "docs/GOVERNANCE.md",
    "docs/TWO_BUSINESS_PILOT.md",
    "docs/VERSIONING_AND_UPGRADES.md"
  ];
  for (const relativePath of requiredFiles) {
    if (!fs.existsSync(path.join(starterRoot, relativePath))) errors.push(`portable repository starter is missing ${relativePath}`);
  }
  const expectedSkillIds = [
    "growth-readiness",
    "growth-research",
    "growth-positioning",
    "growth-content-factory",
    "growth-quality-gate",
    "growth-journey-measurement",
    "growth-execution-preflight",
    "growth-learning-synthesis"
  ];
  for (const skillId of expectedSkillIds) {
    const skillPath = path.join(starterRoot, "skills", skillId, "SKILL.md");
    if (!fs.existsSync(skillPath)) {
      errors.push(`portable repository starter is missing skill ${skillId}`);
      continue;
    }
    const skill = fs.readFileSync(skillPath, "utf8");
    if (!new RegExp(`^---\\s*\\nname: ${skillId}\\s*\\ndescription: .+\\n---`, "m").test(skill) || !/^## Inputs$/m.test(skill) || !/^## Hard stops$/m.test(skill) || !/^## Human gate$/m.test(skill) || !/^## Validate and hand off$/m.test(skill)) {
      errors.push(`portable skill ${skillId} must have valid front matter and operating boundaries`);
    }
  }
};

const validateFixtures = (workspaceRoot, errors) => {
  const fixtureSet = readJson(workspaceRoot, "packages/growth-fixtures/qa/adversarial-fixtures.json", errors);
  const learningExport = readJson(workspaceRoot, "packages/growth-fixtures/learning-exports/synthetic-example.json", errors);
  if (fixtureSet) {
    if (fixtureSet.isSynthetic !== true) errors.push("portable fixture set must be explicitly synthetic");
    if (!Array.isArray(fixtureSet.fixtures) || fixtureSet.fixtures.length !== 17) errors.push("portable fixture set needs seventeen adversarial cases");
    const seen = new Set();
    for (const fixture of fixtureSet.fixtures || []) {
      if (!hasText(fixture.id) || seen.has(fixture.id)) errors.push(`portable fixture has duplicate or missing id ${fixture.id || "unknown"}`);
      seen.add(fixture.id);
      const actualCodes = lintCandidate(fixture.candidate || {});
      for (const expectedCode of fixture.expectedBlockCodes || []) {
        if (!actualCodes.includes(expectedCode)) errors.push(`fixture ${fixture.id} did not trigger expected ${expectedCode}`);
      }
    }
  }
  if (learningExport) {
    errors.push(...validateContractInstance(workspaceRoot, "schemas/learning-export.schema.json", learningExport, "synthetic LearningExport"));
    const allowedKeys = new Set(["schemaVersion", "tenantAlias", "workflowVersion", "experimentWindow", "cohortSizeBucket", "metricDefinitionVersion", "dataClassification", "isSynthetic", "qaOutcomes", "funnelMetrics", "costBuckets", "privacyExportVerdict", "sourceReceiptHash"]);
    for (const key of Object.keys(learningExport)) if (!allowedKeys.has(key)) errors.push(`portable learning export uses disallowed field ${key}`);
    if (!/^tenant-[a-f0-9]{8}$/.test(learningExport.tenantAlias || "")) errors.push("portable learning export requires an opaque non-brand alias");
    if (["0", "1-9", "10-19"].includes(learningExport.cohortSizeBucket)) errors.push("portable learning export is below the minimum cohort bucket");
    if (learningExport.dataClassification !== "aggregate_deidentified" || learningExport.privacyExportVerdict !== "pass") {
      errors.push("portable learning export must be aggregate, de-identified and privacy-reviewed");
    }
    const qaKeys = ["accepted", "revised", "blocked"];
    if (Object.keys(learningExport.qaOutcomes || {}).some((key) => !qaKeys.includes(key)) || qaKeys.some((key) => !Number.isInteger(learningExport.qaOutcomes?.[key]) || learningExport.qaOutcomes[key] < 0)) {
      errors.push("portable learning export QA outcomes must be fixed aggregate counts");
    }
    const funnelKeys = ["valuableActivationRateBucket", "repeatValueDays7dBucket", "optOutRateBucket"];
    const costKeys = ["creative", "ai", "media", "human"];
    if (Object.keys(learningExport.funnelMetrics || {}).some((key) => !funnelKeys.includes(key))) errors.push("portable learning export has a disallowed funnel metric");
    if (Object.keys(learningExport.costBuckets || {}).some((key) => !costKeys.includes(key))) errors.push("portable learning export has a disallowed cost bucket");
    const hashPattern = learningExport.isSynthetic === true ? /^synthetic:[a-z0-9-]+$/ : /^sha256:[a-f0-9]{64}$/;
    if (!hashPattern.test(learningExport.sourceReceiptHash || "")) errors.push("portable learning export must use an opaque receipt hash");
    if (containsSensitiveData(JSON.stringify(learningExport)) || containsSensitiveInference(JSON.stringify(learningExport)) || /(email|phone|birth|chart|journal|chat|face|utm|prompt|trace)/i.test(JSON.stringify(learningExport))) {
      errors.push("portable learning export contains sensitive data or a sensitive field");
    }
  }
};

export const validateGrowthFramework = (workspaceRoot = process.cwd()) => {
  const errors = [];
  validateContracts(workspaceRoot, errors);
  validateCore(workspaceRoot, errors);
  validateTemplate(workspaceRoot, errors);
  validateRepositoryStarter(workspaceRoot, errors);
  validateFixtures(workspaceRoot, errors);
  return {
    errors,
    summary: {
      frameworkIntegrity: errors.length === 0 ? "pass" : "fail",
      externalExecution: "not_included_in_portable_framework",
      secondBusiness: "synthetic_template_only"
    }
  };
};
