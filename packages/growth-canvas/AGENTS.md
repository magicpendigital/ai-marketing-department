# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Approved manager experience

- Preserve the left navigation, campaign summary, and preliminary quality score from the selected dashboard direction.
- Make the workflow and current task understandable to a non-technical manager, including the exact decision required and the next safe action.
- Keep the assigned AI team and the brand/quality checklist visible beside the main work area.
- Present concise manager summaries first. Keep hashes, raw JSON, role IDs, and other technical evidence available in collapsed detail views.
- The `Nội dung` workspace must separate `Cần duyệt`, `Đã duyệt`, and `Cần sửa`; selecting a record must reveal the complete produced copy, every available variant, QA evidence, version/decision history, and any media, source, rights, or provenance metadata supplied with the artifact.
- A manager must be able to read the produced content without opening raw JSON. Raw artifact data remains available as secondary evidence.
- Never imply that a local quality score measures conversion lift, that an internal QA pass is owner approval, or that the alpha may publish, send, schedule, upload audiences, create campaigns, or spend money.
