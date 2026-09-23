import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateContractInstance } from "./growth-framework-validator.mjs";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractsRoot = path.join(workspaceRoot, "packages", "growth-contracts");

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(contractsRoot, relativePath), "utf8"));

const cases = [
  ["extensions/media-production-request.schema.json", "examples/media-real-capture.request.example.json"],
  ["extensions/media-asset-record.schema.json", "examples/media-real-capture.asset-record.example.json"],
  ["extensions/supervisor-preference-intake.schema.json", "examples/supervisor-preference-intake.example.json"],
  ["extensions/supervisor-policy-profile.schema.json", "examples/supervisor-policy-profile.example.json"],
  ["extensions/supervisor-decision-record.schema.json", "examples/supervisor-shadow-decision.example.json"]
];

for (const [schemaPath, examplePath] of cases) {
  test(`${examplePath} matches ${schemaPath}`, () => {
    const value = readJson(examplePath);
    const errors = validateContractInstance(workspaceRoot, schemaPath, value, examplePath);
    assert.deepEqual(errors, []);
  });
}

test("real-capture example blocks synthesized media and keeps publishing separate", () => {
  const request = readJson("examples/media-real-capture.request.example.json");
  const asset = readJson("examples/media-real-capture.asset-record.example.json");

  assert.deepEqual(request.sourcePolicy.allowedSourceModes, ["real_capture"]);
  assert.equal(request.sourcePolicy.requiredOrigin, "real_capture_only");
  assert.match(request.sourcePolicy.generativeAi.policy, /^(forbidden|planning_only_no_media_synthesis)$/);
  assert.ok(request.sourcePolicy.generativeAi.prohibitedOperations.includes("full_asset_generation"));
  assert.ok(request.sourcePolicy.generativeAi.prohibitedOperations.includes("synthetic_voice"));
  assert.equal(request.sourcePolicy.syntheticIdentityMedia, "forbidden");
  assert.equal(request.externalAction, "forbidden_until_separate_execution_envelope");

  assert.equal(asset.sourceMode, "real_capture");
  assert.equal(asset.policySnapshot.actualGenerativeAiUse, false);
  assert.ok(asset.editLog.every((entry) => entry.class !== "generative"));
  assert.ok(asset.sourceFiles.some((file) => file.role === "camera_original"));
  assert.ok(asset.captureEvidence.completedShotIds.length > 0);
  assert.equal(asset.captureEvidence.rawGpsStored, false);
  assert.equal(asset.rightsEvidence.status, "approved");
  assert.ok(asset.rightsEvidence.evidenceRefs.length > 0);
  assert.ok(asset.rightsEvidence.releases.every((release) => release.status === "approved" || release.status === "not_applicable"));
  assert.equal(asset.technicalQa.status, "pass");
  assert.equal(asset.contentQa.status, "pass");
  assert.deepEqual(asset.contentQa.hardFailureCodes, []);
  assert.equal(asset.externalReadiness.externalAction, "not_authorized_by_this_record");
  assert.equal(asset.externalReadiness.executionEnvelopeRef, null);
});

test("real-capture-only request rejects full asset generation through its conditional schema", () => {
  const request = structuredClone(readJson("examples/media-real-capture.request.example.json"));
  request.sourcePolicy.generativeAi.permittedOperations.push("full_asset_generation");

  const errors = validateContractInstance(
    workspaceRoot,
    "extensions/media-production-request.schema.json",
    request,
    "adversarial real-capture request"
  );

  assert.ok(errors.some((error) => error.includes("sourcePolicy.generativeAi.permittedOperations")));
  assert.ok(errors.some((error) => error.includes("not an allowed contract value")));
});

