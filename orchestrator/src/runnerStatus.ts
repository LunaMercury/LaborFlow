import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { estimateApiUsageCost, formatEstimatedUsd, summarizeApiUsage } from "./apiUsage.js";
import { readRunnerManifest, readWorkerResults } from "./packetStore.js";
import {
  countDisplayStatuses,
  getBlockedReasons,
  getBlockedRoles,
  getFailedRoles,
  getDisplayStatus,
} from "./resultClassification.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let compact = false;
  for (const arg of argv) {
    if (arg === "--compact" || arg === "--summary-only") {
      compact = true;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positional.push(arg);
  }
  const runId = positional.join(" ").trim();
  return { compact, runId };
}

function formatStatusCounts(statusCounts: Record<string, number>) {
  const preferred = ["succeeded", "blocked", "failed", "skipped", "pending", "running"];
  return preferred
    .filter((status) => statusCounts[status])
    .map((status) => `${status}=${statusCounts[status]}`)
    .join(", ") || "none";
}

function readQualityGateStatus(manifest: ReturnType<typeof readRunnerManifest>) {
  const reportPath = path.join(manifest.runDir, "meta", "quality-gate.json");
  if (!fs.existsSync(reportPath)) {
    return "not_run";
  }
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as { status?: string; errorCount?: number; warnCount?: number };
    const suffix = `errors=${report.errorCount ?? 0},warnings=${report.warnCount ?? 0}`;
    return `${report.status ?? "unknown"}(${suffix})`;
  } catch {
    return "unreadable";
  }
}

async function main() {
  const { compact, runId } = parseArgs(process.argv.slice(2));
  if (!runId) {
    throw new Error("Usage: npm run runner:status -- <run-id> [--compact]");
  }

  const orchestratorRoot = path.resolve(__dirname, "..");
  const manifest = readRunnerManifest(orchestratorRoot, runId);
  const results = readWorkerResults(manifest);
  const blockedRoles = getBlockedRoles(results);
  const failedRoles = getFailedRoles(results);
  const blockedReasons = getBlockedReasons(results);
  const editableResults = results.filter((result) => result.status === "succeeded" && (result.proposedEdits?.length ?? 0) > 0);
  const statusCounts = countDisplayStatuses(results);
  const changedFiles = results.reduce((sum, result) => sum + result.changedFiles.length, 0);
  const proposedEdits = results.reduce((sum, result) => sum + (result.proposedEdits?.length ?? 0), 0);
  const verificationRun = results.reduce((sum, result) => sum + result.verificationRun.length, 0);
  const apiUsage = summarizeApiUsage(manifest);
  const apiCost = estimateApiUsageCost(apiUsage);
  const qualityGateStatus = readQualityGateStatus(manifest);

  if (compact) {
    console.log(`runner:status: run=${manifest.runId} mode=${manifest.mode} workers=${formatStatusCounts(statusCounts)} edits=${proposedEdits} changed_files=${changedFiles} verification_entries=${verificationRun} quality=${qualityGateStatus} cost=${formatEstimatedUsd(apiCost.estimatedUsd)}`);
    console.log(`next: npm run runner:continue -- ${manifest.runId}`);
    return;
  }

  console.log(`# Runner Status`);
  console.log("");
  console.log(`Run ID: ${manifest.runId}`);
  console.log(`Request: ${manifest.request}`);
  console.log(`Mode: ${manifest.mode}`);
  console.log("");
  console.log("## Summary");
  console.log(`Workers: ${formatStatusCounts(statusCounts)}`);
  console.log(`Changed files recorded: ${changedFiles}`);
  console.log(`Proposed edits: ${proposedEdits}`);
  console.log(`Verification entries: ${verificationRun}`);
  console.log(`Quality gate: ${qualityGateStatus}`);
  console.log(`API usage: calls=${apiUsage.calls}, total_tokens=${apiUsage.totalTokens}, input_tokens=${apiUsage.inputTokens}, output_tokens=${apiUsage.outputTokens}`);
  console.log(`API cost: estimated_usd=${formatEstimatedUsd(apiCost.estimatedUsd)}, priced_calls=${apiCost.pricedCalls}, unpriced_calls=${apiCost.unpricedCalls}`);
  console.log("");
  console.log(`## Workers`);

  for (const worker of manifest.workers) {
    const result = results.find((item) => item.role === worker.role);
    console.log(`- ${worker.role}: ${result ? getDisplayStatus(result) : worker.status}`);
    console.log(`  task: ${worker.taskFile}`);
    console.log(`  result: ${worker.resultFile}`);
    console.log(`  summary: ${result?.summary ?? "no summary"}`);
    if (result?.questions.length) {
      console.log("  questions:");
      for (const question of result.questions) {
        console.log(`    - ${question}`);
      }
    }
  }

  if (blockedRoles.length > 0) {
    console.log("");
    console.log("## Blocked");
    console.log(`Roles: ${blockedRoles.join(", ")}`);
    console.log("Reasons:");
    for (const reason of blockedReasons) {
      console.log(`- ${reason}`);
    }
    console.log("");
    console.log("Review the questions and contracts before intentionally continuing.");
  }

  console.log("");
  console.log("## Continue Chain");
  console.log(`Inspect options: npm run runner:continue -- ${manifest.runId}`);
  if (blockedRoles.length > 0) {
    console.log(`Preview approval path: npm run runner:continue:b -- ${manifest.runId}`);
    console.log(`Execute approval rehearsal: npm run runner:continue:b:execute -- ${manifest.runId}`);
    console.log(`Reject this plan: npm run runner:continue:c -- ${manifest.runId}`);
  } else if (failedRoles.length > 0) {
    console.log(`Inspect failure details first: npm run runner:continue:a -- ${manifest.runId}`);
    console.log(`Retry reusable apply path when available: npm run runner:continue:b:execute -- ${manifest.runId}`);
    console.log(`Reject this plan: npm run runner:continue:c -- ${manifest.runId}`);
  } else if (editableResults.length > 0) {
    console.log(`Safe rehearsal with rollback: npm run runner:continue:a:execute -- ${manifest.runId}`);
    console.log(`Preview keep-applied path: npm run runner:continue:b -- ${manifest.runId}`);
    console.log(`Keep applied intentionally: npm run runner:continue:b:execute -- ${manifest.runId}`);
    console.log(`Reject this plan: npm run runner:continue:c -- ${manifest.runId}`);
  } else {
    console.log("No editable proposed changes were found. Review the report or start a new request if implementation is still needed.");
  }

  console.log("");
  console.log(`Report: ${manifest.reportPath}`);
  console.log(`HTML report: ${path.join(manifest.runDir, "report.html")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
