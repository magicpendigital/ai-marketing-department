---
name: growth-learning-synthesis
description: Turn approved aggregate results into bounded learning notes and product or content hypotheses without automatic changes.
---

# Growth learning synthesis

Use this skill after a tenant has an approved aggregate learning export and a defined experiment or quality question.

## Inputs

Require an approved aggregate export, measurement plan, experiment definition, QA outcomes, data-boundary verdict, and named product owner. Do not accept raw customer records or data from another tenant.

## Workflow

1. Confirm the export is aggregate, within consent scope, and matched to the predeclared metric definitions.
2. Check data completeness, denominator stability, time window, guardrails, and any known measurement limitation.
3. Compare results only to the predeclared hypothesis, threshold, and counterfactual limits.
4. State the evidence, confidence, alternative explanations, and what the result cannot establish.
5. Draft a learning note with a bounded next hypothesis for content, measurement, or product exploration.
6. Create a product-ticket draft only when the evidence warrants human triage; preserve uncertainty and do not change a product or prompt.

## Hard stops

Stop if the export contains direct identifiers, restricted data, mixed-tenant records, unclear consent, undefined denominator, or an attempt to infer individual behavior. Do not change a product, prompt, price, audience, or message automatically.

## Human gate

A product owner triages each learning note and decides whether to retain, investigate, revise, or discard the proposed next step. A learning note is not a release decision.

## Validate and hand off

Verify the evidence source, metric definitions, time window, confidence limits, and tenant boundary. Hand off the learning note, data-quality caveats, and any product-ticket draft to the product owner for a recorded decision.
