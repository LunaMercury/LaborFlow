import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type CheckResult = {
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

function exists(filePath: string) {
  return fs.existsSync(filePath);
}

function checkCommand(name: string, command: string, args: string[], cwd: string): CheckResult {
  const child = run(command, args, cwd);
  if (child.status !== 0) {
    return {
      name,
      status: "fail",
      detail: child.stderr?.trim() || child.stdout?.trim() || `${command} ${args.join(" ")} failed`,
    };
  }

  return {
    name,
    status: "ok",
    detail: child.stdout.trim().split(/\r?\n/)[0] || `${command} is available`,
  };
}

function checkNpm(orchestratorRoot: string): CheckResult {
  const candidates = [
    process.env.npm_execpath,
    process.platform === "win32" ? "C:\\Program Files\\nodejs\\npm.cmd" : undefined,
    process.platform === "win32" ? "npm.cmd" : "npm",
  ].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    const isJavaScriptCli = candidate.endsWith(".js");
    const child = isJavaScriptCli
      ? run(process.execPath, [candidate, "--version"], orchestratorRoot)
      : run(candidate, ["--version"], orchestratorRoot);

    if (child.status === 0) {
      return {
        name: "npm",
        status: "ok",
        detail: child.stdout.trim().split(/\r?\n/)[0] || `${candidate} is available`,
      };
    }
  }

  return {
    name: "npm",
    status: "fail",
    detail: "npm --version failed",
  };
}

function checkFile(name: string, filePath: string, root: string, required = true): CheckResult {
  const relative = path.relative(root, filePath).replaceAll("\\", "/");
  if (exists(filePath)) {
    return {
      name,
      status: "ok",
      detail: relative,
    };
  }

  if (!required) {
    return {
      name,
      status: "ok",
      detail: `${relative} is optional and missing`,
    };
  }

  return {
    name,
    status: "fail",
    detail: `${relative} is missing`,
  };
}

function checkPackageScripts(orchestratorRoot: string): CheckResult {
  const packagePath = path.join(orchestratorRoot, "package.json");
  const requiredScripts = [
    "runner:plan",
    "runner:plan:budget",
    "runner:plan:mock",
    "runner:goal",
    "runner:goal:budget",
    "runner:goal:mock",
    "runner:rehearse",
    "runner:apply",
    "runner:reuse-apply",
    "runner:status",
    "runner:status:compact",
    "runner:latest",
    "runner:latest:any",
    "runner:latest:mock",
    "runner:latest:quick",
    "runner:latest:quick:any",
    "runner:latest:quick:mock",
    "runner:latest:status",
    "runner:latest:status:compact",
    "runner:latest:continue",
    "runner:latest:continue:compact",
    "runner:latest:a",
    "runner:latest:b",
    "runner:latest:c",
    "runner:latest:a:execute",
    "runner:latest:b:execute",
    "runner:continue",
    "runner:continue:compact",
    "runner:continue:a",
    "runner:continue:b",
    "runner:continue:c",
    "runner:continue:a:execute",
    "runner:continue:b:execute",
    "runner:full",
    "runner:full:safe",
    "runner:full:rehearse",
    "runner:workflow",
    "runner:workflow:reuse",
    "runner:doctor",
    "runner:preflight",
    "runner:preflight:compact",
    "runner:readiness",
    "runner:readiness:compact",
    "runner:readiness:strict",
    "runner:argument-guard:smoke",
    "runner:accept-guard:smoke",
    "runner:accept-unlock:smoke",
    "runner:docs-encoding",
    "runner:docs-encoding:smoke",
    "runner:help",
    "runner:quality",
    "runner:quality:smoke",
    "runner:workflow:quality-smoke",
    "runner:reports",
    "runner:reports:any",
    "runner:reports:live",
    "runner:reports:mock",
    "runner:quick",
    "runner:quick:any",
    "runner:quick:mock",
    "runner:accept",
    "runner:accept:preview",
    "project:package",
    "project:rehearse-package",
    "project:validate-package",
    "ci:dry-run",
  ];

  if (!exists(packagePath)) {
    return {
      name: "package scripts",
      status: "fail",
      detail: "package.json is missing",
    };
  }

  const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { scripts?: Record<string, string> };
  const missing = requiredScripts.filter((script) => !parsed.scripts?.[script]);
  return {
    name: "package scripts",
    status: missing.length === 0 ? "ok" : "fail",
    detail: missing.length === 0 ? `${requiredScripts.length} required scripts found` : `missing: ${missing.join(", ")}`,
  };
}

