# Growth Framework Contracts

These JSON Schemas define portable records for ProductTruth, content briefs, concept/copy packages, QA, approvals, execution receipts and de-identified learning exports.

They carry no tenant brand, customer record, destination URL, credential or campaign receipt. A tenant owns its own BrandPack, ProductTruth evidence and private runtime. Learning may cross a tenant boundary only through the bounded `LearningExport` contract after its privacy and approval gates pass.

Future media-provenance and Pro Supervisor shapes are documented under [`extensions`](extensions/README.md), with fictional instances under [`examples`](examples/README.md). They are intentionally absent from `contract-index.json`: an incubating schema does not activate a workflow or grant approval, publishing, spend, or unattended-execution authority.
