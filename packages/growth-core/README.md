# Growth Framework Core

This package is the portable, tenant-neutral portion of the AI marketing framework. It contains no customer records, secrets, credentials, BrandPack, ProductTruth, proprietary asset, real destination URL, campaign receipt or business-specific claim.

Sprint 01 supports W0, W1, W2 and W6 in `draft_only` mode. It cannot publish, send, schedule, create an advertising campaign, spend money or change a product.

Future GitHub extraction must use `export-manifest.json` as an allow-list. Tenant-specific packages are deliberately absent from that allow-list. A real business starts from `packages/growth-fixtures/tenant-template/scaffold` and remains in its own private repository/data plane.

In this source workspace, the manager checks are:

```sh
npm run growth:validate:portable
npm run growth:test:portable
npm run growth:tenant:demo
node scripts/export-growth-framework.mjs --dry-run --source-boundary <tenant-config-or-readiness-file>
```

The source-boundary file must list the source tenant's own identity tokens. It does not need a real foreign-tenant identity token.

In a clean exported framework repository, use its root scripts instead:

```sh
npm run validate
npm test
npm run tenant:init -- --tenant <tenant-slug> --output <private-tenant-directory>
npm run tenant:validate -- --tenant-root <private-tenant-directory>
npm run tenant:demo:validate
```

A framework pass means only that internal preparation and QA contracts are sound; it never grants external-marketing readiness.