function checkGitClean(repoRoot: string): CheckResult {
  const insideWorkTree = run("git", ["rev-parse", "--is-inside-work-tree"], repoRoot);
  if (insideWorkTree.status !== 0) {
    return {
      name: "git worktree",
      status: "warn",
      detail: "not a git worktree yet; initialize git before running apply workflows",
    };
  }

  const child = run("git", ["status", "--porcelain"], repoRoot);
  if (child.status !== 0) {
    return {
      name: "git status",
      status: "fail",
      detail: child.stderr?.trim() || child.stdout?.trim() || "git status failed",
    };
  }

  const dirty = child.stdout.trim();
  return {
    name: "git clean",
    status: dirty ? "warn" : "ok",
    detail: dirty ? "worktree has changes; apply runs require a clean worktree unless --allow-dirty is used" : "worktree clean",
  };
}

function printCheck(result: CheckResult, compact: boolean) {
  const prefix = result.status === "ok" ? "OK" : result.status === "warn" ? "WARN" : "FAIL";
  if (compact) {
    console.log(`${prefix} ${result.name}: ${result.detail}`);
    return;
  }

  console.log(`- ${prefix} ${result.name}`);
  console.log(`  ${result.detail}`);
}

async function main() {
  const { compact, strict } = parseArgs(process.argv.slice(2));
  const orchestratorRoot = path.resolve(__dirname, "..");
  const repoRoot = path.resolve(orchestratorRoot, "..");

  const checks: CheckResult[] = [
    checkCommand("node", process.execPath, ["--version"], orchestratorRoot),
    checkNpm(orchestratorRoot),
    checkCommand("git", "git", ["--version"], orchestratorRoot),
    checkGitClean(repoRoot),
    checkPackageScripts(orchestratorRoot),
    checkFile("orchestrator tsconfig", path.join(orchestratorRoot, "tsconfig.json"), repoRoot),
    checkFile("project policy", path.join(repoRoot, "AGENTS.md"), repoRoot),
    checkFile("verify web", path.join(repoRoot, ".skills", "verify-web.ps1"), repoRoot),
    checkFile("verify core", path.join(repoRoot, ".skills", "verify-core.ps1"), repoRoot),
    checkFile("verify fast", path.join(repoRoot, ".skills", "verify-fast.ps1"), repoRoot),
    checkFile("verify mobile", path.join(repoRoot, ".skills", "verify-mobile.ps1"), repoRoot),
    checkFile("verify all", path.join(repoRoot, ".skills", "verify-all.ps1"), repoRoot),
    checkFile("operations guide", path.join(orchestratorRoot, "OPERATIONS_GUIDE.md"), repoRoot),
    checkFile("pipeline status", path.join(orchestratorRoot, "PIPELINE_STATUS.md"), repoRoot, false),
    checkFile("boilerplate split guide", path.join(orchestratorRoot, "BOILERPLATE_SPLIT_GUIDE.md"), repoRoot),
    checkFile("project config template", path.join(orchestratorRoot, "templates", "project-config", "project.yaml"), repoRoot),
  ];

  const failed = checks.filter((check) => check.status === "fail");
  const warned = checks.filter((check) => check.status === "warn");

  console.log("# Runner Doctor");
  console.log(`Repo: ${repoRoot}`);
  console.log(`Orchestrator: ${orchestratorRoot}`);
  console.log(`Strict warnings: ${strict ? "yes" : "no"}`);
  console.log("");
  for (const check of checks) {
    printCheck(check, compact);
  }

  console.log("");
  console.log("## Summary");
  console.log(`Status: ${failed.length > 0 || (strict && warned.length > 0) ? "failed" : warned.length > 0 ? "warning" : "ok"}`);
  console.log(`Checks: ok=${checks.filter((check) => check.status === "ok").length}, warn=${warned.length}, fail=${failed.length}`);

  if (failed.length > 0 || (strict && warned.length > 0)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
