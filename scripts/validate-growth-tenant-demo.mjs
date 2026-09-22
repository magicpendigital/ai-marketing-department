import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { materializeSyntheticReadyTenant } from "./growth-tenant-demo.mjs";
import { initializeGrowthTenant } from "./init-growth-tenant.mjs";
import { validateGrowthTenant } from "./validate-growth-tenant.mjs";

const modulePath = fileURLToPath(import.meta.url);

export const validateSyntheticReadyTenantDemo = ({ workspaceRoot = process.cwd(), tenantId = "example-ai" } = {}) => {
  const tenantRoot = fs.mkdtempSync(path.join(os.tmpdir(), "growth-tenant-ready-demo-"));
  try {
    initializeGrowthTenant({ workspaceRoot, tenantId, outputRoot: tenantRoot });
    materializeSyntheticReadyTenant({ tenantRoot, tenantId });
    const result = validateGrowthTenant(tenantRoot);
    if (result.errors.length > 0 || result.warnings.length > 0 || result.summary.state !== "ready_for_internal_drafts" || result.summary.externalExecution !== "forbidden") {
      throw new Error(`Synthetic ready tenant demo did not pass:\n${[...result.errors, ...result.warnings].map((item) => `- ${item}`).join("\n")}`);
    }
    return { ...result, synthetic: true };
  } finally {
    fs.rmSync(tenantRoot, { recursive: true, force: true });
  }
};

const runAsCli = () => {
  try {
    const result = validateSyntheticReadyTenantDemo();
    console.log(`Synthetic tenant demo passed: ${result.summary.state}; external execution remains ${result.summary.externalExecution}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
};

if (path.resolve(process.argv[1] || "") === path.resolve(modulePath)) runAsCli();
