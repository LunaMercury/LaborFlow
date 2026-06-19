import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { estimateApiUsageCost, formatEstimatedUsd, summarizeApiUsage } from "./apiUsage.js";
import { readRunnerManifest, readWorkerResults } from "./packetStore.js";
import { countDisplayStatuses, getBlockedRoles, getDisplayStatus, getFailedRoles } from "./resultClassification.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type RunIndexEntry = {
  runId: string;
  createdAt: string;
  request: string;
  mode: string;
  status: "succeeded" | "blocked" | "failed" | "unknown";
  workers: string;
  changedFiles: number;
  proposedEdits: number;
  totalTokens: number;
  estimatedCostUsd: number;
  quality: string;
  reportHtml: string;
  reportMd: string;
};

type ModeFilter = "live" | "mock" | "any";

function parseArgs(argv: string[]) {
  const compact = argv.includes("--compact") || argv.includes("--summary-only");
  let mode: ModeFilter = "any";
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--mode") {
      const next = argv[index + 1];
      if (next !== "live" && next !== "mock" && next !== "any") {
        throw new Error("Invalid --mode. Use one of: live, mock, any");
      }
      mode = next;
      index += 1;
      continue;
    }
    if (item === "--live") {
      mode = "live";
      continue;
    }
    if (item === "--mock") {
      mode = "mock";
      continue;
    }
  }
  return { compact, mode };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatStatusCounts(statusCounts: Record<string, number>) {
  const preferred = ["succeeded", "blocked", "failed", "skipped", "pending", "running"];
  return preferred
    .filter((status) => statusCounts[status])
    .map((status) => `${status}=${statusCounts[status]}`)
    .join(", ") || "none";
}

function determineRunStatus(results: ReturnType<typeof readWorkerResults>): RunIndexEntry["status"] {
  const blocked = getBlockedRoles(results);
  const failed = getFailedRoles(results);
  if (failed.length > 0) {
    return "failed";
  }
  if (blocked.length > 0) {
    return "blocked";
  }
  if (results.some((result) => getDisplayStatus(result) === "succeeded")) {
    return "succeeded";
  }
  return "unknown";
}

function readQualityGateStatus(runDir: string) {
  const reportPath = path.join(runDir, "meta", "quality-gate.json");
  if (!fs.existsSync(reportPath)) {
    return "not_run";
  }
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as { status?: string; errorCount?: number; warnCount?: number };
    return `${report.status ?? "unknown"} e${report.errorCount ?? 0}/w${report.warnCount ?? 0}`;
  } catch {
    return "unreadable";
  }
}

function collectRuns(orchestratorRoot: string, mode: ModeFilter) {
  const runsRoot = path.join(orchestratorRoot, "runs");
  if (!fs.existsSync(runsRoot)) {
    return [];
  }

  return fs.readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^run-\d{4}-/.test(entry.name))
    .map((entry): RunIndexEntry | undefined => {
      try {
        const manifest = readRunnerManifest(orchestratorRoot, entry.name);
        const results = readWorkerResults(manifest);
        const apiUsage = summarizeApiUsage(manifest);
        const apiCost = estimateApiUsageCost(apiUsage);
        const statusCounts = countDisplayStatuses(results);
        if (mode !== "any" && manifest.mode !== mode) {
          return undefined;
        }
        return {
          runId: manifest.runId,
          createdAt: manifest.createdAt,
          request: manifest.request,
          mode: manifest.mode,
          status: determineRunStatus(results),
          workers: formatStatusCounts(statusCounts),
          changedFiles: results.reduce((sum, result) => sum + result.changedFiles.length, 0),
          proposedEdits: results.reduce((sum, result) => sum + (result.proposedEdits?.length ?? 0), 0),
          totalTokens: apiUsage.totalTokens,
          estimatedCostUsd: apiCost.estimatedUsd,
          quality: readQualityGateStatus(manifest.runDir),
          reportHtml: `${entry.name}/report.html`,
          reportMd: `${entry.name}/report.md`,
        };
      } catch {
        return undefined;
      }
    })
    .filter((entry): entry is RunIndexEntry => entry !== undefined)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function renderRunRows(entries: RunIndexEntry[]) {
  if (entries.length === 0) {
    return `<tr><td colspan="11">No runs found.</td></tr>`;
  }

  return entries.map((entry) => [
    `<tr class="status-${escapeHtml(entry.status)}">`,
    `<td><a href="${escapeHtml(entry.reportHtml)}">${escapeHtml(entry.runId)}</a></td>`,
    `<td><span class="pill">${escapeHtml(entry.status)}</span></td>`,
    `<td>${escapeHtml(entry.mode)}</td>`,
    `<td>${escapeHtml(entry.request)}</td>`,
    `<td>${escapeHtml(entry.workers)}</td>`,
    `<td>${entry.proposedEdits}</td>`,
    `<td>${escapeHtml(entry.quality)}</td>`,
    `<td>${entry.totalTokens}</td>`,
    `<td>${escapeHtml(formatEstimatedUsd(entry.estimatedCostUsd))}</td>`,
    `<td><a href="${escapeHtml(entry.reportMd)}">md</a></td>`,
    `<td><code>npm run runner:status -- ${escapeHtml(entry.runId)}</code><br /><code>npm run runner:continue -- ${escapeHtml(entry.runId)}</code></td>`,
    `</tr>`,
  ].join("")).join("\n");
}

