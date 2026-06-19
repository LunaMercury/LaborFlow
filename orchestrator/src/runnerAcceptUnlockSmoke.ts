import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function runScript(orchestratorRoot: string, script: string, args: string[]) {
  const tsxCli = path.join(orchestratorRoot, "node_modules", "tsx", "dist", "cli.mjs");
  return spawnSync(process.execPath, [tsxCli, path.join(orchestratorRoot, "src", script), ...args], {
    cwd: orchestratorRoot,
    encoding: "utf8",
    timeout: 3 * 60 * 1000,
    windowsHide: true,
  });
}

function extractRunId(output: string) {
  return output.match(/^Run ID:\s*(run-[^\r\n]+)/m)?.[1]?.trim();
}

function main() {
  const orchestratorRoot = path.resolve(__dirname, "..");
  const repoRoot = path.resolve(orchestratorRoot, "..");
  const prepare = runScript(orchestratorRoot, "prepareRunner.ts", [
    "--mock",
    "--compact",
    "Add an accept unlock smoke notice to the login screen",
  ]);
  const runId = extractRunId(prepare.stdout || "");
  if (!runId) {
    console.log(prepare.stdout || "");
    console.error(prepare.stderr || "");
    throw new Error("Could not prepare accept unlock smoke run.");
  }

  try {
    const workflow = runScript(orchestratorRoot, "runnerWorkflow.ts", [
      runId,
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
    ]);
    if (workflow.status !== 0) {
      console.log(workflow.stdout || "");
      console.error(workflow.stderr || "");
      throw new Error("accept unlock smoke rehearsal failed.");
    }

    const continuePreview = runScript(orchestratorRoot, "runnerContinue.ts", ["--compact", runId]);
    const previewOutput = `${continuePreview.stdout || ""}\n${continuePreview.stderr || ""}`;
    const acceptReady = previewOutput.includes("runner:continue: status=ready for accept");
    const optionBExecutable = previewOutput.includes("B: Keep the same proposed edits intentionally (executable)");
    const passed = continuePreview.status === 0 && acceptReady && optionBExecutable;

    console.log("# Runner Accept Unlock Smoke");
    console.log(`Run ID: ${runId}`);
    console.log(`Rehearsal exit: ${workflow.status}`);
    console.log(`Ready for accept: ${acceptReady ? "yes" : "no"}`);
    console.log(`Option B executable: ${optionBExecutable ? "yes" : "no"}`);

    if (!passed) {
      console.log("");
      console.log("## continue preview");
      console.log(previewOutput.trim());
      process.exit(1);
    }
  } finally {
    fs.rmSync(path.join(orchestratorRoot, "runs", runId), { recursive: true, force: true });
    fs.rmSync(path.join(repoRoot, "web", ".orchestrator-rollback-test.txt"), { force: true });
  }
}

main();
