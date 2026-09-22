import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { materializeSyntheticReadyTenant } from "./growth-tenant-demo.mjs";
import { initializeGrowthTenant } from "./init-growth-tenant.mjs";
import { computeReviewableArtifactHash, validateGrowthTenantArtifacts } from "./validate-growth-tenant-artifacts.mjs";

const workspaceRoot = process.cwd();
const tenantId = "example-ai";
const claimId = `${tenantId}_guided_planning_claim`;
const futureDestination = `${tenantId}_future_destination`;

const writeJson = (root, relativePath, value) => {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const readJson = (root, relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

const createTenantRoot = ({ ready = true } = {}) => {
  const tenantRoot = fs.mkdtempSync(path.join(os.tmpdir(), "growth-tenant-artifacts-"));
  initializeGrowthTenant({ workspaceRoot, tenantId, outputRoot: tenantRoot });
  if (ready) materializeSyntheticReadyTenant({ tenantRoot, tenantId });
  return tenantRoot;
};

const withTenant = (callback, options) => {
  const tenantRoot = createTenantRoot(options);
  try {
    callback(tenantRoot);
  } finally {
    fs.rmSync(tenantRoot, { recursive: true, force: true });
  }
};

const softScores = () => ({
  jtbd_audience_relevance: 4,
  specific_differentiated_value: 4,
  proof_claim_precision: 4,
  brand_locale_editorial_quality: 4,
  clarity_cta_destination_fit: 4,
  platform_visual_accessibility_fit: 3,
  trust_emotional_safety: 4,
  experiment_measurement_quality: 3,
  operational_traceability_reuse: 4
});

const brief = () => ({
  id: "brief-001",
  tenantId,
  hypothesis: "A specific, evidence-bound internal draft can clarify the first product value.",
  claimRefs: [claimId],
  formats: ["static"],
  destinationId: futureDestination,
  primaryMetric: `${tenantId}_approved_cta_click`,
  guardrails: ["draft_only_no_external_action", "claim_hard_fail"]
});

const asset = () => ({
  id: "asset-001",
  tenantId,
  briefId: "brief-001",
  version: "1.0.0",
  artifactKind: "concept_copy_package",
  status: "reviewed_internal",
  lifecycleState: "qa_pass_pending_human",
  format: "static",
  claimRefs: [claimId],
  copy: {
    "en-US": {
      headline: "Plan one useful next step.",
      body: "Use a focused internal planning prompt to clarify the next step.",
      caption: "A fictional internal draft used only for framework validation.",
      cta: "Review internally",
      altText: "A simple internal planning draft with readable text."
    },
    vi: {
      headline: "Lên kế hoạch cho một bước tiếp theo hữu ích.",
      body: "Dùng một gợi ý lập kế hoạch tập trung để làm rõ bước tiếp theo.",
      caption: "Bản nháp nội bộ hư cấu chỉ dùng để kiểm tra framework.",
      cta: "Xem xét nội bộ",
      altText: "Bản nháp lập kế hoạch nội bộ đơn giản với chữ dễ đọc."
    }
  },
  visualBrief: {
    source: "tenant-owned internal visual direction",
    reference: "brand-pack.json",
    rightsStatus: "approved_internal_reference",
    provenanceStatus: "draft_internal",
    accessibility: { altTextProvided: true }
  },
  destination: { id: futureDestination, status: "internal_review" },
  measurement: {
    hypothesis: "A focused invitation may clarify the first product value.",
    primaryMetric: `${tenantId}_approved_cta_click`,
    denominator: `${tenantId}_eligible_destination_view`,
    guardrails: ["draft_only_no_external_action"]
  },
  productionRecord: {
    skillVersion: "1.0.0",
    source: "tenant-content-author",
    modelVersion: "synthetic-test",
    timeEstimateMinutes: 10,
    costUsd: 0,
    costStatus: "synthetic"
  },
  qa: {
    automatedVerdict: "pass",
    independentQaStatus: "pass_pending_human",
    hardFailureCodes: [],
    softScores: softScores(),
    reviewerRole: "tenant-independent-qa",
    repairCycles: 0
  },
  approval: {
    status: "not_submitted",
    artifactHash: null,
    targetChannel: "internal_review",
    expiry: "2099-12-31"
  },
  externalReadiness: {
    status: "blocked",
    blockingGates: ["human_review", "execution_envelope"]
  }
});

const qaVerdict = (assetPackage) => ({
  tenantId,
  artifactId: assetPackage.id,
  artifactVersion: assetPackage.version,
  artifactHash: assetPackage.approval.artifactHash,
  rubricVersion: "1.0.0",
  verdict: "pass",
  hardFailureCodes: [],
  softScores: assetPackage.qa.softScores,
  reviewerRole: "tenant-independent-qa",
  reviewedAt: "2026-09-21"
});

const approvalRecord = (assetPackage) => ({
  tenantId,
  artifactId: assetPackage.id,
  artifactVersion: assetPackage.version,
  artifactHash: assetPackage.approval.artifactHash,
  configVersion: "1.0.0",
  targetChannel: "internal_review",
  expiry: "2099-12-31",
  status: "not_submitted"
});

const bindAsset = (assetPackage) => {
  assetPackage.approval.artifactHash = computeReviewableArtifactHash(assetPackage);
  return assetPackage;
};

const materializeGoodFixture = (tenantRoot) => {
  const assetPackage = bindAsset(asset());
  writeJson(tenantRoot, "briefs/brief-001.json", brief());
  writeJson(tenantRoot, "content-drafts/asset-001.json", assetPackage);
  writeJson(tenantRoot, "approvals/asset-001.qa.json", qaVerdict(assetPackage));
  writeJson(tenantRoot, "approvals/asset-001.approval.json", approvalRecord(assetPackage));
};

const rebindReviews = (tenantRoot) => {
  const assetPackage = readJson(tenantRoot, "content-drafts/asset-001.json");
  bindAsset(assetPackage);
  writeJson(tenantRoot, "content-drafts/asset-001.json", assetPackage);
  writeJson(tenantRoot, "approvals/asset-001.qa.json", qaVerdict(assetPackage));
  writeJson(tenantRoot, "approvals/asset-001.approval.json", approvalRecord(assetPackage));
  return assetPackage;
};

test("empty W1/W2 registries are reported as no artifacts yet", () => {
  withTenant((tenantRoot) => {
    const result = validateGrowthTenantArtifacts(tenantRoot);
    assert.deepEqual(result.errors, []);
    assert.equal(result.summary.state, "no_artifacts_yet");
  });
});

test("a complete W0 tenant with bound W1/W2 artifacts passes all internal QA checks", () => {
  withTenant((tenantRoot) => {
    materializeGoodFixture(tenantRoot);
    const result = validateGrowthTenantArtifacts(tenantRoot);
    assert.deepEqual(result.errors, []);
    assert.equal(result.summary.state, "qa_ready_internal");
    assert.equal(result.summary.w0State, "ready_for_internal_drafts");
    assert.equal(result.summary.externalExecution, "forbidden");
    assert.equal(result.summary.assets, 1);
  });
});

test("non-empty W1/W2 artifact validation blocks a tenant that has not passed W0", () => {
  withTenant((tenantRoot) => {
    writeJson(tenantRoot, "briefs/brief-001.json", brief());
    const result = validateGrowthTenantArtifacts(tenantRoot);
    assert.ok(result.errors.some((error) => error.includes("W0 prerequisite did not pass")));
  }, { ready: false });
});

test("BrandPack supportedLocales remains the artifact fallback, while an incomplete W0 is still blocked", () => {
  withTenant((tenantRoot) => {
    materializeGoodFixture(tenantRoot);
    const fallbackBrandPack = readJson(tenantRoot, "brand-pack.json");
    fallbackBrandPack.audienceLanguage.requiredContentLocales = [];
    fallbackBrandPack.audienceLanguage.supportedLocales = ["en-US", "vi"];
    writeJson(tenantRoot, "brand-pack.json", fallbackBrandPack);
    const result = validateGrowthTenantArtifacts(tenantRoot);
    assert.deepEqual(result.summary.requiredLocales, ["en-US", "vi"]);
    assert.ok(result.errors.some((error) => error.includes("W0 prerequisite did not pass")));
  });
});

test("unsupported ProductTruth claims are blocked", () => {
  withTenant((tenantRoot) => {
    materializeGoodFixture(tenantRoot);
    const invalidBrief = brief();
    invalidBrief.claimRefs = ["claim-that-does-not-exist"];
    writeJson(tenantRoot, "briefs/brief-001.json", invalidBrief);
    const result = validateGrowthTenantArtifacts(tenantRoot);
    assert.ok(result.errors.some((error) => error.includes("unsupported claim ref claim-that-does-not-exist")));
  });
});

test("ProductTruth-prohibited wording is blocked even when the claim reference is valid", () => {
  withTenant((tenantRoot) => {
    materializeGoodFixture(tenantRoot);
    const invalidAsset = readJson(tenantRoot, "content-drafts/asset-001.json");
    invalidAsset.copy["en-US"].headline = "A guaranteed outcome for every plan.";
    writeJson(tenantRoot, "content-drafts/asset-001.json", invalidAsset);
    rebindReviews(tenantRoot);
    const result = validateGrowthTenantArtifacts(tenantRoot);
    assert.ok(result.errors.some((error) => error.includes("copy uses ProductTruth-prohibited wording \"guaranteed outcome\"")));
  });
});

test("a lifecycle beyond qa_pass_pending_human is blocked", () => {
  withTenant((tenantRoot) => {
    materializeGoodFixture(tenantRoot);
    const invalidAsset = readJson(tenantRoot, "content-drafts/asset-001.json");
    invalidAsset.lifecycleState = "external_candidate";
    writeJson(tenantRoot, "content-drafts/asset-001.json", invalidAsset);
    const result = validateGrowthTenantArtifacts(tenantRoot);
    assert.ok(result.errors.some((error) => error.includes("lifecycle must stay no later than qa_pass_pending_human")));
  });
});

test("foreign-brand leakage is surfaced through lintCandidate", () => {
  withTenant((tenantRoot) => {
    materializeGoodFixture(tenantRoot);
    const invalidAsset = readJson(tenantRoot, "content-drafts/asset-001.json");
    invalidAsset.copy["en-US"].body = "other-synthetic-brand appears in this isolated tenant draft.";
    writeJson(tenantRoot, "content-drafts/asset-001.json", invalidAsset);
    rebindReviews(tenantRoot);
    const result = validateGrowthTenantArtifacts(tenantRoot);
    assert.ok(result.errors.some((error) => error.includes("lintCandidate blocked cross_tenant_leak")));
  });
});

test("missing a dynamically required BrandPack locale is blocked", () => {
  withTenant((tenantRoot) => {
    materializeGoodFixture(tenantRoot);
    const invalidAsset = readJson(tenantRoot, "content-drafts/asset-001.json");
    delete invalidAsset.copy.vi;
    writeJson(tenantRoot, "content-drafts/asset-001.json", invalidAsset);
    rebindReviews(tenantRoot);
    const result = validateGrowthTenantArtifacts(tenantRoot);
    assert.ok(result.errors.some((error) => error.includes("missing required locale vi")));
  });
});

test("QA binding is explicit and does not depend on the review filename", () => {
  withTenant((tenantRoot) => {
    materializeGoodFixture(tenantRoot);
    const qa = readJson(tenantRoot, "approvals/asset-001.qa.json");
    fs.rmSync(path.join(tenantRoot, "approvals/asset-001.qa.json"));
    writeJson(tenantRoot, "approvals/review-batch-01.json", qa);
    const result = validateGrowthTenantArtifacts(tenantRoot);
    assert.deepEqual(result.errors, []);
  });
});

test("a QA verdict with a mismatched explicit artifact binding is blocked", () => {
  withTenant((tenantRoot) => {
    materializeGoodFixture(tenantRoot);
    const invalidQa = readJson(tenantRoot, "approvals/asset-001.qa.json");
    invalidQa.artifactId = "asset-not-present";
    writeJson(tenantRoot, "approvals/asset-001.qa.json", invalidQa);
    const result = validateGrowthTenantArtifacts(tenantRoot);
    assert.ok(result.errors.some((error) => error.includes("QA verdict artifactId must resolve to an existing asset id")));
  });
});

test("changing a bound asset after QA invalidates its canonical hash", () => {
  withTenant((tenantRoot) => {
    materializeGoodFixture(tenantRoot);
    const tamperedAsset = readJson(tenantRoot, "content-drafts/asset-001.json");
    tamperedAsset.copy["en-US"].body = "A changed internal draft after its review.";
    writeJson(tenantRoot, "content-drafts/asset-001.json", tamperedAsset);
    const result = validateGrowthTenantArtifacts(tenantRoot);
    assert.ok(result.errors.some((error) => error.includes("approval.artifactHash must equal the canonical reviewable asset hash")));
    assert.ok(result.errors.some((error) => error.includes("QA verdict artifactHash must match the canonical asset hash")));
  });
});

test("a bound approval record must match asset id, version, and canonical hash", () => {
  withTenant((tenantRoot) => {
    materializeGoodFixture(tenantRoot);
    const invalidApproval = readJson(tenantRoot, "approvals/asset-001.approval.json");
    invalidApproval.artifactVersion = "0.0.0";
    writeJson(tenantRoot, "approvals/asset-001.approval.json", invalidApproval);
    const result = validateGrowthTenantArtifacts(tenantRoot);
    assert.ok(result.errors.some((error) => error.includes("approval record artifactVersion must match asset asset-001")));
  });
});

test("QA cannot be performed by the content author or an unmapped reviewer", () => {
  withTenant((tenantRoot) => {
    materializeGoodFixture(tenantRoot);
    const invalidQa = readJson(tenantRoot, "approvals/asset-001.qa.json");
    invalidQa.reviewerRole = "tenant-content-author";
    writeJson(tenantRoot, "approvals/asset-001.qa.json", invalidQa);
    const result = validateGrowthTenantArtifacts(tenantRoot);
    assert.ok(result.errors.some((error) => error.includes("authoring source and QA reviewer role must be separate")));
    assert.ok(result.errors.some((error) => error.includes("QA verdict reviewerRole must match role-mapping.json quality_assurance")));
  });
});

test("QA pass requires all nine rubric dimensions and the configured threshold", () => {
  withTenant((tenantRoot) => {
    materializeGoodFixture(tenantRoot);
    const invalidAsset = readJson(tenantRoot, "content-drafts/asset-001.json");
    invalidAsset.qa.softScores.jtbd_audience_relevance = 2;
    writeJson(tenantRoot, "content-drafts/asset-001.json", invalidAsset);
    rebindReviews(tenantRoot);
    const result = validateGrowthTenantArtifacts(tenantRoot);
    assert.ok(result.errors.some((error) => error.includes("quality rubric dimension(s) below 3")));
  });
});

test("QA pass blocks an incomplete nine-dimension rubric", () => {
  withTenant((tenantRoot) => {
    materializeGoodFixture(tenantRoot);
    const invalidAsset = readJson(tenantRoot, "content-drafts/asset-001.json");
    delete invalidAsset.qa.softScores.operational_traceability_reuse;
    writeJson(tenantRoot, "content-drafts/asset-001.json", invalidAsset);
    rebindReviews(tenantRoot);
    const result = validateGrowthTenantArtifacts(tenantRoot);
    assert.ok(result.errors.some((error) => error.includes("missing quality rubric dimensions operational_traceability_reuse")));
  });
});
