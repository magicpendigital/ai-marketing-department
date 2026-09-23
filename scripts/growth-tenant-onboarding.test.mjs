import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { materializeSyntheticReadyTenant } from "./growth-tenant-demo.mjs";
import { initializeGrowthTenant } from "./init-growth-tenant.mjs";
import { validateGrowthTenant } from "./validate-growth-tenant.mjs";

const workspaceRoot = process.cwd();

const readJson = (tenantRoot, relativePath) => JSON.parse(fs.readFileSync(path.join(tenantRoot, relativePath), "utf8"));
const writeJson = (tenantRoot, relativePath, value) => fs.writeFileSync(path.join(tenantRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");

const createTenant = (tenantId = "example-ai") => {
  const tenantRoot = fs.mkdtempSync(path.join(os.tmpdir(), "growth-tenant-test-"));
  initializeGrowthTenant({ workspaceRoot, tenantId, outputRoot: tenantRoot });
  return tenantRoot;
};

const withTenant = (callback) => {
  const tenantRoot = createTenant();
  try {
    callback(tenantRoot);
  } finally {
    fs.rmSync(tenantRoot, { recursive: true, force: true });
  }
};

test("initializer produces a structurally valid incomplete tenant and strict validation explains what remains", () => {
  withTenant((tenantRoot) => {
    const incomplete = validateGrowthTenant(tenantRoot, { allowIncomplete: true });
    assert.deepEqual(incomplete.errors, []);
    assert.equal(incomplete.summary.state, "incomplete");
    assert.ok(incomplete.warnings.some((warning) => warning.includes("Replace all scaffold placeholders")));

    const strict = validateGrowthTenant(tenantRoot);
    assert.equal(strict.summary.state, "blocked");
    assert.ok(strict.errors.some((error) => error.includes("isSynthetic must be false")));
  });
});

test("initializer rejects unsafe tenant ids and a non-empty target", () => {
  assert.throws(
    () => initializeGrowthTenant({ workspaceRoot, tenantId: "Invalid Tenant", outputRoot: fs.mkdtempSync(path.join(os.tmpdir(), "growth-invalid-")) }),
    /lowercase letters, digits and hyphens/i
  );
  const nonEmptyTarget = fs.mkdtempSync(path.join(os.tmpdir(), "growth-nonempty-"));
  try {
    fs.writeFileSync(path.join(nonEmptyTarget, "keep.txt"), "do not overwrite", "utf8");
    assert.throws(
      () => initializeGrowthTenant({ workspaceRoot, tenantId: "example-ai", outputRoot: nonEmptyTarget }),
      /non-empty directory/i
    );
  } finally {
    fs.rmSync(nonEmptyTarget, { recursive: true, force: true });
  }
});

test("generated ready test tenant passes W0/B1 validation and stays draft-only", () => {
  withTenant((tenantRoot) => {
    materializeSyntheticReadyTenant({ tenantRoot, tenantId: "example-ai" });
    const result = validateGrowthTenant(tenantRoot);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.summary.state, "ready_for_internal_drafts");
    assert.equal(result.summary.externalExecution, "forbidden");
  });
});

test("a real tenant cannot retain fixture-only language", () => {
  withTenant((tenantRoot) => {
    materializeSyntheticReadyTenant({ tenantRoot, tenantId: "example-ai" });
    const manifest = readJson(tenantRoot, "onboarding-manifest.json");
    manifest.purpose = "Fictional completed W0 checklist for validator testing only.";
    writeJson(tenantRoot, "onboarding-manifest.json", manifest);
    const result = validateGrowthTenant(tenantRoot);
    assert.ok(result.errors.some((error) => error.includes("fixture-only language")));
  });
});

test("ready tenant may register internal draft entries while the external boundary remains enforced", () => {
  withTenant((tenantRoot) => {
    materializeSyntheticReadyTenant({ tenantRoot, tenantId: "example-ai" });
    const briefs = readJson(tenantRoot, "briefs/index.json");
    briefs.briefs.push({ id: "internal-brief-001" });
    writeJson(tenantRoot, "briefs/index.json", briefs);
    const result = validateGrowthTenant(tenantRoot);
    assert.deepEqual(result.errors, []);
    assert.equal(result.summary.state, "ready_for_internal_drafts");
  });
});

test("journey stages must use defined aggregate events and retain privacy guardrails", () => {
  withTenant((tenantRoot) => {
    materializeSyntheticReadyTenant({ tenantRoot, tenantId: "example-ai" });
    const journey = readJson(tenantRoot, "journey/journey-map.json");
    journey.stages[0].eventRefs = ["undefined-event"];
    journey.stages[0].guardrails = ["aggregate_only"];
    writeJson(tenantRoot, "journey/journey-map.json", journey);
    const result = validateGrowthTenant(tenantRoot);
    assert.ok(result.errors.some((error) => error.includes("eventRefs must link only to defined aggregate measurement events")));
    assert.ok(result.errors.some((error) => error.includes("must retain aggregate_only, no_sensitive_targeting")));
  });
});

test("foreign brand leakage is blocked outside an approved identity-boundary declaration", () => {
  withTenant((tenantRoot) => {
    materializeSyntheticReadyTenant({ tenantRoot, tenantId: "example-ai" });
    const business = readJson(tenantRoot, "business-pack.json");
    business.businessContext.valueHypothesis = "This draft refers to other-synthetic-brand outside the tenant boundary.";
    writeJson(tenantRoot, "business-pack.json", business);
    const result = validateGrowthTenant(tenantRoot);
    assert.ok(result.errors.some((error) => error.includes("declared foreign tenant token")));
  });
});

test("any allow or enabled execution state is blocked", () => {
  withTenant((tenantRoot) => {
    materializeSyntheticReadyTenant({ tenantRoot, tenantId: "example-ai" });
    const business = readJson(tenantRoot, "business-pack.json");
    business.commercialBoundary.paidCampaign = "allowed";
    writeJson(tenantRoot, "business-pack.json", business);
    const result = validateGrowthTenant(tenantRoot);
    assert.ok(result.errors.some((error) => error.includes("external execution must remain forbidden")));
  });
});

test("personal-data and credential-like patterns are blocked from tenant configuration", () => {
  withTenant((tenantRoot) => {
    materializeSyntheticReadyTenant({ tenantRoot, tenantId: "example-ai" });
    const brand = readJson(tenantRoot, "brand-pack.json");
    const syntheticEmail = ["sample-person", "example.test"].join("@");
    brand.identity.tagline = `Contact ${syntheticEmail} for the draft.`;
    writeJson(tenantRoot, "brand-pack.json", brand);
    const business = readJson(tenantRoot, "business-pack.json");
    business.businessContext.valueHypothesis = `${["api", "key"].join("_")}=synthetic-token-value`;
    writeJson(tenantRoot, "business-pack.json", business);
    const result = validateGrowthTenant(tenantRoot);
    assert.ok(result.errors.some((error) => error.includes("personal-data pattern")));
    assert.ok(result.errors.some((error) => error.includes("credential-like pattern")));
  });
});
