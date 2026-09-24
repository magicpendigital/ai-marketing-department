import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { materializeSyntheticReadyTenant } from "./growth-tenant-demo.mjs";
import { initializeGrowthTenant } from "./init-growth-tenant.mjs";
import { prepareGrowthJob } from "./prepare-growth-job.mjs";

const workspaceRoot = process.cwd();

const withReadyTenant = (callback) => {
  const tenantRoot = fs.mkdtempSync(path.join(os.tmpdir(), "growth-job-test-"));
  try {
    initializeGrowthTenant({ workspaceRoot, tenantId: "example-ai", outputRoot: tenantRoot });
    materializeSyntheticReadyTenant({ tenantRoot, tenantId: "example-ai" });
    callback(tenantRoot);
  } finally {
    fs.rmSync(tenantRoot, { recursive: true, force: true });
  }
};

test("a ready tenant can prepare a bounded internal content job without invoking a provider", () => {
  withReadyTenant((tenantRoot) => {
    const outputPath = path.join(tenantRoot, "jobs", "content-draft-001.json");
    const job = prepareGrowthJob({
      tenantRoot,
      workflowId: "W2_content_factory",
      outputPath,
      jobId: "content-draft-001",
      adapterMode: "disabled"
    });
    assert.equal(job.mode, "draft_only");
    assert.equal(job.outputArtifactType, "concept_copy_package");
    assert.equal(job.adapterMode, "disabled");
    assert.equal(job.lifecycleState, "prepared");
    assert.equal(job.handoff.transport, "none");
    assert.equal(job.promptVersion, "owner_configured_required");
    assert.deepEqual(job.requiredNextSteps, ["redact_and_store_internal_draft", "run_deterministic_lint", "run_independent_qa", "await_human_decision"]);
    assert.ok(fs.existsSync(outputPath));
    assert.match(job.hardStop, /cannot invoke a provider/i);
    const rootOutputPath = path.join(tenantRoot, "root-draft-001.json");
    prepareGrowthJob({
      tenantRoot,
      workflowId: "W0_readiness",
      outputPath: rootOutputPath,
      jobId: "root-draft-001",
      adapterMode: "disabled"
    });
    assert.ok(fs.existsSync(rootOutputPath));
  });
});

test("coding-agent handoff creates a provider-neutral work order without requesting a key or promising headless authentication", () => {
  withReadyTenant((tenantRoot) => {
    const outputPath = path.join(tenantRoot, "jobs", "coding-agent-content-001.json");
    const job = prepareGrowthJob({
      tenantRoot,
      workflowId: "W2_content_factory",
      outputPath,
      jobId: "coding-agent-content-001",
      adapterMode: "coding_agent_handoff",
      targetChannels: ["facebook"],
      mediaDeliveryRequirement: "required",
      w2ProductionOrder: ["media", "copy"]
    });

    assert.equal(job.workOrderVersion, "1.0.0");
    assert.equal(job.lifecycleState, "prepared");
    assert.equal(job.requestedCapability, "content_authoring");
    assert.equal(job.assignedAgentRole, "content_studio");
    assert.deepEqual(job.subagentTemplateIds, ["brief_expander", "locale_editor", "media_asset_producer", "visual_accessibility_brief_checker", "post_assembler"]);
    assert.deepEqual(job.targetChannels, ["facebook"]);
    assert.equal(job.mediaDeliveryRequirement, "required");
    assert.deepEqual(job.w2ProductionOrder, ["media", "copy"]);
    assert.equal(job.managerReview.decisionRequired, "editor_or_owner_decision");
    assert.ok(job.managerReview.checklist.length >= 4);
    assert.equal(job.promptVersion, "repository_instructions_and_skill_contract_1");
    assert.equal(job.handoff.adapterMode, "coding_agent_handoff");
    assert.equal(job.handoff.transport, "tenant_scoped_json_work_order");
    assert.equal(job.handoff.requiresUserInitiation, true);
    assert.equal(job.handoff.credentialPolicy, "framework_accepts_no_provider_credentials");
    assert.equal(job.handoff.headlessAuthentication, "not_implemented_or_promised");
    assert.match(job.handoff.nextAction, /user-authorized Coding Agent session/i);
    assert.match(job.handoff.nextAction, /does not log in or operate the subscription headlessly/i);
    assert.deepEqual(job.requiredNextSteps.slice(0, 3), ["make_work_order_available_for_handoff", "user_initiates_coding_agent_session", "coding_agent_claims_job"]);

    const persisted = fs.readFileSync(outputPath, "utf8");
    assert.deepEqual(JSON.parse(persisted), job);
    assert.doesNotMatch(persisted, /provider_api_key|oauth_token|subscription_token/i);
  });
});

