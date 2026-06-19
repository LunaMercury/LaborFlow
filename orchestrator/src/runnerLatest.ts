import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRunnerManifest } from "./packetStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Choice = "A" | "B" | "C";
type ModeFilter = "live" | "mock" | "any";

type Action = "print" | "status" | "continue" | "quick";

function parseArgs(argv: string[]) {
  let action: Action = "print";
  let choose: Choice | undefined;
  let execute = false;
  let mode: ModeFilter = "live";
  let compact = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--status") {
      action = "status";
      continue;
    }
    if (arg === "--quick") {
      action = "quick";
      continue;
    }
    if (arg === "--compact" || arg === "--summary-only") {
      compact = true;
      continue;
    }
    if (arg === "--continue") {
      action = "continue";
      continue;
    }
    if (arg === "--choose") {
      const value = argv[index + 1]?.toUpperCase();
      if (value !== "A" && value !== "B" && value !== "C") {
        throw new Error("--choose must be one of A, B, or C");
      }
      action = "continue";
      choose = value;
      index += 1;
      continue;
    }
    if (arg === "--execute") {
      action = "continue";
      execute = true;
      continue;
    }
    if (arg === "--mode") {
      const value = argv[index + 1];
      if (value !== "live" && value !== "mock" && value !== "any") {
        throw new Error("--mode must be one of live, mock, or any");
      }
      mode = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return { action, choose, compact, execute, mode };
}

function findLatestRunId(orchestratorRoot: string, mode: ModeFilter) {
  const runsRoot = path.join(orchestratorRoot, "runs");
  if (!fs.existsSync(runsRoot)) {
    throw new Error("No runs directory found.");
  }

  const candidates = fs.readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^run-\d{4}-/.test(entry.name))
    .map((entry) => {
      const manifestPath = path.join(runsRoot, entry.name, "meta", "manifest.json");
      if (!fs.existsSync(manifestPath)) {
        return undefined;
      }
      try {
        const manifest = readRunnerManifest(orchestratorRoot, entry.name);
        return {
          runId: manifest.runId,
          createdAt: manifest.createdAt,
          mode: manifest.mode,
        };
      } catch {
        return undefined;
      }
    })
    .filter((entry): entry is { runId: string; createdAt: string; mode: "mock" | "live" } => entry !== undefined)
    .filter((entry) => mode === "any" || entry.mode === mode)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const latest = candidates[0];
  if (!latest) {
    throw new Error(`No readable ${mode === "any" ? "" : `${mode} `}runs found.`);
  }
  return latest.runId;
}

function runNodeScript(orchestratorRoot: string, script: "runnerStatus.ts" | "runnerContinue.ts", args: string[]) {
  const tsxCli = path.join(orchestratorRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const scriptPath = path.join(orchestratorRoot, "src", script);
  return spawnSync(process.execPath, [tsxCli, scriptPath, ...args], {
    cwd: orchestratorRoot,
    stdio: "inherit",
    windowsHide: true,
  });
}

async function main() {
  const { action, choose, compact, execute, mode } = parseArgs(process.argv.slice(2));
  const orchestratorRoot = path.resolve(__dirname, "..");
  const runId = findLatestRunId(orchestratorRoot, mode);

  if (action === "status") {
    const result = runNodeScript(orchestratorRoot, "runnerStatus.ts", [runId, ...(compact ? ["--compact"] : [])]);
    process.exit(result.status ?? 1);
  }

  if (action === "quick") {
    console.log("# Runner Latest Quick");
    console.log(`Run ID: ${runId}`);
    console.log("Read-only: this command does not apply, verify, rollback, or keep files.");
    console.log("");
    const statusResult = runNodeScript(orchestratorRoot, "runnerStatus.ts", [runId, "--compact"]);
    if (statusResult.status !== 0) {
      process.exit(statusResult.status ?? 1);
    }
    console.log("");
    const continueResult = runNodeScript(orchestratorRoot, "runnerContinue.ts", ["--compact", runId]);
    process.exit(continueResult.status ?? 1);
  }

  if (action === "continue") {
    const result = runNodeScript(orchestratorRoot, "runnerContinue.ts", [
      ...(choose ? ["--choose", choose] : []),
      ...(compact ? ["--compact"] : []),
      ...(execute ? ["--execute"] : []),
      runId,
    ]);
    process.exit(result.status ?? 1);
  }

  const manifest = readRunnerManifest(orchestratorRoot, runId);
  console.log("# Runner Latest");
  console.log(`Run ID: ${manifest.runId}`);
  console.log(`Created at: ${manifest.createdAt}`);
  console.log(`Request: ${manifest.request}`);
  console.log(`Mode: ${manifest.mode}`);
  console.log(`Mode filter: ${mode}`);
  console.log("");
  console.log("Next commands:");
  console.log(`- Status: npm run runner:latest:status`);
  console.log(`- Compact status: npm run runner:latest:status:compact`);
  console.log(`- Continue options: npm run runner:latest:continue`);
  console.log(`- Compact continue options: npm run runner:latest:continue:compact`);
  console.log(`- Quick status + continue: npm run runner:latest:quick`);
  console.log(`- Option A preview: npm run runner:latest:a`);
  console.log(`- Accept preview: npm run runner:accept:preview`);
  console.log(`- Accept latest proposed edits: npm run runner:accept`);
  console.log(`- Option B preview alias: npm run runner:latest:b`);
  console.log(`- Option B execute alias: npm run runner:latest:b:execute`);
  console.log(`- Include mock runs: npm run runner:latest:any`);
  console.log(`- Explicit status: npm run runner:status -- ${manifest.runId}`);
  console.log(`- Explicit continue: npm run runner:continue -- ${manifest.runId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