function renderModeCommandCards(mode: ModeFilter) {
  const items: Array<{ label: string; mode: ModeFilter; command: string; quickCommand: string; description: string }> = [
    {
      label: "All runs",
      mode: "any",
      command: "npm run runner:reports",
      quickCommand: "npm run runner:quick:any",
      description: "Live and mock runs together.",
    },
    {
      label: "Live only",
      mode: "live",
      command: "npm run runner:reports:live",
      quickCommand: "npm run runner:quick",
      description: "Real API-backed orchestration runs.",
    },
    {
      label: "Mock only",
      mode: "mock",
      command: "npm run runner:reports:mock",
      quickCommand: "npm run runner:quick:mock",
      description: "Dry-run, CI, and test-provider runs.",
    },
  ];

  return items.map((item) => [
    `<article class="mode-card${item.mode === mode ? " active" : ""}">`,
    `<span>${escapeHtml(item.label)}</span>`,
    `<code>${escapeHtml(item.command)}</code>`,
    `<code>${escapeHtml(item.quickCommand)}</code>`,
    `<p>${escapeHtml(item.description)}</p>`,
    `</article>`,
  ].join("")).join("\n");
}

function renderIndex(entries: RunIndexEntry[], mode: ModeFilter) {
  const statusCounts = entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.status] = (acc[entry.status] ?? 0) + 1;
    return acc;
  }, {});
  const totalTokens = entries.reduce((sum, entry) => sum + entry.totalTokens, 0);
  const estimatedCostUsd = entries.reduce((sum, entry) => sum + entry.estimatedCostUsd, 0);

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Orchestrator Run Index</title>
  <style>
    :root {
      --ink: #17211b;
      --muted: #637166;
      --paper: #f8f4ea;
      --panel: rgba(255, 253, 247, 0.9);
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
        radial-gradient(circle at 20% 0%, rgba(47, 125, 79, 0.18), transparent 34rem),
        linear-gradient(135deg, #f9f5eb, #e9efe2 52%, #f7efe0);
      min-height: 100vh;
    }
    main { width: min(1240px, calc(100vw - 32px)); margin: 0 auto; padding: 44px 0; }
    header, .card, .table-wrap {
      border: 1px solid var(--line);
      border-radius: 26px;
      background: var(--panel);
      box-shadow: var(--shadow);
    }
    header { padding: 32px; }
    h1 { margin: 10px 0; font-size: clamp(32px, 5vw, 56px); letter-spacing: -0.055em; }
    p { color: var(--muted); line-height: 1.65; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin: 22px 0; }
    .card { padding: 18px; }
    .card span { display: block; color: var(--muted); text-transform: uppercase; font-size: 12px; letter-spacing: 0.08em; }
    .card strong { display: block; margin-top: 8px; font-size: 32px; }
    .mode-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; margin: 14px 0 22px; }
    .mode-card {
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 16px;
      background: rgba(255,255,255,0.52);
    }
    .mode-card.active { outline: 2px solid rgba(47, 125, 79, 0.32); background: rgba(232, 244, 235, 0.74); }
    .mode-card span { display: block; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    .mode-card code { display: block; margin-top: 8px; color: var(--ink); white-space: nowrap; overflow-x: auto; }
    .mode-card p { margin: 8px 0 0; font-size: 13px; }
    .table-wrap { overflow: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 1120px; }
    th, td { padding: 13px 14px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    a { color: var(--blue); font-weight: 700; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .pill { display: inline-flex; padding: 6px 10px; border-radius: 999px; border: 1px solid var(--line); background: rgba(255,255,255,0.58); }
    .status-succeeded .pill { color: var(--green); }
    .status-blocked .pill { color: var(--amber); }
    .status-failed .pill { color: var(--red); }
    .status-unknown .pill { color: var(--muted); }
    @media (max-width: 640px) {
      main { width: min(100vw - 20px, 1240px); padding: 20px 0; }
      header { padding: 22px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <span class="pill">Orchestrator Runs</span>
      <h1>Run Index</h1>
      <p>Recent orchestration reports collected from <code>orchestrator/runs</code>. Mode filter: <strong>${escapeHtml(mode)}</strong>.</p>
    </header>
    <section class="grid">
      <article class="card"><span>runs</span><strong>${entries.length}</strong></article>
      <article class="card status-succeeded"><span>succeeded</span><strong>${statusCounts.succeeded ?? 0}</strong></article>
      <article class="card status-blocked"><span>blocked</span><strong>${statusCounts.blocked ?? 0}</strong></article>
      <article class="card status-failed"><span>failed</span><strong>${statusCounts.failed ?? 0}</strong></article>
      <article class="card"><span>tokens</span><strong>${totalTokens}</strong></article>
      <article class="card"><span>estimated cost</span><strong>${escapeHtml(formatEstimatedUsd(estimatedCostUsd))}</strong></article>
    </section>
    <section class="mode-grid" aria-label="report mode shortcuts">
      ${renderModeCommandCards(mode)}
    </section>
    <section class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>run</th>
            <th>status</th>
            <th>mode</th>
            <th>request</th>
            <th>workers</th>
            <th>edits</th>
            <th>quality</th>
            <th>tokens</th>
            <th>cost</th>
            <th>report</th>
            <th>chain</th>
          </tr>
        </thead>
        <tbody>
          ${renderRunRows(entries)}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>
`;
}

function getModeAlias(mode: ModeFilter) {
  if (mode === "live") {
    return "runner:reports:live";
  }
  if (mode === "mock") {
    return "runner:reports:mock";
  }
  return "runner:reports";
}

function getQuickAlias(mode: ModeFilter) {
  if (mode === "live") {
    return "runner:quick";
  }
  if (mode === "mock") {
    return "runner:quick:mock";
  }
  return "runner:quick:any";
}

function printNextSteps(mode: ModeFilter, indexPath: string, latestRunId?: string) {
  console.log("");
  console.log("Next:");
  console.log(`- Open report index: ${indexPath}`);
  console.log(`- Refresh this view: npm run ${getModeAlias(mode)}`);
  console.log(`- Quick latest ${mode} view: npm run ${getQuickAlias(mode)}`);
  if (latestRunId) {
    console.log(`- Inspect latest listed run: npm run runner:status -- ${latestRunId}`);
    console.log(`- Continue latest listed run: npm run runner:continue -- ${latestRunId}`);
  }
  console.log("- Switch view: npm run runner:reports:live | runner:reports:mock | runner:reports");
}

function main() {
  const { compact, mode } = parseArgs(process.argv.slice(2));
  const orchestratorRoot = path.resolve(__dirname, "..");
  const runsRoot = path.join(orchestratorRoot, "runs");
  fs.mkdirSync(runsRoot, { recursive: true });
  const entries = collectRuns(orchestratorRoot, mode);
  const indexPath = path.join(runsRoot, "index.html");
  fs.writeFileSync(indexPath, renderIndex(entries, mode), "utf8");
  const latestRunId = entries[0]?.runId;
  const latestQuality = entries[0]?.quality;

  if (compact) {
    console.log(`runner:reports: mode=${mode} runs=${entries.length} index=${indexPath} latest=${latestRunId ?? "none"} quality=${latestQuality ?? "none"} quick=${getQuickAlias(mode)}`);
    return;
  }

  console.log("# Runner Reports");
  console.log(`Mode filter: ${mode}`);
  console.log(`Runs indexed: ${entries.length}`);
  console.log(`Index: ${indexPath}`);
  if (latestRunId) {
    console.log(`Latest listed run: ${latestRunId}`);
  }
  printNextSteps(mode, indexPath, latestRunId);
}

main();
