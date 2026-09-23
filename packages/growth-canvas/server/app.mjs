import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import { detectCodingAgentRuntime } from "./runtime-capabilities.mjs";
import {
  CanvasHttpError,
  assertExactKeys,
  assertLoopbackHost,
  assertRequestSecurity,
  isSameOrInside,
  readJsonBody
} from "./security.mjs";
import { createCanvasWorkspaceStore, ownerDecisionBoundary } from "./workspace-store.mjs";

const jsonHeaders = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
});
const uiContentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const staticMimeTypes = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
});

const sendJson = (response, status, value) => {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, { ...jsonHeaders, "Content-Length": Buffer.byteLength(body) });
  response.end(body);
};

const sendError = (response, error) => {
  if (error instanceof CanvasHttpError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } });
    return;
  }
  sendJson(response, 500, { error: { code: "internal_error", message: "Canvas could not complete the local operation." } });
};

const resolveStaticRoot = (candidate) => {
  if (!candidate) return null;
  const resolved = path.resolve(candidate);
  const entry = fs.lstatSync(resolved);
  if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error("Canvas static root must be a real directory, not a symbolic link or junction.");
  const physical = fs.realpathSync.native(resolved);
  const normalizedResolved = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const normalizedPhysical = process.platform === "win32" ? physical.toLowerCase() : physical;
  if (normalizedResolved !== normalizedPhysical) throw new Error("Canvas static root may not traverse a symbolic link or junction.");
  const indexPath = path.join(physical, "index.html");
  const indexEntry = fs.lstatSync(indexPath);
  if (indexEntry.isSymbolicLink() || !indexEntry.isFile()) throw new Error("Canvas static root must contain a regular index.html file.");
  return physical;
};

const staticCandidate = (staticRoot, rawRequestUrl) => {
  const rawPath = String(rawRequestUrl || "/").split(/[?#]/, 1)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    throw new CanvasHttpError(400, "invalid_static_path", "Static request path encoding is invalid.");
  }
  if (decoded.includes("\0") || decoded.includes("\\")) {
    throw new CanvasHttpError(400, "invalid_static_path", "Static request path is invalid.");
  }
  const segments = decoded.split("/").filter(Boolean);
  if (segments.some((segment) => segment === ".." || segment === "." || segment.startsWith("."))) {
    throw new CanvasHttpError(400, "static_path_escape", "Static request path must remain inside the configured UI directory.");
  }
  const candidate = path.resolve(staticRoot, ...segments);
  if (!isSameOrInside(candidate, staticRoot)) {
    throw new CanvasHttpError(400, "static_path_escape", "Static request path must remain inside the configured UI directory.");
  }
  return candidate;
};

const safeStaticFile = (staticRoot, candidate) => {
  if (!isSameOrInside(candidate, staticRoot)) throw new CanvasHttpError(400, "static_path_escape", "Static request path escaped the UI directory.");
  const relative = path.relative(staticRoot, candidate);
  let current = staticRoot;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    let entry;
    try {
      entry = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return null;
      throw error;
    }
    if (entry.isSymbolicLink()) throw new CanvasHttpError(403, "static_link_rejected", "Canvas does not serve static files through links or junctions.");
  }
  const entry = fs.lstatSync(candidate);
  if (!entry.isFile()) return null;
  const physical = fs.realpathSync.native(candidate);
  if (!isSameOrInside(physical, staticRoot)) throw new CanvasHttpError(403, "static_link_rejected", "Canvas static file escaped the configured UI directory.");
  return physical;
};

const serveStatic = (request, response, staticRoot) => {
  if (!staticRoot || !["GET", "HEAD"].includes(request.method || "")) return false;
  const candidate = staticCandidate(staticRoot, request.url);
  let filePath = safeStaticFile(staticRoot, candidate);
  const acceptsHtml = String(request.headers.accept || "").includes("text/html");
  const requestExtension = path.extname(candidate);
  if (!filePath && (acceptsHtml || requestExtension === "")) {
    filePath = safeStaticFile(staticRoot, path.join(staticRoot, "index.html"));
  }
  if (!filePath) return false;
  const body = fs.readFileSync(filePath);
  const headers = {
    "Content-Type": staticMimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": path.basename(filePath) === "index.html" ? "no-store" : "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": uiContentSecurityPolicy
  };
  response.writeHead(200, headers);
  response.end(request.method === "HEAD" ? undefined : body);
  return true;
};

