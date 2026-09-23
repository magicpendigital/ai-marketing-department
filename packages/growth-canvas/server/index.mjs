import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveCanvasOptions, startCanvasServer } from "./app.mjs";

const modulePath = fileURLToPath(import.meta.url);

export { createCanvasRequestHandler, resolveCanvasOptions, startCanvasServer } from "./app.mjs";
export { detectCodingAgentRuntime } from "./runtime-capabilities.mjs";
export { CanvasWorkspaceStore, createCanvasWorkspaceStore, ownerDecisionBoundary, withJobLock } from "./workspace-store.mjs";

const runAsCli = async () => {
  try {
    const runtime = await startCanvasServer(resolveCanvasOptions());
    console.log(`Growth Canvas local control is listening at ${runtime.baseUrl}.`);
    console.log(`Open the private Canvas URL: ${runtime.accessUrl}`);
    console.log(`Tenant: ${runtime.store.tenantId}. Handoff: manual Coding Agent. External action authority: none.`);
    const close = async () => {
      await runtime.close();
      process.exit(0);
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
};

if (path.resolve(process.argv[1] || "") === path.resolve(modulePath)) await runAsCli();
