import fs from "node:fs";
import path from "node:path";

const readJson = (tenantRoot, relativePath) => JSON.parse(
  fs.readFileSync(path.join(tenantRoot, relativePath), "utf8")
);

const defaultCopy = Object.freeze({
  headline: "Clarify one useful next step",
  body: "Use the guided planning space to organize an internal draft.",
  caption: "A calm planning concept for internal review.",
  cta: "Review the internal draft",
  altText: "A simple planning card prepared for internal review."
});

export const buildSyntheticConceptPackage = ({ tenantRoot, jobId, copyByLocale = {}, packageOverrides = {} }) => {
  const tenantConfig = readJson(tenantRoot, "tenant-config.json");
  const brandPack = readJson(tenantRoot, "brand-pack.json");
  const productTruth = readJson(tenantRoot, "product-truth.json");
  const claimId = productTruth.features?.[0]?.claims?.[0]?.id;
  const requiredLocales = brandPack.audienceLanguage?.requiredContentLocales || [];
  if (!tenantConfig.tenantId || !claimId || requiredLocales.length === 0) {
    throw new Error("Synthetic concept fixture requires a ready tenant with a ProductTruth claim and required locales.");
  }

  const copy = Object.fromEntries(requiredLocales.map((locale) => [
    locale,
    { ...defaultCopy, ...(copyByLocale[locale] || {}) }
  ]));
  const base = {
    id: `${jobId}-concept-package`,
    tenantId: tenantConfig.tenantId,
    briefId: `${jobId}-brief`,
    version: "1.0.0",
    artifactKind: "concept_copy_package",
    status: "draft_internal",
    lifecycleState: "draft_internal",
    format: "static",
    claimRefs: [claimId],
    copy,
    visualBrief: {
      source: "tenant-owned-or-licensed-asset-library",
      reference: `tenant-private:asset/${tenantConfig.tenantId}/${jobId}`,
      rightsStatus: "owned",
      provenanceStatus: "verified",
      accessibility: { altTextProvided: true }
    },
    destination: {
      id: `${tenantConfig.tenantId}_future_destination`,
      status: "internal_review"
    },
    measurement: {
      hypothesis: "The reviewed concept may help clarify a useful next step.",
      primaryMetric: "internal_editorial_acceptance",
      denominator: "reviewed_internal_concept_packages",
      guardrails: ["No external action is authorized."]
    },
    productionRecord: {
      skillVersion: "synthetic_test_fixture_1",
      source: "deterministic_test_fixture",
      modelVersion: "none",
      timeEstimateMinutes: 1,
      costUsd: 0,
      costStatus: "synthetic_no_cost"
    },
    qa: {
      automatedVerdict: "pending",
      independentQaStatus: "pending",
      hardFailureCodes: [],
      softScores: {},
      reviewerRole: null,
      repairCycles: 0
    },
    approval: {
      status: "not_submitted",
      artifactHash: null,
      targetChannel: null,
      expiry: null
    },
    externalReadiness: {
      status: "blocked",
      blockingGates: ["independent_qa", "human_owner_decision"],
      externalActionAuthority: {
        publish: false,
        send: false,
        schedule: false,
        createCampaign: false,
        uploadAudience: false,
        spend: false
      }
    }
  };

  return { ...base, ...packageOverrides, copy: packageOverrides.copy || copy };
};
export const serializeSyntheticConceptPackage = (options) => (
  `${JSON.stringify(buildSyntheticConceptPackage(options), null, 2)}\n`
);
