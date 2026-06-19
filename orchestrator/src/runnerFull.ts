import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Args = {
  mock: boolean;
  compact: boolean;
  request: string;
  workflowArgs: string[];
};

const workflowFlagsWithValue = new Set([
  "--worker-provider",
  "--apply-provider",
  "--worker-model",
  "--apply-model",
  "--worker-reasoning",
  "--apply-reasoning",
  "--roles",
  "--concurrency",
  "--max-cost-usd",
]);

const workflowBooleanFlags = new Set([
  "--apply",
  "--allow-dirty",
  "--apply-review",
  "--approve-contract-changes",
  "--approve-open-questions",
  "--continue-on-error",
  "--skip-workers",
  "--reuse-worker-results",
  "--verify-all",
  "--rollback-after-verify",
  "--keep-applied",
  "--compact",
  "--summary-only",
  "--skip-finalize",
  "--skip-cleanup",
  "--cleanup-dry-run",
]);

function parseArgs(argv: string[]): Args {
  const workflowArgs: string[] = [];
  const requestParts: string[] = [];
  let mock = false;
  let compact = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];

    if (item === "--mock") {
      mock = true;
      continue;
    }

    if (item === "--compact" || item === "--summary-only") {
      compact = true;
      workflowArgs.push("--compact");
      continue;
    }

    if (workflowFlagsWithValue.has(item)) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`Missing value for ${item}`);
      }
      workflowArgs.push(item, value);
      index += 1;
      continue;
    }

    if (workflowBooleanFlags.has(item)) {
      workflowArgs.push(item);
      continue;
    }

    if (item.startsWith("--")) {
      throw new Error(
        `Unknown runner:full option: ${item}. If you are passing npm script options, use: npm run runner:full -- --compact --roles frontend "request"`,
      );
    }

    requestParts.push(item);
  }

  const request = requestParts.join(" ").trim();
  if (!request) {
    throw new Error(
      "Usage: npm run runner:full -- [--mock] [--roles frontend,java] [--concurrency 2] [--max-cost-usd 0.10] [--worker-provider openai|manual|claude|test] [--apply-provider openai|manual|test] [--worker-model model] [--apply-model model] [--worker-reasoning minimal|low|medium|high|none] [--apply-reasoning minimal|low|medium|high|none] [--apply] [--approve-contract-changes] [--approve-open-questions] [--rollback-after-verify|--keep-applied] \"request\"",
    );
  }

  const roleWords = new Set(["frontend", "rust", "java", "mobile", "frontend,java", "frontend,java,rust,mobile"]);
  const providerWords = new Set(["openai", "claude", "manual", "test"]);
  const looksLikeStrippedNpmOptions =
    workflowArgs.length === 0
    && requestParts.length >= 3
    && roleWords.has(requestParts[0])
    && requestParts.slice(1, 4).some((part) => providerWords.has(part) || /^\d+$/.test(part));
  if (looksLikeStrippedNpmOptions) {
    throw new Error(
      [
        "runner:full received values that look like npm stripped your options before they reached the runner.",
        `Received request: ${request}`,
        "Use the npm option separator `--` before runner options.",
        "Example:",
        '  npm run runner:full -- --compact --roles java --worker-provider openai --apply-provider openai --concurrency 1 "네이버 로그인 기능을 만들어줘"',
      ].join("\n"),
    );
  }

  if (workflowArgs.includes("--rollback-after-verify") && !workflowArgs.includes("--apply")) {
    throw new Error("--rollback-after-verify requires --apply so runner:full does not create a throwaway run before failing.");
  }
  if (workflowArgs.includes("--keep-applied") && !workflowArgs.includes("--apply")) {
    throw new Error("--keep-applied requires --apply so runner:full does not create a throwaway run before failing.");
  }
  if (workflowArgs.includes("--rollback-after-verify") && workflowArgs.includes("--keep-applied")) {
    throw new Error("--rollback-after-verify and --keep-applied are mutually exclusive.");
  }
  if (
    workflowArgs.includes("--apply")
    && !workflowArgs.includes("--rollback-after-verify")
    && !workflowArgs.includes("--keep-applied")
  ) {
    throw new Error("--apply requires --rollback-after-verify for a safe trial or --keep-applied for intentional permanent changes.");
  }

  return {
    mock,
    compact,
    request,
    workflowArgs,
  };
}

