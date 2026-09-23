# Local Canvas alpha

> Người quản lý không muốn thao tác terminal hoặc JSON: xem [Hướng dẫn nhanh cho manager](MANAGER_QUICK_START.vi.md).

Local Canvas is the manager-facing control surface for the portable AI Marketing Department. It runs on the owner's machine, reads exactly one private tenant workspace per process, and hands bounded jobs to a Coding Agent the owner already uses.

It does not request an LLM API key. It also does not promise free or unlimited model usage: the selected Coding Agent remains subject to its own subscription, login state, usage limits, and product terms.

## What the alpha proves

- A non-technical manager can understand readiness, campaign intent, current workflow state, quality checks, active roles, and the decision required.
- A validated W2 work order can be created without writing a prompt.
- A user can hand that work order to a Coding Agent without placing any provider credential in the framework.
- A Coding Agent can claim one job and write tenant-scoped artifacts; a separately mapped QA role reviews their exact hashes before the lead receipt can advance the job.
- Accept, revise, block, and cancel remain explicit local manager actions. The localhost alpha records the procedural `owner` role but does not authenticate operating-system identity.
- The local API has no publish, send, schedule, audience-upload, campaign-creation, or spend route.

## Supported runtime modes

| Mode | Alpha status | User action | Credential handled by framework |
| --- | --- | --- | --- |
| Manual Coding Agent handoff | Default | Open the private tenant in the Coding Agent and ask it to run the named job | None |
| Coding Agent desktop queue | Future capability gate | Requires an officially supported, authenticated queue | None |
| Headless Coding Agent CLI | Opt-in experiment only | Requires separate runtime detection and login verification | None |

The Canvas must fall back to manual handoff whenever subscription-backed automation cannot be proven. It must never silently ask for an API key instead.

## Install and start

Use Node 22.

```sh
npm ci
npm run canvas:build
npm run canvas:start -- --workspace <private-tenant-directory> --port 4310
```

The server binds to `127.0.0.1` by default and prints a private local URL containing an ephemeral per-process capability in the URL fragment. Open that exact URL. The UI keeps the capability only for the current browser session and removes it from the visible address after capture. To open another browser on the same machine, use **Sao chép link riêng** in the connected Canvas header. Treat this as a bearer access link; do not share it. A single process accepts exactly one tenant workspace. Restarting the server creates a new capability; stop it with `Ctrl+C`.

During UI-only development, `npm run canvas:dev` starts Vite with a tenant-neutral fallback dataset. The production local pilot should use `canvas:start` so UI and API share one loopback origin.

## Manager flow

1. Open the Canvas and check the readiness status and blocked items.
2. Review the campaign hypothesis, ProductTruth boundary, quality score, checklist, and assigned team.
3. Choose **Create task**. The Canvas validates the tenant before it writes a W2 work order.
4. Copy the task instruction or open the private workspace in the Coding Agent.
5. Tell the Coding Agent to read `AGENTS.md`, the matching skill, and the exact job manifest before it claims the job.
6. Have the tenant-mapped `quality_assurance` role run the independent review, then watch the job move from `in_progress` to owner review, repair, or blocked.
7. Open **Nội dung** in the left navigation. Use **Cần duyệt**, **Đã duyệt**, or **Cần sửa** to find the record, then select it from the list. A zero count shows an explicit empty message; it is not a blank workspace.
8. Read **Nội dung đầy đủ** for every produced copy variant. The manager selects one or more target channels when creating the task; the immutable work order stores them. The preview lists only those channels. For a multi-channel task, every variant/media item must carry its matching `channelId`; an untagged generic variant is not reused. The preview compares locale, copy, and any hash-verified image/video file attached to the work order. The simulation is advisory and does not guarantee pixel-perfect rendering on a live platform.
9. Use **Media & nguồn** for supplied visual/media instructions, rights, sources, and provenance; **Chất lượng** for independent QA; and **Phiên bản & quyết định** for attempts and owner reasons. Raw JSON and hashes stay in the collapsed evidence view.
10. For a record in **Cần duyệt**, record a reason when approving it internally or requesting a revision. An internal approval does not grant any external-action authority.
11. Open **Quy trình** to inspect all framework agents, sub-agents, and the W0/W1/W2/W6 flow. W2 support sub-agents can be changed for future tasks; the lead is capability-bound. Open **Quy trình & kết quả** on a content record to inspect the current attempt's `agent-work-log.json`. New channel-assigned jobs cannot pass deterministic QA without exactly one valid log containing completed concept, copy, and media/accessibility results for every assigned channel, linked to artifacts in the reviewed set. It records outcome summaries, roles, channel, timings, input/output references, and issue codes, never private chain-of-thought. Older unassigned jobs may not have a log.

The interface never treats `queued` or `in_progress` as completed work. A quality score is a gate summary, not proof of campaign performance. Internal approval is separate from publishing. The current alpha has no connected publisher, post receipt, scheduler, ad account, or post-publication analytics; see [Content lifecycle and reporting](CONTENT_LIFECYCLE_AND_REPORTING.vi.md).

