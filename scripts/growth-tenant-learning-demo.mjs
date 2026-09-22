import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareTenantLearningExports } from "./compare-growth-tenant-learning-exports.mjs";
import { materializeSyntheticReadyTenant } from "./growth-tenant-demo.mjs";
import { initializeGrowthTenant } from "./init-growth-tenant.mjs";

const modulePath = fileURLToPath(import.meta.url);

const writeJson = (target, value) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const readJson = (target) => JSON.parse(fs.readFileSync(target, "utf8"));

/** Creates a contract-valid synthetic record only for local conformance tests. */
export const createSyntheticAggregateLearningExport = ({ tenantAlias, receiptSuffix, workflowVersion, metricDefinitionVersion }) => ({
  schemaVersion: "1.0.0",
  tenantAlias,
  workflowVersion,
  experimentWindow: "2026-W39",
  cohortSizeBucket: "20-49",
  metricDefinitionVersion,
  dataClassification: "aggregate_deidentified",
  isSynthetic: true,
  qaOutcomes: { accepted: 4, revised: 1, blocked: 0 },
  funnelMetrics: {
    valuableActivationRateBucket: "10_19_percent",
    repeatValueDays7dBucket: "5_9_percent",
    optOutRateBucket: "0_4_percent"
  },
  costBuckets: {
    creative: "under_50",
    ai: "under_50",
    media: "not_collected",
    human: "50_199"
  },
  privacyExportVerdict: "pass",
  sourceReceiptHash: `synthetic:${receiptSuffix}`
});

/**
 * Proves that two independently initialized W0 tenants can compare only their
 * synthetic aggregate LearningExports. It creates no real data and makes no
 * external connection, publication, campaign, or product change.
 */
export const validateTwoTenantLearningDemo = ({ workspaceRoot = process.cwd() } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "growth-learning-demo-"));
  const tenantA = path.join(root, "tenant-a");
  const tenantB = path.join(root, "tenant-b");
  try {
    initializeGrowthTenant({ workspaceRoot, tenantId: "example-ai", outputRoot: tenantA });
    initializeGrowthTenant({ workspaceRoot, tenantId: "second-ai", outputRoot: tenantB });
    materializeSyntheticReadyTenant({ tenantRoot: tenantA, tenantId: "example-ai" });
    materializeSyntheticReadyTenant({ tenantRoot: tenantB, tenantId: "second-ai" });
    const workflows = readJson(path.join(workspaceRoot, "packages/growth-core/config/growth-workflows-b0-b1.json"));
    const metrics = readJson(path.join(workspaceRoot, "packages/growth-core/config/metric-contract.json"));
    const workflowVersion = `${workflows.workflowCatalogId.replaceAll("_", "-")}-v1`;
    const exportAPath = path.join(tenantA, "learning", "exports", "aggregate-learning.json");
    const exportBPath = path.join(tenantB, "learning", "exports", "aggregate-learning.json");
    writeJson(exportAPath, createSyntheticAggregateLearningExport({
      tenantAlias: "tenant-a1b2c3d4",
      receiptSuffix: "demo-tenant-a",
      workflowVersion,
      metricDefinitionVersion: metrics.metricDefinitionVersion
    }));
    writeJson(exportBPath, createSyntheticAggregateLearningExport({
      tenantAlias: "tenant-0d1e2f3a",
      receiptSuffix: "demo-tenant-b",
      workflowVersion,
      metricDefinitionVersion: metrics.metricDefinitionVersion
    }));
    const result = compareTenantLearningExports({
      tenantARoot: tenantA,
      tenantAExportPath: exportAPath,
      tenantBRoot: tenantB,
      tenantBExportPath: exportBPath,
      workspaceRoot,
      allowSynthetic: true
    });
    if (result.errors.length > 0) throw new Error(result.errors.join("\n"));
    return result;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

const runAsCli = () => {
  try {
    const result = validateTwoTenantLearningDemo();
    console.log(`Two synthetic tenant LearningExports passed aggregate-only comparison: ${result.summary.tenantAliases.join(", ")}. External execution remains forbidden.`);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
};

if (path.resolve(process.argv[1] || "") === path.resolve(modulePath)) runAsCli();
