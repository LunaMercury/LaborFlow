import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRunnerManifest, readWorkerResult, readWorkerTask } from "./packetStore.js";
import type { WorkerTaskPacket } from "./taskSchemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv: string[]) {
  const [runId, role] = argv;
  if (!runId || !role || !["frontend", "rust", "java", "mobile"].includes(role)) {
    throw new Error("Usage: npm run worker:handoff -- <run-id> <frontend|rust|java|mobile>");
  }

  return {
    runId,
    role: role as WorkerTaskPacket["role"],
  };
}

function renderHandoff(runId: string, task: WorkerTaskPacket, result: ReturnType<typeof readWorkerResult>) {
  const lines = [
    `# Worker Handoff`,
    ``,
    `- Run ID: ${runId}`,
    `- Role: ${result.role}`,
    `- Status: ${result.status}`,
    ``,
    `## Goal`,
    task.goal,
    ``,
    `## Summary`,
    result.summary,
    ``,
    `## Proposed Edits`,
  ];

  if (result.proposedEdits.length === 0) {
    lines.push(`- none`);
  } else {
    for (const edit of result.proposedEdits) {
      lines.push(`### ${edit.path}`);
      lines.push(`- action: ${edit.action}`);
      lines.push(`- summary: ${edit.summary}`);
      lines.push(`- instructions:`);
      for (const instruction of edit.instructions) {
        lines.push(`  - ${instruction}`);
      }
      lines.push(``);
    }
  }

  lines.push(`## Verification`);
  if (result.verificationRun.length === 0) {
    lines.push(`- none`);
  } else {
    for (const verification of result.verificationRun) {
      lines.push(`- ${verification}`);
    }
  }

  lines.push(``);
  lines.push(`## Risks`);
  if (result.risks.length === 0) {
    lines.push(`- none`);
  } else {
    for (const risk of result.risks) {
      lines.push(`- ${risk}`);
    }
  }

  lines.push(``);
  lines.push(`## Questions`);
  if (result.questions.length === 0) {
    lines.push(`- none`);
  } else {
    for (const question of result.questions) {
      lines.push(`- ${question}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const { runId, role } = parseArgs(process.argv.slice(2));
  const orchestratorRoot = path.resolve(__dirname, "..");
  const manifest = readRunnerManifest(orchestratorRoot, runId);
  const task = readWorkerTask(manifest, role);
  const result = readWorkerResult(manifest, role);
  const workersDir = path.join(manifest.runDir, "workers");
  fs.mkdirSync(workersDir, { recursive: true });
  const handoffPath = path.join(workersDir, `${role}.handoff.md`);
  const handoff = renderHandoff(runId, task, result);
  fs.writeFileSync(handoffPath, handoff, "utf8");

  console.log(`# Worker Handoff`);
  console.log(`Run ID: ${runId}`);
  console.log(`Role: ${role}`);
  console.log(`Path: ${handoffPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
