import fs from "node:fs";
import path from "node:path";

const executableNames = () => {
  if (process.platform !== "win32") return ["codex"];
  const extensions = String(process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .filter(Boolean)
    .map((extension) => extension.toLowerCase());
  return ["codex", ...extensions.map((extension) => `codex${extension}`)];
};

export const detectCodingAgentRuntime = ({ pathValue = process.env.PATH || "" } = {}) => {
  const directories = pathValue.split(path.delimiter).filter(Boolean);
  let detected = false;
  for (const directory of directories) {
    for (const executable of executableNames()) {
      try {
        const candidate = path.join(directory, executable);
        if (fs.statSync(candidate).isFile()) {
          detected = true;
          break;
        }
      } catch (error) {
        if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR" && error?.code !== "EACCES") throw error;
      }
    }
    if (detected) break;
  }

  return {
    schemaVersion: "1.0.0",
    defaultHandoffMode: "manual_coding_agent",
    codingAgent: {
      command: "codex",
      detected,
      detectionMethod: "path_lookup_only",
      credentialsInspected: false,
      unattendedExecutionEnabled: false
    },
    credentialPolicy: {
      customerProviderCredential: "not_requested",
      frameworkManagedProviderCredential: "not_present"
    },
    externalActionAuthority: {
      publish: false,
      send: false,
      schedule: false,
      createCampaign: false,
      uploadAudience: false,
      spend: false
    }
  };
};