Creating a work order only stores a task. To start it, open the Dashboard, copy the full handoff prompt, paste it into a user-authorized Coding Agent session with access to the selected framework and tenant, and send it. The Canvas does not start a background agent. It also does not schedule recurring work; a schedule would need a supported runtime queue and explicit credentials/authorization boundary, which are not available in this alpha.

## Coding Agent lifecycle

The Coding Agent should run from the reviewed framework directory and stay inside the selected tenant root.

```sh
npm run tenant:job:claim -- --workspace <private-tenant-directory> --job-id <job-id> --attempt-id <attempt-id>
```

After the lead writes the declared artifacts, a different role mapped by `role-mapping.json.frameworkRoleMappings.quality_assurance` must review the exact bytes:

```sh
npm run tenant:job:review -- --workspace <private-tenant-directory> --job-id <job-id> --verdict <private-tenant-directory>/<qa-verdict-candidate.json>
```

The review command computes and persists `deterministic-lint.json` from the exact artifact and tenant-context bytes. A QA candidate cannot create a passing owner-review state by merely declaring `deterministicLintStatus: "passed"`; the framework recomputes the artifact contract, hard-fail rules, exact hashes, and context bindings. The verdict then binds the active `attemptId`, mapped QA identity, rubric, hard failures, all nine quality scores, provenance, and each artifact's SHA-256 and byte count. The lead submits its schema-valid receipt with `qualityGateStatus: "not_run"`:

```sh
npm run tenant:job:complete -- --workspace <private-tenant-directory> --job-id <job-id> --receipt <private-tenant-directory>/<receipt-path>
```

Claim, review, completion, cancellation, and owner decisions use one cross-process per-job lock. Completion and owner review recompute deterministic lint, rehash the artifacts, and require exact equality with the separate QA verdict; the lead receipt cannot self-attest QA. A revision creates a distinct attempt and archives the prior claim, deterministic-lint receipt, QA, run receipt, integrity record, state snapshot, and artifact bytes without overwrite. The Coding Agent cannot write the owner's decision.

The compact dashboard review card previews at most 32 KiB per text artifact and 128 KiB total. The dedicated **Content** workspace uses a separate bounded reader of 512 KiB per text artifact and 2 MiB total per record so normal concept/copy packages render in full. Larger text deliverables must be split into reviewable artifacts in this alpha; the UI keeps integrity metadata visible when a bounded preview is refused. A separate, capability-protected endpoint serves only manifest-declared, independently hash-verified PNG, JPEG, WebP, MP4, or WebM artifacts for inline preview (12 MiB image / 48 MiB video limit, no public storage URL). This is a read-only preview path, not a media upload or provenance pipeline.

### Recover an expired claim

If the active claim lease expires, review and completion stop. The job remains `in_progress`, and the old attempt is never silently renewed. Open the job in Canvas and copy the recovery claim command shown in its handoff panel, or run the claim command with a **new, distinct** attempt id:

```sh
npm run tenant:job:claim -- --workspace <private-tenant-directory> --job-id <job-id> --attempt-id <new-distinct-attempt-id> --lease-seconds 3600
```

Recovery runs under the same per-job lock. Before issuing the fresh lease, it archives the expired claim, any official attempt records, the state snapshot, and exact artifact bytes under:

```text
operations/jobs/<job-id>/attempts/<expired-attempt-id>/
```

`archive-manifest.json` binds every archived file to its SHA-256 and byte count and records the expired lease, new attempt id, state version, and archive reason. The active stale artifact directory is removed only after those bytes match the committed archive. The event log then appends `agent.expired_claim_reclaimed`. Reusing the expired attempt id fails; while a lease is still active, existing same-attempt idempotency and different-attempt exclusion remain unchanged.

## Local security boundary

- Loopback bind only.
- One raw tenant workspace per process.
- A random per-process API access capability delivered through the startup URL fragment.
- Host and Origin validation plus a separate per-process mutation nonce.
- Path containment and rejection of symbolic links and junction escapes.
- Immutable manifest, atomic state updates, exclusive cross-process job lock, attempt archive, and hash-chained event log.
- No credential inspection, copying, proxying, or storage.
- No raw cross-tenant comparison.

Run Canvas as the same non-elevated operating-system account that owns the selected workspace. The code/static directory and tenant workspace must not be concurrently writable by an untrusted account. A shared-machine, service-account, elevated, or hosted runtime needs an OS sandbox and stronger filesystem handling before release.

The tenant remains the owner of its workspace and can inspect or export every local artifact without the Canvas.

## Two-business pilot

Run two processes with different ports and private roots:

```sh
npm run canvas:start -- --workspace <business-a-private-tenant> --port 4310
npm run canvas:start -- --workspace <business-b-private-tenant> --port 4311
```

Do not add a raw multi-tenant switcher. A comparison surface may read only privacy-approved LearningExport records. The current cohort threshold remains enforced; until both businesses have a valid cohort, compare workflow conformance, QA, cycle time, repair count, support burden, and owner decisions inside each tenant.

## Alpha acceptance check

```sh
npm run validate
npm test
npm run canvas:test
npm run canvas:build
npm run tenant:two:validate
```

The alpha is ready for a manager test only when these checks pass and the rendered Canvas has passed visual comparison against the selected design target.
