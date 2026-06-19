import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function main() {
  const orchestratorRoot = path.resolve(__dirname, "..");
  const repoRoot = path.resolve(orchestratorRoot, "..");
  const tsxCli = path.join(orchestratorRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const probePath = path.join(repoRoot, "web", "src", "components", "WorkflowQualityGateSmoke.md");

  const result = spawnSync(
    process.execPath,
    [
      tsxCli,
      path.join(orchestratorRoot, "src", "runnerFull.ts"),
      "--mock",
      "--compact",
      "--roles",
      "frontend",
      "--worker-provider",
      "test",
      "--apply-provider",
      "test",
      "--apply",
      "--rollback-after-verify",
      "--allow-dirty",
      "--continue-on-error",
      "Add a workflow-quality-gate-smoke notice to the login screen",
    ],
    {
      cwd: orchestratorRoot,
      encoding: "utf8",
      timeout: 3 * 60 * 1000,
      windowsHide: true,
    },
  );

  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const runIds = [...output.matchAll(/Run ID: (run-[^\s]+)/g)].map((match) => match[1]);
  const runId = runIds.at(-1);
  const runDir = runId ? path.join(orchestratorRoot, "runs", runId) : "";
  const expectedFailure = result.status !== 0;
  const qualityFailed = output.includes("Quality gate: failed");
  const rollbackSucceeded = output.includes("Rollback: succeeded");
  const probeRemoved = !fs.existsSync(probePath);
  const passed = expectedFailure && qualityFailed && rollbackSucceeded && probeRemoved;

  if (runDir) {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
  fs.rmSync(probePath, { force: true });

  console.log("# Runner Workflow Quality Gate Smoke");
  console.log(`Workflow exit: ${result.status}`);
  console.log(`Expected workflow failure: ${expectedFailure ? "yes" : "no"}`);
  console.log(`Quality gate failed: ${qualityFailed ? "yes" : "no"}`);
  console.log(`Rollback succeeded: ${rollbackSucceeded ? "yes" : "no"}`);
  console.log(`Probe removed: ${probeRemoved ? "yes" : "no"}`);
  if (runId) {
    console.log(`Cleaned run: ${runId}`);
  }
  if (result.error) {
    console.log(`Workflow error: ${result.error.message}`);
  }

  if (!passed) {
    console.log("");
    console.log(output.trim());
    process.exit(1);
  }
}

main();
