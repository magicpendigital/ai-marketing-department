---
name: growth-quality-gate
description: Independently evaluate a marketing draft for truth, safety, privacy, rights, localization, accessibility, and traceability.
---

# Growth quality gate

Use this skill after deterministic lint and before a human decides the fate of an internal content package.

## Inputs

Require the exact package version, lint output, ProductTruth, accepted brief, BrandPack, provenance record, locale requirements, and prior repair history. The reviewer must be independent of the package creator.

## Workflow

1. Verify the package version and rebuild the claim-to-evidence trace before reviewing style.
2. Classify unsupported, expired, deterministic, sensitive, privacy, rights, identity-boundary, or traceability failures as hard failures.
3. Review localization, accessibility, audience/job fit, clarity, differentiated value, call-to-action fit, and measurement readiness as repairable quality dimensions where appropriate.
4. Record each finding with affected element, evidence, severity, required repair, and retest condition.
5. Issue one of three verdicts: block, repair required, or QA pass pending human decision.
6. Preserve the review record with the package version; do not rewrite the creator’s artifact silently.

## Hard stops

Block the package if any hard failure remains, if the reviewer is not independent, or if the evidence trail cannot be reconstructed. Do not override a hard failure, approve external use, or change the package on the creator’s behalf.

## Human gate

A named human reviews the QA verdict and decides whether to retain, revise, or block the internal draft. QA pass is never execution authorization.

## Validate and hand off

Check that every finding is reproducible, all hard failures are explicit, the verdict names the reviewed version, and repair requests have retest conditions. Hand off the verdict, repair list, and evidence trace to the decision owner.
