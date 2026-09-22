# W1 and W2 Artifact Examples

These examples are fictional internal records. They demonstrate structure and review behavior; they do not assert a feature, authorize a channel, or provide copy for a real product.

## Locale policy comes first

Use exactly the locale keys required by `brand-pack.json.audienceLanguage.requiredContentLocales`. A tenant with one required locale supplies one complete copy object. A tenant with several required locales supplies one complete object for each. Do not apply a fixed two-language convention when the tenant's own locale policy is different.

The examples below use `en-GB` only to make the shape readable. Replace it with the tenant's reviewed locale set and have a locale reviewer approve the replacement.

## Positive W1: internal Content Brief

Create this only after the claim reference resolves to current, internal-only ProductTruth for the tenant.

```json
{
  "id": "brief-first-value-001",
  "tenantId": "example-ai",
  "hypothesis": "A specific evidence-bound invitation may help an internal reviewer understand the first product value.",
  "claimRefs": ["guided-planning-claim"],
  "formats": ["static"],
  "destinationId": "internal-review",
  "primaryMetric": "qualified-internal-feedback",
  "guardrails": [
    "draft_only_no_external_action",
    "claim_hard_fail",
    "no_sensitive_targeting"
  ]
}
```

Save it under `tenant/briefs/`. It is ready for internal W2 drafting only when `guided-planning-claim` exists, has current evidence, and is allowed on an internal-draft surface.

## Rejected W1: claim or guardrail mismatch

The following is an intentionally rejected delta, not a record to keep in the tenant registry:

```json
{
  "claimRefs": ["unverified-outcome-claim"],
  "destinationId": "public-launch",
  "guardrails": ["publish_when_ready"]
}
```

It is blocked because the claim does not resolve to ProductTruth and the guardrails do not preserve the draft-only boundary. The correct repair is to obtain current ProductTruth and restore internal-only guardrails, not to lower validation.

## Positive W2: internal concept/copy package

This is a valid pre-QA internal draft linked to the W1 example. It uses one required locale. It is deliberately not an approved candidate and must remain inside `tenant/content-drafts/`.

```json
{
  "id": "asset-first-value-001",
  "tenantId": "example-ai",
  "briefId": "brief-first-value-001",
  "version": "1.0.0",
  "artifactKind": "concept_copy_package",
  "status": "draft_internal",
  "lifecycleState": "draft_internal",
  "format": "static",
  "claimRefs": ["guided-planning-claim"],
  "copy": {
    "en-GB": {
      "headline": "Clarify one useful next step.",
      "body": "Use a focused internal prompt to examine the next step you choose.",
      "caption": "Fictional internal draft for framework review only.",
      "cta": "Review internally",
      "altText": "A readable internal concept about choosing a next step."
    }
  },
  "visualBrief": {
    "source": "tenant-owned internal visual direction",
    "reference": "brand-pack.json",
    "rightsStatus": "approved_internal_reference",
    "provenanceStatus": "draft_internal",
    "accessibility": { "altTextProvided": true }
  },
  "destination": { "id": "internal-review", "status": "internal_review" },
  "measurement": {
    "hypothesis": "A focused invitation may clarify the first product value.",
    "primaryMetric": "qualified-internal-feedback",
    "denominator": "reviewed internal audience",
    "guardrails": ["draft_only_no_external_action"]
  },
  "productionRecord": {
    "skillVersion": "1.0.0",
    "source": "content_studio",
    "modelVersion": "tenant-configured-runtime-or-manual-draft",
    "timeEstimateMinutes": 10,
    "costUsd": 0,
    "costStatus": "not_billed"
  },
  "qa": {
    "automatedVerdict": "not_run",
    "independentQaStatus": "not_run",
    "hardFailureCodes": [],
    "softScores": {},
    "reviewerRole": "independent_qa",
    "repairCycles": 0
  },
  "approval": {
    "status": "not_submitted",
    "artifactHash": null,
    "targetChannel": null,
    "expiry": null
  },
  "externalReadiness": {
    "status": "blocked",
    "blockingGates": ["independent_qa", "human_review", "execution_envelope"]
  }
}
```

Before changing this record to `qa_pass_pending_human`, run the tenant artifact validator, complete independent QA with the full quality rubric, calculate the reviewable artifact hash, and add a standalone QA verdict in `tenant/approvals/` that explicitly declares the asset ID, version, and hash. Any change to copy, visual brief, claim reference, destination, channel, schedule, or budget invalidates the review.

## Rejected W2: external state or unsupported promise

The following is an intentionally rejected delta:

```json
{
  "lifecycleState": "external_candidate",
  "destination": { "id": "external-site", "status": "live" },
  "copy": {
    "en-GB": {
      "headline": "Guaranteed outcome.",
      "body": "An unsupported promise in a draft-only workflow."
    }
  }
}
```

It is blocked because W1/W2 cannot move beyond `qa_pass_pending_human`, the destination implies external execution, and the promise is not evidence-bounded. Keep the lifecycle and destination internal, remove the unsupported wording, and re-run independent QA.

## Validate without executing

From `framework/`, validate the private tenant records without invoking a model, connecting a channel, or sending material:

```sh
npm run tenant:artifact:validate -- --tenant-root ../tenant
```

An internal validation pass confirms only that the W1/W2 records meet the framework's internal boundary. External readiness remains blocked.
