import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readRunnerManifest,
  readRunnerSummary,
  readWorkerResults,
  writeRunnerManifest,
  writeRunnerReport,
  writeRunnerSummary,
} from "./packetStore.js";
import {
  countDisplayStatuses,
  getBlockedReasons,
  getBlockedRoles,
  getDisplayStatus,
  getFailedRoles,
  isApplyReviewBlocked,
} from "./resultClassification.js";
import type { WorkerResultPacket } from "./resultSchemas.js";
import {
  estimateApiUsageCost,
  formatEstimatedUsd,
  summarizeApiUsage,
  summarizeApiUsageBreakdown,
  type ApiUsageBreakdown,
  type ApiUsageCostSummary,
  type ApiUsageSummary,
} from "./apiUsage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type QualityGateReport = {
  status: "passed" | "failed";
  checkedFiles: string[];
  errorCount: number;
  warnCount: number;
  findings: Array<{
    severity: "error" | "warn";
    file: string;
    rule: string;
    message: string;
  }>;
};

function parseArgs(argv: string[]) {
  const compact = argv.includes("--compact") || argv.includes("--summary-only");
  const runId = argv.filter((item) => item !== "--compact" && item !== "--summary-only").join(" ").trim();
  if (!runId) {
    throw new Error("Usage: npm run runner:finalize -- <run-id> [--compact]");
  }
  return { runId, compact };
}

function readQualityGateReport(manifest: ReturnType<typeof readRunnerManifest>): QualityGateReport | undefined {
  const reportPath = path.join(manifest.runDir, "meta", "quality-gate.json");
  if (!fs.existsSync(reportPath)) {
    return undefined;
  }
  return JSON.parse(fs.readFileSync(reportPath, "utf8")) as QualityGateReport;
}

function buildReleaseBlockers(results: WorkerResultPacket[]) {
  const blockers: string[] = [];

  for (const result of results.filter(isApplyReviewBlocked)) {
    blockers.push(`${result.role} apply blocked: ${result.summary}`);
  }
  for (const result of results.filter((item) => item.status === "failed" && !isApplyReviewBlocked(item))) {
    blockers.push(`${result.role} worker failed: ${result.summary}`);
  }
  for (const result of results.filter((item) => item.status === "pending")) {
    blockers.push(`${result.role} worker has not been executed yet.`);
  }
  for (const result of results.filter((item) => item.status === "running")) {
    blockers.push(`${result.role} worker is still marked as running.`);
  }

  return blockers;
}

function buildFindings(results: WorkerResultPacket[]) {
  return results.map((result) => {
    const changed = result.changedFiles.length;
    const proposed = result.proposedEdits?.length ?? 0;
    const verification = result.verificationRun.length;
    return `${result.role}: status=${getDisplayStatus(result)}, changed_files=${changed}, proposed_edits=${proposed}, verification=${verification}`;
  });
}

function buildRecommendedVerification(results: WorkerResultPacket[]) {
  return Array.from(new Set(results.flatMap((result) => result.verificationRun)));
}

function buildFinalSummary(results: WorkerResultPacket[]) {
  const succeeded = results.filter((result) => result.status === "succeeded").map((result) => result.role);
  const skipped = results.filter((result) => result.status === "skipped").map((result) => result.role);
  const running = results.filter((result) => result.status === "running").map((result) => result.role);
  const pending = results.filter((result) => result.status === "pending").map((result) => result.role);
  const blocked = getBlockedRoles(results);
  const actualFailed = getFailedRoles(results);

  const parts: string[] = [];
  if (succeeded.length > 0) {
    parts.push(`Succeeded: ${succeeded.join(", ")}`);
  }
  if (skipped.length > 0) {
    parts.push(`Skipped: ${skipped.join(", ")}`);
  }
  if (running.length > 0) {
    parts.push(`Running: ${running.join(", ")}`);
  }
  if (pending.length > 0) {
    parts.push(`Pending: ${pending.join(", ")}`);
  }
  if (blocked.length > 0) {
    parts.push(`Blocked: ${blocked.join(", ")}`);
  }
  if (actualFailed.length > 0) {
    parts.push(`Failed: ${actualFailed.join(", ")}`);
  }

  return parts.length > 0 ? parts.join(" / ") : "No worker results were collected.";
}

