import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export class CanvasHttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "CanvasHttpError";
    this.status = status;
    this.code = code;
  }
}

const normalizedPath = (value) => {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

export const isSameOrInside = (candidate, parent) => {
  const candidateRoot = path.parse(candidate).root;
  const parentRoot = path.parse(parent).root;
  if (normalizedPath(candidateRoot) !== normalizedPath(parentRoot)) return false;
  const relative = path.relative(parent, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

const lstatIfPresent = (target) => {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

export const assertSafeWorkspace = (workspace) => {
  if (typeof workspace !== "string" || workspace.trim() === "") {
    throw new Error("A private tenant workspace is required. Use --workspace or GROWTH_CANVAS_WORKSPACE.");
  }
  const resolved = path.resolve(workspace);
  const entry = lstatIfPresent(resolved);
  if (entry?.isSymbolicLink()) throw new Error("Canvas workspace may not be a symbolic link or junction.");
  if (!entry?.isDirectory()) throw new Error(`Canvas workspace is not a directory: ${resolved}`);

  const physical = fs.realpathSync.native(resolved);
  if (normalizedPath(physical) !== normalizedPath(resolved)) {
    throw new Error("Canvas workspace may not traverse a symbolic link or junction.");
  }
  return physical;
};

export const resolveInsideWorkspace = (workspace, ...segments) => {
  if (segments.some((segment) => typeof segment !== "string" || segment.includes("\0") || path.isAbsolute(segment))) {
    throw new Error("Workspace-relative paths must be non-empty relative path segments.");
  }
  const candidate = path.resolve(workspace, ...segments);
  if (!isSameOrInside(candidate, workspace) || normalizedPath(candidate) === normalizedPath(workspace)) {
    throw new Error("Resolved path must remain inside the selected tenant workspace.");
  }
  return candidate;
};

export const ensureSafeDirectory = (workspace, ...segments) => {
  let current = workspace;
  const physicalWorkspace = fs.realpathSync.native(workspace);
  for (const segment of segments) {
    if (segment.includes("\0") || path.isAbsolute(segment) || segment === ".." || segment.includes("/") || segment.includes("\\")) {
      throw new Error("Directory segments must be simple workspace-relative names.");
    }
    current = resolveInsideWorkspace(workspace, path.relative(workspace, current), segment);
    const entry = lstatIfPresent(current);
    if (entry) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw new Error(`Unsafe workspace directory: ${current}`);
      }
    } else {
      fs.mkdirSync(current, { mode: 0o700 });
    }
    const physical = fs.realpathSync.native(current);
    if (!isSameOrInside(physical, physicalWorkspace)) {
      throw new Error(`Workspace directory escapes through a link or junction: ${current}`);
    }
  }
  return current;
};

export const assertSafeExistingDirectory = (workspace, candidate) => {
  if (!isSameOrInside(candidate, workspace) || normalizedPath(candidate) === normalizedPath(workspace)) {
    throw new Error("Directory must remain inside the tenant workspace.");
  }
  const entry = lstatIfPresent(candidate);
  if (!entry?.isDirectory() || entry.isSymbolicLink()) throw new Error(`Unsafe job directory: ${candidate}`);
  const physical = fs.realpathSync.native(candidate);
  const physicalWorkspace = fs.realpathSync.native(workspace);
  if (!isSameOrInside(physical, physicalWorkspace)) throw new Error("Job directory escapes through a link or junction.");
  return physical;
};

export const assertLoopbackHost = (host) => {
  const normalized = String(host || "").trim().toLowerCase();
  if (!["127.0.0.1", "localhost", "::1"].includes(normalized)) {
    throw new Error("Growth Canvas may bind only to a loopback address.");
  }
  return normalized;
};

const requestAuthority = (request) => {
  const hostHeader = request.headers.host;
  if (!hostHeader) throw new CanvasHttpError(400, "invalid_host", "Host header is required.");
  let parsed;
  try {
    parsed = new URL(`http://${hostHeader}`);
  } catch {
    throw new CanvasHttpError(400, "invalid_host", "Host header is invalid.");
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new CanvasHttpError(403, "non_loopback_host", "Canvas accepts loopback hosts only.");
  }
  return `http://${hostHeader.toLowerCase()}`;
};

const secretsMatch = (supplied, expected) => {
  if (typeof supplied !== "string" || typeof expected !== "string" || supplied.length === 0 || expected.length === 0) return false;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
};

export const assertRequestSecurity = (request, { accessCapability, mutationNonce, mutation = false, requireCapability = false } = {}) => {
  const authority = requestAuthority(request);
  if (requireCapability && !secretsMatch(request.headers["x-canvas-capability"], accessCapability)) {
    throw new CanvasHttpError(401, "access_capability_rejected", "Open Canvas from the private local URL printed when the server starts.");
  }
  if (!mutation) return;
  const origin = request.headers.origin;
  if (!origin || origin.toLowerCase() !== authority) {
    throw new CanvasHttpError(403, "origin_rejected", "Mutation requests must come from the Canvas same origin.");
  }
  const suppliedNonce = request.headers["x-canvas-nonce"];
  if (!secretsMatch(suppliedNonce, mutationNonce)) {
    throw new CanvasHttpError(403, "nonce_rejected", "Mutation request token is missing or invalid.");
  }
};

export const readJsonBody = async (request, { maxBytes = 64 * 1024 } = {}) => {
  const contentType = String(request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new CanvasHttpError(415, "json_required", "Mutation requests require application/json.");
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) throw new CanvasHttpError(413, "request_too_large", "Request body is too large.");
    chunks.push(chunk);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new CanvasHttpError(400, "invalid_json", "Request body must contain valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CanvasHttpError(400, "object_required", "Request body must be a JSON object.");
  }
  return value;
};

export const assertExactKeys = (value, allowedKeys) => {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new CanvasHttpError(400, "unknown_fields", `Unsupported request fields: ${unknown.join(", ")}.`);
  }
};
