import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateTenantLearningExport } from "./validate-growth-tenant-learning-export.mjs";

const modulePath = fileURLToPath(import.meta.url);

const normalizeForComparison = (value) => process.platform === "win32" ? value.toLowerCase() : value;

const samePhysicalDirectory = (first, second) => {
  try {
    return normalizeForComparison(fs.realpathSync.native(path.resolve(first))) === normalizeForComparison(fs.realpathSync.native(path.resolve(second)));
  } catch {
    return path.resolve(first || "") === path.resolve(second || "");
  }
};

const aggregateProjection = (learningExport) => ({
  tenantAlias: learningExport.tenantAlias,
  experimentWindow: learningExport.experimentWindow,
  cohortSizeBucket: learningExport.cohortSizeBucket,
  qaOutcomes: { ...learningExport.qaOutcomes },
  funnelMetrics: { ...learningExport.funnelMetrics },
  costBuckets: { ...learningExport.costBuckets }
});

/**
 * Compares only two already-validated, tenant-owned aggregate LearningExports.
 * It never writes either tenant, exposes their identifiers or source receipts,
 * calls a remote system, or grants a channel or campaign any execution state.
 */
export const compareTenantLearningExports = ({
  tenantARoot,
  tenantAExportPath,
  tenantBRoot,
  tenantBExportPath,
  workspaceRoot = process.cwd(),
  allowSynthetic = false
} = {}) => {
  const errors = [];
  if (!tenantARoot || !tenantAExportPath || !tenantBRoot || !tenantBExportPath) {
    errors.push("LearningExport comparison requires both tenant roots and both export paths.");
    return { errors, comparison: null, summary: { state: "blocked", externalExecution: "forbidden" } };
  }
  if (samePhysicalDirectory(tenantARoot, tenantBRoot)) {
    errors.push("LearningExport comparison requires two independent tenant workspaces.");
  }

  const tenantA = validateTenantLearningExport({ tenantRoot: tenantARoot, exportPath: tenantAExportPath, workspaceRoot, allowSynthetic });
  const tenantB = validateTenantLearningExport({ tenantRoot: tenantBRoot, exportPath: tenantBExportPath, workspaceRoot, allowSynthetic });
  errors.push(...tenantA.errors.map((error) => `tenant A: ${error}`));
  errors.push(...tenantB.errors.map((error) => `tenant B: ${error}`));
  if (errors.length > 0 || !tenantA.learningExport || !tenantB.learningExport) {
    return { errors, comparison: null, summary: { state: "blocked", externalExecution: "forbidden" } };
  }

  const exportA = tenantA.learningExport;
  const exportB = tenantB.learningExport;
  if (exportA.tenantAlias === exportB.tenantAlias) {
    errors.push("LearningExport comparison requires a distinct opaque alias for each independent tenant.");
  }
  if (exportA.workflowVersion !== exportB.workflowVersion) {
    errors.push("LearningExport comparison requires aligned workflowVersion values.");
  }
  if (exportA.metricDefinitionVersion !== exportB.metricDefinitionVersion) {
    errors.push("LearningExport comparison requires aligned metricDefinitionVersion values.");
  }
  if (exportA.sourceReceiptHash === exportB.sourceReceiptHash) {
    errors.push("LearningExport comparison requires independent source receipt hashes.");
  }
  if (errors.length > 0) {
    return { errors, comparison: null, summary: { state: "blocked", externalExecution: "forbidden" } };
  }

  const comparison = {
    schemaVersion: "1.0.0",
    comparisonScope: "aggregate_deidentified_only",
    mode: "draft_only",
    externalExecution: "forbidden",
    frameworkChangeAuthority: "human_review_required",
    alignedVersions: {
      workflowVersion: exportA.workflowVersion,
      metricDefinitionVersion: exportA.metricDefinitionVersion
    },
    tenantLearning: [aggregateProjection(exportA), aggregateProjection(exportB)]
  };
  return {
    errors,
    comparison,
    summary: {
      state: "validated_aggregate_learning_comparison",
      tenantAliases: comparison.tenantLearning.map((item) => item.tenantAlias),
      externalExecution: "forbidden"
    }
  };
};

const valueFor = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
};

const runAsCli = () => {
  const result = compareTenantLearningExports({
    tenantARoot: valueFor("--tenant-a-root"),
    tenantAExportPath: valueFor("--tenant-a-export-path"),
    tenantBRoot: valueFor("--tenant-b-root"),
    tenantBExportPath: valueFor("--tenant-b-export-path"),
    allowSynthetic: process.argv.includes("--allow-synthetic")
  });
  for (const error of result.errors) console.error(`BLOCKED: ${error}`);
  if (result.errors.length === 0) {
    console.log(JSON.stringify(result.comparison, null, 2));
    console.log("The comparison is aggregate-only, draft-only, and has not sent, published, spent, or changed a product.");
  }
  process.exitCode = result.errors.length > 0 ? 1 : 0;
};

if (path.resolve(process.argv[1] || "") === path.resolve(modulePath)) runAsCli();
