import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyPacketSchema, type ApplyPacket } from "./applySchemas.js";
import { assertPacketMatchesApprovedReview, loadApprovedApplyReview } from "./applyApproval.js";
import { readRunnerManifest, readWorkerResult, readWorkerTask } from "./packetStore.js";
import type { WorkerTaskPacket } from "./taskSchemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv: string[]) {
  const [runId, role] = argv;
  if (!runId || !role || !["frontend", "rust", "java", "mobile"].includes(role)) {
    throw new Error("Usage: npm run apply:prepare -- <run-id> <frontend|rust|java|mobile>");
  }

  return {
    runId,
    role: role as WorkerTaskPacket["role"],
  };
}

function buildApplyPacket(runId: string, task: WorkerTaskPacket, result: ReturnType<typeof readWorkerResult>): ApplyPacket {
  return applyPacketSchema.parse({
    runId,
    role: task.role,
    status: "prepared",
    goal: task.goal,
    allowedPaths: task.allowedPaths,
    blockedPaths: task.blockedPaths,
    requiredVerification: task.requiredVerification,
    contracts: task.contracts,
    policyChecks: task.policyChecks,
    proposedEdits: result.proposedEdits,
  });
}

function renderApplyPrompt(packet: ApplyPacket) {
  const lines = [
    `You are Codex applying worker-proposed edits for the Whiteboard Capture repository.`,
    `Role: ${packet.role}`,
    `Run ID: ${packet.runId}`,
    ``,
    `Goal:`,
    packet.goal,
    ``,
    `Allowed paths:`,
    ...packet.allowedPaths.map((item) => `- ${item}`),
    ``,
    `Blocked paths:`,
    ...packet.blockedPaths.map((item) => `- ${item}`),
    ``,
    `Contracts:`,
    ...packet.contracts.map((item) => `- ${item}`),
    ``,
    `Mandatory policy checks:`,
    ...packet.policyChecks.map((item) => `- ${item}`),
    ``,
    `Required verification:`,
    ...packet.requiredVerification.map((item) => `- ${item}`),
    ``,
    `Apply the following file-by-file edits carefully:`,
  ];

  for (const edit of packet.proposedEdits) {
    lines.push(``);
    lines.push(`## ${edit.path}`);
    lines.push(`- action: ${edit.action}`);
    lines.push(`- summary: ${edit.summary}`);
    lines.push(`- instructions:`);
    for (const instruction of edit.instructions) {
      lines.push(`  - ${instruction}`);
    }
  }

  lines.push(``);
  lines.push(`Execution rules:`);
  lines.push(`- Edit only files inside allowed paths.`);
  lines.push(`- Do not modify blocked paths.`);
  lines.push(`- Preserve existing project conventions and comments.`);
  lines.push(`- Add or restore concise human-readable comments in complex logic where they improve maintainability.`);
  lines.push(`- Treat every mandatory policy check as a hard requirement while applying edits.`);
  lines.push(`- Run the required verification commands after editing.`);
  lines.push(`- If a proposed edit conflicts with actual code, adapt carefully and record the deviation in your final summary.`);

  return `${lines.join("\n")}\n`;
}

async function main() {
  const { runId, role } = parseArgs(process.argv.slice(2));
  const orchestratorRoot = path.resolve(__dirname, "..");
  const manifest = readRunnerManifest(orchestratorRoot, runId);
  const task = readWorkerTask(manifest, role);
  const result = readWorkerResult(manifest, role);

  if (!result.proposedEdits || result.proposedEdits.length === 0) {
    throw new Error(`No proposedEdits found for role: ${role}`);
  }

  const appliesDir = path.join(manifest.runDir, "applies");
  fs.mkdirSync(appliesDir, { recursive: true });

  const packet = buildApplyPacket(runId, task, result);
  const review = loadApprovedApplyReview(orchestratorRoot, runId, role);
  assertPacketMatchesApprovedReview(packet, review.approvedEdits);
  const packetPath = path.join(appliesDir, `${role}.apply.json`);
  const promptPath = path.join(appliesDir, `${role}.apply.md`);

  fs.writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  fs.writeFileSync(promptPath, renderApplyPrompt(packet), "utf8");

  console.log(`# Apply Preparation`);
  console.log(`Run ID: ${runId}`);
  console.log(`Role: ${role}`);
  console.log(`Packet: ${packetPath}`);
  console.log(`Prompt: ${promptPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
