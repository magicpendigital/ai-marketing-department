import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workspaceRoot = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8"));

test("contract index exposes both runtime contracts and every reference resolves", () => {
  const indexPath = path.join("packages", "growth-contracts", "contract-index.json");
  const index = readJson(indexPath);
  assert.deepEqual(index.runtimeContracts, [
    "../growth-core/config/agent-runner-contract.json",
    "../growth-core/config/local-agent-bridge.json"
  ]);
  for (const reference of index.runtimeContracts) {
    const resolved = path.resolve(workspaceRoot, "packages", "growth-contracts", reference);
    assert.equal(fs.existsSync(resolved), true, `${reference} must resolve to a runtime contract`);
  }
});

test("runner contract adds coding-agent handoff while preserving legacy adapter compatibility and default safety", () => {
  const contract = readJson("packages/growth-core/config/agent-runner-contract.json");
  assert.equal(contract.defaultAdapterMode, "disabled");
  assert.equal(contract.implementationStatus, "contract_only_no_provider_adapter_included");
  assert.deepEqual(contract.permittedAdapterModes, ["disabled", "mock", "owner_configured", "coding_agent_handoff"]);
  assert.match(contract.adapterSemantics.coding_agent_handoff, /user-initiated Coding Agent session/i);
  assert.match(contract.adapterSemantics.coding_agent_handoff, /does not implement or promise headless subscription authentication/i);
  assert.ok(contract.forbiddenJobInputs.includes("provider_api_key"));
  assert.ok(contract.forbiddenJobInputs.includes("oauth_token"));
  assert.ok(contract.codingAgentHandoffRequiredFields.includes("managerReview"));
  assert.ok(contract.codingAgentHandoffRequiredFields.includes("handoff"));
});

test("local bridge and runner share one complete lifecycle with human-only approval", () => {
  const runner = readJson("packages/growth-core/config/agent-runner-contract.json");
  const bridge = readJson("packages/growth-core/config/local-agent-bridge.json");
  const bridgeStates = bridge.handoffLifecycle.map(({ state }) => state);

  assert.deepEqual(bridgeStates, runner.workOrderLifecycle);
  assert.equal(new Set(bridgeStates).size, bridgeStates.length);
  assert.equal(bridge.defaultAdapterMode, "coding_agent_handoff");
  assert.equal(bridge.transport, "tenant_scoped_json_work_order");
  assert.equal(bridge.executionBoundary.frameworkRequiresProviderApiKey, false);
  assert.equal(bridge.executionBoundary.frameworkAcceptsProviderApiKey, false);
  assert.equal(bridge.executionBoundary.frameworkStoresProviderCredential, false);
  assert.equal(bridge.executionBoundary.userInitiatedAgentSessionRequired, true);
  assert.equal(bridge.executionBoundary.headlessSubscriptionAuthentication, "not_implemented_or_promised");
  assert.equal(bridge.implementationStatus, "structured_manual_handoff_contract_no_headless_invocation");

  const awaitingDecision = bridge.handoffLifecycle.find(({ state }) => state === "awaiting_human_decision");
  const completed = bridge.handoffLifecycle.find(({ state }) => state === "completed_internal");
  assert.equal(awaitingDecision.actor, "named_human_owner");
  assert.equal(completed.actor, "named_human_owner");
  assert.ok(bridge.agentForbiddenReceiptFields.includes("humanApproval"));
  assert.ok(bridge.agentForbiddenReceiptFields.includes("externalExecutionReceipt"));
});

test("local bridge keeps the draft-only external-action hard stops explicit", () => {
  const bridge = readJson("packages/growth-core/config/local-agent-bridge.json");
  const hardStops = bridge.hardStops.join(" ");
  for (const forbiddenAction of ["publish", "schedule", "send", "create a campaign", "upload an audience", "spend money", "modify a product"]) {
    assert.match(hardStops, new RegExp(forbiddenAction, "i"));
  }
  assert.match(hardStops, /may not claim unattended or headless access/i);
  assert.match(hardStops, /may not write a human approval/i);
  assert.match(hardStops, /may not cross tenant boundaries/i);
});

test("independent QA contract separates the tenant-mapped reviewer from the lead receipt", () => {
  const index = readJson("packages/growth-contracts/contract-index.json");
  const qaSchema = readJson("packages/growth-contracts/schemas/independent-qa-verdict.schema.json");
  const receiptSchema = readJson("packages/growth-contracts/schemas/agent-run-receipt.schema.json");
  const runner = readJson("packages/growth-core/config/agent-runner-contract.json");
  assert.ok(index.contracts.includes("schemas/independent-qa-verdict.schema.json"));
  assert.equal(qaSchema.properties.reviewerCapability.const, "quality_assurance");
  assert.ok(qaSchema.required.includes("artifactBindings"));
  assert.ok(qaSchema.required.includes("softScores"));
  assert.equal(receiptSchema.properties.qualityGateStatus.const, "not_run");
  assert.equal(runner.independentQaBoundary.reviewerMustMatchTenantRoleMapping, true);
  assert.equal(runner.independentQaBoundary.reviewerMustDifferFromAssignedAgentRole, true);
  assert.equal(runner.independentQaBoundary.leadReceiptQualityGateStatus, "not_run");
});
