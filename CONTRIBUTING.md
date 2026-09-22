# Contributing

This framework is portable only when every change remains tenant-neutral, evidence-bounded, and safe to reuse. A contribution may strengthen the framework, but it may not carry a business's private facts, customer records, creative materials, execution history, or access material into the shared core.

## Contribution classes

| Class | Examples | Required review |
| --- | --- | --- |
| Contract change | Schema, required field, state transition, metric definition | Framework owner and governance reviewer |
| Control change | Quality gate, lint rule, isolation test, export policy | Framework owner and independent QA reviewer |
| Documentation change | Onboarding, workflow, operator guidance | Documentation owner and workflow owner |
| Synthetic fixture | Positive example, adversarial case, conformance test | QA reviewer and data-boundary reviewer |
| Tenant extension | A private tenant's BrandPack, ProductTruth, content, or receipt | Keep outside this portable repository |

## Before opening a pull request

1. Confirm the change contains no tenant brand, customer data, personal data, destination, credential, proprietary creative, or execution receipt.
2. State which workflow, contract, gate, or operator decision changes.
3. Add or update an adversarial fixture when a control or validation rule changes.
4. Preserve the draft-only restriction unless the repository owner has approved a separately reviewed release plan.
5. Run the applicable checks:

   ```sh
   npm run validate
   npm test
   ```

6. Use the pull-request template and describe rollback behavior for state-machine, contract, or export-policy changes.

## Review principles

- The author cannot be the only reviewer for a claim, safety, privacy, or export-boundary change.
- A contribution that makes a framework action easier must make its stop condition and human gate at least as clear.
- New metric fields must remain aggregate, de-identified, and compatible with the learning-export contract.
- A generic example must be synthetic and clearly marked as such.
- A template must not imply that a feature, outcome, market response, or channel capability is true for a future tenant.

## Pull-request lifecycle

1. Author submits a bounded change with tests and documentation.
2. Independent reviewer checks reusability, data boundary, hard-fail behavior, and rollback.
3. Required owners approve the versioned change.
4. Maintainer merges only after the checks pass and the approval record is complete.
5. A tenant owner decides whether and when to adopt the new framework version in a separate private workspace.

## Definition of done

A framework contribution is complete when it has a clear owner, a stated compatibility impact, current documentation, passing validation and adversarial tests, no tenant leakage, and a manager-testable path. Completion never authorizes external communications, paid media, or a tenant product claim.
