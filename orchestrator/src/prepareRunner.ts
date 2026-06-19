import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOrchestratorGraph } from "./graph.js";
import { buildRepoSnapshot } from "./repoSnapshot.js";
import { writeRunnerBundle } from "./packetStore.js";
import { resolveRepoRoot } from "./repoRoot.js";
import type { WorkerTaskPacket } from "./taskSchemas.js";
import type { WorkerResultPacket } from "./resultSchemas.js";
import type { ManagerDecision, VerifierReport } from "./schemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, "../../.env") });

function parseArgs(argv: string[]) {
  const mock = argv.includes("--mock");
  const compact = argv.includes("--compact") || argv.includes("--summary-only");
  const filtered = argv.filter((arg) => arg !== "--mock" && arg !== "--compact" && arg !== "--summary-only");
  const userRequest = filtered.join(" ").trim();
  return {
    mock,
    compact,
    userRequest,
  };
}

async function main() {
  const { mock, compact, userRequest } = parseArgs(process.argv.slice(2));

  if (!userRequest) {
    throw new Error("Usage: npm run runner:prepare -- [--mock] \"네이버 로그인 기능을 만들어줘\"");
  }

  if (!mock && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required unless you run with --mock.");
  }

  const repoRoot = resolveRepoRoot(__dirname);
  const orchestratorRoot = path.resolve(__dirname, "..");

  const graph = createOrchestratorGraph();
  const result = await graph.invoke({
    userRequest,
    mock,
    repoSnapshot: buildRepoSnapshot(repoRoot),
  });

  const manifest = writeRunnerBundle(orchestratorRoot, {
    request: userRequest,
    mock,
    repoRoot,
    finalReport: result.finalReport ?? "No orchestration output was produced.",
    managerDecision: result.managerDecision as ManagerDecision | undefined,
    verifierReport: result.verifierReport as VerifierReport | undefined,
    taskPackets: (result.taskPackets ?? []) as WorkerTaskPacket[],
    workerResults: (result.workerResults ?? []) as WorkerResultPacket[],
  });

  if (compact) {
    console.log("# Runner Bundle");
    console.log(`Run ID: ${manifest.runId}`);
    console.log(`Request: ${manifest.request}`);
    console.log(`Mode: ${manifest.mode}`);
    console.log(`Report: ${manifest.reportPath}`);
    console.log(`Manifest: ${path.join(manifest.runDir, "meta", "manifest.json")}`);
    return;
  }

  console.log(result.finalReport ?? "No orchestration output was produced.");
  console.log("");
  console.log("## Runner Bundle");
  console.log(`Run ID: ${manifest.runId}`);
  console.log(`Run dir: ${manifest.runDir}`);
  console.log(`Tasks dir: ${manifest.tasksDir}`);
  console.log(`Results dir: ${manifest.resultsDir}`);
  console.log(`Manifest: ${path.join(manifest.runDir, "meta", "manifest.json")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
