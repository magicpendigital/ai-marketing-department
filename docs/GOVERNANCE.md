# Governance

Governance keeps a reusable AI-marketing framework useful without turning it into an unbounded execution system. Authority is separated by decision type: creating a draft, asserting a product fact, approving material, operating a channel, and spending money are different decisions with different owners.

## Authority model

| Decision | May prepare | Must approve | May not be delegated to an agent |
| --- | --- | --- | --- |
| Research hypothesis | Research and positioning roles | Research-scope owner | Contacting people or treating a hypothesis as market fact |
| Product claim | ProductTruth claim guard | Product owner | Inventing or extending evidence |
| Content draft | Content studio | Editorial owner for human review | Self-approval or external delivery |
| QA verdict | Independent QA | QA or policy owner for an override | Ignoring a hard failure |
| Channel preflight | Distribution planner | Channel owner | Login, scheduling, posting, sending, or receipt collection |
| Learning note | Journey measurement | Product owner | Individual-level analysis or automatic product change |
| Paid-media proposal | Planning roles | Budget and channel owners | Spend, bid changes, audience upload, or optimization |

## Gate model

| Gate | Required evidence | Human decision | Result if missing |
| --- | --- | --- | --- |
| F1 Framework quality | Portable validation, tests, fixture coverage, export-boundary check | Framework owner accepts the version | Framework remains unusable |
| T1 Tenant ProductTruth | Current build/feature evidence, allowed copy, prohibited claims, expiry | Product owner accepts or blocks the claim | Claim is blocked |
| E1 Public-material candidate | Versioned asset, claim references, rights, accessibility, editorial and privacy review | Named reviewers decide candidate status | Asset remains internal |
| E2 Controlled publish | Channel preflight, version-bound approval, receipt plan, rollback path | Channel owner approves a bounded execution envelope | No publish or send |
| E3 Paid media | Product evidence, consented attribution, budget cap, kill switch, receipt and incident path | Budget and channel owners approve | No paid action |

The first framework release only supports work through `qa_pass_pending_human`. It has no authority to cross E1, E2, or E3.

## Data classification and movement

| Class | Examples | Allowed location |
| --- | --- | --- |
| Portable public/synthetic | Contracts, controls, synthetic fixtures, generic documentation | Portable framework repository |
| Tenant sanitized configuration | Tenant identifier, owner roles, approved public references, bounded channel capability | Tenant private workspace |
| Tenant restricted material | Customer records, private conversation source records, reflective source records, personal profile data, image submissions, proprietary prompts, access material, and execution receipts | Tenant-controlled storage only |
| Cross-tenant learning | Privacy-reviewed aggregate learning export with opaque alias and approved cohort bucket | Comparison workspace only |

Restricted material cannot be copied into the portable repository, another tenant workspace, prompt examples, fixtures, logs, review screenshots, or pull requests.

## Required records

Keep versioned records for:

- ProductTruth evidence and expiry;
- brief, asset, QA, approval, and receipt identifiers;
- owner decisions, reason codes, timestamps, and invalidation events;
- data classification and privacy-export verdict;
- channel capability, rollback path, and incident owner;
- framework version adopted by each tenant.

An approval is invalid when copy, visual brief, claim reference, destination, target channel, schedule, or budget changes.

## Change control

Framework changes require a bounded pull request, independent review, passing validation, and a rollback note. Contract, metric, state-machine, lint, export-policy, or quality-threshold changes also require an adversarial test that shows both intended acceptance and intended block behavior.

Tenant changes require the tenant's own owner review. A portable-framework merge does not alter a tenant's content, ProductTruth, channel capability, analytics, or execution permissions.

## Incident and containment

On a suspected claim, privacy, rights, cross-tenant, or execution-control failure:

1. Stop the affected workflow and mark the artifact blocked.
2. Prevent further distribution or export of the affected material.
3. Preserve the minimum audit evidence needed for investigation in the tenant-controlled workspace.
4. Notify the incident owner and relevant product, privacy, editorial, or channel owner.
5. Record the root cause, corrective control, test case, and re-entry decision.

Do not replace evidence silently, delete audit traces to hide the issue, or re-run the workflow until the responsible owner accepts the corrective action.

## Governance review checklist

Before a tenant asks to move beyond draft-only work, confirm that the requested gate has named owners, current evidence, versioned artifacts, a rollback path, a data-boundary review, and a manager-testable stop condition. If any of these are absent, the correct state is blocked.
