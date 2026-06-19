import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const orchestratorRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(orchestratorRoot, "..");

type Args = {
  targetProjectRoot: string;
  projectName?: string;
  goal?: string;
  dryRun: boolean;
  force: boolean;
};

type Operation = {
  kind: "copy" | "render";
  sourcePath: string;
  destinationPath: string;
  render?: (source: string) => string;
};

const excludedDirectories = new Set([
  "node_modules",
  "dist",
  "runs",
  ".git",
]);

const excludedOrchestratorFiles = new Set([
  ".env",
  ".env.local",
  "PIPELINE_STATUS.md",
  path.join("config", "project.yaml"),
  path.join("config", "project-templates.yaml"),
]);

const policyTemplateFiles = [
  "AGENTS.md",
  "agent_role.md",
  "security_guidelines.md",
  "system_architecture.md",
] as const;

const projectRootTemplateFiles = [
  ".gitignore",
  "초기설정.txt",
] as const;

const skillTemplateFiles = [
  "verify-web.ps1",
  "verify-core.ps1",
  "verify-fast.ps1",
  "verify-mobile.ps1",
  "verify-orchestrator.ps1",
  "verify-all.ps1",
] as const;

function usage(): never {
  throw new Error(
    [
      "Usage: npm run project:package -- --target <project-root> [--name <project-name>] [--goal <project-goal>] [--dry-run] [--force]",
      "",
      "This copies the reusable orchestrator bundle into a different project root.",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): Args {
  let targetProjectRoot = "";
  let projectName: string | undefined;
  let goal: string | undefined;
  let dryRun = false;
  let force = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--target") {
      targetProjectRoot = path.resolve(argv[index + 1] || "");
      index += 1;
      continue;
    }
    if (item === "--name") {
      projectName = argv[index + 1]?.trim();
      index += 1;
      continue;
    }
    if (item === "--goal") {
      goal = argv[index + 1]?.trim();
      index += 1;
      continue;
    }
    if (item === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (item === "--force") {
      force = true;
      continue;
    }
    usage();
  }

  if (!targetProjectRoot) {
    usage();
  }

  return { targetProjectRoot, projectName, goal, dryRun, force };
}

function isInside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertSafeTarget(targetProjectRoot: string) {
  const resolvedTarget = path.resolve(targetProjectRoot);
  if (resolvedTarget === repoRoot) {
    throw new Error("Refusing to package into the current project root. Choose a different target project directory.");
  }
  if (isInside(orchestratorRoot, resolvedTarget)) {
    throw new Error("Refusing to package into the current orchestrator directory or one of its children.");
  }
}

function assertDestinationInsideTarget(targetProjectRoot: string, destinationPath: string) {
  if (!isInside(targetProjectRoot, destinationPath)) {
    throw new Error(`Refusing unsafe destination outside target: ${destinationPath}`);
  }
}

function shouldCopyOrchestratorPath(relativePath: string, stat: fs.Stats) {
  const segments = relativePath.split(path.sep);
  if (segments.some((segment) => excludedDirectories.has(segment))) {
    return false;
  }
  if (!stat.isDirectory() && excludedOrchestratorFiles.has(relativePath)) {
    return false;
  }
  return true;
}

function collectFileCopies(sourceRoot: string, destinationRoot: string, currentRoot = sourceRoot): Operation[] {
  const operations: Operation[] = [];
  for (const entry of fs.readdirSync(currentRoot, { withFileTypes: true })) {
    const sourcePath = path.join(currentRoot, entry.name);
    const relativePath = path.relative(sourceRoot, sourcePath);
    const stat = fs.statSync(sourcePath);
    if (!shouldCopyOrchestratorPath(relativePath, stat)) {
      continue;
    }
    if (entry.isDirectory()) {
      operations.push(...collectFileCopies(sourceRoot, destinationRoot, sourcePath));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    operations.push({
      kind: "copy",
      sourcePath,
      destinationPath: path.join(destinationRoot, relativePath),
    });
  }
  return operations;
}

function renderWithPlaceholders(projectName?: string, goal?: string) {
  return (source: string) => source
    .replaceAll("{{PROJECT_NAME}}", projectName || "New Project")
    .replaceAll("{{PROJECT_GOAL}}", goal || "Describe the product outcome.");
}

function renderProjectYaml(projectName?: string, goal?: string) {
  return (source: string) => {
    if (!projectName && !goal) {
      return source;
    }
    const project = parse(source) as Record<string, unknown>;
    if (projectName) {
      project.name = projectName;
    }
    if (goal) {
      project.goal = goal;
    }
    return stringify(project, { lineWidth: 0 });
  };
}

function buildOperations(args: Args): Operation[] {
  const targetProjectRoot = path.resolve(args.targetProjectRoot);
  const targetOrchestratorRoot = path.join(targetProjectRoot, "orchestrator");
  const templateRoot = path.join(orchestratorRoot, "templates");
  const operations = collectFileCopies(orchestratorRoot, targetOrchestratorRoot);

  for (const fileName of ["project.yaml", "project-templates.yaml"]) {
    operations.push({
      kind: "render",
      sourcePath: path.join(templateRoot, "project-config", fileName),
      destinationPath: path.join(targetOrchestratorRoot, "config", fileName),
      render: fileName === "project.yaml" ? renderProjectYaml(args.projectName, args.goal) : undefined,
    });
  }

  for (const fileName of policyTemplateFiles) {
    operations.push({
      kind: "render",
      sourcePath: path.join(templateRoot, "policy-docs", fileName),
      destinationPath: path.join(targetProjectRoot, fileName),
      render: renderWithPlaceholders(args.projectName, args.goal),
    });
  }

  for (const fileName of projectRootTemplateFiles) {
    operations.push({
      kind: "render",
      sourcePath: path.join(templateRoot, "project-root", fileName),
      destinationPath: path.join(targetProjectRoot, fileName),
      render: renderWithPlaceholders(args.projectName, args.goal),
    });
  }

  for (const fileName of skillTemplateFiles) {
    operations.push({
      kind: "copy",
      sourcePath: path.join(templateRoot, "skills", fileName),
      destinationPath: path.join(targetProjectRoot, ".skills", fileName),
    });
  }

  for (const operation of operations) {
    if (!fs.existsSync(operation.sourcePath)) {
      throw new Error(`Package source is missing: ${operation.sourcePath}`);
    }
    assertDestinationInsideTarget(targetProjectRoot, operation.destinationPath);
  }

  return operations;
}

function writeOperation(operation: Operation) {
  fs.mkdirSync(path.dirname(operation.destinationPath), { recursive: true });
  const content = fs.readFileSync(operation.sourcePath, "utf8");
  fs.writeFileSync(operation.destinationPath, operation.render ? operation.render(content) : content, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetProjectRoot = path.resolve(args.targetProjectRoot);
  assertSafeTarget(targetProjectRoot);

  const operations = buildOperations({ ...args, targetProjectRoot });
  const conflicts = operations.filter((operation) => fs.existsSync(operation.destinationPath));

  if (conflicts.length > 0 && !args.force && !args.dryRun) {
    throw new Error(
      [
        "Refusing to overwrite existing package files.",
        ...conflicts.slice(0, 20).map((operation) => `- ${operation.destinationPath}`),
        conflicts.length > 20 ? `...and ${conflicts.length - 20} more` : "",
        "Re-run with --dry-run to inspect, or --force only after reviewing the target.",
      ].filter(Boolean).join("\n"),
    );
  }

  console.log("# Project Package");
  console.log(`Target project: ${targetProjectRoot}`);
  console.log(`Mode: ${args.dryRun ? "dry-run" : "write"}`);
  console.log(`Force overwrite: ${args.force ? "yes" : "no"}`);
  console.log(`Files planned: ${operations.length}`);
  console.log(`Existing conflicts: ${conflicts.length}`);
  console.log("");

  for (const operation of operations.slice(0, 30)) {
    const action = fs.existsSync(operation.destinationPath) ? "replace" : "create";
    console.log(`${action}: ${operation.destinationPath}`);
  }
  if (operations.length > 30) {
    console.log(`...and ${operations.length - 30} more`);
  }

  if (args.dryRun) {
    console.log("");
    console.log("No files were written.");
    return;
  }

  for (const operation of operations) {
    writeOperation(operation);
  }

  console.log("");
  console.log("Reusable orchestrator package created.");
  console.log("Next steps in the target project:");
  console.log("1. cd orchestrator");
  console.log("2. npm install");
  console.log("3. npm run project:init -- --name \"<project name>\" --goal \"<goal>\" --force");
  console.log("4. Review 초기설정.txt and BOILERPLATE_MIGRATION_CHECKLIST.md first.");
  console.log("5. Review AGENTS.md, security_guidelines.md, orchestrator/config/*.yaml, and .skills/*.ps1");
  console.log("6. Initialize git from the target project root before apply workflows.");
  console.log("7. Run npm run runner:readiness:strict in the target orchestrator.");
  console.log("   A git worktree warning is expected until the target project is initialized with git.");
  console.log("8. Run npm run project:validate-package -- --target \"<project root>\" from the source orchestrator.");
  console.log("9. Run npm run ci:dry-run, then the target project's .skills/verify-all.ps1.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
