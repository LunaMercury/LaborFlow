import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const orchestratorRoot = path.resolve(__dirname, "..");

type Args = {
  target?: string;
  keep: boolean;
  projectName: string;
  goal: string;
};

function usage(): never {
  throw new Error(
    [
      "Usage: npm run project:rehearse-package -- [--target <project-root>] [--keep] [--name <project-name>] [--goal <project-goal>]",
      "",
      "This creates a temporary reusable orchestrator package and validates it without calling OpenAI APIs.",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): Args {
  let target: string | undefined;
  let keep = false;
  let projectName = "Package Rehearsal";
  let goal = "Validate reusable orchestrator package rehearsal.";

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--target") {
      target = path.resolve(argv[index + 1] || "");
      index += 1;
      continue;
    }
    if (item === "--keep") {
      keep = true;
      continue;
    }
    if (item === "--name") {
      projectName = argv[index + 1] || projectName;
      index += 1;
      continue;
    }
    if (item === "--goal") {
      goal = argv[index + 1] || goal;
      index += 1;
      continue;
    }
    usage();
  }

  return {
    target,
    keep,
    projectName,
    goal,
  };
}

function runNodeScript(scriptPath: string, scriptArgs: string[]) {
  const tsxCliPath = path.join(orchestratorRoot, "node_modules", "tsx", "dist", "cli.mjs");
  return spawnSync(process.execPath, [tsxCliPath, scriptPath, ...scriptArgs], {
    cwd: orchestratorRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function printChild(child: ReturnType<typeof runNodeScript>, label: string) {
  console.log(`${label}: exit=${child.status ?? "null"}`);
  if (child.stdout?.trim()) {
    console.log(child.stdout.trim());
  }
  if (child.stderr?.trim()) {
    console.error(child.stderr.trim());
  }
}

function makeDefaultTarget() {
  const safeStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const preferredTempRoot = process.env.ORCHESTRATOR_REHEARSAL_ROOT || "D:\\개발\\boilerplate-test";
  fs.mkdirSync(preferredTempRoot, { recursive: true });
  return path.join(preferredTempRoot, `orchestrator-package-rehearsal-${safeStamp}`);
}

function removeTarget(target: string) {
  fs.rmSync(target, { recursive: true, force: true });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = path.resolve(args.target || makeDefaultTarget());
  const shouldCleanBefore = !args.target;

  if (shouldCleanBefore) {
    removeTarget(target);
  }

  console.log("# Project Package Rehearsal");
  console.log(`Target project: ${target}`);
  console.log(`Keep target: ${args.keep ? "yes" : "no"}`);
  console.log("");

  const packageRun = runNodeScript(path.join("src", "projectPackage.ts"), [
    "--target",
    target,
    "--name",
    args.projectName,
    "--goal",
    args.goal,
    "--force",
  ]);
  printChild(packageRun, "project:package");
  if (packageRun.status !== 0) {
    process.exit(packageRun.status ?? 1);
  }

  const validateRun = runNodeScript(path.join("src", "projectValidatePackage.ts"), [
    "--target",
    target,
  ]);
  printChild(validateRun, "project:validate-package");
  if (validateRun.status !== 0) {
    process.exit(validateRun.status ?? 1);
  }

  if (!args.keep) {
    removeTarget(target);
    console.log(`Removed rehearsal target: ${target}`);
  } else {
    console.log(`Kept rehearsal target: ${target}`);
  }

  console.log("");
  console.log("Package rehearsal passed.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
