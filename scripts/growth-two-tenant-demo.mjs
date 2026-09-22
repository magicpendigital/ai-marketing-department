import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { materializeSyntheticReadyTenant } from "./growth-tenant-demo.mjs";
import { initializeGrowthTenant } from "./init-growth-tenant.mjs";
import { validateGrowthTenant } from "./validate-growth-tenant.mjs";

const modulePath = fileURLToPath(import.meta.url);

const readJson = (root, relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const writeJson = (root, relativePath, value) => fs.writeFileSync(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");

const setForeignToken = (tenantRoot, token) => {
  const config = readJson(tenantRoot, "tenant-config.json");
  const brand = readJson(tenantRoot, "brand-pack.json");
  const readiness = readJson(tenantRoot, "readiness.json");
  config.identityBoundary.knownForeignBrandTokens = [token];
  brand.identity.knownForeignBrandTokens = [token];
  readiness.identityBoundary.knownForeignBrandTokens = [token];
  writeJson(tenantRoot, "tenant-config.json", config);
  writeJson(tenantRoot, "brand-pack.json", brand);
  writeJson(tenantRoot, "readiness.json", readiness);
};

export const validateTwoTenantSyntheticDemo = ({ workspaceRoot = process.cwd() } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "growth-two-tenant-demo-"));
  const tenantA = path.join(root, "tenant-a");
  const tenantB = path.join(root, "tenant-b");
  try {
    initializeGrowthTenant({ workspaceRoot, tenantId: "example-ai", outputRoot: tenantA });
    initializeGrowthTenant({ workspaceRoot, tenantId: "second-ai", outputRoot: tenantB });
    materializeSyntheticReadyTenant({ tenantRoot: tenantA, tenantId: "example-ai" });
    materializeSyntheticReadyTenant({ tenantRoot: tenantB, tenantId: "second-ai" });
    const resultA = validateGrowthTenant(tenantA);
    const resultB = validateGrowthTenant(tenantB);
    assert.deepEqual(resultA.errors, []);
    assert.deepEqual(resultB.errors, []);

    const tenantAOwnToken = readJson(tenantA, "tenant-config.json").identityBoundary.ownBrandTokens[0];
    setForeignToken(tenantB, tenantAOwnToken);
    const businessB = readJson(tenantB, "business-pack.json");
    businessB.businessContext.valueHypothesis = `Borrow ${tenantAOwnToken} identity in this internal plan.`;
    writeJson(tenantB, "business-pack.json", businessB);
    const leakageResult = validateGrowthTenant(tenantB);
    assert.ok(leakageResult.errors.some((error) => error.includes("declared foreign tenant token")));

    return {
      tenantA: resultA.summary,
      tenantB: resultB.summary,
      leakageBlocked: true,
      crossTenantData: "aggregate_learning_export_only"
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

const runAsCli = () => {
  try {
    const result = validateTwoTenantSyntheticDemo();
    console.log(`Two synthetic tenants passed independently; cross-tenant identity leakage was blocked. Shared data class: ${result.crossTenantData}.`);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
};

if (path.resolve(process.argv[1] || "") === path.resolve(modulePath)) runAsCli();
