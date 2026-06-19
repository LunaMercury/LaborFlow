import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOrchestratorGraph } from "./graph.js";
import { buildRepoSnapshot } from "./repoSnapshot.js";
import { resolveRepoRoot } from "./repoRoot.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, "../../.env") });

function parseArgs(argv: string[]) {
  const mock = argv.includes("--mock");
  const filtered = argv.filter((arg) => arg !== "--mock");
  const userRequest = filtered.join(" ").trim();
  return {
    mock,
    userRequest,
  };
}

async function main() {
  const { mock, userRequest } = parseArgs(process.argv.slice(2));

  if (!userRequest) {
    throw new Error("Usage: npm run demo -- [--mock] \"네이버 로그인 기능을 만들어줘\"");
  }

  if (!mock && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required unless you run with --mock.");
  }

  const repoRoot = resolveRepoRoot(__dirname);

  const graph = createOrchestratorGraph();
  const result = await graph.invoke({
    userRequest,
    mock,
    repoSnapshot: buildRepoSnapshot(repoRoot),
  });

  console.log(result.finalReport ?? "No orchestration output was produced.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

