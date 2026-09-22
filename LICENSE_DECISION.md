# License Decision

No open-source license is included by default. Treat the initial repository as private and all rights reserved until the repository owner makes and records a licensing decision.

## Decision record required before changing visibility

Record the following in an owner-approved decision note:

1. Intended repository visibility and who may receive copies.
2. Chosen license or proprietary-use terms.
3. Ownership of framework code, schemas, fixtures, documentation, and future contributions.
4. Third-party dependency and intellectual-property review outcome.
5. Contributor agreement or contribution policy, if external contributions will be accepted.
6. Trademark and brand-use rules for the framework name and any accompanying marks.
7. Support, security-reporting, and version-maintenance commitment.

## Options to evaluate

| Option | Useful when | Decision still required |
| --- | --- | --- |
| Private proprietary | The framework is being proven internally or contains a controlled commercial method. | Access list, reuse rights, and downstream business ownership |
| Source-available | Reviewers or selected partners need code visibility without broad reuse rights. | Recipient terms, redistribution limits, and support boundary |
| Open source | The owner wants broad reuse and accepts public contribution and maintenance duties. | License, contribution policy, dependency review, and trademark policy |

Do not infer a license from repository visibility, a package manifest, or a copied template. Add a final `LICENSE` file only after the owner records the decision and completes the required review.
