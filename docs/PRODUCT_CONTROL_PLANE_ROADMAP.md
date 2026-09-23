# Product and control-plane roadmap

## Product decision

The AI Marketing Department should sell an operating system around a Coding Agent subscription, not another model endpoint. The local framework supplies business memory, specialist roles, repeatable workflows, deterministic checks, independent QA, evidence lineage, manager decisions, and experiment learning. The customer's existing Coding Agent supplies model execution.

The product promise is **no separate LLM API key for the default Coding Agent handoff**. This is not a promise of free or unlimited model use; the customer's Coding Agent remains subject to its own subscription, login state, limits, and terms.

## Why a customer would pay

A general Coding Agent can write a prompt or draft. Recreating this system requires the customer to design and maintain all of the following:

- a complete role and sub-agent operating model;
- versioned workflows, stop conditions, retry rules, and human decision points;
- business, brand, ProductTruth, audience, journey, experiment, and channel memory;
- deterministic lint, claim checks, provenance, independent QA, and artifact-hash binding;
- manager-friendly work orders and review bundles;
- comparable experiment and learning records across time;
- security, privacy, tenant isolation, and release validation;
- continuous updates as platforms, policies, and practices change.

The paid value is the maintained system, calibrated evaluators, accumulated business learning, and low-skill user experience. Prompt files alone are easy to copy and are not a durable moat.

## Local alpha

The first release remains local and single-tenant:

1. A manager completes the guided business workspace.
2. Canvas creates a bounded work order.
3. The manager copies the handoff into a Coding Agent session they already control.
4. The Coding Agent claims the job, uses the declared role/sub-agent workflow, and creates internal artifacts.
5. A separately mapped QA role reviews the exact artifact hashes.
6. Canvas shows the artifact, evidence, lint, QA verdict, and receipt.
7. The manager accepts, requests revision, or blocks the internal candidate.

No account, cloud dependency, provider credential, publishing, outreach, advertising connection, audience upload, or spend is required for this alpha.

## Paid control plane after pilot proof

An online account should add value without becoming the LLM execution layer. The first control-plane services should be:

| Service | Customer value | Data boundary |
| --- | --- | --- |
| Signed framework releases | Safe, reviewed updates to workflows, skills, schemas, and evaluators | Release metadata only |
| Entitlement and device registration | Simple installation and access for a small monthly fee | Account, plan, device public key |
| Versioned specialist packs | Higher-quality domain workflows that would be costly to recreate | Pack version and install state |
| Evaluation and benchmark packs | Consistent quality scoring and regression detection | Local results by default |
| Opt-in aggregate learning | Cohort benchmarks and recommended workflow improvements | Validated aggregate, de-identified LearningExport only |
| Backup/sync | Restore configuration across the customer's devices | Explicitly selected encrypted configuration; no raw customer content by default |
| Support diagnostics | Faster recovery from failed jobs and upgrades | User-approved redacted diagnostics only |

Raw tenant workspaces, customer identifiers, private conversations, prompts, model credentials, and channel credentials must remain local or in a tenant-controlled private system unless a later, explicit product contract changes that boundary.

## Commercial shape

Test a low-friction companion price rather than competing with the Coding Agent subscription. A starting hypothesis is USD 5 per month, or roughly 5–10% of the customer's existing agent subscription, with a free local evaluation period. Price should be validated against:

- time to first reviewable artifact;
- manager comprehension without technical help;
- first-pass QA and revision rate;
- hours saved per campaign cycle;
- repeat weekly use;
- support minutes per tenant;
- willingness to pay after the user has completed real work.

Do not meter model tokens or proxy a subscription. Entitlement should cover framework updates, specialist packs, evaluators, aggregate benchmarks, and support services.

## Defensible assets

Build defensibility through assets that improve with legitimate use:

- evaluator datasets and failure taxonomies;
- anonymized workflow-performance benchmarks with minimum cohort thresholds;
- versioned domain packs and migration tooling;
- evidence-bound business memory and experiment history;
- manager decision and revision patterns;
- reliable integrations added only after authority, consent, and rollback gates exist;
- an update and compatibility system that keeps local workspaces usable across framework versions.

Avoid artificial lock-in. Customers must be able to inspect and export their local data and artifacts. Retention should come from superior outcomes, lower operating effort, and trusted updates.

## Release sequence

### Phase 1 — Local proof

- One real first-tenant workspace.
- One real, separately onboarded Business B workspace after owner inputs exist.
- Manual Coding Agent handoff.
- Independent QA and verified review bundle.
- Local reliability, usability, and workflow-quality measurement.

### Phase 2 — Managed updates

- Account and entitlement service.
- Signed release manifest and device public-key enrollment.
- Framework update check, compatibility report, migration preview, and rollback.
- Specialist and evaluator pack delivery.

### Phase 3 — Opt-in learning network

- Local LearningExport validation.
- Explicit owner preview and consent before upload.
- Minimum cohort enforcement and aggregate-only comparison.
- Workflow recommendations with source version and confidence.

### Phase 4 — Controlled online operations

- Hosted manager access only after local product-market evidence.
- Tenant-controlled storage choices and encryption.
- Channel connectors only behind explicit authority, preflight, rollback, receipt, budget, and incident gates.

## Go/no-go evidence

Do not market conversion improvement until external campaigns and telemetry are authorized and measured. Local alpha can prove only workflow conformance, artifact quality, revision efficiency, manager usability, reliability, and willingness to pay. Conversion claims require a later controlled experiment with a working destination, consented measurement, comparable cohorts, and owner-approved external execution.
