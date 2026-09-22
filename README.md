# AI Marketing Operations Framework

This repository template packages the portable controls, contracts, fixtures, and operating guidance for an AI-assisted marketing team. It gives every new business the same safe starting capability without copying another business's claims, creative work, customer records, destinations, or operating history.

It is an operating framework, not an autonomous publishing or advertising system.

## What the first release can do

| Workflow | Purpose | Allowed output | Operating state |
| --- | --- | --- | --- |
| W0 Readiness | Establish a tenant's ProductTruth, ownership, data boundary, risk log, and channel capability record. | Readiness record | Draft-only |
| W1 Research to plan | Turn approved public sources and consented research summaries into hypotheses, briefs, and measurement plans. | Versioned brief | Draft-only |
| W2 Content factory | Create, lint, and independently review content concepts and asset briefs in the tenant's required locales. | Internal asset package | Draft-only |
| W6 Learning to product | Convert approved aggregate signals into learning notes and product-ticket drafts. | Aggregate learning note | Draft-only |

The first release does **not** publish, schedule, send, contact people, create advertising campaigns, upload audiences, spend money, modify a product, or access an execution credential.

## Start safely

1. Adopt a reviewed upstream release tag by vendoring its clean export into the private tenant repository as `framework/`; keep the vendored framework unmodified. See [Versioning and Upgrades](docs/VERSIONING_AND_UPGRADES.md).
2. Create a separate private tenant workspace as `tenant/` with `cd framework` and `npm run tenant:init -- --tenant <tenant-slug> --output ../tenant`, then complete [Tenant Onboarding](docs/TENANT_ONBOARDING.md).
3. Replace the placeholder ownership rule in `CODEOWNERS` before enabling protected branches.
4. Run the baseline checks:

   ```sh
   npm install
   npm run validate
   npm test
   npm run tenant:two:validate
   ```

5. Run W0 before W1, W1 before W2, and W2 before any human review of an external-material candidate. Use [Artifact Examples](docs/ARTIFACT_EXAMPLES.md) only after ProductTruth and the locale policy are reviewed.

When W0 is complete, validate every W1/W2 artifact before its human review and prepare a bounded internal job manifest when an owner-configured AI runtime is used:

```sh
npm run tenant:artifact:validate -- --tenant-root <private-tenant-directory>
npm run tenant:job:prepare -- --tenant-root <private-tenant-directory> --workflow W2_content_factory --job-id <safe-id> --output <private-tenant-directory>/jobs/<safe-id>.json
```

Job preparation writes a non-secret internal manifest only. It does not call an AI provider, publish material, or access a channel credential.

When an owner has produced a non-synthetic, privacy-reviewed aggregate learning export, validate it from `framework/` before any comparison:

```sh
npm run tenant:learning:validate -- --tenant-root ../tenant --export-path ../tenant/learning/exports/<aggregate-learning-export>.json
```

This command is read-only. It checks W0 readiness, privacy status, opaque alias, and contract/version alignment. It never sends, publishes, or executes a campaign.

A passing baseline check proves that the portable framework and its synthetic fixtures conform to the declared contracts. It does not prove a tenant claim, approve a communication, or authorize external execution.

## Tenant isolation is mandatory

Each business has its own:

- private tenant workspace and repository;
- backend project and analytics property;
- sender domain and secret store;
- BrandPack, ProductTruth, sources, creative assets, approvals, and execution receipts.

Do not place two businesses in a shared database with only a tenant label. The only cross-business input permitted by this framework is an approved, de-identified, aggregate `LearningExport` record. See [Two-Business Pilot](docs/TWO_BUSINESS_PILOT.md).

## Readiness gates

| Gate | Proves | Does not authorize |
| --- | --- | --- |
| F1 Framework quality | Core contracts, controls, fixtures, and tests are sound. | Any tenant claim or external action |
| T1 Tenant ProductTruth | A specific claim has current evidence for a named business, feature, build, locale, and destination. | Channel execution or paid media |
| E1 Public-material candidate | A versioned asset has evidence and human editorial, privacy, and ownership review. | Publishing without channel authorization |
| E2 Controlled publish | A channel has preflight, approval, receipt, and rollback controls. | Paid media |
| E3 Paid media | Budget, attribution, consent, product evidence, and a kill switch are ready. | Unbounded spend or automated optimization |

No agent may advance a gate on its own. [Governance](docs/GOVERNANCE.md) defines the required human decisions.

## Repository map

| Path | Role |
| --- | --- |
| `packages/growth-contracts` | Versioned schemas for ProductTruth, briefs, asset packages, QA, approvals, receipts, and aggregate learning exports. |
| `packages/growth-core` | Draft-only agent catalog, workflows, gates, metrics, approval state machine, export policy, and this starter template. |
| `packages/growth-fixtures` | Synthetic conformance fixtures and an intentionally incomplete tenant onboarding template, including the private-tenant scaffold. |
| `scripts` | Portable validation, adversarial tests, and clean-room export tooling. |
| `AGENTS.md` and `skills` | Reproducible routing guidance and the eight bounded agent skills for a local AI runtime. |
| `docs` | Operating instructions for a new tenant, governance, the two-business pilot, and version adoption. |
| `.github/workflows/framework-quality.yml` | Pull-request and main-branch checks for the framework and synthetic tenant demo only. |

## Documentation order

1. [Start Here](docs/START_HERE.md)
2. [Tenant Onboarding](docs/TENANT_ONBOARDING.md)
3. [Artifact Examples](docs/ARTIFACT_EXAMPLES.md)
4. [Operating Model](docs/OPERATING_MODEL.md)
5. [Governance](docs/GOVERNANCE.md)
6. [Two-Business Pilot](docs/TWO_BUSINESS_PILOT.md)
7. [Versioning and Upgrades](docs/VERSIONING_AND_UPGRADES.md)
8. [Contributing](CONTRIBUTING.md)
9. [License Decision](LICENSE_DECISION.md)

## When this framework is ready for a new business

The new business has the same initial marketing capability when it has completed W0, passed the portable checks, installed the same versioned framework contracts and quality rubric, and assigned its own owners. It does not need the same product, audience, or message. It must not reuse another tenant's facts or materials to appear equivalent.
