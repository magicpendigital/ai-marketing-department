# Tenant Marketing AI Scaffold

Use this directory to onboard one new AI business into the portable marketing framework. It is intentionally fictional and cannot run an external campaign by itself.

Every occurrence of `__TENANT_SLUG__` must be replaced with the business's lowercase, hyphenated identifier before the tenant begins W0. Replace the other `__PLACEHOLDER__` values with evidence owned by that tenant. Do not copy a brand, ProductTruth record, customer data, source material, asset, destination, credential, approval record, receipt, or prompt from another tenant.

`__ISOLATION_TEST_SENTINEL__` is the one exception: it is a local, non-production test marker used only to prove that a foreign marker would be blocked. Replace it with a reviewed sentinel that is not another business's actual brand or customer-facing identifier. A real tenant never needs a real identity token from another tenant.

## What this scaffold provides

| File | Purpose | Required owner before W0 passes |
| --- | --- | --- |
| `tenant-config.json` | Tenant identifier, isolation boundary, and data-plane rule | Business owner |
| `brand-pack.json` | Brand identity, voice, accessibility, and forbidden language | Brand or product owner |
| `business-pack.json` | Market, value hypothesis, activation event, channel capability, data-plane boundary | Product and growth owner |
| `product-truth.json` | Evidence-bound feature and claim inventory | Product evidence owner |
| `role-mapping.json` | Tenant roles mapped to the 8 portable framework capabilities | Tenant lead |
| `readiness.json` | Sprint scope, tenant isolation, and blocked external gates | Tenant lead |
| `risk-register.json` | Claim, privacy, IP, consent, measurement, and execution risks | Security or product owner |
| `privacy/consent-data-map.json` | Permitted data classes, collection boundary, retention and deletion requirements | Privacy owner |
| `channels/capability-matrix.json` | Disabled channel inventory, owner, preflight, rollback and receipt requirements | Channel owner |
| `journey/journey-map.json` | First-value journey stages, aggregate event references, drop-off hypotheses and decision guardrails | Journey or product owner |
| `research/source-register.json` | Permitted evidence sources and prohibited inputs | Research owner |
| `research/interview-kit.json` | Consent-first internal research plan | Research owner |
| `measurement/event-ownership-map.json` | Aggregate event definitions and data boundaries | Product analytics owner |
| `campaigns/experiment-brief.json` | One internal draft experiment hypothesis | Growth owner |
| `learning/learning-note.json` | Cross-tenant-safe learning rules | Growth analytics owner |
| `briefs/index.json` | Empty internal registry for reviewed experiment briefs | Growth owner |
| `content-drafts/index.json` | Empty internal registry for concept/copy packages | Content and QA owners |
| `approvals/index.json` | Tenant-private review registry with no execution authority | Human approval owner |
| `onboarding-manifest.json` | Readiness checklist and review order | Tenant lead |

## Safe onboarding sequence

1. In the release-tagged vendoring topology, copy this `scaffold` directory into the new business's private `tenant/` directory alongside the unmodified `framework/` snapshot.
2. Replace every placeholder. Keep `isSynthetic` true until each business fact and evidence reference has been reviewed.
3. Complete the separate backend, analytics property, sender domain, credential store, and approval ownership for the tenant. A shared database distinguished only by a tenant column is not sufficient for this pilot.
4. Fill ProductTruth only with features that have current, reviewable evidence. Map all eight framework capabilities in `role-mapping.json`, then complete `readiness.json` and `risk-register.json`. Keep unsupported claims blocked. Use the isolation-test sentinel only in a negative test; do not insert a real foreign-tenant identifier into any normal tenant artifact.
5. Have the required owners review `onboarding-manifest.json`. W0 is blocked until every required item is `complete` and the tenant's human approval owner is assigned. Empty brief, content-draft, and approval registries remain internal until their later gates are satisfied.
6. Run the portable framework checks from the portable framework root. After initialization, validate the private tenant directory explicitly:

   ```powershell
   npm run validate
   npm test
   npm run tenant:validate -- --tenant-root <private-tenant-directory>
   ```

7. Add tenant-specific validation only after the tenant has a private repository, ProductTruth evidence, and a real owner. Keep all content in `draft_internal` and all channel capabilities disabled during Sprint 01.

## Equal capability across businesses

Each business receives the same 8 generic agent roles, W0/W1/W2/W6 workflows, quality gates, approval state machine, privacy constraints, adversarial fixtures, and LearningExport contract from `growth-core`. A tenant may supply its own brand and product evidence, but may not modify common safety gates to make an unsupported claim or an external action possible.

The portable framework is versioned independently from tenant data. Pin the same reviewed `growth-core` version for every business in a comparison cohort. Cross-tenant comparison may use only approved, aggregate, de-identified `LearningExport` records with the same workflow and metric-definition versions.

## Sprint 01 boundary

This scaffold permits internal research planning, content briefs, QA, and instrumentation definitions only. It does not authorize publishing, outreach, account connection, ad creation, budget spend, lead collection, analytics ingestion, or messages to any person. Those actions require later evidence, human approval, working destination and telemetry checks, and an execution envelope in the tenant's private repository.

## Prohibited data and materials

Do not place customer identifiers, contact details, private conversations, journal content, health or sensitive-trait inferences, uploaded images, raw ad-platform data, raw tracking parameters, provider keys, OAuth tokens, or unlicensed source material in this directory. Store any real evidence and operating secrets only in the tenant's separate private systems.

## Before first external activity

The tenant lead must confirm that ProductTruth evidence is current, the destination and consent flow work, the relevant channel is authorized, the data plane is isolated, the content has human approval, QA has no hard failures, budget and incident owners are assigned, and aggregate event telemetry is verified. Until then, retain `draft_only_no_external_action`.
