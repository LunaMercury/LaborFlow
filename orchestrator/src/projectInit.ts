import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const orchestratorRoot = path.resolve(__dirname, "..");
const templateRoot = path.join(orchestratorRoot, "templates", "project-config");
const configFileNames = ["project.yaml", "project-templates.yaml"] as const;

type Args = {
  targetRoot: string;
  force: boolean;
  dryRun: boolean;
  projectName?: string;
  goal?: string;
};

function parseArgs(argv: string[]): Args {
  let targetRoot = orchestratorRoot;
  let force = false;
  let dryRun = false;
  let projectName: string | undefined;
  let goal: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--target") {
      targetRoot = path.resolve(argv[index + 1] || "");
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
    if (item === "--force") {
      force = true;
      continue;
    }
    if (item === "--dry-run") {
      dryRun = true;
      continue;
    }
    throw new Error(
      "Usage: npm run project:init -- [--target <orchestrator-root>] [--name <project-name>] [--goal <project-goal>] [--dry-run] [--force]",
    );
  }

  return { targetRoot, force, dryRun, projectName, goal };
}

function assertOrchestratorRoot(targetRoot: string) {
  const packagePath = path.join(targetRoot, "package.json");
  if (!fs.existsSync(packagePath) || !fs.statSync(packagePath).isFile()) {
    throw new Error(`Target is not an orchestrator root because package.json is missing: ${targetRoot}`);
  }

  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { name?: string };
  if (!packageJson.name?.includes("orchestrator")) {
    throw new Error(`Target package does not look like an orchestrator: ${packageJson.name || "<missing name>"}`);
  }
}

function assertSafeConfigPath(targetRoot: string, configPath: string) {
  const resolvedRoot = path.resolve(targetRoot);
  const resolvedConfig = path.resolve(configPath);
  if (resolvedConfig !== path.join(resolvedRoot, "config")) {
    throw new Error(`Refusing unsafe config path: ${resolvedConfig}`);
  }
}

function renderProjectYaml(templatePath: string, projectName?: string, goal?: string) {
  const source = fs.readFileSync(templatePath, "utf8");
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
}

function main() {
  const { targetRoot, force, dryRun, projectName, goal } = parseArgs(process.argv.slice(2));
  assertOrchestratorRoot(targetRoot);

  const configRoot = path.join(targetRoot, "config");
  assertSafeConfigPath(targetRoot, configRoot);

  const operations = configFileNames.map((fileName) => {
    const sourcePath = path.join(templateRoot, fileName);
    const destinationPath = path.join(configRoot, fileName);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Project config template is missing: ${sourcePath}`);
    }
    return {
      fileName,
      sourcePath,
      destinationPath,
      exists: fs.existsSync(destinationPath),
    };
  });

  const existing = operations.filter((operation) => operation.exists);
  if (existing.length > 0 && !force && !dryRun) {
    throw new Error(
      [
        "Refusing to overwrite existing project configuration.",
        ...existing.map((operation) => `- ${operation.destinationPath}`),
        "Review or back up the current project policy, then re-run with --force only if replacement is intentional.",
      ].join("\n"),
    );
  }

  console.log("# Project Config Init");
  console.log(`Target: ${targetRoot}`);
  console.log(`Mode: ${dryRun ? "dry-run" : "write"}`);
  console.log(`Force overwrite: ${force ? "yes" : "no"}`);
  console.log("");

  for (const operation of operations) {
    console.log(`${operation.exists ? "replace" : "create"}: ${operation.destinationPath}`);
  }

  if (dryRun) {
    console.log("");
    console.log("No files were written.");
    return;
  }

  fs.mkdirSync(configRoot, { recursive: true });
  for (const operation of operations) {
    const content = operation.fileName === "project.yaml"
      ? renderProjectYaml(operation.sourcePath, projectName, goal)
      : fs.readFileSync(operation.sourcePath, "utf8");
    fs.writeFileSync(operation.destinationPath, content, "utf8");
  }

  console.log("");
  console.log("Project configuration initialized.");
  console.log("Next: review config/project.yaml, config/project-templates.yaml, policySources, and .skills verification scripts.");
}

main();
