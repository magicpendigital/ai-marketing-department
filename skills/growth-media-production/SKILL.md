---
name: growth-media-production
description: Route image and video requests by real-versus-generated source policy, available Coding Agent skills, channel format, rights, and accessibility requirements.
---

# Growth media production

Use this skill whenever a W2 content package requests an image, video, edit, storyboard, thumbnail, crop, or channel-ready visual. This skill prepares an internal artifact only. It does not upload, publish, or spend.

## Required inputs

Before changing pixels or frames, require the accepted brief, BrandPack, destination/platform layout, media source policy, rights/provenance, required locales, accessibility needs, and the exact output files expected by the work order. Choose one source policy explicitly (`real_capture_only`, `owned_or_commissioned_real_media`, `owned_or_licensed_non_generated_media`, `any_approved_non_generated_media`, or `generation_permitted`). Do not infer the policy from a sentence such as “use a real photo.”

## Route by media origin and available tools

1. Inspect the current Coding Agent environment for the named media skill before invoking it. Installed desktop skills are not automatically present for another user or Coding Agent. Do not install a plugin, call a separate paid media API, or request a provider key to fill a capability gap; return a clear handoff or manual-production brief instead.
2. For an AI-generated image, use the native `imagegen` skill only when the policy explicitly allows generation and that skill is available. Read its instructions, keep generated content non-identifying, and record the source policy, tool reference, input brief version, output hash, and any disclosure required by the tenant.
3. For supplied real photography, keep the camera original unchanged and preserve its hash. Permitted non-generative work may include selection, crop, exposure/white-balance correction, conventional colour grading, noise cleanup, resizing, typography, and placement in an approved brand layout when rights and policy allow it. Record each derivative and transformation. Do not use generative fill, generated background/object/person, face replacement, synthetic extension, or edits that change the represented facts when real media is required.
4. For video, use `remotion` or `hyperframes` skills only if the Coding Agent can actually access those skills and their rendering tools. They may assemble supplied, rights-cleared frames, footage, audio, typography, captions, and transitions. If generation is forbidden, they must not synthesize frames, voices, people, or product states. Check codec, duration, dimensions, transcript/captions, and channel-safe area before returning a file.
5. If a required skill or renderer is missing, return a storyboard, shot list, design spec, or edit decision list as a separate internal artifact. Mark the media file as not produced; never present the brief as if it were a finished image or video.

## Source and edit record

For every delivered media file, bind the relative artifact reference, media kind, source mode, source file hashes, output hash, byte count, edit class (`non_generative`, `generative`, or `administrative`), tool reference, owner/role, localized alt text or captions/transcript, rights evidence references, and remaining uncertainty. Mark a file ready for preview only when the final binary is declared as a work-order artifact and its independent QA has reviewed that exact hash.

Real images remain the main visual subject when that is required. A designer may add a professionally composed frame, crop, typography, or brand overlay around a real photograph while retaining the original; the artwork must not misrepresent the photographed moment or imply that the photograph itself was AI-generated. Show the original and final crop to the manager during review.

## Quality and handoff

- Use the tenant's exact brand assets, colour and typography definitions. Do not recreate the logo or invent a visual identity.
- Check that media placement and crop fit the selected channel mockup, but disclose that a mockup does not guarantee the platform's exact live rendering.
- Keep alt text, subtitles, contrast, text-safe areas, aspect ratio, file size and playback state visible for human review.
- Let the independent QA role inspect source policy, rights/provenance, content claims, technical integrity, and accessibility. The producer never self-approves.
- Stop on unknown rights, missing releases, source-policy mismatch, unclear consent, prohibited generation, unsupported product evidence, or an unverified output hash.
- The owner decides whether to keep, revise, or block the internal package. A successful media preview grants no channel, posting, scheduling, audience, or spending authority.