const decodedJobId = (encoded) => {
  try {
    return decodeURIComponent(encoded);
  } catch {
    throw new CanvasHttpError(400, "invalid_job_id", "Job id encoding is invalid.");
  }
};

const routeFor = (pathname) => {
  const mediaPreviewMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/media-preview$/);
  if (mediaPreviewMatch) return { name: "mediaPreview", jobId: decodedJobId(mediaPreviewMatch[1]) };
  const contentRecordMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/content-record$/);
  if (contentRecordMatch) return { name: "contentRecord", jobId: decodedJobId(contentRecordMatch[1]) };
  const reviewBundleMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/review-bundle$/);
  if (reviewBundleMatch) return { name: "reviewBundle", jobId: decodedJobId(reviewBundleMatch[1]) };
  const jobDecisionMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/(?:owner-decision|decision)$/);
  if (jobDecisionMatch) return { name: "ownerDecision", jobId: decodedJobId(jobDecisionMatch[1]) };
  const jobCancelMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/cancel$/);
  if (jobCancelMatch) return { name: "cancel", jobId: decodedJobId(jobCancelMatch[1]) };
  const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (jobMatch) return { name: "job", jobId: decodedJobId(jobMatch[1]) };
  return { name: pathname };
};

export const createCanvasRequestHandler = ({ workspace, accessCapability = crypto.randomBytes(32).toString("base64url"), mutationNonce = crypto.randomBytes(32).toString("base64url"), staticRoot } = {}) => {
  const store = createCanvasWorkspaceStore({ workspace });
  const resolvedStaticRoot = resolveStaticRoot(staticRoot);

  return {
    store,
    accessCapability,
    mutationNonce,
    async handle(request, response) {
      try {
        const url = new URL(request.url || "/", "http://canvas.local");
        const route = routeFor(url.pathname);
        const isMutation = request.method === "POST";
        const isApiRoute = url.pathname === "/api" || url.pathname.startsWith("/api/");
        assertRequestSecurity(request, { accessCapability, mutationNonce, mutation: isMutation, requireCapability: isApiRoute });

        if (request.method === "GET" && route.name === "/api/health") {
          sendJson(response, 200, {
            status: "ok",
            service: "growth-canvas-local-control",
            topology: "single_tenant_per_process",
            tenantId: store.tenantId,
            handoffMode: "manual_coding_agent",
            externalActionAuthority: "none"
          });
          return;
        }

        if (request.method === "GET" && route.name === "/api/bootstrap") {
          const jobs = store.listJobs();
          const managerPresentation = store.managerPresentation(jobs);
          sendJson(response, 200, {
            schemaVersion: "1.0.0",
            mutationNonce,
            ownerDecisionBoundary,
            workspace: store.registry(),
            tenant: store.tenantOverview(),
            readiness: store.readiness({ allowIncomplete: true }),
            runtimeCapabilities: detectCodingAgentRuntime(),
            jobs,
            ...managerPresentation
          });
          return;
        }

        if (request.method === "GET" && route.name === "/api/runtime-capabilities") {
          sendJson(response, 200, detectCodingAgentRuntime());
          return;
        }

        if (request.method === "GET" && route.name === "/api/jobs") {
          sendJson(response, 200, { jobs: store.listJobs() });
          return;
        }

        if (request.method === "GET" && route.name === "job") {
          sendJson(response, 200, store.readJob(route.jobId, { includeEvents: true }));
          return;
        }

        if (request.method === "GET" && route.name === "reviewBundle") {
          sendJson(response, 200, store.readReviewBundle(route.jobId));
          return;
        }

        if (request.method === "GET" && route.name === "contentRecord") {
          sendJson(response, 200, store.readContentRecord(route.jobId));
          return;
        }

        if (request.method === "GET" && route.name === "mediaPreview") {
          const media = store.readArtifactMediaPreview(route.jobId, url.searchParams.get("reference") ?? "");
          response.writeHead(200, {
            "Content-Type": media.mediaType,
            "Content-Length": media.bytes,
            "Cache-Control": "private, no-store",
            "Content-Disposition": "inline; filename=verified-media-preview",
            "Cross-Origin-Resource-Policy": "same-origin",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
            "X-Canvas-Artifact-SHA256": media.hash
          });
          response.end(media.content);
          return;
        }

        if (request.method === "POST" && route.name === "/api/jobs") {
          const body = await readJsonBody(request);
          assertExactKeys(body, ["jobId", "workflowId", "title", "campaignSummary", "managerTaskDescription", "targetChannels", "subagentTemplateIds"]);
          if (body.workflowId !== undefined && body.workflowId !== "W2_content_factory") {
            throw new CanvasHttpError(400, "workflow_not_supported", "Canvas alpha creates W2_content_factory jobs only.");
          }
          const job = store.createW2Job(body);
          sendJson(response, 201, job);
          return;
        }

        if (request.method === "POST" && route.name === "ownerDecision") {
          const body = await readJsonBody(request);
          assertExactKeys(body, ["decision", "reason"]);
          const job = store.recordOwnerDecision(route.jobId, body);
          sendJson(response, 200, job);
          return;
        }

        if (request.method === "POST" && route.name === "cancel") {
          const body = await readJsonBody(request);
          assertExactKeys(body, ["reason"]);
          const job = store.cancelJob(route.jobId, body);
          sendJson(response, 200, job);
          return;
        }

        if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
          throw new CanvasHttpError(404, "endpoint_not_found", "Canvas endpoint does not exist.");
        }
        if (serveStatic(request, response, resolvedStaticRoot)) return;
        throw new CanvasHttpError(404, "not_found", "Resource does not exist.");
      } catch (error) {
        sendError(response, error);
      }
    }
  };
};

