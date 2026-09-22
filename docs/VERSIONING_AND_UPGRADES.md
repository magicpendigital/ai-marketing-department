# Versioning and Upgrades

The portable framework is an upstream control layer. Each business adopts a reviewed framework version into its own private tenant workspace; it does not contribute tenant facts or operating records back upstream.

## Official adoption topology: release-tagged vendoring

The recommended topology for the first two-business pilot is a release-tagged clean export vendored into each private tenant repository:

```text
upstream-framework-repository/
  release tag: v<major>.<minor>.<patch>

private-tenant-repository/
  framework/   exact clean export from the selected upstream release tag
  tenant/      tenant-owned configuration, evidence references, drafts, approvals, and records
```

The `framework/` directory is a reviewed snapshot, not a place for tenant customization. The tenant records the upstream release tag in `tenant/onboarding-manifest.json` and the source revision in a tenant-controlled adoption decision record, runs framework commands from `framework/`, and passes `../tenant` to tenant-scoped commands. This gives each tenant reproducible controls while keeping its private material outside upstream history.

For this pilot, do not use a floating branch, an unpinned dependency, or a submodule that can advance without an explicit tenant review. A tenant-specific adjustment belongs in `tenant/`; a reusable control improvement follows the sanitized upstream contribution process.

## Version-pinning rule

Record the adopted framework version in each tenant's onboarding manifest and readiness record. A two-business comparison cohort must use the same reviewed contracts, workflow definitions, quality rubric, and metric-definition versions before its results are compared.

Pinning a version means the tenant can reproduce which controls, state transitions, fixtures, and documentation governed a draft. It does not freeze ProductTruth evidence, channel capability, or approvals; those remain tenant-owned and may expire independently.

## Compatibility policy

| Version change | Compatibility expectation | Tenant action |
| --- | --- | --- |
| Patch | Clarifies documentation, adds a safe test, or fixes an implementation defect without changing a contract or gate. | Review notes and rerun baseline validation. |
| Minor | Adds an optional contract field, fixture, skill, or workflow refinement that does not weaken an existing control. | Review the compatibility note, update optional artifacts if useful, and rerun tenant checks. |
| Major | Changes a required contract field, state transition, metric definition, quality threshold, data boundary, or approval rule. | Complete the migration checklist, obtain owner review, and preserve a rollback point. |

Do not describe an upgrade as backward compatible unless the affected contracts, validators, fixtures, and documentation have all been checked.

## Safe upgrade sequence

1. Read the version notes, compatibility statement, and migration checklist in the upstream change.
2. Record the tenant's current framework version and preserve its existing readiness, ProductTruth, QA, and approval history in tenant-controlled storage.
3. Update the portable framework in an isolated branch or test workspace.
4. Run the portable baseline checks and the synthetic tenant demo:

   ```sh
   npm run validate
   npm test
   npm run tenant:demo:validate
   ```

5. Run the tenant's private validation and negative isolation tests.
6. Review whether any ProductTruth references, briefs, content drafts, QA verdicts, approvals, metric definitions, or learning records need revision or invalidation.
7. Have the tenant's product, privacy, editorial, and measurement owners accept the adoption decision before the new version becomes active.

An upgrade does not authorize an external communication, a channel connection, paid media, or a product change.

## Migration rules

- Prefer an additive migration with a documented compatibility window.
- A required-field or state-machine change needs a migration guide, semantic validation, adversarial coverage, and a rollback path.
- Never migrate a tenant's BrandPack, ProductTruth evidence, customer records, source content, creative material, approval envelope, receipt, or access material into the portable upstream repository.
- Keep transformation logic deterministic, reviewable, and scoped to the tenant workspace.
- Invalidate an approval when the fields named in the approval-state machine change, even if the framework version itself remains unchanged.

## Rollback

If an upgrade fails validation, produces an unexpected hard failure, or weakens an isolation boundary:

1. Stop the affected tenant workflow.
2. Revert the tenant's framework pin to the last reviewed version.
3. Restore the tenant artifacts from the preserved tenant-controlled record.
4. Mark affected drafts or approvals for re-review when their governing rule changed.
5. Create a portable upstream issue or pull request only with a sanitized, tenant-neutral reproduction and synthetic fixture.

Rollback restores a framework control version. It does not erase an audit history or make a previously blocked artifact eligible for execution.

## Release notes for framework maintainers

Every release note should identify:

- version and release date;
- changed contracts, workflows, gates, skills, fixtures, or validation behavior;
- compatibility classification and required tenant action;
- migration and rollback instructions;
- tests added or changed;
- known limits and the external-execution boundary.

Tenant-specific outcomes, content, customer information, and private operating detail do not belong in upstream release notes.