for (const requiredOrigin of [
  "owned_or_commissioned_real_media",
  "owned_or_licensed_non_generated_media",
  "any_approved_non_generated_media"
]) {
  test(`${requiredOrigin} rejects generated sources, generation policy, and media synthesis`, () => {
    const request = structuredClone(readJson("examples/media-real-capture.request.example.json"));
    request.sourcePolicy.requiredOrigin = requiredOrigin;
    request.sourcePolicy.allowedSourceModes = ["generated_ai"];
    request.sourcePolicy.generativeAi.policy = "allowed_with_disclosure_and_owner_review";
    request.sourcePolicy.generativeAi.permittedOperations = ["full_asset_generation"];

    const errors = validateContractInstance(
      workspaceRoot,
      "extensions/media-production-request.schema.json",
      request,
      `adversarial ${requiredOrigin} request`
    );

    assert.ok(errors.some((error) => error.includes("sourcePolicy.allowedSourceModes")));
    assert.ok(errors.some((error) => error.includes("sourcePolicy.generativeAi.policy")));
    assert.ok(errors.some((error) => error.includes("sourcePolicy.generativeAi.permittedOperations")));
  });
}

test("owned-or-commissioned request rejects licensed existing media", () => {
  const request = structuredClone(readJson("examples/media-real-capture.request.example.json"));
  request.sourcePolicy.requiredOrigin = "owned_or_commissioned_real_media";
  request.sourcePolicy.allowedSourceModes = ["licensed_existing"];

  const errors = validateContractInstance(
    workspaceRoot,
    "extensions/media-production-request.schema.json",
    request,
    "adversarial owned-or-commissioned request"
  );

  assert.ok(errors.some((error) => error.includes("sourcePolicy.allowedSourceModes")));
});

for (const sourceMode of ["commissioned_human_production", "real_capture"]) {
  test(`owned-or-licensed request rejects ${sourceMode}`, () => {
    const request = structuredClone(readJson("examples/media-real-capture.request.example.json"));
    request.sourcePolicy.requiredOrigin = "owned_or_licensed_non_generated_media";
    request.sourcePolicy.allowedSourceModes = [sourceMode];

    const errors = validateContractInstance(
      workspaceRoot,
      "extensions/media-production-request.schema.json",
      request,
      `adversarial owned-or-licensed ${sourceMode} request`
    );

    assert.ok(errors.some((error) => error.includes("sourcePolicy.allowedSourceModes")));
  });
}

for (const requiredOrigin of [
  "real_capture_only",
  "owned_or_commissioned_real_media",
  "owned_or_licensed_non_generated_media",
  "any_approved_non_generated_media"
]) {
  for (const sourceMode of ["generated_ai", "hybrid_real_and_generated"]) {
    test(`${requiredOrigin} asset rejects ${sourceMode} and declared generative use`, () => {
      const asset = structuredClone(readJson("examples/media-real-capture.asset-record.example.json"));
      asset.policySnapshot.requiredOrigin = requiredOrigin;
      asset.sourceMode = sourceMode;
      asset.policySnapshot.generativeAiPolicy = "allowed_with_disclosure_and_owner_review";
      asset.policySnapshot.actualGenerativeAiUse = true;
      asset.editLog[0].class = "generative";

      const errors = validateContractInstance(
        workspaceRoot,
        "extensions/media-asset-record.schema.json",
        asset,
        `adversarial ${requiredOrigin} ${sourceMode} asset`
      );

      assert.ok(errors.some((error) => error.includes("sourceMode")));
      assert.ok(errors.some((error) => error.includes("policySnapshot.generativeAiPolicy")));
      assert.ok(errors.some((error) => error.includes("policySnapshot.actualGenerativeAiUse")));
      assert.ok(errors.some((error) => error.includes("editLog[0].class")));
    });
  }
}

test("real-capture-only asset rejects a non-generated but non-capture source", () => {
  const asset = structuredClone(readJson("examples/media-real-capture.asset-record.example.json"));
  asset.sourceMode = "tenant_owned_existing";

  const errors = validateContractInstance(
    workspaceRoot,
    "extensions/media-asset-record.schema.json",
    asset,
    "adversarial real-capture-only existing asset"
  );

  assert.ok(errors.some((error) => error.includes("sourceMode")));
  assert.ok(errors.some((error) => error.includes("must equal the contract constant")));
});

