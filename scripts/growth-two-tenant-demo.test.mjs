import assert from "node:assert/strict";
import test from "node:test";
import { validateTwoTenantSyntheticDemo } from "./growth-two-tenant-demo.mjs";

test("two synthetic tenants validate independently and reject a cross-tenant identity leak", () => {
  const result = validateTwoTenantSyntheticDemo();
  assert.equal(result.tenantA.readyForInternalDrafts, true);
  assert.equal(result.tenantB.readyForInternalDrafts, true);
  assert.equal(result.leakageBlocked, true);
  assert.equal(result.crossTenantData, "aggregate_learning_export_only");
});
