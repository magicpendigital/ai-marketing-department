import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { containsSensitiveData, validateGrowthFramework } from "./growth-framework-validator.mjs";

const modulePath = fileURLToPath(import.meta.url);

const readJson = (workspaceRoot, relativePath) => JSON.parse(fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8"));
const isTextFile = (filePath) => /\.(?:json|mjs|md|txt|ya?ml|toml|csv|js|jsx|css|html|sh)$/i.test(filePath) || ["package.json", ".gitignore", ".npmrc", "CODEOWNERS"].includes(path.basename(filePath));
const sha256File = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const isTransientExportPath = (relativePath) => /(?:^|\/)(?:node_modules|dist|coverage|\.vite)(?:\/|$)/i.test(relativePath.replaceAll("\\", "/"));

const textWithoutDetectorDefinition = (relativePath, text) => {
  if (relativePath !== "scripts/growth-framework-validator.mjs") return text;
  return text.replace(/export const containsSensitiveData = \(value\) => \{[\s\S]*?\n\};/, "");
};

const listFiles = (root) => {
  const entries = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Clean export does not permit symbolic links: ${entryPath}`);
    if (entry.isDirectory()) entries.push(...listFiles(entryPath));
    else if (entry.isFile()) entries.push(entryPath);
  }
  return entries;
};

const assertSymlinkFree = (targetPath) => {
  const stat = fs.lstatSync(targetPath);
  if (stat.isSymbolicLink()) throw new Error(`Clean export does not permit symbolic links: ${targetPath}`);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath)) assertSymlinkFree(path.join(targetPath, entry));
  }
};

const materializeRepositoryTemplate = (outputRoot, sourceWorkspaceRoot) => {
  const templateRoot = path.join(outputRoot, "packages", "growth-core", "repository-template");
  const starterEntries = [".github", "docs", ".gitignore", "CODEOWNERS", "CONTRIBUTING.md", "LICENSE_DECISION.md", "SECURITY.md", "AGENTS.md", "README.md", "skills"];
  const sourceRoot = fs.existsSync(templateRoot) ? templateRoot : sourceWorkspaceRoot;
  if (!fs.existsSync(templateRoot) && !starterEntries.every((entry) => fs.existsSync(path.join(sourceRoot, entry)))) {
    throw new Error("Portable export is missing the repository starter template.");
  }
  for (const entry of starterEntries) {
    const source = path.join(sourceRoot, entry);
    const target = path.join(outputRoot, entry);
    assertSymlinkFree(source);
    if (source === target) continue;
    if (fs.existsSync(target)) throw new Error(`Repository starter template collides with an exported root path: ${entry}`);
    fs.cpSync(source, target, { recursive: true });
  }
  if (fs.existsSync(templateRoot)) fs.rmSync(templateRoot, { recursive: true, force: true });
};

const assertCleanText = (root, forbiddenTerms) => {
  const violations = [];
  const binaryManifestPath = path.join(root, "packages", "growth-canvas", "public", "assets", "asset-integrity.json");
  const approvedBinaries = new Map();
  if (fs.existsSync(binaryManifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(binaryManifestPath, "utf8"));
    for (const asset of manifest.assets || []) {
      const relativePath = path.posix.join("packages/growth-canvas/public/assets", asset.path || "");
      if (!/^packages\/growth-canvas\/public\/assets\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpe?g|webp)$/i.test(relativePath)) {
        violations.push(`${relativePath}: binary asset manifest path is invalid`);
        continue;
      }
      if (!/^[a-f0-9]{64}$/.test(asset.sha256 || "") || asset.tenantNeutralReview !== "passed" || asset.rights !== "generated_asset_for_framework_distribution") {
        violations.push(`${relativePath}: binary asset lacks an approved integrity and rights record`);
        continue;
      }
      approvedBinaries.set(relativePath, asset.sha256);
    }
  }
  const seenApprovedBinaries = new Set();
  const normalizedForbiddenTerms = (forbiddenTerms || [])
    .filter((term) => typeof term === "string" && term.trim().length > 0)
    .map((term) => term.trim().toLowerCase());
  for (const filePath of listFiles(root)) {
    const relativePath = path.relative(root, filePath).replaceAll("\\", "/");
    if (!isTextFile(filePath)) {
      const expectedHash = approvedBinaries.get(relativePath);
      if (!expectedHash) {
        violations.push(`${filePath}: has an unscanned file type`);
      } else if (sha256File(filePath) !== expectedHash) {
        violations.push(`${relativePath}: binary asset hash differs from its reviewed integrity record`);
      } else {
        seenApprovedBinaries.add(relativePath);
      }
      continue;
    }
    const text = fs.readFileSync(filePath, "utf8");
    const normalizedText = text.toLowerCase();
    if (normalizedForbiddenTerms.some((term) => normalizedText.includes(term))) {
      violations.push(`${filePath}: contains tenant-specific branding`);
    }
    const isSyntheticQaFixture = relativePath === "packages/growth-fixtures/qa/adversarial-fixtures.json" && /"isSynthetic"\s*:\s*true/.test(text);
    const isDependencyLock = relativePath === "package-lock.json";
    if (containsSensitiveData(textWithoutDetectorDefinition(relativePath, text)) && !isSyntheticQaFixture && !isDependencyLock) {
      violations.push(`${filePath}: contains a personal-data pattern`);
    }
    if (/(?:sk-[a-z0-9]{16,}|(?:api[_-]?key|authorization|bearer)\s*[:=]\s*["']?[^\s"']{8,})/i.test(text)) {
      violations.push(`${filePath}: contains a credential-like pattern`);
    }
  }
  for (const relativePath of approvedBinaries.keys()) {
    if (!seenApprovedBinaries.has(relativePath)) violations.push(`${relativePath}: reviewed binary asset is missing from the export`);
  }
  if (violations.length) throw new Error(`Clean export check failed:\n${violations.map((item) => `- ${item}`).join("\n")}`);
};

export const readSourceBoundaryTerms = (workspaceRoot, sourceBoundaryPath) => {
  const resolvedWorkspace = path.resolve(workspaceRoot);
  const resolvedBoundary = path.resolve(resolvedWorkspace, sourceBoundaryPath);
  if (!resolvedBoundary.startsWith(`${resolvedWorkspace}${path.sep}`)) {
    throw new Error("Source boundary must be inside the source workspace.");
  }
  if (!fs.existsSync(resolvedBoundary)) throw new Error(`Source boundary does not exist: ${sourceBoundaryPath}`);
  const boundary = JSON.parse(fs.readFileSync(resolvedBoundary, "utf8"));
  const tokens = boundary.identityBoundary?.ownBrandTokens;
  if (!Array.isArray(tokens) || !tokens.some((term) => typeof term === "string" && term.trim().length > 0)) {
    throw new Error("Source boundary must declare at least one identityBoundary.ownBrandTokens value.");
  }
  return tokens;
};

export const createGrowthFrameworkExport = (workspaceRoot, outputRoot, { forbiddenTerms = [] } = {}) => {
  if (!forbiddenTerms.some((term) => typeof term === "string" && term.trim().length > 0)) {
    throw new Error("Clean export requires at least one source-tenant term via forbiddenTerms or --forbid-term.");
  }
  const validation = validateGrowthFramework(workspaceRoot);
  if (validation.errors.length) throw new Error(`Framework cannot be exported:\n${validation.errors.map((item) => `- ${item}`).join("\n")}`);
  if (fs.existsSync(outputRoot) && fs.readdirSync(outputRoot).length > 0) throw new Error(`Export output must be empty: ${outputRoot}`);

  const manifest = readJson(workspaceRoot, "packages/growth-core/export-manifest.json");
  if (manifest.exportMode !== "allow_list_only" || manifest.nonIncludedPathsAreExcluded !== true) {
    throw new Error("Export manifest does not enforce allow-list-only behavior.");
  }

  fs.mkdirSync(outputRoot, { recursive: true });
  for (const relativePath of manifest.include) {
    const source = path.join(workspaceRoot, relativePath);
    const target = path.join(outputRoot, relativePath);
    if (!fs.existsSync(source)) throw new Error(`Allow-listed export path does not exist: ${relativePath}`);
    assertSymlinkFree(source);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, {
      recursive: true,
      filter: (sourcePath) => !isTransientExportPath(path.relative(workspaceRoot, sourcePath))
    });
  }
  fs.copyFileSync(path.join(workspaceRoot, "packages/growth-core/export-root-package.json"), path.join(outputRoot, "package.json"));
  materializeRepositoryTemplate(outputRoot, workspaceRoot);
  assertCleanText(outputRoot, forbiddenTerms);

  const exportedValidation = validateGrowthFramework(outputRoot);
  if (exportedValidation.errors.length) {
    throw new Error(`Exported framework did not validate:\n${exportedValidation.errors.map((item) => `- ${item}`).join("\n")}`);
  }
  return { outputRoot, includedPaths: manifest.include, summary: exportedValidation.summary };
};

const runAsCli = () => {
  const workspaceRoot = process.cwd();
  const dryRun = process.argv.includes("--dry-run");
  const outputIndex = process.argv.indexOf("--output");
  const forbiddenTerms = process.argv.flatMap((value, index) => value === "--forbid-term" && process.argv[index + 1] ? [process.argv[index + 1]] : []);
  const sourceBoundaryIndex = process.argv.indexOf("--source-boundary");
  const sourceBoundaryPath = sourceBoundaryIndex >= 0 ? process.argv[sourceBoundaryIndex + 1] : null;
  const outputRoot = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1] || "") : null;
  if (!dryRun && !outputRoot) {
    console.error("Use --dry-run or --output <empty-directory>. This command creates only a local clean-room export and never creates a GitHub repository.");
    process.exit(1);
  }
  let sourceBoundaryTerms = [];
  try {
    if (sourceBoundaryPath) sourceBoundaryTerms = readSourceBoundaryTerms(workspaceRoot, sourceBoundaryPath);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  const cleanRoomTerms = [...forbiddenTerms, ...sourceBoundaryTerms];
  if (cleanRoomTerms.length === 0) {
    console.error("Provide --source-boundary <tenant-config-or-readiness-file> or at least one --forbid-term <source-tenant-token> so the clean-room scan can prove it excludes the source tenant.");
    process.exit(1);
  }
  const target = dryRun ? fs.mkdtempSync(path.join(os.tmpdir(), "growth-framework-export-")) : outputRoot;
  try {
    const result = createGrowthFrameworkExport(workspaceRoot, target, { forbiddenTerms: cleanRoomTerms });
    console.log(`Growth framework clean export ${dryRun ? "dry run" : "created"}: ${result.outputRoot}`);
    console.log(`Included ${result.includedPaths.length} allow-listed paths; portable validation passed.`);
  } finally {
    if (dryRun && fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  }
};

if (path.resolve(process.argv[1] || "") === path.resolve(modulePath)) runAsCli();