function runNodeScript(scriptPath: string, scriptArgs: string[], cwd: string) {
  const tsxCliPath = path.join(cwd, "node_modules", "tsx", "dist", "cli.mjs");
  return spawnSync(process.execPath, [tsxCliPath, scriptPath, ...scriptArgs], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function runNodeScriptInherited(scriptPath: string, scriptArgs: string[], cwd: string) {
  const tsxCliPath = path.join(cwd, "node_modules", "tsx", "dist", "cli.mjs");
  return spawnSync(process.execPath, [tsxCliPath, scriptPath, ...scriptArgs], {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
  });
}

function printChildOutput(child: ReturnType<typeof runNodeScript>, label: string) {
  if (child.stdout?.trim()) {
    console.log(child.stdout.trim());
  }
  if (child.stderr?.trim()) {
    console.error(child.stderr.trim());
  }
  if (child.error) {
    console.error(`${label} spawn error: ${child.error.message}`);
  }
  if (child.signal) {
    console.error(`${label} signal: ${child.signal}`);
  }
}

function printChildSummary(child: ReturnType<typeof runNodeScript>, label: string) {
  console.log(`${label}: exit=${child.status ?? "null"}`);
  if (child.status !== 0) {
    const message = child.stderr?.trim() || child.stdout?.trim();
    if (message) {
      console.error(message.split(/\r?\n/).slice(0, 8).join("\n"));
    }
  }
}

function extractRunId(output: string) {
  const match = output.match(/^Run ID:\s*(run-[^\r\n]+)/m);
  return match?.[1]?.trim();
}

function describeRunIntent(workflowArgs: string[]) {
  if (!workflowArgs.includes("--apply")) {
    return "plan only; no files will be applied";
  }
  if (workflowArgs.includes("--rollback-after-verify")) {
    return "safe rehearsal; edits are applied, verified, and rolled back";
  }
  if (workflowArgs.includes("--keep-applied")) {
    return "intentional apply; successful edits remain in the worktree";
  }
  return "apply requested; runner will require an explicit rollback or keep-applied mode";
}

function describeCostBudget(workflowArgs: string[]) {
  const index = workflowArgs.indexOf("--max-cost-usd");
  if (index < 0) {
    return "unlimited";
  }
  return `$${workflowArgs[index + 1] ?? "missing"}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const orchestratorRoot = path.resolve(__dirname, "..");

  console.log("# Runner Full");
  console.log(`Request: ${args.request}`);
  console.log(`Mode: ${args.mock ? "mock" : "live"}`);
  console.log(`Workflow args: ${args.workflowArgs.join(" ") || "none"}`);
  console.log(`Compact output: ${args.compact ? "yes" : "no"}`);
  console.log(`Run intent: ${describeRunIntent(args.workflowArgs)}`);
  console.log(`Cost budget: ${describeCostBudget(args.workflowArgs)}`);
  console.log("");

  const prepareArgs = [...(args.mock ? ["--mock"] : []), ...(args.compact ? ["--compact"] : []), args.request];
  const prepare = runNodeScript(path.join("src", "prepareRunner.ts"), prepareArgs, orchestratorRoot);
  if (args.compact) {
    printChildSummary(prepare, "runner:prepare");
  } else {
    printChildOutput(prepare, "runner:prepare");
  }

  if (prepare.status !== 0) {
    process.exit(prepare.status ?? 1);
  }

  const runId = extractRunId(prepare.stdout ?? "");
  if (!runId) {
    throw new Error("Could not extract run ID from runner:prepare output.");
  }
  if (args.compact) {
    console.log(`Run ID: ${runId}`);
  }

  console.log("");
  console.log("## Running workflow");
  if (args.compact) {
    const workflow = runNodeScriptInherited(
      path.join("src", "runnerWorkflow.ts"),
      [runId, ...args.workflowArgs],
      orchestratorRoot,
    );
    console.log(`runner:workflow: exit=${workflow.status ?? "null"}`);
    if (workflow.status !== 0) {
      process.exit(workflow.status ?? 1);
    }
  } else {
    const workflow = runNodeScript(
      path.join("src", "runnerWorkflow.ts"),
      [runId, ...args.workflowArgs],
      orchestratorRoot,
    );
    printChildOutput(workflow, "runner:workflow");

    if (workflow.status !== 0) {
      process.exit(workflow.status ?? 1);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
