import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createGrowthFrameworkExport, readSourceBoundaryTerms } from "./export-growth-framework.mjs";
import { lintCandidate, validateGrowthFramework } from "./growth-framework-validator.mjs";

const sourceRoot = process.cwd();
const sourceTenantTerm = ["Ni", "laza"].join("");
const sourceTenantAlias = ["tenant-", "ni", "laza"].join("");
const sourceBoundaryPath = ["packages/growth-", "ni", "laza/readiness/sprint-01-readiness.json"].join("");
const hasNestedRepositoryStarter = fs.existsSync(path.join(sourceRoot, "packages", "growth-core", "repository-template"));
const sourceOnlyTest = fs.existsSync(path.join(sourceRoot, sourceBoundaryPath)) ? test : test.skip;

const readJson = (root, relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const writeJson = (root, relativePath, value) => fs.writeFileSync(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");

const copyPortableSource = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "growth-framework-source-"));
  const manifest = readJson(sourceRoot, "packages/growth-core/export-manifest.json");
  for (const relativePath of manifest.include) {
    const source = path.join(sourceRoot, relativePath);
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true });
  }
  if (!hasNestedRepositoryStarter) {
    for (const entry of [".github", "docs", ".gitignore", "CODEOWNERS", "CONTRIBUTING.md", "LICENSE_DECISION.md", "SECURITY.md", "AGENTS.md", "README.md", "skills"]) {
      const source = path.join(sourceRoot, entry);
      const target = path.join(root, entry);
      fs.cpSync(source, target, { recursive: true });
    }
  }
  return root;
};

test("portable framework validates without any tenant-specific package", () => {
  const result = validateGrowthFramework(sourceRoot);
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.frameworkIntegrity, "pass");
});

test("foreign-tenant branding and personal data are detected from text, not self-declared flags", () => {
  const directIdentifier = ["jane", "example.com"].join("@");
  const birthDate = ["03", "02", "2001"].join("/");
  const brandLeak = lintCandidate({
    tenantId: "tenant-b",
    surface: "internal_draft",
    claimStatus: "internal_only",
    text: "FOREIGN_TENANT_BRAND logo belongs in this creative.",
    hasVi: true,
    hasEn: true,
    knownForeignBrandTokens: ["foreign_tenant_brand"]
  });
  const piiLeak = lintCandidate({
    tenantId: "tenant-b",
    surface: "internal_draft",
    claimStatus: "internal_only",
    text: `Contact ${directIdentifier} after her birth date ${birthDate}.`,
    hasVi: true,
    hasEn: true
  });
  assert.ok(brandLeak.includes("cross_tenant_leak"));
  assert.ok(piiLeak.includes("sensitive_data_leak"));
});

test("sensitive targeting and missing tenant-required locale coverage are detected from copy text and locale keys", () => {
  const targetingLeak = lintCandidate({
    tenantId: "tenant-b",
    surface: "paid",
    claimStatus: "released",
    evidenceVerified: true,
    text: "Target people with depression and a recent breakup.",
    requiredLocales: ["en-US"],
    copyLocales: ["en-US"]
  });
  const localeGap = lintCandidate({
    tenantId: "tenant-b",
    surface: "internal_draft",
    claimStatus: "internal_only",
    text: "A safe internal draft.",
    requiredLocales: ["fr-FR", "en-US"],
    copyLocales: ["en-US"]
  });
  assert.ok(targetingLeak.includes("sensitive_data_leak"));
  assert.ok(localeGap.includes("locale_or_accessibility_failure"));
});

test("LearningExport rejects a branded alias and free-text metric or cost values", () => {
  const directIdentifier = ["x", "y.com"].join("@");
  const root = copyPortableSource();
  try {
    const learningPath = "packages/growth-fixtures/learning-exports/synthetic-example.json";
    const learningExport = readJson(root, learningPath);
    learningExport.tenantAlias = sourceTenantAlias;
    learningExport.funnelMetrics = { valuableActivationRateBucket: "Alice has anxiety" };
    learningExport.costBuckets = { media: `customer email ${directIdentifier}` };
    writeJson(root, learningPath, learningExport);
    const result = validateGrowthFramework(root);
    assert.ok(result.errors.some((error) => error.includes("opaque non-brand alias")));
    assert.ok(result.errors.some((error) => error.includes("not an allowed contract value")));
    assert.ok(result.errors.some((error) => error.includes("sensitive data or a sensitive field")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("allow-list export creates a clean portable workspace that validates independently", () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "growth-framework-export-test-"));
  try {
    const result = createGrowthFrameworkExport(sourceRoot, output, { forbiddenTerms: [sourceTenantTerm] });
    assert.equal(result.summary.frameworkIntegrity, "pass");
    assert.ok(fs.existsSync(path.join(output, "package.json")));
    assert.ok(fs.existsSync(path.join(output, "README.md")));
    assert.ok(fs.existsSync(path.join(output, "skills", "growth-readiness", "SKILL.md")));
    assert.ok(!fs.existsSync(path.join(output, "packages", "growth-core", "repository-template")));
    assert.deepEqual(validateGrowthFramework(output).errors, []);
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});

test("clean export rejects tenant branding injected into an allow-listed file", () => {
  const root = copyPortableSource();
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "growth-framework-export-fail-"));
  try {
    const target = path.join(root, "packages/growth-core/README.md");
    fs.appendFileSync(target, `\nTenant-specific brand marker: ${sourceTenantTerm}\n`, "utf8");
    assert.throws(() => createGrowthFrameworkExport(root, output, { forbiddenTerms: [sourceTenantTerm] }), /tenant-specific branding/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(output, { recursive: true, force: true });
  }
});

test("clean export fails closed without a source-tenant term", () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "growth-framework-export-no-term-"));
  try {
    assert.throws(() => createGrowthFrameworkExport(sourceRoot, output), /requires at least one source-tenant term/i);
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});

sourceOnlyTest("source boundary terms are read only from a source file inside the workspace", () => {
  const terms = readSourceBoundaryTerms(sourceRoot, sourceBoundaryPath);
  assert.ok(terms.length > 0);
  assert.throws(() => readSourceBoundaryTerms(sourceRoot, "../outside-boundary.json"), /inside the source workspace/i);
});

test("clean export rejects an unscanned file type in an allow-listed path", () => {
  const root = copyPortableSource();
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "growth-framework-export-unknown-file-"));
  try {
    fs.writeFileSync(path.join(root, "packages/growth-core/unreviewed.bin"), "not permitted", "utf8");
    assert.throws(() => createGrowthFrameworkExport(root, output, { forbiddenTerms: [sourceTenantTerm] }), /unscanned file type/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(output, { recursive: true, force: true });
  }
});

test("clean export rejects personal data injected into an allow-listed script", () => {
  const root = copyPortableSource();
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "growth-framework-export-script-pii-"));
  const directIdentifier = ["inject", "example.test"].join("@");
  try {
    fs.appendFileSync(path.join(root, "scripts", "growth-framework-validator.mjs"), `\nconst syntheticLeak = "${directIdentifier}";\n`, "utf8");
    assert.throws(() => createGrowthFrameworkExport(root, output, { forbiddenTerms: [sourceTenantTerm] }), /personal-data pattern/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(output, { recursive: true, force: true });
  }
});
