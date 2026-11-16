import { hasProcessCycle } from "./processEngine";
import python from "./exportRuntime/process.py?raw";
import r from "./exportRuntime/process.R?raw";
import type { DesModel } from "./model";
import type { RunConfig } from "./engine";
import { validateProcessModel } from "./processValidation";
export function generateProcessCode(
  model: DesModel,
  config: RunConfig,
  language: "python" | "r",
): string {
  if (config.stopMode !== "horizon" && hasProcessCycle(model))
    return "# Export unavailable: recurring cycles require Stop at horizon.\n";
  const errors = validateProcessModel(model);
  if (errors.hasErrors)
    return (
      "# Export unavailable: " +
      errors.issues
        .filter((i) => i.severity === "error")
        .map((i) => i.title)
        .join("; ") +
      "\n"
    );
  const modelText = JSON.stringify(JSON.stringify(model)),
    configText = JSON.stringify(JSON.stringify(config));
  return language === "python"
    ? "# DES Playground — SimPy process model\n# Install: pip install simpy\n# Quantities, guards, units, costs and stop rules are embedded below.\nimport json\nMODEL = json.loads(" +
        modelText +
        ")\nCONFIG = json.loads(" +
        configText +
        ")\n\n" +
        python
    : '# DES Playground — R simmer process model\n# Install: install.packages(c("simmer", "jsonlite"))\n# R uses its own PRNG: compare distributions, not same-seed traces.\nMODEL <- jsonlite::fromJSON(' +
        modelText +
        ", simplifyVector=FALSE)\nCONFIG <- jsonlite::fromJSON(" +
        configText +
        ", simplifyVector=FALSE)\n\n" +
        r;
}
