import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateGrowthTenant } from "./validate-growth-tenant.mjs";

const modulePath = fileURLToPath(import.meta.url);

const jobDefinitions = Object.freeze({
  W0_readiness: {
    inputArtifactReferences: ["tenant-config.json", "brand-pack.json", "business-pack.json", "product-truth.json", "role-mapping.json", "risk-register.json", "privacy/consent-data-map.json", "channels/capability-matrix.json", "journey/journey-map.json", "measurement/event-ownership-map.json"],
    outputArtifactType: "tenant_readiness_record",
    requestedCapability: "product_truth_validation",
    assignedAgentRole: "product_truth_claim_guard",
    subagentTemplateIds: ["evidence_reference_checker", "identity_boundary_checker", "capability_matrix_checker"],
    taskDescription: "Verify the tenant boundary, ProductTruth evidence, data rules, channel capabilities, journey map, and measurement ownership before any internal marketing draft is created.",
    managerReview: {
      decisionRequired: "owner_accepts_product_truth",
      checklist: ["Tenant identity and owner are correct", "Claims have current evidence", "Restricted data and channel boundaries are explicit", "Readiness blockers and next decisions are visible"]
    }
  },
  W1_research_to_plan: {
    inputArtifactReferences: ["readiness.json", "research/source-register.json", "research/interview-kit.json", "journey/journey-map.json", "product-truth.json", "measurement/event-ownership-map.json"],
    outputArtifactType: "versioned_brief",
    requestedCapability: "content_research",
    assignedAgentRole: "research_jtbd",
    subagentTemplateIds: ["source_register_reviewer", "jtbd_synthesizer", "research_risk_checker"],
    taskDescription: "Turn approved sources and sanitized research into testable audience-job hypotheses, positioning, an internal experiment brief, and an owned measurement plan.",
    managerReview: {
      decisionRequired: "owner_accepts_research_scope",
      checklist: ["Sources and usage rights are acceptable", "Audience needs are hypotheses rather than sensitive inferences", "Claims are bounded by current ProductTruth", "Success metric, denominator, and guardrails are defined"]
    }
  },
  W2_content_factory: {
    inputArtifactReferences: ["product-truth.json", "brand-pack.json", "campaigns/experiment-brief.json", "briefs/index.json", "content-drafts/index.json"],
    outputArtifactType: "concept_copy_package",
    requestedCapability: "content_authoring",
    assignedAgentRole: "content_studio",
    subagentTemplateIds: ["brief_expander", "locale_editor", "visual_accessibility_brief_checker"],
    taskDescription: "Create an internal concept, copy, and visual-direction package from the approved brief, using only allowed claims, locales, and owned or licensed asset references.",
    managerReview: {
      decisionRequired: "editor_or_owner_decision",
      checklist: ["The concept answers the approved audience job", "Copy matches the BrandPack and allowed claims", "Required locales, rights, and accessibility are complete", "Deterministic lint and independent QA are attached"]
    }
  },
  W6_learning_to_product: {
    inputArtifactReferences: ["learning/learning-note.json", "measurement/event-ownership-map.json", "journey/journey-map.json", "approvals/index.json"],
    outputArtifactType: "aggregate_learning_note",
    requestedCapability: "measurement_analysis",
    assignedAgentRole: "journey_measurement",
    subagentTemplateIds: ["metric_denominator_checker", "aggregate_privacy_checker", "learning_hypothesis_synthesizer"],
    taskDescription: "Validate an aggregate LearningExport, explain quality and journey signals, update the learning hypothesis, and draft a product or content ticket for owner triage.",
    managerReview: {
      decisionRequired: "product_owner_triage",
      checklist: ["Only approved aggregate inputs are used", "Metric definitions and denominators are stable", "Uncertainty and alternative explanations are recorded", "The proposed action remains a draft for owner triage"]
    }
  }
});

const allowedAdapterModes = new Set(["disabled", "mock", "owner_configured", "coding_agent_handoff"]);
const jobIdPattern = /^[a-z][a-z0-9-]{2,79}$/;

const handoffForAdapter = (adapterMode, jobId) => {
  const base = {
    adapterMode,
    transport: "runtime_adapter_contract",
    requiresUserInitiation: false,
    credentialPolicy: "framework_accepts_no_provider_credentials",
    headlessAuthentication: "not_implemented_or_promised",
    nextAction: "Use the selected adapter under its separately reviewed runtime contract."
  };
  if (adapterMode === "coding_agent_handoff") {
    return {
      ...base,
      transport: "tenant_scoped_json_work_order",
      requiresUserInitiation: true,
      nextAction: `Open a user-authorized Coding Agent session in the correct private tenant workspace and ask it to claim job ${jobId}. The framework does not log in or operate the subscription headlessly.`
    };
  }
  if (adapterMode === "disabled") {
    return {
      ...base,
      transport: "none",
      nextAction: "No runner is enabled. Keep this work order as an internal draft manifest."
    };
  }
  if (adapterMode === "mock") {
    return {
      ...base,
      nextAction: "Use synthetic data only to test the work-order contract."
    };
  }
  return {
    ...base,
    requiresUserInitiation: true,
    nextAction: "Use a separately configured owner runtime. Do not place credentials in this work order or repository."
  };
};