export const startCanvasServer = async ({ workspace, host = "127.0.0.1", port = 4310, accessCapability, mutationNonce, staticRoot } = {}) => {
  const safeHost = assertLoopbackHost(host);
  const app = createCanvasRequestHandler({ workspace, accessCapability, mutationNonce, staticRoot });
  const server = http.createServer((request, response) => app.handle(request, response));
  server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, safeHost, resolve);
  });
  const address = server.address();
  const printableHost = safeHost.includes(":") ? `[${safeHost}]` : safeHost;
  const baseUrl = `http://${printableHost}:${address.port}`;
  return {
    server,
    store: app.store,
    accessCapability: app.accessCapability,
    mutationNonce: app.mutationNonce,
    host: safeHost,
    port: address.port,
    baseUrl,
    accessUrl: `${baseUrl}/#access=${encodeURIComponent(app.accessCapability)}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
};

const valuesFor = (argv, flag) => argv.flatMap((value, index) => (value === flag ? [argv[index + 1]] : [])).filter(Boolean);

export const resolveCanvasOptions = ({ argv = process.argv.slice(2), env = process.env } = {}) => {
  const workspaceArguments = valuesFor(argv, "--workspace");
  if (workspaceArguments.length > 1) throw new Error("Canvas accepts exactly one --workspace value per process.");
  const argumentWorkspace = workspaceArguments[0];
  const environmentWorkspace = env.GROWTH_CANVAS_WORKSPACE;
  const invocationDirectory = env.INIT_CWD || process.cwd();
  const resolveWorkspace = (value) => value ? path.resolve(invocationDirectory, value) : undefined;
  if (argumentWorkspace && environmentWorkspace && resolveWorkspace(argumentWorkspace) !== resolveWorkspace(environmentWorkspace)) {
    throw new Error("--workspace and GROWTH_CANVAS_WORKSPACE must not select different tenants.");
  }
  const workspace = resolveWorkspace(argumentWorkspace || environmentWorkspace);
  if (!workspace) throw new Error("Canvas requires --workspace <private-tenant-directory> or GROWTH_CANVAS_WORKSPACE.");
  const portValue = valuesFor(argv, "--port")[0] || env.GROWTH_CANVAS_PORT || "4310";
  if (!/^\d+$/.test(portValue)) throw new Error("Canvas port must be an integer from 0 to 65535.");
  const port = Number(portValue);
  if (port < 0 || port > 65535) throw new Error("Canvas port must be an integer from 0 to 65535.");
  const host = valuesFor(argv, "--host")[0] || env.GROWTH_CANVAS_HOST || "127.0.0.1";
  const staticArguments = valuesFor(argv, "--static");
  if (staticArguments.length > 1) throw new Error("Canvas accepts at most one --static directory per process.");
  const staticRoot = staticArguments[0] || env.GROWTH_CANVAS_STATIC || undefined;
  return { workspace, host: assertLoopbackHost(host), port, staticRoot };
};

export { resolveStaticRoot };
