# Design QA — Local Canvas v1 alpha

## Comparison target

- Reference: manager-approved composite concept supplied during the design review. The source image is review evidence and is not included in the framework export.
- Reference pixels: 1487 × 1058; normalized to 1440 × 1024 for comparison.
- Implementation capture: local QA evidence at 1440 × 1024; the capture is intentionally excluded from the framework export.
- Browser viewport: 1440 × 1024. The captured page area was 1425 × 1013 because the browser reserved scrollbar/page chrome space; it was normalized to 1440 × 1024.
- State: a representative local W2 review fixture at `awaiting_owner_decision`, with independent QA and current artifact integrity verified.

## Visual evidence

- Full comparison, header/main-workflow crop, and team/checklist crop were reviewed from local ephemeral QA artifacts. They are intentionally excluded from the reusable framework export.

The implementation preserves the selected structure: persistent left navigation, business/runtime header, campaign facts, preliminary quality ring, horizontal workflow, manager task, assigned team, recent activity, and checklist. Typography, spacing, borders, blue/green hierarchy, card geometry, and desktop density remain close to the reference.

The displayed score and labels intentionally use verified runtime data rather than the illustrative values in the reference. The implementation also includes explicit no-key/manual-handoff copy, independent-QA evidence, external-action boundaries, and collapsible technical evidence. These are required product truths rather than visual regressions.

## Interaction verification

- Sidebar navigation opens the workflow placeholder and returns to Overview.
- The technical evidence disclosure opens and exposes the current artifact hash and raw verified data, then closes cleanly.
- Approval and revision buttons open their correct reason-required dialogs; no decision was submitted during QA.
- Create task opens the bounded W2 form; no task was submitted during QA.
- The Content workspace separates pending, approved, and revision-requested records and renders full localized copy, media/source metadata, QA, versions, and decision history.
- The dashboard preview link opens the selected record in Content.
- Browser console: 0 errors and 0 warnings.

## Responsive verification

| Viewport | Result |
| --- | --- |
| 1440 × 1024 | Desktop reference comparison complete. |
| 1280 × 720 | `scrollWidth` equals `clientWidth`; no document-level horizontal overflow. |
| 390 × 844 | Dashboard and Content remain operable; `scrollWidth` equals `clientWidth`; no document-level horizontal overflow. |

## Issue history

- P0: none.
- P1: none.
- P2: none.
- P3 accepted differences: framework-neutral brand mark, live tenant copy/roles, measured gate score, and additional audit content increase vertical length compared with the illustrative reference.

## Final result

`passed`
