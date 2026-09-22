import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  containsSensitiveData,
  containsSensitiveInference,
  containsSensitiveTargeting,
  validateContractInstance
} from "./growth-framework-validator.mjs";
import { validateGrowthTenant } from "./validate-growth-tenant.mjs";

const modulePath = fileURLToPath(import.meta.url);
const learningExportRelativeDirectory = path.join("learning", "exports");
const tenantAliasPattern = /^tenant-[a-f0-9]{8}$/;
const sha256ReceiptPattern = /^sha256:[a-f0-9]{64}$/;
const experimentWindowPattern = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/;
const credentialPattern = /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\s*[:=]/i;

const normalizeForComparison = (value) => process.platform === "win32" ? value.toLowerCase() : value;

const isStrictDescendant = (candidate, parent) => {
  if (path.parse(candidate).root.toLowerCase() !== path.parse(parent).root.toLowerCase()) return false;
  const relative = path.relative(parent, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

const lstatIfPresent = (target) => {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

const readJson = (target, errors, label) => {
  try {
    return JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (error) {
    errors.push(`${label}: cannot read valid JSON (${error.message})`);
    return null;
  }
};

const readTenantJson = (tenantRoot, relativePath, errors) => readJson(path.join(tenantRoot, relativePath), errors, relativePath);

const validateSafeLearningExportPath = ({ tenantRoot, exportPath, errors }) => {
  const resolvedTenantRoot = path.resolve(tenantRoot || "");
  const resolvedExportPath = path.resolve(exportPath || "");
  const rootEntry = lstatIfPresent(resolvedTenantRoot);
  if (!rootEntry?.isDirectory() || rootEntry.isSymbolicLink()) {
    errors.push("Tenant workspace must be a real directory and may not be a symbolic link.");
    return null;
  }
  if (!isStrictDescendant(resolvedExportPath, resolvedTenantRoot)) {
    errors.push("LearningExport must be stored inside its private tenant workspace.");
    return null;
  }
  const relativeExportPath = path.relative(resolvedTenantRoot, resolvedExportPath);
  if (relativeExportPath !== learningExportRelativeDirectory && !relativeExportPath.startsWith(`${learningExportRelativeDirectory}${path.sep}`)) {
    errors.push(`LearningExport must be stored below ${learningExportRelativeDirectory}${path.sep}.`);
    return null;
  }

  const physicalTenantRoot = fs.realpathSync.native(resolvedTenantRoot);
  const relativeComponents = relativeExportPath.split(path.sep).filter(Boolean);
  let current = resolvedTenantRoot;
  for (const [index, component] of relativeComponents.entries()) {
    const isFinalComponent = index === relativeComponents.length - 1;
    current = path.join(current, component);
    const entry = lstatIfPresent(current);
    if (!entry) {
      errors.push(`LearningExport path is missing: ${current}`);
      return null;
    }
    if (entry.isSymbolicLink()) {
      errors.push(`LearningExport path may not contain a symbolic link: ${current}`);
      return null;
    }
    if (!isFinalComponent && !entry.isDirectory()) {
      errors.push(`LearningExport parent must be a directory: ${current}`);
      return null;
    }
    if (isFinalComponent && !entry.isFile()) {
      errors.push(`LearningExport must be a regular JSON file: ${current}`);
      return null;
    }
    const physicalCurrent = fs.realpathSync.native(current);
    if (!isStrictDescendant(physicalCurrent, physicalTenantRoot) && normalizeForComparison(physicalCurrent) !== normalizeForComparison(physicalTenantRoot)) {
      errors.push(`LearningExport path escapes the tenant workspace through a link or junction: ${current}`);
      return null;
    }
  }
  return { resolvedTenantRoot, resolvedExportPath, physicalTenantRoot };
};

const validateTenantBoundary = ({ tenantRoot, errors }) => {
  const readiness = readTenantJson(tenantRoot, "readiness.json", errors);
  const consent = readTenantJson(tenantRoot, "privacy/consent-data-map.json", errors);
  const measurement = readTenantJson(tenantRoot, "measurement/event-ownership-map.json", errors);
  const learning = readTenantJson(tenantRoot, "learning/learning-note.json", errors);
  const channels = readTenantJson(tenantRoot, "channels/capability-matrix.json", errors);
  if (!readiness || !consent || !measurement || !learning || !channels) return null;

  if (readiness.mode !== "draft_only" || readiness.externalAction !== "forbidden" || readiness.status !== "ready_for_internal_drafts") {
    errors.push("readiness.json must remain ready_for_internal_drafts, draft_only, and external-action forbidden before LearningExport validation.");
  }
  if (consent.crossTenantSharing !== "aggregate_deidentified_learning_export_only_after_privacy_review" || consent.externalAction !== "forbidden") {
    errors.push("privacy/consent-data-map.json must permit only privacy-reviewed aggregate de-identified LearningExport sharing and forbid external action.");
  }
  if (measurement.crossTenantSharing !== "aggregate_deidentified_learning_export_only" || measurement.externalAction !== "forbidden") {
    errors.push("measurement/event-ownership-map.json must permit only aggregate de-identified LearningExport sharing and forbid external action.");
  }
  if (!/aggregate_deidentified/i.test(learning.comparisonRule || "") || learning.externalAction !== "forbidden") {
    errors.push("learning/learning-note.json must retain the aggregate de-identified comparison rule and forbid external action.");
  }
  const unsafeChannel = (channels.channels || []).some((channel) => channel.status !== "disabled" || channel.externalAction !== "forbidden" || !Array.isArray(channel.allowedActions) || channel.allowedActions.some((action) => action !== "internal_draft_only"));
  if (channels.externalAction !== "forbidden" || unsafeChannel) {
    errors.push("channels/capability-matrix.json must keep every channel disabled, internal-draft-only, and external-action forbidden.");
  }
  return { readiness, consent, measurement, learning, channels };
};

const validateLearningPayload = ({ learningExport, tenantConfig, metricContract, workflowConfig, allowSynthetic, errors, workspaceRoot }) => {
  if (!learningExport || !tenantConfig || !metricContract || !workflowConfig) return;
  errors.push(...validateContractInstance(workspaceRoot, "schemas/learning-export.schema.json", learningExport, "tenant LearningExport"));

  if (learningExport.isSynthetic === true && !allowSynthetic) {
    errors.push("LearningExport is synthetic. A production tenant export must set isSynthetic to false; use --allow-synthetic only for the local conformance demo.");
  }
  if (learningExport.dataClassification !== "aggregate_deidentified" || learningExport.privacyExportVerdict !== "pass") {
    errors.push("LearningExport must be aggregate_deidentified and have a passing privacy-export verdict.");
  }
  if (!tenantAliasPattern.test(learningExport.tenantAlias || "")) {
    errors.push("LearningExport tenantAlias must be an opaque tenant-xxxxxxxx alias.");
  }
  if ((learningExport.tenantAlias || "").toLowerCase() === String(tenantConfig.tenantId || "").toLowerCase()) {
    errors.push("LearningExport tenantAlias may not reveal the tenant identifier.");
  }
  if (!experimentWindowPattern.test(learningExport.experimentWindow || "")) {
    errors.push("LearningExport experimentWindow must use an aggregate ISO-week bucket such as 2026-W39.");
  }
  const expectedWorkflowVersion = `${String(workflowConfig.workflowCatalogId || "").replaceAll("_", "-")}-v1`;
  if (!workflowConfig.workflowCatalogId || learningExport.workflowVersion !== expectedWorkflowVersion) {
    errors.push(`LearningExport workflowVersion must match the portable workflow version ${expectedWorkflowVersion || "declared by growth-workflows-b0-b1.json"}.`);
  }
  if (learningExport.metricDefinitionVersion !== metricContract.metricDefinitionVersion) {
    errors.push("LearningExport metricDefinitionVersion must match the portable metric contract.");
  }
  if (learningExport.isSynthetic === false && !sha256ReceiptPattern.test(learningExport.sourceReceiptHash || "")) {
    errors.push("A non-synthetic LearningExport requires an opaque sha256 receipt hash.");
  }
  const qaOutcomeKeys = ["accepted", "revised", "blocked"];
  if (qaOutcomeKeys.some((key) => !Number.isInteger(learningExport.qaOutcomes?.[key]) || learningExport.qaOutcomes[key] < 0)) {
    errors.push("LearningExport QA outcomes must be non-negative aggregate integers.");
  }

  const serialized = JSON.stringify(learningExport);
  const forbiddenIdentityTokens = [tenantConfig.tenantId, ...(tenantConfig.identityBoundary?.ownBrandTokens || []), ...(tenantConfig.identityBoundary?.knownForeignBrandTokens || [])]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.toLowerCase());
  if (forbiddenIdentityTokens.some((token) => serialized.toLowerCase().includes(token))) {
    errors.push("LearningExport contains a tenant identifier or declared tenant-brand token.");
  }
  if (containsSensitiveData(serialized) || containsSensitiveInference(serialized) || containsSensitiveTargeting(serialized) || credentialPattern.test(serialized)) {
    errors.push("LearningExport contains a personal-data, sensitive-inference, targeting, or credential-like pattern.");
  }
};

/**
 * Validates one tenant-owned LearningExport without copying, changing, sending,
 * or publishing it. A successful result is still an aggregate-only internal
 * comparison input; it grants no execution authority.
 */
export const validateTenantLearningExport = ({ tenantRoot, exportPath, workspaceRoot = process.cwd(), allowSynthetic = false } = {}) => {
  const errors = [];
  if (!tenantRoot || !exportPath) {
    errors.push("LearningExport validation requires tenantRoot and exportPath.");
    return { errors, summary: { state: "blocked", externalExecution: "forbidden" } };
  }
  const safePath = validateSafeLearningExportPath({ tenantRoot, exportPath, errors });
  if (!safePath) return { errors, summary: { state: "blocked", externalExecution: "forbidden" } };

  const tenantValidation = validateGrowthTenant(safePath.resolvedTenantRoot);
  if (tenantValidation.errors.length > 0 || tenantValidation.summary.readyForInternalDrafts !== true) {
    errors.push("Tenant must pass W0 as ready_for_internal_drafts before it may validate a LearningExport.");
    errors.push(...tenantValidation.errors.map((error) => `tenant W0: ${error}`));
  }
  const tenantConfig = readTenantJson(safePath.resolvedTenantRoot, "tenant-config.json", errors);
  const metricContract = readJson(path.join(workspaceRoot, "packages/growth-core/config/metric-contract.json"), errors, "metric-contract.json");
  const workflowConfig = readJson(path.join(workspaceRoot, "packages/growth-core/config/growth-workflows-b0-b1.json"), errors, "growth-workflows-b0-b1.json");
  validateTenantBoundary({ tenantRoot: safePath.resolvedTenantRoot, errors });
  const learningExport = readJson(safePath.resolvedExportPath, errors, "tenant LearningExport");
  validateLearningPayload({ learningExport, tenantConfig, metricContract, workflowConfig, allowSynthetic, errors, workspaceRoot });

  return {
    errors,
    learningExport: errors.length === 0 ? learningExport : null,
    summary: {
      state: errors.length === 0 ? "validated_aggregate_learning_export" : "blocked",
      tenantAlias: errors.length === 0 ? learningExport.tenantAlias : null,
      workflowVersion: errors.length === 0 ? learningExport.workflowVersion : null,
      metricDefinitionVersion: errors.length === 0 ? learningExport.metricDefinitionVersion : null,
      externalExecution: "forbidden"
    }
  };
};

const valueFor = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
};

const runAsCli = () => {
  const tenantRoot = valueFor("--tenant-root");
  const exportPath = valueFor("--export-path");
  if (!tenantRoot || !exportPath) {
    console.error("Use --tenant-root <private-tenant-directory> --export-path <private-tenant-directory>/learning/exports/<aggregate-learning-export>.json [--allow-synthetic].");
    process.exitCode = 1;
    return;
  }
  const result = validateTenantLearningExport({ tenantRoot, exportPath, allowSynthetic: process.argv.includes("--allow-synthetic") });
  for (const error of result.errors) console.error(`BLOCKED: ${error}`);
  if (result.errors.length === 0) {
    console.log(`LearningExport ${result.summary.tenantAlias} passed aggregate-only validation. It remains draft-only and has not been sent or executed.`);
  }
  process.exitCode = result.errors.length > 0 ? 1 : 0;
};

if (path.resolve(process.argv[1] || "") === path.resolve(modulePath)) runAsCli();
