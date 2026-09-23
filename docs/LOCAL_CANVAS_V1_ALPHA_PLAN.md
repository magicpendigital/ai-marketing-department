# Local Canvas v1.0.0-alpha.1 plan

Status: implementation, integrity checks, security review, responsive interaction QA, and visual comparison passed. The first private pilot has produced and accepted one internal artifact; that decision grants no external action authority. A second business remains blocked until real owner-reviewed inputs replace the synthetic fixture.

## Decision

Build a local-first Canvas that turns the existing portable growth framework into a manager-facing operating system. The Canvas must not request an LLM API key. Its default runtime path is a structured handoff to a Coding Agent the owner already uses. Subscription-backed CLI automation may be enabled only after runtime capability and login checks pass.

The alpha remains draft-only. It cannot publish, send, schedule, connect a channel, create an advertising campaign, upload an audience, spend money, or write a human approval.

## First vertical slice

1. Register one private tenant workspace per Canvas instance.
2. Show tenant readiness, campaign summary, workflow state, preliminary quality result, checklist, and active agent roles.
3. Prepare an immutable W2 work order with the existing tenant validation gate.
4. Offer a no-key Coding Agent handoff with exact job ID and tenant-scoped instructions.
5. Persist job state and append-only events in the tenant workspace.
6. Accept only schema-valid internal artifacts and run receipts.
7. Stop at `qa_pass_pending_human` and display the manager decision required.
8. Compare businesses only through aggregate, de-identified LearningExport records.

## Whole-App Impact Brief

- **Goal:** let a non-technical owner operate and review a bounded AI marketing workflow without writing prompts or managing an LLM API key.
- **Task lane:** cross-cutting growth governance, local runtime bridge, tenant storage, and desktop Canvas UI.
- **Entry points:** local browser on loopback, guided setup, campaign overview, workflow detail, review inbox, and Coding Agent handoff.
- **Data writes:** a minimal local workspace registry plus `operations/jobs/<job-id>/` inside the selected tenant root. Job manifests are immutable; state and events are atomic and auditable.
- **Backend contracts:** Node local control server, work-order schema, job-state schema, agent-run receipt schema, current workflow/quality contracts, and the existing tenant validator.
- **Admin visibility:** the Canvas is the local operations console for readiness, blockers, job progress, artifacts, QA, and owner decisions.
- **Privacy/safety:** separate private tenant roots; no provider credentials; no raw cross-tenant data; path, symlink, junction, Host, Origin, and mutation-token controls; draft-only stop conditions.
- **Analytics/observability:** local cycle-time, state, retry, QA, and owner-decision counters. Cross-business comparison accepts only approved aggregate exports and keeps the existing minimum cohort threshold.
- **Rollback/fallback:** stop the local server. All framework and tenant files remain readable without the Canvas. Manual Coding Agent handoff remains available when CLI automation is unavailable.
- **Surfaces intentionally untouched:** tenant product applications, tenant admin consoles, tenant backends, channel credentials, W3-W5 external execution, publishing, advertising spend, and online account/sync.
- **Validation:** baseline framework validation/tests, Canvas unit/integration tests, security/path isolation tests, clean export scan, responsive browser flow, interaction test, and visual comparison against the selected target.
- **Manager test path:** open the private startup URL, confirm no API-key field, view readiness, create a W2 job, copy/open the Coding Agent handoff, open **Nội dung**, inspect the complete artifact, media/source metadata, QA and decision history, then approve or request revision locally.

## Two-business topology

Run two single-tenant Canvas instances against two separate private workspaces pinned to the same framework revision. Do not give one process access to both raw workspaces. A third comparison view may read only validated LearningExport files.

A legacy Sprint 01 package is input, not a valid portable tenant. Migrate it into a new private tenant scaffold without weakening the generic validator. Every pilot business must complete the same onboarding process with its own facts, sources, and ownership records.

## Acceptance criteria

- No Canvas screen or job contract requests an LLM API key.
- The default handoff works when the Coding Agent CLI is absent or logged out.
- Runtime capability checks never read or copy a Coding Agent credential.
- Tenant readiness blocks job creation when required W0 data is missing.
- Manifest creation is exclusive and retry creates a distinct attempt.
- Two workers cannot claim the same job.
- Restart reconstructs current state from tenant files.
- Any cross-tenant identity sentinel, path escape, symlink, or junction is rejected.
- An artifact edit after QA invalidates the QA binding.
- An agent cannot write the manager's final approval.
- No alpha endpoint can publish, send, schedule, create a campaign, upload an audience, or spend money.
- A non-technical manager can complete the happy path without a terminal.
- The implementation matches the selected combined UI target at 1440 x 1024 and remains usable at common laptop widths.
- Existing framework validation and tests continue to pass.

## Pilot success measures

- Setup-to-first-job time.
- Job completion, failure, duplicate prevention, and resume rate.
- First-pass QA, repair cycles, owner accept/revise/block, and edit distance.
- Time from accepted input to reviewable asset.
- User comprehension of blocker and next action.
- Technical support minutes per tenant.
- Coding Agent usage-limit interruptions.
- External LLM API cost, which must remain zero for this runtime path.

Do not claim conversion lift during this alpha. The pilot establishes workflow quality, usability, reliability, and willingness to pay before external distribution or paid-media automation is added.

Media provenance and Pro Supervisor schemas now exist as incubating extensions. They document real-capture-only requirements, rights evidence, asset lineage, structured owner intake, shadow calibration, bounded authority, audit, escalation, and kill-switch behavior. They do not activate upload, storage, playback, generation, publishing, channel operations, spend, or automatic Supervisor decisions in this alpha.
