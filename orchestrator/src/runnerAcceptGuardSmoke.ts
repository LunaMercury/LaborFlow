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
    windowsHide: true,
  });
}

function extractRunId(output: string) {
  return output.match(/^Run ID:\s*(run-[^\r\n]+)/m)?.[1]?.trim();
}

function main() {
  const orchestratorRoot = path.resolve(__dirname, "..");
  const prepare = runScript(orchestratorRoot, "prepareRunner.ts", [
    "--mock",
    "--compact",
    "Add an accept guard smoke notice to the login screen",
  ]);
  const runId = extractRunId(prepare.stdout || "");
  if (!runId) {
    console.log(prepare.stdout || "");
    console.error(prepare.stderr || "");
    throw new Error("Could not prepare accept guard smoke run.");
  }

  try {
    const worker = runScript(orchestratorRoot, "workerRun.ts", [runId, "frontend", "--provider", "test"]);
    if (worker.status !== 0) {
      console.log(worker.stdout || "");
      console.error(worker.stderr || "");
      throw new Error("accept guard smoke worker failed.");
    }

    const continuePreview = runScript(orchestratorRoot, "runnerContinue.ts", ["--compact", runId]);
    const continueExecute = runScript(orchestratorRoot, "runnerContinue.ts", ["--choose", "B", "--execute", runId]);
    const previewOutput = `${continuePreview.stdout || ""}\n${continuePreview.stderr || ""}`;
    const executeOutput = `${continueExecute.stdout || ""}\n${continueExecute.stderr || ""}`;
    const locked = previewOutput.includes("Locked until safe rehearsal passes");
    const executeBlocked = continueExecute.status !== 0 && executeOutput.includes("manual decision");
    const passed = locked && executeBlocked;

    console.log("# Runner Accept Guard Smoke");
    console.log(`Run ID: ${runId}`);
    console.log(`Option B locked: ${locked ? "yes" : "no"}`);
    console.log(`Option B execute blocked: ${executeBlocked ? "yes" : "no"}`);

    if (!passed) {
      console.log("");
      console.log("## continue preview");
      console.log(previewOutput.trim());
      console.log("");
      console.log("## continue execute");
      console.log(executeOutput.trim());
      process.exit(1);
    }
  } finally {
    fs.rmSync(path.join(orchestratorRoot, "runs", runId), { recursive: true, force: true });
  }
}

main();
