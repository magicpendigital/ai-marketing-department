---
name: growth-journey-measurement
description: Define consent-scoped, aggregate customer-journey metrics and guardrails for internal learning.
---

# Growth journey measurement

Use this skill during readiness, research planning, or learning design when a tenant needs a measurement plan rather than individual-level analysis.

## Inputs

Require the event ownership map, consent and data boundary, metric contract, accepted research or experiment brief, and a named measurement owner. Use aggregate, de-identified signals only.

## Workflow

1. Map the user journey stages relevant to the stated decision, including entry context, intended value moment, and exit condition.
2. Define each metric with event eligibility, numerator, denominator, time window, exclusion rule, owner, and interpretation limit.
3. Specify the smallest aggregate collection needed to answer the question and the data that must not be collected.
4. Add quality guardrails for missing events, denominator drift, consent changes, sample insufficiency, and metric gaming.
5. Connect each metric to a decision threshold or learning question instead of treating activity as success.
6. Produce a versioned journey measurement plan and a future aggregate-export shape.

## Hard stops

Stop if measurement would require direct identifiers, sensitive inference, cross-tenant raw data, undefined consent, or a metric without a denominator and decision use. Do not profile individuals or alter the product from a metric result.

## Human gate

A named owner accepts metric definitions, consent scope, and interpretation limits before any later instrumentation work is considered. Acceptance does not authorize data collection beyond the declared boundary.

## Validate and hand off

Verify every metric has a numerator, denominator, time window, owner, guardrail, and decision use. Hand off the plan to the research, content, and learning owners with the aggregate-only rule intact.
