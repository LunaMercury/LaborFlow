import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRunnerManifest, readWorkerResults } from "./packetStore.js";
import { countDisplayStatuses, getDisplayStatus } from "./resultClassification.js";
import { estimateApiUsageCost, formatEstimatedUsd, summarizeApiUsage, summarizeApiUsageBreakdown } from "./apiUsage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv: string[]) {
  const compact = argv.includes("--compact") || argv.includes("--summary-only");
  const runId = argv.filter((item) => item !== "--compact" && item !== "--summary-only").join(" ").trim();
  if (!runId) {
    throw new Error("Usage: npm run runner:collect -- <run-id> [--compact]");
  }

  return { runId, compact };
}

async function main() {
  const { runId, compact } = parseArgs(process.argv.slice(2));
  const orchestratorRoot = path.resolve(__dirname, "..");
  const manifest = readRunnerManifest(orchestratorRoot, runId);
  const results = readWorkerResults(manifest);
  const apiUsage = summarizeApiUsage(manifest);
  const apiCost = estimateApiUsageCost(apiUsage);
  const apiBreakdown = summarizeApiUsageBreakdown(apiUsage);

  const statusCounts = countDisplayStatuses(results);

  console.log(`# Worker Result Collection`);
  console.log("");
  console.log(`run_id: ${manifest.runId}`);
  console.log(`request: ${manifest.request}`);
  console.log(`mode: ${manifest.mode}`);
  console.log("");
  console.log("status_counts:");
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  ${status}: ${count}`);
  }
  console.log("");
  console.log("api_usage:");
  console.log(`  calls: ${apiUsage.calls}`);
  console.log(`  input_tokens: ${apiUsage.inputTokens}`);
  console.log(`  output_tokens: ${apiUsage.outputTokens}`);
  console.log(`  total_tokens: ${apiUsage.totalTokens}`);
  console.log(`  estimated_cost_usd: ${formatEstimatedUsd(apiCost.estimatedUsd)}`);
  console.log(`  priced_calls: ${apiCost.pricedCalls}`);
  console.log(`  unpriced_calls: ${apiCost.unpricedCalls}`);
  console.log("  by_stage:");
  for (const item of apiBreakdown.byStage) {
    console.log(`    ${item.key}: calls=${item.calls}, total_tokens=${item.totalTokens}, estimated_cost_usd=${formatEstimatedUsd(item.estimatedUsd)}`);
  }
  console.log("  by_role:");
  for (const item of apiBreakdown.byRole) {
    console.log(`    ${item.key}: calls=${item.calls}, total_tokens=${item.totalTokens}, estimated_cost_usd=${formatEstimatedUsd(item.estimatedUsd)}`);
  }
  if (apiCost.unpricedModels.length > 0) {
    console.log(`  unpriced_models: ${apiCost.unpricedModels.join(", ")}`);
  }
  console.log("");
  console.log("workers:");
  for (const result of results) {
    console.log(`  - role: ${result.role}`);
    console.log(`    status: ${getDisplayStatus(result)}`);
    if (!compact) {
      console.log(`    summary: ${result.summary}`);
    }
    console.log(`    changed_files: ${result.changedFiles.length}`);
    console.log(`    verification_run: ${result.verificationRun.length}`);
    console.log(`    proposed_edits: ${result.proposedEdits?.length ?? 0}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
