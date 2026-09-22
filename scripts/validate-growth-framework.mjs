import { validateGrowthFramework } from "./growth-framework-validator.mjs";

const result = validateGrowthFramework(process.cwd());
if (result.errors.length) {
  console.error("Portable growth framework validation failed:");
  for (const error of result.errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Portable growth framework validation passed (contracts, core, synthetic tenant template, adversarial fixtures and aggregate learning export).\nNo tenant data, publishing, delivery, paid media or credentials are included.");
