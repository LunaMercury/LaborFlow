import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRunnerManifest, readWorkerResult, readWorkerTask, writeWorkerResult } from "./packetStore.js";
import type { WorkerTaskPacket } from "./taskSchemas.js";
import type { WorkerResultPacket } from "./resultSchemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Args = {
  runId: string;
  role: WorkerTaskPacket["role"];
};

function parseArgs(argv: string[]): Args {
  const [runId, role] = argv;

  if (!runId || !role || !["frontend", "rust", "java", "mobile"].includes(role)) {
    throw new Error("Usage: npm run worker:prepare -- <run-id> <frontend|rust|java|mobile>");
  }

  return {
    runId,
    role: role as WorkerTaskPacket["role"],
  };
}

function renderWorkerPrompt(runId: string, task: WorkerTaskPacket, result: WorkerResultPacket): string {
  return [
    `# Worker Prompt`,
    ``,
    `run_id: ${runId}`,
    `role: ${task.role}`,
    `mode: ${task.participationMode}`,
    ``,
    `## Goal`,
    task.goal,
    ``,
    `## Allowed Paths`,
    ...task.allowedPaths.map((item) => `- ${item}`),
    ``,
    `## Blocked Paths`,
    ...task.blockedPaths.map((item) => `- ${item}`),
    ``,
    `## Touched Areas`,
    ...task.touchedAreas.map((item) => `- ${item}`),
    ``,
    `## Steps`,
    ...task.implementationSteps.map((item) => `- ${item}`),
    ``,
    `## Dependencies`,
    ...task.dependencies.map((item) => `- ${item}`),
    ``,
    `## Contracts`,
    ...task.contracts.map((item) => `- ${item}`),
    ``,
    `## Required Verification`,
    ...task.requiredVerification.map((item) => `- ${item}`),
    ``,
    `## Expected Handoff`,
    ...task.handoffOutput.map((item) => `- ${item}`),
    ``,
    `## Current Result Packet`,
    `status: ${result.status}`,
    `summary: ${result.summary}`,
    `changed_files: ${result.changedFiles.join(", ") || "none"}`,
    `verification_run: ${result.verificationRun.join(", ") || "none"}`,
    `risks:`,
    ...(result.risks.length > 0 ? result.risks.map((item) => `- ${item}`) : ["- none"]),
    `questions:`,
    ...(result.questions.length > 0 ? result.questions.map((item) => `- ${item}`) : ["- none"]),
    ``,
    `## Completion Rule`,
    `작업이 끝나면 ${task.role}.result.json 을 업데이트하여 status, changedFiles, summary, contractsChanged, verificationRun, risks, questions를 채웁니다.`,
    ``,
  ].join("\n");
}

async function main() {
  const { runId, role } = parseArgs(process.argv.slice(2));
  const orchestratorRoot = path.resolve(__dirname, "..");
  const manifest = readRunnerManifest(orchestratorRoot, runId);
  const task = readWorkerTask(manifest, role);
  const currentResult = readWorkerResult(manifest, role);

  const workersDir = path.join(manifest.runDir, "workers");
  fs.mkdirSync(workersDir, { recursive: true });
  const promptPath = path.join(workersDir, `${role}.prompt.md`);

  const nextResult: WorkerResultPacket = {
    ...currentResult,
    status: currentResult.status === "pending" ? "running" : currentResult.status,
    summary: currentResult.status === "pending"
      ? `${role} worker prompt가 준비되었고 실행 대기 중입니다.`
      : currentResult.summary,
    risks: currentResult.status === "pending"
      ? currentResult.risks.filter((item) => !item.includes("placeholder"))
      : currentResult.risks,
  };

  fs.writeFileSync(promptPath, renderWorkerPrompt(runId, task, nextResult), "utf8");
  writeWorkerResult(manifest, nextResult);

  console.log(`# Worker Prepared`);
  console.log("");
  console.log(`Run ID: ${runId}`);
  console.log(`Role: ${role}`);
  console.log(`Prompt: ${promptPath}`);
  console.log(`Task: ${path.join(manifest.tasksDir, `${role}.task.json`)}`);
  console.log(`Result: ${path.join(manifest.resultsDir, `${role}.result.json`)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