test("W2 work orders freeze explicitly selected channels and an allowlisted sub-agent assignment", () => {
  withReadyTenant((tenantRoot) => {
    const jobId = "channel-assignment-001";
    const job = prepareGrowthJob({
      tenantRoot,
      workflowId: "W2_content_factory",
      outputPath: path.join(tenantRoot, "jobs", `${jobId}.json`),
      jobId,
      adapterMode: "coding_agent_handoff",
      targetChannels: ["instagram", "blog"],
      subagentTemplateIds: ["locale_editor"]
    });
    assert.deepEqual(job.targetChannels, ["instagram", "blog"]);
    assert.deepEqual(job.subagentTemplateIds, ["locale_editor"]);
    assert.match(job.taskDescription, /separate, channel-specific content package/i);
    assert.match(job.taskDescription, /tag every copy and media item with its channelId/i);
    assert.throws(() => prepareGrowthJob({
      tenantRoot,
      workflowId: "W2_content_factory",
      outputPath: path.join(tenantRoot, "jobs", "invalid-channel-001.json"),
      jobId: "invalid-channel-001",
      targetChannels: ["x-social"]
    }), /supported channel ids/i);
    assert.throws(() => prepareGrowthJob({
      tenantRoot,
      workflowId: "W2_content_factory",
      outputPath: path.join(tenantRoot, "jobs", "invalid-agent-001.json"),
      jobId: "invalid-agent-001",
      subagentTemplateIds: ["unreviewed_agent"]
    }), /approved content-team roster/i);
  });
});

test("work-order role, subagent and manager-review metadata are defined for every supported workflow", () => {
  withReadyTenant((tenantRoot) => {
    const workflows = ["W0_readiness", "W1_research_to_plan", "W2_content_factory", "W6_learning_to_product"];
    workflows.forEach((workflowId, index) => {
      const jobId = `workflow-metadata-${index + 1}`;
      const job = prepareGrowthJob({
        tenantRoot,
        workflowId,
        outputPath: path.join(tenantRoot, "jobs", `${jobId}.json`),
        jobId,
        adapterMode: "coding_agent_handoff"
      });
      assert.ok(job.requestedCapability.length > 0);
      assert.ok(job.assignedAgentRole.length > 0);
      assert.ok(job.subagentTemplateIds.length >= 3);
      assert.ok(job.taskDescription.length > 40);
      assert.ok(job.managerReview.decisionRequired.length > 0);
      assert.ok(job.managerReview.checklist.length >= 4);
    });
  });
});

test("job preparation rejects an unknown adapter without weakening supported legacy modes", () => {
  withReadyTenant((tenantRoot) => {
    assert.throws(
      () => prepareGrowthJob({ tenantRoot, workflowId: "W2_content_factory", outputPath: path.join(tenantRoot, "jobs", "bad-adapter.json"), jobId: "bad-adapter", adapterMode: "automatic_subscription_login" }),
      /disabled, mock, owner_configured, or coding_agent_handoff/i
    );
    for (const [index, adapterMode] of ["disabled", "mock", "owner_configured"].entries()) {
      const jobId = `legacy-adapter-${index + 1}`;
      const job = prepareGrowthJob({ tenantRoot, workflowId: "W1_research_to_plan", outputPath: path.join(tenantRoot, "jobs", `${jobId}.json`), jobId, adapterMode });
      assert.equal(job.adapterMode, adapterMode);
      assert.equal(job.promptVersion, "owner_configured_required");
    }
  });
});

test("job preparation refuses an output outside the private tenant workspace", () => {
  withReadyTenant((tenantRoot) => {
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "growth-job-outside-"));
    try {
      assert.throws(
        () => prepareGrowthJob({ tenantRoot, workflowId: "W1_research_to_plan", outputPath: path.join(outsideRoot, "job.json"), jobId: "research-job-001" }),
        /inside the tenant workspace/i
      );
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });
});

test("job preparation refuses an existing tenant subdirectory link that escapes the workspace", (t) => {
  withReadyTenant((tenantRoot) => {
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "growth-job-link-outside-"));
    const linkPath = path.join(tenantRoot, "jobs", "escape");
    try {
      fs.mkdirSync(path.dirname(linkPath), { recursive: true });
      try {
        fs.symlinkSync(outsideRoot, linkPath, process.platform === "win32" ? "junction" : "dir");
      } catch (error) {
        t.skip(`The current filesystem cannot create a directory link for this containment test: ${error.code || error.message}`);
        return;
      }
      const escapedOutput = path.join(linkPath, "escaped-job.json");
      assert.throws(
        () => prepareGrowthJob({ tenantRoot, workflowId: "W2_content_factory", outputPath: escapedOutput, jobId: "escaped-job-001" }),
        /symbolic link|escapes the tenant workspace|link or junction/i
      );
      assert.equal(fs.existsSync(path.join(outsideRoot, "escaped-job.json")), false);
    } finally {
      if (fs.existsSync(linkPath) || (() => {
        try {
          return Boolean(fs.lstatSync(linkPath));
        } catch {
          return false;
        }
      })()) {
        fs.unlinkSync(linkPath);
      }
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });
});

test("job preparation refuses an incomplete tenant and unsafe job id", () => {
  const tenantRoot = fs.mkdtempSync(path.join(os.tmpdir(), "growth-job-incomplete-"));
  try {
    initializeGrowthTenant({ workspaceRoot, tenantId: "example-ai", outputRoot: tenantRoot });
    assert.throws(
      () => prepareGrowthJob({ tenantRoot, workflowId: "W0_readiness", outputPath: path.join(tenantRoot, "jobs", "readiness-job-001.json"), jobId: "readiness-job-001" }),
      /not ready for an internal job/i
    );
    assert.throws(
      () => prepareGrowthJob({ tenantRoot, workflowId: "W0_readiness", outputPath: path.join(tenantRoot, "jobs", "bad.json"), jobId: "Bad Id" }),
      /Job id must use lowercase/i
    );
  } finally {
    fs.rmSync(tenantRoot, { recursive: true, force: true });
  }
});
