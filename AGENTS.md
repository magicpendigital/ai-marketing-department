# AI Marketing Operations Agent Guide

This guide makes the portable framework operational for an AI agent in a new business repository. Start by reading `README.md`, `docs/START_HERE.md`, `docs/GOVERNANCE.md`, and the tenant's private onboarding pack. Do not infer missing business facts from another tenant, a general AI model, or a previous project.

## Operating boundary

The framework prepares internal research, briefs, content packages, QA records, journey hypotheses, and aggregate learning notes. It does not grant authority to publish, schedule, send, recruit, connect a channel, create a campaign, upload an audience, spend money, access a secret, or alter a product.

Read the matching skill under `skills/<skill-id>/SKILL.md` before beginning a workflow. A runtime may install or load these skills from the repository according to its own discovery rules; the operating requirements remain the same even when an agent reads the files directly.

## Route a request

| Requested outcome | Workflow | Lead agent | Required skill | Inputs | Internal output | Stop before |
| --- | --- | --- | --- | --- | --- | --- |
| Establish a new business boundary | W0 | Growth orchestrator + ProductTruth claim guard | `growth-readiness` | Tenant config, BrandPack, BusinessPack, ProductTruth, privacy map, channel map, journey map | Readiness record | Any external action or assumption about a claim |
| Learn audience jobs or objections | W1 | Research and JTBD + Positioning experiment | `growth-research`, `growth-positioning` | Approved source register, sanitized summaries, ProductTruth, journey/event map | Research hypothesis and versioned brief | Outreach, sensitive inference, or a market claim presented as fact |
| Produce internal content alternatives | W2 | Content studio | `growth-content-factory` | Accepted brief, ProductTruth, BrandPack, required locales, owned/licensed asset references | Concept/copy package | Self-approval, publish, send, schedule, or paid media |
| Check a draft independently | W2 | Independent QA | `growth-quality-gate` | Exact asset version, lint result, evidence, BrandPack, provenance | QA verdict or repair request | Overriding a hard failure |
| Plan a future channel package | Deferred W3–W5 | Distribution planner | `growth-execution-preflight` | A separate future execution envelope | Internal preflight checklist | Channel login, OAuth, posting, sending, or spending |
| Analyze aggregate learning | W6 | Journey measurement | `growth-journey-measurement`, `growth-learning-synthesis` | Approved aggregate LearningExport, QA outcomes, experiment and metric versions | Learning note and ticket draft | Individual analysis or automatic change |

## Use sub-agents safely

The configured cells may delegate only the minimum input needed for a bounded task:

- **Readiness:** evidence-reference, identity-boundary, and capability-matrix checks.
- **Research:** source-register review, JTBD synthesis, and research-risk checks.
- **Content:** brief expansion, locale editing, and visual-accessibility checks.
- **Quality:** claim/evidence, safety/privacy, and rights/locale checks.
- **Learning:** denominator, aggregate-privacy, and hypothesis-synthesis checks.

The lead agent owns the handoff record. A sub-agent must return its finding, source references, confidence or uncertainty, blocker, and next required human decision. A sub-agent cannot approve an artifact or perform an external action.

## Reproducible local operating sequence

1. Run `npm run validate` and `npm test` in the framework repository.
2. Initialize a separate tenant folder with `npm run tenant:init -- --tenant <slug> --output <private-tenant-directory>`.
3. Complete the tenant's own facts and ownership records. Run `npm run tenant:validate -- --tenant-root <private-tenant-directory>` until it returns `ready_for_internal_drafts`.
4. Prepare a bounded internal work manifest with `npm run tenant:job:prepare -- --tenant-root <private-tenant-directory> --workflow W2_content_factory --job-id <safe-id> --output <private-tenant-directory>/jobs/<safe-id>.json`.
5. Use the matching skill to create an internal artifact. Run `npm run tenant:artifact:validate -- --tenant-root <private-tenant-directory>` before requesting human editorial review.
6. Keep artifact states at or before `qa_pass_pending_human`, preserve the QA verdict, and route human decisions through the tenant owner.

The job-preparation command writes a portable, non-secret manifest. It does not call an AI provider. An owner-configured runtime may use the manifest only after it has separately established its own credential and privacy controls; it must still return an internal draft for lint, independent QA, and human decision.

## Escalate or stop

Stop and record a blocker when an input has a missing or expired ProductTruth reference, brand or cross-tenant leak, direct identifier, sensitive inference or targeting, unknown source rights, missing locale coverage, unreviewed destination, missing rollback/receipt plan, unresolved consent boundary, or request for external execution. Do not rewrite evidence to make a blocker disappear.
