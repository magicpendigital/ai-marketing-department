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
