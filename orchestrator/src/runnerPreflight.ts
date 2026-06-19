import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseOpenAIReasoningEffort } from "./openaiOptions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Check = {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
};

function parseArgs(argv: string[]) {
  return {
    compact: argv.includes("--compact") || argv.includes("--summary-only"),
    strict: argv.includes("--strict"),
  };
}

function run(command: string, args: string[], cwd: string) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function checkGitClean(repoRoot: string): Check {
  const child = run("git", ["status", "--porcelain"], repoRoot);
  if (child.status !== 0) {
    return {
      name: "git clean",
      status: "fail",
      detail: child.stderr?.trim() || child.stdout?.trim() || "git status failed",
    };
  }

  const dirty = child.stdout.trim();
  return {
    name: "git clean",
    status: dirty ? "warn" : "ok",
    detail: dirty ? "worktree has changes; live apply requires a clean tree unless explicitly overridden" : "worktree clean",
  };
}

function checkOpenAIKey(): Check {
  return process.env.OPENAI_API_KEY
    ? {
        name: "OPENAI_API_KEY",
        status: "ok",
        detail: "set",
      }
    : {
        name: "OPENAI_API_KEY",
        status: "fail",
        detail: "missing; live openai worker/apply runs will fail before model execution",
      };
}

function checkReasoning(name: string, value: string | undefined): Check {
  try {
    parseOpenAIReasoningEffort(value, name);
    return {
      name,
      status: "ok",
      detail: value ? value : "default",
    };
  } catch (error) {
    return {
      name,
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function checkPositiveInteger(name: string, value: string | undefined, defaultValue: string): Check {
  const raw = value || defaultValue;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? {
        name,
        status: "ok",
        detail: `${parsed}`,
      }
    : {
        name,
        status: "fail",
        detail: `${name} must be a positive integer; current value is ${raw}`,
      };
}

function checkOptionalNonNegativeNumber(name: string, value: string | undefined): Check {
  if (!value) {
    return {
      name,
      status: "ok",
      detail: "unlimited",
    };
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? {
        name,
        status: "ok",
        detail: `$${parsed.toFixed(4)}`,
      }
    : {
        name,
        status: "fail",
        detail: `${name} must be a non-negative number; current value is ${value}`,
      };
}

function checkScript(orchestratorRoot: string, scriptName: string): Check {
  const packagePath = path.join(orchestratorRoot, "package.json");
  const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { scripts?: Record<string, string> };
  return parsed.scripts?.[scriptName]
    ? {
        name: `script ${scriptName}`,
        status: "ok",
        detail: "available",
      }
    : {
        name: `script ${scriptName}`,
        status: "fail",
        detail: "missing from orchestrator/package.json",
      };
}

function checkPath(name: string, filePath: string, repoRoot: string): Check {
  const relative = path.relative(repoRoot, filePath).replaceAll("\\", "/");
  return fs.existsSync(filePath)
    ? {
        name,
        status: "ok",
        detail: relative,
      }
    : {
        name,
        status: "fail",
        detail: `${relative} is missing`,
      };
}

function printCheck(check: Check, compact: boolean) {
  const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "FAIL";
  if (compact) {
    console.log(`${prefix} ${check.name}: ${check.detail}`);
    return;
  }

  console.log(`- ${prefix} ${check.name}`);
  console.log(`  ${check.detail}`);
}

function main() {
  const { compact, strict } = parseArgs(process.argv.slice(2));
  const orchestratorRoot = path.resolve(__dirname, "..");
  const repoRoot = path.resolve(orchestratorRoot, "..");
  const workerModel = process.env.OPENAI_WORKER_MODEL || "gpt-4.1";
  const applyModel = process.env.OPENAI_APPLY_MODEL || process.env.OPENAI_WORKER_MODEL || "gpt-4.1";

  const checks: Check[] = [
    checkGitClean(repoRoot),
    checkOpenAIKey(),
    {
      name: "worker model",
      status: "ok",
      detail: workerModel,
    },
    {
      name: "apply model",
      status: "ok",
      detail: applyModel,
    },
    checkReasoning("OPENAI_WORKER_REASONING", process.env.OPENAI_WORKER_REASONING),
    checkReasoning("OPENAI_APPLY_REASONING", process.env.OPENAI_APPLY_REASONING),
    checkPositiveInteger("RUNNER_CONCURRENCY", process.env.RUNNER_CONCURRENCY, "1"),
    checkOptionalNonNegativeNumber("RUNNER_MAX_COST_USD", process.env.RUNNER_MAX_COST_USD),
    checkScript(orchestratorRoot, "runner:goal"),
    checkScript(orchestratorRoot, "runner:quick"),
    checkScript(orchestratorRoot, "runner:accept"),
    checkScript(orchestratorRoot, "runner:workflow:quality-smoke"),
    checkPath("verify all", path.join(repoRoot, ".skills", "verify-all.ps1"), repoRoot),
    checkPath("operations guide", path.join(orchestratorRoot, "OPERATIONS_GUIDE.md"), repoRoot),
  ];

  const failed = checks.filter((check) => check.status === "fail");
  const warned = checks.filter((check) => check.status === "warn");

  console.log("# Runner Preflight");
  console.log(`Repo: ${repoRoot}`);
  console.log(`Orchestrator: ${orchestratorRoot}`);
  console.log(`Strict warnings: ${strict ? "yes" : "no"}`);
  console.log("API cost: $0.0000 (no provider calls)");
  console.log("");
  for (const check of checks) {
    printCheck(check, compact);
  }

  console.log("");
  console.log("## Summary");
  const status = failed.length > 0 || (strict && warned.length > 0)
    ? "failed"
    : warned.length > 0
      ? "warning"
      : "ok";
  console.log(`Status: ${status}`);
  console.log(`Checks: ok=${checks.filter((check) => check.status === "ok").length}, warn=${warned.length}, fail=${failed.length}`);
  console.log("");
  console.log("Recommended chain:");
  console.log('1. npm run runner:goal -- --roles frontend "request"');
  console.log("2. npm run runner:quick");
  console.log("3. npm run runner:accept");

  if (failed.length > 0 || (strict && warned.length > 0)) {
    process.exit(1);
  }
}

main();