test("owned-or-commissioned asset rejects licensed existing media", () => {
  const asset = structuredClone(readJson("examples/media-real-capture.asset-record.example.json"));
  asset.policySnapshot.requiredOrigin = "owned_or_commissioned_real_media";
  asset.sourceMode = "licensed_existing";

  const errors = validateContractInstance(
    workspaceRoot,
    "extensions/media-asset-record.schema.json",
    asset,
    "adversarial owned-or-commissioned licensed asset"
  );

  assert.ok(errors.some((error) => error.includes("sourceMode")));
});

test("media asset rejects malformed approval records through local schema references", () => {
  const asset = structuredClone(readJson("examples/media-real-capture.asset-record.example.json"));
  asset.approvals.editorial = "not-an-approval";
  asset.approvals.rights = {};
  asset.approvals.media = null;

  const errors = validateContractInstance(
    workspaceRoot,
    "extensions/media-asset-record.schema.json",
    asset,
    "adversarial malformed approvals asset"
  );

  assert.ok(errors.some((error) => error.includes("approvals.editorial") && error.includes("expected object")));
  assert.ok(errors.some((error) => error.includes("approvals.rights") && error.includes("missing required field status")));
  assert.ok(errors.some((error) => error.includes("approvals.media") && error.includes("expected object")));
});

test("shadow Supervisor cannot act, self-promote, bypass QA, or perform an external action", () => {
  const intake = readJson("examples/supervisor-preference-intake.example.json");
  const policy = readJson("examples/supervisor-policy-profile.example.json");
  const decision = readJson("examples/supervisor-shadow-decision.example.json");

  assert.equal(intake.status, "owner_verified");
  assert.equal(intake.dataBoundary.rawTranscriptStored, false);
  assert.equal(intake.dataBoundary.directIdentifiersStored, false);
  assert.ok(intake.decisionExamples.length >= 3);

  assert.equal(policy.status, "shadow");
  assert.equal(policy.currentFrameworkIntegration, "shadow_only");
  assert.equal(policy.operatingMode, "shadow");
  assert.equal(policy.learningPolicy.onlineSelfModification, "forbidden");
  assert.equal(policy.learningPolicy.promotion, "explicit_human_approval_required");
  assert.equal(policy.hardFailPolicy.override, "forbidden");
  assert.equal(policy.separationOfDuties.producerMaySuperviseOwnOutput, false);
  assert.equal(policy.separationOfDuties.supervisorMayReplaceIndependentQa, false);
  assert.equal(policy.activationGate.maximumCriticalFalseApprovals, 0);
  assert.deepEqual(policy.authority.preauthorizedEnvelopeRefs, []);
  assert.ok(policy.authority.neverAllowed.includes("expand_own_authority"));
  assert.ok(policy.authority.neverAllowed.includes("impersonate_human_principal"));

  assert.equal(decision.mode, "shadow");
  assert.equal(decision.result.applied, false);
  assert.equal(decision.result.appliedDecision, null);
  assert.equal(decision.externalAction.requested, false);
  assert.equal(decision.externalAction.performed, false);
  assert.equal(decision.externalAction.receiptRef, null);
  assert.notEqual(decision.audit.producerRole, decision.audit.supervisorRole);
  assert.notEqual(decision.audit.qaRole, decision.audit.supervisorRole);
});

test("shadow Supervisor decision rejects applied and externally performed outcomes", () => {
  const decision = structuredClone(readJson("examples/supervisor-shadow-decision.example.json"));
  decision.result.applied = true;
  decision.result.appliedDecision = "accept_internal";
  decision.externalAction.requested = true;
  decision.externalAction.performed = true;
  decision.externalAction.executionEnvelopeRef = "envelope-synthetic-01";
  decision.externalAction.receiptRef = "receipt-synthetic-01";

  const errors = validateContractInstance(
    workspaceRoot,
    "extensions/supervisor-decision-record.schema.json",
    decision,
    "adversarial shadow decision"
  );

  assert.ok(errors.some((error) => error.includes("result.applied")));
  assert.ok(errors.some((error) => error.includes("result.appliedDecision")));
  assert.ok(errors.some((error) => error.includes("externalAction.performed")));
  assert.ok(errors.some((error) => error.includes("externalAction.receiptRef")));
});
