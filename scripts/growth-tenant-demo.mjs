import fs from "node:fs";
import path from "node:path";

const readJson = (tenantRoot, relativePath) => JSON.parse(fs.readFileSync(path.join(tenantRoot, relativePath), "utf8"));
const writeJson = (tenantRoot, relativePath, value) => {
  const target = path.join(tenantRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const currentDate = () => new Date().toISOString().slice(0, 10);

/**
 * Converts a freshly initialized scaffold into a generated but semantically complete
 * tenant configuration. It creates no accounts, customer data, credentials, assets,
 * publication, outreach, telemetry, or paid media. Tests use it to prove the W0/B1
 * validator can distinguish a complete internal-draft tenant from a scaffold.
 */
export const materializeSyntheticReadyTenant = ({ tenantRoot, tenantId } = {}) => {
  if (!tenantRoot) throw new Error("Synthetic tenant demo requires tenantRoot.");
  const config = readJson(tenantRoot, "tenant-config.json");
  const resolvedTenantId = tenantId || config.tenantId;
  if (config.tenantId !== resolvedTenantId) {
    throw new Error("Synthetic tenant demo tenantId must match the initialized scaffold.");
  }

  const status = "ready_for_internal_drafts";
  const brandPackVersion = "1.0.0";
  const ownBrandToken = `${resolvedTenantId}-brand`;
  const foreignBrandToken = "other-synthetic-brand";
  const approvalOwner = "tenant-approval-owner";
  const featureId = `${resolvedTenantId}_guided_planning`;
  const evidenceId = `${resolvedTenantId}_guided_planning_evidence`;
  const claimId = `${resolvedTenantId}_guided_planning_claim`;
  const eligibleViewEvent = `${resolvedTenantId}_eligible_destination_view`;
  const ctaClickEvent = `${resolvedTenantId}_approved_cta_click`;
  const activationEvent = `${resolvedTenantId}_valuable_activation`;
  const repeatEvent = `${resolvedTenantId}_repeat_value_day`;
  const consentEvent = `${resolvedTenantId}_consent_recorded`;
  const futureDestination = `${resolvedTenantId}_future_destination`;
  const reviewDate = currentDate();

  writeJson(tenantRoot, "tenant-config.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    status,
    isSynthetic: false,
    purpose: "Generated W0/B1 test configuration used only inside the automated framework suite.",
    requiredBeforeWorkflow: [
      "brand_pack",
      "business_pack",
      "product_truth",
      "legal_and_claim_rules",
      "consent_and_data_map",
      "activation_event_definition",
      "target_market_and_locale",
      "channel_owner",
      "approval_owner",
      "hard_budget_cap",
      "incident_contact"
    ],
    dataPlane: {
      backend: "separate_project_required",
      analytics: "separate_property_required",
      senderDomain: "separate_domain_required",
      credentials: "separate_secret_store_required"
    },
    identityBoundary: {
      ownBrandTokens: [ownBrandToken],
      knownForeignBrandTokens: [foreignBrandToken],
      requiredBeforeActivation: "Identity boundary is reviewed for internal drafts only."
    },
    crossTenantRules: [
      "Do not reuse another tenant's configuration, source, asset, destination, approval, receipt, or data.",
      "Compare tenants only through approved aggregate_deidentified LearningExport records.",
      "A database separated only by a tenant column is not accepted."
    ],
    sprint01Restriction: "draft_only_no_external_action"
  });

  writeJson(tenantRoot, "brand-pack.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    status,
    isSynthetic: false,
    brandPackVersion,
    identity: {
      productName: "Sample Planning AI",
      tagline: "A clear space to plan the next useful step.",
      brandTokens: [ownBrandToken],
      knownForeignBrandTokens: [foreignBrandToken]
    },
    audienceLanguage: {
      primaryLocale: "en",
      supportedLocales: ["en", "vi"],
      requiredContentLocales: ["en-US", "vi"],
      readingLevel: "plain-language"
    },
    voice: {
      qualities: ["calm", "specific", "respectful"],
      mustAvoid: ["unsupported outcome promises", "sensitive-trait inference", "false urgency", "impersonation"]
    },
    visualBoundary: {
      approvedSources: ["tenant-owned-or-licensed-asset-library"],
      forbiddenSources: ["unlicensed material", "another tenant asset library", "misleading product screenshot"],
      accessibilityMinimum: ["legible text", "meaningful alt text", "captioned short video when used"]
    },
    publicCopyBoundary: {
      requiresLocaleReview: true,
      requiresHumanApproval: true,
      externalAction: "forbidden"
    }
  });

  writeJson(tenantRoot, "business-pack.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    status,
    isSynthetic: false,
    brandPackVersion,
    businessContext: {
      category: "AI planning application",
      targetMarket: "generated early-access test market",
      primaryLocale: "en",
      valueHypothesis: "A guided planning flow may help a person clarify one useful next step faster than unstructured chat.",
      nonTargetSegments: ["regulated professional advice"]
    },
    activationEvent: {
      id: activationEvent,
      definition: "A person completes one tenant-defined planning action in a reviewed product flow.",
      status: "definition_reviewed_no_collection"
    },
    channelCapabilities: [
      {
        channel: "future-review-channel",
        status: "disabled",
        allowedActions: ["internal_draft_only"],
        externalAction: "forbidden"
      }
    ],
    destinations: [
      {
        id: futureDestination,
        purpose: "Future reviewed destination only",
        status: "not_connected",
        consentStatus: "not_reviewed",
        externalAction: "forbidden"
      }
    ],
    approvalAuthority: {
      role: approvalOwner,
      status: "assigned"
    },
    incidentResponse: {
      role: "tenant-incident-owner",
      status: "assigned"
    },
    dataPlane: {
      backend: "separate_project_required",
      analytics: "separate_property_required",
      senderDomain: "separate_domain_required",
      credentialStore: "separate_secret_store_required",
      sharedDatabaseWithTenantColumn: "not_accepted"
    },
    commercialBoundary: {
      budgetCap: "not_authorized",
      paidCampaign: "forbidden",
      publishing: "forbidden",
      outreach: "forbidden"
    }
  });

  writeJson(tenantRoot, "product-truth.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    status,
    isSynthetic: false,
    brandPackVersion,
    lastReviewedAt: reviewDate,
    features: [
      {
        id: featureId,
        status: "verified",
        platforms: ["web"],
        evidence: [
          {
            id: evidenceId,
            type: "owner_verified_product_evidence",
            reference: `tenant-private:evidence/${resolvedTenantId}/feature-001`,
            expiresAt: "2099-12-31"
          }
        ],
        claims: [
          {
            id: claimId,
            status: "internal_only",
            allowedSurfaces: ["internal_draft_only"],
            evidenceRefs: [evidenceId],
            expiresAt: "2099-12-31",
            copy: {
              "en-US": "A sample space to clarify a useful next step.",
              vi: "Không gian mẫu để làm rõ bước tiếp theo hữu ích.",
            }
          }
        ],
        prohibitedClaims: [
          "guaranteed outcome",
          "unsupported accuracy or performance claim",
          "medical, legal, financial, or mental-health advice",
          "sensitive-trait inference",
          "real-person or official-expert impersonation"
        ]
      }
    ]
  });

  writeJson(tenantRoot, "role-mapping.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    status,
    isSynthetic: false,
    frameworkRoleMappings: {
      workflow_orchestration: "tenant-growth-orchestrator",
      content_research: "tenant-research-owner",
      product_management: "tenant-product-truth-owner",
      content_authoring: "tenant-content-author",
      quality_assurance: "tenant-independent-qa",
      design_operations: "tenant-distribution-planner",
      measurement_analysis: "tenant-measurement-owner",
      security_privacy_review: "tenant-privacy-owner"
    },
    minimumRoleRules: [
      "The content authoring role may not act as its own independent QA reviewer.",
      "The ProductTruth role may block an unsupported claim but may not override evidence without a human owner.",
      "The distribution planning role may prepare a package but may not connect, schedule, publish, send, spend, or receive receipts.",
      "The measurement role may use approved aggregate definitions but may not collect or export individual-level data."
    ],
    externalExecutionAuthority: "none",
    humanApprovalAuthority: approvalOwner
  });

  writeJson(tenantRoot, "readiness.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    sprintId: `${resolvedTenantId}_marketing_ai_sprint_01`,
    status,
    mode: "draft_only",
    isSynthetic: false,
    externalAction: "forbidden",
    implementedWorkflowIds: ["W0_readiness", "W1_research_to_plan", "W2_content_factory", "W6_learning_to_product"],
    deferredWorkflowIds: ["W3_distribution_orchestration", "W4_controlled_publishing", "W5_paid_media"],
    identityBoundary: {
      ownBrandTokens: [ownBrandToken],
      knownForeignBrandTokens: [foreignBrandToken],
      rule: "Tenant content may use only its own approved identity. A known token from another tenant is a hard failure."
    },
    externalReadiness: {
      status: "blocked",
      requiredGates: [
        "current_product_truth",
        "human_editorial_review",
        "working_destination_and_consent_proof",
        "visual_rights_proof",
        "aggregate_event_telemetry_proof",
        "isolated_data_plane_proof",
        "channel_owner_and_execution_envelope"
      ],
      reason: "The generated test tenant authorizes internal drafts only."
    },
    dataPlane: {
      tenantRuntime: "A separate private tenant runtime is required before any real data exists.",
      crossTenantLearning: "Only approved aggregate_deidentified LearningExport records may leave a tenant after a future gate."
    }
  });

  writeJson(tenantRoot, "risk-register.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    status,
    isSynthetic: false,
    purpose: "Track risks before any internal content package is drafted.",
    risks: [
      ["unsupported_claim", "A draft uses a claim without current ProductTruth evidence.", "product-truth-owner"],
      ["cross_tenant_leak", "A draft contains material from another tenant.", "tenant-lead"],
      ["sensitive_or_personal_data", "A draft contains personal or sensitive material.", "tenant-privacy-owner"],
      ["unlicensed_or_misleading_creative", "A source lacks rights or provenance proof.", "tenant-brand-owner"],
      ["unclear_or_nonconsensual_destination", "A future call to action has no reviewed destination or consent route.", "tenant-product-owner"],
      ["measurement_without_valid_definition", "An outcome is claimed without a reviewed denominator.", "tenant-measurement-owner"],
      ["unauthorized_external_execution", "A role attempts an external action without a later gate.", "tenant-lead"]
    ].map(([id, trigger, ownerRole]) => ({
      id,
      trigger,
      severity: id === "measurement_without_valid_definition" ? "medium" : "high",
      ownerRole,
      mitigation: "Block the package, record a sanitized internal note, and require owner review.",
      sprint01Status: "open_managed"
    })),
    externalAction: "forbidden"
  });

  writeJson(tenantRoot, "privacy/consent-data-map.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    status,
    isSynthetic: false,
    ownerRole: "tenant-privacy-owner",
    lastReviewedAt: reviewDate,
    permittedDataClasses: [
      "tenant_sanitized_configuration",
      "approved_public_research",
      "licensed_or_owned_asset_reference",
      "aggregate_deidentified_learning_export"
    ],
    prohibitedDataClasses: [
      "customer_identifier",
      "contact_detail",
      "private_conversation",
      "private_journal_or_note",
      "sensitive_personal_data",
      "sensitive_inference",
      "uploaded_image",
      "provider_or_oauth_secret",
      "raw_ad_platform_data",
      "prompt_or_trace_payload"
    ],
    collectionBoundary: {
      sprint01Status: "no_customer_data_collection_authorized",
      allowedPurpose: "internal draft preparation and aggregate-only planning",
      requiredBeforeAnyFutureCollection: [
        "documented lawful basis or consent route",
        "purpose limitation",
        "retention and deletion policy",
        "accessible opt_out route",
        "privacy owner review"
      ]
    },
    retentionAndDeletion: {
      status: "owner_configured_no_collection",
      policyReference: `tenant-private:policy/${resolvedTenantId}/retention-001`,
      deletionOwnerRole: "tenant-privacy-owner"
    },
    crossTenantSharing: "aggregate_deidentified_learning_export_only_after_privacy_review",
    externalAction: "forbidden"
  });

  writeJson(tenantRoot, "channels/capability-matrix.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    status,
    isSynthetic: false,
    channels: [
      {
        id: `${resolvedTenantId}_future_review_channel`,
        type: "future-reviewed-channel",
        ownerRole: "tenant-channel-owner",
        status: "disabled",
        allowedActions: ["internal_draft_only"],
        preflightStatus: "prepared_for_later_gate",
        rollbackPlanReference: `tenant-private:plan/${resolvedTenantId}/rollback-001`,
        receiptPlanReference: `tenant-private:plan/${resolvedTenantId}/receipt-001`,
        destinationStatus: "not_connected",
        externalAction: "forbidden"
      }
    ],
    globalRestrictions: [
      "No account, schedule, message, audience, campaign, or spend may be created in Sprint 01.",
      "A later gate must bind a named owner, approval envelope, rollback plan, receipt plan, and incident route to one execution version."
    ],
    externalAction: "forbidden"
  });

  writeJson(tenantRoot, "research/source-register.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    status: "reviewed_for_internal_research",
    isSynthetic: false,
    purpose: "Register sources for internal research hypotheses only.",
    sources: [
      ["brand-guidance", "approved_brand_guidance", "voice and visual boundary"],
      ["product-evidence", "internal_product_evidence", "feature-gated hypothesis formation"],
      ["market-research", "licensed_or_public_market_research", "aggregate market hypothesis only"]
    ].map(([suffix, type, allowedUse]) => ({
      id: `${resolvedTenantId}_${suffix}`,
      type,
      reference: `tenant-private:source/${resolvedTenantId}/${suffix}`,
      allowedUse,
      claimAuthority: "internal hypothesis only",
      reviewStatus: "approved_for_internal_research"
    })),
    prohibitedInputs: [
      "customer_identifier",
      "contact_detail",
      "private_conversation",
      "private_journal_or_note",
      "sensitive_profile_or_inference",
      "uploaded_image",
      "provider_or_oauth_secret",
      "unlicensed_source_material"
    ],
    externalAction: "forbidden"
  });

  writeJson(tenantRoot, "research/interview-kit.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    status: "ready_for_internal_research",
    isSynthetic: false,
    minimumParticipantAge: 18,
    participantTarget: {
      minimum: 15,
      maximum: 20,
      market: "generated early-access test market",
      primaryLocale: "en"
    },
    purpose: "Test a generated value hypothesis without recruitment or collection.",
    consentBoundary: [
      "Participation is voluntary and may stop at any time.",
      "Do not request identifying or sensitive material.",
      "Keep only approved aggregate research synthesis.",
      "Do not compensate positive feedback or conversion."
    ],
    questions: [
      "What first value would you expect from this invitation?",
      "Which wording feels specific or unclear?",
      "What would make this meaningfully different from general AI?",
      "Which claim should the product prove before you trust it?",
      "What would make you return after one useful action?",
      "Where would you expect consent or an opt-out choice?",
      "What would make you stop using the product after one try?",
      "What should the product avoid claiming or asking?"
    ],
    analysisOutput: "aggregate JTBD themes and internal product or content tickets without identifiers",
    externalAction: "forbidden_until_recruitment_and_consent_are_reviewed"
  });

  writeJson(tenantRoot, "measurement/event-ownership-map.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    status: "definition_reviewed_no_collection",
    isSynthetic: false,
    rule: "Definition-only events do not assert telemetry is emitted or available.",
    events: [
      [eligibleViewEvent, "tenant-web-owner", "eligible destination denominator", "aggregate_only"],
      [ctaClickEvent, "tenant-web-owner", "message-to-destination intent", "aggregate_only"],
      [consentEvent, "tenant-privacy-owner", "future consent confirmation", "consent_scoped_aggregate"],
      [activationEvent, "tenant-product-owner", "tenant-defined observable value action", "aggregate_only"],
      [repeatEvent, "tenant-measurement-owner", "two distinct tenant-defined value days", "aggregate_only"]
    ].map(([id, ownerRole, purpose, dataClass]) => ({ id, ownerRole, purpose, dataClass, state: "definition_reviewed_no_collection" })),
    forbiddenDimensions: [
      "customer_identifier",
      "contact_detail",
      "private_content",
      "sensitive_personal_data",
      "raw_tracking_parameter",
      "prompt_or_trace_payload",
      "raw_ad_platform_data"
    ],
    crossTenantSharing: "aggregate_deidentified_learning_export_only",
    externalAction: "forbidden"
  });

  writeJson(tenantRoot, "journey/journey-map.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    status,
    isSynthetic: false,
    ownerRole: "tenant-journey-owner",
    lastReviewedAt: reviewDate,
    purpose: "Define a privacy-safe first-value journey for internal draft decisions only.",
    stages: [
      {
        id: `${resolvedTenantId}_first_value_entry`,
        entryCondition: "A person reaches a future reviewed destination after a tenant-defined eligible entry.",
        intendedValueMoment: "A person sees a clear next planning step in the reviewed product flow.",
        dropOffHypothesis: "Unclear first-use wording may prevent a person from understanding the initial value.",
        eventRefs: [eligibleViewEvent, activationEvent],
        decisionUse: "Inform an internal copy or product clarity question before any external activity.",
        guardrails: ["aggregate_only", "no_sensitive_targeting", "no_external_action_without_later_gate"]
      }
    ],
    measurementBoundary: "Use only aggregate event definitions from measurement/event-ownership-map.json. Do not place individual behavior or private content here.",
    externalAction: "forbidden"
  });

  writeJson(tenantRoot, "campaigns/experiment-brief.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    sprintId: `${resolvedTenantId}_marketing_ai_sprint_01`,
    status,
    isSynthetic: false,
    experiment: {
      id: `${resolvedTenantId}_first_value_hypothesis`,
      hypothesis: "A specific evidence-bound invitation may clarify the first value more than generic AI wording.",
      jtbd: "When a person wants to plan a useful next step, they need a clear, bounded invitation.",
      claimRefs: [claimId],
      formats: ["static"],
      destinationId: futureDestination,
      primaryMetric: ctaClickEvent,
      denominator: eligibleViewEvent,
      secondarySignals: ["research_clarity_theme", "voluntary_usefulness_signal"],
      guardrails: [
        "claim_hard_fail",
        "destination_not_connected",
        "missing_consent_review",
        "sensitive_data_or_targeting",
        "human_approval_missing",
        "draft_only_no_external_action"
      ],
      successCriteria: "Not measured until a later, approved telemetry gate.",
      failureCriteria: "Any hard failure or unreviewed claim blocks progression.",
      nextGate: "qa_pass_pending_human"
    },
    execution: {
      channel: "future-review-channel",
      status: "disabled",
      publishing: "forbidden",
      paidSpend: "forbidden",
      outreach: "forbidden",
      accountConnection: "forbidden"
    }
  });

  writeJson(tenantRoot, "learning/learning-note.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    sprintId: `${resolvedTenantId}_marketing_ai_sprint_01`,
    status,
    isSynthetic: false,
    dataSource: "none",
    currentHypotheses: [
      "A tenant-specific, evidence-bound first-value invitation may be clearer than generic AI wording.",
      "Trust, consent, and clarity must be reviewed alongside any activation definition.",
      "No outcome is evidence until instrumentation, consent, and human review are complete."
    ],
    comparisonRule: "Compare tenants only through approved aggregate_deidentified LearningExport records with aligned versions.",
    prohibitedLearningInputs: [
      "customer_identifier",
      "contact_detail",
      "private_content",
      "sensitive_personal_data",
      "raw_ad_platform_data",
      "prompt_or_trace_payload",
      "provider_or_oauth_secret"
    ],
    nextEvidenceNeeded: ["human editorial review", "product truth review", "consented research synthesis", "verified aggregate telemetry"],
    externalAction: "forbidden"
  });

  writeJson(tenantRoot, "briefs/index.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    status,
    isSynthetic: false,
    purpose: "Empty internal experiment brief registry.",
    briefs: [],
    requiredFieldsForEachBrief: ["id", "tenantId", "hypothesis", "claimRefs", "formats", "destinationId", "primaryMetric", "guardrails"],
    sprint01Limit: "Briefs remain internal and cannot authorize an external action.",
    externalAction: "forbidden"
  });

  writeJson(tenantRoot, "content-drafts/index.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    status,
    isSynthetic: false,
    purpose: "Empty internal concept and copy registry.",
    artifactKind: "concept_copy_package",
    artifacts: [],
    requiredFieldsForEachArtifact: ["id", "tenantId", "briefId", "version", "artifactKind", "status", "lifecycleState", "claimRefs", "copy", "visualBrief", "destination", "measurement", "productionRecord", "qa", "approval", "externalReadiness"],
    sprint01Limit: "Artifacts remain internal and cannot authorize an external action.",
    externalAction: "forbidden"
  });

  writeJson(tenantRoot, "approvals/index.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    status,
    isSynthetic: false,
    purpose: "Empty tenant-private review registry.",
    approvalStateMachine: "growth-core/config/approval-state-machine.json",
    approvalOwner,
    records: [],
    sprint01Limit: "No Sprint 01 artifact may transition beyond qa_pass_pending_human.",
    requiredBeforeAnyLaterExecutionEnvelope: ["current_product_truth", "independent_qa_pass", "human_reviewer", "destination_proof", "visual_rights_proof", "target_channel", "approval_expiry", "budget_cap_if_paid"],
    externalAction: "forbidden"
  });

  writeJson(tenantRoot, "onboarding-manifest.json", {
    schemaVersion: "1.0.0",
    tenantId: resolvedTenantId,
    status,
    isSynthetic: false,
    purpose: "Generated completed W0 checklist for the automated validator suite only.",
    frameworkVersion: "1.0.0",
    requiredBeforeW0Pass: [
      ["brand_pack_reviewed", "brand-owner", "brand-pack.json"],
      ["business_pack_reviewed", "growth-owner", "business-pack.json"],
      ["role_mapping_reviewed", "tenant-lead", "role-mapping.json"],
      ["product_truth_verified", "product-truth-owner", "product-truth.json"],
      ["consent_and_data_map_reviewed", "tenant-privacy-owner", "privacy/consent-data-map.json"],
      ["channel_capability_reviewed", "tenant-channel-owner", "channels/capability-matrix.json"],
      ["research_boundary_reviewed", "research-owner", "research/source-register.json"],
      ["measurement_definition_reviewed", "tenant-measurement-owner", "measurement/event-ownership-map.json"],
      ["journey_map_reviewed", "tenant-journey-owner", "journey/journey-map.json"],
      ["risk_register_reviewed", "tenant-privacy-owner", "risk-register.json"],
      ["sprint_readiness_reviewed", "tenant-lead", "readiness.json"],
      ["isolated_data_plane_confirmed", "tenant-platform-owner", "business-pack.json:dataPlane"],
      ["human_approval_owner_assigned", "tenant-lead", "business-pack.json:approvalAuthority"],
      ["incident_owner_assigned", "tenant-lead", "business-pack.json:incidentResponse"]
    ].map(([id, ownerRole, evidence]) => ({ id, ownerRole, evidence, status: "complete" })),
    sprint01Restriction: "No external action is authorized in Sprint 01.",
    crossTenantBoundary: "Only approved aggregate_deidentified LearningExport records may be compared across tenants.",
    prohibitedInputs: ["customer_identifier", "contact_detail", "private_conversation", "sensitive_personal_data", "provider_or_oauth_secret", "raw_ad_platform_data", "unlicensed_source_material"]
  });

  fs.writeFileSync(
    path.join(tenantRoot, "README.md"),
    `# Generated tenant test workspace\n\nThis generated workspace exists only inside the automated framework suite. It validates the internal draft-only path and grants no external execution authority.\n`,
    "utf8"
  );

  return { tenantId: resolvedTenantId, status, externalExecution: "forbidden" };
};
