# Tenant Onboarding

Tenant onboarding gives a business its own controlled marketing workspace while preserving a common framework capability. A tenant is not a folder label. It is an independent identity, evidence base, data plane, approval chain, and operating history.

## 1. Create the identity boundary

Choose a stable, non-personal tenant identifier using lowercase letters, digits, and hyphens. Record the tenant's owned brand tokens before content work begins.

- **Owned brand tokens:** words and identifiers belonging to this business that local QA should protect.

A real tenant does **not** need a real identity token from another business. The field named `knownForeignBrandTokens` exists to support a negative isolation test. For W0, put a reviewed, non-production test sentinel in that field and use the same sentinel in all three local identity-boundary records. It must not be a counterpart's production brand, customer-facing identifier, secret, or shared operating detail.

The test exception is deliberately narrow: a two-tenant synthetic conformance run may inject one tenant's owned test marker into an ephemeral copy of the other tenant's fixture, then verify `cross_tenant_leak`. Do not persist that marker in either real tenant configuration, commit it, or use it in normal draft production.

## 2. Establish an independent data plane

Each tenant requires separate infrastructure and ownership for:

| Area | Minimum boundary |
| --- | --- |
| Application/backend | Separate project or equivalent hard isolation |
| Analytics | Separate property and event governance |
| Sender identity | Separate domain and verified owner |
| Access material | Separate secret store and least-privilege access |
| Business workspace | Separate private repository or access-controlled workspace |
| Approval and execution records | Tenant-owned storage with a distinct audit trail |

Do not substitute a shared database plus a tenant label for these boundaries. Do not share a sender identity, access material, tracking property, or approval record between businesses.

## 3. Build the onboarding pack

Start from the synthetic fixture structure and create the following tenant-owned artifacts in the private workspace.

| Artifact | Required content | Accountable owner |
| --- | --- | --- |
| Tenant configuration | Tenant identifier, isolation boundary, onboarding status, owned brand tokens, and a non-production isolation-test sentinel | Business owner |
| BusinessPack | Market, locales, value hypothesis, activation event, permitted channels, owner map, incident contact role | Business owner |
| ProductTruth | Feature/build/platform evidence, claims, prohibited claims, allowed surfaces, expiry | Product owner |
| BrandPack | Voice, terminology, visual-rights policy, localization, accessibility, prohibited framing | Brand and editorial owner |
| Role mapping | Named tenant roles or approved agents mapped to each portable capability, with separation of author and QA | Tenant lead |
| Onboarding manifest and readiness record | Required W0 evidence, readiness state, deferred workflows, and external-gate status | Tenant lead |
| Consent and data map | Allowed data classes, collection purpose, retention/deletion policy, opt-out route | Privacy owner |
| Event ownership map | Event name, purpose, schema owner, consent dependency, aggregation rule | Measurement owner |
| Journey map | Entry, intended value moment, non-sensitive drop-off hypothesis, aggregate event references, and decision guardrails | Journey or product owner |
| Channel capability matrix | Channel status, preflight availability, rollback path, receipt availability, owner | Channel owner |
| Research source register | Source class, rights/status, review date, use boundary | Research owner |
| Risk log | Claim, privacy, accessibility, rights, operational, and reputation risks | Risk owner |
| Internal registries | Empty brief, content-draft, approval, and learning-note registries until later work earns entry | Growth and editorial owners |

Use references and version identifiers rather than copying proprietary source text into the shared framework.

## 4. Make ProductTruth operational

ProductTruth is the tenant's claim-control source. It must answer, for every candidate claim:

1. Which feature, build, platform, locale, and user-facing surface does it describe?
2. What evidence supports it, who reviewed it, and when does that evidence expire?
3. Which exact wording is allowed, and which wording is prohibited?
4. Is the feature internally available, released, limited, paused, or blocked?
5. What must happen when the evidence, destination, or copy changes?

An AI-generated draft may summarize only allowed, current claims. It must block a claim that has missing, stale, ambiguous, or ownerless evidence.

## 5. Define a privacy-safe measurement boundary

Define the activation event and metrics before creating a content experiment. The portable metric contract supports aggregate counts, consented cohort aliases, version identifiers, and bounded funnel/cost buckets. It does not accept direct identifiers, source conversation text, reflective records, personal profile attributes, image uploads, or inferred sensitive traits.

Only a privacy-reviewed, aggregate `LearningExport` can leave the tenant workspace. It must use the approved cohort-size bucket, an opaque tenant alias, and a versioned metric definition.

## 6. Complete the W0 review

W0 passes only when the following are true:

- all onboarding-pack artifacts exist, are current, and have an accountable owner;
- ProductTruth includes current evidence and explicit prohibited claims;
- data-plane isolation is independently checked;
- the activation event and measurement boundary are approved;
- the journey map links every stage only to approved aggregate event definitions;
- the channel capability matrix says every non-ready channel is blocked;
- the risk log names a stop condition and incident owner;
- an isolation-sentinel negative test and an unsupported-claim negative test both block.

Record the result as `ready_for_internal_drafts`, `blocked`, or `needs_revision`. None of these states permits public execution.

## 7. Re-onboard when the facts change

Repeat the affected W0 checks when a tenant changes brand, product scope, data collection, market/locale, owner, channel, destination, or framework version. Expired ProductTruth immediately blocks the associated claim until a product owner provides current evidence.
