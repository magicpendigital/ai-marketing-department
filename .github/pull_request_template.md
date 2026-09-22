## Purpose

Describe the problem, the intended framework behavior, and the affected workflow, contract, or gate.

## Scope

- [ ] Portable framework only
- [ ] Synthetic fixture only
- [ ] Documentation only
- [ ] Other approved scope: explain below

## Data and tenant boundary

- [ ] No tenant brand, ProductTruth, customer data, personal data, destination, credential, proprietary creative, or execution receipt is included.
- [ ] The change is safe to export through the allow-list policy.
- [ ] Any example is synthetic and clearly labeled.

## Control impact

- [ ] Draft-only restriction remains intact.
- [ ] Human gate and stop condition are documented.
- [ ] Approval-state impact is documented.
- [ ] External execution remains blocked unless a separately approved plan is linked in the private owner record.

## Validation

- [ ] `npm run validate`
- [ ] `npm test`
- [ ] Added or updated an adversarial fixture when a control changed.
- [ ] Checked compatibility and rollback behavior.

## Reviewer notes

State the evidence reviewed, residual risk, versioning impact, and any follow-up required before a tenant adopts the change.
