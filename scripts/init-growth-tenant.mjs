import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(import.meta.url);
const placeholderPattern = /__TENANT_SLUG__/g;
const isSupportedScaffoldFile = (filePath) => /\.(?:json|md)$/i.test(filePath);

export const isValidTenantSlug = (value) => /^[a-z][a-z0-9-]{1,62}$/.test(value || "");

const listFiles = (root) => {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Tenant scaffold cannot contain symbolic links: ${entryPath}`);
    if (entry.isDirectory()) files.push(...listFiles(entryPath));
    else if (entry.isFile()) {
      if (!isSupportedScaffoldFile(entryPath)) throw new Error(`Tenant scaffold contains an unsupported file type: ${entryPath}`);
      files.push(entryPath);
    }
    else throw new Error(`Tenant scaffold contains an unsupported filesystem entry: ${entryPath}`);
  }
  return files;
};

const pathIsInside = (candidate, parent) => {
  if (path.parse(candidate).root.toLowerCase() !== path.parse(parent).root.toLowerCase()) return false;
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
};

const assertNoSymbolicLinkAncestor = (candidate) => {
  let current = path.resolve(candidate);
  while (true) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`Tenant initializer will not write through a symbolic link: ${current}`);
    }
    const next = path.dirname(current);
    if (next === current) break;
    current = next;
  }
};

const assertEmptyTarget = (outputRoot) => {
  const resolvedOutput = path.resolve(outputRoot);
  assertNoSymbolicLinkAncestor(resolvedOutput);
  if (fs.existsSync(resolvedOutput) && fs.lstatSync(resolvedOutput).isSymbolicLink()) {
    throw new Error(`Tenant initializer will not use a symbolic-link target: ${resolvedOutput}`);
  }
  if (fs.existsSync(resolvedOutput) && !fs.lstatSync(resolvedOutput).isDirectory()) {
    throw new Error(`Tenant initializer target must be a directory: ${resolvedOutput}`);
  }
  if (fs.existsSync(resolvedOutput) && fs.readdirSync(resolvedOutput).length > 0) {
    throw new Error(`Tenant initializer will not overwrite a non-empty directory: ${resolvedOutput}`);
  }
  return resolvedOutput;
};

export const initializeGrowthTenant = ({ workspaceRoot = process.cwd(), tenantId, outputRoot }) => {
  if (!isValidTenantSlug(tenantId)) {
    throw new Error("Tenant id must use lowercase letters, digits and hyphens, start with a letter, and be 2–63 characters long.");
  }
  if (!outputRoot) throw new Error("Tenant initializer requires --output <directory>.");
  const resolvedWorkspace = path.resolve(workspaceRoot);
  const scaffoldRoot = path.join(resolvedWorkspace, "packages/growth-fixtures/tenant-template/scaffold");
  if (!fs.existsSync(scaffoldRoot)) throw new Error(`Tenant scaffold does not exist: ${scaffoldRoot}`);
  if (fs.lstatSync(scaffoldRoot).isSymbolicLink()) throw new Error(`Tenant scaffold cannot be a symbolic link: ${scaffoldRoot}`);
  const targetRoot = assertEmptyTarget(outputRoot);
  if (pathIsInside(targetRoot, scaffoldRoot) || pathIsInside(scaffoldRoot, targetRoot)) {
    throw new Error("Tenant initializer target may not overlap the source scaffold.");
  }
  const sourceFiles = listFiles(scaffoldRoot);
  fs.mkdirSync(targetRoot, { recursive: true });
  for (const sourceFile of sourceFiles) {
    const relativePath = path.relative(scaffoldRoot, sourceFile);
    const targetFile = path.join(targetRoot, relativePath);
    const text = fs.readFileSync(sourceFile, "utf8").replaceAll(placeholderPattern, tenantId);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, text, "utf8");
  }
  return { tenantId, outputRoot: targetRoot, fileCount: sourceFiles.length };
};

const runAsCli = () => {
  const tenantIndex = process.argv.indexOf("--tenant");
  const outputIndex = process.argv.indexOf("--output");
  try {
    const result = initializeGrowthTenant({
      tenantId: tenantIndex >= 0 ? process.argv[tenantIndex + 1] : null,
      outputRoot: outputIndex >= 0 ? process.argv[outputIndex + 1] : null
    });
    console.log(`Created draft-only tenant scaffold for ${result.tenantId}: ${result.outputRoot}`);
    console.log(`Copied ${result.fileCount} generic files. Run tenant validation to see the required owner/evidence fields before W0.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
};

if (path.resolve(process.argv[1] || "") === path.resolve(modulePath)) runAsCli();
