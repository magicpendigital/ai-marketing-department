---
name: growth-content-factory
description: Produce traceable internal concept and copy packages from an accepted brief without self-approval or execution.
---

# Growth content factory

Use this skill to create a draft content package after the relevant positioning brief and ProductTruth are accepted.

## Inputs

Require an accepted brief, current ProductTruth, BrandPack, locale requirements, claim references, target-surface constraints, and measurement definitions. Use only material whose provenance and permitted use are recorded.

## Workflow

1. Restate the intended audience context, job, message premise, and prohibited claims.
2. Create a small set of clearly distinct concepts; each concept must identify its mechanism, claim references, and uncertainty.
3. Draft copy variants that match the required locales and keep the call to action within the product’s approved scope.
   When the work order declares `targetChannels`, create a separate channel-specific copy/media package for every listed channel and tag each variant and channel-specific media record with its exact `channelId`. Do not reuse an untagged generic variant across a multi-channel task. If the manifest has no target channels, stop and ask the owner to create a new work order with explicit channel selection.
4. Add visual direction, accessibility notes, source/provenance status, and target-surface fit without using unverified third-party material.
   If the package requests a real image/video or an actual media edit, read `../growth-media-production/SKILL.md` before producing it. If media generation is allowed, use a media skill available in the current Coding Agent; otherwise return an honest production brief and mark the file as not produced.
5. Attach measurement event definitions and the intended internal decision the package could inform.
6. Mark the package as an internal draft and send it to deterministic lint and independent QA.
7. Record completed/blocked stages in `agent-work-log.json` using `packages/growth-contracts/schemas/agent-work-log.schema.json`. Include concise outcomes, role/template id, channel, timestamps, input/output references, and issue codes. Include it in the exact artifact set reviewed by independent QA. Never record hidden chain-of-thought or private reasoning.

## Hard stops

Stop if a claim is unsupported or expired, rights or provenance are unknown, language makes a guarantee or sensitive inference, a locale cannot be reviewed, or the package contains another tenant’s material. Do not self-approve, schedule, send, publish, or create a paid-media action.

## Human gate

An editor or owner decides whether a QA-passed internal draft is kept, revised, or blocked. The content creator cannot make that decision.

## Validate and hand off

Confirm that every claim has a current reference, every asset direction has a rights status, and every variant has locale and accessibility notes. Hand off the package version, lint result, provenance record, and open questions to an independent reviewer.