const valueFor = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
};

const assertInside = (candidate, parent, label = "Job output") => {
  if (path.parse(candidate).root.toLowerCase() !== path.parse(parent).root.toLowerCase()) {
    throw new Error(`${label} must remain on the tenant workspace volume.`);
  }
  const relative = path.relative(parent, candidate);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`${label} must be inside the tenant workspace and cannot replace its root.`);
  }
};

const isSameOrInside = (candidate, parent) => {
  if (path.parse(candidate).root.toLowerCase() !== path.parse(parent).root.toLowerCase()) return false;
  const relative = path.relative(parent, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

const lstatIfPresent = (target) => {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

const realpath = (target) => fs.realpathSync.native(target);

/**
 * Resolves every existing output-directory component before the job file is
 * created. A lexical `tenant/jobs/file.json` check alone is insufficient: a
 * pre-existing link or junction in `jobs` could redirect the write outside the
 * private tenant workspace. We reject links and any physical path that escapes
 * the real tenant root, then open the final file with exclusive creation.
 */
const prepareSafeOutputPath = ({ tenantRoot, outputPath }) => {
  const rootEntry = lstatIfPresent(tenantRoot);
  if (!rootEntry?.isDirectory() || rootEntry.isSymbolicLink()) {
    throw new Error("Tenant workspace must be a real directory and may not be a symbolic link.");
  }
  const physicalTenantRoot = realpath(tenantRoot);
  assertInside(outputPath, tenantRoot);

  const relativeOutput = path.relative(tenantRoot, outputPath);
  const components = relativeOutput.split(path.sep).filter(Boolean);
  const fileName = components.pop();
  if (!fileName) throw new Error("Job output must name a file inside the tenant workspace.");

  let lexicalDirectory = tenantRoot;
  for (const component of components) {
    lexicalDirectory = path.join(lexicalDirectory, component);
    const existing = lstatIfPresent(lexicalDirectory);
    if (existing) {
      if (existing.isSymbolicLink()) {
        throw new Error(`Job output path contains a symbolic link: ${lexicalDirectory}`);
      }
      if (!existing.isDirectory()) {
        throw new Error(`Job output parent must be a directory: ${lexicalDirectory}`);
      }
    } else {
      fs.mkdirSync(lexicalDirectory);
    }

    const verified = fs.lstatSync(lexicalDirectory);
    if (verified.isSymbolicLink() || !verified.isDirectory()) {
      throw new Error(`Job output path is not a safe directory: ${lexicalDirectory}`);
    }
    const physicalDirectory = realpath(lexicalDirectory);
    try {
      assertInside(physicalDirectory, physicalTenantRoot, "Job output physical path");
    } catch (error) {
      throw new Error(`Job output path escapes the tenant workspace through a link or junction: ${lexicalDirectory}`);
    }
  }

  const physicalParent = realpath(lexicalDirectory);
  if (!isSameOrInside(physicalParent, physicalTenantRoot)) {
    throw new Error("Job output parent escapes the tenant workspace through a link or junction.");
  }
  const physicalOutput = path.join(physicalParent, fileName);
  if (lstatIfPresent(outputPath) || lstatIfPresent(physicalOutput)) {
    throw new Error(`Job output already exists: ${outputPath}`);
  }
  return physicalOutput;
};

const allowedContentChannels = new Set(["facebook", "instagram", "linkedin", "blog"]);

const normalizeW2Assignments = ({ workflowId, definition, targetChannels, subagentTemplateIds }) => {
  if (targetChannels !== undefined && workflowId !== "W2_content_factory") {
    throw new Error("Target channels are supported only for W2 content work orders.");
  }
  let channels;
  if (targetChannels !== undefined) {
    if (!Array.isArray(targetChannels) || targetChannels.length < 1 || targetChannels.length > allowedContentChannels.size
      || targetChannels.some((channel) => typeof channel !== "string" || !allowedContentChannels.has(channel))
      || new Set(targetChannels).size !== targetChannels.length) {
      throw new Error("Target channels must be a non-empty, unique list of supported channel ids.");
    }
    channels = [...targetChannels];
  }
  if (subagentTemplateIds !== undefined && workflowId !== "W2_content_factory") {
    throw new Error("Sub-agent overrides are supported only for W2 content work orders.");
  }
  let subagents = definition.subagentTemplateIds;
  if (subagentTemplateIds !== undefined) {
    if (!Array.isArray(subagentTemplateIds)
      || new Set(subagentTemplateIds).size !== subagentTemplateIds.length
      || subagentTemplateIds.some((id) => typeof id !== "string" || !definition.subagentTemplateIds.includes(id))) {
      throw new Error("W2 sub-agents must be unique ids from the approved content-team roster.");
    }
    subagents = [...subagentTemplateIds];
  }
  return { channels, subagents };
};

export const prepareGrowthJob = ({ tenantRoot, workflowId, outputPath, jobId, adapterMode = "disabled", targetChannels, subagentTemplateIds }) => {
  if (!jobDefinitions[workflowId]) throw new Error(`Unsupported internal workflow: ${workflowId || "unknown"}.`);
  if (!jobIdPattern.test(jobId || "")) throw new Error("Job id must use lowercase letters, digits, and hyphens, and be 3–80 characters long.");
  if (!allowedAdapterModes.has(adapterMode)) throw new Error("Adapter mode must be disabled, mock, owner_configured, or coding_agent_handoff.");

  const resolvedTenantRoot = path.resolve(tenantRoot || "");
  const resolvedOutput = path.resolve(outputPath || "");

  const tenantValidation = validateGrowthTenant(resolvedTenantRoot);
  if (tenantValidation.errors.length > 0 || tenantValidation.summary.readyForInternalDrafts !== true) {
    throw new Error(`Tenant is not ready for an internal job:\n${tenantValidation.errors.map((error) => `- ${error}`).join("\n")}`);
  }
  const tenantConfig = JSON.parse(fs.readFileSync(path.join(resolvedTenantRoot, "tenant-config.json"), "utf8"));
  const definition = jobDefinitions[workflowId];
  const assignments = normalizeW2Assignments({ workflowId, definition, targetChannels, subagentTemplateIds });
  const channelInstruction = assignments.channels?.length
    ? ` Produce a separate, channel-specific content package for each assigned target channel (${assignments.channels.join(", ")}); tag every copy and media item with its channelId and never reuse an untagged generic variant across channels.`
    : " If target channels are not present, stop and ask the owner to create a new work order with explicit channels before drafting channel-specific content.";
  const job = {
    schemaVersion: "1.0.0",
    workOrderVersion: "1.0.0",
    jobId,
    tenantId: tenantConfig.tenantId,
    workflowId,
    mode: "draft_only",
    adapterMode,
    lifecycleState: "prepared",
    requestedCapability: definition.requestedCapability,
    assignedAgentRole: definition.assignedAgentRole,
    subagentTemplateIds: assignments.subagents,
    taskDescription: `${definition.taskDescription}${channelInstruction}`,
    managerReview: definition.managerReview,
    inputArtifactReferences: definition.inputArtifactReferences,
    outputArtifactType: definition.outputArtifactType,
    allowedDataClasses: ["tenant_sanitized_configuration", "approved_public_research", "licensed_or_owned_asset_reference", "aggregate_deidentified_learning_export"],
    promptVersion: adapterMode === "coding_agent_handoff" ? "repository_instructions_and_skill_contract_1" : "owner_configured_required",
    qualityGateVersion: "growth_core_1",
    idempotencyKey: `${tenantConfig.tenantId}:${workflowId}:${jobId}`,
    handoff: handoffForAdapter(adapterMode, jobId),
    requiredNextSteps: adapterMode === "coding_agent_handoff"
      ? ["make_work_order_available_for_handoff", "user_initiates_coding_agent_session", "coding_agent_claims_job", "redact_and_store_internal_draft", "run_deterministic_lint", "run_independent_qa", "await_human_decision"]
      : ["redact_and_store_internal_draft", "run_deterministic_lint", "run_independent_qa", "await_human_decision"],
    hardStop: "This manifest prepares an internal job only. It cannot invoke a provider, access a credential, publish, send, schedule, create a campaign, upload an audience, spend money, or change a product."
  };
  if (assignments.channels) job.targetChannels = assignments.channels;
  const safeOutputPath = prepareSafeOutputPath({ tenantRoot: resolvedTenantRoot, outputPath: resolvedOutput });
  const fileDescriptor = fs.openSync(safeOutputPath, "wx", 0o600);
  try {
    fs.writeFileSync(fileDescriptor, `${JSON.stringify(job, null, 2)}\n`, "utf8");
  } finally {
    fs.closeSync(fileDescriptor);
  }
  return job;
};

const runAsCli = () => {
  const tenantRoot = valueFor("--tenant-root");
  const workflowId = valueFor("--workflow");
  const outputPath = valueFor("--output");
  const jobId = valueFor("--job-id");
  const adapterMode = valueFor("--adapter-mode") || "disabled";
  if (!tenantRoot || !workflowId || !outputPath || !jobId) {
    console.error("Use --tenant-root <private-tenant-directory> --workflow <W0_readiness|W1_research_to_plan|W2_content_factory|W6_learning_to_product> --job-id <safe-id> --output <tenant-internal-json> [--adapter-mode disabled|mock|owner_configured|coding_agent_handoff].");
    process.exit(1);
  }
  try {
    const job = prepareGrowthJob({ tenantRoot, workflowId, outputPath, jobId, adapterMode });
    console.log(`Prepared ${job.workflowId} job ${job.jobId} for tenant ${job.tenantId}. It remains draft-only and has not invoked any external system.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
};

if (path.resolve(process.argv[1] || "") === path.resolve(modulePath)) runAsCli();