function renderFinalReport(
  runId: string,
  request: string,
  mode: string,
  statusCounts: Record<string, number>,
  finalSummary: string,
  results: WorkerResultPacket[],
  releaseBlockers: string[],
  recommendedVerification: string[],
  blockedReasons: string[],
  apiUsage: ApiUsageSummary,
  apiCost: ApiUsageCostSummary,
  apiBreakdown: ApiUsageBreakdown,
  qualityGate: QualityGateReport | undefined,
) {
  const lines = [
    "# Finalized Runner Report",
    "",
    `- Request: ${request}`,
    `- Mode: ${mode}`,
    `- Summary: ${finalSummary}`,
    "",
    "## Status Counts",
  ];

  for (const [status, count] of Object.entries(statusCounts)) {
    lines.push(`- ${status}: ${count}`);
  }

  lines.push("");
  lines.push("## API Usage");
  lines.push(`- calls: ${apiUsage.calls}`);
  lines.push(`- input_tokens: ${apiUsage.inputTokens}`);
  lines.push(`- output_tokens: ${apiUsage.outputTokens}`);
  lines.push(`- total_tokens: ${apiUsage.totalTokens}`);
  lines.push(`- estimated_cost_usd: ${formatEstimatedUsd(apiCost.estimatedUsd)}`);
  lines.push(`- priced_calls: ${apiCost.pricedCalls}`);
  lines.push(`- unpriced_calls: ${apiCost.unpricedCalls}`);
  if (apiCost.unpricedModels.length > 0) {
    lines.push(`- unpriced_models: ${apiCost.unpricedModels.join(", ")}`);
  }

  lines.push("");
  lines.push("## Quality Gate");
  if (!qualityGate) {
    lines.push("- status: not run");
  } else {
    lines.push(`- status: ${qualityGate.status}`);
    lines.push(`- checked_files: ${qualityGate.checkedFiles.length}`);
    lines.push(`- errors: ${qualityGate.errorCount}`);
    lines.push(`- warnings: ${qualityGate.warnCount}`);
    if (qualityGate.findings.length > 0) {
      lines.push("- findings:");
      for (const finding of qualityGate.findings) {
        lines.push(`  - ${finding.severity} ${finding.file} [${finding.rule}]: ${finding.message}`);
      }
    }
  }

  lines.push("");
  lines.push("## API Cost Breakdown");
  lines.push("### By Stage");
  if (apiBreakdown.byStage.length === 0) {
    lines.push("- none");
  } else {
    for (const item of apiBreakdown.byStage) {
      lines.push(`- ${item.key}: calls=${item.calls}, total_tokens=${item.totalTokens}, estimated_cost_usd=${formatEstimatedUsd(item.estimatedUsd)}`);
    }
  }
  lines.push("### By Role");
  if (apiBreakdown.byRole.length === 0) {
    lines.push("- none");
  } else {
    for (const item of apiBreakdown.byRole) {
      lines.push(`- ${item.key}: calls=${item.calls}, total_tokens=${item.totalTokens}, estimated_cost_usd=${formatEstimatedUsd(item.estimatedUsd)}`);
    }
  }

  lines.push("");
  lines.push("## Continue Chain");
  lines.push(`- status: \`npm run runner:status -- ${runId}\``);
  lines.push(`- inspect options: \`npm run runner:continue -- ${runId}\``);
  lines.push(`- safe rehearsal: \`npm run runner:continue:a:execute -- ${runId}\``);
  lines.push(`- preview keep-applied: \`npm run runner:continue:b -- ${runId}\``);
  lines.push(`- keep applied intentionally: \`npm run runner:continue:b:execute -- ${runId}\``);
  lines.push(`- reject and replan: \`npm run runner:continue:c -- ${runId}\``);

  lines.push("");
  lines.push("## Worker Results");
  for (const result of results) {
    lines.push(`### ${result.role}`);
    lines.push(`- status: ${getDisplayStatus(result)}`);
    lines.push(`- summary: ${result.summary}`);
    lines.push(`- changed_files: ${result.changedFiles.length}`);
    lines.push(`- proposed_edits: ${result.proposedEdits?.length ?? 0}`);
    lines.push(`- verification_run: ${result.verificationRun.length}`);
    if (result.risks.length > 0) {
      lines.push("- risks:");
      for (const risk of result.risks) {
        lines.push(`  - ${risk}`);
      }
    }
  }

  lines.push("");
  lines.push("## Blocked Reasons");
  if (blockedReasons.length === 0) {
    lines.push("- none");
  } else {
    for (const reason of blockedReasons) {
      lines.push(`- ${reason}`);
    }
  }

  lines.push("");
  lines.push("## Release Blockers");
  if (releaseBlockers.length === 0) {
    lines.push("- none");
  } else {
    for (const blocker of releaseBlockers) {
      lines.push(`- ${blocker}`);
    }
  }

  lines.push("");
  lines.push("## Recommended Verification");
  if (recommendedVerification.length === 0) {
    lines.push("- none");
  } else {
    for (const verification of recommendedVerification) {
      lines.push(`- ${verification}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderList(items: string[]) {
  if (items.length === 0) {
    return "<li>none</li>";
  }

  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderStatusCards(statusCounts: Record<string, number>) {
  const preferred = ["succeeded", "blocked", "failed", "skipped", "pending", "running"];
  return preferred
    .filter((status) => statusCounts[status])
    .map((status) => [
      `<article class="card status-${escapeHtml(status)}">`,
      `<span>${escapeHtml(status)}</span>`,
      `<strong>${statusCounts[status]}</strong>`,
      `</article>`,
    ].join(""))
    .join("");
}

function renderWorkerCard(result: WorkerResultPacket) {
  const status = getDisplayStatus(result);
  return [
    `<article class="worker status-${escapeHtml(status)}">`,
    `<div class="worker-head">`,
    `<h3>${escapeHtml(result.role)}</h3>`,
    `<span class="pill">${escapeHtml(status)}</span>`,
    `</div>`,
    `<p>${escapeHtml(result.summary)}</p>`,
    `<div class="metrics">`,
    `<span>changed <strong>${result.changedFiles.length}</strong></span>`,
    `<span>proposed <strong>${result.proposedEdits?.length ?? 0}</strong></span>`,
    `<span>verified <strong>${result.verificationRun.length}</strong></span>`,
    `</div>`,
    result.risks.length > 0 ? `<details><summary>Risks</summary><ul>${renderList(result.risks)}</ul></details>` : "",
    result.questions.length > 0 ? `<details><summary>Questions</summary><ul>${renderList(result.questions)}</ul></details>` : "",
    result.changedFiles.length > 0 ? `<details><summary>Changed files</summary><ul>${renderList(result.changedFiles)}</ul></details>` : "",
    `</article>`,
  ].join("");
}

function renderHtmlReport(input: {
  runId: string;
  createdAt: string;
  request: string;
  mode: string;
  statusCounts: Record<string, number>;
  finalSummary: string;
  results: WorkerResultPacket[];
  releaseBlockers: string[];
  recommendedVerification: string[];
  blockedReasons: string[];
  apiUsage: ApiUsageSummary;
  apiCost: ApiUsageCostSummary;
  apiBreakdown: ApiUsageBreakdown;
  qualityGate?: QualityGateReport;
}) {
  const statusCards = renderStatusCards(input.statusCounts) || "<p>No worker status collected.</p>";
  const workerCards = input.results.map(renderWorkerCard).join("");
  const apiRows = input.apiUsage.records
    .map((record) => `<tr><td>${escapeHtml(record.stage)}</td><td>${escapeHtml(record.role)}</td><td>${escapeHtml(record.model)}</td><td>${record.usage.inputTokens}</td><td>${record.usage.outputTokens}</td><td>${record.usage.totalTokens}</td></tr>`)
    .join("");
  const apiBreakdownRows = input.apiBreakdown.byStageRole
    .map((item) => `<tr><td>${escapeHtml(item.key)}</td><td>${item.calls}</td><td>${item.inputTokens}</td><td>${item.outputTokens}</td><td>${item.totalTokens}</td><td>${escapeHtml(formatEstimatedUsd(item.estimatedUsd))}</td></tr>`)
    .join("");
  const workerStageCost = input.apiBreakdown.byStage.find((item) => item.key === "worker")?.estimatedUsd ?? 0;
  const applyStageCost = input.apiBreakdown.byStage.find((item) => item.key === "apply")?.estimatedUsd ?? 0;
  const qualityGateItems = input.qualityGate
    ? [
        `status: ${input.qualityGate.status}`,
        `checked files: ${input.qualityGate.checkedFiles.length}`,
        `errors: ${input.qualityGate.errorCount}`,
        `warnings: ${input.qualityGate.warnCount}`,
        ...input.qualityGate.findings.map((finding) => `${finding.severity} ${finding.file} [${finding.rule}]: ${finding.message}`),
      ]
    : ["status: not run"];

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Orchestrator Report - ${escapeHtml(input.runId)}</title>
  <style>
    :root {
      --ink: #17211b;
      --muted: #607064;
      --paper: #f6f2e8;
      --panel: rgba(255, 252, 244, 0.88);
      --line: rgba(38, 52, 43, 0.16);
      --green: #2f7d4f;
      --amber: #b7791f;
      --red: #b53b3b;
      --blue: #2d5f88;
      --shadow: 0 24px 80px rgba(36, 45, 38, 0.14);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Pretendard", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(75, 128, 91, 0.2), transparent 34rem),
        linear-gradient(135deg, #f9f5eb, #e9efe2 48%, #f7efe0);
      min-height: 100vh;
    }
    main { width: min(1160px, calc(100vw - 32px)); margin: 0 auto; padding: 48px 0; }
    header, .card, .worker, .section {
      border: 1px solid var(--line);
      background: var(--panel);
      box-shadow: var(--shadow);
    }
    header { padding: 34px; border-radius: 28px; }
    h1 { margin: 10px 0; font-size: clamp(30px, 5vw, 58px); letter-spacing: -0.055em; }
    h2 { margin: 34px 0 14px; font-size: 22px; letter-spacing: -0.02em; }
    h3 { margin: 0; font-size: 18px; }
    p { color: var(--muted); line-height: 1.65; }
    code { background: rgba(47, 125, 79, 0.1); padding: 2px 6px; border-radius: 8px; }
    .meta, .metrics { display: flex; flex-wrap: wrap; gap: 10px; }
    .pill {
      display: inline-flex;
      padding: 7px 11px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.56);
      font-size: 13px;
      color: var(--muted);
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; }
    .card { padding: 18px; border-radius: 22px; }
    .card span { display: block; color: var(--muted); text-transform: uppercase; font-size: 12px; letter-spacing: 0.08em; }
    .card strong { display: block; margin-top: 8px; font-size: 34px; }
    .workers { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .worker { padding: 22px; border-radius: 22px; }
    .worker-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .metrics { margin: 16px 0; }
    .metrics span { padding: 8px 10px; border-radius: 12px; background: rgba(255,255,255,0.62); color: var(--muted); }
    details { margin-top: 10px; }
    summary { cursor: pointer; font-weight: 700; }
    ul { margin: 10px 0 0; padding-left: 20px; color: var(--muted); line-height: 1.55; }
    table { width: 100%; border-collapse: collapse; border-radius: 18px; overflow: hidden; background: var(--panel); }
    th, td { padding: 12px; border-bottom: 1px solid var(--line); text-align: left; }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    .section { padding: 22px; border-radius: 22px; }
    .status-succeeded .pill, .status-succeeded strong { color: var(--green); }
    .status-blocked .pill, .status-blocked strong { color: var(--amber); }
    .status-failed .pill, .status-failed strong { color: var(--red); }
    .status-pending .pill, .status-pending strong, .status-skipped .pill, .status-skipped strong { color: var(--blue); }
    @media (max-width: 640px) {
      main { width: min(100vw - 20px, 1160px); padding: 20px 0; }
      header { padding: 22px; border-radius: 22px; }
      .workers { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <span class="pill">Orchestrator Report</span>
      <h1>${escapeHtml(input.finalSummary)}</h1>
      <p>${escapeHtml(input.request)}</p>
      <div class="meta">
        <span class="pill">run <code>${escapeHtml(input.runId)}</code></span>
        <span class="pill">mode ${escapeHtml(input.mode)}</span>
        <span class="pill">created ${escapeHtml(input.createdAt)}</span>
      </div>
    </header>

    <h2>Status</h2>
    <section class="grid">${statusCards}</section>

    <h2>API Usage</h2>
    <section class="grid">
      <article class="card"><span>calls</span><strong>${input.apiUsage.calls}</strong></article>
      <article class="card"><span>input tokens</span><strong>${input.apiUsage.inputTokens}</strong></article>
      <article class="card"><span>output tokens</span><strong>${input.apiUsage.outputTokens}</strong></article>
      <article class="card"><span>total tokens</span><strong>${input.apiUsage.totalTokens}</strong></article>
      <article class="card"><span>estimated cost</span><strong>${escapeHtml(formatEstimatedUsd(input.apiCost.estimatedUsd))}</strong></article>
      <article class="card"><span>worker cost</span><strong>${escapeHtml(formatEstimatedUsd(workerStageCost))}</strong></article>
      <article class="card"><span>apply cost</span><strong>${escapeHtml(formatEstimatedUsd(applyStageCost))}</strong></article>
    </section>
    ${input.apiUsage.records.length > 0 ? `<section class="section" style="margin-top:16px; overflow:auto;"><table><thead><tr><th>stage</th><th>role</th><th>model</th><th>input</th><th>output</th><th>total</th></tr></thead><tbody>${apiRows}</tbody></table></section>` : ""}
    ${input.apiBreakdown.byStageRole.length > 0 ? `<section class="section" style="margin-top:16px; overflow:auto;"><h3>Cost by stage and role</h3><table><thead><tr><th>stage:role</th><th>calls</th><th>input</th><th>output</th><th>total</th><th>estimated cost</th></tr></thead><tbody>${apiBreakdownRows}</tbody></table></section>` : ""}

    <h2>Continue Chain</h2>
    <section class="section">
      <ul>
        <li><code>npm run runner:status -- ${escapeHtml(input.runId)}</code></li>
        <li><code>npm run runner:continue -- ${escapeHtml(input.runId)}</code></li>
        <li><code>npm run runner:continue:a:execute -- ${escapeHtml(input.runId)}</code></li>
        <li><code>npm run runner:continue:b -- ${escapeHtml(input.runId)}</code></li>
        <li><code>npm run runner:continue:b:execute -- ${escapeHtml(input.runId)}</code></li>
        <li><code>npm run runner:continue:c -- ${escapeHtml(input.runId)}</code></li>
      </ul>
    </section>

    <h2>Workers</h2>
    <section class="workers">${workerCards}</section>

    <h2>Blocked Reasons</h2>
    <section class="section"><ul>${renderList(input.blockedReasons)}</ul></section>

    <h2>Quality Gate</h2>
    <section class="section"><ul>${renderList(qualityGateItems)}</ul></section>

    <h2>Release Blockers</h2>
    <section class="section"><ul>${renderList(input.releaseBlockers)}</ul></section>

    <h2>Recommended Verification</h2>
    <section class="section"><ul>${renderList(input.recommendedVerification)}</ul></section>
  </main>
</body>
</html>
`;
}

async function main() {
  const { runId, compact } = parseArgs(process.argv.slice(2));
  const orchestratorRoot = path.resolve(__dirname, "..");
  const manifest = readRunnerManifest(orchestratorRoot, runId);
  const summary = readRunnerSummary(manifest);
  const results = readWorkerResults(manifest);

  manifest.workers = manifest.workers.map((worker) => {
    const result = results.find((item) => item.role === worker.role);
    return {
      ...worker,
      status: result?.status ?? worker.status,
    };
  });

  const statusCounts = countDisplayStatuses(results);
  const releaseBlockers = buildReleaseBlockers(results);
  const blockedReasons = getBlockedReasons(results);
  const findings = buildFindings(results);
  const recommendedVerification = buildRecommendedVerification(results);
  const finalSummary = buildFinalSummary(results);
  const apiUsage = summarizeApiUsage(manifest);
  const apiCost = estimateApiUsageCost(apiUsage);
  const apiBreakdown = summarizeApiUsageBreakdown(apiUsage);
  const qualityGate = readQualityGateReport(manifest);

  summary.verifierReport = {
    summary: `Finalized worker collection. ${finalSummary}`,
    findings,
    contractChecks: summary.verifierReport?.contractChecks ?? [],
    recommendedVerification,
    releaseBlockers,
  };
  summary.workerResultCount = results.length;

  const report = renderFinalReport(
    manifest.runId,
    summary.request,
    manifest.mode,
    statusCounts,
    finalSummary,
    results,
    releaseBlockers,
    recommendedVerification,
    blockedReasons,
    apiUsage,
    apiCost,
    apiBreakdown,
    qualityGate,
  );
  const htmlReportPath = path.join(manifest.runDir, "report.html");
  const htmlReport = renderHtmlReport({
    runId: manifest.runId,
    createdAt: manifest.createdAt,
    request: summary.request,
    mode: manifest.mode,
    statusCounts,
    finalSummary,
    results,
    releaseBlockers,
    recommendedVerification,
    blockedReasons,
    apiUsage,
    apiCost,
    apiBreakdown,
    qualityGate,
  });

  writeRunnerManifest(orchestratorRoot, manifest);
  writeRunnerSummary(manifest, summary);
  writeRunnerReport(manifest, report);
  fs.writeFileSync(htmlReportPath, htmlReport, "utf8");

  console.log("# Runner Finalize");
  console.log(`Run ID: ${runId}`);
  console.log(`Summary: ${finalSummary}`);
  if (!compact) {
    console.log(`Report: ${manifest.reportPath}`);
    console.log(`HTML Report: ${htmlReportPath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});


