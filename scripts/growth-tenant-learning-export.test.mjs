import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compareTenantLearningExports } from "./compare-growth-tenant-learning-exports.mjs";
import { createSyntheticAggregateLearningExport } from "./growth-tenant-learning-demo.mjs";
import { materializeSyntheticReadyTenant } from "./growth-tenant-demo.mjs";
import { initializeGrowthTenant } from "./init-growth-tenant.mjs";
import { validateTenantLearningExport } from "./validate-growth-tenant-learning-export.mjs";

const workspaceRoot = process.cwd();

const writeJson = (target, value) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const readJson = (target) => JSON.parse(fs.readFileSync(target, "utf8"));

const makeNonSynthetic = (value, receiptCharacter) => ({
  ...value,
  isSynthetic: false,
  sourceReceiptHash: `sha256:${receiptCharacter.repeat(64)}`
});

const withReadyTenants = (callback) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "growth-learning-export-test-"));
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
    writeJson(exportAPath, makeNonSynthetic(createSyntheticAggregateLearningExport({
      tenantAlias: "tenant-a1b2c3d4",
      receiptSuffix: "test-tenant-a",
      workflowVersion,
      metricDefinitionVersion: metrics.metricDefinitionVersion
    }), "a"));
    writeJson(exportBPath, makeNonSynthetic(createSyntheticAggregateLearningExport({
      tenantAlias: "tenant-0d1e2f3a",
      receiptSuffix: "test-tenant-b",
      workflowVersion,
      metricDefinitionVersion: metrics.metricDefinitionVersion
    }), "b"));
    callback({ tenantA, tenantB, exportAPath, exportBPath });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

test("a ready tenant can validate its de-identified aggregate LearningExport without execution authority", () => {
  withReadyTenants(({ tenantA, exportAPath }) => {
    const result = validateTenantLearningExport({ tenantRoot: tenantA, exportPath: exportAPath, workspaceRoot });
    assert.deepEqual(result.errors, []);
    assert.equal(result.summary.state, "validated_aggregate_learning_export");
    assert.equal(result.summary.externalExecution, "forbidden");
    assert.equal(result.learningExport.tenantAlias, "tenant-a1b2c3d4");
  });
});

test("synthetic LearningExports require an explicit local-conformance opt-in", () => {
  withReadyTenants(({ tenantA, exportAPath }) => {
    const value = readJson(exportAPath);
    value.isSynthetic = true;
    value.sourceReceiptHash = "synthetic:local-conformance";
    writeJson(exportAPath, value);
    const blocked = validateTenantLearningExport({ tenantRoot: tenantA, exportPath: exportAPath, workspaceRoot });
    assert.ok(blocked.errors.some((error) => /synthetic/i.test(error)));
    const allowed = validateTenantLearningExport({ tenantRoot: tenantA, exportPath: exportAPath, workspaceRoot, allowSynthetic: true });
    assert.deepEqual(allowed.errors, []);
  });
});

test("LearningExport validation blocks direct identifiers, tenant-brand leakage, and an enabled execution boundary", () => {
  withReadyTenants(({ tenantA, exportAPath }) => {
    const directIdentifier = ["sample-person", "example.test"].join("@");
    const withIdentifier = readJson(exportAPath);
    withIdentifier.experimentWindow = directIdentifier;
    writeJson(exportAPath, withIdentifier);
    const identifierResult = validateTenantLearningExport({ tenantRoot: tenantA, exportPath: exportAPath, workspaceRoot });
    assert.ok(identifierResult.errors.some((error) => /personal-data/i.test(error)));

    const withBrandLeak = readJson(exportAPath);
    withBrandLeak.experimentWindow = `${readJson(path.join(tenantA, "tenant-config.json")).identityBoundary.ownBrandTokens[0]}-window`;
    writeJson(exportAPath, withBrandLeak);
    const brandLeakResult = validateTenantLearningExport({ tenantRoot: tenantA, exportPath: exportAPath, workspaceRoot });
    assert.ok(brandLeakResult.errors.some((error) => /tenant identifier or declared tenant-brand token/i.test(error)));

    const restored = makeNonSynthetic(createSyntheticAggregateLearningExport({
      tenantAlias: "tenant-a1b2c3d4",
      receiptSuffix: "test-tenant-a-restored",
      workflowVersion: `${readJson(path.join(workspaceRoot, "packages/growth-core/config/growth-workflows-b0-b1.json")).workflowCatalogId.replaceAll("_", "-")}-v1`,
      metricDefinitionVersion: readJson(path.join(workspaceRoot, "packages/growth-core/config/metric-contract.json")).metricDefinitionVersion
    }), "c");
    writeJson(exportAPath, restored);
    const readinessPath = path.join(tenantA, "readiness.json");
    const readiness = readJson(readinessPath);
    readiness.externalAction = "enabled";
    writeJson(readinessPath, readiness);
    const executionResult = validateTenantLearningExport({ tenantRoot: tenantA, exportPath: exportAPath, workspaceRoot });
    assert.ok(executionResult.errors.some((error) => /external-action forbidden|external execution|externalAction/i.test(error)));
  });
});

test("two independent ready tenants compare only aligned opaque aggregate projections", () => {
  withReadyTenants(({ tenantA, tenantB, exportAPath, exportBPath }) => {
    const result = compareTenantLearningExports({
      tenantARoot: tenantA,
      tenantAExportPath: exportAPath,
      tenantBRoot: tenantB,
      tenantBExportPath: exportBPath,
      workspaceRoot
    });
    assert.deepEqual(result.errors, []);
    assert.equal(result.comparison.comparisonScope, "aggregate_deidentified_only");
    assert.equal(result.comparison.mode, "draft_only");
    assert.equal(result.comparison.externalExecution, "forbidden");
    assert.deepEqual(result.comparison.tenantLearning.map((item) => item.tenantAlias), ["tenant-a1b2c3d4", "tenant-0d1e2f3a"]);
    assert.equal(Object.hasOwn(result.comparison, "tenantId"), false);
    assert.equal(JSON.stringify(result.comparison).includes("example-ai"), false);
  });
});

test("comparison rejects duplicate aliases and version drift before a shared learning decision", () => {
  withReadyTenants(({ tenantA, tenantB, exportAPath, exportBPath }) => {
    const duplicateAlias = readJson(exportBPath);
    duplicateAlias.tenantAlias = "tenant-a1b2c3d4";
    writeJson(exportBPath, duplicateAlias);
    const duplicateResult = compareTenantLearningExports({
      tenantARoot: tenantA,
      tenantAExportPath: exportAPath,
      tenantBRoot: tenantB,
      tenantBExportPath: exportBPath,
      workspaceRoot
    });
    assert.ok(duplicateResult.errors.some((error) => /distinct opaque alias/i.test(error)));

    const versionDrift = readJson(exportBPath);
    versionDrift.tenantAlias = "tenant-0d1e2f3a";
    versionDrift.metricDefinitionVersion = "unreviewed-metric-contract";
    writeJson(exportBPath, versionDrift);
    const driftResult = compareTenantLearningExports({
      tenantARoot: tenantA,
      tenantAExportPath: exportAPath,
      tenantBRoot: tenantB,
      tenantBExportPath: exportBPath,
      workspaceRoot
    });
    assert.ok(driftResult.errors.some((error) => /metricDefinitionVersion/i.test(error)));
  });
});
